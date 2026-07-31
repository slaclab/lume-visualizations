# Plan: Hosted Virtual Accelerator Model Service

> **Target-state architecture + reasoning below; near-term build sequence up top.**
> The full hosted, multi-user, autoscaled service is the destination. We get there
> **incrementally, frontend-first**: the first milestone just replaces the marimo
> runtime with the ai-lab React/Vite/TS stack in front of a minimal single-user
> FastAPI backend — same app, new stack, no marimo. Concurrency, autoscaling, gateway
> and the second model come *after* that slice works end-to-end. See **Incremental
> build order** for the sequencing; the **Architecture** and later sections describe
> the destination each milestone graduates toward.

## Incremental build order (start simple)

The guiding rule: **each milestone is shippable and de-risks the next.** We do not
build the stateless pool, gateway, or autoscaling until a single-user React port is
actually running without marimo.

| # | Milestone | Ships | Why first / why here |
|---|---|---|---|
| **M1** | **Frontend migration — remove marimo (both tabs functional)** | React/Vite/TS port of the **full two-tab UI** + a **minimal single-user** FastAPI backend wrapping `cu_hxr_staged`. **Interactive tab:** `/config` + `/evaluate`. **Live tab:** backend reads input PVs **read-only** → `/evaluate` → **SSE** + `/machine-snapshot`. **Marimo, allocator, and WS-relay all retired.** | Highest-value, lowest-risk slice, and it fully replaces the deployed app. Proves the ai-lab stack renders the beam image + 3 plots, that HTTP `evaluate` replaces `source.snapshot()`, and that a shared SSE stream replaces the marimo live loop. No concurrency assumptions yet. |
| **M2** | **Concurrent users — stateless pool** | Enforce **baseline-merge** in the worker; run **K subprocess instances per pod**; bounded async queue. Load-test tens of concurrent interactive users. | This is the "many users connected concurrently" ask. Only meaningful once M1 defines the request contract. |
| **M3** | **Horizontal scale + gateway** | KEDA autoscale to 100+, warm buffer, graceful drain; thin gateway for API-key auth + quota + routing; OpenAPI. | Scale-out and the public-later auth gate, layered on the proven stateless contract. |
| **M4** | **Productionize + second model** | MLflow-versioned model loading, `/sweep`, observability; add **`facet_staged`** as a second worker image/Deployment. | Breadth and ops hardening last, once the platform shape is stable. |

**M1 is the immediate task.** Everything below M1 in this table is deliberately
deferred; the detailed target-state design that follows is the reference for M2–M4.

## Purpose

Rebuild the deployed **marimo** live-stream monitor (`lume-visualizations`) on the
**ai-lab tech stack + deployment infrastructure** (FastAPI backend, React/Vite/TS
canvas UI, Docker + S3DF K8s) as a single hosted service where any (initially internal)
user can send API calls and get accurate model output, with many users connected
concurrently, plus a shared live view of the current machine.

**Models in scope — two `virtual_accelerator` staged models, nothing else:**
- **`cu_hxr_staged`** — LCLS Cu injector ML surrogate → Bmad (existing marimo option).
- **`facet_staged`** — FACET-II injector surrogate → Bmad (`get_facet_staged_model`,
  new on `virtual-accelerator` `main`). **Deferred — build `cu_hxr_staged` end-to-end
  first, then expand.**

**Explicitly dropped:** the ai-lab **FEL** surrogate and its Injector/Combined tabs
(ai-lab contributes *stack + infra*, not features), and the marimo **`cu_hxr_bmad`**
option (confirm — see open items).

> This replaces the earlier version of this plan (allocator + warm pool +
> server-side idle detection + marimo→FastAPI migration). That design assumed every
> user needs a dedicated, sticky, *stateful* pod. The decisions below remove that
> assumption: the interactive API is **stateless**, and the live view is a **shared
> read-only stream** — neither needs per-user stateful pods.

## Decisions settled

