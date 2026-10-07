# RES.1 — Review research restore (run ledger)

## Spec / Base / Branch / Config

- **Spec:** `docs/tickets/63_RES.1__review-research-restore.md` (sequence 63, round 3) — diagnose and fix
  `web_search` never reaching the model on the 2026-09-30 Quick/Base Review `01M3SK62YZST272B35CG12K6TW`
  (BL-56 / PR-Q1); research floor (REQ-SPEC-31(2)); preflight every model × server-tool pair before any
  debit (REQ-SPEC-31(1)); ≤ $1 single-phase probe; owns journey step N6 (REQ-SPEC-29).
- **Base:** `stevevitali/maint-2-build-memory-hygiene` @ `30ff7e3` (chain tip; MAINT.2 PR unmerged).
- **Branch:** `stevevitali/res-1-review-research-restore` — stacked PR, `mergePolicy=OPERATOR`, never
  merged by the worker.
- **Mode:** `implement-spec`, committed build-memory (ADR-004). Ledger = this file.
- **Harness:** Devin CLI (Cognition agentic coding CLI), Anthropic Claude, interactive subagent session.
- **Spend cap:** Stage B ≤ **$10 metered** (amended 2026-09-30; was ≤ $15), aim ≈ $5, cheapest-first,
  dropped legs recorded as `D-RES.1-<n>`.

## Gate status (copied from LEDGER GATE DECISIONS — first commit carries this)

- **D6-revised (2026-09-30):** round-3 spend envelope hard ≤ $200 / target ≤ $100; deploy + paid legs
  under the standing authorization (ADR-013). Stage B deploy only after `pulumi preview` shows zero
  replace/delete on stateful resources.
- Standing: PRs stack and stay operator-held; secrets never enter a ledger or report; no protocol/skill
  text edits (fix orchestration/proxy/sanctioned inputs only — REQ-SPEC-22).

## Deferrals read

`docs/tickets/DEFERRALS.md` read at run start (AGENTS.md rule). No `OPEN` row is unblocked by RES.1:
D-P0.03-2 (sidecar-absent leg) stays with STB.4; D-P1.21-2 (memo user_sources run), D-SEC.1-2 (H7),
D-DEF.2-1/D-DEF.3-2 and the evals/benchmark rows are all owned elsewhere. RES.1 appends `D-RES.1-<n>`
rows for any leg the $10 cap cuts.

## Requirements (extracted)

1. **Root-cause diagnosis, read-only prod ($0)** — fetch_log / usage_records / credential context /
   deployed digests for `01M3SK62…` + the 09-26 STB.3 Memo run; verdict on hypotheses (a)–(d); write-up
   here + a regression test from the observed request shape that is red on pre-fix code.
2. **The fix at the root** (orchestration/proxy/sanctioned inputs — never ported skill text) + that test.
3. **Research floor** (REQ-SPEC-31(2)): verification's share of search/fetch budget reserved against
   earlier phases and subagents; one pure exported sizing function from (claims checked, rigor); proxy
   enforced; a named guard test fails if the floor is lowered; decide tracker durability. **ADR.**
4. **Preflight** (REQ-SPEC-31(1)): at harness start of a research-bearing run, before the first phase
   commit; every `rosterModelIds(tier)` model × every enabled server tool, through the run's own proxy
   credential; pass only on a real `web_search_tool_result`/`web_fetch_tool_result` block; failure →
   run `failed`/`research_preflight_failed`, zero debit rows, hold released, probe burn absorbed, one
   ops alert (ids only). Resume re-preflights. **ADR.**
5. **≤ $1 single-phase probe** on the planted-error fixture: verification through the real proxy path
   (ensureServerWebTools + URL policy + budget + floor) on both models of the tier; asserts ≥1 search
   result, ≥1 fetch_log fetch row, *Contradicted* verdict with a fetched source; recorded-response
   deterministic twin in CI at $0. **ADR (fixture shape).**
6. **Stage B** ≤ $10: deploy (preview clean, additive migrations), ≤3 probes (≤$3), N6 Quick/Base Review
   on the planted-error essay via JOURNEY.1 (≤$7), one Standard/Base excerpt Review (≤$5); per-leg spend.

## Root-cause diagnosis (deliverable 1 — prod evidence, read-only)

