# r7deploy-tip2 — post-acceptance prod deploy attempt @ `13e7d9dc` — **PAUSED at condition 0: the named tip does not carry the authorized payload**

- **Ticket:** run-time insert (no ticket file — the R7DEP.2/3 precedent): post-acceptance prod
  deploy of the unmerged round-7 chain tip, authorized by the operator's 2026-11-09 verbatim
  ruling recorded in `docs/build/LEDGER.md` PHASE LOG: *"clock rows? can we expedite these
  somehow? i want you to do everything remaining, including prod deploy, etc."* — disposition
  (b): **`pulumi up --stack prod` at the newest composed tip `ed906040`** (250i's head —
  *"carries the sync-pill fix `D-R7FIX.8-1` + the paid-leg pin"*) under the same eight-condition
  discipline + fresh ruling.
- **Branch:** `stevevitali/r7deploy-tip2` (records branch forked at the named tip so PR #308
  stays a clean 250i diff — the R7DEP.2/3 split pattern). Task-named deploy SHA:
  `13e7d9dc` (`stevevitali/r7fix-9-paid-leg-pin` tip = `ed906040` + the ruling-records commit).
- **Harness:** devin-desktop/swe-2-high/subagent
- **Outcome: PAUSED before any mutation — $0 spent, zero cloud actions.** The authorization's
  factual premise fails on git evidence: `13e7d9dc` does **not** carry the sync-pill fix
  (`96f6a2e7`, R7FIX.8/250h). The tip the ruling describes — 250h + 250i composed on the R7b
  stack — **does not exist on any branch**; PRs #307 and #308 are siblings off
  `stevevitali/r7deploy-tip`, not a stack.

## The pause finding (pre-condition evidence — `reports/2026-11-09_r7deploy-tip2/composed-tip-audit.txt`)

