# CIREP.1 — Ancestor-PR CI repairs (stack unblock for NAVC.1)

- **Sequence:** 153a · **Phase:** round 5 · **Kind:** ticket (run-time insert — red-CI repair, BM-MANIFEST-03)
- **base_branch:** `stevevitali/fix-1-journey-fixture-repairs` and `stevevitali/verif-1-composed-ffbb8ad` (repaired in place via temp worktrees); memory commits land on `stevevitali/navc-1-delegated-interceptor`
- **Depends on:** 153_VERIF.1 (its branch is one repair target)
- **Run:** `implement-spec spec=docs/tickets/153a_CIREP.1__ancestor-ci-repairs.md`
- **Gate status:** none (operator elected the repair-ticket path 2026-10-15, dispatch question in the crash-recovery session)
- **Live stage:** none (CI-only; zero prod interaction)
- **Production mutations:** none
- **Size budget:** ~40 changed lines + ledger

## Goal
Green the two inherited reds blocking NAVC.1's dispatch — a VERIF.1 close gap (the
pinned journey green-baseline went stale against its own flips) and a FIX.1 close
gap (a declared dev-dep missing its composite project reference) — landing each
repair on the ancestor branch that owns the red, then re-forking the NAVC.1 work
branch onto the repaired chain tip with the crashed worker's WIP preserved.

## Load
- `docs/build/LEDGER.md` — the `blockedOn` line + the two 2026-10-15 boundary-record
  PHASE LOG entries (exact diagnosis, run ids `38662758852` / `38656915693`)
- `docs/build/logs/ci-boundary-174.json` (the ci-boundary/1 record)
- `packages/journeys/src/registry.test.ts:44-77` — the pinned green-baseline `it()`
  whose expected array predates VERIF.1's flips (registry has exactly 53 green
  rows; the pinned list has 46; +7 = 53 — complete)
- `packages/journeys/src/registry.ts` — the flipped rows (each `expected:"green"`
  carries its dated live-evidence comment; all 7 are `paid:false` so the paid-pin
  test is unaffected)
- `packages/db/tsconfig.json` (`references` = `../contracts`, `../protocols` only)
  + `packages/db/package.json` (`devDependencies["@rhema/findings-core"]`, added by
  FIX.1 `0c338ed`) + `packages/db/src/seed/showcase.test.ts:7` (the import)
- `.github/workflows/ci.yml` — `pull_request` checks out the merge ref (head ⊕ base
  tip); the contracts job builds only `pnpm --filter @rhema/contracts --filter
  @rhema/db` then vitests `packages/contracts packages/db`; the unit job runs
  `turbo build lint typecheck` + `pnpm test` + `check:dom-contract` +
  upstream-diff + protocols-version
- `AGENTS.md` invariants 1–3 (explicit per-package deps → composite project
  references → `tsc -b` builds the graph) — `tsconfig.base.json` sets `composite`,
  and findings-core's only reference is `../contracts` (no cycle)
- `docs/build/runs/NAVC.1.md` §Progress — the crashed worker's state the re-fork
  must preserve (uncommitted: `apps/web/src/spa/nav-intercept.ts` +
  `docs/build/runs/NAVC.1.md` new; `apps/web/src/spa/main.tsx`,
  `apps/web/src/dom-contract.ts`, `apps/web/src/state-map.ts`,
  `apps/web/src/spa/surfaces/{usage,export,settings}.tsx` modified)

## In scope — deliverables

**Step 0 — preflight (main checkout, no mutations):** `git fetch origin`. Capture
`git status --porcelain` as the WIP baseline (exactly the 8 paths in Load +
`docs/build/reports/digests/` if still untracked). Assert
`git merge-base --is-ancestor fd5ade2 HEAD` and `git log --oneline fd5ade2..HEAD`
= only orchestrator memory commits (3 boundary records + the CIREP.1 insert
commit — every touched path under `docs/build/` or `docs/tickets/`; any
product-code commit is a finding, stop).
Then `git worktree add ../rhema-wt-fix1 stevevitali/fix-1-journey-fixture-repairs`
and `../rhema-wt-verif1 stevevitali/verif-1-composed-ffbb8ad` — **all ancestor work
happens in the temp worktrees; the navc-1 checkout's WIP never rides a checkout.**

**Step 1 — #173 `contracts` repair (in `../rhema-wt-fix1`):** append
`{"path": "../findings-core"}` to `packages/db/tsconfig.json` `references` (dev-dep
declared by FIX.1 but the composite edge missing — invariant #2). Prove BEFORE
push, replicating the CI leg literally: `pnpm install` →
`pnpm --filter @rhema/findings-core clean` → `pnpm --filter @rhema/contracts
--filter @rhema/db build` emits `findings-core/dist` → `pnpm exec vitest run
packages/contracts packages/db` green. Commit
`FIX.1 follow-up — restore the findings-core project reference (contracts CI)`
and `git push origin stevevitali/fix-1-journey-fixture-repairs`. Fix commit only —
no ledger edits on this branch.

**Step 2 — #174 `typecheck / lint / unit` repair (in `../rhema-wt-verif1`):**
`git merge origin/stevevitali/fix-1-journey-fixture-repairs` — brings the PUSHED
F1 in as a real ancestor (merge commits are this chain's style; keeps `fd5ade2`'s
SHA an ancestor — REQ-SPEC-29 provenance — and makes this head self-contained for
its own `contracts` leg and for NAVC.1's; a local-branch merge source risks an
"Already up to date" silent no-op). Then add `P1.outline`, `P1.figures`,
`P1.dossier`, `R6F`, `T12F`, `T13F`, `T17` to the expected-green array at
`registry.test.ts:53` with a dated comment in the file's existing style (flipped
2026-10-15 by VERIF.1 with dated live evidence). Prove BEFORE push: `pnpm install`
→ repeat the step-1 clean proof (the merge must have carried F1 —
`pnpm --filter @rhema/findings-core clean` → `--filter @rhema/contracts --filter
@rhema/db build` → `vitest run packages/contracts packages/db` green) →
`pnpm --filter @rhema/journeys build typecheck` → `pnpm exec vitest run
packages/journeys` green. Commit the test sync as
`VERIF.1 follow-up — sync the pinned green baseline to the registry flips`
(the merge is its own commit) and push.

