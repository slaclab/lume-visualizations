# Plan: Hosted Virtual Accelerator Model Service

A hosted service wrapping SLAC virtual-accelerator staged models. Any internal user
can hit an HTTP API to run a model and get beam output. A web dashboard adds an
interactive "what-if" tab and a shared live view of the current machine.

**Models in scope:** `cu_hxr_staged` (LCLS Cu injector surrogate → Bmad) now;
`facet_staged` (FACET-II) later. Both are `virtual_accelerator` `StagedModel`s with the
same output shape, so one UI and one adapter contract cover both.

## Where we are now

**N1–N3 plus the dashboard UI overhaul are done and deployed** to the S3DF cluster
(`ad-accel-online-ml`, namespace `lume-visualizations`, image `lume-monitor:n6`). Live topology:

- `lume-monitor-eval` (**2 replicas**, EPICS-free): serves the SPA, `/api/config`,
  `/api/evaluate`, `/api/v1/evaluate`, `/metrics`.
- `lume-monitor-live` (**singleton**): the only EPICS reader; serves
  `/api/live/stream` (broadcast hub) + `/api/machine-snapshot`.
- One Ingress routes `/api/live/*` + `/api/machine-snapshot` → live, everything else
  → eval. The old single `lume-monitor` Deployment/Service has been removed.

History: **M1** (commit `aae6258`) removed marimo (React/Vite/TS SPA + FastAPI; allocator
and WS-relay retired). The in-pod K-worker pool + baseline-merge (originally "M2") was
already built. N1 split the live producer out, N2 added the external API, N3 added
metrics + a scaling plan.

**Measured (see `webapp/deploy/kubernetes/CAPACITY.md`):** per-eval latency `L ≈ 2.5s`
(prod `/metrics` on `n6`, 2026-08-24; an earlier ad-hoc load test read ~5s on an older
image), thread-count-independent; ~2 CPU cores per eval; concurrent no-added-latency evals
≈ `replicas × cores/2`. **Live and interactive evals cost the same** (~2.5s, same histogram
bucket) — the live view is not a cheaper path; the "live ~2s vs interactive ~6s" feel is the
interactive client round-trip (debounce + HTTP + full-frame transfer), not the model. The
real UX ceiling is `L`, not pod count — reducing `L` is the highest-leverage remaining work
(see Later).

## Core principles (keep — these work)

- **Stateless evaluate via baseline-merge.** Every request is
  `{**model_defaults, **request.inputs}` → `set` → `evaluate`, so any pooled instance is
  correct regardless of history. No sessions, no affinity, no idle-release. This is the
  reason we can scale by just adding replicas. Never `set(request.inputs)` on a pooled
  instance — a missing key would inherit the previous caller's value (a silent
  state-leak that produces wrong physics with no error).
- **Read-only EPICS, no output PVs.** The live view reads input PVs read-only and
  computes frames through the model; it never writes PVs. Avoids PV-name clashes across
  prod/staging/personal runs.
- **Subprocess density.** K model instances per pod as separate processes (torch
  double-load segfault + pytao thread-unsafety force process isolation). Thread-pinned
  (`OMP/MKL/OPENBLAS/TORCH_NUM_THREADS`).

## Architecture

The old plan wanted a 3-way split (separate EPICS-free model-API service + web-app
backend + gateway). We don't need that. The **only** piece that must be separated for
correctness is the **live producer**; everything else scales fine merged.

```
        Users (browser SPA)  +  external HTTP callers (notebooks, GUIs)
                                   |
                          Ingress (source-range whitelist)
             /api/live/*, /api/machine-snapshot |  everything else
                         |                       |
              LIVE PRODUCER (replicas: 1)   EVAL POOL (autoscaled: N replicas)
              own EPICS read loop           serves SPA + /api/config
              own small model pool (1-2)      + /api/evaluate (UI)
              -> evaluate -> SSE fan-out      + /api/v1/evaluate (external)
              the ONE EPICS reader          each pod: ModelPool K workers, EPICS-free
                                            stateless -> any pod serves any request
                                            KEDA: cron pre-scale + inflight backstop
```

### Eval pool (autoscaled) — the workhorse

- One Deployment, N replicas behind one Service. Stateless.
- Serves the SPA (static files), `/api/config`, `/api/evaluate` (UI), and
  `/api/v1/evaluate` (external API).
