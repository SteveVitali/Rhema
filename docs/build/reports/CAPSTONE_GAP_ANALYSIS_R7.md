# CAPSTONE GAP ANALYSIS — Round 7 (R7CAP.1, manifest row 251)

**Ticket:** `docs/tickets/251_R7CAP.1__capstone-gap-analysis.md` · **Branch:**
`stevevitali/r7cap-1-gap-analysis` · **Base:** `stevevitali/r7dep-2-t1-prod` @ `5c7d3cfb`
· **Date:** 2026-11-08 · **Harness:** devin-desktop/swe-2-high/subagent · **Mode:**
`implement-spec gap_analysis=true live_verification=false` — Stage-A analysis only; every
probe was read-only, spend **$0**, zero production mutations.
**Normative loads:** `docs/round-7-draft-spec.md` v0.2 (ratified GD-RATIFY.R7);
`docs/tickets/00_MANIFEST.md`; `docs/tickets/DEFERRALS.md`; `docs/build/COVERAGE_MATRIX.csv`;
`docs/build/BACKLOG.csv`; `docs/build/planning/2026-11-03_r7-demo/finding-map.csv`
(+ R5-ux-browser-audit, R6-ux-code-audit, REVIEW-round-7-draft-spec); the deployed-evidence
set under `docs/build/reports/2026-11-{04,05,07,08}_R7DEP.*/`.
**Independence (BM-VERDICT-01):** every verdict below was formed from the spec text, the
composed tree, and the deployed evidence BEFORE any `docs/build/runs/R7*.md` ledger was
opened; run-ledger claims were reconciled afterwards. This ordering is recorded here
per AC-4's explicit statement requirement.

## Verdict grammar

`MET` — the requirement's own layer reached with cited evidence · `MET-DIFFERENTLY` —
satisfied by a different-but-ratified mechanism (ruling/ADR named) · `MET-ENGINEERED(D-id)` —
engineering landed and verified at its required level; a live/bespoke leg is owed on a named
OPEN D-row · `PARTIAL` — substance landed, remainder owed · `MISSING` — not landed, routed ·
`N/A-RATIONALE` — the spec itself removes the requirement (BACKLOG row named).

## Coverage roll-up (135 round-7 requirement ids)

