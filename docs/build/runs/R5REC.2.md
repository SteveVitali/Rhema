# R5REC.2 — Round-5 spec reconciliation (the nav fold-back) — run ledger

- **Spec:** `docs/tickets/172_R5REC.2__spec-reconciliation.md` (manifest row 172, round 5,
  Kind: reconcile) — `implement-spec reconcile=spec`
- **Base:** `stevevitali/r5rec-1-backlog-readiness` tip @ `7ae45ba`
- **Branch:** `stevevitali/r5rec-2-spec-reconciliation` (mergePolicy=OPERATOR — never merge)
- **Harness:** devin-desktop/swe-2-high · **Skills:** implement-spec + reconcile-build +
  build-memory @ `~/agent-skills` (`e981ec5`)
- **Requirement ids stamped:** REQ-MEM-6 REQ-MEM-7 REQ-MEM-8
- **Live stage:** none · **Production mutations:** none — offline-only, $0
- **Started:** 2026-10-17T23:26Z

## Deferrals read

`docs/tickets/DEFERRALS.md` read first (protocol). Relevant open rows this ticket neither
unblocks nor closes: `D-R5OPS.1-1` (organic-cohort first-finding — cohort empty),
`D-R5OPS.1-2` (CDN origin-read repair — operator ruling + IAM), `D-R5REC.1-1` (the
`outline.dom.test.tsx` mount-settle flake — an in-repo test-harness fix; NOT closed here —
this contract is spec-text-only; flagged for the operator/next sweep). `GD-R5OPS.1-1`
stays AWAITING — never answered. REQ-MEM-6/7/8 live on the COVERAGE_MATRIX (MISSING →
this ticket), not on DEFERRALS rows.

## Requirements

- REQ-MEM-6 — `frontend-spa-spec.md` §7 amendment: interception mechanism, guard ordering,
  skip-list, settle contract (`data-nav-count`, mounted-pending), `SsrHandoff` replace-mode.
- REQ-MEM-7 — `frontend-spa-spec.md` §14 dated defect block: no-interception shipped,
  Q-scope-1, REQ-NAVC/NAVM/NAVT cross-refs.
- REQ-MEM-8 — `rhema-design-spec.md` supersession-banner settled-mechanism clause + the
  round-5 ADR (index regenerated; the ADR did not exist — the nav tickets wrote none, so
  R5REC.2 authors ADR-110 per the spec's "once the round-5 ADR lands" clause).
- Drift fold-back: R5CAP.1's surfaced drift lands as amendments (REQ-MEM-6/7/8 routings;
  the REQ-NAVC-13 naming nit is noted-only per R5CAP.1; R5REC.1's `ADR-110` misreference
  in BACKLOG.md gets a dated correction, not a rewrite).

## Acceptance criteria

- [ ] The specs' nav text matches the built mechanism exactly — no aspirational residue (deterministic)
- [ ] Amendments are dated + REQ ids append-only (deterministic)
- [ ] universal phase-gate AC

## Plan

1. `frontend-spa-spec.md`: status line → v1.2 (2026-10-17 amendment clause); §0.4 ToC line;
   new `### 14.18` (the dated defect record — no interception shipped, Q-scope-1, the
   REQ-NAVM/NAVT/NAVC cross-refs) + `### 14.19` (the §7 amendment — interceptor mechanism,
   guard ordering, skip-list, `SsrHandoff` replace-mode, extended settle contract,
   signed deviations rows 1/2/4).
2. `rhema-design-spec.md`: status-line clause + dated supersession addenda appended to the
   §12-table and §13.1 banners (settled mechanism + `data-nav-count`; ADR-110).
3. Write `docs/adr/ADR-110-delegated-click-interceptor.md`; regenerate `docs/adr/README.md`
   via `adr-index.sh` (generated — never hand-edited).
4. `00_MANIFEST.md § Spec amendments applied` — append the 2026-10-17 line.
5. `COVERAGE_MATRIX.csv` REQ-MEM-6/7/8 → MET with evidence; `BACKLOG.csv` BL-84 sources
   += `ADR-110` (every live ADR trigger needs exactly one home); `BACKLOG.md` BL-84 text +
   dated correction for the `ADR-110`→ADR-082 misreference.
6. `AGENTS.md` — one bullet recording the interceptor (landed-code truth).
7. Verify: turbo build lint typecheck, pnpm test, all six check:*, check-build-memory,
   check-append-only --base 7ae45ba, check-backlog.

## Test matrix

Docs-only diff — no new runtime behavior. Deterministic evidence: the amended text names
the same symbols the code carries (`nav-intercept.ts` guard order verbatim, `RELOAD_STUB_IDS`
verbatim, `spaRuntime.replace`/`replaceDocument`, `data-nav-count`/`data-mounted` semantics);
the full test suite re-runs (spec/docs diff expected to leave all 5,814 green);
`check-backlog.sh` re-verified complete + non-duplicating after the BL-84 source append.

## Progress

- `docs/frontend-spa-spec.md` — status line → **v1.2** (2026-10-17 amendment clause);
  §0.4 ToC line updated; **§14.18** (dated defect record — no interception shipped, the
  MPA-mode gap, Q-scope-1, REQ-NAVC/NAVM/NAVT cross-refs, the `/voices/`→`/v/` fix) +
  **§14.19** (the §7 mechanism amendment — interceptor, ordered guard pipeline,
  skip-list, `RELOAD_STUB_IDS`, unconditional renderer handling, push-only,
  `SsrHandoff` replace-mode, no preload, `hashchange` compensation, extended settle
  contract, GATE-ACCEPT.R5 rows 1/2/4 folded).
