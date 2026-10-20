# R6CI.1 — CI cost phase 1 — run ledger

- **Spec:** `docs/tickets/176a_R6CI.1__ci-cost-phase-1.md` (manifest row 176a, round 6 —
  operator run-time insert, Kind: ticket) — `implement-spec`
- **Base:** `stevevitali/r6eng-1-ci-provenance-hygiene` at **local** HEAD `d79b40b` (the
  insert-record commit rides this branch per D8; the tip branch is not re-pushed)
- **Branch:** `stevevitali/r6ci-1-ci-cost-phase-1` (mergePolicy=OPERATOR — never merge)
- **Harness:** devin-desktop/swe-2-high/subagent · **Skills:** implement-spec + build-memory +
  self-review @ `~/agent-skills`
- **Requirement ids stamped:** none (operator insert — the Authority block D1–D9 stands in)
- **Live stage:** CI/Actions surface only · **Production mutations:** none · **Gate status:** none
- **Started:** 2026-10-20T22:15:47Z
- **Closed:** (open)
- **ci:** (pending — first push is a forced full run; second push is the hosted fast-path proof)

## Deferrals read

`docs/tickets/DEFERRALS.md` read first (protocol — AGENTS.md). Sweep: every `OPEN` row is
operator-, prod-, live-, HUMAN- or clock-bound (D-P0.12-3, D-P0.13-*, D-P0.14-*, D-P0.15-4,
D-P0.15c-4, D-PRB.01-2, D-PRB.02-*, D-PRB.04-2, D-P1.17-1, D-P1.21-1, D-P1.22-3, D-DEF.1-1,
D-DEF.4-3, D-FIX.1-1..4, D-R5OPS.1-1/-2, D-BL38.1-1/-2, D-COST.1-1..3) — **none** is unblocked
by a CI-workflow ticket. `D-R6CI.1-1` (measured delta) already exists from the insert commit.
Opened this run: `D-R6CI.1-2` only if the `workflow_dispatch` pre-flight 422s.

## Requirements

1. **Fail-closed fast path.** `scripts/ci/fast-path-paths.txt` = `scripts/deploy-neutral-paths.txt`
   minus `.gitleaks.toml`, `docs/build/tools/**`, `docs/build/record_policy/**`. Eligible iff
   (a) `pull_request` event, (b) every changed path `base…head` matches the list, and
   (c) the `ci-pass-<h>` same-tree anchor check passes **or** the head is a pure-neutral
   descendant of a fully-green head. Diff via `gh api repos/…/compare/{base}...{head}`
   (`files[].filename`), never fetch-depth. Any evaluation error → full.
2. **Always-run guards.** `gitleaks` + `pnpm check:no-cookies` run on every head incl.
   fast-path, as early unconditional steps in `public-safe`.
3. **Docs-reader subset.** Committed pinned audit `scripts/ci/neutral-readers.txt` (recorded
   grep for fs-reads of any deploy-neutral path, verified complete) runs as one step on
   fast-path heads.
4. **Anchor `ci-pass-<h>`.** Full-green runs upload `{mode:"full", run_id, head_sha,
   non_docs_tree:<h>}` where `<h>` = sha256 over the sorted `git ls-tree -r HEAD` listing
   with eligible paths stripped (the checked-out HEAD tree). Verifier: repo-wide artifact
   list → `runs/{id}` exists + `conclusion=="success"` + payload `mode=="full"` (fast-mode
   producer = poison); newest valid wins. `actions: read` in workflow `permissions:` +
   `public-safe`'s narrowing.
5. **Job shape.** Names unchanged, all conclude `success`; each prints `CI-FAST-PATH`
   notice + a step-summary line distinguishing fast vs full.
6. **`workflow_dispatch`** (no inputs) + cadence policy in `docs/development.md` + manifest
   operating rules (D4 per gate + per deploy SHA; D5 `main` always full). Dispatch pre-flight
   early; 422 → record verbatim + `D-R6CI.1-2`, not a failure.
