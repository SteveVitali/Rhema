# CAP.1 — Capstone gap analysis: the 474-row coverage matrix + independent verdicts

Ticket: `docs/tickets/86_CAP.1__capstone-gap-analysis.md` · run ledger: `docs/build/runs/CAP.1.md`
Stacks on `stevevitali/stb-5b-bounded-paid-legs` (PR #107, `OPERATOR` merge policy).
**DO NOT MERGE.**

## Summary

> The whole-build audit the manifest's first standard CAP.1 ticket orders:
> every `REQ-[A-Z]+-\d+` in `docs/rhema-design-spec.md` — **474 requirements** —
> judged independently on the composed tree at `6397c1f`, **before any
> `docs/build/runs/*` ledger or prior readout was read**. Deliverables:
> `docs/build/COVERAGE_MATRIX.csv` (474 rows, exact eleven columns),
> `docs/build/CAPSTONE_GAP_ANALYSIS.md` (method, roll-ups, seam hunt, routed
> top gaps), a completeness-gating test, one ADR, and two new DEFERRALS rows.

## Verdict roll-up

| MET | MET-DIFFERENTLY | PARTIAL | MISSING | AT-RISK-INTEGRATION |
|---|---|---|---|---|
| 309 | 18 | 113 | 33 | 1 |

- 30 of 33 MISSING are spec-scheduled 1.x/Later scope (mobile app, working
  copy, seat pages, run-rounds loop, house styles, variants, share links,
  steelman, span marks, learned preferences, non-Anthropic providers); the
  `level` column — not the verdict — carries "not owed yet".
- The single AT-RISK-INTEGRATION: **REQ-ACCT-3** — export→import live-broken
  (T3 red; D-STB.5a-1 RLS 404 on emailed tokens, D-STB.5a-2 import 500).
- PARTIAL decomposes into: un-walked user surfaces → **CAP.2**; owed live legs
  on existing `D-*` rows → **CAP.3**; unreachable capabilities (D-STB.5b-2/-3);
  operator/HUMAN halves (H2/H3/H4/H7).

## Requirement ids

All 474 `REQ-*` ids, exactly once each — enforced by
`scripts/check-coverage-matrix.test.mjs` (spec-regex extraction ⇄ CSV set
equality; header, verdicts, evidence-nonblank, and cited-path/deferral/journey
ref integrity all asserted in-tree).

## Evidence summary

- Verdicts drafted from the spec + composed tree only; `DEFERRALS.md` statuses
  re-extracted mechanically (114 DONE / 72 OPEN / 25 PARTIAL / 1 WONTFIX /
  1 ACCEPTED-SKELETON / 1 RE-DEFERRED at base).
- Journey evidence from `packages/journeys/src/registry.ts`: **46 steps —
  30 green / 16 red**; every red step maps to an existing deferral row.
- Live claims cite only deferral-closed legs or green registry steps at
  recorded `prod:<sha>` provenances — never inferred from tests; the chain
  tip itself has never been deployed (CAP.2's job).
- Rubric recorded as **ADR-089**.

## Seam hunt (headlines)

- Two unreachable-by-construction capabilities: `ITERATION_CAPS.{audit,
  gapCheck}` (REQ-DATA-20, D-STB.5b-2) and the review-side `fetchViaFetcher`
  grant (REQ-ARCH-21, D-STB.5b-3).
- REQ-ARCH-13's event-delivery SLO is breaching live (2238 ms vs 2 s;
  D-SLO.1-6) — subsumed-but-unproven.
- REQ-SPEC-29 itself is PARTIAL — the acceptance mechanism can't grade MET
  while 16 of its own steps are red and nightly-green isn't established.
- G2 remains DEFERRED; **no §16.4 claim may be marked satisfied by
  implication** — REQ-EVAL-15/-16 stay PARTIAL, REQ-EVAL-19's prohibition MET.

## Test results (this session)

- `pnpm vitest run scripts/check-coverage-matrix.test.mjs` — **6/6 PASS**
- `pnpm test` — **448 files / 4,552 tests passed**, 4 skipped, **0 failed**
- `pnpm turbo build lint typecheck` — **135/135** (FULL TURBO)
- `node docs/build/tools/check-append-only.mjs --base 6397c1f` — **OK**
- `check-build-memory.sh .` — **0 violations** (7 pre-existing baseline
  warnings; ADR-089's `## Revisit trigger` was added to clear the only new one)

## Caveats

- The chain tip `6397c1f` was never deployed; journey greens are proven at
  prior deployed SHAs — CAP.2 re-verifies at a merged SHA.
- Every non-MET row has an owner, a `D-*` row, or a spec-deferred level — the
  prior CAPSTONE's "0 GAP" holds under the stricter rubric, now with routing.
- New DEFERRALS: `D-CAP.1-1` (REQ-IDE-1 layout-restore clause), `D-CAP.1-2`
  (REQ-BETA-5 emission-audit coverage) — both routed CAP.2.
- No secrets anywhere in the deliverables; PR body carries no live URLs beyond
  repo paths.
