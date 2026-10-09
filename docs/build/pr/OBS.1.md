# OBS.1 — Observability: the api listener leak, structured error logs, 5xx reporting

Ticket: `docs/tickets/74_OBS.1__observability.md` · run ledger: `docs/build/runs/OBS.1.md`
Stacks on `stevevitali/run-1-run-and-chat-defects` (PR #95). **DO NOT MERGE** — merge policy
OPERATOR. **Stage B executed 2026-10-03 under the standing ADR-013 authorization**:
deployed to prod at tip `3c3d7a7` (provenance PASS on api+web `/healthz`, `deployments` row
recorded); the deploy's own defect (`instrumentReads` proxying `contentStoreFor`'s Promise)
was caught live by this PR's own error line + both alert legs within ~3 min, fixed, and
redeployed; the ADR-055 byte-read 5xx is traced end to end; the 24h soak is honestly
partial (`D-OBS.1-2/3` remain OPEN — evidence + close conditions in the run ledger §8).

## Summary

> Every user-visible 5xx on prod leaves a trail an operator can follow from the load balancer
> to the line of code, and nothing in that trail carries user text.

- **The `MaxListenersExceededWarning` leak — found, reproduced, fixed at the root.**
  Prod bursts (`11 close/error listeners added to [PassThrough]`, correlated with SSE
  disconnects) reproduce deterministically against the real `@google-cloud/storage` byte path
  (`docs/build/logs/obs1-leak-repro3.mjs`): the victim emitter is `node-fetch@3`'s `res.body`
  PassThrough; the adding stack is `pipelineImpl ← teeny-request/build/src/index.js:194` (with
  a second pipeline at `storage file.js:1119`). Three libraries stack `pipeline()`/eos listener
  sets on that one emitter; a consumer abort raced against the response throws
  `ERR_STREAM_UNABLE_TO_PIPE` after the destroyer listeners are already attached, and retries
  pile on more. **Fix:** `packages/contracts/src/gcs-bytes.ts` — a plain-`fetch` GCS JSON-API
  byte transport (download/save/delete; ADC via `authClient.getRequestHeaders`; bounded retry +
  one 401-refresh retry; `ifGenerationMatch` preserved) wired into every live binding:
  `createGcsContentStore`, `createGcsRestoreBlobStore`, `createGcsObjects`, and collab
  `liveDeps`. Zero node streams ⇒ no shared emitter. **No `setMaxListeners` anywhere.**
  Post-fix evidence (`docs/build/logs/obs1-leak-fixed.mjs`): 545 ops, 0 warnings, 0
  PassThroughs under the same retry/abort storm. Regression: `gcs-bytes.test.ts` instruments
  `EventEmitter.on/once` — fails if the byte path ever goes through a streaming client again.

- **Request/trace identity end to end.** `x-cloud-trace-context` → `traceparent` → sanitized
  `x-rhema-request-id` → minted UUID (contracts `observability.ts`). The id is echoed on every
  response; the web forwards its resolved id to the api (and refuses a browser-supplied one);
  `logging.googleapis.com/trace` joins every request-scoped line to the LB trace.

- **Exactly one structured error line per user-visible 5xx (ADR-053).** API `onError` + a
  fallback sweep (any ≥500 response not already logged — the integration probe's bare-500s now
  each emit `unlogged_5xx_response`); web `onError` + sweep; non-`Error` throws normalized so a
  thrown non-Error can no longer produce the silent bare-500 that motivated this ticket. The
  formatter is an explicit allowlist — route **template** (`c.req.routePath`), never raw paths;
  no message text, bodies, queries, cookies, tokens, webhook URLs, or prompt text. Degraded
  (non-5xx) swallowed reads emit WARNING `degraded_reads` with a per-request count instead.

- **Monitoring (ADR-054).** `rhema_lb_5xx_requests` over `http_load_balancer` request logs
  (`httpRequest.status>=500`, labels backend_service/status — the ticket-specified metric) +
  `rhema_route_5xx_errors` over `cloud_run_revision` structured lines (labels
  service/route/status/msg — `requestId` excluded for cardinality) + an AlertPolicy that fires
  on any occurrence (5-min align, 30-min auto-close, ops webhook channel) + a dashboard tile.

- **ADR-055** — the one required prod 5xx is provoked by env-misconfiguring `OBJECTS_BUCKET`
  for a single request window and reverting in-session, never by a deployed fault route.

## Verification

| gate | result |
|---|---|
| `pnpm turbo build lint typecheck` | 135/135 |
| `pnpm test` | 429 files / 4,223 pass / 0 fail |
| `infra/pulumi` tsc + monitoring.test.ts | green (8/8) |
| listener regression + before/after repros | pass (details above) |
| `pulumi preview` prod | **+3 create / ~8 update / 0 replace / 0 delete**, ≈$0 delta ≤$15 |

## Stage B (2026-10-03, live — run ledger §8 has the full evidence + queries)

- **Deploy:** Cloud Build `a7834719` (`obs1`, `0db8910`) → `pulumi up` **125** (+1/≈8/0/0)
  → provenance PASS; a live regression surfaced by *this* observability (proxy-of-Promise on
  `contentStoreFor` → `TypeError at Proxy.then` → every byte-read route 500'd) → fix
  `3c3d7a7` + hotfix build `1becb534` → `pulumi up` **126** → provenance PASS `3c3d7a7…` →
  `deployments` row → dossier 200. Prod is fully IaC-declared (`NODE_OPTIONS` gone).
- **Traced 5xx × 2:** the organic regression 500 — LB `trace:…/72e73c4710…` → app
  `unhandled_route_error` (same requestId, route template) → Error Reporting `CJ2A2euuj5n0iQE`
  → incidents `0.oddu1bax2o8m`+`0.oddu1bax2o8k` (both OR-legs of the fire-on-any policy);
  and the ADR-055 byte-read provocation (`OBJECTS_BUCKET`→denied bucket, ~31 s) — requestId
  `a118d24a275d8da…` → `GcsApiError` line walking `gcs-bytes→GcsContentStore→dossier` →
  group `CJquw_fM4JaNGw` → incident `0.odduh8heam3x` → reverted + verified.
- **Journeys** on `3c3d7a7`: 10/12 free legs PASS incl. every byte-read surface
  (N7 dossier, R5 export, C1 claims); N4/N8/N9 fail for root-caused non-OBS.1 reasons
  (selector-vs-`data-included` drift; magic-link 429 under stacked sweeps; fixture sub on a
  stale billing account) — D-OBS.1-3 OPEN.
- **Soak:** opened `2026-10-03T06:46:41Z`; the recorded query returns **0
  `MaxListenersExceededWarning`** through the partial window — 24h leg stays OPEN
  (D-OBS.1-2) with the close-out condition documented.

## Requirement IDs

REQ-ARCH-13 (structured observability), REQ-ARCH-33 (no user text in logs/telemetry).
Ticket ACs: adding stack recorded (run ledger §1); fix at source w/o `setMaxListeners`;
request-id propagation web→api; exactly-one 5xx line; allowlist test; LB log-based metric +
AlertPolicy + tile; regression test.
