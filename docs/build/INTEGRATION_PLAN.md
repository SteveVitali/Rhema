<!--
  docs/build/INTEGRATION_PLAN.md — REC.3 (reconcile-build mode=integration, BM-RECON-03).
  READ-ONLY about git: nothing in this file merges, rebases, or pushes. Every command under
  "Operator procedure" is for the operator to run — the build environment never merges
  (mergePolicy: OPERATOR). Merge dry-runs were produced by
  ~/agent-skills/skills/reconcile-build/scripts/merge-dryrun.sh (git merge-tree / --no-commit
  semantics only) — evidence committed at docs/build/reports/REC.3/.
  2026-10-10 (SPAREC.3): the round-4 section appended below (§R4.0 onward). The round-3
  body (§1–§11) stands untouched — its "Read at" values are 2026-10-04 facts; §R4.1
  re-reads every one of them against today's git/GitHub state.
-->
# Integration plan — landing the stacked chain

**Read at:** 2026-10-04T19:13Z (CI state) / 2026-10-04 (git state) · **mergePolicy:** OPERATOR
**Scope note:** the REC.3 contract was written against the 2026-09-30 world ("PRs #48 → tip").
The operator has since begun landing the chain: **PRs #1–#69 are merged**; the unmerged stack
is now **43 open PRs, #70 → #112** — plus **#113 (this ticket)** stacking on #112 when pushed.
This plan covers the stack as it exists today.

## 1 · External state