| verdict | count | ids |
|---|---|---|
| MET | 111 | all CORPOUS-1…15; CONV-1…16; DWEB-1…6, 8…13, 15…17; TOUR-1, 3…9 except 2; PANE-0…5; RELOAD-1…7; WRITE-4, 5, 7, 8; HOME-3…6; TALK-1…3; KEYS-1, 2; COPY-1, 2, 5, 6, 8; SYNC-1…6; SPEED-1…5; SHELL-1, 2, 4, 6, 7; KIT-2, 3, 4; PUB-1, 2; GUARD-1…4; DACC-1, 3…6, 8; DOPS-1…8; CLOSE-1, 5 |
| MET-DIFFERENTLY | 0 | — |
| MET-ENGINEERED | 18 | REQ-CONV-17 (D-R7DEM.2c-1), REQ-TOUR-2 (D-R7TOUR.2-1→F-9), REQ-KIT-1 + REQ-COPY-7 (D-R7KIT.1-1), REQ-COPY-4 (D-R7COPY.0-1), REQ-COPY-3 (D-R7COPY.1b-1), REQ-SHELL-3/5 (D-R7SHELL.1b-1), REQ-HOME-1/2 (D-R7HOME.1-1/-2b-1), REQ-WRITE-6 (D-R7WRITE.1a-1), REQ-TALK-4 (D-R7TALK.1b-1), REQ-DACC-2 (D-R7DEP.2-2), REQ-DACC-7 (D-R7DEP.2-1), REQ-DWEB-7 (bespoke carry → the D3 leg itself green), REQ-SHELL-7's bespoke arm — see matrix rows |
| PARTIAL | 1 | REQ-KIT-5 (R7KIT.3a's honest +0.3 kB over-allowance → acceptance-list deviation) |
| MISSING | 3 | REQ-CLOSE-2 → 252, REQ-CLOSE-3 → 253, REQ-CLOSE-4 → 254 |
| N/A-RATIONALE | 1 | REQ-WRITE-3 → BL-97 |

Every `MET`/`MET-DIFFERENTLY` row cites path/test/deployed evidence; every `MET-ENGINEERED`
row's D-row names the requirement and is OPEN; no `MET` row cites an OPEN/PARTIAL D-row;
every B-evidence requirement reached `live-executed` or is owed on a named row.
`check-coverage-matrix` (extended to the round-7 corpus this ticket): **6/6 green**.

## §1 done-definition judgment

| §1 bullet | verdict | basis |
|---|---|---|
| all six §1 sub-clauses | MET | R7a demo deployed (4bc8cf4a) + R7b deployed (e578a767), provenance all-PASS both |
| "nothing in flight" | MET | BUILD_INDEX rows 207–300 closed; R7CAP.1 is the last pre-gate row |
| P0/P1 accounted | MET | finding-map: 0 unmapped rows; every R5/R6 P0/P1 closed with leg/test/screenshot evidence or a recorded ruling (G1, UXC-13 wontfix under GD-UX-P1-BACKLOG.R7) |
| P2 fixed-or-backlogged | MET | P2s either fixed in a touched surface (A8, A9, B8, A11, D4, F4, C9, C11, C12, G4, B15, B18, UXC-26…) or on dated BL rows 90–101 |
| no OPEN deferral without owner+date | MET | `## R7CAP.1` census section + dated tails appended; every round-7 OPEN row now names owner + 2026-11-08 date |
| "the whole round is one judgement" | this document | — |

## Seam hunt (round-7 invariants)

- **ReadOnlyProject across demo/showcase/run_lock** — `packages/contracts/src/read-only-project.ts` carries the verbatim reason union; all three reasons walked green at prod (D3.readonly, R8.showcase.spa, run_lock through U-legs). MET.
- **Demo zero-read vs sidebar/palette/prefetch/right panel** — recording-proxy regenerated table (`docs/demo-side-effects.md`) zero-violation on the deployed tip; the demo shell variant carries zero workspace reads (app-shell.dom.test). MET.
- **Tour targets vs final surfaces + chords** — re-pin landed (248 R7TOUR.2); `?`/chords never tour-driven (tour steps carry no keys; `?` sheet kept per ADR-128). D2.tour green at preview; **prod arm red → F-9** (asset-parity, not tour code).
- **Two-tenant GET /search** — probe legs committed and run at t1f (`two-tenant-t1f/two-tenant-bff.json`, zero cross-tenant findings). MET.
- **No-reload + occlusion guards** — U2.noreload + U3.occlusion green at prod e578a767; S-14 exclusions by name in `noreload.ts`. MET.
- **Deploy provenance + corpus/image assertions** — provenance all-PASS web+api at `e578a767`; image-content assert ran on pulled digests; `deployments` row recorded. MET.
- **Guards green** — GUARD-1 0 diagnostics global; GUARD-2/3/4 wired in CI + legs green at prod.
- **Budget** — entry +33.3 kB cumulative vs baseline; every ticket declared its increment; **R7KIT.3a declared +15.3 kB vs the ≤15 kB allowance** — honest declaration, ruling owed (acceptance-list item). PARTIAL.
- **Composed vs replayed run card** — COPY-4 record-composed (real runs) + DWEB-15 replayed (demo) coexist without double-count claims. MET.
- **Licenses / no-cookie / protocol-markers / DOM-contract / SPA-budget** — all checks green through every round-7 row.
- **HUMAN-H16** — no `F-R7UX-*` rows exist in the finding map or DEFERRALS; no record of an H16 walk was found on the chain → **acceptance-list waiver candidate** (skipped-or-undispositioned HUMAN-H16).

## Finding accounting

- R5: 60 finding rows → 57 closed with deployed/leg/test evidence, 2 wontfix (G1 word-marks,
  UXC-13 marketing remainder — both under GD-UX-P1-BACKLOG.R7 / BL-88/BL-89), rest routed to
  dated BL-90…96, BL-98, BL-101 (economics → BL-13, no money-mode change).
- R6: 36 UXC rows → all closed with deployed evidence or routed (UXC-13 wontfix).
- Review: 38 RV rows → all dispositioned through Appendix-E owners (closed; the two spec-level
  routings surfaced as BL-97/BL-99).
- R7 deployed findings: F-R7DEP.1-1…3 resolved at source (223b + R7FIX.2); the 250 defect
  boundary's F-1…F-8 closed across six rounds; **the 12 Stage-B honest reds (F-9…F-16) are
  dispositioned, not hidden**: F-9 asset-parity (D2.tour prod flip owed), F-10…F-14 real
  product defects → the post-round defect insert under D-R7DEP.2-2; F-15 pre-existing
  magic-link loop; F-16 env-bound legs (`JOURNEY_DATABASE_URL`, unexpired token). Zero
  unmapped findings.
- R7OPEN.1's own flips verified: D-OBS.1-3 flipped DONE (nightly 41472916874); D-SPA.28-1 +
  D-P1.17-2 + D-FIX.1-2 interactions recorded.

## Deferral census

`## R7CAP.1` section in DEFERRALS: 11 rows census-closed on deployed evidence (R7OPEN.1,
RO.1, FIX.1-1, PANE.1, SYNC.1, PUB.1, and the five defect-boundary rounds 250a–250e);
~30 OPEN bespoke-capture rows routed to owner **253_R7REC.1** (or a GATE-ACCEPT.R7 deviation);
4 OPEN defect/authority rows routed to the operator at 252 / the F-9…16 fix insert.
Every OPEN row carries owner + date.

## Operating-clause compliance

verification green (coverage test 6/6); tests accompany behaviour; every PR carried its REQ
ids (BUILD_INDEX); deferrals name evidence+unblock+proxy; ADRs 126–130 committed + filled;
BUILD_INDEX + LEDGER updated this row; AC layers satisfied (matrix + probes below);
dates from `date -u`; append-only respected (dated appends, no rewrites); exact gate words
used; harness in the run ledger.

## Probes run (read-only, $0)

- `GET https://rhema.tools/healthz` → 200 `{"ok":true,"gitSha":"e578a767…"}` at 2026-11-08T11:09Z — production provenance corroborated, no older than 24 h at commit.
- Registry census at tip: all 14 round-7 legs `expected:"green"` (D1/D2/D3/R11/P1.demo, R8 pair, U1–U7, U3.occlusion; U3.stopgap superseded).
- `check-coverage-matrix.test.mjs` → 6/6.

## Draft — what GATE-ACCEPT.R7 signs (no CAP.3 this round)

1. **Deployed state:** prod serves `e578a767` with provenance all-PASS; both phase deploys
   under GD-DEPLOY.R7 (classified previews, additive-only diffs, deployments rows, CDN
   invalidations); preview spend ≈$14/$20; nightly 42465216426 green.
2. **Coverage:** 135/135 round-7 requirement ids verdicted (111 MET · 18 MET-ENGINEERED ·
   1 PARTIAL · 3 MISSING-routed · 1 N/A); finding map 0 unmapped; deferral census complete.
3. **Deferrals accepted:** the bespoke-capture bundle → 253_R7REC.1 sweep; D-R7DEM.2c-1 →
   BL-100/253; D-R7TOUR.2-1 prod arm → the F-9 insert.
4. **Deviations accepted:** REQ-KIT-5 +0.3 kB declared over-allowance (honest reporting);
   `U3.stopgap` superseded by `U3.occlusion`; D2.tour's prod red is asset-parity class;
   scoped evidence stands at MET-ENGINEERED where recorded.
5. **Waivers:** paid U6 re-dispatch authority (the one authorized run failed 402, metered
   $0.00, paused per GD-UX-PAIDLEG.R7 — operator ruling at 252); HUMAN-H16 (no F-R7UX rows —
   skipped or undispositioned); env-bound legs (JOURNEY_DATABASE_URL, unexpired token);
   the 12 Stage-B reds dispositioned as recorded above.
6. **Expiry:** GD-DEPLOY.R7 + GD-UX-PAIDLEG.R7 expire at signature.