| Question | Decision | Consequence |
|----------|----------|-------------|
| State model | **Stateless** — each request self-contained (baseline-merge) | No sessions, no affinity, no idle-release, no reset-on-recycle races |
| Concurrency | Classroom (10–30) typical, **scale to 100+** | Warm buffer for classroom; KEDA autoscale to 100+; subprocess density per pod |
| Input cost | **All inputs cheap** (magnet-style sets) | Baseline-merge every call is free; no rare-change special path |
| Live EPICS view | **In scope — read-only, in the web app** | Web-app backend reads INPUT PVs read-only → calls model API → SSE to browser; model API stays EPICS-free |
| Build target | **Both** API and web UI | API-first; **3 separately-developed deployables:** model API service · web-app backend · web-app frontend |
| Timeline | No hard deadline | Build it right; migration / rebuild acceptable |
| Substrate | **Vanilla K8s** (no Ray at SLAC) | FastAPI gateway + per-model Deployments + KEDA (+ optional pull-queue later) |
| Exposure | Internal now, **design for public later** | Real auth layer (API keys + quotas) from day one; whitelist is the removable gate |
| Release flow | **CI per virtual-accelerator release → staging + canary → promote** | Same model image pullable for personal isolated use (own EPICS, no clash) |
| Live transport | **No service writes PVs.** Live view = read-only input-PV read → shared model API `/evaluate` → SSE | Avoids cross-deployment PV-name clash; no separate digital twin (lume-pva) writing output PVs; reuses the stateless API |

## Models in scope: CU_HXR vs FACET-II staged

Both are `virtual_accelerator` **`StagedModel`**s (injector ML surrogate → Bmad beam
tracking), so they share one output contract and **the marimo dashboard layout mirrors
across both** — same 2×2 panels (beam image, x–px phase space, σ/ε scalar timeseries,
Twiss β), same Live/Interactive tabs, same control *types*. `beam_monitor.py`'s
`ModelImageSource` → `BeamFrame` already extracts these generically (image +
`beam["x"]/["px"]` + `s`/`x.beta`/`y.beta` Twiss), so it — not ai-lab's
`InjectorSession` — is the right adapter basis.

**What is inherently per-model and must be parameterized (not hardcoded):**

| Aspect | `cu_hxr_staged` | `facet_staged` |
|---|---|---|
| Lattice | `LCLS_LATTICE`, `bmad/models/cu_hxr` | **`FACET2_LATTICE`**, `bmad/models/f2_elec` (separate checkout) |
| Extra dep | CU injector surrogate | **`facet2_inj_ml_model`** (separate package) |
| Screens (dropdown) | OTR2/OTR3/OTR4 → `OTRS:IN20:*` | profmons `PR10241/571/711` → `PROF:IN10:*` (from `facet2_profmon_info.yaml`) |
| Input sliders | IN20 injector PVs (`SOLN/QUAD/ACCL:IN20:*`) | FACET-II magnets/klystrons (e.g. `KLYS:LI10:41:SFB_PDES`); from `model.supported_variables` |
| Track range | OTR2 → TD11 | PR10241 → END |
| Scalar source | PV branch **hardcoded** in `beam_monitor.py` (`model_name == "cu_hxr_staged"`) — must be generalized | beam-distribution scalars |

