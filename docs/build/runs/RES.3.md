# RES.3 — Leg-1a zero-coverage diagnosis (run ledger)

- **Harness:** Devin CLI (subagent); model: SWE-2 High; tier: n/a (build work)
- **Spec:** `docs/tickets/96_RES.3__leg1a-zero-coverage-diagnosis.md` (manifest row 96, maintenance)
- **Base:** `stevevitali/maint-4-oauth-signin-throttle` @ `b7c7d95` (the chain tip)
- **Branch:** `stevevitali/res-3-leg1a-zero-coverage` (mergePolicy=OPERATOR — never merge)
- **Spend:** **$0** — SELECT-only queries via `scripts/live/funded-query.mjs` (`BEGIN READ ONLY`),
  Cloud Logging reads, no deploys, no prod writes, no paid legs. IAP tunnel `127.0.0.1:15432 →
  10.46.0.3:5432`, system role `postgres` (RLS bypass) — DSN composed in-shell, never written.

## Deferrals read

`docs/tickets/DEFERRALS.md` read at run start. This ticket absorbs the Leg-1a half of the
CITE.1 residuals (`D-CITE.1-2/-3` context); the funded-window evidence it depends on is
`docs/build/runs/FUNDED-2026-10-06-A.md` §B.4.

## The question

Leg-1a `fact_check` run `01M48VNKY6F263TCQRVBJ8JRQA` (workspace `01M48PTEXDMTTGCF1JMW4KDYX3`,
$8.45 metered) delivered **9/9 `unverifiable` claims, 0 `claim_sources` rows, null completeness**,
auto-refunded 165 cr under `platform_fault:zero_coverage`. FUNDED §B.4 recorded "6 search events
returned 0 results." Comparison run Leg-3 `01M48YYS50Z6CNX517RJQXRCJ2` (Quick/Base Review, same
workspace, ~30 min later) researched normally — 7/7 covered.

## Reconstruction — what actually happened

