# Plan: Hosted Virtual Accelerator Model Service

A hosted service wrapping SLAC virtual-accelerator staged models. Any internal user
can hit an HTTP API to run a model and get beam output. A web dashboard adds an
interactive "what-if" tab and a shared live view of the current machine.

**Models in scope:** `cu_hxr_staged` (LCLS Cu injector surrogate → Bmad) now;
`facet_staged` (FACET-II) later. Both are `virtual_accelerator` `StagedModel`s with the
same output shape, so one UI and one adapter contract cover both.

## Where we are now

- **M1 done** (commit `aae6258`): marimo is gone. The monitor is a React/Vite/TS SPA +
  FastAPI backend. The heartbeat allocator and WS-relay are retired.
- **In-pod concurrency is built:** `pool.py` runs K model subprocesses per pod
  (`ProcessPoolExecutor`, spawn), baseline-merge lives in `source.snapshot`, and the
  pool returns HTTP 503 when saturated. This was originally scoped as "M2" — it's done.
- **Everything runs in one process today:** the FastAPI app serves the SPA, reads EPICS
  for the live loop, and holds the model pool. One pod, `replicas: 1`, one Ingress.

The request contract and the in-pod pool are proven. What's left: make it scale
correctly, and expose a clean external API.

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

## Build order (what's next)

**Done:** M1 (React SPA + FastAPI; marimo/allocator/relay removed) and the in-pod
K-worker pool + baseline-merge.

**N1 — Split out the live producer.**
- New Deployment (`replicas: 1`) with its own small pool + EPICS config.
- Move `/api/live/stream` and `/api/machine-snapshot` onto it; drop EPICS from the eval
  pool.
- Ingress routes live/snapshot to it. The SPA live tab keeps the same URL — no client
  change.
- **Done =** the eval pool has no EPICS loop and can run `replicas > 1` without
  duplicating live work.

**N2 — Friendly external API.**
- Add `/api/v1/evaluate` with a documented schema + OpenAPI, output flags
  (scalars / image-array / distribution / twiss), and model version in the response.
- **Done =** a notebook can POST JSON and get numbers back, with Swagger docs.

**N3 — Metrics + autoscaling.**
- Expose inflight + latency (Prometheus). Add KEDA cron pre-scale + inflight backstop.
  Set a modest fixed baseline replica count.
- **Done =** we can pre-warm for a class, and the pool scales on saturation.

**Later (only when needed):**
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
- **Shrink the image/pod.** The staged image is ~5.6 GB (conda + Bmad + lattice + torch).
  Smaller images pull faster, which directly helps cold-start latency, cron pre-scale,
  and the KEDA backstop, and raises pod density per node. Look at: multi-stage build,
  slimmer base, CPU-only torch, dropping conda/build tooling from the runtime layer, and
  pruning unused lattice files. Measure image size + cold-start time before/after.
- **Keep the live stream running across tab switches.** Today switching from Live to
  Interactive tears down the SSE connection and loses the timeseries/plot history;
  returning to Live reconnects from scratch. Lift the SSE subscription + frame buffer
  above the tab components (app-level state/context) so the stream stays connected and
  the plots stay populated when the Live tab isn't mounted. Frontend-only — the singleton
  live producer already runs continuously, so nothing changes server-side. Consider a
  cap on the retained buffer so a long-backgrounded stream doesn't grow unbounded.

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
