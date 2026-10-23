# Golden rerun rule — re-run the minimal cohort on every protocol-affecting deploy

> **Standing rule (ADR-111 §17, amended; REQ-DISC-3; GD-GOLDEN-CAP.R6).** Launch requires a green
> golden validation on all four protocols at the launch-candidate SHA, **and the validation must be
> re-run after every subsequent protocol-affecting deploy** — including the classes the spec names
> verbatim: REQ-ENG-3 fixes and REQ-SEC-3 (security) fixes. This is a rerun rule, not a recurring
> cadence — the nightly schedule was declined (GD-R5OPS.1-1) and stays declined.

## What counts as protocol-affecting

A deploy is protocol-affecting when it can change what a golden Review produces: protocol seeds,
manifests, rubrics, phase defaults or phase behavior (`packages/protocols`), the run/dispatch path
(protocol resolution, phase-default layering, URL policy freezing, delivery), the harness/skill
phase machinery, the egress proxy's research/fetch policy, or any security fix that touches the
boundary a run executes behind (REQ-SEC-3 class). When in doubt, treat the deploy as
protocol-affecting — the check costs tens of dollars, not the ~$150–300/night cadence that was
declined.

## The cohort

Exactly one fixture per seeded protocol — `golden-essay`, `golden-academic`, `golden-op-ed`,
`golden-memo` (`packages/protocols/src/eval-fixtures.ts` `minimalCohort()`) — each paired with its
primary **Review** workflow at **default tier (`base`)** and **default rigor (`standard`)**,
dispatched on an `is_test` workspace. Four paid runs; never trimmed to fit the cap silently.

## The bound

- **Hard cap: $100 measured** (`GOLDEN_HARD_CAP_USD` — list USD from `usage_records`, the meter of
  record).
- The estimate is computed and **committed before dispatch** (`--estimate`); an estimate over the
  cap means **PAUSE for the operator — never trim protocols silently**.
- `GOLDEN_BUDGET_RULING=approved` is a **one-shot** arm for the run only — set it for the run,
  never left armed.
- A run that partially fails is still reported: per-leg run ids, terminal states, and exact
  metered USD for whatever burned. The dispatch stops at the cap trip and writes partial scores.

## The gate

The measured `--scores` file → `evals/fixtures/nightly-manifest.json` →
`scripts/nightly-golden.mjs` `gateFixtures` → `assertScoreFloors` + `promotionBlocked`. Green means
all four fixtures pass their committed deterministic floors (`GOLDEN_LIVE_FLOORS`) and
`promotionBlocked` is false. An absent manifest exits 0 with an explicit **NON-EVIDENCE** marker —
never read it as a green run.

## Procedure

```bash
# 0 — provenance + estimate (committed before any paid dispatch)
node scripts/live/nightly-golden-driver.mjs --cohort minimal --estimate \
  > docs/build/reports/<date>_rerun/cohort-estimate.json   # >$100 → PAUSE + report
curl -s https://api.rhema.tools/healthz   # build.gitSha must equal the deploy under test

# 1 — funded is_test workspace + a session for a pinned test identity (admin-cli house-grant is
#     the audited funding seam; magic-link mint via the pinned test mailbox)

# 2 — one-shot dispatch (exactly four paid runs)
GOLDEN_BUDGET_RULING=approved \
API_BASE_URL=https://api.rhema.tools \
GOLDEN_DATABASE_URL=<system-role dsn over the IAP tunnel> \
GOLDEN_WORKSPACE_ID=<is_test workspace> \
GOLDEN_MINT_SESSION=1 \
node scripts/live/nightly-golden-driver.mjs --cohort minimal --dispatch \
  --expect-sha <deploy sha> --scores-out <scores.json>

# 3 — gate on the measured scores
GOLDEN_BUDGET_RULING=approved \
node scripts/live/nightly-golden-driver.mjs --cohort minimal --execute --scores <scores.json>
```

## Escalate to the operator when

- the estimate exceeds $100;
- any leg fails, hangs past its 45-minute bound, or trips the cap mid-cohort;
- a model call returns 401 (key/secret regression — stop, flag first-line, do not retry-spend);
- the deployed SHA does not match the deploy being validated;
- any floor fails or `promotionBlocked` is true — the deploy is not validated; a fix deploy
  re-arms this same rule.
