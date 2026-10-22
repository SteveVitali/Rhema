# R6POST.1 — Prod arms on the deployed tip ($0 legs + the two pre-authorized fixture writes)

- **Sequence:** 189 of 208 · **Phase:** round 6 · **Kind:** ticket
- **base_branch:** current checkout
- **Depends on:** 188_R6INF.1 + HUMAN-H10 (the invite — withholds the invite-consume leg)
- **Run:** `implement-spec spec=docs/tickets/189_R6POST.1__prod-arms.md`
- **Gate status:** [x] the T8 mint + BL-78 seed **pre-ticked by `GD-PREAUTH-ACTS.R6`** (dry-run must
  match the itemized scope; a mismatch → PAUSE)
- **Live stage:** prod, $0 legs only (`paid:false`; `--expect-sha <deployed tip>`)
- **Production mutations:**
  - `mint-t8-export.mjs --execute` (D-FIX.1-1) — binds `JOURNEY_T8_EXPORT_TOKEN`;
  - `seed-bl78-fixtures.mjs --execute` + `--entitlement` (D-FIX.1-3) on the flagged tenant only.

  Both are `is_test`-scoped with pre-state captured; rollback per each script.
- **Size budget:** ~300 changed lines (evidence + leg re-specs). Seven leg families: if the working
  set will not fit one context, split POST-7 + POST-9 into a suffix-letter insert **before**
  starting (`mode=extend`).

## Goal
Discharge every merge+deploy-bound prod arm on the deployed tip, including the new usercontent
delivery, with SHA-matched evidence.

## Load
- `docs/round-6-draft-spec.md` §4.6 REQ-POST-1/-2/-3/-5/-7 (live)/-8/-9; DEFERRALS **D-SPA.6-1**,
  **D-OPS.1-1**, **D-SEC.2-1**, **D-PRB.01-1**, **D-CAP.1-1**, **D-FIX.1-1**, **D-FIX.1-3**,
  **D-STB.5b-4**, **D-MAINT.3-1**, **D-P1.18-1**, **D-R5OPS.1-2**, **D-P1.22-2**, **D-SLO.1-6**,
  **D-P1.17-2**.
- `packages/journeys` (`registry.ts`, `--expect-renderer`, `--expect-sha`), AGENTS.md § Browser
  journeys; `scripts/live/usercontent-cdn-verify.mjs` (re-pointed by R6UCD.1); `docs/build/runs/R6ENG.2.md`
  (the SSE re-read recipe).

## In scope — deliverables
1. **POST-1** SSR arm re-proof (phone-UA uncapped pane, edit POST, seam conformance, clean
   observability, control legs).
2. **POST-2** signed-in legs: mailto, invite-accept (consuming H10's invite — proves the shared
   throttle), `/r/:token` expiry, OAuth initiation.
3. **POST-3** deep-link restore.
4. **POST-5** fixture legs after the two executes: T8 410; entitlement render probes; export import
   round-trip parity. The 7-day expiry arm is owed to R6CLK.1.
5. **POST-7** usercontent: minted-URL probes (unsigned/signed/tampered/expired) + the header leg.
6. **POST-8** SSE window re-read (p95 ≤ 2,000 ms on the next window, or honestly re-owed with its
   date).
7. **POST-9** Lighthouse + axe on prod (LCP < 2.5 s, CLS < 0.05, reduced-motion), plus the
   drop-zone → signup → ingest ≤ 20 s round-trip on a flagged account.
8. Every closed D-row flipped with its evidence pointer; anything still red is re-owed with a
   classification.

## Out of scope
- Paid legs (the funded wave); posture stages (R6POST.2).

## Acceptance criteria
- [ ] Every leg's report committed with `--expect-sha` = the deployed tip; `consoleErrors:[]` where asserted *(live-executed)*
- [ ] $0 spend confirmed (guard read) *(live-executed)*
- [ ] verification green; every new behaviour has a test that fails if it is removed; requirement ids stamped in the PR; anything not automatically verifiable is a `DEFERRALS.md` row with its compensating control; ADRs written for every deviation and owned decision; `BUILD_INDEX.md` row and `LEDGER.md` advanced; operating clauses met — dates from the clock, PR checks read and recorded, AC layers stated, no living-record pins, protected records only appended, gate words verbatim, harness in the run-ledger header. *(agentic — the universal phase-gate AC)*

## Requirement IDs to satisfy and stamp in the PR
REQ-POST-1 REQ-POST-2 REQ-POST-3 REQ-POST-5 REQ-POST-7 REQ-POST-8 REQ-POST-9

## Cross-cutting invariants
- Manifest invariants 12, 13 + round-6 spec §8 (cohort hygiene: every account `is_test`).

## Operating clauses
- Cited from `docs/tickets/00_MANIFEST.md § Operating rules`.
