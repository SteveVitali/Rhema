# OBS.1 — Observability: the api listener leak, structured error logs, 5xx reporting (run ledger)

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