| Fact | Value | How verified |
|---|---|---|
| `main` head | `5009487` ("Merge pull request #69 … p1-15-ingestion") | `git log -1 origin/main` |
| Merge method in use | **merge commits** (`Merge pull request #N` for every #1–#69; a few "Merge branch 'main' into <stack-branch>" forward-merges between retargets) | `git log --merges origin/main` |
| Merges since the chain began | PRs #48–#69 landed bottom-up 2026-09-30 → 2026-10-03, by the operator | `gh pr list --state merged` |
| Open non-chain PRs | **none** — all 43 open PRs are chain rows | `gh pr list --state open` |
| Chain still descends from `main` | **yes** — `merge-base(origin/main, chain-tip)` = `79a48be7` = the merged `p1-15-ingestion` head (PR #69's head) | `git merge-base` |
| Stack drift | one case: `p1-21-protocols-2-4` gained `59cf2c4` (upstream-diff fix) **after** `p1-22-launch-checks` forked — GitHub flags #76 CONFLICTING (stale); local `git merge-tree` = **0 conflict markers** | `git merge-tree` |
| Prod deploys | **pre-merge chain SHAs** — prod currently serves `b909fe9a` (inside PR #100); pending deploys pinned at `5baa666`/`a2b86ce` (inside PR #104) and the ECON.2 pin (inside #105) | run ledgers; `git merge-base --is-ancestor` |

## 2 · The PR graph (open stack, bottom → top)

`merge` column = `merge-dryrun.sh` pairwise result (head onto declared base) **and** onto
`origin/main` — all 43 are clean on both checks. `CI` = `ci-boundary.sh --no-wait` read of the
PR's checks at 2026-10-04T19:13Z (one read per PR). `gh` = GitHub's own mergeable flag.

| PR | head | base (declared) | Ticket | gh | pairwise | vs main | CI |
|---|---|---|---|---|---|---|---|
| #70 | `257b880` | p1-15-ingestion (merged) | P1.16 Billing, full | MERGEABLE | clean | clean | pass |
| #71 | `b917e71` | p1-16-billing | P1.17 Landing/onboarding/Showcase | MERGEABLE | clean | clean | pass |
| #72 | `7890f4c` | p1-17-landing-onboarding | P1.18 Export + provenance appendix | MERGEABLE | clean | clean | pass |
| #73 | `90d0db8` | p1-18-export | P1.19 Notifications/Inbox | MERGEABLE | clean | clean | pass |
| #74 | `eab0cf3` | p1-19-notifications-inbox | P1.20 Settings/account/privacy | MERGEABLE | clean | clean | pass |
| #75 | `59cf2c4` | p1-20-settings-account | P1.21 Protocols 2–4 | MERGEABLE | clean | clean | pass |
| #76 | `edeee37` | p1-21-protocols-2-4 | P1.22 Security hardening + launch checks | **CONFLICTING (stale — see §3)** | clean | clean | pass |
| #77 | `ab3287e` | p1-22-launch-checks | DEF.1 Run-pipeline blockers | MERGEABLE | clean | clean | pass |
| #78 | `649442e` | def-1-run-pipeline-blockers | DEF.2 Ledger/metering integrity | MERGEABLE | clean | clean | pass |
| #79 | `351177c` | def-2-ledger-metering-integrity | DEF.3 Live noise + polish | MERGEABLE | clean | clean | pass |
| #80 | `6bf466f` | def-3-live-noise-and-polish | STB.4 Real-money external (legs held) | MERGEABLE | clean | clean | pass |
| #81 | `f0247ed` | stb-4-real-money-external | SEC.1 Tenant isolation (DB role split) | MERGEABLE | clean | clean | pass |
| #82 | `68f236d` | sec-1-tenant-isolation-in-depth | HOT.1 Prod hotfix pack | MERGEABLE | clean | clean | pass |
| #83 | `a2bf831` | hot-1-prod-hotfix-pack | JOURNEY.1 Browser-journey acceptance | MERGEABLE | clean | clean | pass |
| #84 | `30ff7e3` | journey-1-browser-journey-acceptance | MAINT.2 Build-memory hygiene | MERGEABLE | clean | clean | pass |
| #85 | `6807b21` | maint-2-build-memory-hygiene | RES.1 Review research restore | MERGEABLE | clean | clean | pass |
| #86 | `d045628` | res-1-review-research-restore | RES.2 Unverified delivery + refund | MERGEABLE | clean | clean | pass |
| #87 | `867cabf` | res-2-unverified-delivery-and-refund | BILL.3 Credit purchase path | MERGEABLE | clean | clean | pass |
| #88 | `762f4c2` | bill-3-credit-purchase-path | ECON.1 Charge what we meter | MERGEABLE | clean | clean | pass |
| #89 | `29213dc` | econ-1-charge-what-we-meter | EST.1 One estimate everywhere | MERGEABLE | clean | clean | pass |
| #90 | `5eeb392` | est-1-one-estimate-everywhere | RPT.1 Live meter + run report | MERGEABLE | clean | clean | **FAIL unit** (§3a) |
| #91 | `61f64c2` | rpt-1-live-meter-and-run-report | SEC.2 Signup admission throttle | MERGEABLE | clean | clean | **FAIL unit** (§3a) |
| #92 | `dfbb466` | sec-2-signup-admission-throttle | ACT.1 Trial entitlement | MERGEABLE | clean | clean | **FAIL public-safe** (§3b) |
| #93 | `52629b3` | act-1-trial-entitlement | ONB.1 Import latency + held draft | MERGEABLE | clean | clean | **FAIL public-safe** (§3b) |
| #94 | `4331be0` | onb-1-import-latency-held-draft | EDIT.1 Edit path | MERGEABLE | clean | clean | **FAIL unit** (§3a) |
| #95 | `dc55282` | edit-1-edit-path | RUN.1 Run + chat defects | MERGEABLE | clean | clean | **FAIL public-safe** (§3b) |
| #96 | `979b187` | run-1-run-and-chat-defects | OBS.1 Observability | MERGEABLE | clean | clean | **FAIL public-safe** (§3b) |
| #97 | `c3d776c` | obs-1-observability | SLO.1 Prod SLO remediation | MERGEABLE | clean | clean | **FAIL unit** (§3a) |
| #98 | `1037752` | slo-1-prod-slo-remediation | UX.1 Copy/IA/brand | MERGEABLE | clean | clean | **FAIL public-safe** (§3b) |
| #99 | `2966dd2` | ux-1-copy-ia-brand | UX.2 Layout/responsive | MERGEABLE | clean | clean | **FAIL public-safe** (§3b) |
| #100 | `1d6039e` | ux-2-layout-responsive | DEF.4 Ledger closeout + refund window | MERGEABLE | clean | clean | **FAIL public-safe** (§3b) |
| #101 | `4a66704` | def-4-ledger-integrity-refund-window | SEC.3 Run-task confinement | MERGEABLE | clean | clean | **FAIL integration + public-safe** (§3b/§3c) |
| #102 | `9920ca4` | sec-3-run-task-confinement | OPS.1 Preview stages | MERGEABLE | clean | clean | **FAIL integration + public-safe** |
| #103 | `b070d60` | ops-1-preview-stages | OPS.2 IaC drift/cost/turbo cache | MERGEABLE | clean | clean | **FAIL integration + public-safe** |
| #104 | `685f633` | ops-2-iac-drift-cost-cache | CITE.1 Citation completeness | MERGEABLE | clean | clean | **FAIL integration + public-safe** |
| #105 | `bbe1e95` | cite-1-citation-completeness | ECON.2 COGS levers | MERGEABLE | clean | clean | **FAIL integration + public-safe** |
| #106 | `0465c66` | econ-2-cogs-reduction | STB.5a Headless live legs | MERGEABLE | clean | clean | **FAIL integration + public-safe** |
| #107 | `6397c1f` | stb-5a-headless-live-legs | STB.5b Bounded paid legs | MERGEABLE | clean | clean | **FAIL integration + public-safe** |
| #108 | `b8b9ec0` | stb-5b-bounded-paid-legs | CAP.1 Coverage matrix | MERGEABLE | clean | clean | **FAIL integration + public-safe** |
| #109 | `76a9d8c` | cap-1-capstone-gap-analysis | CAP.2 Composed verification | MERGEABLE | clean | clean | **FAIL integration + public-safe** |
| #110 | `a5a0142` | cap-2-composed-verification | CAP.3 Capstone closure | MERGEABLE | clean | clean | **FAIL integration + public-safe** |
| #111 | `86b6510` | cap-3-capstone-closure | REC.1 Backlog + readiness | MERGEABLE | clean | clean | pending (first job running at read time) |
| #112 | `498fe89` | rec-1-backlog-and-readiness | REC.2 Spec reconciliation | MERGEABLE | clean | clean | pending (first job running at read time) |
| #113 | (this ticket) | rec-2-spec-reconciliation | REC.3 Integration plan | — | clean (forked from #112 tip) | — | — |

**Summary: 43 open PRs · 43/43 merge clean pairwise and onto `main` (0 conflict hunks) ·
20 green CI · 21 red CI · 2 pending.** Evidence:
`docs/build/reports/REC.3/merge-dryrun-vs-main.json` (script JSON, schema `merge-dryrun/2`),
`docs/build/reports/REC.3/merge-dryrun-pairwise.txt` (43 pairwise runs).

## 3 · The red PRs — what each failure is

**§3a — transient unit-test reds (#90, #91, #94, #97).** Single-test failures at those head
SHAs: the `packages/journeys` registry ready-to-flip list (#90/#91 — R6 was flipped mid-PR and
the assertion's expected list lagged a commit) and `check-additive-migrations.test.mjs` (#94).
The same `typecheck / lint / unit` job is **green on #92's, #95's, #98–#100's and later heads** —
each red is a snapshot inconsistency inside its own PR, already superseded downstream. No
operator action; they merge carrying an honest red check on an intermediate head.

**§3b — standing red: `public-safe` "never-cookies" gate (#92 → #110, will recur on #111–#113).**
Introduced by ACT.1 (#92): the gate flags two credential-shaped constructs in
`apps/web/src/server.ts` — `:378` `c.req.header("cookie")` and `:395`
`c.header("set-cookie", FP_COOKIE …)` — which are the **`rhema_fp` trial fingerprint cookie**
(a first-party, HttpOnly anti-abuse fingerprint — not a credential and not on the ingestion
surface in the AC-I-B sense). Real check failure, not a merge conflict; likely resolution is a
gate allowlist/scope refinement or restructuring the fingerprint read. **Needs a fix-forward
ticket or an operator waiver before the affected PRs go green** — see §7 options.

**§3c — standing red: `integration` privsep kernel legs (#101 → #110, will recur).**
Introduced by SEC.3 (#101): `apps/run-task/src/privsep.docker.test.ts` runs the **production
distroless image** under Docker with `CAP_SYS_ADMIN/SETUID/SETGID/SYS_CHROOT`; in the GitHub
runner the kernel legs fail (`setresgid: Operation not permitted`, `unshare`/`mount` EACCES).
The same confinement was exercised live on the GKE node under the `rhema-run-task` AppArmor
profile (SEC.3 Stage B, run `01M41AE99…`), so this reads as a **CI-environment capability gap**,
not evidence the confinement is broken — but it is unproven in CI until the test or the runner
flags change. Needs a fix-forward (runner `seccomp`/`userns`/cap set, or a documented
skip-in-CI-with-live-proof clause) — §7 options.

**§3d — #76 `CONFLICTING` is stale.** `p1-21` gained `59cf2c4` after `p1-22` forked
(merge-base `62c9654`; p1-21 +1, p1-22 +12 incl. the ledger rows). `git merge-tree` of the pair
produces **zero** conflict hunks — the fixup touches `packages/protocols` files p1-22 never
edited. GitHub's flag will clear on recompute or when #75 lands and #76 retargets to `main`.

## 4 · Merge order — bottom-up, strictly

Merge in PR-number order: **#70, #71, …, #112, #113**. Never out of order: each PR's head
contains its ancestors' history, so merging #N+1 before #N drags #N's unreviewed content into
`main` inside #N+1's merge — and later makes #N's own merge a no-op that still records
"merged". Bottom-up also keeps the retargeting mechanical (§5/§6).

## 5 · Merge strategy

| Strategy | Verdict |
|---|---|
| **Merge commit (`gh pr merge --merge`)** | **RECOMMENDED — matches `main`'s existing history** (all 69 prior merges are merge commits) and preserves deployed SHAs as literal ancestors of `main` → REQ-ARCH-39 provenance reconciles by ancestry (§9). |
| Squash | **Against.** Each PR lands as one new commit whose SHA matches nothing deployed: ~30 `deployments` provenance rows and every `/healthz` `gitSha` would name commits that never exist on `main`, degrading reconciliation to tree-equality only and orphaning the per-commit history the run ledgers cite. |
| Rebase-and-merge | **Against, and worse than squash.** Rewrites every commit's SHA — every deployed SHA, every `prod:<sha>` deployments row, and every `runs/*` ledger's recorded tip becomes unreachable from `main`; and each PR would have to be rebased by hand anyway (43 rebases). |

**The stacked-PR caveat.** Each open PR's `base` is its parent's head branch, not `main`. As a
parent lands, the child's base must be retargeted to `main` — either explicitly
(`gh pr edit <n> --base main`) or automatically: **when a merged PR's head branch is deleted,
GitHub retargets open PRs based on it to that PR's base** — which is `main` once the parent is
merged into `main`. The #48–#69 landings used exactly this flow (with a few manual
`main`-into-branch forward merges where retargeting lagged). Recommended: merge → delete the
merged branch → GitHub auto-retargets the child → repeat. Alternative: retarget each child by
hand immediately after each merge if branch deletion is undesirable — do **not** leave a child
pointed at a merged branch and merge it, or its content lands on the stale branch, not `main`.

**On the red PRs.** The merge itself is clean for all 43; the reds are check failures, not
conflicts. §7 gives both paths (fix-first vs merge-with-documented-red). Either way, **a red PR
merged is a red PR recorded** — the plan does not hide them; see §3 for what each is.

## 6 · Operator procedure (copy-pasteable)

Prereqs: `gh auth status` green; a clean checkout of this repo; `git fetch origin --prune`.

```bash
# === One-time: snapshot the graph (read-only) ===
git fetch origin '+refs/heads/stevevitali/*:refs/remotes/origin/stevevitali/*'
gh pr list --state open --limit 100 --json number,headRefName,baseRefName,mergeable

# === Per PR, in order 70 → 113 ===
PR=70   # repeat for each number in order

# 1. Retarget the base to main (only needed for the FIRST PR after a parent lands if
#    branch deletion auto-retargeted already — safe to run idempotently):
gh pr edit $PR --base main

# 2. Read the state (never assume): mergeable + checks
gh pr view $PR --json mergeable,mergeStateStatus
gh pr checks $PR            # see §3 for the two known standing reds on #92-#110

# 3. Merge — merge commit, matching existing history and preserving deployed SHAs:
gh pr merge $PR --merge     # or the UI "Create a merge commit" — NOT squash, NOT rebase

# 4. Delete the merged head branch — this auto-retargets the child's base to main:
git push origin --delete stevevitali/<branch-for-$PR>

# 5. Sanity before the next one (read-only):
git fetch origin main && git merge-tree $(git merge-base origin/main origin/stevevitali/<next-branch>) origin/main origin/stevevitali/<next-branch> | grep -c '^<<<<<<<'
#   → expect 0

# 6. Next PR. After #113 lands: jump to §8 post-merge verification.
```

**Batching guidance.** #70–#89 are CI-green — land them in one sitting. At #90 you reach the
red region; decide §7 first. Merging in order also means the two standing reds (§3b/§3c) can be
fixed **mid-landing**: a fix-forward PR can be inserted at the tip at any point and merged last
— it does not change the order of the stack below it.

**What NOT to do:** never merge with `--rebase` or `--squash` (§5); never merge a child into
its stale parent branch; never merge top-down; never `git push` to `main` directly (branch
protection notwithstanding — merges go through the PRs so checks and history record honestly).

## 7 · Options for the two standing reds (operator decision)

The stack is mergeable either way. The reds are real check failures with honest explanations
(§3b, §3c), not conflicts:

- **Option A — fix-forward first (recommended):** land a small fix ticket at the tip (gate
  allowlist/scope for the `rhema_fp` constructs; runner capability or documented skip-with-
  live-proof for the privsep legs), then land the stack. Every PR still shows its red on its
  historical head, but the tail and post-merge `main` are green — the cleanest record.
- **Option B — merge with documented red:** land all 43 accepting §3b/§3c as known failures
  (each is explained above and in this file; the product-side legs were exercised live under
  SEC.3 Stage B and ACT.1 Stage B). The `deployments`-style provenance and mergeability are
  unaffected; `main` then carries a failing `public-safe` + `integration` until the fix lands.
  A 7-col `waiver` row in LEDGER GATE DECISIONS can record the operator's acceptance per PR
  (`kind=waiver`, names `#<n>` and the check) — the mechanism exists for exactly this.
- **Not an option:** silently landing, or having the build worker "fix" CI — CI is read and
  reported, never fixed by the reconciler; fixing is a normal ticket.

## 8 · Post-merge verification — run once the chain is on `main`

```bash
git checkout main && git pull
pnpm install
pnpm turbo build lint typecheck      # the green gate (135 packages at last read)
pnpm test                            # full vitest (4,552+ at last read)
pnpm check:licenses                  # licence allowlist + exceptions
pnpm check:protocol-markers          # no protocol IP in public bundles
node scripts/compute-protocols-version.mjs   # prints 0.4.0+<sha>, no drift
node scripts/check-upstream-diff.mjs         # ported skills vs vendored pin
node docs/build/tools/check-append-only.mjs --base 79a48be7
bash ~/agent-skills/skills/build-memory/scripts/check-build-memory.sh .
bash ~/agent-skills/skills/reconcile-build/scripts/check-backlog.sh docs/build/BACKLOG.csv
```

Then the live half: run the **CAP.2 composed verification** (`docs/build/COMPOSED_E2E_REPORT.md`'s
procedure — `pnpm test` + the JOURNEY.1 registry against the deployed prod SHA) once prod is
redeployed at the merged `main` tip (deploy queue: D-CITE.1-1 `5baa666` images, D-ECON.2-1,
then a `main`-tip deploy). Confirm `api.rhema.tools/healthz` + `rhema.tools/healthz`
`build.gitSha` equals a commit reachable from `main`.

## 9 · Provenance reconciliation — deployed chain-tip SHAs vs post-merge `main`

Prod has been deployed **pre-merge** from chain-tip SHAs since STB.1 (operator-authorized,
ADR-013 window): every `deployments` row and every `/healthz` `build.gitSha` names a commit on
a stacked branch, not on `main`.

| Deployed SHA | Source | In PR | Status |
|---|---|---|---|
| `b909fe9a` | DEF.4 deploy, `pulumi up` update 134 | #100 | **current prod** (`api/web /healthz`) |
| `5baa666` (+ pin commit `a2b86ce`) | CITE.1 images built, `pulumi up` blocked on credential | #104 | pending (D-CITE.1-1) |
| `bbe1e95` tip pins | ECON.2 pins | #105 | pending (D-ECON.2-1) |
| `4fcf03e`, `f3c7e13`, `6a36dde`, `86441d6`, `987ce00`, `d3d904d`, `34d1439`, `3ee862f`, `7833ece`, `d15e1bd`, `28019fc`, `13e8b95`, `e264219`, `c3eafa5`, `5534d93`, `67b1844`, `b75581c`, `fad33a0`, `5ce9d84`, `a3bcde6`, `76e00c5`, `8ce4038`, `3c3d7a7`, `552ed9a`, `a828f01`, `4d2906f`, `6723784`, `ead193c` | per-PR Stage-B deploys | #76–#104 | historical — superseded by `b909fe9a` |

**Why SHA equality is the wrong check:** a merge creates a new merge-commit SHA on `main`; the
deployed SHA and the merge SHA are different objects describing the same tree lineage. And
under squash/rebase even the content would arrive under fresh SHAs. **The check is
tree/ancestry equality, not SHA equality:**

**With merge-commit landings (recommended, §5) — the check degenerates to ancestry:**

```bash
# For each deployed SHA d, after its containing PR lands on main:
git merge-base --is-ancestor b909fe9a origin/main && echo "PROVENANCE-OK: b909fe9a in main history"
# b909fe9a must be reachable from main once PR #100 lands; 5baa666 once #104 lands.
git log --oneline b909fe9a..origin/main    # = exactly the code deployed-prod does NOT yet run
```

Because every deployed SHA is an ancestor of its PR's head, merge commits carry the deployed
commit itself into `main`'s history — `deployments` rows keep naming real objects and
REQ-ARCH-39's "any artifact traces to the exact harness and skill text" holds verbatim.

**Tree-for-tree fallback (only if some PR is landed by squash):** the deployed SHA never
exists on `main`; reconcile its **tree** instead of its SHA:

```bash
# d deployed, landed via squash commit s (a PR head deploy):
[ "$(git rev-parse d^{tree})" = "$(git rev-parse <s>^{tree})" ] && echo "tree-equal"
# For a mid-PR deploy (deploy ran before the PR's last commits), the honest form is:
git diff d <squash-commit>    # must enumerate ONLY that PR's post-deploy commits — a bounded,
                               # reviewable delta, never a surprise
```

Mid-PR deploys under squash cannot be proven by a single tree comparison; that is the concrete
reason §5 recommends merge commits — **the operator's existing practice already preserves
provenance exactly**.

**Post-merge reconciliation statement (for the release note / ops record):** after the stack
lands, run `git merge-base --is-ancestor` over the table above and record each SHA as
`in-history` — that output, plus `git log b909fe9a..origin/main` (the undeployed delta), is
the provenance reconciliation the operator attaches to the next prod deploy (`pulumi up` of
the `main` tip; the `deployments` row then records a `main` SHA for the first time).

## 10 · Rollback

Merges to `main` are permanent; undo with reverts, not resets (shared history):

- **Back out one PR:** `git revert -m 1 <merge-commit-sha> && git push` — `-m 1` keeps the
  first-parent (main) side; lands a revert commit on `main`. The reverted PR can be re-merged
  later via a *revert-of-the-revert* branch (standard stacked-revert procedure).
- **Back out a run of PRs** (e.g. everything after #95): revert the merge commits in
  **reverse order** (newest first) — each revert applies cleanly on top of the previous.
- **A mid-stack revert leaves descendants' content in place.** If PR #k is reverted after #k+1
  already merged, #k+1's content (which was built on #k's) stays — diff `main` against the
  desired state and decide whether later PRs also revert. Prefer reverting top-down.
- **Do not force-push `main`.** Do not delete the merge commits' history.
- A PR that turned out red-after-merge is fixed forward (§7 Option A), not reverted, unless
  the check is gating real work.

## 11 · Hazards / notes

- #76's GitHub `CONFLICTING` is stale base-drift — merges clean (§3d).
- #111/#112 CI was pending at read time; being docs-only they inherit the §3b/§3c reds once
  their runs reach `public-safe`/`integration`.
- Prod drifts ahead of `main` continuously (pre-merge deploys) — that is the documented
  arrangement, and §9 is the reconciliation. Merging the stack does not deploy anything.
- The `deployments`-row table above is illustrative; the authoritative provenance is the
  `deployments` table + each run ledger's recorded tip SHA.

---

# Round 4 — the SPA stack: merge + activation plan (SPAREC.3, 2026-10-10)

**Read at:** 2026-10-10T16:05Z (git + `gh` state) · **mergePolicy:** OPERATOR — this
section, like the whole file, merges nothing; every command is for the operator.
**Scope:** the open stack as it exists today — **69 open PRs, #98 → #166** — plus
**#167** (this ticket's own PR, `stevevitali/sparec-3-integration-plan` stacked on
`stevevitali/sparec-2-spec-reconciliation`) and the two SPADOC tail rows still to be
authored (expected #168/#169 — docs-only, deploy-neutral). The round-3 body above
(§1–§11) was written for a 2026-09-30 world; §R4.1 is the honest re-read.

## R4.1 · External state (re-read this run)

| Fact | Value | How verified |
|---|---|---|
| `main` head | `c13d865` — "Merge pull request #97 … slo-1-prod-slo-remediation" | `git log -1 origin/main` |
| Merge method | **merge commits** — unchanged; `Merge pull request #N` through #97 | `git log --merges origin/main` |
| Round-3 chain merged through | **PR #97 (SLO.1)** — §1's "#1–#69 merged" is stale; the operator has landed through #97 | `gh pr list --state merged` |
| Open stack | **#98–#166 contiguous, 69 PRs** — round-3 tail #98–#118 (21 PRs) + round-4 #119–#166 (48 PRs); every open PR is a chain row | `gh pr list --state open` |
| #98's declared base | **`stevevitali/slo-1-prod-slo-remediation` — a MERGED branch** (the branch wasn't deleted after #97 landed; its head `b1800e1` is an ancestor of `main`) → retarget to `main` as step 0 | `gh pr view 98`, `git merge-base --is-ancestor` |
| Chain-vs-`main` merge-base | `b1800e1` for #98 (slo-1's final head — IN #98's history); `c3d776c` for everything #99 and above (see §R4.6 drift) | `git merge-base` |
| Prod deployed provenance | web `6ebb1cb76e14be8bfa6c6dc0731932c9011e6224` · api `0acd16d0f6d5af473f28815b7358140d70e39146` — both commits **inside unmerged PR #118's branch** (`res-3-leg1a-zero-coverage`), `merge-base --is-ancestor`-verified against tip `d263808` (238 commits ahead of `c3d776c`) | `/healthz` read 2026-10-10 (SPACAP.2 report §0) + `git merge-base` this run |
| Round-4 code on prod | **zero** — `/bff/app` 404; `data-renderer`/`data-mounted`/`data-route`/`spa-root` absent on `/` `/login` `/showcase` `/pricing` | SPACAP.2 §0 curl record |
| `check-additive-migrations`/never-cookies reds (old §3a/§3b) | **resolved in code, on `main` already** — `b1800e1` ("record migration 0054 in the additive-migration baseline; scope rhema_fp out of never-cookies") merged via #97; the same rhema_fp scope was independently re-committed inside the stack (`406cbcc` ux-2, `ce36fe0` def-4, `56fee60` sec-3) | `git log b1800e1`, `git log` per branch |
| `integration`/privsep red (old §3c) | **intermittent, waived class** — `d60a70d` (on the res-3 line) skips the mount-namespace legs where the runner can't unshare; `integration` is green on #98/#129 but red on #157/#161 (same `privsep.docker.test.ts` GH-runner kernel-capability failure, log-verified this run — `docker run --cap-add SYS_ADMIN` → EACCES). GD-MAINT.4-1's waiver covers this class on every descendant | `gh pr checks` reads + `gh run view --job 114082167023` |
| Pending pinned deploys | D-CITE.1-1 (`5baa666`, inside #104) + D-ECON.2-1 (`bbe1e95`, inside #105) — **both ancestors of the deployed SHAs**: prod already runs their code via the later RES.3/MAINT.5 deploys; their dedicated deploys are superseded | `git merge-base --is-ancestor 5baa666 6ebb1cb`, `… bbe1e95 0acd16d` |
| MAINT.5 | **folded, no dedicated PR** — its fix (`6ebb1cb`, "admit accounts.google.com in CSP form-action") + deploy record (`666640c`) are commits inside #118's branch; prod already runs it on web | `git log --all --grep=form-action`, branch-contains |

## R4.2 · Composition with the round-3 chain (the Q-7 answer, honestly)

Q-7 ruled the rounds on independent schedules; the STACK resolves them anyway:

- **The round-3 chain is merged through #97 only.** PRs #98–#118 (UX.1 → RES.3 +
  DOC.1/DOC.2/MAINT.3/MAINT.4/MAINT.5-folded) are unmerged and sit **below** the
  round-4 stack — `spa-1`'s declared base is `res-3-leg1a-zero-coverage`. The round-4
  chain cannot reach `main` without the round-3 tail landing first. **Merge order is
  stack order, not round order:** #98 → tip, bottom-up, no exceptions.
- **Provenance stays exact under merge-commit landings.** The deployed SHAs
  (`6ebb1cb`/`0acd16d`, inside #118) and every pending pin (`5baa666` inside #104,
  `bbe1e95` inside #105) are ancestors of the chain tip; once #98–#118 merge, each is
  a literal ancestor of `main` — §9's `merge-base --is-ancestor` reconciliation
  applies verbatim. `git log 0acd16d..origin/main` after #118 lands is the round-3
  delta prod does not yet run; segment 1's deploy retires it.
- **The superseded pinned deploys need no replay.** D-CITE.1-1's `5baa666` image set
  and D-ECON.2-1's `bbe1e95` pins named SHAs prod has already passed — their code is
  live on `6ebb1cb`/`0acd16d`. Do NOT dig out the stale digests; the segment-1 deploy
  supersedes both rows' unblock condition (their `deployments`-row disposition records
  `delivered-via-<segment-1-sha>`).

## R4.3 · The open stack (#98 → #167, bottom → top)

Declared bases form one unbroken chain; `gh` reports MERGEABLE on every PR read this
run. (PR numbers ↔ branches ↔ tickets ↔ the activation segment each belongs to —
segment column is §R4.7's cadence.)

| PR | branch | ticket | seg |
|---|---|---|---|
| #98 | ux-1-copy-ia-brand | UX.1 copy/IA/brand | 0 |
| #99 | ux-2-layout-responsive | UX.2 layout/responsive | 0 |
| #100 | def-4-ledger-integrity-refund-window | DEF.4 | 0 |
| #101 | sec-3-run-task-confinement | SEC.3 | 0 |
| #102 | ops-1-preview-stages | OPS.1 | 0 |
| #103 | ops-2-iac-drift-cost-cache | OPS.2 | 0 |
| #104 | cite-1-citation-completeness | CITE.1 | 0 |
| #105 | econ-2-cogs-reduction | ECON.2 | 0 |
| #106 | stb-5a-headless-live-legs | STB.5a | 0 |
| #107 | stb-5b-bounded-paid-legs | STB.5b | 0 |
| #108 | cap-1-capstone-gap-analysis | CAP.1 | 0 |
| #109 | cap-2-composed-verification | CAP.2 | 0 |
| #110 | cap-3-capstone-closure | CAP.3 | 0 |
| #111 | rec-1-backlog-and-readiness | REC.1 | 0 |
| #112 | rec-2-spec-reconciliation | REC.2 | 0 |
| #113 | rec-3-integration-plan | REC.3 (this file's round-3 section) | 0 |
| #114 | doc-1-repo-docs-refresh | DOC.1 | 0 |
| #115 | doc-2-agent-docs-refresh | DOC.2 | 0 |
| #116 | maint-3-funded-window-repairs | MAINT.3 | 0 |
| #117 | maint-4-oauth-signin-throttle | MAINT.4 | 0 |
| #118 | res-3-leg1a-zero-coverage | RES.3 (+ folded MAINT.5) | 0 |
| #119 | spa-1-vite-toolchain-adr106 | SPA.1 | 1 |
| #120 | spa-2-flag-plumbing | SPA.2 | 1 |
| #121 | spa-3-shell-document | SPA.3 | 1 |
| #122 | spa-4-skeleton | SPA.4 | 1 |
| #123 | spa-5-bff-conventions | SPA.5 | 1 |
| #124 | spa-6-journey-harness | SPA.6 | 1 |
| #125 | spa-7-dom-contract-rtl | SPA.7 | 1 |
| #126 | spa-8-safety-gates | SPA.8 | 1 |
| #127 | spa-9-ide-chrome-layout | SPA.9 | 1 |
| #128 | spa-10-surface-usage | SPA.10 | 1 |
| #129 | spaf-1-prod-flip-usage | **SPAF.1 flip: `usage`** | 1 |
| #130 | spa-11-surface-inbox | SPA.11 | 2 |
| #131 | maint-6-nonprod-session-plumbing | MAINT.6 (insert — preview machinery; prod-inert) | 2 |
| #132 | spaf-2-prod-flip-inbox | **SPAF.2 flip: `inbox`** | 2 |
| #133 | spa-12-surface-settings | SPA.12 | 3 |
| #134 | spaf-3-prod-flip-settings | **SPAF.3 flip: `settings`** | 3 |
| #135 | spa-13-surface-voices | SPA.13 | 4 |
| #136 | spaf-4-prod-flip-voices | **SPAF.4 flip: `voices`** | 4 |
| #137 | spa-14-surface-onboarding | SPA.14 | 5 |
| #138 | spaf-5-prod-flip-onboarding | **SPAF.5 flip: `onboarding`** | 5 |
| #139 | spa-15-surface-project-home | SPA.15 | 6 |
| #140 | spaf-6-prod-flip-project-home | **SPAF.6 flip: `project-home`** | 6 |
| #141 | spa-16-surface-billing | SPA.16 | 7 |
| #142 | spaf-7-prod-flip-billing | **SPAF.7 flip: `billing`** | 7 |
| #143 | spa-17-surface-export-ide-chrome | SPA.17 | 8 |
| #144 | spaf-8-prod-flip-export-ide-chrome | **SPAF.8 flip: `export` + `ide-chrome`** (joint) | 8 |
| #145 | spa-18-surface-outline | SPA.18 | 9 |
| #146 | spaf-9-prod-flip-outline | **SPAF.9 flip: `outline`** | 9 |
| #147 | spa-19-surface-figures | SPA.19 | 10 |
| #148 | spaf-10-prod-flip-figures | **SPAF.10 flip: `figures`** | 10 |
| #149 | spa-20-surface-run-sheet | SPA.20 | 11 |
| #150 | spaf-11-prod-flip-run-sheet | **SPAF.11 flip: `run-sheet`** | 11 |
| #151 | spa-21-surface-dossier | SPA.21 | 12 |
| #152 | spaf-12-prod-flip-dossier | **SPAF.12 flip: `dossier`** | 12 |
| #153 | spa-22-surface-run-report | SPA.22 | 13 |
| #154 | spaf-13-prod-flip-run-report | **SPAF.13 flip: `run-report`** | 13 |
| #155 | spa-23-editor-mount | SPA.23 | 14 |
| #156 | spa-24-editor-collab | SPA.24 | 14 |
| #157 | spaf-14-prod-flip-editor | **SPAF.14 flip: `editor` — the LAST flip (REQ-ED-13)** | 14 |
| #158 | spa-25-source-mode-revival | SPA.25 | 15 |
| #159 | spa-26-island-retirement | SPA.26 | 15 |
| #160 | spa-27-ssr-deletion-wave | SPA.27 | 15 |
| #161 | spa-28-override-machinery-removal | SPA.28 (flag machinery deleted — point of no return) | 15 |
| #162 | spacap-1-capstone-gap-analysis | SPACAP.1 | 15 |
| #163 | spacap-2-composed-verification | SPACAP.2 | 15 |
| #164 | spacap-3-capstone-closure | SPACAP.3 | 15 |
| #165 | sparec-1-backlog-readiness | SPAREC.1 | 15 |
| #166 | sparec-2-spec-reconciliation | SPAREC.2 | 15 |
| #167 | sparec-3-integration-plan | SPAREC.3 (this plan) | 15 |
| #168/#169 | (SPADOC.1 / SPADOC.2 — authored after this PR) | docs tail, deploy-neutral | 15 |

## R4.4 · Merge order — bottom-up, strictly; merge commits

Mechanics unchanged from §4–§6 — repeat them here verbatim so this section is
self-contained:

- **Strictly ascending PR number: #98, #99, …, tip.** Never out of order (§4's
  reasoning holds verbatim — each head contains its ancestors' history).
- **Merge commit only** (`gh pr merge $PR --merge`): preserves every deployed SHA and
  every pin as a literal ancestor of `main` — §9's ancestry reconciliation depends on
  it. Never `--squash`, never `--rebase`.
- **Retargeting:** merge a PR → delete its head branch → GitHub auto-retargets the
  child to `main` (the same flow #48–#97 used). Alternative: `gh pr edit <child>
  --base main` by hand immediately after each merge. Never merge a child still
  pointing at a merged parent branch.
- **Per-PR read before merge (§6 verbatim):**

```bash
gh pr view $PR --json mergeable,mergeStateStatus
gh pr checks $PR                       # see §R4.5 for the one waived red class
gh pr merge $PR --merge
git push origin --delete stevevitali/<branch-for-$PR>
# sanity before the next (expect 0 real conflicts; count the LABELED markers — this
# file itself contains literal '<<<<<<<' strings in §6's code fence):
git fetch origin main && git merge-tree \
  $(git merge-base origin/main origin/stevevitali/<next-branch>) \
  origin/main origin/stevevitali/<next-branch> | grep -c '<<<<<<< \.'
```

- **The segment boundary is a merge PAUSE, not just a deploy.** Do not merge into the
  next segment's range until the current segment's deploy + legs + ≥1 nightly green
  are done (§R4.7). Rationale: merging ahead is harmless to activation order (the
  next flip activates only on its own merge+deploy) but it erases the clean
  "deploy-SHA = `main` tip at the boundary" provenance and invites the §R4.13 stop-rule
  violation — never deploy at a SHA past the last fully-verified segment boundary.

## R4.5 · CI state to expect while merging

- **#98 read this run: all five checks green** (`typecheck/lint/unit`, `contracts`,
  `integration`, `images`, `public-safe`) — the old §3a/§3b reds are resolved in code
  on `main` (`b1800e1`; §R4.1).
- **`integration` intermittently red on some later heads** (observed: #157, #161 —
  `apps/run-task/src/privsep.docker.test.ts`, `docker run --cap-add SYS_ADMIN` →
  EACCES, the GH-runner kernel-capability gap `d60a70d`'s skip guard doesn't always
  detect). This is the **GD-MAINT.4-1 waived class** — identical failure shape on the
  base. Record the red honestly per merge (a waiver row per PR is not needed — the
  existing waiver names "this + descendant PRs"); if a check fails that is NOT the
  privsep leg, **stop** — that's a new failure, not the waived class.
- First-read `pending`/`"no checks reported"` on freshly-pushed heads is the chain's
  recurring first-read class — re-read once CI registers before merging.

## R4.6 · Known drift — one predicted conflict, two recorded drifts

- **Predicted union conflict — `scripts/check-additive-migrations.test.mjs`.**
  `ux-1` (#98) was rebased onto slo-1's final head `b1800e1` (carrying the
  migration-0054 baseline line + the `rhema_fp` gate scope-out); the stack above (#99+)
  still descends from the pre-`b1800e1` tip `c3d776c`. When the first upper-stack merge
  replays an edit to the baseline file (the chain adds `0055`–`0058` entries adjacent
  to where `main` now lists `0054`), **expect exactly one conflicted file** — resolve
  by union (keep `main`'s `0054` line AND the chain's additions). Verified this run:
  merge-tree of the whole tip vs `main` = **1 real conflict hunk in that one file**
  (the only other `<<<<<<<` grep hits are literal strings inside §6's code fence).
- **Mid-chain drift (same class as old §3d).** `ux-2`'s head (`406cbcc`, the re-committed
  `rhema_fp` scope fix) advanced after `def-4` forked — GitHub may flag stale
  CONFLICTING; the change exists identically down-chain (`ce36fe0`, `56fee60`) and
  merges clean. The §R4.4 merge-tree sanity is the control per step.
- **`main`-side `.gitleaks.toml` +5 lines** not in the chain — auto-merges; the chain
  never edits that region.

## R4.7 · The activation cadence — 15 segments (Arm A, REQ-SEQ-10 verbatim)

Merging ≠ deploying. The flip PRs are one-line stage-fact changes dormant until their
SHA deploys; activations happen ONLY at deploys, and each deploy must land exactly one
segment's flip surface(s). This is `SPACAP.2_COMPOSED_VERIFICATION.md` §3.1 verbatim —
refined with today's PR numbers and the segment-0 prerequisite:

| # | merge PRs (bottom-up) | deploy activates | per-deploy verify (ALL must pass before the next segment) |
|---|---|---|---|
| 0 | **#98–#118** (round-3 tail; retarget #98 to `main` first) | — none; no SPA code exists above the tip of this range | merge mechanics only — §R4.4 sanity per PR; expect the §R4.6 union conflict at the first `check-additive-migrations` merge. Optional no-op deploy: `main` after #118 ≈ the code prod already runs (`0acd16d` is inside #118) — skip unless the operator wants a clean `main`-SHA deploy row |
| 1 | #119–#129 (SPA.1–10 + **SPAF.1**) | `usage` | session curls: `/usage`, `/p/<slug>/usage` → `data-renderer="spa"`; `?ssr=1` → `data-renderer="ssr"` (pre-cleanup arm) · `rhema-journeys --stage prod --surface usage --expect-renderer spa --expect-sha <sha>` (D-SPAF.1-2) · nightly green (D-SPAF.1-4) |
| 2 | #130–#132 (SPA.11, MAINT.6, **SPAF.2**) | `inbox` | `/app/inbox` markers + `?ssr=1` arm · `--surface inbox --expect-renderer spa` (D-SPAF.2-2; gate = T2.badge, R8.inbox, X1.inbox) · nightly green |
| 3 | #133–#134 (SPA.12, **SPAF.3**) | `settings` | `/settings` + six `/app/settings/*` markers · `--surface settings --expect-renderer spa` (D-SPAF.3-2; T2.matrix, T3, R8.prefs) · nightly green |
| 4 | #135–#136 (SPA.13, **SPAF.4**) | `voices` | `/voices` `/voices/new` `/v/:persona` markers · `--surface voices --expect-renderer spa` (D-SPAF.4-2; T5, X1.voices) · nightly green |
| 5 | #137–#138 (SPA.14, **SPAF.5**) | `onboarding` | `/app/new` markers · `--surface onboarding --expect-renderer spa` (D-SPAF.5-2; N1, N3, N4, P1.app-new) · nightly green |
| 6 | #139–#140 (SPA.15, **SPAF.6**) | `project-home` | `/app` markers · `--surface project-home --expect-renderer spa` (D-SPAF.6-2; R1, R7, T2.badge, T6, T7, P1.project, X1.home) · nightly green |
| 7 | #141–#142 (SPA.16, **SPAF.7**) | `billing` | `/app/billing*` markers · `--surface billing --expect-renderer spa` (D-SPAF.7-2; N9 free legs) · nightly green |
| 8 | #143–#144 (SPA.17, **SPAF.8**) | `export` + `ide-chrome` (joint flip) | `/p/:p/export` markers; framed surfaces gain `<IdeChrome>` · `--surface export,ide-chrome --expect-renderer spa` (D-SPAF.8-2; R5, T4, T8-owed, P1.project) · nightly green |
| 9 | #145–#146 (SPA.18, **SPAF.9**) | `outline` | `/p/:p/outline` + `/outline/promote` markers · `--surface outline --expect-renderer spa` (D-SPAF.9-2; P1.outline — red-step owed-reporting) · nightly green |
| 10 | #147–#148 (SPA.19, **SPAF.10**) | `figures` | `/p/:p/figures`, `/:figureId`, `/visualize` markers · `--surface figures --expect-renderer spa` (D-SPAF.10-2; P1.figures) · nightly green |
| 11 | #149–#150 (SPA.20, **SPAF.11**) | `run-sheet` | `/p/:p/run` markers · `--surface run-sheet --expect-renderer spa` (D-SPAF.11-2; N4, R7, N9, P1.runsheet) · nightly green |
| 12 | #151–#152 (SPA.21, **SPAF.12**) | `dossier` | `/p/:p/review/:runId` markers · `--surface dossier --expect-renderer spa` (D-SPAF.12-2; N7, T1, T12F/T13F/P1.dossier owed-reporting) · nightly green |
| 13 | #153–#154 (SPA.22, **SPAF.13**) | `run-report` | `/p/:p/r/:runId` markers · `--surface run-report --expect-renderer spa` (D-SPAF.13-2; R6F owed-reporting) · nightly green |
| 14 | #155–#157 (SPA.23, SPA.24, **SPAF.14**) | `editor` — last flip | all five Page GETs (`/p/:p`, `/v/:v`, `/v/:n/diff/:m`, `/a/:artifactId`, `/revisions/:cid`) markers + the REQ-ED-12 forced-SSR posture (phone-UA + `showcase:true` still `data-renderer="ssr"`, `collabWsUrl` withheld) + transport probes (`/doc` POST + collab WS through the SSR `page.js` mount arm) · `--surface editor --expect-renderer spa` (D-SPAF.14-2; N8, P1.pill, P1.project, R7, T2.badge, T6, T7 — all expected:green, a miss FAILS; T17 owed-reporting) · **nightly green — gates the cleanup wave** (D-SPAF.14-4) |
| 15 | **after the editor bake only:** #158 → tip (#158–#167 at write time; +#168/#169 when the SPADOC rows land) | cleanup wave + source mode | pre-merge: confirm the step-14 nightly green and every `D-SPAF.*-4` honored in order (D-SPA.26-1/-27-1/-28-1 entry gates) · post-deploy: `/assets/outline.js` → 404; phone-UA `/p/:slug/v/working` → `data-renderer="ssr"` + `page.js`/`ide.js` still served; `?ssr=1`/`x-rhema-renderer` inert (converge on the shell); `--pin-renderer` → exit 2 · then §R4.10's composed verification |

Rollback during the window (segments 1–14): revert the flip's stage-fact line +
redeploy — SSR is restored in one deploy (D-SPAF.*-3 arms). After segment 15:
`git revert` of cleanup commits + redeploy only.

## R4.8 · Deploy procedure — verbatim per segment boundary

Prereqs (§3.0 carried): `pulumi login` valid; `gh` + `gcloud` authed to project
`rhema-507501`; a clean checkout; journey sessions mint on prod through the live
`rhema.tools` mailbox (`JOURNEY_GCP_ACCESS_TOKEN` or `gcloud auth
application-default login`) — **no `rhema-nonprod-resend-api-key` needed** (that secret
gates `pr-<n>` previews only). `$0` legs only — never `--paid` on this path
(REQ-VFY-10).

```bash
# === After a segment's merges land (and ONLY then) ===
git checkout main && git pull --ff-only
SHA=$(git rev-parse HEAD)              # the segment's boundary merge commit — this
                                       # IS the expected provenance SHA everywhere below

# 1. Build images at the boundary SHA (the committed image-set; _SERVICES takes the
#    diff-scoped subset — api+web every segment for provenance parity even when api's
#    diff is empty, because /healthz gitSha is per-image and the gate compares both;
#    add worker/collab/run-task when the segment's merged range diffs their graphs —
#    when in doubt, drop _SERVICES for the full canonical set):
gcloud builds submit --config infra/cloudbuild/image-set.yaml --project rhema-507501 \
  --substitutions _AR=us-central1-docker.pkg.dev/rhema-507501/rhema-prod,_TAG=prod,_GIT_SHA=$SHA,_SERVICES=api,web
gcloud artifacts docker images list us-central1-docker.pkg.dev/rhema-507501/rhema-prod \
  --include-tags --format='table(package,tag,digest)'   # capture each Digest: line

# 2. Pin the new digests (established procedure — Pulumi.prod.yaml serviceImages JSON,
#    + runTaskImageDigest / proxyImage when those were rebuilt; unchanged services
#    keep their current pins):
cd infra/pulumi && pulumi stack select prod
pulumi preview      # EXPECT: Cloud Run ~template image bumps only, plus on flip
                    # segments web env SPA_SURFACES += <key>. ZERO replace/delete and
                    # zero stateful ops — STOP on any (see §R4.13)
pulumi up           # the spend step — record the update number

# 3. Provenance gate FIRST — before any verification leg (the harness itself refuses
#    on a NO-MATCH; SPACAP.2 exercised that refusal on prod):
cd ../..
node scripts/check-deploy-provenance.mjs --expect $SHA \
  --healthz https://rhema.tools --healthz https://api.rhema.tools   # every line PASS

# 4. Write the deployments row (over the IAP tunnel — established practice, e.g.
#    rhema-prod-proxy-k4wp → 127.0.0.1:15432 → 10.46.0.3:5432):
DATABASE_URL='postgresql://<system-role>:<pw>@127.0.0.1:15432/rhema' \
STAGE=prod GIT_SHA=$SHA \
IMAGE_DIGESTS='{"api":"<repo>/api@sha256:…","web":"<repo>/web@sha256:…","worker":"…",
                "fetcher":"…","convert":"…","export":"…","collab":"…",
                "egress-proxy":"…","run-task":"…"}' \
  node scripts/live/record-deployment.mjs    # stamps protocols_version itself; refuses
                                           # if compute-protocols-version returns empty
```

## R4.9 · Per-segment verification legs (the `D-SPAF.*` rows, verbatim)

Per segment, in order — all before the next segment's first merge:

```bash
# (a) marker curls with a prod session cookie (the surface's flagged GETs — the
#     runbook §3.1 row names them; sessions mint through the live mailbox):
curl -s https://rhema.tools/<flagged-route> -H "Cookie: <session>" \
  | grep -o 'data-renderer="spa"'          # present on every flagged GET
curl -s 'https://rhema.tools/<flagged-route>?ssr=1' -H "Cookie: <session>" \
  | grep -o 'data-renderer="ssr"'          # escape arm — segments 1–14 ONLY
                                           # (deleted machinery post-segment-15)

# (b) the flip's journey leg — the D-SPAF.*-2 recipe (registry gates named in §R4.7):
pnpm --filter @rhema/journeys build
pnpm --filter @rhema/journeys exec rhema-journeys --stage prod \
  --surface <key> --expect-renderer spa --expect-sha $SHA \
  --out docs/build/reports/<date>_SPAF.<n>-<surface>     # exit 0; commit the report
#     (segment 8 only: --surface export,ide-chrome)

# (c) the nightly bake — D-SPAF.*-4 / REQ-SEQ-10: ≥1 scheduled journeys run green on
#     prod AFTER this deploy, before the next segment merges. The schedule is
#     .github/workflows/journeys.yml cron "5 6 * * *" (06:05 UTC nightly):
gh run list --workflow journeys.yml --branch main --limit 5
#     confirm: a completed run STARTED after this deploy, conclusion success.
#     Only then open the next segment.
```

## R4.10 · Post-cadence composed verification (BL-82 — after segment 15's deploy)

With `<tip>` = the deployed tip SHA: run `SPACAP.2_COMPOSED_VERIFICATION.md` §3.2–3.5
**verbatim** (they are the recipes, not paraphrased here): provenance gate → (a) the
per-surface `--expect-renderer spa` composed run over all 15 surface keys → (b) the
full free suite `--expect-sha <tip>` → the two-tenant BFF probe (§3.3) → the
public-SSR regression diff vs `docs/build/reports/2026-10-10_SPACAP.2-public-ssr-baseline/`
+ the `--expect-renderer ssr` N10 leg (§3.4) → the zero-CSP walk (§3.5) → plus
D-SPACAP.3-1's G2-fix showcase leg and D-MAINT.4-1's OAuth legs. `ready-to-flip`
reports on the gated `expected:"red"` steps get their `registry.ts` green flip as a
follow-up commit with the report path — that lands as a NEW tail PR, not inside this
chain.

## R4.11 · Arm B — the recorded fallback (compressed verification)

If the operator elects a single tip deploy instead of the cadence (G1's
accepted-amendment path, GATE-ACCEPT.SPA row context): prod jumps all-SSR → all-SPA in
one deploy; the `D-SPAF.*-1` `?ssr=1` curls and any `x-rhema-renderer` pin are inert
request text (read them as inert-signal checks per D-SPA.28-2); the per-surface
`--expect-renderer spa` legs still all run post-deploy (§R4.10's composed form);
rollback is `git revert` of cleanup commits + redeploy — there is no config arm. The
verification ORDER the flip rows encode is compressed, not skipped: every per-surface
leg, the two-tenant probe, the SSR regression, and the CSP walk still execute and
still gate — record the election in the deploy ledger with its reason. The nightly
bakes lose their pacing function under Arm B; REQ-SEQ-10's consequence is exactly the
accepted deviation (BL-83).

## R4.12 · The Resend secret — a parallel track, never a serial blocker

BL-80 / D-MAINT.6-1: `rhema-nonprod-resend-api-key` in Secret Manager `rhema-507501`
was `NOT_FOUND` on every probe through SPA.25. It gates the `pr-<n>` **preview** leg
family only — MAINT.6's session-mint proof, `D-OPS.1-1`, `D-SPA.6-1`, every
`D-SPA.*-1/-2` preview leg/drill. **The prod path above never touches it** — prod
sessions mint through the live `rhema.tools` mailbox; the program refuses the key on
prod fail-closed. Position: the operator may seed it at ANY point — ideally during
the early nightly-bake waits so the preview-leg family produces evidence in parallel;
it never sits on the merge/deploy critical path. The value never enters this file,
any ledger, or any log line.

## R4.13 · Rollback, stop conditions, hazards

**Rollback** (unchanged semantics; PROD-BRINGUP §13.2 is the ops-truth copy):
- Merge layer: §10 verbatim — `git revert -m 1 <merge-sha>`, top-down for ranges;
  never force-push `main`.
- Deploy layer, segments 1–14: revert the flip's stage-fact line in
  `infra/config/stages.ts` + rebuild/redeploy at the reverted SHA → prior renderer in
  one deploy (the `D-SPAF.*-3` arm).
- Deploy layer, post-segment-15: `git revert` the cleanup commits (revert the wave
  bottom-up if the target is inside it) + rebuild/redeploy + re-run the surface legs.
  `?ssr=1`/`x-rhema-renderer`/`rhema:spaSurfaces` are dead machinery — no rollback may
  end in a config edit.

**STOP conditions — pause and report, do not push through:**
- `pulumi preview` shows any replace/delete or a stateful resource diff (the program
  is append/roll-only in this window).
- `check-deploy-provenance` returns anything but all-PASS after a deploy.
- Any marker curl misses `data-renderer="spa"` on a flagged GET (or the `?ssr=1` arm
  misses `"ssr"` pre-cleanup) — revert that segment's flip before proceeding.
- Any `--surface … --expect-renderer spa` leg exits non-zero.
- A nightly journeys run goes red, or shows a new failure class (not the owed/red-step
  class) — the bake gates the next segment; a red nightly resets that segment's bake.
- A PR check fails outside the GD-MAINT.4-1 waived privsep class (§R4.5).
- A merge-tree sanity shows real conflicts beyond the ONE predicted
  `check-additive-migrations` union hunk (§R4.6) — resolve only that file's union;
  anything else means the drift model is wrong.
- Someone asks to deploy at a SHA past the last fully-verified segment boundary —
  the tip-only deploy IS Arm B (§R4.11) and is an explicit operator election, never a
  shortcut taken mid-cadence.

**Hazards:** the segment-1 deploy is a large code jump (round-3 tail + SPA.1–10 at
once) — inherent to the chain, mitigated by the bake cadence on every later surface;
prod drifts ahead of `main` during the whole window (deployed SHAs are chain commits
until #118 lands — §9's reconciliation applies); the cleanup wave is the point of no
return — verify the editor bake record exists before opening segment 15's merges.

---

# Round 5 — the post-SPA stack: merge + deploy plan (R5REC.3, 2026-10-18)

**Read at:** 2026-10-18T01:38Z (merge dry-run + CI) / 2026-10-18T01:40Z (prod
provenance) · **mergePolicy:** OPERATOR — this section merges nothing; every command
is for the operator.
**Scope:** the open stack as it exists today — **22 open PRs, #170 → #191** — plus
**#192** (this ticket's own PR, `stevevitali/r5rec-3-integration-plan` stacked on
`stevevitali/r5rec-2-spec-reconciliation`) and the two R5DOC tail rows still to be
authored (expected #193/#194 — docs-only, deploy-neutral). The round-4 body above
(§R4.*) describes a world where the round-4 chain was unmerged and prod carried
pre-chain ancestors; **that world is gone** — see §R5.1's re-read.

## R5.1 · External state (re-read this run)

| Fact | Value | How verified |
|---|---|---|
| `main` head | `a2cdb75` — "Merge pull request #169 … spadoc-2-agent-docs-refresh" | `git log -1 origin/main` |
| Round-4 chain merged through | **PR #169 (SPADOC.2)** — the entire round-4 stack incl. all 14 SPAF flips, the cleanup wave, and both docs tails is on `main` | `gh pr list --state merged` |
| Merge method | **merge commits** — unchanged through #169 | `git log --merges origin/main` |
| Open stack | **#170–#191 contiguous, 22 PRs** — every open PR is a chain row | `gh pr list --state open` |
| #170's declared base | **`stevevitali/spadoc-2-agent-docs-refresh` — a MERGED branch** → retarget to `main` as step 0 | `gh pr view 170`, `git merge-base --is-ancestor` |
| #172's declared base | **`stevevitali/r5-synthesis` — an un-PR'd planning branch** (22 commits: post-spa-disposition-spec + research wave + the 27-row decompose). It has no PR; its commits land on `main` inside #172's merge. Retarget #172 to `main` after #171 lands | `git log origin/stevevitali/r5-synthesis`, `gh pr view 172` |
| Stack-vs-`main` mergeability | **22/22 clean** — `merge-dryrun.sh` pairwise onto `origin/main`, 0 conflict hunks (evidence: `docs/build/reports/R5REC.3/merge-dryrun.{txt,json}`). The one repeat-change (the SEC.3 privsep skip exists as `dddd2e1` on #171's tip and `625d28a` inside the r5-synthesis line — identical patch, different SHA) resolves itself: same content on both sides | `git merge-tree` via merge-dryrun this run |
| Prod deployed provenance | **`ffbb8ad01b…`** on web + api `/healthz` (read 2026-10-18T01:40Z) — the Arm-B tip deploy (ARMB.2 head), inside open PR **#171**'s history (ancestor of `dddd2e1`; also ancestor of #172 → #191) | live `curl …/healthz` + `git merge-base --is-ancestor` |
| Deploy series | update 148 `b35473d` → 149 `d5a74cc` → 150 `ffbb8ad` → 151 COST.1 lever apply ($285.80→$198.32/mo list recomputed) — all branch SHAs, none on `main` yet | `runs/ARMB-2026-10-14.md`, `reports/2026-10-16_COST.1/` |
| Arm B election | **elected + executed** (GATE DECISIONS `ARMB-1`, 2026-10-14): the 15-segment cadence of §R4.7 was compressed into the single tip deploy; the `D-SPAF.*-3/-4` pacing/rollback arms are DROP-mooted (G1 census); `git revert` + redeploy is the surviving rollback | LEDGER GATE DECISIONS; `r5_g1_dispositions.md` |
| CI at read | **21/22 pass** — #191 pending at read time (docs-only closeout head `c09c4b5`; every earlier head on #191 boundary-confirmed green) | merge-dryrun `--ci` (one read per PR) |

**Provenance consequence.** Merging #170–#171 makes `b35473d`, `d5a74cc`, and
`ffbb8ad` literal ancestors of `main` — the round-3/4-style §9 reconciliation then
holds verbatim for the Arm-B deploys: every `deployments` row and `/healthz` sha
names a real object in `main`'s history. Merge commits only (§R5.3) — squash or
rebase would break exactly this.

## R5.2 · The open stack + segment map (#170 → tip)

| PR | branch | ticket | seg |
|---|---|---|---|
| #170 | armb-1-spa-asset-base | ARMB.1 (corrective — asset base + `data-ssr-cause`) | 0 |
| #171 | armb-2-put-drain-harness-settle | ARMB.2 (corrective — PUT drains + harness settles) | 0 |
| #172 | hygiene-1-memory-hygiene | HYGIENE.1 (+ `r5-synthesis`' 22 planning commits inside) | 1 |
| #173 | fix-1-journey-fixture-repairs | FIX.1 | 1 |
| #174 | verif-1-composed-ffbb8ad | VERIF.1 (+ CIREP.1 ancestor repairs) | 1 |
| #175 | navc-1-delegated-interceptor | NAVC.1 | 2 |
| #176 | navc-5-ssrhandoff-replace-seam | NAVC.5 | 2 |
| #177 | navc-2-settle-contract | NAVC.2 | 2 |
| #178 | navc-3-session-invariants | NAVC.3 | 2 |
| #179 | navc-4-nav-acceptance-legs | NAVC.4 | 2 |
| #180 | r5econ-1-spend-guard-repairs | R5ECON.1 | 3 |
| #181 | r5econ-2-testcheaproute-arm | R5ECON.2 | 3 |
| #182 | r5econ-3-funded-window-regime | R5ECON.3 | 3 |
| #183 | r5ops-1-ops-residuals | R5OPS.1 | 4 |
| #184 | bl38-1-prod-residue-cleanup | BL38.1 | 4 |
| #185 | cost-1-prod-cost-posture | COST.1 | 4 |
| #186 | verif-2-preview-legs | VERIF.2 | 4 |
| #187 | funded-1-funded-window-wave | FUNDED.1 (wave refused at bind — CARRY) | 5 |
| #188 | r5cap-1-capstone-gap-analysis | R5CAP.1 | 5 |
| #189 | r5cap-3-capstone-closure | R5CAP.3 | 5 |
| #190 | r5rec-1-backlog-readiness | R5REC.1 | 5 |
| #191 | r5rec-2-spec-reconciliation | R5REC.2 | 5 |
| #192 | r5rec-3-integration-plan | R5REC.3 (this plan) | 5 |
| #193/#194 | (R5DOC.1 / R5DOC.2 — authored after this PR) | docs tail, deploy-neutral | 5 |

## R5.3 · Merge order — bottom-up, strictly; merge commits

Mechanics unchanged from §R4.4 — restated so this section is self-contained:

- **Strictly ascending PR number: #170, #171, …, tip.** Never out of order; each
  head contains its ancestors' history.
- **Merge commit only** (`gh pr merge $PR --merge`) — preserves the deployed SHAs
  (`b35473d`/`d5a74cc`/`ffbb8ad`) as literal ancestors of `main` (§R5.1). Never
  `--squash`, never `--rebase`.
- **Retargeting:** step 0 is `gh pr edit 170 --base main` (its declared base is a
  merged branch). Then the usual flow: merge → delete the head branch → GitHub
  auto-retargets the child to `main`. For #172 the retarget is manual and required
  (`gh pr edit 172 --base main` after #171 lands) — its base `r5-synthesis` has no
  PR to merge first; the 22 synthesis commits land inside #172.
- **Per-PR read before merge (§R4.4 verbatim):** `gh pr view $PR --json
  mergeable,mergeStateStatus` + `gh pr checks $PR`. The GD-MAINT.4-1 privsep waiver
  class is now code-fixed (the capability-skip skip legs exist on both lines —
  `dddd2e1`/`625d28a`); expect `integration` green throughout, and treat **any**
  non-privsep red as a stop, not a waiver candidate.
- **Merge pause = none in round 5.** Unlike §R4, no merge here gates a flip — the
  boundaries below are **deploy** boundaries. Merges may run straight through
  #170 → tip in one or more sittings; what they may NOT do is trigger a deploy at
  a forbidden SHA (§R5.4).

## R5.4 · Deploy boundaries — the three hard rules, then the segment table

1. **NAVC deploy freeze (carried from `154_NAVC.1`, contract M5).** Between the
   first NAVC merge (#175) and the last (#179) `main` is **not deployable**: the
   delegated interceptor activates client navs that exercise the page-session
   registry, and NAVC.3's destroy-identity fix must ship with it. **NAVC.1 must
   never deploy ahead of NAVC.3** — one segment covers NAVC.1→NAVC.4; the earliest
   legal deploy SHA is #179's merge commit. A deploy at #182's boundary (which
   contains the whole nav stream) also satisfies it; a deploy at #175/#176/#177's
   boundary NEVER does.
2. **The econ regime deploys before any funded-window re-attempt.** Segment 3
   (#180–#182 — spend-guard repairs, `testCheapRoute` arm, the funded regime) must
   be merged AND deployed to prod before a future GATE-R5F re-read / FUNDED retry.
   GD-FUNDED.1-1 ruled CARRY: a later attempt needs **both** (a) a fresh operator
   envelope ruling (re-epoch `FUNDED_ROUND_SINCE` / raise `FUNDED_WINDOW_CAP_USD` /
   continue carrying — never assumed, never scheduled here) and (b) this segment
   live on prod. The mechanical guard fails closed regardless — $80.86 ≥ ~$60
   already proved that at FUNDED.1's bind.
3. **The nightly-green unlock is merge+deploy-bound (BL-74).** The scheduled
   `journeys.yml` nightly asserts provenance = `github.sha` = `main` HEAD — it can
   only read green after the sweep is complete AND a deploy carries the `main` tip
   to prod (§R5.5). No mid-sweep deploy satisfies it; `workflow_dispatch` never does.

| # | merge PRs (bottom-up) | deploy activates | per-boundary evidence recipe |
|---|---|---|---|
| 0 | **#170–#171** (ARMB tail; retarget #170 → `main` first) | none — prod already runs `ffbb8ad` (inside #171); the only product-side delta past it is `dddd2e1`'s CI-test skip. Merging anchors the deployed SHAs in `main` history | merge mechanics only — §R5.3 per-PR read. **Optional** no-op deploy at #171's merge for a `main`-SHA `deployments` row; not required |
| 1 | #172–#174 (synthesis + hygiene + fixtures + VERIF.1) | none required — run-task privsep-check probe + journeys/harness + a tsconfig edge; prod-inert | optional deploy; **last free deploy point before the NAVC freeze** — any deploy after #175's merge must wait for #179's |
| 2 | #175–#179 (NAVC.1→NAVC.4) | **one deploy, at ≥#179's merge commit** — the delegated interceptor, SsrHandoff replace, settle contract, registry destroy-identity fix | hard boundary per rule 1. Post-deploy ($0): `curl` an authed doc → `data-nav-count` present; click-nav leaves `data-mounted` cycling; `rhema-journeys --stage prod --expect-sha <sha> --steps R10` (NAVC.4's acceptance leg; R10.keepalive stays `expected:red` — collab wire is domains-only → D-SPA.24-1); console/`failedRequests` empty |
| 3 | #180–#182 (R5ECON.1–3) | **deploy REQUIRED before any funded re-attempt** — `testCheapRoute` orchestrator arm + spend-guard scope repairs + the funded regime (registry caps, `funded-window.mjs`) | post-deploy, $0: `funded-window.mjs --stage prod --dry-run` prints all nine §5.5 rows and refuses closed without the ruling envs (dsn/cumulative/tenant rows honest); REQ-ECON-6 `req_jrn_` exclusions live; per-leg `capUsd` enforced. **Then, and only then**, a fresh GATE-R5F read may be scheduled — never before |
| 4 | #183–#186 (R5OPS.1, BL38.1, COST.1, VERIF.2) | deploy carries the VERIF.2 product fixes — dossier `compact` Apply-gate, fetcher `HostRateLimiter` clock fix, `/healthz/` alias, server auth-origin reads; COST.1's stage facts are already live (update 151 — the merge lands the code behind the applied config) | post-deploy ($0): `/p/:p/review/:runId` phone arm withholds `[data-apply]`; `GET /healthz/` (trailing slash) 200s on web+api; a first-hit SSRF target on fetcher returns 403 not 429; `pulumi preview` on prod shows **no drift** on the COST.1 levers (already applied) |
| 5 | #187 → tip (#192 + expected #193/#194) | deploy-neutral — docs, evidence, drivers, reports | merge mechanics only. After the tip lands, the **tip deploy** (any boundary SHA ≥ the tip merge) is what unlocks §R5.5 |

Deploys may fold forward (a single tip deploy satisfies every segment boundary —
the Arm-B precedent exists), but they may **never** collapse backward into a
forbidden SHA: no deploy inside segment 2's range, and no funded re-attempt before
segment 3's deploy. Deploy procedure is §R4.8 verbatim (boundary SHA → image set →
`pulumi preview` zero-stateful → `pulumi up` → `check-deploy-provenance --expect`
→ `deployments` row).

## R5.5 · The nightly-green sequencing — BL-74 / REQ-OPS-6 / D-OBS.1-3 / D-SPA.28-1

The scheduled nightly (`.github/workflows/journeys.yml` cron `5 6 * * *` — 06:05
UTC) checks out `github.sha` = **`main` HEAD** on scheduled events, and
`JOURNEY_EXPECT_SHA` pins provenance to that same sha. Consequences:

- **Unlock sequence:** merge sweep complete through the tip → deploy the `main`
  tip → the next **scheduled** run (not `workflow_dispatch` — a dispatch pins the
  dispatched ref, not `main` HEAD) reads `github.sha == deployments.sha == prod
  /healthz`. That run's green satisfies REQ-OPS-6 (first scheduled nightly green),
  D-OBS.1-3's residual arm, BL-74's nightly leg, and D-SPA.28-1's "≥1 nightly
  green" clause (its flip-merge half lands with the sweep).
- A **red** nightly is a finding, not a blocker to fabricate around: record it,
  the rows stay open, and a new failure class pauses the deploy cadence per §R5.7.
- Deploying mid-sweep does **not** help: any SHA below the eventual tip fails the
  `github.sha` equality once later merges land.

## R5.6 · Funded + preview ordering constraints

**Funded (never scheduled spend):** a future funded attempt requires, in order —
(a) segment 3 deployed on prod; (b) a fresh operator envelope ruling
(GD-FUNDED.1-1 = CARRY stands; `FUNDED_ROUND_SINCE` re-epoch or a raised
`FUNDED_WINDOW_CAP_USD` — the worker never sets either); (c) the env arms inside
the ticket (system-role `JOURNEY_DATABASE_URL` over the IAP tunnel;
`funded-tenant.mjs --execute` re-provisioning the reaped `test+jrn-a` tenant +
house grant). The §5.5 checklist re-binds at every dispatch and fails closed —
$0 spent is always an acceptable outcome. Carried legs stay on D-CAP.2-1 +
constituents meanwhile.

**Preview:** VERIF.2's `pr-186` stack was destroyed at closeout (zero
`rhema-pr-186*` orphans; ~$2.9 vs ≤$8) — a future preview wave stands a fresh
`pr-<n>` via `preview-stack.mjs` and is **off the merge/deploy critical path**.
The non-prod Resend secret is seeded (D-MAINT.6-1 DONE 2026-10-16); the
posture-bound residuals stay stage-bound, not merge-bound: D-SPA.24-1 (collab wire
is domains-only), D-SPA.16-1/-20-1 (`stripe_unconfigured` on previews), D-OPS.1-1
(signed-in preview legs) — each names its stage prerequisite on its row.

**Golden (AWAITING):** GD-R5OPS.1-1 — the ~$150–300/night nightly-golden ruling
(⚑ Q-GOLDEN) is an **open operator precondition, recorded, never answered**. The
driver (`scripts/live/nightly-golden-driver.mjs`) refuses `--execute` without
`GOLDEN_BUDGET_RULING=approved`; D-P0.15-4 stays open behind it.

## R5.7 · Stop conditions + rollback, per segment

**STOP — pause and report, never push through:**
- Any PR check fails (the privsep class is code-fixed now — there is no live
  waiver to cite; a red is a red).
- A merge-tree sanity shows a real conflict (all 22 read 0 this run — the repeat
  privsep-skip patch is content-identical; anything else means the drift model is
  wrong).
- `pulumi preview` shows any replace/delete or a stateful-resource diff.
- `check-deploy-provenance` returns anything but all-PASS after a deploy.
- A request to deploy at a SHA inside segment 2's range (contains NAVC.1, lacks
  NAVC.3) — hard refusal; the boundary is recorded, not negotiable.
- A request to open a funded window / GATE-R5F re-read before segment 3's deploy —
  hard refusal; and even after it, only behind a fresh envelope ruling.
- Post-NAVC-deploy: an authed document missing `data-nav-count`, `data-mounted`
  stuck absent through a client nav, or R10 failing on a non-owed arm.
- A scheduled nightly going red, or a `github.sha ≠ deployments.sha` provenance
  mismatch on any journey run.

**Rollback:**
- Merge layer: §10 verbatim — `git revert -m 1 <merge-sha>`, top-down for ranges;
  never force-push `main`.
- Deploy layer, any segment: `git revert` the offending commits + rebuild/redeploy
  — no config arm exists (post-SPA.28). A NAVC-segment revert restores the
  pre-interceptor document-nav posture (MPA-mode) cleanly; the interceptor is
  client-side additive.
- COST.1's lever config is already applied (update 151): rolling its IaC back is a
  stage-fact revert + `pulumi up`, not a merge-layer act — and it re-raises cost.
- BL38.1's executed prod-data deletes are irreversible — recorded, not rollable.
- A bad segment-2/3 deploy is reverted, never flag-flipped; the funded guard stays
  fail-closed the entire time (a rollback cannot open the window).
