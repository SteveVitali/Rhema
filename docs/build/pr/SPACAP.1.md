# SPACAP.1 — capstone gap analysis: the composed round-4 chain judged against the whole SPA spec

Manifest row 140 · stacks on `stevevitali/spa-28-override-machinery-removal` @ `30afea7` ·
merge policy **OPERATOR** — do not merge from the build environment · **$0** spend, no
deploys, no production writes.

Implements `docs/tickets/140_SPACAP.1__capstone-gap-analysis.md` per
`docs/frontend-spa-spec.md` — audit + documentation only; every gap found is **routed
to SPACAP.3**, not fixed here.

**Requirement IDs:** none stamped (process/capstone row — the 192 SPA REQ ids are
*audited by* this matrix, not owned by it).

## What this does

- **`docs/build/COVERAGE_MATRIX.csv` — +192 rows.** One row per SPA-spec requirement
  id (Appendix A's 14 families: INV/ISL/DAT/TST/FW/TL/BFF/ED/UX/NAV/BND/VFY/SAFE/SEQ),
  appended to the round-3 design matrix (666 data rows total) under the unchanged
  eleven-column schema and verdict vocabulary.
- **`docs/build/reports/CAPSTONE_GAP_ANALYSIS_SPA.md` — the capstone.** Independence
  statement + method, verdict roll-ups, the six-seam hunt, the routed gap list
  (G1–G5), caveats.
- **`scripts/check-coverage-matrix.test.mjs` — union inventory.** The completeness
  gate now reads `rhema-design-spec.md` ∪ `frontend-spa-spec.md` and expands the
  spec's `REQ-FAM-a..b` range citations (57 of the 192 SPA ids exist only via
  Appendix-A ranges). Round-3 rows and rules untouched.

## Verdict roll-up

| MET | MET-DIFFERENTLY | PARTIAL | MISSING | AT-RISK-INTEGRATION |
|---|---|---|---|---|
| 174 | 12 | 6 | 0 | 0 |

Every mechanism requirement is MET; the six PARTIALs are all
verification-procedure rows (REQ-VFY-6/8/10, REQ-SEQ-7/9/10) backed by existing
DEFERRALS rows and routed to SPACAP.3. The 12 MET-DIFFERENTLY rows are
spec-sanctioned amendments/retirements (R11 `{url}`-validation; REQ-SEQ-4's own
removal leg for the flag/override machinery; the accepted `draft:<id>` registry
keying).

## Seam hunt — headline findings (routed to SPACAP.3)

- **G1 (HIGH, process):** the cleanup wave (SPA.26/27/28) sits *above* the prod
  flips in this stacked chain while its entry gates (all flips merged + ≥1
  nightly green) can only be satisfied by deploying *below* it. Merge+deploy of
  the tip in one step would jump prod all-SSR → all-SPA with the config-flip
  rollback already deleted. Mitigation: operator's bottom-up merge/deploy
  cadence; resolution: an ordered merge/deploy runbook + fold surviving legs
  into SPACAP.2.
- **G2 (LOW, code):** the boot map's forced-SSR leg replicates only
  `phone && pageMount` (`spa-shell.ts:179`), not `row.showcase`
  (`server.ts:3894`) — a client nav to a showcase Page-family route SPA-renders
  where a document load forces SSR. Posture is preserved at the BFF layer
  (`readOnly` + `collabWsUrl` withheld identically); divergence is
  renderer-label/render-path only.
- **G3–G5 (MED):** REQ-VFY-8's two-leg procedure unexecutable post-SPA.28 and
  never run live (all `D-SPA.*-1` OPEN behind `D-MAINT.6-1`'s missing Resend
  secret); owed free steps R6F/T12F/T13F/T17 still `expected:"red"`; the
  authoritative journey-axe legs have no green live run.

Boot-payload staleness, mixed-mode navs, storage-schema coexistence, and the
`ide-chrome` AND gate were all **verified clean** — details in the capstone doc.

## Verify

- `pnpm turbo build lint typecheck` — 135/135 green.
- `pnpm test` — 5,549 pass / 6 skip / 0 fail (487 files).
- Coverage-matrix checker — 6/6 (666-row union inventory complete).
- `check:licenses` 822 · `check:protocol-markers` · `check:no-cookies` 253 ·
  `check:spa-budget` (all ceilings held) · `check:spa-env` · `check:dom-contract`
  (827 hooks / 18 surfaces, journey selectors ⊆ manifest ⊆ emitted+asserted) —
  all OK.

Full ledger: `docs/build/runs/SPACAP.1.md`.