7. **`--maxWorkers=2`** measured on this PR — keep iff green + faster; record either way.
8. **Concurrency** pinned: `ci-${{ github.event_name == 'pull_request' && github.ref || github.sha }}`,
   `cancel-in-progress: true`.
9. **Duplicate tests.** Drop `contracts`' `vitest run packages/contracts packages/db`
   (root `pnpm test` covers `packages/**`) and the now-purposeless `pnpm --filter … build`.
   `integration`'s DATABASE_URL/Docker legs stay.
10. **journeys pause (D7).** Comment out `schedule:` (both crons — nightly `5 6 * * *` +
    weekly `--paid` `35 4 * * 1`) with a dated `R6SWP.1-restore` marker; `workflow_dispatch` stays.
11. **ADR-115** (fast-path trust model, neutral-vs-check-neutral + carve-outs, anchor contract,
    cadence, D5, dispatch-attaches-to-head note) + ADR index regen + `docs/development.md`.
12. **DEFERRALS** — `D-R6CI.1-2` iff dispatch 422s (`D-R6CI.1-1` already OPEN from the insert).

## Acceptance criteria

- [ ] Classifier fail-closed with tests: docs-only head eligible; code head, workflow touch,
  `.gitleaks.toml`, `docs/build/tools/**`, `record_policy/**`, ambiguous diff, missing/invalid
  anchor, fast-mode producer → each `full` *(deterministic · engineered)*
- [ ] `gitleaks` + `check:no-cookies` unconditional on every head *(engineered, hosted)*
- [ ] `scripts/ci/neutral-readers.txt` committed with the recorded audit grep *(deterministic)*
- [ ] Hosted proofs: full run + anchor artifact → docs head fast-path → dispatch attempt
  (or `D-R6CI.1-2` with 422 verbatim) *(engineered, hosted)*
- [ ] `ci-boundary.sh` green at the PR's final head *(deterministic)*
- [ ] ADR-115 + `docs/development.md` + `D-R6CI.1-1` landed; concurrency + `permissions:`
  pinned; journeys paused with dated marker *(deterministic)*
- [ ] Universal phase-gate AC *(agentic)*

## Plan

1. `scripts/ci/fast-path-paths.txt` — allowlist grammar = deploy-neutral + `!` negation
   (`docs/` minus `!docs/build/tools/`, `!docs/build/record_policy/`).
2. `scripts/ci/lib/fast-path.mjs` — pure, testable: rule parser, `nonDocsTreeHash`,
   anchor-payload validation, `verdict()` over injected artifact/compare data.
   `scripts/ci/decide-fast-path.mjs` — the CI CLI (git ls-tree + gh api IO; writes
   `$GITHUB_OUTPUT` `mode|non_docs_tree|head_sha|base_sha|reason`, the `CI-FAST-PATH` /
   `CI-FULL-PATH` notice + step-summary). `scripts/ci/fast-path.test.mjs` — the AC matrix.
3. `scripts/ci/neutral-readers.txt` — recorded audit (see header comment): the five
   runtime fs-readers of deploy-neutral paths, verified complete over 21 candidates.
4. `ci.yml` — `workflow_dispatch:`; pinned concurrency; workflow-level
   `permissions: {contents: read, actions: read}` (public-safe += `pull-requests: read`);
   new `fast-path` job (one decide step → `mode` output); every existing step gated
   `needs.fast-path.outputs.mode == 'full'` **except** gitleaks + `check:no-cookies`
   (unconditional) and the unit job's docs-reader subset (`mode == 'fast'`); per-job
   verdict notice step; `contracts` dup vitest+build dropped; unit `pnpm test` →
   `pnpm exec vitest run --maxWorkers=2` (measure); new `ci-anchor` job
   (`needs:` all, uploads `ci-pass-<h>` only when `mode == 'full'`).
