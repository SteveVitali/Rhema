# SPACAP.1 — run ledger: capstone gap analysis (round-4 whole-build verdict)

- **Ticket:** `docs/tickets/140_SPACAP.1__capstone-gap-analysis.md` (manifest row 140)
- **Branch:** `stevevitali/spacap-1-capstone-gap-analysis` — forked from
  `stevevitali/spa-28-override-machinery-removal` @ `30afea7` (the requested chain tip).
- **PR:** opened at closeout against `stevevitali/spa-28-override-machinery-removal`;
  `gh pr checks --watch=false` read once at closeout (§ 7).
- **Harness:** devin-cli subagent (per the 2026-10-08T23:05Z dispatch-tier ruling).
- **Mode:** audit + documentation only, $0 — no implementation fixes, no deploys, no
  production writes, mergePolicy OPERATOR. Per the ticket: gaps are **routed**, not fixed.
- **Spend:** `paid:false` legs only; no metered spend ($0).

## 1 — What landed

- **`docs/build/COVERAGE_MATRIX.csv` — 192 SPA rows appended** to the round-3
  product/design matrix (666 data rows total, 474 design + 192 SPA), exactly one
  row per requirement id in `docs/frontend-spa-spec.md` Appendix A's 14 families
  (INV 8 · ISL 16 · DAT 14 · TST 10 · FW 12 · TL 14 · BFF 30 · ED 17 · UX 16 ·
  NAV 11 · BND 12 · VFY 10 · SAFE 10 · SEQ 12). Schema and verdict vocabulary are
  the round-3 `86_CAP.1` contract, untouched.
- **`docs/build/CAPSTONE_GAP_ANALYSIS_SPA.md` — the capstone document.** Method
  and independence statement, verdict roll-ups, the six-seam hunt, the routed gap
  list for SPACAP.3 (five findings G1–G5 with severity/evidence/owner/resolution),
  and caveats.
- **`scripts/check-coverage-matrix.test.mjs` — extended, not replaced.** The
  authoritative inventory is now the union of `docs/rhema-design-spec.md` and
  `docs/frontend-spa-spec.md`, with `REQ-FAM-a..b` range expansion so the SPA
  spec's Appendix-A index-only ids (57 of the 192 are cited only via ranges)
  count as authoritative. The round-3 inventory is preserved verbatim — no design
  row was touched; the families are disjoint namespaces.

## 2 — AC accounting

- **Every SPA-spec requirement id has exactly one matrix row with a verdict** —
  MET: checker enforces the union inventory with no missing/extras/duplicates;
  192/192 rows present, 6/6 checker tests green.
- **Every PARTIAL/MISSING verdict is routed to SPACAP.3 or a DEFERRALS row** —
  MET: all six PARTIAL rows (REQ-VFY-6/8/10, REQ-SEQ-7/9/10) carry `deferral:*`
  refs that resolve plus `spacap:SPACAP.3` routing. Zero MISSING, zero
  AT-RISK-INTEGRATION.
- **Seam hunt delivered** — MET: §4 of the capstone doc covers all six contracted
  seams; one real divergence found (§4.5, the `row.showcase` boot-map leg) plus
  the headline deployment-ordering risk (§4.6).
- **Routed gap list → SPACAP.3** — MET: §5 of the capstone doc (G1–G5 with
  severity, evidence, owning surface, proposed resolution).
- **Universal phase-gate AC** — MET: verification green (§3); no living-record
  pins (all per-document `data-spa-boot` is a serve-time embed); protected records
  only appended; gate words verbatim (`check:dom-contract` output quoted in §3);
  build-memory records written; PR checks read once at closeout.

## 3 — Verify (all run this session)

- `pnpm turbo build lint typecheck` — **135/135 tasks** green.
- `pnpm test` — **5,549 pass / 6 skip / 0 fail** (487 files).
- `pnpm vitest run scripts/check-coverage-matrix.test.mjs` — **6/6 green**
  (header, ≥600-id union inventory [actual 666], one-row-per-id, verdicts +
  populated columns, MET evidence nonblank, cited paths/deferrals/journeys).
- `pnpm check:licenses` — OK (822 packages).
- `pnpm check:protocol-markers` — OK (sentinels armed; 248 public-facing files).
- `pnpm check:no-cookies` — OK (253 ingestion-surface files).
- `pnpm check:spa-budget` — **OK — all ceilings held** (146 emitted artifacts).
- `pnpm check:spa-env` — OK (111 client sources, 146 artifacts, 50 banned names).
- `pnpm check:dom-contract` — **OK — journey selectors ⊆ manifest ⊆
  emitted+asserted** (827 hooks / 18 surfaces).
- Validators: build-memory + append-only — see § 6.

## 4 — Deviations / owned decisions

1. **Union inventory, not replacement.** The ticket requires one row per SPA id
   *in* `COVERAGE_MATRIX.csv`; the file already carried the round-3 design-spec
   inventory gated by the same checker. Replaced the checker's single-spec read
   with the union + range expansion rather than create a second matrix or drop
   the design rows — the manifest's `canonicalSpec` is already
   `design + frontend-spa (additive)`, so the union is the correct authority.
2. **Verdict rubric for retired migration machinery** (owned decision): REQ-SEQ-1/3/4
   and friends are `MET-DIFFERENTLY`, not MISSING — the mechanisms served all 14
   flips and retired per their own spec'd sunset clause (REQ-SEQ-4's removal leg);
   the tripwire tests that now pin their *absence* are the evidence.
3. **Procedure-vs-mechanism split for PARTIAL.** Requirements whose own acceptance
   is a live leg (two-leg flip gates, prod flips + nightly bakes, owed seeded
   steps, journey-axe) are PARTIAL even though the mechanism is fully built and
   tested — the honest verdict is "implemented, verification owed," and each
   carries its DEFERRALS backing.
4. **One new defect found, routed not fixed** (the ticket's own rule): the boot
   map's forced-SSR leg drops `row.showcase` — recorded as capstone finding G2 /
   REQ-SEQ-12's routing note → SPACAP.3.
5. **Per-ID text sourced from the emitting notes.** Appendix A cites families by
   range; the normative per-ID sentences live in `docs/research/01–04` and
   `docs/design/20–29` (spec E-12 confirms index-only ids carry normative detail).
   Rows were written against those definitions — an early drafted batch
   (ED/UX/NAV) was rewritten when checked against them.

## 5 — Deferrals

Opened: none — every gap found maps to existing OPEN rows (the `D-SPA.*-1/-2`
preview legs, `D-SPAF.*-1..4` prod legs/bakes, `D-SPA.25-1` T17, `D-MAINT.6-1`
the shared Resend prerequisite) or is routed to SPACAP.3 by the capstone doc's
gap list. Closed: none (audit ticket — no legs were re-executed).
`D-OPS.1-1` / `D-MAINT.6-1` / all `D-SPA.*` / `D-SPAF.*` stay OPEN unchanged.

## 6 — Validators

- `bash ~/agent-skills/skills/build-memory/scripts/check-build-memory.sh .` —
  see § 7 closeout addendum.
- `node docs/build/tools/check-append-only.mjs --base 30afea7` — see § 7.

## 7 — PR checks read

`gh pr checks --watch=false` — recorded in the closeout addendum below.

---

## Closeout addendum (2026-10-10)

*(filled at PR creation — see §7 replacement lines committed with the closeout)*