Evidence pulled 2026-10-01 against prod (`postgres@127.0.0.1:15432`, read-only txn) for run
`01M3SK62YZST272B35CG12K6TW` (review · base · **quick** · `claimCount=4` → `searchBudget=12`,
`fetchBudget=28`; attempts 1–2; 632 credits spent of cap 1523):

- **usage_records timeline (attempt 2, `source=proxy`):** all Sonnet main-context rows carry
  `searches=0`/`fetches=0` until `16:57:59.895Z`, when four Haiku subagent rows land inside ~6 s with
  `searches` **4, 7, 8, 9 = 28 total** (fetches 1+1+1=3). `searchBudget` was **12** — the burst overshot
  the run budget by 2.3× in a single wave. Haiku fetch rows then land `17:00:24`–`17:01:25`
  (3+3+5+6+3+3=23 → cumulative 26), and one Sonnet row at `17:03:10.618Z` reports `fetches=2` → cumulative
  **28 = fetchBudget exactly**. Every one of the ~120 usage rows after `17:03:10Z` (≈17 minutes: rest of
  verification, discourse, second_read, argument, letter) reports `searches=0, fetches=0`.
- **fetch_log:** the burst logged real search/fetch `allow` rows from response blocks (16:57:59.968+).
  At `17:05:22.207Z` a `kind=search decision=allow query="test search"` row was logged against the Haiku
  usage row (`17:05:22.203Z`, `searches=0`) — the model emitted a `tool_use`-shaped `web_search` call that
  **never executed** (usage `server_tool_use.web_search_requests=0`), yet the SSE extractor
  (`extractResponseServerToolsSse` accepts plain `tool_use`) logged it as an allowed search.
- **steps:** verification (ordinal 2) committed 17:04:19 — i.e. the burst was verification's own research
  fan-out; **discourse** (ordinal 3, also `phaseClass:"research"`) ran 17:04–17:07 entirely tool-less.
- **credential context:** `webTools` present on BOTH attempts (`{search:true, fetch:true,
  searchBudget:12, fetchBudget:28, fetchMaxContentTokens:8000}`) — hypothesis (d) refuted.
- **deployed digests:** the incident ran proxy image `f3423b8c9` (deploy `86441d6c`, 09-26T18:48Z); the
  09-26 STB.3 memo review ran `cf779cd54` (deploy `f3c7e135`). `git diff f3c7e13..86441d6` on
  `apps/egress-proxy` touches only `cap.ts`, `context.ts`, `handler.ts` (meterOnly + meter-before-tail
  ordering) — **`url-policy.ts`/`outbound-limits.ts` (the whole budget/drop machinery) unchanged** —
  hypothesis (b) refuted at the proxy (the bound was live since PRB.22 on 09-22; the memo review simply
  stayed under its budgets: 8 searches/1 fetch vs a larger claim count).
- **model id:** usage rows carry `claude-haiku-4-5-20251001` — the provider's dated alias resolution of
  the allowlisted bare `claude-haiku-4-5` request id; metering prices it by family prefix
  (`rateForModel`). Haiku + `web_search_20250305` demonstrably executed 28 searches — hypothesis (c)
  refuted.

**Verdict — root cause is hypothesis (a), with the mechanism refined:** PRB.22's bound computes
`used = max(historyCount, trackerMetered)` **at request-admission time**. Four parallel Haiku subagent
requests were each admitted while `used=0`, each forwarded with `max_uses=min(15, 12)=12`; the provider
executed up to the per-call cap in every response (28 searches, 26+ fetches across the wave). Once the
metered totals crossed the budgets, `ensureServerWebTools` dropped the tools at `remaining ≤ 0` — for
**every** subsequent request in the run, including the tail of verification itself and all of discourse.
There is no per-phase reservation (REQ-SPEC-31(2) floor absent) and no preflight (REQ-SPEC-31(1)).
Secondary defects folded into the fix: (i) in-flight grants are unaccounted (no reservation), which is
what allowed 28 > 12; (ii) plain `tool_use` blocks are logged `allow` in `fetch_log` and counted in
`historyUse` although the provider never executed them; (iii) the `claim_rows_gte_inventory` oracle
accepts an all-Unverifiable ledger — the *Unverified* delivery remedy is RES.2's, RES.1 records it.

**Fix shape (see Plan):** admission reservations + per-request grant caps make the run budget a real
bound; the floor reserves verification's share for research-class main-model requests; preflight proves
every roster model × server-tool pair through the run's own proxy before the first research phase
commits; `terminalPhaseFailure` gains `research_preflight_failed`; the worker's sweep fires one ops
alert per preflight-failed run.

