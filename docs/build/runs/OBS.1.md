# OBS.1 — Observability: the api listener leak, structured error logs, 5xx reporting (run ledger)

- **Harness:** Devin CLI (agentic coding subagent); model: Cognition Devin; tier: n/a (build work)
- **Ticket:** `docs/tickets/74_OBS.1__observability.md`
- **Branch:** `stevevitali/obs-1-observability`, stacked on RUN.1 `dc55282`
  (`stevevitali/run-1-run-and-chat-defects`, PR #95 — open, `OPERATOR` merge policy, **not merged**).
- **Goal:** every user-visible 5xx on prod leaves a trail an operator can follow from the LB to the
  line of code, and nothing in that trail carries user text.
- **ADRs:** ADR-053 (log contract allowlist), ADR-054 (5xx alert keys the LB count, fires on any
  occurrence), ADR-055 (the verification 5xx is provoked by env-misconfiguration, never a deployed
  fault route).

## 1 — The `MaxListenersExceededWarning` leak: adding stack + root cause

### Warning (prod, `rhema-prod-api-e745ce0-00072-m47`, bursts correlated with SSE disconnects)

```
MaxListenersExceededWarning: Possible EventEmitter memory leak detected.
11 error listeners added to [PassThrough]. / 11 close listeners added to [PassThrough].
```

### Reproduced locally — `docs/build/logs/obs1-leak-repro3.mjs`

The decisive repro is the real `@google-cloud/storage` byte path (`file.createReadStream()` /
`file.download()`) against a local flaky fake-GCS server, with the consumer aborting mid-flight —
the SSE-disconnect analogue. Two independent instrumentation passes (EventEmitter.on/once
tracking + `--trace-warnings` shape) agree:

- **The victim emitter** is `node-fetch@3.3.2`'s `res.body` PassThrough
  (`node_modules/node-fetch/src/index.js:253` — `body = pump(response_, new PassThrough())`).
- **The adding stack** (recorded per the ticket AC):

  ```
  pipelineImpl (node:internal/streams/pipeline:286)
  pipeline (node:internal/streams/pipeline:183)
  PassThrough.<anonymous> (teeny-request/build/src/index.js:194)
  ```
  and the eos/pipe half at `end-of-stream:218 ← pipeline:447 ← pipelineImpl:374`.
  A second stack lands at `@google-cloud/storage file.js:1119`
  (`pipeline(rawResponseStream, …, throughStream)`).

### Mechanism

One response, three owners — each attaching an `eos`/`pipeline` listener set to the SAME
`res.body` PassThrough:

1. node-fetch's own `pump(response_, PassThrough)`;
2. teeny-request stream mode: `responseStream.on('error', …)` (index.js:203) **plus**
   `pipeline(responseStream, requestStream)` fired late on `requestStream.once('response')`
   (index.js:194);
3. `@google-cloud/storage`'s `createReadStream` pipeline on `onResponse` (file.js:1119).

When the consumer destroys `requestStream` before the response lands (client disconnect), the
late `pipeline()` at teeny-request:194 throws `ERR_STREAM_UNABLE_TO_PIPE` **after** its destroyer
listeners are already attached; the retry path (`retry-request` + storage retries) adds more sets
to the same emitter before any eos cleanup runs → `error`/`close` cross the 10-listener threshold
in bursts — exactly the prod warning shape.

### Fix — `packages/contracts/src/gcs-bytes.ts` (root cause, not a suppression)

**No `setMaxListeners` anywhere.** The fix removes the emitter: all GCS byte ops
(download/save/delete) now run through `createGcsBytesTransport` — a plain `fetch` against the
GCS JSON API (`…/download/storage/v1/b/{b}/o/{o}?alt=media`,
`…/upload/storage/v1/b/{b}/o?uploadType=media`, `DELETE …/o/{o}`) with ADC auth via
`storage.authClient.getRequestHeaders`, bounded deterministic retry (3 attempts, retryable
statuses + one 401 token-refresh retry), 30s per-request timeout, and status→`GcsApiError.code`
mapping that preserves the existing `isNotFound` semantics. Zero node streams are constructed, so
there is no shared emitter for listeners to accumulate on. `getSignedUrl` paths are untouched
(they never touch the byte path).

Behavioral deltas vs the library path (accepted): the transport does no crc32c/md5 payload
validation (the library's default was warn-only anyway; TLS + content-addressed keys cover it);
`file.save` multipart metadata is replaced by `uploadType=media` bytes-only writes (every caller
writes opaque bytes/strings); `delete` maps `ignoreNotFound` faithfully. `ifGenerationMatch`
preconditions are preserved via the upload query param (the PRB.21 marker path).

Wired at every live binding — the only call sites that ever touched the streaming path:

| site | file |
|---|---|
| `createGcsContentStore` (api/worker/run-task content store) | `packages/mirror/src/content-store-gcs.ts` |
| `createGcsRestoreBlobStore` | `packages/mirror/src/restore.ts` |
| `createGcsObjects` (→ `createGcsBlobStore`, markers, converted results) | `packages/live-clients/src/ingest.ts` |
| collab `liveDeps` (restore blobs + content store) | `apps/collab/src/server.ts` |

### Evidence

- **Pre-fix:** `obs1-leak-repro3.mjs` → `11 error` + `11 close` on one PassThrough, adding stack
  above; `ERR_STREAM_UNABLE_TO_PIPE` unhandled rejections.
- **Post-fix:** `docs/build/logs/obs1-leak-fixed.mjs` — same flaky server + same instrumentation
  through the new transport: **545 ops, 0 warnings, 0 PassThrough emitters.**
- **Regression test:** `packages/contracts/src/gcs-bytes.test.ts` "listener-leak regression" —
  patches `EventEmitter.on/once`, runs 60 concurrent ops through a 1-in-3 flaky local server,
  asserts zero `PassThrough` emitters, zero `MaxListenersExceededWarning`s, and peak live listener
  count ≤10 per (emitter, event). Fails if the byte path ever routes through a streaming client
  again.

## 2 — Request/trace identity (web + api)

`packages/contracts/src/observability.ts`: precedence `x-cloud-trace-context` → W3C
`traceparent` → sanitized `x-rhema-request-id` → fresh UUID. `x-rhema-request-id` is echoed on
every response; `logging.googleapis.com/trace` is written into request-scoped lines as
`projects/<project>/traces/<id>` so Cloud Logging joins the LB trace. The web deliberately does
NOT honor a browser-supplied `x-rhema-request-id` (untrustable) — it accepts the LB trace headers
or mints, then forwards the resolved id to the api on `x-rhema-request-id`.

## 3 — Exactly one structured error line per user-visible 5xx

- **API:** `apiOnError` + `logApiRouteError` + a fallback sweep that logs any ≥500 response not
  already logged (direct `c.json(500)` returns and swallowed upstreams). Non-`Error` throws are
  normalized before Hono's `onError`.
- **Web:** the same shape via `webObservability` (`onError` + sweep + `withRequestId` on outbound
  api calls).
- **Shape (ADR-053):** explicit allowlist only — `severity`, `msg`, `service`, `route` (Hono
  route **template**, never the raw path), `method`, `status`, `upstreamStatus`, `upstreamCode`,
  `requestId`, `errorClass`, sanitized stack frames, `logging.googleapis.com/trace`. No exception
  `message`, no body/query/cookies/tokens/webhook URLs/prompt text. Degraded (non-5xx) upstream
  reads emit `severity:WARNING` `degraded_reads` lines with a per-request counter.

## 4 — Monitoring (infra/pulumi/monitoring.ts)

- `rhema_lb_5xx_requests` — log-based metric over `http_load_balancer` request logs
  (`httpRequest.status>=500`), labels `backend_service`, `status` — the ticket-specified metric.
- `rhema_route_5xx_errors` — log-based metric over `cloud_run_revision` structured lines
  (`severity=ERROR`, `status>=500`), labels `service`/`route`/`status`/`msg`. `requestId` is NOT a
  label (cardinality).
- Alert policy: fires on any occurrence (threshold 0, 5-min alignment, 30-min auto-close) via the
  optional ops webhook channel — ADR-054.
- Dashboard tile alongside the SLO tile.
- `infra/pulumi/monitoring.test.ts` — 8 structural tests; Pulumi tsconfig now excludes vitest
  files (its CJS compiler rejected `import.meta`).

## 5 — Swallowed-path audit

| path | disposition |
|---|---|
| api route errors / unhandled throws | `onError` → one structured `route_error` line, generic `{"error":"internal_error","requestId":…}` body |
| direct `c.json(5xx)` / upstream-mapped 5xx responses | fallback sweep logs once (dedup by requestId flag) |
| `.catch(() => null)` degraded reads (content store, persona, analytics) | WARNING `degraded_reads` line + per-request counter — not user-visible 5xx |
| web → api calls | `withRequestId` forwards the resolved id; upstream 5xx bubbles through the sweep |

## 6 — Verification status

| gate | result |
|---|---|
| `vitest` gcs-bytes | 12/12 green incl. the listener regression |
| `vitest` api (43 files / 511), web (32/453), contracts, mirror, live-clients, collab (17/157) | green |
| `turbo typecheck` (contracts, mirror, live-clients, collab) + `lint` | green |
| full `turbo build lint typecheck` (135/135) + `pnpm test` (429 files / 4,223) | green |
| Pulumi typecheck + `pulumi preview` prod | **gate clean**: +3 create (route-5xx + lb-5xx log metrics, route-5xx AlertPolicy), ~8 update (7 Cloud Run `-scaling` drift reconciliation — pre-existing — + the dashboard tile), **0 replace / 0 delete**, ≈$0 delta ≤$15 |
| Stage B deploy + provenance = chain tip | pending (Phase 5) |
| prod: no warnings 24h; one 5xx traced LB→app→Error Reporting→incident (ADR-055 procedure); JOURNEY.1 nightly green | pending (Phase 5) |

## 7 — Open items carried to Phase 5/6

- Revert `NODE_OPTIONS=--trace-warnings` on prod api once the deploy lands (diagnostic only).
- `docs/tickets/DEFERRALS.md` rows for anything the deploy window can't verify in-session.

## 8 — Stage B — executed 2026-10-03 (D-OBS.1-1 DONE; D-OBS.1-2/-3 OPEN-partial)

Harness: operator-driven live legs under the standing ADR-013 Stage-B authorization
(merge policy OPERATOR — PR #96 stays open, unmerged). Spend **$0** (no metered run;
the scheduled-workflow trigger does not exist for a stacked branch — the journeys ran
via the same CLI invocation the workflow uses).

### 8.1 — Deploy + provenance (D-OBS.1-1 → DONE)

- **Build.** Cloud Build `a7834719-cb72-4dee-95fe-86b4866c059b` (tag `obs1`, tip `0db8910`) —
  api/web/collab/worker/run-task all SUCCESS (the ticket's diff'd services; fetcher/convert/
  export/egress-proxy keep their `run1` pins). Digests: api `3732d49f…`, web `dda780ff…`,
  collab `8632cc8b…`, worker `49c0b12c…`, run-task `46ca4fa1…`.
- **Pulumi.** First `pulumi up` (**update 124**) failed on the AlertPolicy create: the
  condition filtered `resource.type="http_load_balancer"` — that is the *log* resource
  type; the global external ALB's *monitoring* time-series resource is `l7_lb_rule`. Fix:
  metric filter keeps `http_load_balancer`; policy + dashboard query `l7_lb_rule`
  (`monitoring.test.ts` asserts it; 8/8). Re-preview +1 create/~8 update/0 replace/0 delete
  ≈$0 → **update 125** green. The two log metrics + policy + dashboard tile are live.
- **NODE_OPTIONS decision — REVERTED in the same deploy (deliberate).** `pulumi up` PUT the
  declared spec and removed the out-of-band diagnostic `NODE_OPTIONS=--trace-warnings`
  (live `gcloud run services describe` confirms absence). Rationale: the fix removes the
  emitter (no node streams → nothing to warn on); the warning text still logs without the
  flag if it ever recurs; the diagnostic adding-stack for the known shape is recorded in
  §1; prod now ends **fully IaC-managed — no out-of-band drift to carry**.
- **Provenance PASS** at `0db8910`: `api.rhema.tools/healthz` + `rhema.tools/healthz` both
  `build.gitSha = 0db8910133f6b160fb111f21532a6cc3609d9d3a`. `deployments` row
  `prod:0db8910…` recorded via the IAP tunnel (protocols `0.4.0+ec61156725a895ab`).
- **Soak started `2026-10-03T06:46:41Z`** (api revision `…-00074-fsc` serving).

### 8.2 — The deploy's own defect, caught by the deploy's own feature

The first post-deploy organic request proved the whole chain — **and exposed a live
regression OBS.1 introduced**:

- `instrumentReads` proxied `deps.contentStoreFor`'s factory **result** — a `Promise` on the
  live binding — so every `await` ran `Promise.prototype.then` through the trap with
  `this` = the proxy → **`TypeError` at `Proxy.then`** → 500 on EVERY `contentStoreFor`
  route (dossier, editor, persona/voice, review SSR payload, run-sheet-context, export).
  The suite missed it because tests reach routes via the sync `store` dep, never the async
  factory; the local byte-path repro used a fake `getAuthHeaders`, so no test ever awaited
  a proxied Promise.
- **Evidence the observability worked end-to-end within ~3 minutes of deploy:**
  - Response: `500 {"error":"internal_error","requestId":"72e73c47106bc11184ba4570f44e86ee"}`.
  - LB entry `2026-10-03T06:47:44.263Z` — `status:500`, `response_sent_by_backend`,
    `trace: projects/rhema-507501/traces/72e73c47106bc11184ba4570f44e86ee`.
  - App line `2026-10-03T06:47:44.316Z` — `unhandled_route_error`, same `requestId`,
    `route:"/projects/:id/review/:runId/dossier"` (template, not path), `errorClass:TypeError`,
    allowlisted stack — **requestId ≡ LB trace, the join the ticket asks for**.
  - Error Reporting group `CJ2A2euuj5n0iQE` (firstSeen = the app line's timestamp,
    service `rhema-prod-api-e745ce0-00074-fsc`).
  - Alert incidents **both OR-legs fired**: `0.oddu1bax2o8m` (LB leg,
    `rhema_lb_5xx_requests`) + `0.oddu1bax2o8k` (app leg, `rhema_route_5xx_errors`),
    opened `06:49:42Z`, policy `1858034758162102112` — the ADR-054 fire-on-any posture,
    recorded unnotified per BL-24 (no ops webhook channel configured).
- **Fix (commit `3c3d7a7`).** `instrumentStoreFactory` resolves the factory then proxies
  the STORE; regression test covers async + sync factory shapes and null pass-through
  (10/10 observability tests). Hotfix Cloud Build `1becb534-395d-4025-8e89-b9247c7bdb52`
  (tag `obs1fix`, api+web at the new tip) → digests pinned (api `560aa2a7…`, web
  `6f835cf5…`) → preview ~7/0/0/0 → **`pulumi up` update 126** → provenance **PASS**
  `3c3d7a792487dbf4f74bbf5ad1c3b1498e40f752` on api+web → `deployments` row
  `prod:3c3d7a7…` recorded → **dossier GET → 200** (74 KB, full dossier DTO).
- **Honest blast radius:** every api route that awaits `contentStoreFor` 500'd during the
  window `…-00074-fsc` was live (≈06:46:33–07:03): the alert series shows
  `/projects/:id/review/:runId/dossier`, `/projects/:id/editor/:draftId`,
  `/projects/:id/run-sheet-context`, `/p/:project/review/:runId`, `/v/:persona`,
  `/voices/:id`. No app ERROR and no LB 5xx logged since `2026-10-03T07:07:00Z`.

### 8.3 — ADR-055 provocation: one real byte-read 5xx, traced end to end

Procedure (env misconfiguration, never a deployed fault route, reverted in-session):
`OBJECTS_BUCKET → rhema-prod-access-logs` — a bucket the api SA has **no** IAM grant on, so
`storage.objects.get` fails with a real GCS 403 (not a 404, which the store correctly
degrades to `null`). Window `2026-10-03T07:05:32Z → 07:06:03Z` (~31 s; revisions
`…-00076-zcv` → `…-00077-xhb`).

- **Request:** `GET /projects/…/review/…/dossier` at `07:06:01Z` → `500`,
  `requestId: a118d24a275d8da205c5d5b9f76bdc6d` (response body + `x-rhema-request-id`).
- **LB entry** `07:06:01.123Z` — `status:500`, trace `…/a118d24a275d8da205c5d5b9f76bdc6d`.
- **App line** `07:06:01.367Z` — `unhandled_route_error`, same requestId,
  `errorClass: GcsApiError`, route template; stack walks the NEW byte path end to end:
  `expectOk → download (gcs-bytes.js) → GcsContentStore.get (content-store-gcs.js) →
  dossier-routes.js → withTenant → PgPoolTxRunner.run`. (Note: `upstreamStatus` logs
  `null` — `GcsApiError` exposes `.code` not `.status` and `apiOnError` doesn't map it;
  errorClass + stack identify it unambiguously. Recorded as a polish observation, not a defect.)
- **Error Reporting group `CJquw_fM4JaNGw`** (firstSeen = the app line's timestamp).
- **Incident:** app leg opened `0.odduh8heam3x` at `07:09:04Z`; the LB-leg series was
  already in continuous violation from the regression window (incident `0.oddu1bax2o8m`,
  open since `06:49:42Z`) — Monitoring doesn't open a second incident on a firing series.
- **Revert verified:** `OBJECTS_BUCKET=rhema-prod-artifacts` on `…-00077-xhb`; dossier GET
  → **200**; `/healthz` → `3c3d7a7…`; `NODE_OPTIONS` absent.

### 8.4 — JOURNEY.1 nightly on the deployed SHA (D-OBS.1-3 → OPEN, evidenced)

`rhema-journeys --stage prod --expect-sha 3c3d7a7…` (the workflow's own CLI invocation —
the scheduled trigger lives on the default branch post-merge; reports
`docs/build/reports/2026-10-03_OBS.1-nightly/` + `-nightly-2/`, provenance **match**, $0).
Two full sweeps plus targeted retries, identical outcome:

- **10/12 free legs PASS** — N1, N2, N2.invite, N3, N7 (dossier!), R1, R5 (Showcase dup →
  export → download — the byte path), R7, C1 (claims parity), X1 — **every leg that
  exercises OBS.1's byte-read surface is green**. P1 `owed` (known UX.2 debt).
- **N4 FAIL (deterministic; NOT an OBS.1 regression).** `[data-credits-line]` never renders:
  the run sheet mounts ACT.1's `data-estimate-box data-included="true"` variant for
  trial-entitled fresh tenants (`5ce9d84` — "Included wins over a zero-balance sheet",
  deployed update 113 on 2026-10-02) while N4's selector still targets the pre-entitlement
  credits line. Latent-red since the ACT.1 deploy; this nightly is the first full sweep to
  exercise it. Owner: EST.1/ACT.1 reconciliation (selector must accept the Included variant).
- **N8 FAIL (environmental).** `ctx.freshUser` magic-link submit → **HTTP 429**
  (`POST /api/auth/sign-in/magic-link` — SEC.2's shared throttle) at `07:09:16Z`/`07:21:25Z`,
  exactly the failure timestamps; the "[role=status] link sent" element never renders.
  Three back-to-back harness sweeps (~20 signins/30 min from one IP) primed the limiter;
  the scheduled nightly (single run, CI IP) does not hit this. Standalone retry then failed
  honestly on substrate ("no reviewed-frozen head and no Showcase dossier on jrn-a" — leg B
  needs the earlier legs' seeds).
- **N9 FAIL (fixture drift, evidenced).** The BILL.3 fixture `sub_jrna_bill3_fixture`
  (tier `writer`, `past_due`, period 10-01→10-31, `renewal_failed_at=null`) sits on billing
  account `01M3V0VJ…` — jrn-a's workspace was re-provisioned `2026-10-02T15:07Z` onto billing
  account `01M3YJGDX…` (26h test-user purge). `billing/subscription` honestly resolves
  `tier:free` → the page gates `data-topup-form='topup_10'` (verified in the live HTML:
  `data-topup-gated`, `data-current-plan="free"`). Not a product defect; re-pointing the
  fixture is a prod-data write — outside this run's paused-area authorization.
- **D-OBS.1-3 stays OPEN**: the deferral's letter asks for a green nightly; every
  OBS.1-touch surface is green at provenance `3c3d7a7`, but the report carries the three
  non-OBS.1 reds above. Closes when the owners' substrates are repaired (EST.1 selector vs
  `data-included`; BILL.3 fixture re-point) and a clean sweep lands — or the first scheduled
  post-merge nightly passes.

### 8.5 — Listener-leak soak (D-OBS.1-2(a) → OPEN-partial, honest)

Window opened `2026-10-03T06:46:41Z`. Verification query (Cloud Logging, recorded per AC):

```
resource.type="cloud_run_revision"
  AND resource.labels.service_name="rhema-prod-api-e745ce0"
  AND timestamp>="2026-10-03T06:46:00Z"
  AND (textPayload:"MaxListenersExceededWarning" OR jsonPayload.msg:"MaxListenersExceededWarning")
```

**Result: 0 warnings** across the partial window (~45 min at write-up; includes SSE traffic
from the three journey sweeps — the disconnect shape that produced the bursts). The byte
path provocation additionally exercised the new transport under a real 403 retry. A full
24h window cannot complete in-session — the row stays **OPEN** with the query + start
timestamp recorded; closes at `2026-10-04T06:46:41Z` if the query stays empty (any operator
can run it — it is in the ledger).

### 8.6 — Post-Stage-B state

- Prod = chain tip `3c3d7a792487dbf4f74bbf5ad1c3b1498e40f752` on api+web (provenance PASS,
  `deployments` row recorded), worker/collab/run-task on the `obs1` digests — all via IaC.
- `NODE_OPTIONS` absent — prod is fully Pulumi-declared.
- Alert policy `1858034758162102112` fired live (5 incident opens across the window —
  recorded unnotified per BL-24); Error Reporting holds both new groups
  (`CJ2A2euuj5n0iQE` regression, `CJquw_fM4JaNGw` provoked byte-read).
- **OPEN FINDINGS for later tickets** (recorded, not owned by OBS.1): N4 selector vs
  `data-included` entitlement variant (EST.1/ACT.1); BILL.3 fixture subscription on the stale
  billing account `01M3V0VJ…` (jrn-a re-provisioned 2026-10-02; repair = prod-data write).

