# CIREP.1 — ancestor-PR CI repairs (run ledger)

- **Spec:** `docs/tickets/153a_CIREP.1__ancestor-ci-repairs.md` (manifest row 153a, round 5 —
  run-time insert, BM-MANIFEST-03; no new branch, no new PR)
- **Targets:** `stevevitali/fix-1-journey-fixture-repairs` (PR #173, `contracts` red — run
  `38656915693`) and `stevevitali/verif-1-composed-ffbb8ad` (PR #174, `typecheck / lint / unit`
  red — run `38662758852`); memory commits land on
  `stevevitali/navc-1-delegated-interceptor` (no PR — unpublished branch)
- **Harness:** devin-desktop/swe-2-high/subagent
- **Skills:** implement-spec + build-memory @ `~/agent-skills`
- **Started:** 2026-10-15T02:54:00Z · **Closed:** 2026-10-15T04:42:02Z
- **ci:** `pass #173@87fc7da` (run `38673321889`, all five checks) ·
  `fail on #174@db40fa2` — `typecheck / lint / unit` + `contracts` + `public-safe` +
  `images`-attempt all pass; **`integration` fails on `privsep.docker.test.ts`**
  (GD-MAINT.4-1's documented GH-runner kernel-cap limitation — attempts 1–2
  `setpriv`/`unshare`/`mount` EACCES; attempt 3 + `images` failed on an external
  `wget https://people.redhat.com` timeout — host unreachable 2026-10-15 ~04:30Z,
  TLS connect fails locally too). Neither remaining red is repair-caused: the
  re-fork diff is `packages/db/tsconfig.json` + `packages/journeys/src/registry.test.ts`
  only. Records: `logs/ci-boundary-173-cirep1.json`, `logs/ci-boundary-174-cirep1.json`.
- **Config:** full rigor per the contract's Step 0–6 ordering;
  **Live stage: none**; **Production mutations: none**; metered spend **$0**

## Deferrals read

`docs/tickets/DEFERRALS.md` read first (protocol). Every `OPEN` row is live/HUMAN-gated
(corpus, prod legs, operator sign-offs) — none is scoped to a CI-repair ticket and none is
unblocked by CIREP.1. New rows opened: none (the step-4 drift findings are record-only per
the contract — one dated OPEN FINDINGS line in `LEDGER.md`, not DEFERRALS rows).

## Requirements (contract Steps 0–6)

1. **Step 0** — preflight on the main checkout (no mutations): fetch; porcelain baseline;
   `fd5ade2` ancestor assert; `fd5ade2..HEAD` = orchestrator docs-only commits; ancestor work
   in temp worktrees `../rhema-wt-fix1` + `../rhema-wt-verif1`.
2. **Step 1** — fix-1: append `{"path":"../findings-core"}` to `packages/db/tsconfig.json`
   `references`; literal CI-leg proof (install → findings-core clean → scoped
   `--filter @rhema/contracts --filter @rhema/db build` emits `findings-core/dist` →
   `vitest run packages/contracts packages/db` green); commit
   `FIX.1 follow-up — restore the findings-core project reference (contracts CI)`; push.
3. **Step 2** — verif-1: `git merge origin/stevevitali/fix-1-journey-fixture-repairs`;
   add `P1.outline P1.figures P1.dossier R6F T12F T13F T17` to the pinned green baseline at
   `registry.test.ts` with a dated comment; repeat the step-1 clean proof post-merge +
   `pnpm --filter @rhema/journeys build typecheck` + `vitest run packages/journeys` green;
   commit `VERIF.1 follow-up — sync the pinned green baseline to the registry flips`; push.
4. **Step 3** — re-fork navc-1: `git stash -u` →
   `git rebase --onto <new-verif-1-head> fd5ade2 stevevitali/navc-1-delegated-interceptor` →
   `git stash pop` → porcelain == step-0 baseline byte-for-byte → `pnpm install` +
   `vitest run packages/journeys/src/registry.test.ts packages/db/src/seed/showcase.test.ts`
   green → `git push -u origin stevevitali/navc-1-delegated-interceptor` → remove worktrees.
5. **Step 4** — drift audit (record-only): every workspace package's `@rhema/*` deps vs its
   `tsconfig.json` `references`; full table here + one dated OPEN FINDINGS line. No fixes.
6. **Step 5** — `ci-boundary.sh --pr 173` and `--pr 174` (`--max-wait 5400`); pass at the new
   heads, or honest `ci: pending`. A different failure class = stop and report.
7. **Step 6** — ledger close on navc-1: this file + PHASE LOG `done` + BUILD_INDEX row
   (no new PR — `repairs on #173 + #174 heads (merge+commit; no new PR)`) + `nextTicket` →
   NAVC.1, `lastCompleted` → CIREP.1, `chainTip` stays `stevevitali/verif-1-composed-ffbb8ad`
   (new head `db40fa2`), `blockedOn` stays SET for the orchestrator's pass-read clear.

