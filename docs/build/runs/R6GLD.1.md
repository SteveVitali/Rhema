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
  for `test+jrn-a@rhema.tools` (the pinned stable test identity). Nothing on a non-flagged tenant.
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

- [ ] All four protocols in the cohort; the estimate is committed before dispatch *(deterministic)*
- [ ] Spend ≤ $100 measured; floors green on all four *(live-executed)*
- [ ] The re-run rule is committed *(deterministic)*
- [ ] Universal phase-gate AC *(agentic)*

## Gap analysis

(filled at close — every requirement row → evidence layer)

## Live evidence

(filled at close — run ids, per-protocol results, measured spend, gate output)

## Operator flags

- The four paid legs need funded balance on the flagged workspace: the only documented seam is
  `admin-cli house-grant` (audited `admin_actions` + ordinary ledger rows — never a balance UPDATE).
  Executed under GD-GOLDEN-CAP.R6's cohort authorization, actor `devin-cli:r6gld-1`, sized to the
  committed estimate + hold headroom. Recorded here for operator awareness — `house-void` reverses.
