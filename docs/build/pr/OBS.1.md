# OBS.1 — Observability: the api listener leak, structured error logs, 5xx reporting

Ticket: `docs/tickets/74_OBS.1__observability.md` · run ledger: `docs/build/runs/OBS.1.md`
Stacks on `stevevitali/run-1-run-and-chat-defects` (PR #95). **DO NOT MERGE** — merge policy
OPERATOR. Stage B (deploy + prod evidence + 24h soak) is deferred per convention:
`D-OBS.1-1/2/3` OPEN in `docs/tickets/DEFERRALS.md`; `pulumi preview` prod is gate-clean.

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

Deferred to Stage B (DEFERRALS rows): deploy + provenance, the 24h zero-warning soak, the
ADR-055 traced-5xx leg, the JOURNEY.1 nightly on the deployed SHA.

## Requirement IDs

REQ-ARCH-13 (structured observability), REQ-ARCH-33 (no user text in logs/telemetry).
Ticket ACs: adding stack recorded (run ledger §1); fix at source w/o `setMaxListeners`;
request-id propagation web→api; exactly-one 5xx line; allowlist test; LB log-based metric +
AlertPolicy + tile; regression test.