- Each pod runs the K-worker `ModelPool`. **No EPICS** — this deployment is EPICS-free.
- Scales by adding replicas. Any pod serves any request; the LB spreads them.

### Live producer (singleton) — the only EPICS reader

- Separate Deployment, `replicas: 1`. This split is what lets the eval pool scale.
- Owns its **own small model pool (1–2 workers)** and computes live frames locally, so
  the live view keeps working even when the eval pool is saturated or mid-scale.
- Runs the EPICS read loop (read-only input PVs) → evaluate → SSE fan-out. Serves
  `/api/live/stream` and `/api/machine-snapshot`.
- **Why singleton:** if this loop ran on N replicas, each would independently read EPICS
  and compute frames — N× the model cost, and viewers on different pods would see
  divergent frames. One producer fans out to all browsers.
- SSE fan-out is cheap (same frame to every viewer), so one replica serves many viewers.

### Ingress routing

- `/…/api/live/*` and `/…/api/machine-snapshot` → live-producer Service.
- everything else (SPA, `/api/config`, `/api/evaluate`, `/api/v1/*`) → eval-pool Service.
- Source-range whitelist stays as the exposure gate (auth deferred — see below). SSE
  still needs the long read timeout + buffering off already set on the Ingress.

### Friendly external API — `POST /api/v1/evaluate`

- **Inputs:** the same PV-name/value contract we already use, given a stable, documented
  schema. No name/unit mapping layer.
- **Outputs (opt-in flags to keep payloads sane):** scalars (σx/σy/σz/εx/εy, default on),
  beam image as a numeric array, particle distribution (x, px, y, py, …), and Twiss
  (βx/βy vs s). Heavy arrays return as raw buffers (e.g. base64 float32), off by default,
  enabled per request.
- Always returns the **model version** (git commit / MLflow run).
- FastAPI auto-generates **OpenAPI/Swagger** → instant programmatic usability.
- Runs on the eval pool, so it autoscales with everything else.

### Metrics

- Export `inflight / max_inflight` (`pool.py` already tracks `_inflight`) and
  per-evaluate latency as Prometheus metrics. This is the honest saturation signal; CPU
  is a poor proxy under thread pinning.

### Autoscaling

Load is **scheduled bursts** (classes/demos) on top of a **steady low baseline**.

- **Primary — cron pre-scale** before known sessions (KEDA cron scaler): warm pods
  before the burst, not after. Avoids the ~25–30 s injector cold-start trap.
- **Baseline** — a small fixed replica count (e.g. 2) for HA.
- **Backstop** — KEDA on the inflight metric for unplanned bumps.
- **No scale-to-zero** — cold start is too slow; keep a warm baseline.

## Build order

**Done:** M1 (React SPA + FastAPI; marimo/allocator/relay removed) and the in-pod
K-worker pool + baseline-merge.

**N1 — Split out the live producer. ✅ DONE (commit `fb414a9`, deployed).**
- `LUME_ROLE` (`all`/`eval`/`live`) selects behavior from one image. The eval pool is
  EPICS-free; the live producer (`replicas: 1`) is the only EPICS reader.
- The live view is now a **shared broadcast hub** (`live_hub.py`): one loop per active
  screen fans SSE out to all viewers, so N viewers cost one eval loop, not N. The
  poll-period control was removed — the loop runs as fast as the model allows.
- Ingress routes live/snapshot → live pod, everything else → eval. No SPA change.

**N2 — Friendly external API. ✅ DONE (commit `06c2bb4`, deployed).**
- `POST /api/v1/evaluate`: PV-name inputs over the baseline; scalars always, plus opt-in
  image / distribution (x,px,y,py,z,pz,weight) / twiss and `max_particles`; model version
  in the response; auto OpenAPI/Swagger. Verified against the **real model** in
  production (real image + distribution, units confirmed incl. `weight: C`).

**N3 — Metrics + scaling. ✅ DONE (commit `2a8da51`, deployed).**
- `/metrics` (Prometheus): in-flight, per-evaluate latency, 503 rejections. Eval baseline
  = 2 replicas for HA.
- Cluster has **no KEDA/Prometheus**, so scaling is **manual** for now
  (`SCALING.md`); `keda-scaledobject.yaml` is a ready template for later. Capacity
  findings + follow-ups in `CAPACITY.md`.

