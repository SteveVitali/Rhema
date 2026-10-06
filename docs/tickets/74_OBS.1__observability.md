# OBS.1 — Observability: the api listener leak, structured error logs, 5xx reporting

- **Sequence:** 74 (round 3) · **Phase:** round 3 — launch readiness · **Kind:** ticket · **Tag:** ops
- **base_branch:** current checkout (the chain tip the previous round-3 row left; stacked PR)
- **Depends on:** RUN.1, HOT.1
- **Scope (one line):** root-cause and fix the api's continuous `MaxListenersExceededWarning: 11 close/error listeners added to [PassThrough]`; give every unhandled or 5xx route error in api and web one structured log line with a request/trace id and no user or prompt text; add 5xx error reporting and alerting on top of HOT.1's LB request logs.
- **Spec §§:** 13.5 (observability: OTel, trace context, "traces carry ids and counts only"; SLO table), 8.4 (REQ-VIS-11), 12.5 (SSE route, REQ-ARCH-13), 13.3 (secrets and logs)
- **REQ coverage:** REQ-VIS-11, REQ-ARCH-13 (instrumentation half — the stream-route hygiene and the request/trace ids SLO.1's probes consume; the target is SLO.1's) (stamp in the PR)
- **Absorbs (backlog):** BL-65 (PR-O2; PR-O3 reporting half — O1 and LB logging are HOT.1's)
- **Run:** `implement-spec spec=docs/tickets/74_OBS.1__observability.md`
- **Gate status:** none beyond the round-3 standing authorization (ADR-013). `pulumi up prod` of the new log metrics and alert policies is pre-authorized when the preview shows zero stateful replace/delete and a delta ≤ $15/month. **Paging** needs an operator channel: prod has no `rhema:opsAlertWebhookUrl` configured (re-confirm), so the page itself is H7's "launch-verification remainder" (BL-24). Until then, alerts record incidents unnotified.
- **Live stage:** Stage A: code + tests ($0). Stage B: deploy plus log/incident evidence on prod ($0, no inference).

## Goal
Every user-visible 5xx on prod leaves a trail that an operator can follow from the load balancer to the line of
code, and nothing in that trail carries user text. The live review saw:
- a chat 502 with **no** log line anywhere (PR-O3; RUN.1 fixes the chat path itself)
- a continuous listener-leak warning on the api (PR-O2)

The code shows why errors vanish:
- `apps/web/src/server.ts` has ~56 `.catch(() => null)` sites and ~12 bare `502` returns that log nothing
- web's `app.onError` (~224–228) logs a stack with no request id
- the api's `createApp` (`apps/api/src/index.ts` ~251) has **no** `onError` at all
- neither service reads or propagates a request/trace id

HOT.1 turned LB request logging on. This ticket makes those entries joinable to app logs and turns 5xx into
reported, alertable errors. SLO.1 consumes the structured logging (shared-decision owner: OBS.1).

## Load (read these — do not re-read others)
- Spec §13.5 (the observability paragraph and the SLO table), §8.4 transparency floor (REQ-VIS-11), §12.5
  (SSE: no buffering on the route, `: ping` cadence)
- `apps/api/src/server.ts` (bootstrap, `serve()` ~386–398, error listeners ~60–70), `apps/api/src/index.ts` `createApp`
  ~251–275 (middleware order), `apps/api/src/sse-routes.ts` ~95–140 (ReadableStream + `onFlush`)
- `packages/mirror/src/content-store-gcs.ts` ~40–50 and `packages/mirror/src/restore.ts` ~155–165
  (`file.download()`); `@hono/node-server` 2.1.1 response streaming (the PassThrough candidates)
- `apps/web/src/server.ts` ~170–230 (CSP stamp, `onError`) and the chat routes ~437–520 (RUN.1's pattern to
  generalise); `apps/web/src/data.ts` `ApiError`
- `infra/pulumi/monitoring.ts` (the log-metric → AlertPolicy pattern, the webhook channel), `infra/pulumi/network.ts`
  ~95 (backend `logConfig`, which HOT.1 changes)
- HOT.1's run ledger (`docs/build/runs/HOT.1.md`) for the LB logging shape it shipped

## In scope — deliverables
1. **Listener leak root cause** (PR-O2; REQ-ARCH-13 route half).
   - Reproduce with `--trace-warnings`, locally under a request loop or on a non-prod stage, to get the adding
     stack.
   - Candidates:
     - the GCS `file.download()` path in the content store
     - the SSE `ReadableStream` through `@hono/node-server`
     - a per-request stream reused across retries
   - Fix at the root: never raise `setMaxListeners` to silence it. Add a regression test that runs N requests on
     the leaking path and asserts a bounded listener count.
2. **Request/trace ids** (§13.5 trace context).
   - Both web and api read the LB's trace header (`x-cloud-trace-context` / `traceparent`) or mint one.
   - web → api calls forward it (`packages/api-client`).
   - Every log line from a request carries it, in the Cloud Logging trace field, so LB entries and app entries
     join.
   - Error responses carry the id (a header, and the web 500 page shows a short "reference" string) so support
     can find the trail.
3. **Structured error logging** (REQ-VIS-11).
   - One JSON line per unhandled error or 5xx. Fields: severity, service, route **template** (not the raw path —
     slugs are user-chosen), method, status, upstream status where one exists, request id, and error class plus
     stack.
   - The api gains an `onError` (a JSON 500, logged); web's `onError` gains the fields.
   - A shared formatter enforces an allowlist of fields. Request bodies, query strings, message and prompt text,
     and `ApiError` bodies are never logged.
4. **Swallowed errors surfaced.** Every web/api path that turns a failure into a 5xx logs exactly one structured
   line (the RUN.1 chat pattern, generalised). A best-effort read that degrades a page without a 5xx stays quiet
   but increments a counter. The run ledger lists each site audited and its disposition.
5. **5xx reporting and alerting.**
   - Errors reach Cloud Error Reporting: structured lines shaped for ingestion, grouped by error class and route.
   - A log-based metric over HOT.1's LB request logs (`httpRequest.status>=500`, labelled by backend service).
   - An AlertPolicy (threshold and window: owned decision) on the existing ops webhook channel.
   - A dashboard tile beside the §13.5 SLO dashboard.
   - All as code in `infra/pulumi/monitoring.ts`.
6. **Tests.**
   - formatter allowlist: a test fails if a message/body field appears
   - request-id propagation web→api
   - the api `onError` shape
   - the leak regression
   - a monitoring unit test pinning the metric filter and label extractor, in the `proxy.test.ts` style
7. **Stage B.** `pulumi preview` (new metrics/policies only; zero stateful replace/delete), then deploy. On prod:
   - the api emits no `MaxListenersExceededWarning` for 24 h under organic traffic
   - one 5xx is traced end to end: LB entry → app line with the same trace → Error Reporting group → incident
     recorded
   - the nightly JOURNEY.1 run stays green after the deploy

## Out of scope
- The chat 502's own root cause and error mapping: **RUN.1**.
- LB request logging, and the digest `runs.finished_at` query (PR-O1): **HOT.1**.
- SLO probe definitions and targets, and the weekly SLO review: **SLO.1**.
- Paging a human on the ops channel, and the canary pause smoke: **HUMAN-H7** (BL-24).
- A full OTel collector sidecar and Langfuse: not in round 3. §13.5 names them; the ids here are the seam they
  attach to.

## Acceptance criteria
- [ ] The listener leak's adding stack is recorded in the run ledger; the fix removes it at the source; a
      regression test fails on the pre-fix code; `setMaxListeners` is not raised anywhere to silence
      it. *(deterministic)*
- [ ] web and api attach a request/trace id from the LB header (or mint one), forward it web→api, and write it into
      every request-scoped log line in the Cloud Logging trace field. *(deterministic)*
- [ ] Every 5xx from web or api produces exactly one structured error line; the api has an `onError`; tests
      cover the chat-style swallowed path, an unhandled throw, and an upstream 5xx. *(deterministic)*
- [ ] The log formatter admits only allowlisted fields. A test that feeds it a request carrying message text, a
      body, a query string and an `ApiError` body proves that none of them reaches the output
      (REQ-VIS-11). *(deterministic)*
- [ ] `infra/pulumi` typechecks. The preview shows only the new metric, policy and dashboard changes (zero
      stateful replace/delete; ≤ $15/month), and a unit test pins the 5xx metric filter. *(deterministic)*
- [ ] Prod, after deploy:
      - no `MaxListenersExceededWarning` in api logs over 24 h
      - one 5xx followed from the LB log entry to its app line (same trace id) to its Error Reporting group and
        a recorded incident
      - the queries are recorded in the run ledger *(agentic)*
- [ ] The nightly JOURNEY.1 run is green on the deployed SHA (no user surface regressed), and deployed
      provenance equals this ticket's chain-tip SHA (REQ-SPEC-29). *(agentic)*
- [ ] verification green; every new behaviour has a test that fails if it is removed; requirement ids stamped in the PR; anything not automatically verifiable is a `DEFERRALS.md` row with its compensating control; ADRs written for every deviation and owned decision; `BUILD_INDEX.md` row and `LEDGER.md` advanced. *(agentic — the universal phase-gate AC)*

## Requirement IDs to satisfy and stamp in the PR
REQ-VIS-11, REQ-ARCH-13 (instrumentation half); REQ-SPEC-29 (provenance).

## Cross-cutting invariants
- 00_MANIFEST invariant **10** (telemetry never carries prompt text, raw page text or private memory:
  REQ-DATA-37, REQ-VIS-11, REQ-ARCH-14). This ticket's formatter enforces it for logs.
- Invariant **3** (no protocol text in client bundles, OpenAPI or events): error lines never echo skill text.
- AGENTS.md § Secrets (REQ-ARCH-30): no secret, token, cookie or webhook URL ever appears in a log line. The
  webhook stays a Pulumi secret.
- **13 / REQ-SPEC-30**: log lines carry workspace ids only as opaque ids, and the system pool is not used to
  enrich a user-request log.
- **12 / REQ-SPEC-29**: provenance at close; the journey is regression evidence.
- **14 / REQ-SPEC-32**: not touched.

## Notes
- **Owned decisions (write an ADR):**
  - (1) the log-field allowlist and the route-template rule
  - (2) the 5xx alert threshold and window. Start from the §13.5 availability budget: an alert on error-budget
    burn > 2× is the spec's rule for the api, and this adds the LB view.
  - (3) the safe way to provoke a prod 5xx for the Stage B trace. Never a user-data write, and never a route
    that stays deployed. Alternatively, wait for the first organic 5xx.
- **Consumed:**
  - HOT.1: the LB request logs (their sample rate and fields)
  - RUN.1: the chat error-path pattern
- **Provided (shared decision):** structured error logging, which SLO.1 consumes.
- **Anchors to re-confirm at build time:**
  - `apps/web/src/server.ts` ~224–228 (`onError`) and the `.catch(() => null)` count (~56) / bare `502`s (~12)
  - `apps/api/src/index.ts` ~251
  - `apps/api/src/server.ts` ~386–398
  - `apps/api/src/sse-routes.ts` ~105–140
  - `content-store-gcs.ts` ~46
  - `restore.ts` ~160
  - `monitoring.ts` ~55–110
  - `network.ts` ~95
- **DEFERRALS:**
  - An incident that cannot page (no channel) is recorded under H7 BL-24's DEFERRALS rule, not as a failure.
  - A leak that reproduces only under prod traffic stays `D-OBS.1-<n>`, with the trace-warnings evidence plan as
    its compensating control.