1. **`96f6a2e7` (the R7FIX.8 fix) is not an ancestor of `13e7d9dc`.**
   `git merge-base --is-ancestor` → NO; the merge-base of the two branches is `dc1ba197`
   (the orchestrator's row-250h insert). `stevevitali/r7fix-8-sync-pill` @ `5aacf011`
   (PR #307, base `stevevitali/r7deploy-tip`) carries the fix; `stevevitali/r7fix-9-paid-leg-pin`
   @ `13e7d9dc` (PR #308, same base) forked at `dc1ba197` without it.
2. **The fix is physically absent at the named tip.** `packages/tokens/src/ide-css.ts` at
   `13e7d9dc` still carries the unfixed unscoped rule `.ide-focus-exit { display: none }`
   (loses the `.ui-btn` cascade → the invisible exit pill keeps a live hit-box — the exact
   F-R7DEP.3-1 mechanism); the scoped `.ide .ide-focus-exit` fix exists only on the #307 branch.
   `D-R7FIX.8-1` itself does not exist in this branch's DEFERRALS (it was appended by the
   250h worker on `r7fix-8-sync-pill`).
3. **Deploying `13e7d9dc` would ship zero product delta vs live `b8307a40`.** The whole
   `b8307a40..13e7d9dc` product-code diff is `packages/journeys/src/steps.ts` +
   `r4-turn-pin.local.test.ts` (leg-side — journeys runs from a checkout, not a deployed
   image) + `Pulumi.prod.yaml` (the `b8307a40` digest re-pins, already live) + records.
   A `pulumi up` would roll all 10 services product-identical, stamp `build.gitSha =
   13e7d9dc`, write a `prod:13e7d9dc` `deployments` row that *reads as though the overlap
   fix is live* — misleading evidence — and the arm-5 `P1.pill` re-walk would fail
   deterministically (the overlap is deterministic ×2 on the same product code at `b8307a40`).
4. **The remedy is outside this arm's authority.** Composing the true tip requires either a
   merge of sibling PR heads or a rebase — a canonical-order decision among #306/#307/#308
   (all three are siblings off `r7deploy-tip`; which lands first is the operator's
   bottom-up call) and a merge act under `mergePolicy: OPERATOR` + this run's "never merge"
   rule. A deploy SHA I compose myself is not the SHA the ruling names; under the
   eight-condition discipline a payload/provenance mismatch → PAUSE, never proceed.

## Eight-condition status

| # | Condition | Status |
| - | --------- | ------ |
| 1 | Preview walk/teardown evidence | carried (same class as R7DEP.3 — pr-293's all-16-green walk + zero-orphan teardown; no new preview in the ruling) — **moot: no deploy** |
| 2 | Image build at tip | **not run** (~$0.5 spend withheld — the tip is wrong) |
| 3 | `pulumi preview --diff` classification | **not run** — the payload classification above is from `git diff`, not a live preview |
| 4 | `pulumi up --stack prod` | **not run** |
| 5 | `check-deploy-provenance` | **not run** — prod still serves `b8307a40` (verified below, $0 read) |
| 6 | `deployments` row | **not written** |
| 7 | Rollback recipe + corpus-in-image | **n/a — no deploy** (the R7DEP.3 recipe stands as prod's rollback) |
| 8 | CDN invalidate `/bff/p/demo~*` | **not run** |
| 5′ | `D-R7FIX.8-1` arm (`P1.pill` at the deployed SHA) | **not run** — cannot discharge at `13e7d9dc`; the fix is absent and the row doesn't exist on this branch |

## Live reads ($0, read-only)

- prod `/healthz` `build.gitSha`: **`b8307a40…`** on web + api (unchanged — R7DEP.3's deploy).
  No prod mutation was attempted at any point in this run.

## What unblocks the deploy (operator/orchestrator decision — recorded, not executed)

Either composition lands the true tip, then this arm re-runs identically at the new SHA:

- **(a) merge order:** operator merges #307 into the chain first (or merges
  `r7fix-8-sync-pill` into `r7fix-9-paid-leg-pin`); the composed head then carries
  `96f6a2e7` + `12f6d889`. Or
- **(b) rebase:** `r7fix-9-paid-leg-pin` rebased onto `stevevitali/r7fix-8-sync-pill`
  (rewrites pushed history — the stronger act; needs its own go-ahead).
- **(c) PR #306 (`paid-u6-run`, records-only)** is also a sibling off `r7deploy-tip`; the
  compose decision should name whether it joins the deploy lineage or merges independently
  — it carries no product code, so it does not affect the deploy payload either way.

At the composed tip: build all-10 → classified `preview --diff` → `pulumi up` → provenance →
`deployments` row → rollback recipe → corpus assert → CDN invalidate, then **two** prod-leg
arms: `P1.pill` for `D-R7FIX.8-1`/`D-R7DEP.3-1` (the sync-pill fix's deployed re-walk) and,
per `D-R7FIX.9-1`, R4's green verdict still rides the Monday paid cron (leg-side; the cron
checks out merged code — no deploy dependency).

## Records

- `nextTicket`/`lastCompleted` **UNCHANGED** (`200_R6WATCH.1`).
- DEFERRALS: dated note appended to `D-R7DEP.3-1` (the prod arm paused — named tip lacks the
  fix; composition decision owed). No rows opened; `D-R7FIX.9-1` unchanged (cron-bound).
- Spend this run: **$0** (git evidence + one `/healthz` read pair; no builds, no legs,
  no cloud mutations).
- **2026-11-09T21:1xZ close:** records committed `02359412` + `14d98504` → **PR #309**
  (base `stevevitali/r7fix-9-paid-leg-pin`) → `ci-boundary.sh --pr 309` — **pass
  `#309@14d9850`** (run 42700670863 — all seven legs + ci-pass anchor;
  `logs/ci-r7deploy-tip2.json`). Checks: `check-append-only.mjs --base
  stevevitali/r7fix-9-paid-leg-pin` — **OK**; `check-build-memory.sh` — **1 violation +
  23 warnings; the violation is PRE-EXISTING/inherited** (an OPEN DEFERRALS row references
  GATE-ACCEPT.R7 whose readout says PASSED — the same standing class recorded at R7DEP.3;
  this diff adds none). Concurrency note: a sibling worker's `stevevitali/r6watch-early`
  (ruling arm (a)) shares this worktree — its HEAD was active mid-run; the records commit
  was moved to `r7deploy-tip2` and `r6watch-early` restored to its pre-run tip `13e7d9dc`
  (local-only, unpushed — no divergence).