**Dashboard UI overhaul — ✅ DEPLOYED (branch `new-ui`, commits `661136b`, `8b79ca0`,
`de4c6bb`, `6e245eb`; shipped in image `n6`, 2026-08-24).** Reproducibility caveat: `n6`
was built from the committed (pre-FACET) Dockerfile with Bmad/pytao **pinned** to the
working `20260731.0`/`1.2.1`. The unpinned `conda install bmad pytao` had drifted `n4`/`n5`
to a newer Bmad that rejected the `cu_hxr` `tao.init` (Fortran parse error), and the FACET
Dockerfile's `VA_REF=d67f70c` broke `registry.py`'s `virtual_accelerator.models.staged_model`
import. The pin was applied via a throwaway `/tmp/Dockerfile.n6` and is **not yet committed
to the repo Dockerfile** — commit the pin (and only bump `VA_REF`/add FACET once `registry.py`
is ported to the new VA API) or the next rebuild drifts again.
- **One-screen layout:** left sidebar (settings + scrollable input sliders) + main column;
  the 2×2 plot grid and the canvas/uPlot plots scale to the viewport via a ResizeObserver,
  so a typical monitor shows everything with no page scroll (was a 1000px-wide scrolling
  stack).
- **Light/dark theme toggle** (persisted to localStorage; defaults to
  `prefers-color-scheme`). CSS vars under `[data-theme]`; canvas/uPlot plots recolor to
  match.
- **Legends + hover readouts:** per-plot color key with on-hover value readouts fed from a
  uPlot `setCursor` hook (replaces the built-in legend, which the filled panel clipped).
- **Timestamped live timeseries:** Scalar Diagnostics x-axis uses each frame's `timestamp`
  (clock time) in streaming mode; interactive mode keeps the sequential eval index.
- **Incoherent-OTR screen image:** raw macroparticle histogram is convolved with a
  pixel-limited Gaussian PSF (σ=1 px) in `beam_monitor._apply_screen_psf` (adds `scipy`),
  so the ~1000-particle sample renders as a continuous spot (image = PSF ∗ ρ); RMS/emit
  still come from particle coords. An info tooltip in the panel title explains it.
- **Phase-space scatter is any-vs-any** over `x/px/y/py/z/pz`: `BeamFrame.scatter` is now a
  coord→array map (positions µm, momenta eV/c); wire carries `scatter_b64` + `scatter_units`
  (replacing fixed `scatter_x/px`); X/Y dropdowns live in the panel title.
- **Interactive latency fix (frontend; implemented, NOT in `n6` — pending commit/deploy):**
  replaced the 300ms slider debounce with **commit-on-release + request sequencing**
  (`InteractiveTab`/`SliderControl`) — one eval fires on pointer/key release, and only the
  newest result renders (stale in-flight evals are dropped). Removes the debounce wait without
  the eval-storm / out-of-order risk.

**Later (only when needed):**
- ** make missing trailing / in url redirect to avoid bad links**
- **LB strategy.** After a load test with realistic inputs, if evaluate latency is
  skewed, switch the eval Service to least-request routing (nginx/Envoy). A pull-based
  work queue only if that still isn't enough.
- **Second model (`facet_staged`).** Separate worker image + Deployment (`FACET2_LATTICE`
  + `facet2_inj_ml_model`, pinned `virtual-accelerator` commit). UI renders whatever the
  adapter's `config()` publishes. Generalize `beam_monitor.py`'s hardcoded
  `cu_hxr_staged` scalar branch into the adapter registry (`registry.py`).
- **Auth gateway.** When we open beyond the whitelist, put an off-the-shelf gateway
  (Kong / APISIX / nginx-auth) in front for API keys + quota. Don't hand-roll; don't
  split images for it.
