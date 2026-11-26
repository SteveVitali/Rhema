# Run ledger — 337_R6FIX.55 (research-budget transient-read retry + driverTags)

Harness: devin-cli/swe-2-high (direct implementation, no subagent — small surgical fix)

- 2026-11-26 — Surfaced by the R6FIX.54 post-fix prod error sweep: 12 `unhandled_route_error`
  entries on `GET /internal/runs/:id/research-budget`, 11-24T17:05Z → 11-25T03:43Z (quiescent
  since; cadence matches funded-window run activity — the run-task's retry gate consults the
  route before re-executing a research phase, and degrades to `null` honestly on non-2xx).
  The logged error is a pg `DatabaseError` — `errorClass:"error"` (pg sets name `'error'`),
  stack re-rooted at `client.js:694` (`Error.captureStackTrace` in the query promise). The
  line carries NO SQLSTATE: `stackForLog` strips the message by design (user-text-safe) and
  `RouteErrorFields` never emitted the bounded driver tags `errorSummary` already extracts —
  so the failure class was undiagnosable from logs alone.
- 2026-11-26 — Two arms on `stevenvitali/r6fix-55-research-budget`:
  (a) `driverTagsForLog(err)` + `RouteErrorFields.driverTags` — the `ERROR_TAG_FIELDS`
  allowlist (`code`/`constraint`/`routine`/`syscall`) emitted on the route error line,
  re-validated at the `formatRouteErrorLine` seam (`/^[\w .=$-]{1,200}$/`) so a hostile or
  message-bearing value can never reach the field;
  (b) `isTransientDbReadError` (SQLSTATE `08xxx`, `57P01`, `40001`/`40P01`, node
  `ECONNRESET`/`ETIMEDOUT`/`EPIPE`) + one guided retry in `researchBudgetState` — the
  consult's two tenant reads are pure SELECTs, so a single retry is correctness-free.
- Verify: `research-budget.test.ts` 4 new legs (class predicate · retry-once · non-transient
  propagates · transient-twice propagates) · contracts `observability.test.ts` driverTags
  legs (emit/absent/hostile-drop) — 32/32 green · turbo build + typecheck + lint green on
  contracts/orchestrator/api.
- Live datum: recurrence-rate on the deployed tip — the `driverTags`-enriched line names the
  next occurrence's SQLSTATE; watch Cloud Logging post-deploy.