## Plan

| Deliverable | Where | Notes |
|---|---|---|
| Regression test (red→green) | `apps/egress-proxy/src/research-budget.test.ts` | observed shape: N parallel requests, each granted `max_uses=remaining` while metered=0 → budget overshoot; then drop-at-zero starves a research-phase main-model request |
| Reservations + grants + floor | `outbound-limits.ts` (tracker: committed+reserved), `url-policy.ts` (`ensureServerWebTools` admission opts), `handler.ts` (admission/settle/release, phase-class + preflight headers) | REQ-SPEC-31(2) |
| Floor authoring | `allowlist.ts` `authorWebToolPolicy` + `authorResearchFloor({claims,rigor})`; `run-jobs.ts` passes rigor + tier; `WebToolPolicy` gains `searchFloor`/`fetchFloor`/`researchSubagentModels` | guard test pins the floor constants |
| Preflight | `runspec.ts` `researchPreflight` field; `run-task/src/research-preflight.ts`; `credential-injector.ts` `setPhase`; `harness-loop.ts` pre-commit gate; `internal-api.ts` terminal code; worker sweep alert | REQ-SPEC-31(1) |
| Probe | `fact_check` run driver (script) + recorded-response twin test | ADR decides shape |
| ADRs | floor mechanism/tracker durability; preflight placement/pair-set/resume; probe shape | |

## Test matrix

- Tracker: reserve/settle/release arithmetic, concurrent grants never exceed budget.
- `ensureServerWebTools`: grant ≤ min(remaining, per-request cap); drop at zero; floor-eligible vs
  non-eligible effective caps; preflight bypass.
- Handler: the incident shape — 4 parallel haiku + later research request keeps floor share; plain
  `tool_use` does not mint an `allow` row / does not count `used` (evaluated — may keep for history
  accounting; recorded decision in ADR).
- Floor guard: constants cannot be lowered without failing a named test.
- Preflight: pair matrix from `rosterModelIds`, pass/fail block rules, fail→`research_preflight_failed`
  terminal, alert exactly-once, resume re-preflights.
- Probe twin: recorded response → asserts executed-result extraction + verdict parse.

## Baseline (Phase 1)

To run: `pnpm turbo build lint typecheck`, `pnpm test`, `pnpm check:licenses`,
`pnpm check:protocol-markers`, `node scripts/check-upstream-diff.mjs`, build-memory validators.

## Implementation notes

- **Proxy (`apps/egress-proxy`)** — `outbound-limits.ts`: `ResearchUsageTracker` gains committed totals,
  in-flight reservations (`reserve`/`inflight`/`release`, `RESEARCH_GRANT_TTL_MS` expiry), and
  executed-only history extraction (`server_tool_use`/`web_*_tool_result` blocks only — a bare
  `tool_use` is a call, not an execution). `url-policy.ts`: `WebToolPolicy` gains
  `searchFloor`/`fetchFloor`; `ensureServerWebTools` takes `{floorEligible, bypassBudget}` admission;
  lowercase `web_search`/`web_fetch` client names join the strip set. `credential.ts`:
  `PHASE_CLASS_HEADER` (never forwarded). `handler.ts`: committed = max(history, metered) + inflight;
  `research`/`preflight` classes resolved per request; reservations released on meter, forward
  failure, stream failure.
- **Authoring (`packages/orchestrator`)** — `allowlist.ts`: `RESEARCH_FLOOR_SHARE = 0.5`, the pure
  `authorResearchFloor({claims, rigor, searchBudget, fetchBudget})`, `authorResearchPreflight`
  (roster models × enabled tools, provider `type` variants pinned). `runspec.ts`: the spec carries
  `researchPreflight` only when an active phase is `phaseClass:"research"`. `internal-api.ts`:
  `terminalPhaseFailure` maps `research_preflight_failed` → one-tx terminal settle (hold released,
  zero debit, burn absorbed); `OrchestratorDeps.alert` seam. `stranded-sweep.ts` leg D: one ID-only
  ops alert per preflight-failed run (`failure.alerted` dedupe, send-then-mark).