**Consequence (already the plan's stance):** separate worker image + Deployment per
model — different lattices, deps, and pinned `virtual-accelerator` commit (the local
checkout is behind `main`; the pin must include `facet2.py`). The screen list and slider
set come from each model's `config()`; the UI renders whatever the adapter publishes.

## Core principle: statelessness via baseline-merge

The models are "stateful" only in that Bmad holds the **last-set magnet
configuration**. If every request starts from a known baseline and applies the
user's inputs over it, `evaluate` is correct on **any** instance regardless of
history — a pure function at the API boundary.

**The one correctness rule — enforced in the worker, not the model:**

```python
effective = {**model_defaults, **request.inputs}   # known baseline, then overlay
model.set(effective)                                # (or reset() then set)
result = model.evaluate()
```

Never `model.set(request.inputs)` on a pooled instance: a *missing* key would
silently inherit the **previous user's** value rather than the default — a
state-leak that produces wrong physics with no error. (ai-lab's `session_pool`
does a bare `set` today; it only gets away with it because each group has a
dedicated instance and the client always sends the full slider set. A shared pool
cannot rely on that.)

Clients get "adjust one knob" ergonomics for free: send `{QUAD:IN20:525:BCTRL: 5.0}`
= "default machine, one quad changed." `GET /{model}/config` publishes the
defaults + ranges they deviate from. Holding several custom values + nudging one
more is the client tracking its own working dict — still stateless server-side.

**Caveats to document in the API contract:**
- Both staged models are **stochastic** at the injector-surrogate stage → identical
  requests give the same *distribution*, not bit-identical output.
- Beam can be lost at extreme inputs → structured empty result.
- Output is **version-dependent** → expose model version (git commit / MLflow run).

## Architecture

```
GitHub — virtual-accelerator release
   └─ CI: build model image → staging + canary → promote to prod
                                                    │
==================== S3DF Computing Facility =======│=====================
                                                    ▼
  MODEL API SERVICE  (one per model — start with cu_hxr_staged)
    FastAPI · stateless · EPICS-FREE · subprocess density · KEDA
    GET /models · GET /{m}/config · POST /{m}/evaluate · POST /{m}/sweep
      ▲                         ▲
      │ /evaluate               │ direct HTTP via Gateway .......... emittance GUIs,
      │                         └.............................. custom apps, notebooks
  WEB-APP BACKEND (dashboard)                                     (Anywhere / VPN)
    · Interactive VA : forward working dict → /evaluate
    · Live view      : read INPUT PVs (READ-ONLY) → /evaluate → SSE ... LUME Dashboard
    · machine-snapshot: read current INPUT PVs (READ-ONLY)              browser / React
      │                                                                 (via Ingress)
      │ read-only Channel Access — input PVs only, NO writes
      ▼
========================================================================
  Controls Network — EPICS

  (Same MODEL API SERVICE image is pullable for personal isolated use — own EPICS, no clash.)
```

### Model API service (per model — the product)

The reusable artifact: a stateless HTTP service wrapping one model (start with
`cu_hxr_staged`). **EPICS-free.** Any client calls it directly — emittance GUIs, custom
apps, notebooks, *and* the dashboard are all just HTTP callers. This is **not** the web
app's backend; the web app is one client among many.

- `GET /models`, `GET /{m}/config` (inputs + ranges + defaults, outputs, version),
  `POST /{m}/evaluate` (baseline-merge → evaluate), `POST /{m}/sweep` (batch scans).
- Auto-generated **OpenAPI / Swagger** → instant programmatic usability.
- Built + shipped by CI on each `virtual-accelerator` release (staging + canary →
  promote). The **same image runs standalone** for personal isolated use.
- Internals (worker pool, density, autoscaling): below.

### Gateway (auth / routing)

A thin front door for the model API services: API-key validation, per-key
rate-limiting/quotas, and routing `{model}` → the right service. Built for public-later —
the ingress source-range whitelist is the removable gate; do **not** rely on network
whitelisting alone. Horizontally scalable, no sticky sessions.

### Model API internals: worker pool & density (per model)

Separate images/Deployments per model — each staged image is ~5.6 GB (conda + Bmad +
lattice + torch). `cu_hxr_staged` bakes `LCLS_LATTICE`; `facet_staged` bakes
`FACET2_LATTICE` + `facet2_inj_ml_model`. They do not share an image or pool.

- Each worker **process** holds **one** instance, concurrency 1, asyncio-lock
  serialized (pytao is thread-unsafe), thread-pinned
  (`OMP/MKL/OPENBLAS/TORCH_NUM_THREADS`).
- Per request: baseline-merge → evaluate → return. No identity, no persistence,
  **no EPICS**.

**Density — the lever for 100+.** One-instance-per-pod (ai-lab today) means 100
concurrent ≈ 100 pods × ~2 GB + 100 cold starts. Instead run **K subprocess
instances per pod** under a supervisor; process isolation still avoids the torch
double-load segfault and pytao thread-unsafety that forced one-per-container.
~8-core/16 GB pod → ~6 instances → 100 concurrent ≈ ~15 pods, and a new pod adds K
instances at once (coarse, fast scale-up).

**Balancing + autoscaling.** Statelessness makes autoscaling safe — no session to
protect, idle pods drain cleanly (readiness flip + `preStop`). Start simple (K8s
Service LB + bounded per-pod async queue); graduate to a **pull-based work queue**
(worker pulls a job only when free → perfect balancing across variable-latency Bmad
calls; queue depth = KEDA metric) if load tests show imbalance. Warm buffer sized to
classroom load; **no scale-to-zero** (~25–30 s injector cold start).

### Web-app backend (dashboard) — interactive + live, read-only to EPICS

Its own service, **separate from the model API** — the only component that touches
EPICS, and **read-only**. It serves the React frontend and does three things:

- **Interactive VA mode:** forwards the user's working input dict to the model API
  `POST /{m}/evaluate` and returns the frame. (The frontend may also call the model API
  directly through the Gateway; a backend proxy keeps auth/CORS simple.)
- **Live view:** continuously reads the machine **input** PVs **read-only** (reusing
  `epics_controls.py`), calls the same stateless `/evaluate`, and streams frames to the
  browser via **SSE**. The "live driver" is therefore just an API client whose inputs
  come from live EPICS reads — no separate model runtime, no per-user state.
- **machine-snapshot / "Apply current machine values":** read current input PVs
  (read-only) → return an input dict; the client seeds its working dict, then hits
  `/evaluate`. "Start from the live machine, then play what-if" with zero server state.

**Why read-only, no output PVs (decided — supersedes the earlier relay design):** a
per-deployment digital twin that *writes* output LUME PVs (lume-pva) is explicitly out —
multiple deployments (prod, staging, canary, personal runners) would collide on the same
PV names. **Reading** input PVs is safe from many deployments at once; **writing** is not.
So the live view computes via the model API rather than publishing/relaying output PVs.

- Read-only input-PV reads are shared and cheap; SSE fan-out serves unlimited viewers.
- **Note:** exposing live machine data (esp. once public) may carry its own data policy
  separate from the what-if service — confirm before public exposure.

### Web UI (one API client)

Faithful React port of the deployed **marimo** live monitor
(`deploy/kubernetes/live-monitor-ui/live_stream_monitor.py` + `dashboard.py`), built
on the **ai-lab stack** (React + Vite + TS, canvas rendering). The marimo two-tab
layout (`mo.ui.tabs`) maps 1:1 onto ai-lab's existing `App.tsx` tab-nav pattern
(`useState` + buttons + conditional render) — the tab/simple-swap UX is a direct
reuse, not new work.

**Two tabs, bound to the backend:**
- **Live tab:** read-only view of the current machine. Subscribes to the web-app
  backend's **SSE** live stream (backend reads input PVs read-only → `/evaluate`); no
  sliders drive it. Poll-period control becomes a client-side throttle.
- **Interactive tab:** holds the working input dict locally, debounced (~300 ms)
  `POST /{model}/evaluate` (stateless baseline-merge). "Apply current machine values"
  = `GET /machine-snapshot` → seed the dict. "Scan Quad" = client loop or `/sweep`.

**Reuse from ai-lab (≈80% of the UI):**

| ai-lab asset | Role in the monitor |
|---|---|
| `App.tsx` tab-nav | Live / Interactive tab swap |
| `BeamImage.tsx` (canvas + colormap + OffscreenCanvas) | Beam-image panel (swap Hot→inferno, add colorbar + auto-zoom) |
| `SliderControl.tsx` | Per-model input sliders (CU_HXR: 15; 4-per-row via CSS grid) |
| `ScalarDisplay.tsx` | σx / σy / σz / εx / εy readouts |
| `InjectorPanel.tsx` controls▏output layout + debounced eval | Interactive-tab structure |

**New work — the 3 plots ai-lab lacks** (marimo `BeamDashboard` is a 2×2 matplotlib
figure; ai-lab has only the beam image):

| marimo panel | What | React approach |
|---|---|---|
| Phase-space scatter (x vs px) | ~5000 pts, subsampled | canvas (same technique as `BeamImage`) |
| Scalar timeseries (σx/σy/σz left axis, εx/εy twin axis, "now" marker, rolling 120 s / 30-pt window) | streaming dual-axis line | **uPlot** |
| Twiss βx/βy vs s(m) | line plot | **uPlot** |

Plus controls ai-lab lacks: screen dropdown, image-scale dropdown (robust/fixed/auto),
poll-period slider (live), σ/ε/β show-checkboxes, and the two buttons above.

**Charting decision:** **uPlot** for the two line charts — canvas-based (~40 KB, no
deps), native dual-axis + streaming, and avoids the CJS/ESM Vite breakage and flashing
that got **Plotly rejected** in ai-lab. Scatter + beam image stay hand-rolled canvas.
Net: no Plotly, one small chart lib, everything else canvas or plain React.

**Improvements welcome while porting:** colorbar legend on the beam image,
click-to-freeze on the timeseries, and surfacing the model version (git commit / MLflow
run) in the header (marimo shows only a static title).

### Model-adapter registry (what makes it a platform)

A thin contract each model implements, registered by name; the worker/live-driver
stay generic and load an adapter by env var:

```python
class ModelAdapter(Protocol):
    def config(self) -> ModelConfig: ...        # inputs (name, range, default), outputs, version
    def evaluate(self, inputs: dict) -> dict: ...
    def reset(self) -> None: ...
```

The natural implementation is lume's `beam_monitor.py` `ModelImageSource` (already
model-agnostic: image + phase space + Twiss + scalars → `BeamFrame`), generalized to
drop the hardcoded `cu_hxr_staged` scalar branch and to read screens + writable inputs
from per-model config. Register `cu_hxr_staged` and `facet_staged`. Load model
**versions** via MLflow where possible (the `va` mlflow branch suggests a registry is in
play) and surface the version in `/models` and responses.

