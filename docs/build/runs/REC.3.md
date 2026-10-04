# REC.3 — integration plan (run ledger)

- **Spec:** `docs/tickets/91_REC.3__integration-plan.md` (manifest row 91, round-3 tail)
- **Base:** `stevevitali/rec-2-spec-reconciliation` @ `498fe89` (PR #112 open; tree verified
  clean at fork; `git log -1` = `498fe891`)
- **Branch:** `stevevitali/rec-3-integration-plan` (mergePolicy=OPERATOR — never merge)
- **Harness:** devin-cli subagent (Cognition agentic coding CLI)
- **Skills:** reconcile-build @ `~/agent-skills` (mode=integration)
- **Started:** 2026-10-04
- **Closed:** 2026-10-04
- **Config:** docs-only reconcile; **Live stage: none**; metered spend **$0**; zero prod
  writes, zero deploys, zero merges

## What this run did

Wrote the merge plan for the whole unmerged stack, a release-notes draft, and the round-4
memo seed. **The contract's stale scope ("PRs #48 → tip, ~64 PRs") was corrected against live
state: PRs #1–#69 are already merged; the unmerged stack is 43 open PRs #70–#112 (+ #113 =
this ticket).**

### `docs/build/INTEGRATION_PLAN.md` (new)

- **External state** — `main` head `5009487` (merge of #69); merge method in use = **merge
  commits**; merges since the chain began = #48–#69 landed bottom-up by the operator
  2026-09-30→10-03; zero non-chain open PRs; the chain still descends from `main`
  (merge-base `79a48be7` = the merged #69 head).
- **PR graph** — all 43 PRs with head/base/mergeable/CI, read via
  `merge-dryrun.sh --ci` at 2026-10-04T19:13Z + `gh pr list`.
- **Merge dry-run (read-only, `git merge-tree` — never merges):** **43/43 clean pairwise**
  (each head onto its declared base) **and 43/43 clean onto `origin/main`** — zero conflict
  hunks anywhere. Evidence committed: `docs/build/reports/REC.3/merge-dryrun-vs-main.json`
  (schema `merge-dryrun/2`) + `merge-dryrun-pairwise.txt`.
- **CI state (read, not fixed):** 20 green (#70–#89) · **21 red (#90–#110)** · 2 pending
  (#111/#112). Reds classified honestly: four transient single-test unit reds at their heads
  (superseded downstream); **two standing reds** — the `public-safe` never-cookies gate
  tripping on ACT.1's `rhema_fp` fingerprint constructs (`apps/web/src/server.ts:378/395`,
  #92→tip) and SEC.3's privsep kernel legs failing in GitHub CI Docker (#101→tip). Fix-forward
  vs waiver = operator decision (plan §7); the worker never fixes CI.
- **Stale-flag finding:** PR #76 shows GitHub `CONFLICTING` — local `merge-tree` proves it
  clean; base drift only (`p1-21` gained `59cf2c4` after `p1-22` forked).
- **Strategy** — merge commits, matching main's history and preserving deployed SHAs as
  ancestors (REQ-ARCH-39); squash and rebase-and-merge both rejected with reasons; the
  stacked-PR base-retarget caveat documented (merge → delete branch → GitHub auto-retargets
  the child to `main`).
- **Copy-pasteable operator procedure** (per-PR retarget → read → `gh pr merge --merge` →
  delete branch → sanity merge-tree), rollback (revert `-m 1`, top-down), post-merge
  verification (deterministic suite + CAP.2 composed leg once prod redeploys at `main`).
- **Provenance reconciliation (§9)** — deployed chain-tip SHAs (`b909fe9a` current prod;
  `5baa666`/`a2b86ce` and the ECON.2 pins pending) reconcile **by ancestry** under merge
  commits — `git merge-base --is-ancestor <sha> origin/main`; the SHA-vs-tree distinction is
  explicit: merge SHAs differ, the check is tree/ancestry equality, with the squash fallback
  (`rev-parse <sha>^{tree}`) documented for completeness. ~30 historical Stage-B deploy SHAs
  tabulated to their containing PRs.

### `docs/build/reports/RELEASE_NOTES_DRAFT.md` (new)

Draft release notes from BUILD_INDEX — highlights, features grouped by phase (#1–#112),
breaking changes, known gaps (accepted backlog rows). Operator edits before publishing.

### `docs/build/planning/2026-10-04_decision-memo.md` (new)

Round-4 seed skeleton: where the build stands; the 7 open operator rulings (GD-RES.2-1,
GD-ACT.1-1, GD-BILL.3-1, BL-30/D-DEF.4-3, ECON.1 metered flip + notice, CITE.1 leg-cap, the
new CI-red decision); the **H2→G2 LIFT path** (BL-40→43→44→45, G2 still the hard gate) and
**BL-31** riding it (needs H2 adjudication data); the 77-row backlog grouped by
operator/round-4/HUMAN landings; candidate round-4 lanes (land the stack → CI.1 fix-forward →
deploy+verify tip → funded-window legs → SLO.2 → ruling executions → MAINT.3); spend posture.

## Verification

- `node docs/build/tools/check-append-only.mjs --base 498fe89` → **append-only OK**.
- `bash ~/agent-skills/skills/build-memory/scripts/check-build-memory.sh .` → **0 violations**
  (baseline warnings unchanged).
- Read-only discipline: `merge-dryrun.sh` is `git merge-tree` only (no checkout, no merge, no
  write to any branch); `gh pr list/view/checks` are reads; **`gh pr merge` never invoked**;
  nothing pushed to `main`.
- No code changed → no `pnpm test`/turbo owed (docs-only reconcile).
- No new DEFERRALS rows: the operator-merge deliverable already lives on BL-01; the CI-red
  finding is recorded in INTEGRATION_PLAN §3/§7 and the round-4 memo (CI.1 candidate), with
  the compensating control being honest reporting + the operator ruling — nothing owed by
  this ticket's ACs is unverifiable.

## Spend / live claims

**$0.** Zero prod writes, zero deploys, zero merges, zero live legs. Every prod/live fact
cited (deployed SHAs, SLOs, spend) is quoted from committed run ledgers and BUILD_INDEX.

## Deviations

- **Scope correction (dated):** the ticket's round-3 note said "PRs #48 → the round-3 tip
  (~64 PRs)"; the operator merged #48–#69 meanwhile, so the plan covers the live state (43
  open PRs) and says so in its scope note — the stale framing is preserved here for the
  record.