- **Shrink the image/pod.** Measured **7.75 GB** (linux/amd64; `docker history` + in-image
  `du`): `/opt/conda` 2.5 GB (torch alone **750 MB**, already the CPU-only wheel — CUDA
  would be ~2.5 GB), `facet2-lattice` 1.3 GB (**`.git` 607 MB**), `lcls-lattice` 755 MB
  (**`.git` 323 MB**), conda `*.a` static libs 128 MB. Smaller images pull faster → helps
  cold-start, cron pre-scale, the KEDA backstop, and pod density. **Safe wins (~1.3 GB,
  verified against a full build, not yet applied):**
  1. `rm -rf .git` in the **same `RUN`** as each lattice clone (~930 MB; a separate RUN
     won't shrink the layer). Even better: shallow `--filter=blob:none` clone to also cut
     build time/bandwidth.
  2. `find /opt/conda -name '*.a' -delete` appended to the conda `RUN` (~128 MB).
  3. Prune conda `tests/` dirs + `__pycache__` (~100–200 MB; slightly slower first import).
  These take it to ~6.4 GB. **Bigger but needs domain knowledge:** prune unused lattice
  working-tree files (lcls 430 MB + facet 700 MB remain after `.git` removal — Bmad reads
  specific files via `LCLS_LATTICE`/`FACET_LATTICE`); check whether `matplotlib` (31 MB) /
  `sympy` (74 MB) are imported server-side or just transitive pytao/lume deps. torch
  (~750 MB) is stuck unless the surrogate can run lighter. Measure size + cold-start
  before/after. (`--check` lint of the current Dockerfile is clean; full build succeeds.)
- **Keep the live stream running across tab switches.** Today switching from Live to
  Interactive tears down the SSE connection and loses the timeseries/plot history;
  returning to Live reconnects from scratch. Lift the SSE subscription + frame buffer
  above the tab components (app-level state/context) so the stream stays connected and
  the plots stay populated when the Live tab isn't mounted. Frontend-only — the singleton
  live producer already runs continuously, so nothing changes server-side. Consider a
  cap on the retained buffer so a long-backgrounded stream doesn't grow unbounded.
- **Reduce eval latency `L` (prod-measured ~2.5s, 2026-08-24 — the real UX ceiling; an
  earlier load test read ~5s on an older image).** Scaling only adds more concurrent
  ~2.5s-evals; it doesn't make them faster. In priority order:
  1. **Profile where the ~2.5s goes** — time the injector surrogate call vs. the Bmad
     tracking (`model.get()`) vs. any per-eval Tao re-init. Everything below depends on
     this; don't optimize blind.
  2. **Cheaper levers first:** shorter track range (OTR2→TD11 is long), fewer tracked
     particles if acceptable, and **cache results for identical inputs**.
  3. **MPI/parallel tracking — only if profiling shows tracking-bound cost.** Bmad MPI
     parallelizes particle tracking, but: `threads=2` gave zero single-eval speedup and
     the beam is only ~1000 particles, so tracking may not even dominate. It's also an
     architectural change (MPI-enabled Bmad build; `pytao` runs in-process single-rank;
     lume-bmad/VA would need an MPI tracking hook) and trades throughput for latency
     (K cores per eval instead of K parallel evals). Verify the path is reachable before
     committing. See `webapp/deploy/kubernetes/CAPACITY.md` for the full findings + TODOs.

## Explicitly NOT doing (and why)

- **No full 3-way image split now.** Only the live producer must be separate. A dedicated
  EPICS-free "model API service" image adds a deployable + a network hop for no benefit
  while the dashboard and external callers can share the eval pool. Split when
  `facet_staged` (different image) or public auth forces it.
- **No custom gateway now.** The whitelist gates exposure; adopt an off-the-shelf gateway
  when we actually need auth/quota.
- **No pull-based work queue yet.** It solves sustained 100+ imbalance. At scheduled-burst
  + low baseline it's infra we'd carry for nothing. Revisit only if a load test shows
  Service-LB imbalance that least-request routing can't fix.
- **No sticky/stateful sessions, no per-user instances, no heartbeats/allocator/WS-relay.**
  Statelessness + a shared live broadcast removed the need. Don't reintroduce.
- **No scale-to-zero.** ~25–30 s cold start; keep a warm baseline.
- **No output-PV digital twin (lume-pva).** Multiple deployments would clash on PV names;
  we only read input PVs, read-only.
- **No FEL model / ai-lab Injector-Combined tabs.** Scope is the two staged models.

## Open items

1. **Live-data exposure policy** — is broadcasting live machine PVs acceptable once we're
   less locked down? (Distinct from the what-if API.)
2. **Live producer capacity** — is 1–2 workers enough for all live viewers at expected
   poll rates and screen counts? Confirm under load.
3. **External API payload encoding** — settle the raw-buffer format for image/distribution
   (base64 float32 vs npy vs msgpack) with the first real consumer.
4. **`facet_staged` deps** — where does `FACET2_LATTICE` come from, and is
   `facet2_inj_ml_model` pip/conda-installable for the image?
5. **`facet_staged` screens + `cu_hxr_bmad`** — which `PROF:IN10:*` screens are default;
   confirm dropping the marimo `cu_hxr_bmad` option.
