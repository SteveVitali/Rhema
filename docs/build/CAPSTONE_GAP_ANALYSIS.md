# CAP.1 — Capstone coverage & gap analysis

> **CAP.1 deliverable.** Independent, whole-build judgment of the composed chain
> `H0.1…86` against `docs/rhema-design-spec.md`. Companion machine record:
> `docs/build/COVERAGE_MATRIX.csv` (474 rows — one per `REQ-[A-Z]+-[0-9]+` in the
> spec, completeness-gated by `scripts/check-coverage-matrix.test.mjs`).

## 1. Method

**Independence is the point.** Every verdict below was drafted from the spec and the
composed tree **before any `docs/build/runs/*` ledger or `docs/build/readouts/*` file
was opened in this session**. What was read during the verdict pass, in order:

1. `docs/rhema-design-spec.md` — in full (normative §1–§18, appendices, requirement
   tables), producing the 474-id inventory (`REQ-[A-Z]+-\d+`).
2. `docs/tickets/00_MANIFEST.md` — chain order, requirement→ticket ownership,
   cross-cutting invariants, deferred-scope list, amendment history.
3. `docs/tickets/DEFERRALS.md` — in full; row statuses re-extracted mechanically
   (114 DONE / 72 OPEN / 25 PARTIAL / 1 WONTFIX / 1 ACCEPTED-SKELETON /
   1 RE-DEFERRED at base `6397c1f`).
4. `docs/build/BUILD_INDEX.md` — the per-PR index (not a run ledger); used for PR
   numbers, ADR ids, and provenance pointers.
5. The composed tree at `6397c1f` — packages/apps inventories, route tables,
   `packages/journeys/src/registry.ts` (46 steps: 30 green / 16 red), contracts,
   manifests, and colocated `*.test.ts` per family.

Per-ticket `runs/*.md` ledgers and `readouts/CAPSTONE.md` were **not** read before
the matrix was written; reconciliation against them is a later section of
`docs/build/runs/CAP.1.md`.

**Commands used for the verdict pass:** `find`/`ls`/`grep`/`rg` tree probes;
`git status`/`git log` for chain state; a Node one-liner validating the CSV
(columns, verdicts, evidence nonblank, cited-path existence); the new
`scripts/check-coverage-matrix.test.mjs` for the authoritative gate.

**Verdict rubric (owned decision — see ADR-089):**

- `MET` — implemented in the composed tree **and** evidenced by deterministic
  tests; for user-surface requirements the containing surface must also have a
  green JOURNEY.1 step walking it (REQ-SPEC-29 bar: a journey step, not a unit
  test alone).
- `MET-DIFFERENTLY` — the requirement's literal mechanism was superseded by a
  spec amendment or ADR and the amended form is what the tree implements
  (e.g. GCP-for-AWS, committed `@rhema/protocols`, proposal-cards-for-suggestion-
  marks, phone-web-for-app, cited⇒fetched strip-and-downgrade).
- `PARTIAL` — implemented in part, or implemented-but-unverified where the
  requirement's own evidence bar is not yet met (un-walked surface, owed live
  leg, open deferral row in scope, broken composed path with code in place).
- `MISSING` — no implementation in the tree. Spec-deferred requirements
  (mobile app, working copy, seat pages, run-rounds loop, house styles,
  variants, share links, steelman, span marks, learned preferences…) are
  `MISSING` with `level` 1.x/Later — absent *per spec phasing*, not a defect.
- `AT-RISK-INTEGRATION` — parts exist and pass, but the composed cross-ticket
  path is demonstrably broken on the live surface today.

`level` = the spec's own phasing (MVP / BETA / 1.x / Later). `class` ∈
feature / contract / constraint / slo / gate / human / ops.

## 2. Roll-up by verdict

| Verdict | Count | Share |
|---|---|---|
| MET | 309 | 65.2% |
| PARTIAL | 113 | 23.8% |
| MISSING | 33 | 7.0% |
| MET-DIFFERENTLY | 18 | 3.8% |
| AT-RISK-INTEGRATION | 1 | 0.2% |
| **Total** | **474** | |

Read with `level`: 30 of the 33 MISSING are spec-deferred scope (all but two
MOBILE app rows, IDE-20/21, DATA-27/43, CHAT-26/27, GATE-14–16, WF-16,
PERSONA-19, POS-10, ARCH-10, OBJ-12/13, BETA-16/17). Two are amended-away
partner rows (BETA-16/17, superseded by the self-serve amendment, kept MISSING
because the literal requirement was never done). The single
AT-RISK-INTEGRATION is REQ-ACCT-3 (see seam hunt §4.1).