- **Harness (`apps/run-task`)** — `credential-injector.ts`/`proxy-injector.ts`: stamps
  `x-rhema-phase-class` from the harness's live phase per request; agent-supplied copies dropped.
  `research-preflight.ts` (NEW): probes every `model × tool` pair through the run's egress proxy —
  `tool_choice` forced, `max_uses: 1`, 30 s cap — pass requires a REAL `web_*_tool_result` block (a
  2xx without it fails `no_tool_result`). `harness-loop.ts`: probes once per pod before the first
  phase; unbound seam fails closed; resume = fresh pod = fresh probe.
- **Probe (deliverable 5)** — `packages/journeys/fixtures/planted-error-essay.md` (the recovered
  1,029-word incident essay, LoC 1850 planting) + `planted-error-excerpt.md` (≤300 w).
  `integration/src/research-probe.ts` (`driveResearchProbe` + pure `evaluateProbeEvidence`),
  `-live.ts` env entrypoint, `scripts/live/res1-probe.mjs` runner, `research-probe.test.ts` the
  recorded-shape twin (incident shape is the negative case).
- **ADRs** — 021 (floor + reservations + trusted phase identity), 022 (preflight protocol),
  023 (probe shape: a real fact_check run, not `meterOnly`).

## Self-review

**Pass 1 (design vs diff).** Floor direction verified: `ensureServerWebTools` bounds a
non-floor-eligible request at `budget − floor − used`, so the floor is the tail share ONLY
`research`/`preflight` traffic can draw — earlier phases/subagents cannot starve verification, and a
spent-budget resume still re-probes (`bypassBudget` + declared `max_uses: 1` stays clamped at the cap,
never widened). Reservation lifecycle audited: `reserve` at admission, `release` on meter, forward
failure, and stream failure — a wedged grant expires via `RESEARCH_GRANT_TTL_MS`. Phase-class trust:
the injector drops agent-supplied `x-rhema-phase-class` before stamping the manifest class (test:
`credential-injector.test.ts` RES.1 leg); the proxy never forwards it (`NEVER_FORWARD`).

**Pass 2 (defects found and fixed this pass).** (i) `pod-loop.test.ts` — `failStep` adapter returned
`Promise<void>` where the loop reads `result.ok`: now returns the parsed reply; both tests re-green
with the preflight seam injected (proving runspec → preflight → commit over real routes). (ii)
`research-preflight.ts` duplicated the spec interface — now imports `ResearchPreflightSpec` from
`@rhema/orchestrator` (drift-safe). (iii) `runspec.ts` `systemTxRunner` read needed the audited
system-pool allowlist entry (`tools/system-pool-boundary.json`, reason recorded). (iv) unused
`isTerminal` import and a `pair.kind`/`pair.tool` field slip in tests fixed.

**Accepted limits.** The tracker is process-local per proxy instance (ADR-021 records the
multi-instance call): a proxy restart only WIDENS admission (reservations forgotten), never starves
verification — the floor is a per-request bound, not debit state. Preflight probes run in parallel
through the run's own proxy (the same admission path the incident lacked).

## Gap analysis (vs `docs/tickets/63_RES.1__review-research-restore.md` ACs)

| AC | Status |
|---|---|
| Root cause named + hypotheses (a)–(d) verdicts + regression test red-on-pre-fix | ✅ diagnosis section above; regression legs in `handler.test.ts` / `outbound-limits.test.ts` / `url-policy.test.ts` (147/147 incl. 7 new RES.1 tests) |
| Matrix: every rigor × tier, main + research-subagent, every attempt — tool present until floor spent | ✅ `authorResearchPreflight` matrix test iterates `MODEL_TIERS`; enforcement is model/attempt-agnostic (run-keyed tracker + per-request admission) — asserted in the floor/admission tests |
| Floor fixture: burnt non-floor budget leaves verification ≥ floor; guard fails if floor lowered | ✅ `handler.test.ts` floor tests + `GUARD` test pins `RESEARCH_FLOOR_SHARE ≥ 0.5` + `authorResearchFloor` outputs |
| Preflight pass / fail (zero debit, hold released, burn absorbed, one id-only alert) | ✅ `research-preflight.test.ts` (5), `harness-loop.test.ts` (20), `internal-api.test.ts` terminal settle, `stranded-sweep.test.ts` leg D send-then-mark |
| Preflight precedes first commit; resume re-preflights | ✅ once-per-pod flag + fresh pod on resume; resume test in `harness-loop.test.ts` |
| Probe twin in CI + committed fixture (no user-identifying content) | ✅ `research-probe.test.ts` (5); `packages/journeys/fixtures/planted-error-{essay,excerpt}.md` (1029w + 267w, incident essay recovered) |
| Stage B deploy + ≤3 probes + N6 + Standard/Base excerpt | ▶ **partial — executed 2026-10-01** (see Stage B evidence): deploy to `prod:7833ece` ✓; 3/3 probes ran ($7.49) — tool-reach restored on both models + preflight fail-path proven live at $0, but the *Contradicted* assertion unmet (new defect BL-66: stale claim-ledger mount ships prior verdicts on a re-run); N6 + Standard cut by the remaining $2.51 → `D-RES.1-2/-3` OPEN, `D-RES.1-1` PARTIAL |
| Universal gate: verification green, tests per behavior, REQ stamps, DEFERRALS rows, ADRs, index/ledger | ✅ verification below; REQ-SPEC-31/(1)(2), REQ-VIS-9, REQ-SPEC-11, REQ-ARCH-31, REQ-SPEC-29(N6 deferred) stamped in `docs/build/pr/RES.1.md`; ADR-021/022/023; rows appended |