## Acceptance criteria (contract)

- [x] Step-1 clean proof green on the fix-1 head; #174's head proves the same post-merge,
  plus `vitest run packages/journeys` *(deterministic)*
- [~] `ci-boundary` reads pass on #173 and #174 at their new heads — or honest hand-back:
  **#173 pass**; **#174 `ci: fail`** — the two repaired checks both green; the remaining
  reds are environmental (privsep kernel-cap flake + `people.redhat.com` outage), recorded
  as a NEW finding per the contract's step-5 clause *(deterministic — honest read)*
- [x] navc-1 rebased onto the new #174 head; memory commits replayed; pre/post-stash
  porcelain identical; both repaired suites green on the rebased tree; pushed *(deterministic)*
- [x] Step-4 audit table + dated OPEN FINDINGS line *(deterministic · engineered)*
- [ ] `runs/CIREP.1.md` + PHASE LOG `done` + BUILD_INDEX row + `nextTicket` → NAVC.1;
  `blockedOn` left for the orchestrator *(deterministic · engineered — step 6)*

## Plan

Additive commits only on the two open ancestor PR branches (never rebase/force-push them);
the navc-1 branch is unpublished so the re-fork rebase is safe; the crashed worker's
uncommitted WIP rides `git stash -u`/`pop`, never a checkout; all ledger writes land on
navc-1 after the re-fork.

## Test matrix

| AC | proof |
|---|---|
| #173 contracts leg | `pnpm --filter @rhema/findings-core clean` → scoped build emits `findings-core/dist` → `vitest run packages/contracts packages/db` |
| #174 unit leg | same clean proof post-merge + `pnpm --filter @rhema/journeys build`/`typecheck` + `vitest run packages/journeys` |
| re-fork integrity | pre/post-stash `git status --porcelain` byte-equal + both repaired suites on the rebased tree |
| CI truth | `ci-boundary.sh --pr 173/174` bounded wait |

## Progress

- **Step 0** — `git fetch origin`; WIP baseline captured (8 paths — the 6 modified +
  2 untracked from `runs/NAVC.1.md` §Progress, byte-recorded at
  `logs/cirep1-wip-baseline.txt`); `git merge-base --is-ancestor fd5ade2 HEAD` ✓;
  `fd5ade2..HEAD` = 5 commits, ALL under `docs/build/`/`docs/tickets/` (`76f957e`, `cefb2f5`
  boundary records; `5a1865b` digest; `ba6a7c7` CIREP.1 insert; `4d04e50` contract-assert
  amend — one more docs commit than the contract enumerated, still memory-only). Temp
  worktrees `../rhema-wt-fix1` @ `0623042`, `../rhema-wt-verif1` @ `fd5ade2`.
- **Step 1** — `packages/db/tsconfig.json` `references` += `{"path":"../findings-core"}`
  (3 lines). Proof (literal CI leg, in the worktree): `pnpm install` clean →
  `pnpm --filter @rhema/findings-core clean` removes `dist/` →
  `pnpm --filter @rhema/contracts --filter @rhema/db build` Done →
  `packages/findings-core/dist/index.js`+`.d.ts` EMITTED →
  `pnpm exec vitest run packages/contracts packages/db` **37 files / 329 tests all pass**
  (incl. `showcase.test.ts` 7/7 — the file carrying the `@rhema/findings-core` import).
  Commit `87fc7da` pushed → fix-1 head **`87fc7dafa8a869e7487fb2faccdff8da56e05e71`**.
- **Step 2** — `git merge origin/stevevitali/fix-1-journey-fixture-repairs` → merge commit
  **`3ff64d08456930dff61e43734b67456456ade3f3`** (keeps `fd5ade2` an ancestor —
  REQ-SPEC-29 provenance). `registry.test.ts` expected-green array += the 7 ids
  (`P1.outline P1.figures P1.dossier R6F` in their family groups + `T12F T13F T17` on the
  T-line) with a dated 2026-10-15 comment naming VERIF.1/`ffbb8ad`; registry.ts re-verified
  first — all 7 rows carry `expected:"green"` + `paid:false` + dated evidence comments
  (e.g. T17 `registry.ts:345`). Post-merge proofs: clean→scoped build emits
  `findings-core/dist` → vitest contracts+db **37/329 green** →
  `pnpm --filter @rhema/journeys build` + `typecheck` green →
  `vitest run packages/journeys` **12 files / 129 tests all pass** (registry.test.ts 7/7).
  Commit `db40fa2` pushed → ver-1 head **`db40fa206946e522d80af079e7a5a5c6b636e8ed`**.