## Migration: reuse vs retire

**Reuse from ai-lab (stack + infra donor, not features):**
- FastAPI backend shape, evaluate endpoints, asyncio-lock-per-instance, thread pinning.
- React/Vite/TS canvas rendering (`BeamImage.tsx`), `SliderControl`, image
  ROI/crop/downsample; tab-nav pattern (`App.tsx`).
- Dockerfile structure (mambaforge + pytao + Bmad + pinned commits) + S3DF K8s deploy
  layout (per-model image, ingress, probes).

**Reuse from lume-visualizations (features + model layer):**
- `beam_monitor.py` (`ModelImageSource`/`BeamFrame`) → generalized adapter basis.
- `dashboard.py` layout + `live_stream_monitor.py` controls → the React UI spec.
- `epics_controls.py` → web-app backend live view + machine-snapshot (read-only input PVs).
- `config.py` screen/input specs → per-model config (generalized beyond CU_HXR).

**Change:**
- Enforce baseline-merge in the worker; instances become a shared stateless pool.
- Lift routing/scaling out of the app into the gateway (+ queue/KEDA).
- Parameterize screens + input sliders per model (remove hardcoded `cu_hxr_staged`).
- Rebuild the marimo dashboard as the multi-model React UI.

**Retire:**
- The **marimo** runtime, the **heartbeat allocator** (`live_monitor_allocator.py`),
  and the **WS-relay proxy** (`live_monitor_pool.py`) — all manage sticky stateful
  sessions, eliminated by the stateless + shared-live design. Live *monitoring* is
  preserved, rebuilt as the web-app backend's read-only SSE live view.