## 3. Roll-up by requirement family

| Family | n | MET | MET-DIFF | PARTIAL | MISSING | AT-RISK |
|---|---|---|---|---|---|---|
| REQ-IDE | 50 | 26 | — | 22 | 2 | — |
| REQ-VIS | 11 | 9 | 1 | 1 | — | — |
| REQ-DATA | 44 | 40 | 1 | 1 | 2 | — |
| REQ-GROWTH | 17 | 13 | — | 4 | — | — |
| REQ-BILL | 19 | 13 | — | 6 | — | — |
| REQ-ACCT | 4 | 1 | — | 2 | 1 | 1 |
| REQ-ARCH | 40 | 31 | 5 | 3 | 1 | — |
| REQ-RUN | 18 | 18 | — | — | — | — |
| REQ-CHAT | 30 | 14 | — | 14 | 2 | — |
| REQ-GATE | 16 | 10 | — | 3 | 3 | — |
| REQ-VIZ | 16 | 8 | — | 8 | — | — |
| REQ-MOBILE | 22 | 3 | 2 | 1 | 16 | — |
| REQ-PERSONA | 27 | 18 | — | 8 | 1 | — |
| REQ-INGEST | 14 | 11 | — | 3 | — | — |
| REQ-PROD | 16 | 15 | — | 1 | — | — |
| REQ-WF | 17 | 14 | — | 2 | 1 | — |
| REQ-GENRE | 7 | 6 | — | 1 | — | — |
| REQ-SPEC | 32 | 20 | 7 | 5 | — | — |
| REQ-OBJ | 19 | 15 | — | 2 | 2 | — |
| REQ-EVAL | 20 | 2 | — | 18 | — | — |
| REQ-POS | 13 | 9 | — | 3 | 1 | — |
| REQ-BETA | 22 | 13 | 2 | 5 | 2 | — |

The pattern is structural, not random: **backend contract/constraint families
(RUN, DATA, ARCH, WF, VIS) are near-complete MET; user-surface families (IDE,
CHAT, VIZ, PERSONA) are PARTIAL on the journey-walk bar; EVAL is PARTIAL on the
deferred-wave bar.** That is what "the code largely exists; composed live
verification is the open debt" looks like in numbers.

## 4. Seam hunt

The seam hunt looked specifically for (a) inter-ticket seams, (b) dual-owned
fields, (c) cross-cutting requirements silently subsumed by per-ticket lenses,
(d) composed paths never run green end-to-end, and (e) code/test/deployed/live
divergence.

### 4.1 The one AT-RISK-INTEGRATION

**REQ-ACCT-3** (account export→import round-trip): `packages/archive` builds
and imports the zip and unit tests pass, but journey step **T3 is red on prod**
because *two different tickets' seams* break the path live — the emailed export
token 404s under RLS (D-STB.5a-1) and the import POST 500s on
`artifacts_project_id_fkey` (D-STB.5a-2). Each side was verified independently;
the join never ran green. This is exactly the failure mode CAP.1 exists to
catch. → CAP.3 fix (rows already filed; no new deferral needed).

### 4.2 Unwired capabilities — implemented but unreachable by construction

- **REQ-DATA-20 (PARTIAL):** replan iteration caps are enforced, but
  `ITERATION_CAPS.{audit,gapCheck}` have **no consumer** — the audit/gap-check
  caps the spec names are unreachable (D-STB.5b-2, found by STB.5b's own
  defect rule). A capability that looks satisfied from the registry table but
  has no caller.
- **REQ-ARCH-21 (PARTIAL):** injection-control clause (fetchViaFetcher) is
  granted only to the holdout-calibrator — the review-side fetcher half is
  unreachable on a review run (D-STB.5b-3).

### 4.3 Dual-owned fields — where two tickets each "own" a surface

- **REQ-IDE-11/12/13/15/23/25/26/30/31** are dual-owned (P1.* with "beta PRB.*").
  The beta tickets built the dossier/run-card surfaces; P1 tickets rebuilt them
  extended. Seam verified where the shared surface is journey-walked (run card
  → R6 green; dossier → T1/T10/T11 green). Where the overlap is **not** walked
  (IDE-15 provisional streaming, IDE-26 reconciliation view) the matrix stays
  PARTIAL — no dual-owner blind spot allowed to count as coverage.