- **Step 3** — `git stash -u` → `git rebase --onto db40fa2 fd5ade2
  stevevitali/navc-1-delegated-interceptor` — clean replay, all 5 orchestrator memory
  commits → new head **`e0d37b65005fde76fd76d6cef315ca1e563be4fd`**. `git stash pop` clean;
  `git status --porcelain` diff vs the step-0 baseline = **byte-identical** (8 paths).
  `pnpm install` + `vitest run packages/journeys/src/registry.test.ts
  packages/db/src/seed/showcase.test.ts` on the rebased tree = **2 files / 14 tests green**.
  `git push -u origin stevevitali/navc-1-delegated-interceptor` (new remote branch —
  durability per the contract's crash-recovery note). Temp worktrees removed.
- **Step 4** — sweep of 47 workspace `package.json` files vs `tsconfig.json` references
  (`logs/cirep1-drift-audit.mjs`, JSONC-aware): see the audit table below. All five rows
  confirmed against source; **record-only** per the contract (no fixes this run).
- **Step 5** — `#173`: `ci-boundary.sh` read **pass** at `87fc7da` (run `38673321889` —
  all five checks green; `contracts` leg repaired). `#174` @ `db40fa2`:
  `typecheck / lint / unit` PASS (repair green on CI), `contracts` PASS, `public-safe` PASS;
  **`integration` FAIL ×3** (attempts 1–2 `privsep.docker.test.ts` kernel-cap flake —
  `setpriv setresgid`/`unshare`/`mount bind` EACCES, the GD-MAINT.4-1 class waived on #117;
  attempt 3 the `people.redhat.com` wget outage below) and **`images` FAIL ×2**
  (`docker build` `wget https://people.redhat.com/sgrubb/libcap-ng/…` connect timeout —
  external host down; TLS connect fails locally too, 2026-10-15 ~04:30Z). One
  `gh run rerun --failed` + one full `gh run rerun` were used to confirm the reads are
  environmental, not content (the re-fork diff touches neither `apps/run-task` nor the
  workflow). New finding recorded below; **not patched around** per step 5.

## Step-4 drift audit (deps declared but not in `tsconfig.json references`)

Audited **47** workspace package.json files on the rebased navc-1 tree (`e0d37b6` — includes
the step-1 repair, so `packages/db` correctly does NOT appear). Script:
`docs/build/logs/cirep1-drift-audit.mjs` (gitignored scratch).

| package | dep | kind | references | confirmed |
|---|---|---|---|---|
| `integration` | `@rhema/ledger` | dep | MISSING | imported in COMPILED src — `citation-scan-live.ts:19`, `metered-notice.ts:19`, `unverified-scan-live.ts:16`; a scoped `tsc -b` of `@rhema/integration-tests` would not build `packages/ledger/dist` first |
| `integration` | `@rhema/live-clients` | dep | MISSING | zero imports found in `integration/` — possibly dead dep AND missing reference |
| `packages/benchmark` | `@rhema/findings-core` | devDep | MISSING | same class as the `packages/db` miss this ticket repaired |
| `packages/benchmark` | `@rhema/mirror` | devDep | MISSING | devDep, same class |
| `apps/egress-proxy` | `@rhema/db` | devDep | MISSING | imported in `src/db.integration.test.ts` (test file — excluded from `tsc -b`, but a scoped-build + vitest leg on this package hits the same unbuilt-dist hazard) |

All five are latent landmines for any future scoped-build CI leg (the `contracts`-job
pattern: `--filter X --filter Y build` then vitest on the same packages). Recorded as one
dated OPEN FINDINGS line in `LEDGER.md`; **do-not-fix honored** — invariant-#2 owners are
the packages' own tickets.

## Gap table

| item (contract §) | required layer | achieved layer | status | evidence |
|---|---|---|---|---|
| Step 0 preflight + temp worktrees | engineered | engineered | met | Progress §Step 0; `logs/cirep1-wip-baseline.txt` |
| Step 1 #173 repair + clean proof + push | deterministic | engineered | met | `87fc7da`; vitest 329 green; `findings-core/dist` emitted |
| Step 2 #174 merge + test sync + proofs + push | deterministic | engineered | met | merge `3ff64d0`, head `db40fa2`; vitest 329+129 green |
| Step 3 re-fork + WIP integrity + push | deterministic | engineered | met | head `e0d37b6`; porcelain diff byte-identical; 14 tests green |
| Step 4 audit table + OPEN FINDINGS line | deterministic·engineered | engineered | met | table above; LEDGER OPEN FINDINGS 2026-10-15 entry |
| Step 5 ci-boundary pass ×2 (or honest pending/fail) | deterministic | engineered | partial — #173 pass met; #174 honest `ci: fail` recorded (new environmental finding, not patched) | `logs/ci-boundary-173-cirep1.json` (pass); `logs/ci-boundary-174-cirep1.json` (fail); runs `38673321889`/`38677037978`/`38673427171` |
| Step 6 ledger close + blockedOn stays set | deterministic·engineered | engineered | met (this file + LEDGER/INDEX edits) | — |

## Evidence log

- `pnpm --filter @rhema/findings-core clean && pnpm --filter @rhema/contracts --filter
  @rhema/db build` (wt-fix1): `dist/` absent post-clean; `tsc -b` Done for both scopes;
  `packages/findings-core/dist/index.js` + `index.d.ts` present post-build — the exact
  emission the #173 `contracts` leg missed.
- `pnpm exec vitest run packages/contracts packages/db` (wt-fix1 @ `87fc7da`-tree):
  **Test Files 37 passed (37) · Tests 329 passed (329)**.
- Same three commands (wt-verif1 @ post-merge tree): findings-core `dist` emitted again
  (F1 carried by merge `3ff64d0`); vitest **37/329 green**.
- `pnpm --filter @rhema/journeys build` + `typecheck` (wt-verif1): `tsc -b` clean both.
- `pnpm exec vitest run packages/journeys` (wt-verif1): **12 files / 129 tests green** —
  `registry.test.ts` 7/7 (the pinned-baseline `it()` now matches the 53-row registry).
- Re-fork: `git stash -u` (WIP on `4d04e50`) → `git rebase --onto db40fa2 fd5ade2` clean
  5/5 → `git stash pop` clean → `git status --porcelain | diff - logs/cirep1-wip-baseline.txt`
  = empty (**byte-identical**).
- `pnpm exec vitest run packages/journeys/src/registry.test.ts
  packages/db/src/seed/showcase.test.ts` (rebased main checkout @ `e0d37b6`):
  **2 files / 14 tests green**.
- `pnpm --filter @rhema/journeys lint` (rebased tree): clean, zero findings.
- CI boundary records: `logs/ci-boundary-173-cirep1.json`, `logs/ci-boundary-174-cirep1.json`.

## Evidence report {#evidence}

- **Heads landed:** fix-1 `87fc7dafa8a869e7487fb2faccdff8da56e05e71` (pushed);
  verif-1 `db40fa206946e522d80af079e7a5a5c6b636e8ed` (pushed; merge commit
  `3ff64d08456930dff61e43734b67456456ade3f3` brings `87fc7da` in as a real ancestor);
  navc-1 re-forked onto `db40fa2`, new head `e0d37b65005fde76fd76d6cef315ca1e563be4fd`,
  pushed (`-u`). **NAVC.1's new base = verif-1 @ `db40fa2`** (was `fd5ade2`; the
  `runs/NAVC.1.md` "Base @ fd5ade2" line is preserved WIP, not edited).