- The ai-lab **FEL** surrogate + Injector/Combined tabs, and (pending confirmation) the
  marimo **`cu_hxr_bmad`** option.

## Phasing (frontend-first, incremental value, no deadline)

The order below is deliberately the **reverse** of an API-first build: we port the UI
and delete marimo before touching concurrency, because the single-user React port is
the cheapest way to validate the new stack and it pins down the request contract that
the later stateless pool must honor.

### M1 — Frontend migration, remove marimo — both tabs functional *(the immediate task)*

Replace the marimo runtime with the ai-lab React/Vite/TS stack in front of a minimal,
**single-user** FastAPI backend. Both tabs work end-to-end. No concurrency, no gateway,
no autoscaling yet — one backend process, one model instance, low concurrent load is
fine (requests serialize under an asyncio lock; M2 removes that).

1. **Minimal backend.** FastAPI wrapping **`cu_hxr_staged`** via `beam_monitor.py`'s
   `ModelImageSource` (as-is; generalizing the hardcoded scalar branch is deferred to
   M2). Endpoints: `GET /config` (screens, writable inputs + ranges + defaults, model
   info); `POST /evaluate` (screen + input dict → `BeamFrame` payload: image array,
   x/px scatter, σ/ε scalars, Twiss β vs s) — the plain HTTP replacement for the marimo
   `source.snapshot()` call; `GET /machine-snapshot` (read current input PVs → dict, for
   "Apply current machine values"); and an **SSE** live endpoint (below). Single
   instance, asyncio-lock serialized.