- `docs/rhema-design-spec.md` — status-line clause + dated supersession addenda on the
  §12-table and §13.1 banners.
- `docs/adr/ADR-110-delegated-click-interceptor.md` authored (the nav stream wrote no
  ADR; REQ-MEM-8's "once the round-5 ADR lands" made it this ticket's); `docs/adr/README.md`
  regenerated via `adr-index.sh`.
- `docs/tickets/00_MANIFEST.md` — dated `Spec amendments applied` line appended.
- `docs/build/COVERAGE_MATRIX.csv` — REQ-MEM-6/7/8 `MISSING → MET` with evidence.
- `docs/build/BACKLOG.csv` + `BACKLOG.md` — BL-84 sources += `ADR-110`; dated
  correction for R5REC.1's `ADR-110`-for-ADR-082 misreference (run-ledger twin
  stands — append-only).
- `AGENTS.md` — the interceptor convention bullet (landed-code truth).
- `docs/build/pr/R5REC.2.md` — PR body.
- Every code line-reference in §14.19 verified against the working tree:
  `main.tsx:54-62/69/88`, `nav-intercept.ts` pipeline + stub ids, `dom.ts` replace arm,
  `states.tsx:37`, `head.tsx:51-59/79-88`, `render.tsx:86`, `spa-shell.ts:217`,
  `ide/controller.ts:1127`, `runner.ts:209-234` (documentLoads unconditional),
  `state-map.ts:130`, `intercept.dom.test.tsx:427`, `settle.ts` SettleScope.

## Gap table

| Contract requirement | Disposition | Evidence |
|---|---|---|
| §7 amendment — mechanism/guard order/skip-list/settle/replace-mode | landed | frontend-spa-spec §14.19 |
| §14 dated defect block + NAVC/NAVM/NAVT refs | landed | frontend-spa-spec §14.18 |
| design-spec supersession clause | landed | §12-table + §13.1 banner addenda (2026-10-17) |
| round-5 ADR + index | landed | ADR-110 + regenerated README.md |
| R5CAP.1 drift fold-back | landed | matrix REQ-MEM-6/7/8 MET; BL-84 watch; REQ-NAVC-13 nit noted-only (R5CAP.1's own no-action verdict); BACKLOG.md correction |
| amendments dated / ids append-only | landed | every block dated 2026-10-17; zero requirement text rewritten |
| live-stage evidence | not owed | contract is offline-only; §14.19 cites the staging-verified VERIF.2 result, no new live claim |
| close `D-R5REC.1-1` (test flake) | **carried** | contract is spec-text-only; the fix is a test-harness leg — flagged in PR operator-flags |

## Evidence log

- `adr-index.sh` → `docs/adr/README.md` regenerated (one new row, machine-generated).
- `date -u` anchors: branch 2026-10-17T23:26Z; amendments stamped 2026-10-17.

## Evidence report

- `pnpm turbo build lint typecheck` — **135/135 tasks** (full-turbo cached).
- `pnpm test` — **501 files passed / 1 skipped; 5,814 tests passed / 4 skipped; 0
  failures** (316.8s). The `outline.dom.test.tsx` flake class (D-R5REC.1-1) did not
  recur this run.
- `pnpm check:licenses` — OK (822 packages).
- `pnpm check:protocol-markers` — OK (248 public-facing files).
- `pnpm check:no-cookies` — OK (257 ingestion-surface files).
- `pnpm check:spa-budget` — OK (all ceilings held).
- `pnpm check:spa-env` — OK (115 client files, 146 artifacts, 51 banned names).
- `pnpm check:dom-contract` — OK (journey ⊆ manifest ⊆ emitted+asserted).
- `check-backlog.sh` — **complete + non-duplicating + verdict-consistent** (366
  expected sources; eng 594/752, req 576/752 — REQ-MEM-6/7/8 now counted MET).
- `check-build-memory.sh .` — **no violations** (8 warnings, all pre-existing legacy).
- `check-append-only.mjs --base 7ae45ba` — **OK** (history only grew).
- `adr-index.sh` — `docs/adr/README.md` regenerated (1 new row, machine-derived).
- CI — head-bound via `ci-boundary.sh` (verdict recorded in the closeout section below).

## Honesty / guard checks

- No live stage, no prod writes, $0 — documentation-only diff.
- `GD-R5OPS.1-1` stays AWAITING — not answered. `GD-FUNDED.1-1` CARRY — untouched.
- `D-R5REC.1-1` (mount-settle flake) deliberately NOT closed — spec-text-only contract;
  flagged in the PR operator-flags.
- `projectStatus: IN_PROGRESS`; `mergePolicy: OPERATOR`; this PR is never merged by the
  agent.
- No requirement text rewritten — every change is a dated amendment block, a banner
  addendum, a matrix verdict flip with evidence, or a generated index row.
- The corrected `ADR-110`→ADR-082 misreference is fixed by a dated correction note,
  not a rewrite (run-ledger twin in `runs/R5REC.1.md` stands — append-only).
- NAVC.1's `REQ-NAVC-13` commit-stamp nit is recorded as R5CAP.1's no-action verdict —
  no phantom requirement invented, no landed commit message altered.