- **AC1 (local proofs):** wt-fix1 — `findings-core clean` → scoped
  `--filter @rhema/contracts --filter @rhema/db build` emitted `findings-core/dist` →
  vitest `packages/contracts packages/db` **37 files / 329 tests green**. wt-verif1
  post-merge — same clean proof green (merge carried F1) + journeys `build`+`typecheck`
  green + vitest `packages/journeys` **12 files / 129 tests green** (registry.test.ts 7/7).
- **AC2 (CI truth):** `ci: pass #173@87fc7da` (run `38673321889`); `ci: fail #174@db40fa2`
  — repaired checks green, `integration`/`images` red on environmental causes (recorded,
  not patched). `blockedOn` stays SET for the orchestrator's pass-read.
- **AC3 (re-fork):** 5 orchestrator memory commits replayed clean; pre/post-stash
  `git status --porcelain` **byte-identical** (8 paths); repaired suites green on the
  rebased tree (14 tests); branch published.
- **AC4 (audit):** step-4 table above — 5 rows across `integration`, `packages/benchmark`,
  `apps/egress-proxy`; dated OPEN FINDINGS line appended to `LEDGER.md`.
- **AC5 (close):** this ledger + PHASE LOG `done` + BUILD_INDEX row `153a` +
  `nextTicket`→NAVC.1 / `lastCompleted`→CIREP.1 / `chainTip`→`stevevitali/verif-1-composed-ffbb8ad`
  @ `db40fa2`.
- **New finding (step 5):** `#174`'s `integration` privsep leg flakes on the GH-runner
  kernel-cap boundary (GD-MAINT.4-1 class — its recorded scope is "this + descendant PRs"
  of the round-3 chain but the machine-read waiver needs a GD row naming `#174`); and the
  `images`+`integration` docker builds currently hard-fail on `people.redhat.com` being
  unreachable (external outage). Neither is caused by the repairs.