2. **React port of the Interactive tab.** ai-lab `App.tsx` tab-nav shell; port the
   beam image (`BeamImage.tsx` → inferno + colorbar + auto-zoom), the 15 CU_HXR input
   sliders (`SliderControl.tsx`, 4-per-row grid), σ/ε scalar readouts
   (`ScalarDisplay.tsx`), screen dropdown, image-scale dropdown, σ/ε/β checkboxes.
   Working input dict held client-side, debounced (~300 ms) `POST /evaluate`.
3. **The 3 plots ai-lab lacks** — x–px phase-space scatter (canvas), σ/ε scalar
   timeseries and Twiss β vs s (**uPlot**), per the Web UI section.
4. **Live tab (read-only SSE driver).** Backend continuously reads the machine **input**
   PVs read-only (reuse `epics_controls.py` `EpicsInputProvider`) → calls the same
   `/evaluate` → streams frames to the browser via **SSE**. React **Live tab**
   subscribes; poll-period becomes a client-side throttle. This is the only component
   that touches EPICS, and only reads. (The `/evaluate` and `/config` endpoints stay
   EPICS-free; a personal isolated run can point the live driver at its own EPICS.)
5. **Retire marimo + allocator + WS-relay.** Delete the marimo app + css/head assets,
   `live_monitor_allocator.py`, and `live_monitor_pool.py` from the serving path once
   the React app reaches parity. Deploy target is a **single K8s Service + Ingress**
   (one URL for everyone) — no `wN`, no slot-selection lobby (see *Explicitly NOT
   doing*).

**M1 done =** a browser loads the React app at a single URL, uses both tabs (Interactive
sliders → correct `cu_hxr_staged` output; Live tab streaming the machine) with no marimo,
allocator, or WS-relay in the stack.

### M2 — Concurrent users, stateless pool

6. **Stateless correctness.** Enforce **baseline-merge** (`{**defaults, **inputs}` →
   `set` → `evaluate`) in the worker so any pooled instance is correct regardless of
   history; generalize `beam_monitor.py` (drop the hardcoded `cu_hxr_staged` scalar
   branch; read screens + writable inputs from per-model config) into the adapter
   registry.
7. **In-pod density.** Run **K subprocess instances per pod** under a supervisor +
   bounded per-pod async queue; thread-pinned. Load-test tens of concurrent
   interactive users.

### M3 — Horizontal scale + gateway

