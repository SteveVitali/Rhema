# R5REC.3 — Round-5 integration + merge plan (§R5) — run ledger

- **Spec:** `docs/tickets/173_R5REC.3__integration-plan.md` (manifest row 173, round 5,
  Kind: reconcile) — `implement-spec reconcile=integration`
- **Base:** `stevevitali/r5rec-2-spec-reconciliation` tip @ `c09c4b5`
- **Branch:** `stevevitali/r5rec-3-integration-plan` (mergePolicy=OPERATOR — never merge)
- **Harness:** devin-desktop/swe-2-high · **Skills:** implement-spec + reconcile-build +
  build-memory @ `~/agent-skills` (`e981ec5`)
- **Requirement ids stamped:** none — process row
- **Live stage:** none · **Production mutations:** none — offline-only, $0, no live
  stage; the only live contact was read-only `/healthz` provenance + `gh`/`git` reads
- **Started:** 2026-10-18T01:35Z

## Deferrals read

`docs/tickets/DEFERRALS.md` read first (protocol — AGENTS.md). This ticket is a
planning artifact — it unblocks nothing itself and closes no row. The rows the plan
**names in the right segments** (per the contract): `D-SPA.6-1` (prod arm — the
merge/deploy of the marker-bearing tip; preview half already DONE on pr-186),
`D-SPA.28-1` (cleanup-wave entry gate — flips merged + ≥1 nightly green → §R5.5),
`D-OBS.1-3` (first scheduled nightly green — merge-dependent → §R5.5 / BL-74),
`D-CAP.2-1` (carried funded wave → §R5.4 rule 2 + §R5.6), `D-SPA.24-1` /
`D-SPA.16-1` / `D-SPA.20-1` / `D-OPS.1-1` (posture-bound preview residuals → §R5.6),
`D-P0.15-4` (nightly golden — behind GD-R5OPS.1-1 AWAITING → §R5.6). Opened: none.
Closed: none — a plan cannot discharge live debt.

Standing gate facts honored, not answered: `GD-FUNDED.1-1` = CARRY (fresh envelope
ruling + econ deploy both required — §R5.4 rule 2); `GD-R5OPS.1-1` = AWAITING
(~$150–300/night golden budget — recorded as an open operator precondition).

## Requirements (from the contract)

1. §R5 merge order + deploy boundaries — the econ regime MUST be deployed before
   GATE-R5F (any funded-window re-attempt).
2. The nightly-green / merge-dependency sequencing for BL-74.
3. Deploy boundary carried from 154_NAVC.1 — NAVC.1 never deploys ahead of NAVC.3;
   one segment covers NAVC.1→NAVC.4.
4. Stop conditions + rollback notes per segment.
5. AC: §R5 lands with per-segment ordering + evidence recipes + universal phase-gate.

## Plan

1. Re-read the world honestly: `gh` open-PR census, `origin/main` head, prod
   `/healthz`, the r5-synthesis fork topology, per-range product-code deltas.
2. `merge-dryrun.sh --ci` over all 22 open chain branches → committed evidence
   (`docs/build/reports/R5REC.3/merge-dryrun.{txt,json}`).
3. Append §R5 to `docs/build/INTEGRATION_PLAN.md` in the §R4 shape: external state,
   segment map, merge mechanics, the three hard deploy rules, the per-segment table
   with evidence recipes, the BL-74 nightly sequencing, funded/preview ordering,
   stop conditions + rollback.
4. Docs-only verification + closeout per implement-spec.

## Test matrix

Docs-only diff — no runtime change. Deterministic evidence: every named SHA/PR/fact
verified against live `gh`/`git`/curl reads this run; the merge-dryrun script output
is committed; `check-append-only` proves §1–§R4 history untouched; full test suite +
six `check:*` re-run green.

## Progress

- External state re-read: `main` head `a2cdb75` (merged through **#169** — the whole
  round-4 chain is on `main`); open stack **#170–#191** (22 PRs) + this PR + the
  R5DOC tail; #170's base is the merged spadoc-2 branch (retarget step 0); #172's
  base `r5-synthesis` is an **un-PR'd planning branch** (22 commits — lands inside
  #172).
- Prod provenance: web + api `/healthz` = `ffbb8ad01b…` (read 2026-10-18T01:40Z) —
  inside open PR #171's history; ancestor of the whole round-5 stack.
- Merge dry-run: **22/22 clean onto `origin/main`, 0 conflict hunks, 0 red PRs**
  (21 pass / 1 pending — #191 docs-head at read time); evidence committed.
- §R5 written: 6 merge segments (0–5), three hard deploy rules (NAVC freeze, econ
  before funded, nightly-green merge+deploy bound), per-segment evidence recipes,
  funded/preview/golden ordering, per-segment stop conditions + rollback.

## Gap table

| Contract requirement | Disposition | Evidence |
|---|---|---|
| §R5 merge order + deploy boundaries | landed | §R5.2 segment map + §R5.3 + §R5.4 rules 1–3 |
| econ regime before GATE-R5F / funded re-attempt | landed | §R5.4 rule 2 + §R5.6 funded block (both preconditions named; never scheduled spend) |
| BL-74 nightly-green / merge-dependency sequencing | landed | §R5.5 (`github.sha` mechanics; unlock = sweep + tip deploy + scheduled run; dispatch never satisfies) |
| NAVC.1 never ahead of NAVC.3; one segment NAVC.1→NAVC.4 | landed | §R5.4 rule 1 + segment-2 row + §R5.7 hard-refusal stop |
| stop conditions + rollback per segment | landed | §R5.7 |
| per-segment ordering + evidence recipes (AC) | landed | §R5.2 + §R5.4 table recipe column |
| universal phase-gate AC | landed | verification below |

## Evidence log

- `git merge-tree` / `merge-dryrun.sh` — 22/22 clean; repeat privsep-skip patch
  (`dddd2e1` vs `625d28a`) is content-identical → auto-resolves.
- `curl https://rhema.tools/healthz` + `https://api.rhema.tools/healthz` →
  `ffbb8ad01b4383ab7f11088c8427b668bc442b01` both, 2026-10-18T01:40Z.
- `gh pr list --state open` → #170–#191 contiguous; #170 MERGEABLE on merged base.
- `git merge-base --is-ancestor` → `ffbb8ad` inside #171, #172, and the chain tip;
  `spadoc-2` inside `origin/main`.

## Evidence report

_(filled at close — verification counts, CI verdict, file list)_