5. `journeys.yml` — comment out both `schedule:` crons, dated marker; dispatch stays.
6. `docs/development.md` (cadence policy) + ADR-115 + adr-index regen + manifest operating rule 10.
7. Hosted proofs per the contract's ordering; closeout per implement-spec §6.5 + D8
   (the ledger closeout rides the docs-only head = the fast-path demonstration).

## Test matrix

| AC | test |
|---|---|
| classifier arms | `scripts/ci/fast-path.test.mjs` — every AC row as a named case over `verdict()` |
| allowlist = deploy-neutral − carve-outs | same file — semantic check over both committed lists |
| anchors (producer/verifier) | payload validate: mode, run_id, success, poison, name/hash mismatch |
| subset coverage | `neutral-readers.txt` entries exist + single-line audit re-run pin |
| guards unconditional | `ci.yml` step `if:` audit (test reads the workflow text) |
| concurrency/permissions/dispatch pinned | same workflow-text test |
| hosted | boundary reads + artifact list + notices + durations (this PR) |

## Progress

- 2026-10-20T22:15:47Z — branch forked @ `d79b40b`; spec + Authority D1–D9, AGENTS.md,
  DEFERRALS sweep (no unblocked rows), ci.yml/journeys.yml whole-file reads, ADR-0534
  precedent, research note, deploy-neutral loader, ci-boundary.sh + record_policy audit.
  Design settled: dedicated `fast-path` decision job + `ci-anchor` upload job (single
  verdict shared via job outputs — removes any mode disagreement between jobs).
- 2026-10-20T22:28:44Z — TDD: `fast-path.test.mjs`
  (32 cases — every AC row, allowlist semantics vs the committed lists, payload/verifier
  validation, workflow pins, mechanical audit re-run) written before the lib; then
  `lib/fast-path.mjs` + `decide-fast-path.mjs` + `write-anchor-payload.mjs` +
  `fast-path-paths.txt` + `neutral-readers.txt`.
- Semantics fix (recorded for the operator): a first cut applied contract gate (b) to the
  **PR-base…head** diff — Episteme ADR-0534 explicitly rejected that reading ("never
  fast-paths a closeout commit on a code PR"). Corrected: the eligibility check binds the
  delta **since each candidate anchor's recorded head** on *both* arms; arm A additionally
  requires name/hash equality, arm B the preserved base context. Test suite updated to pin
  the rejected reading's failure modes (code-since-anchor with a same-tree anchor → full;
  non-ancestor same-tree anchor → full).
- `--maxWorkers=2` local check: bare flag crashes vitest 2.1.9 on >3-vCPU hosts
  (`minThreads` default cpus-1 > 2) → workflow carries `--minWorkers=1 --maxWorkers=2`;
  green locally (32/32). Hosted A/B read at boundary time vs PR #195's unit step.
- `ci.yml` rewritten per the plan (dispatch, pinned concurrency, `actions: read` at
  workflow level + inside `public-safe`'s narrowing, `fast-path` + `ci-anchor` jobs, all
  pre-existing steps gated, gitleaks/no-cookies unconditional, subset on fast heads,
  contracts dup dropped); `journeys.yml` both crons paused with dated R6SWP.1 marker;
  ADR-115 landed + `docs/adr/README.md` regenerated via `adr-index.sh` (not hand-edited);
  `docs/development.md` created; manifest Operating rule 10 appended (D4/D5 cadence).
- Local verify so far: `vitest run scripts/ci/fast-path.test.mjs` 32/32 ✓; docs-reader
  subset 45/45 ✓; `check:no-cookies` ✓; `turbo build lint typecheck` 135/135 ✓;
  `check:dom-contract` ✓; `check-upstream-diff` ✓; `compute-protocols-version` ✓;
  `check:licenses` ✓; `check:protocol-markers` ✓; `check:spa-budget` ✓; `check:spa-env` ✓;
  prettier on both workflows ✓; js-yaml parse of both workflows ✓ (dispatch present,
  schedule absent).