8. **Scale-out.** KEDA autoscale toward 100+, warm buffer, graceful drain (readiness
   flip + `preStop`); pull-based work queue if load tests show imbalance. **No
   scale-to-zero.**
9. **Gateway.** Thin front door: API-key validation, per-key rate-limit/quota,
   `{model}` routing; OpenAPI/Swagger. Ingress source-range whitelist is the removable
   public-later gate.

### M4 — Productionize + second model

10. **Ops + versioning.** MLflow-versioned model loading (surface version in `/config`
    + responses), `POST /sweep`, observability (latency / queue depth / utilization),
    docs.
11. **Add `facet_staged`.** Separate worker image + Deployment (`FACET2_LATTICE` +
    `facet2_inj_ml_model`, pinned `virtual-accelerator` commit); UI renders whatever
    the adapter's `config()` publishes. Confirm open items #5/#6 first.

## Explicitly NOT doing (and why)

- **No sticky / per-user stateful sessions.** Robust delta-state needs a full-input
  fallback anyway (expiry/crash/reassignment), so it is strictly more work than
  stateless full-input — for no benefit given cheap magnet `set`s.
- **No per-user live-seeded instances.** "Start from live, then what-if" is covered
  by `machine-snapshot` → client working dict → stateless `/evaluate`. No per-user
  live copies.
- **No client heartbeats / server-side idle detection / allocator / WS proxy.**
  These managed session lifetime and per-user worker addressing; there are no
  sessions and the live view is a shared broadcast.
- **No `wN` URLs and no slot-selection lobby (e.g. Badger on-demand).** Both patterns
  exist only for *sticky, stateful* sessions — a marimo kernel per user, or a noVNC
  desktop per user — where a user must be pinned to one pod and therefore the pod
  index leaks into the URL. Once `/evaluate` is stateless and the live view is a shared
  SSE broadcast, there is nothing to pin: **one URL behind a single K8s Service + Ingress**,
  and the load balancer spreads requests across identical replicas. Adopting a
  Badger-style lobby here would re-introduce exactly the statelessness-breaking stickiness
  M1 removes.
- **No scale-to-zero.** Injector cold start (~25–30 s) is too slow for interactive
  use; keep a warm buffer.
- **No multiple model instances in one process.** Subprocess isolation gives density
  without the torch double-load segfault.
- **No FEL model, no ai-lab Injector/Combined tabs.** Scope is the two staged models;
  ai-lab contributes stack + infra only.
- **No digital twin that writes output PVs (lume-pva).** Multiple deployments would
  clash on identical PV names; the service only *reads* input PVs (read-only) and
  computes the live view via the model API.

## Remaining open items

1. **Live-data exposure policy** — is broadcasting live machine PVs acceptable once
   the service goes public? (Distinct from the what-if service.)
2. **Confirm live-view shape** — shared read-only + snapshot (current plan) vs.
   per-user live-synced copies (rejected as unnecessary). Flag if the latter is
   actually wanted.
3. **Which models get a live driver** — `cu_hxr_staged` for sure; does `facet_staged`
   need a live PV-driven mode too (is it EPICS-streamed)?
4. **Live transport — REVISED 2026-07-03 (supersedes the earlier "relay output PVs"
   resolution): read-only input PVs + model API, NO output PVs written.** User is not
   deploying a per-model digital twin that writes output LUME PVs (lume-pva) — multiple
   deployments would clash on identical PV names. Live view = web-app backend reads input
   PVs read-only → calls the shared stateless `/evaluate` → SSE (see Web-app backend
   section). No output-PV schema dependency; no PVWS gateway.
5. **FACET-II lattice + deps** — where does the `FACET2_LATTICE` checkout come from, and
   is `facet2_inj_ml_model` pip/conda-installable for the image? Confirm before the
   `facet_staged` worker image can build.
6. **FACET-II screens + `cu_hxr_bmad`** — which profmon screen(s) (`PROF:IN10:*`) are
   default/available for `facet_staged`? And confirm dropping the marimo `cu_hxr_bmad`
   option (currently a dropdown value).