The `runs`/`run_events`/`fetch_log`/`claims` rows for both runs were reaped before this run
(partitions `run_events_20261006` + `run_events_internal` hold zero rows for either run id; the
workspace's `runs` rows are gone). The surviving record — `usage_records`, `credit_ledger`,
`proxy_allowlists`, `slo_samples`, Cloud Logging pod stdout — is sufficient and internally exact.

### Timeline (all 2026-10-06Z)

| Pod / exec | Window | Metered research (`usage_records`) | Harness/pod outcome |
|---|---|---|---|
| a1 · inventory | 15:00–15:03 | preflight probes (bypass class) | `00-claim-inventory.md` written, committed (9 claims) |
| a1 · verification exec 1 | 15:03:49–15:16:35 | **12 searches + 12 fetches** | `subtype=success`, 35 events — **zero Write calls**, `claimRowCount:0`, sidecar missing → oracle failed |
| a1 · verification exec 2 | 15:16:36–15:25:57 | **5 searches + 8 fetches** → searches **17/17 exhausted** | same — no Writes → pod `failed` |
| a2 · verification exec 1 | 15:31:41–15:36:22 | 0 searches (budget gone), **12 fetches** | `phaseResult=null`, no ledger → oracle failed |
| a2 · verification exec 2 | 15:36:31–15:40:04 | 0 searches, **7 fetches** → 39/48 | same → pod `failed` (0 phases committed) |
| a3 · verification exec 1 | 15:45:31–15:49:43 | 0 searches, **4 fetches** → 43/48 | same → oracle failed |
| a3 · verification exec 2 | 15:49:56–15:54:52 | 0 searches, **5 fetches** → **48/48 exhausted** at 15:51:08 | seat probed researchers + a general-purpose agent (all tool-less), wrote the honest ledger: `claimRowCount:9`, sidecar valid → **delivered** |

### The budget math is exact — this is the smoking gun

`authorWebToolPolicy` (`packages/orchestrator/src/allowlist.ts`) claim-scales the run's per-run
research bounds: `searchBudget = 8 + 1×claims`, `fetchBudget = 12 + 4×claims`. The inventory
committed **9 claims** → `searchBudget = 17`, `fetchBudget = 48`. `usage_records` shows the run
billed **exactly 17 searches and exactly 48 fetches** — both bounds consumed to the unit. After
attempt 1, `ensureServerWebTools` (`apps/egress-proxy/src/url-policy.ts`) computed
`searchRemaining ≤ 0` and dropped `web_search` from every subsequent request; `web_fetch` followed
at the 48th fetch (15:51:08). The final exec's phase note — "no web_search/web_fetch tool was
reachable by any agent in this session (confirmed via three independent subagent probes)" — is
literally true for that session: the proxy had removed both tools.

### Tools worked on attempt 1 — the model never persisted the artifact

- The billed calls carried real content: the 15:05:54 researcher call shows 24,834 input tokens
  (prior search results in-context); the 15:08:37 seat call shows 313,753 input + 616,880
  cache-read tokens (a transcript full of fetched pages, not ~50-token error stubs); subagent
  outputs ran 3,359–6,205 tokens (substantive research memos).
- The pod's `[hook]` log for execs 1–4 shows `Agent allow researcher` spawns and **not one Write
  call** — the seat composed long final responses (outputs of 10,549 / 16,744 / 19,423 tokens)
  and ended each turn `subtype=success` without writing `01-claim-ledger.{md,json}`.
- Attempt 3 exec 2 shows the seat eventually *misplacing* the write:
  `Write deny /work/project/correspondence/v1-review/01-claim-ledger.md — write to a read-only
  path` (15:53:36) → corrected to `agents/editor/correspondence/...` (15:53:42) → sidecar written
  (15:54:35) → `done`.

### The "6 empty search events" were fabricated telemetry — fixed here

`run_events` `search.performed.resultCount` is populated only when a `tool_result` message
resolves the pending `tool_use` — and the proxy-injected **server** `web_search` (the only search
path since P0.15i dropped the client tool) returns results inline as `web_search_tool_result`
blocks, never as `tool_result`. Every pending search therefore flushed with `resultCount: 0` —
indistinguishable from a real empty result set. Proof it is structural, not real: every
`search.performed` in retained history carries `resultCount=0`, including
`01M36663QG1ZJ7VEZ036Y54NSG` (4 events, **27 billed searches**) and `01M3SK62YZST272B35CG12K6TW`
(the RES.1 incident's "test search" row, **28 billed searches**). The 6 Leg-1a events were the
same artifact — they record that six search calls happened, not that they returned nothing.

## Root cause (contract §2)

**None of the six candidate mechanisms is the cause — all are ruled out by positive evidence:**

- *egress-proxy deny/path failure* — no denies; three clean allowlists (`api.anthropic.com /v1/`,
  models sonnet-5 + haiku-4-5, `blockedDomains: []`); calls admitted, metered, billed.
- *credential mint/revocation failure* — `slo_samples` `admit_mint` 61/45/33 ms across all three
  attempts; three `proxy_allowlists` rows minted cleanly.
- *search-provider outage/error swallowed* — preflight probes passed on all three attempts
  (bypass class, real `web_fetch`); Leg-3 succeeded minutes later on the same proxy/provider;
  attempt-1 results demonstrably carried content (token evidence above).
- *empty claim extraction* — 9 claims inventoried and persisted in the final ledger.
- *`claim_sources` persistence defect* — nothing to persist: all-unverifiable rows carry no URLs
  (protocol §6), and Leg-3 wrote 7 rows through the same path.
- *phase race* — execs were strictly sequential; no overlap in the metered rows or pod logs.

**The mechanism:** the verification seat researched successfully on attempt 1 but never wrote its
`01-claim-ledger` artifact (zero Write calls; a protocol-compliance failure — the seat's plan
ended with findings in-context). Each in-pod retry and each stranded-queue re-drive (`run.start`/
`run.resume`, §12.4 resumability) re-executed the phase with a **fresh session and no checkpointed
ledger** against the **same claim-scaled per-run research budget** — the RES.1 incident class in
its sequential-retry shape. By the fifth execution both budgets were exhausted; the proxy
correctly stripped the tools; the seat honestly wrote 9/9 `unverifiable` per verification-protocol
§6; delivery carried null completeness because no cited URLs existed. This is the designed honest
terminal state — the defect is *how much budget was burned getting there* and *that the seat never
persisted its work*.

## Truthfulness check (ADR-021/022/023)

`credit_ledger` (survives reaping) shows the refund behaved exactly as designed:

- `settleUnverifiedDelivery` (`packages/ledger/src/unverified-settle.ts`) refunded the
  research-class phase debits only: 97 trial + 10 daily + 58 promo = **165 cr**, reason
  `platform_fault:zero_coverage` — correct label, correct phase scope.
- The inventory phase's 53 cr was correctly NOT auto-refunded (non-research phase) — it is the
  residual the funded walk showed on the dossier CTA ("Get 53 cr back").
- `absorbMeteredGap` booked the unmetered burn as platform COGS (the 814 + 165 `absorbed`
  adjustment rows) — metered spend is accounted, not lost.
- No double-refund, no mislabel, no accounting defect. The label tells the truth: the run could
  not *show* research coverage, so the research phase was refunded.

## What shipped (the contained fix)

`search.performed.resultCount` now reports the truth:

- `packages/contracts/src/events.ts` — `resultCount: z.number().int().nullable()` (null = "the
  search ran; its result-set size was never observable in the mapped stream").
- `packages/engine/src/mapper/tool-results.ts` — `extractSearchResultCount` returns
  `number | null`; a missing count field no longer fabricates `0`.
- `packages/engine/src/mapper/mapper.ts` — `flush()` emits `resultCount: null` for pending
  (server-side) searches; the query stays as evidence, the false count is gone.
- `mapper.test.ts` — 4 regression tests: unresolved server search → `null`; count-less result
  envelope → `null`; real `result_count: 0` → `0`; real count → passes through.

Consumers verified safe: `apps/web` renders `{query}` only; `findings-core` excludes the event
type from card inputs (REQ-IDE-11); `assistant` counts occurrences, never the field.

## What was deferred — `D-RES.3-1` + `BL-79`

The architectural half does not fit this PR: verification re-executions re-burn the run's
research budget with fresh sessions and no artifact checkpointing, and the seat's failure to
write the ledger (4 consecutive execs with working tools, zero Write calls) is a
protocol/compliance gap that needs transcript-level evidence the reaped run can no longer
provide. Fix sketch in the DEFERRALS row: (a) protocol change — the ledger skeleton is written
*before* research and updated per claim so a clipped/exec-dead phase still commits partial
coverage; (b) a budget-aware retry gate — the harness/orchestrator stops re-running research
phases when `usage_records` shows the claim-scaled bound spent, terminalizing with a distinct
`research_budget_exhausted` reason rather than burning $8.45 to reach honest `zero_coverage`.

## Queries run (SELECT-only; system role; workspace/run predicates on every read)

- `information_schema.columns` — schema for `runs`, `run_events`, `fetch_log`, `claims`,
  `claim_sources`, `usage_records`, `credit_ledger`, `proxy_allowlists`, `slo_samples`;
  partition inventory (`run_events_2026*`, `run_events_internal`, `fetch_log` — unpartitioned).
- `usage_records` by `run_id`/`phase_class`/`attempt` — per-call searches/fetches/token shapes;
  aggregates: Leg-1a research 138 calls / 17s / 48f; preflight 12 calls / 6s / 6f; Leg-3 12s/4f.
- `credit_ledger` by `run_id` — holds/debits/release/refunds/adjustments (refund math above).
- `proxy_allowlists`, `slo_samples` by `run_id` — mint/admit latency, endpoint/model policy.
- `run_events*` + `run_events_internal` by `run_id`/`workspace_id` — zero rows (reaped);
  `search.performed` corpus-wide `resultCount` distribution — all 5 retained events `0` while
  their runs billed 27–28 searches (the structural proof).
- `claims`/`claim_sources`/`correspondence_items` — reaped for both runs (no rows).
- Cloud Logging: `k8s_container`/`namespace=runs` pod stdout for all three Leg-1a pods + Leg-3 —
  `[harness]` phase evals (`claimRowCount`, `sidecarValidates`, `/work files`), `[agent-entry]`
  subtypes + event counts, `[hook]` tool-gate allow/deny lines (the Write path misses above).

## Dead ends / residual uncertainty

- Pod transcripts are unrecoverable: `sessionStore:{kind:"gcs"}` is **advisory, not applied**
  (options.ts F5) — sessions die with the pod. *Why* the seat ended `success` without writing on
  execs 1–4 is therefore not provable from inside; the behavioral evidence (research executed,
  content flowed, zero Write calls, eventual wrong-path write) stands.
- `fetch_log` rows for both runs were reaped with the `runs` rows; Leg-3's completeness was
  computed from them at delivery, so the write path is exonerated.

## Verify

- `pnpm exec vitest run packages/engine/src/mapper` — **40/40** (incl. 4 new regression tests)
- `vitest packages/contracts packages/engine sse-routes event-stream` — **407/407**
- `pnpm turbo build lint typecheck` — **135/135**
- `check-build-memory.sh .` / `check-append-only.mjs --base b7c7d95` — recorded below
- Spend: **$0**; zero prod writes; zero deploys; mergePolicy OPERATOR.