## Verification (Phase 5)

2026-10-01, full repo on `stevevitali/res-1-review-research-restore`:

- `pnpm turbo build lint typecheck` — **135/135 tasks green** (two lint fixes landed during this pass:
  unused import in `research-probe.ts`; `runspec.ts` added to `tools/system-pool-boundary.json`).
- `pnpm test` — **405 files / 3,782 tests passed** (4 pre-existing skips). One flaky
  `lever-matrix.test.ts` failure under parallel load re-ran green standalone; unrelated to this diff.
- `pnpm check:licenses` — OK (609 packages). `pnpm check:protocol-markers` — OK (45 public files).
- `node scripts/check-upstream-diff.mjs` — OK: 22 ported files reconcile with pin `5fef4165`, only
  sanctioned edits — no protocol/skill text touched (Manifest #8).
- `check-build-memory.sh` — no violations; 6 pre-existing warnings (none introduced by this run;
  the `Harness:` header rule satisfied on this ledger).
- **2026-10-01 re-verify at tip `7833ece` (Stage-B close-out):** `turbo build lint typecheck`
  **135/135**; `pnpm test` **404 files / 3,785 passed / 6 skipped**; `check:licenses` 609;
  `check:protocol-markers` 45; `check-upstream-diff` 22 files vs pin `5fef4165`;
  additive-migration lint clean (no migrations newer than base).

## Stage B evidence (executed 2026-10-01; spend $7.49 of the $10 cap)

Stage B ran live on prod across three deploys and three probes. Metered spend is Σ
`usage_records.credits` where `source='proxy'` × $0.01 ÷ 1.4 (`USD_PER_CREDIT`/`PLATFORM_RATE` in
`packages/contracts/src/domain/rates.ts` — re-confirmed this session).

**Deploys (`deployments` rows; `pulumi preview`/`up` showed zero replace/delete on stateful
resources each time — updates through 99+; additive-migration lint pass, no new migrations):**

| deployment | deployed_at | carries |
|---|---|---|
| `prod:3ee862f…` | 2026-10-01T12:39:56Z | RES.1 Stage-A tip (res1 images) |
| `prod:0552433…` | 2026-10-01T13:22:54Z | res1b — hotfix `ccb3412` (preflight sends `anthropic-version`) |
| `prod:7833ece…` | 2026-10-01T14:43:39Z | res1c — hotfix `7833ece` (per-call grant caps via `RESEARCH_PARALLELISM`, preflight excluded from bound settlement, probe inputSnapshot pass-through); Cloud Build `7b8bc3eb`; proxy `sha256:618ddfa8…`, run-task `sha256:faa6aa00…` |

Provenance: `GET /healthz` on `rhema.tools` and `api.rhema.tools` both report
`build.gitSha = 7833ece8c44706f6054a0167f9f3b1960e361149` = the chain tip (verified 2026-10-01T15:23Z).

**Probes** (`scripts/live/res1-probe.mjs` → `driveResearchProbe`; principal = the funded
`test+jrn-a@rhema.tools` tenant — user `01M3V0VJ…`, workspace `01M3V0VJ74HQXDPWPW2V8125S4`, billing
`01M3V0VJ741QESKB93G2HWF5P6` — project `01M3VT6Y6XREDBN1D6EW16Y5S8` holding the excerpt draft;
session cookie minted through the real magic-link funnel, never forged):

| probe | run | deploy | outcome | proxy credits | list $ |
|---|---|---|---|---|---|
| 1 | `01M3VRDV9YKEAQKKQE7W2693KF` (12:53:30Z) | `prod:3ee862f` | `failed/research_preflight_failed` in ~1 s — all 4 pairs HTTP 400 `invalid_request_error` (the missing `anthropic-version` defect); **zero debit rows** (holds 945 cr released in full: `credit_ledger` hold 10+935 → release 10+935); `failure.alerted=true` (one id-only ops alert) | 0 | $0.00 |
| 2 | `01M3VT9R1MAVVKM3Q7RXCRY5RD` (13:26:12Z) | `prod:0552433` | completed; preflight passed (the `anthropic-version` fix held); 8 searches / 16 fetches metered — but the claims=0 fallback bound (8/16) + preflight executions consuming the bound + uncapped whole-remainder grant starved parallel siblings → **9/9 Unverifiable**, model ledger note "No working web_search/web_fetch tool available this session" | 464 | $3.31 |
| 3 | `01M3VYSGV9XZ9RCWNP0CGDXQHD` (14:44:44Z) | `prod:7833ece` | completed; **tool-reach restored on BOTH models** — `claude-sonnet-5`: 7 searches / 16 fetches / 523 cr; `claude-haiku-4-5-20251001`: 12 searches / 7 fetches / 61 cr; `fetch_log` 304 rows (26 search-allow, 224 fetch-allow) hitting the right sources (`en.wikipedia.org/wiki/Library_of_Congress`, `loc.gov/…`) — but **delivered claims 9/9 Unverifiable, byte-identical notes to probe 2's ledger** | 584 | $4.17 |

**Probe-leg verdict vs the AC.** Met: a live run completed on res1c; `usage_records` show ≥1 search
for BOTH the Sonnet main pair and the Haiku research-subagent pair; ≥1 `fetch_log` fetch row exists
(224 allow); the preflight both passes live (probes 2–3 proceeded) and fails closed live at $0
(probe 1: `research_preflight_failed`, zero debits, hold released, one alert — the REQ-SPEC-31(1)
contract end-to-end on prod). **Not met: the planted claim never landed *Contradicted*.**

**Root cause of the residual miss — a NEW defect surfaced by the probes (recorded as BL-66):**
probe 3 reused probe 2's project, and `run_mounts` shows `agents/editor/01-claim-ledger.json`
mounted `readwrite` at the declared output path **seeded with probe 2's artifact bytes**
(sha256 `020b0a11…`, artifactVersion `01M3VV4ZT…`). No new artifact version was produced for the
claim-ledger path on run 3 (content unchanged), and delivery persisted the stale all-Unverifiable
verdicts — notes identical verbatim to the prior run, including its session-specific "two researcher
subagent batches" phrasing. So a re-run on a project carrying a prior claim ledger can ship the
prior run's verdicts unchanged: the delivered verdicts were not produced by this run's (working)
research. The seeding-plus-harvest-precedence mechanism (`resolveKey` prefers the shortest suffix
match — the mounted `agents/editor/01-claim-ledger.json` over a fresh `agents/editor/.rhema/…` write)
is recorded in BL-66 → RES.2's *Unverified delivery* lane. A fresh-project probe exercises the clean
path but the ticket's ≤3-probe count and the remaining cap are both exhausted.

**Legs cut by the cap (recorded per the amended contract, "never overspend"):**

- **D-RES.1-2 (N6)** — the Quick/Base Review of the full planted-error essay via the JOURNEY.1
  harness never ran: probes consumed $7.49 and a Quick review of a ~1,000-word draft meters ~$4.5
  (the incident run charged 632 cr) — more than the $2.51 remaining. N6 stays `expected:red` in
  `packages/journeys/src/registry.ts`.
- **D-RES.1-3 (Standard/Base excerpt)** — same cap reality (≤$5 leg vs $2.51 remaining).

**Per-leg spend (metered list $):** deploy legs $0 · probe 1 $0.00 · probe 2 $3.31 · probe 3 $4.17 ·
N6 not run ($0) · Standard not run ($0) — **total $7.49 ≤ $10**. The ≤$3 probe-leg plan was exceeded
because the ≤$1/probe estimate under-sized the claimCount-scaled research bound (each completing
probe meters ~$3.3–4.2 at list).

Every deterministic proxy stays in place: the incident regression suite, the recorded-response probe
twin, the floor guard, the preflight matrix, and the pod-loop preflight-seam test.
