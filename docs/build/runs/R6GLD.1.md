# R6GLD.1 — Golden validation: $100 minimal four-protocol cohort at the launch-candidate SHA (run ledger)

- **Spec:** `docs/tickets/196_R6GLD.1__golden-validation.md` (manifest row 196, round 6;
  REQ-DISC-3 — ADR-111's amended §17 launch criterion)
- **Normative loads:** `docs/round-6-draft-spec.md` §4.7; ADR-111 (§17 amendment: golden validation
  green on all four protocols at the launch SHA + re-run on protocol-affecting deploys);
  LEDGER GATE DECISIONS `GD-R5OPS.1-1` (nightly cadence declined; one-time bounded validation),
  `GD-GOLDEN-CAP.R6` (minimal cohort = one fixture per protocol × its primary Review workflow at
  default tier/rigor; **hard cap $100**; pause if the estimate exceeds);
  `scripts/live/nightly-golden-driver.mjs` (fail-closed skeleton — `GOLDEN_BUDGET_RULING=approved`
  one-shot + measured `--scores`); `scripts/nightly-golden.mjs` + `@rhema/benchmark`
  (`assertScoreFloors`, `promotionBlocked`); `packages/protocols` (the four seeded protocols +
  `GOLDEN_EVAL_FIXTURES`); `evals/fixtures/`; DEFERRALS **D-P0.15-4**.
- **Base:** `stevevitali/r6secr-1-adversarial-review` @ `c1f20f5` (chain tip at branch cut)
- **Branch:** `stevevitali/r6gld-1-golden-validation` (mergePolicy=OPERATOR — never merge)
- **Harness:** devin-desktop/swe-2-high/subagent · **Skills:** implement-spec + build-memory +
  self-review @ `~/agent-skills` (`e981ec5`)
- **Requirement ids stamped:** REQ-DISC-3
- **Started:** 2026-10-23T09:30Z · **Closed:** —
- **Live stage:** prod, paid — one validation run (4 paid legs) on the deployed launch-candidate
  SHA `80db0d5` (verified via `api.rhema.tools/healthz` + `rhema.tools/healthz` at dispatch time).
- **Production mutations (ticket header, verbatim):** 4 paid runs on an `is_test` workspace (one
  per protocol). Supporting rows on the same flagged workspace: one audited test-tenant house
  grant (the documented funding seam — every prior paid leg ran on granted credits; actor
  `devin-cli:r6gld-1`), four fixture projects + their imported drafts, one magic-link session mint
  for `test+jrn-gld@rhema.tools` (fresh test identity — the older `test+jrn-a` tenant had 20 cr
  left and sat near the 26 h purge horizon). Nothing on a non-flagged tenant.
- **Resolved prerequisite:** F-R6CNT.2-1 (`rhema-prod-anthropic-api-key` v4 live; `/v1/models`
  200 — operator note 2026-10-23). A 401 on any model call = stop + flag first-line, no retry-spend.

## Deferrals read

`docs/tickets/DEFERRALS.md` read at run start. Relevant rows:
- **D-P0.15-4** (OPEN): the deferred nightly/live golden obligation — THIS ticket closes it with
  live evidence under the amended criterion (recurring cadence stays declined — never resurrected).
- **D-R6CNT.2-1** (OPEN): paid showcase run regeneration — separate cap-floor ruling; not unblocked here.
- **D-CAP.2-1** (OPEN): paid journey legs — funded-window spend-guarded; not this ticket.
- **D-R6SECR.1-1** (OPEN): §12.8 live exercise — not this ticket (the golden run is not a canary).

## Requirements (from the ticket)

1. Cohort covers all four protocols — one fixture per missing protocol (P1.21's protocols 2–4),
   committed floors, before any paid dispatch.
2. `--cohort minimal` driver mode (one fixture per protocol × its primary Review workflow, default
   tier/rigor — `review` · `standard` · `base`).
3. A committed estimate; > $100 → PAUSE (never trim protocols silently).
4. One validation run on the deployed launch-candidate SHA (`80db0d5`) with measured `--scores`;
   floors green on all four; `promotionBlocked` stays false.
5. `docs/ops/golden-rerun-rule.md` — re-run on every protocol-affecting deploy (ADR-111).
6. D-P0.15-4 closed with evidence.

## Out of scope

- A recurring cadence (declined, GD-R5OPS.1-1); the full workflow × project cohort.

## Acceptance criteria

- [x] All four protocols in the cohort; the estimate is committed before dispatch *(deterministic)*
- [ ] Spend ≤ $100 measured; floors green on all four *(live-executed — dispatched, all legs failed at research preflight 401, $0; floors stay unproven → F-R6GLD.1-1)*
- [x] The re-run rule is committed *(deterministic)*
- [ ] Universal phase-gate AC *(agentic)*

## Gap analysis

(filled at close — every requirement row → evidence layer)

## Live evidence

**Dispatch (2026-10-23, prod @ `80db0d5`, workspace `01M5M2C6NC3058T528ZX2D44SG` `is_test=true`,
fresh billing account funded with an audited 8 000 cr house grant — ledger `hold`/`release`
pairs confirm $0 debited):**

- Pre-dispatch checks green: API+web provenance `80db0d5`, tenant `is_test`, balance 8 000 cr,
  committed estimate 6 572 cr / **$46.94** list < $100 cap → dispatched (never retried).
- Exactly one run per protocol was launched; all four failed at **research preflight** with
  `HTTP 401 authentication_error` on every model × tool combination
  (`claude-sonnet-5` / `claude-haiku-4-5` × `web_search` / `web_fetch`):

| leg | run | state | spend |
|---|---|---|---|
| golden-essay | `01M5M2D06JAFZAY55H2HFP8PF1` | failed (`research_preflight_failed`) | $0 |
| golden-academic | `01M5M2EEJ7FPW5YAA9GJZYF9XE` | failed (`research_preflight_failed`) | $0 |
| golden-op-ed | `01M5M2EZF2VNF8KJSTJ1869R98` | failed (`research_preflight_failed`) | $0 |
| golden-memo | `01M5M2FH04NXN6JXMS4382FQ7P` | failed (`research_preflight_failed`) | $0 |

- **Measured cohort spend: $0** (holds 4 566+4 564+4 564+3 318 cr fully released — ledger
  evidence; showcase seed rows on the workspace never touched the billing ledger).
- Collected score file: `docs/build/reports/2026-10-23_R6GLD.1/golden-scores.json`
  (4/4 legs, honest `failed` states — the driver never fabricates a manifest; `--execute`
  was therefore never run and `evals/fixtures/nightly-manifest.json` was not written).
- Context check: in the last 3 days the DB shows **zero real (non-zero-duration) completed
  runs** — all 37 `completed` rows are zero-duration showcase seeds; the 401 is platform-side
  (`authentication_error` on the model call), not tenant-funding. **Per the ticket: stopped,
  no retry, operator flag.**

## Finding

- **F-R6GLD.1-1 (OPEN, operator):** research preflight returns HTTP 401
  `authentication_error` for both research model tiers on prod @ `80db0d5`, although
  F-R6CNT.2-1's `/v1/models` probe is 200 — the failing surface is the model call carrying
  the `web_search`/`web_fetch` server tools (the per-run `proxy_credential_id` path).
  Golden validation stays **red** until the credential/tool access is fixed; the amended
  §17 criterion and D-P0.15-4 remain unmet — rerun required after the fix (see
  `docs/ops/golden-rerun-rule.md`).

## Gap analysis

| requirement | evidence | state |
|---|---|---|
| 4 protocols, one fixture each, committed floors | `GOLDEN_EVAL_FIXTURES` (essay/academic/op-ed/memo) + `eval-fixtures.test.ts` (12 tests) | DONE (deterministic) |
| `--cohort minimal` driver, default review/standard/base | `nightly-golden-driver.mjs` + `nightly-golden-driver.test.mjs` (11 tests) | DONE (deterministic) |
| committed estimate, >$100 → pause | `cohort-estimate.json` — 6 572 cr / $46.94, `withinCap:true` | DONE (committed pre-dispatch) |
| 1 run per protocol on `80db0d5`, `is_test` | 4 run ids above — dispatched once each, never retried | DONE (dispatch) |
| measured `--scores`, floors green, `promotionBlocked:false` | runs failed at research preflight 401 — **no green scores exist**; gate correctly not invoked | **BLOCKED (F-R6GLD.1-1)** |
| `docs/ops/golden-rerun-rule.md` | committed | DONE (deterministic) |
| D-P0.15-4 closed with live evidence | live evidence exists but shows red — the deferral stays **OPEN** with a dated note | **BLOCKED (F-R6GLD.1-1)** |

## Operator flags

- **⚑ F-R6GLD.1-1 — research model calls return HTTP 401 on prod:** all four cohort runs
  failed at research preflight (`authentication_error` on `web_search`/`web_fetch` model calls,
  both tiers, prod @ `80db0d5`). `/v1/models` is 200 but the tool-carrying call path is rejected.
  **Fix needed before golden validation can go green** — no run will be retried until then;
  after the fix the rerun is exactly this cohort (rerun rule committed). The granted 8 000 cr
  remain untouched on the flagged workspace for that rerun (or `house-void` reverses).
- The four paid legs need funded balance on the flagged workspace: the only documented seam is
  `admin-cli house-grant` (audited `admin_actions` + ordinary ledger rows — never a balance UPDATE).
  Executed under GD-GOLDEN-CAP.R6's cohort authorization, actor `devin-cli:r6gld-1`, sized to the
  committed estimate + hold headroom. Recorded here for operator awareness — `house-void` reverses.
