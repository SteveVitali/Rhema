# R5REC.3 — Round-5 integration + merge plan (§R5)

Stacked on `stevevitali/r5rec-2-spec-reconciliation` · `mergePolicy: OPERATOR` —
**do not merge; the operator merges the chain bottom-up.** Offline-only docs
reconcile; $0; no live stage (the only live contact was read-only `/healthz` +
`gh`/`git` state). `implement-spec spec=docs/tickets/173_R5REC.3__integration-plan.md
reconcile=integration`. Process row — no REQ ids.

## What

`docs/build/INTEGRATION_PLAN.md` gains **§R5 — the round-5 merge/deploy ordering**
(~200 lines, the §R4 shape), written against the world as it actually is:

- **External state (re-read 2026-10-18):** `main` head `a2cdb75` — the whole
  round-4 chain is merged through **#169**; the open stack is **22 PRs #170–#191**
  + this PR + the expected R5DOC tail. Prod serves **`ffbb8ad`** on web+api
  (Arm-B tip deploy, inside open PR #171 — the deployed SHAs `b35473d`/`d5a74cc`/
  `ffbb8ad` become ancestors of `main` on merge). #170's base is a merged branch
  (retarget step 0); #172's base `r5-synthesis` is an un-PR'd planning branch —
  its 22 commits land inside #172.
- **Merge dry-run committed:** `merge-dryrun.sh --ci` over all 22 branches →
  **22/22 clean onto `origin/main`, 0 conflict hunks, 0 red PRs** (21 pass /
  1 pending at read — #191's docs head); evidence at
  `docs/build/reports/R5REC.3/merge-dryrun.{txt,json}`.
- **Six merge segments (0–5)** with per-segment ordering + evidence recipes.
- **Three hard deploy rules:** (1) the NAVC deploy freeze — NAVC.1 never deploys
  ahead of NAVC.3, one segment covers NAVC.1→NAVC.4, earliest legal deploy SHA is
  #179's merge commit; (2) the econ regime (#180–#182) MUST be deployed before any
  funded-window re-attempt — a future attempt needs BOTH a fresh operator envelope
  ruling (GD-FUNDED.1-1 = CARRY; never scheduled here) and segment 3 live on prod;
  (3) the nightly-green unlock is merge+deploy-bound — the scheduled nightly
  asserts `github.sha` = `main` HEAD, so BL-74 / REQ-OPS-6 / D-OBS.1-3 /
  D-SPA.28-1's nightly arm unlock only at the post-sweep tip deploy + the next
  scheduled 06:05Z run (`workflow_dispatch` never satisfies).
- **Funded/preview/golden ordering:** pr-186 destroyed (fresh `pr-<n>` per wave,
  off the critical path); posture-bound residuals named (D-SPA.24-1,
  D-SPA.16-1/-20-1, D-OPS.1-1); GD-R5OPS.1-1 stays AWAITING — recorded, never
  answered.
- **Stop conditions + rollback per segment** — including the two hard refusals
  (deploy inside the NAVC range; funded re-attempt before the econ deploy).

## Evidence

| Claim | Proof |
|---|---|
| Merge order is real | 22/22 `git merge-tree` clean pairwise onto `origin/main` (committed JSON) |
| Provenance is honest | live `/healthz` read — prod `ffbb8ad`, a branch SHA inside #171; ancestor-of-`main` reconciliation stated verbatim |
| No merges taken | this file is the plan; mergePolicy OPERATOR; every command is the operator's |
| $0 / offline | docs-only diff; no deploys, no prod writes, no spend |
| Append-only | §1–§R4 untouched; `check-append-only.mjs --base c09c4b5` |

## Operator flags standing

GD-R5OPS.1-1 (golden budget, **AWAITING** — not answered) · GD-FUNDED.1-1 (funded
wave, **CARRY** — a future attempt needs a fresh envelope ruling + segment-3
deploy) · the merge sweep itself (BL-01/H8) · H8 remainder · D-OPS.2-1 billing
export · D-R5OPS.1-2 CDN origin-read ruling · D-BL38.1-1 `prod:d5a74cc` stamp
shape · D-COST.1-3 out-of-class lever rulings ($198.32 vs ~$50 target) ·
D-R5REC.1-1 mount-settle flake (in-repo test fix, carried on BL-87).
