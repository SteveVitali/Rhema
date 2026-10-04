<!--
  docs/build/INTEGRATION_PLAN.md — REC.3 (reconcile-build mode=integration, BM-RECON-03).
  READ-ONLY about git: nothing in this file merges, rebases, or pushes. Every command under
  "Operator procedure" is for the operator to run — the build environment never merges
  (mergePolicy: OPERATOR). Merge dry-runs were produced by
  ~/agent-skills/skills/reconcile-build/scripts/merge-dryrun.sh (git merge-tree / --no-commit
  semantics only) — evidence committed at docs/build/reports/REC.3/.
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