- **REQ-DATA-34 / REQ-BILL-3** (cap guarantee) is enforced at *two* layers —
  ledger DB constraint and proxy 402 — and proven at both live (cap-death 402s
  recorded). A dual-enforcement seam that *is* verified.
- **REQ-SPEC-5/23/26/28** (MET-DIFFERENTLY): reserved rows merged into
  REQ-ARCH-5, the seat table, and REQ-SPEC-30 respectively — all three targets
  are MET, so the merges are substantiated, not hiding gaps.

### 4.4 Cross-cutting requirements subsumed without proof

- **REQ-ARCH-13 (event-delivery p95 ≤ 2 s)** was subsumed into the SLO program
  (ADR-056 corrected probes) — and is **currently breaching live** (2238 ms
  reading, D-SLO.1-6). Subsumption without re-verification → PARTIAL.
- **REQ-SPEC-29 itself** (the journey-acceptance rule) is PARTIAL: the harness
  exists and 30/46 steps are green, but 16 registered steps are still red and
  nightly-green-on-deployed-SHA is not yet established (D-OBS.1-3). The
  acceptance mechanism cannot grade itself MET while it reports owed steps.
- **REQ-SPEC-32** (cost truthfulness): (a) committed=metered-clamped-cap
  machinery is live, (b) one estimator/config feeds all displayed claims —
  green on N4/C1 — but (c) the ±15% calibration target has **zero admissible
  samples** (D-ECON.1-3). Truthfulness is proven only on flagged-tenant
  traffic; the real-user audience flip is operator-paused (D-ACT.1-3).

### 4.5 Composed paths never run green end-to-end

Red journey steps mark the live legs the whole build still owes (all are
tracked deferrals — none is a silent gap):

| Path | Steps | Tracked by |
|---|---|---|
| Sidecar-absent run + phase-pin + single-craft-phase + completion | B16 | D-P0.03-2 (funding refused — weekly guard) |
| Live-tail + post-commit replay high-water join | B17 | D-P0.08b-2 |
| Full-board fetch-log attribution | B18A | D-STB.5b-3 chain |
| Memo user-source deny-before-forward | B18B | live-proven headless (STB.3); journey form owed |
| approve_plan structured edit → overlay → delivery | B19A | D-P1.10-1 |
| approve_outline edit → promotion → delivery | B19B | D-P1.12-1 |
| Full-profile voice calibration/hold-out | B19C | D-P1.14-1 |
| Findings Apply + one-preview bulk at volume | T13 | D-P1.07-1 / D-ECON.1-2 (cap) |
| Gate deep-link → approval card | T15 | D-P1.09-1 |
| Voice stale pill across surfaces | T16 | D-P1.14-1 residual |
| Account export→import round-trip | T3 | D-STB.5a-1/-2 |
| Export-token 410 leg; tombstone purge schedule | T8/T7 | D-P1.18-1 / D-STB.5a-3 |
| Refund-window UX | R9 | D-DEF.4-1/-3 |
| Contradicted-claim + zero-chip dossier evidence | N6/N11 | D-RES.1-2 / D-CITE.1-* |

### 4.6 Code / tests / deployed provenance / live — the honest layering