**Step 3 — Re-fork the NAVC.1 branch** onto the new verif-1 head so its tree carries
both fixes (navc-1 has no PR and is unpublished — a rebase is safe here; ancestor
PR branches are NEVER rebased): in the main checkout, `git stash -u` →
`git rebase --onto <new-verif-1-head> fd5ade2
stevevitali/navc-1-delegated-interceptor` → `git stash pop` →
`git status --porcelain` must equal the step-0 baseline byte-for-byte (a pop
conflict → stop and report; never edit WIP content). Then `pnpm install` +
`pnpm exec vitest run packages/journeys/src/registry.test.ts
packages/db/src/seed/showcase.test.ts` green on the rebased tree, and
`git push -u origin stevevitali/navc-1-delegated-interceptor` — the branch is
unpublished; pushing makes the repaired state + preserved WIP-adjacent commits
durable (one orchestrator crash already cost this branch its remote copy).
Remove the temp worktrees (`git worktree remove`).

**Step 4 — drift audit (cheap, record-only):** sweep every workspace package's
`package.json` `@rhema/*` deps vs its `tsconfig.json` `references`. Phase-4 review
already found: `integration` (`@rhema/ledger` imported in COMPILED src +
`@rhema/live-clients` possibly dead), `packages/benchmark` (`findings-core`,
`mirror` devDeps), `apps/egress-proxy` (`db` devDep). Record the full list in
`runs/CIREP.1.md` + one dated OPEN FINDINGS line — latent landmines for any future
scoped-build CI leg; do NOT fix them here.

**Step 5 — CI truth:** `ci-boundary.sh --pr 173` and `--pr 174` after the pushes
(`--max-wait 5400` — the full pipeline runs ~45 min). Both must read pass at the
new heads. A different failure class is a NEW finding — stop and report, never
patch around it. If the bounded wait expires pending, record `ci: pending`
honestly and hand back — never a fabricated green.

**Step 6 — Ledger close** (commits on the navc-1 branch, after step 3):
`docs/build/runs/CIREP.1.md` — both new head SHAs, the merge SHA, the rebase
result, the WIP-integrity diff, the step-4 audit table, and an explicit
"NAVC.1's new base = verif-1 @ `<sha>`" line (the stale `Base @ fd5ade2` in
`runs/NAVC.1.md` is WIP and must NOT be edited). PHASE LOG `done` entry (`ci:` =
the real read). `nextTicket` → NAVC.1, `lastCompleted` → CIREP.1, `chainTip` stays
`stevevitali/verif-1-composed-ffbb8ad` (branch name, new head — record the SHA in
the run ledger + BUILD_INDEX). `blockedOn` stays SET — the ORCHESTRATOR clears it
on the pass read per BM-CI-01 (`repair` PHASE LOG entry naming these PRs).
BUILD_INDEX row: no new PR — the PR cell records
`repairs on #173 + #174 heads (merge+commit; no new PR)` with the head SHAs.

## Out of scope
- Merging anything or opening a PR (mergePolicy OPERATOR; pushes land on the two
  open unmerged ancestor branches + the unpublished navc-1 branch only)
- Rebasing, force-pushing or otherwise rewriting `fix-1`/`verif-1` (open PR heads —
  additive commits + the named merge only; §2.3 step 5 protects their SHAs)
- Re-verifying VERIF.1/FIX.1's substantive work; relaxing any assertion (the
  registry-list edit is a catch-up to already-evidenced flips, not a relaxed test)
- Any nav/interceptor work (NAVC.1's own scope — the WIP is preserved, not edited)
- Fixing the step-4 drift findings (record-only) · prod reads/writes · journey runs

## Acceptance criteria
- [ ] The step-1 clean proof (`findings-core clean` → scoped build → `vitest run
  packages/contracts packages/db`) green on the fix-1 head; #174's head proves the
  same post-merge, plus `vitest run packages/journeys` *(deterministic)*
- [ ] `ci-boundary` reads pass on #173 and #174 at their new heads — or an honest
  `ci: pending` hand-back *(deterministic — the blocking read, never local-green
  claimed as CI)*
- [ ] navc-1 rebased onto the new #174 head; the orchestrator memory commits
  replayed; pre/post-stash porcelain identical; both repaired suites green on the
  rebased tree; branch pushed *(deterministic)*
- [ ] Step-4 audit table + dated OPEN FINDINGS line recorded *(deterministic ·
  engineered)*
- [ ] `runs/CIREP.1.md` + PHASE LOG `done` + BUILD_INDEX row + `nextTicket` →
  NAVC.1; `blockedOn` left for the orchestrator's pass-read clear *(deterministic
  · engineered)*

## Requirement IDs to satisfy and stamp in the PR
(none — a close-gap repair insert; no spec IDs. The PR cell records
`repairs on #173 + #174 heads — no new PR`.)