- **Code + deterministic tests:** all 474 requirements were judged on the
  composed tree at `6397c1f`; ~440 have implementing code, and the root suite
  (448 files / ~4.5k tests at STB.5b's recording) pins contracts.
- **Deployed provenance:** every `live:` claim in the matrix traces to a
  deferral row closed on a real deployment (`prod:<sha>`) or a green journey
  step — all recorded against **earlier deployed SHAs**, not the current tip.
- **Live behavior:** the current chain tip `6397c1f` has itself never been
  deployed or re-verified live; journey greens are "proven at a prior
  provenance", not "this tree is proven". CAP.2 exists precisely to re-run the
  composed suite at a merged SHA.
- **Deferred vs refused:** B16–B19C are *spend-refused* (the $5/week guard
  refused pre-browser — correct behavior) with a measurement defect behind it
  (D-STB.5b-1: system-role meter reads $58.08 while the app role reads $0
  through RLS). The legs owe execution in an ISO week under the guard.

## 5. Top gaps (≈10) and their routing

Ordered by load-bearing weight; each already has an owner unless noted.

1. **Account export→import live-broken** (REQ-ACCT-3, AT-RISK) → **CAP.3 fix**;
   defects filed D-STB.5a-1/-2.
2. **Bounded paid legs refused/unexecuted** — B16–B19C: phase-pin, live-tail,
   fetch-log attribution, memo deny, plan/outline edits, voice calibrate →
   **CAP.3** (execute in a sub-$5 ISO week after D-STB.5b-1's app-role meter
   fix lands).
3. **Findings apply + bulk-disposition live path** (REQ-SPEC-6/-7, REQ-IDE-29;
   T13 red) → **CAP.2/CAP.3** (needs a suggestion-bearing finding on the
   tenant; CITE.1's citation work may supply it).
4. **Gate deep-link → approval-card compose** (REQ-IDE-16, REQ-GATE-1; T15
   red) → **CAP.2** walk + **CAP.3** if the route is the defect.
5. **Draft/Outline approval-edit delivery overlays** (REQ-WF-4, REQ-CHAT-15;
   B19A/B19B + D-P1.10-1/-12-1) → **CAP.3** (paid legs owed).
6. **Citation evidence completeness at volume** (REQ-IDE-25, REQ-VIS-9's chip
   invariant; N11 red + D-CITE.1-1…5) → **CITE.1/CAP.3**.
7. **Event-delivery SLO breach** (REQ-ARCH-13; 2238 ms vs 2 s; D-SLO.1-6) →
   **CAP.3** (post-commit wakeup lever recorded).
8. **Refund-window prod ruling + R9 leg** (REQ-SPEC-24-adjacent; D-DEF.4-1/-3)
   → **CAP.3/operator decision** (`REFUND_WINDOW_MODE` ruling owed).
9. **Real-money billing legs** (REQ-BILL-14/15 surface half; D-BILL.3-1/-2 —
   live-mode Stripe purchase + provider-verified window) → **CAP.3/operator**.
10. **Estimator calibration with zero admissible samples** (REQ-SPEC-32(c),
    REQ-BILL-7; D-ECON.1-3/-4; ECON.2 lever measurements) → **CAP.3** after the
    audience flip; until then all ±15% claims stay unmade (lint-enforced).
11. **Weekly meter mis-measure under RLS** (D-STB.5b-1 — system role $58.08 vs
    app role $0) → **CAP.3**; it gates every future paid journey leg.

## 6. §18 benchmark gate and deferred obligations

- **EVAL family: 18/20 PARTIAL, 2 MET.** The §18 machinery is real
  (`packages/benchmark` corpus/enclave/gold/IAA/power/scorers;
  `packages/benchmark-runner` arms/normalization/adjudication/judges/
  preregistration/report/cadence/report-guard), but wave 1 has not run and the
  corpus/annotator/provider-terms legs are HUMAN (H2). **REQ-EVAL-15/-16 stay
  PARTIAL — G2 remains DEFERRED; no §16.4 claim may be marked satisfied by
  implication.** REQ-EVAL-19 (the *prohibition* on unmeasured comparative
  claims) is the one EVAL requirement fully MET — enforced by
  `report-guard.ts` + the claims lint; HOT.1 hid the false claims.
- **DEFERRALS ledger:** 72 OPEN + 25 PARTIAL rows at base; every red journey
  step and every PARTIAL verdict above maps to an existing row **except two
  fresh findings**, appended this run as **D-CAP.1-1** (deep-link layout
  restore — REQ-IDE-1's second clause is unverified by any row) and
  **D-CAP.1-2** (analytics emission-audit completeness — REQ-BETA-5's
  "every surface emits" clause has no verifying leg).
- **G3 was read early** on operator evidence with the caveat recorded
  (REQ-BETA-18 PARTIAL); H2/H3/H4 remain operator-owned (corpus, partners,
  venue-table verification).

## 7. Caveats — what this analysis does not claim

- It does **not** prove the design live end-to-end: 113 PARTIAL + 16 red
  journey steps + a never-deployed chain tip say otherwise.
- It does **not** treat test-green as deployment: live claims cite only
  deferral-closed legs or green journey steps, each at a recorded provenance.
- It does **not** read verdicts off per-ticket ledgers; §1 lists exactly what
  was read before verdicts froze.
- Journey `expected: "green"` flags in `packages/journeys/src/registry.ts`
  were taken at face value (code state, not re-execution); CAP.2 re-executes.
- Human/operator-owned requirements (corpus, partners, venue table, invites,
  ASN credential arm, provider terms, procurement pen-test) are marked PARTIAL
  or MISSING-by-class and routed H2/H3/H4/operator — they are not
  implementation gaps.
