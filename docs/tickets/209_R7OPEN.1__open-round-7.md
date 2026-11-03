# R7OPEN.1 — Open round 7: rulings, ADR shells, deferrals, journey legs, finding map

- **Sequence:** 209 of 254 · **Phase:** round 7 (R7a) · **Kind:** ticket (records-mostly; one journeys-registry code change)
- **base_branch:** current checkout
- **Depends on:** nothing in round 7. It forks from `main` HEAD per spec §2 and `GD-ORDER.R7`, and it consumes the ratification (`GD-RATIFY.R7`) plus this decomposition (manifest `### Round 7`, rows 209–254).
- **Run:** `implement-spec spec=docs/tickets/209_R7OPEN.1__open-round-7.md`
- **Gate status:** none. It records rulings and writes no prod state. The D-OBS.1-3 / D-SPA.28-1 flips rest on existing evidence, not on a new live act.
- **Live stage:** Stage A only ($0). Repo only, plus a read-only `gh run view 41472916874` for the REQ-CLOSE-5 evidence. No owned preview (`GD-PREVIEW.R7`).
- **Production mutations:** none
- **Size budget:** ~700 changed lines of records (LEDGER, DEFERRALS, BACKLOG, ADR shells) plus ~200 lines of journeys code and tests. Excludes the generated ADR index and the `finding-map.csv` seed.

## Goal
Open round 7 in the committed build memory. Every operator ruling for the round goes into the LEDGER verbatim. ADR-126…130 exist as shells that their owning tickets fill. The round-7 DEFERRALS sections are open, and the two stale round-6 cells are flipped on their evidence. Every D* and U* journey leg is registered `expected:"red"` with exactly one owner, so the nightly cannot re-redden. The finding → REQ → ticket map and the §7 BACKLOG residue are seeded, so R7CAP.1 can account for every finding.

## Load (read these — do not re-read others)
- `docs/round-7-draft-spec.md`:
  - §2 posture;
  - §3.1 ruling table;
  - §3.2 ADR list;
  - §4.17 REQ-DACC-8 and REQ-DOPS-7;
  - §4.18 REQ-CLOSE-5;
  - §7 finding accounting;
  - §10 owner → leg map and row table.
- `docs/round-7-demo-brief.md` §7a, §7b and the third ruling batch: the verbatim selections.
- `docs/decomposition-prompt-r7.md` § Binding constraints (Authority, Honest accounting).
- `docs/build/planning/2026-11-03_r7-demo/R4-acceptance-deploy-conventions.md`:
  - §1, the registry and runner semantics, and the proposed demo leg set;
  - §4, GATE DECISIONS placement, the PHASE LOG recommendation, the ADR numbering and the DEFERRALS row format;
  - §5, the deferral interactions.
- `REVIEW-round-7-draft-spec.md` RV-13 and RV-38. The finding ids come from `R5-ux-browser-audit.md` (A*–I*, with severities inline) and `R6-ux-code-audit.md` §9 (UXC-*).
- `packages/journeys/AGENTS.md` § Code Conventions and Critical Gotchas 3–4, 8.
- Anchors (re-confirm at build time):
  - `docs/build/LEDGER.md`:
    - `## GATE DECISIONS` → `### Round 6` (7-column table). The last Round-6 row comes before `## RETURN PASS`.
    - The CURRENT STATE keys `nextTicket` / `round` / `chainTip`.
    - The 2026-11-02 PHASE LOG line citing `41472916874`.
  - `docs/tickets/DEFERRALS.md`:
    - `D-OBS.1-3` (~L798), `D-SPA.28-1` (~L1140), `D-P1.17-2` (~L664) and `D-FIX.1-2` (~L1208);
    - the last section `## R6OSS.1 …` (~L1258).
  - `docs/build/tools/check-append-only.mjs`, `deferral-status.mjs` and `deferral-status-normalize.mjs` (the first-canonical-token rule).
  - `docs/adr/_TEMPLATE.md`; the latest ADR is `ADR-125-protocols-public-stub-retained.md`.
  - `~/agent-skills/skills/build-memory/scripts/adr-index.sh`.
  - `docs/build/BACKLOG.csv`: header `bl_id,title,type,sources,req_ids,package,blocks,landing,gate,size,status`; the last id is `BL-87`; `BL-13` is economics.
  - `packages/journeys/src/registry.ts`: `STEP_REGISTRY` and the `JourneyStep` shape.
  - `packages/journeys/src/registry.test.ts`:
    - "every registry row has a wired implementation";
    - the owner regex `/^[A-Z0-9]+\.\d+[a-z]?$/`.
  - `packages/journeys/src/impls.ts` / `steps.ts` (`STEP_IMPLS`).
  - `.github/workflows/journeys.yml`. Nightly runs every `paid:false` leg from the `main` checkout. The weekly cron adds **every** `paid:true` leg.

## In scope — deliverables
1. **GATE DECISIONS `### Round 7`: verify, then complete** (REQ-DOPS-7).
   - **What exists.** The decomposition already appended the `### Round 7` sub-block before `## RETURN PASS`. It has a preamble and 7-column rows (`| date | ticket | gate | item | answer (verbatim) | consequence | kind |`) for the brief §7a/§7b/third-batch rulings plus `GD-RATIFY.R7`, `GD-DEPLOY.R7` and `GD-UX-PAIDLEG.R7`. Its preamble records that `GD-ORDER.R7` rides `GD-DEPLOY.R7`'s answer.
   - **Phase-4 rows (verify only).** The decomposition's Phase-4 review also appended four rows: `GD-GOLDEN.R7`, `GD-PREVIEW.R7`, `GD-PUBDELTA.R7` and `GD-TOURSIGN.R7`. Their source is the operator's Phase-4 answers, not the brief. Confirm that each is present once, with all 7 cells filled, and is cited by its consuming tickets: 224/250 for GOLDEN and PREVIEW, 240/244 for PUBDELTA, 248 for TOURSIGN. Never re-append, re-word or re-interpret them.
   - **Verify.** Check that every ruling id in brief §7a, §7b and the third batch appears in that block, with its `answer` byte-identical to the brief's verbatim selection.
   - **Fill gaps only.** Append a row for any id that is missing. Never duplicate an existing row or edit a recorded cell. A correction is a new dated row, because the block is append-only.
   - **Superseded consequences.** If a recorded `consequence` omits a supersession, append a dated note row. Examples: `GD-DEMO-DEPTH.R7`'s tour essay is superseded by `GD-DEMO-HERO.R7`, and `GD-DEMO-RUNS.R7`'s "real phases and gates" is narrowed by S-9.
   - **CURRENT STATE.** `round: 7` and `nextTicket` were already advanced by the decomposition. Advance `lastCompleted`/`updatedAt` at this ticket's close only.
   - **PHASE LOG.** Open `## PHASE LOG — Round 7` at the file end (R4 §4) if it is still absent. It was absent when the decomposition closed; the decomposition does not write it. Its first line records the round's opening (`GD-RATIFY.R7`, `GD-ORDER.R7`, and the Phase-4 rulings by id), and this ticket is logged after it.
2. **ADR-126…130 shells** (REQ-DOPS-7).
   - Write one file per ADR from `docs/adr/_TEMPLATE.md`. Each has Status `Proposed`, the spec §3.2 bullets cited (not restated), an **Owner** line naming the ticket(s) that fill and accept it, and a Revisit trigger.
   - Owners:

     | ADR | Owner |
     |---|---|
     | ADR-126 | 220 R7DEM.4; the S-1 URL-spike outcome (rewrite or 302 fallback) is recorded there by 220a R7DEM.4b; the REQ-TOUR-9 carve-out section is 223 R7DEM.6b's |
     | ADR-127 | 214 R7DEM.1; the landing-recording asset declaration is 249a R7PUB.1's |
     | ADR-128 | 211 R7RO.1 for the REQ-ED-12/Showcase item; the R7b owners per §10 (as split, Notes § Split rows) for the other items |
     | ADR-129 | 225 R7KIT.2; the no-raw-controls rule item is 225a R7KIT.2b's; the SplitPane choice is 229 R7PANE.1's |
     | ADR-130 | 213 R7COPY.0 |

   - Regenerate `docs/adr/README.md` with `adr-index.sh docs/adr`. Never hand-edit it.
   - Confirm that `docs/decomposition-prompt-r7.md` is committed. It is the frozen invocation record, so do not re-author it.
3. **DEFERRALS** (REQ-CLOSE-5).
   - Open the round-7 region: a dated preamble plus `## R7OPEN.1 — open round 7 (<date -u>)` with this ticket's own rows. Every later round-7 ticket opens its own section.
   - The preamble records the `GD-PREVIEW.R7` convention. No round-7 ticket stands up its own preview. Each ticket's Stage-B AC becomes a `D-<ticket>-n` row naming the evidence the phase deploy must capture. R7a rows are `staging-verified at the R7a phase preview (224_R7DEP.1)` and are closed by 224; R7b rows are closed by 250_R7DEP.2 the same way.
   - **Verify, then flip** `D-OBS.1-3` and `D-SPA.28-1` against scheduled nightly `41472916874`.
     - Read the run with `gh`: conclusion, head SHA, the deployed SHA it verified, and its legs.
     - Show that it meets each row's own "How to verify" text. For D-OBS.1-3, that means the OBS.1 deployment is an ancestor of the verified SHA. For D-SPA.28-1, it means ≥ 1 nightly green since the last flip.
     - Flip by prepending a dated canonical keyword. The original cell survives verbatim. If either condition is **not** met, leave the row OPEN with a dated note instead.
   - **Interaction notes.** Append dated notes to `D-P1.17-2` (its Lighthouse/axe arm vs REQ-DACC-4's `P1.demo`) and `D-FIX.1-2` (the real-UA phone context vs `P1.demo` and 247 R7RO.2). Each note names the round-7 ticket that may discharge the arm. Neither row is closed here.
4. **Journey legs, all registered red** (REQ-DACC-8; spec §10 owner map; R4 §1).
   - Add `STEP_REGISTRY` rows, each `expected:"red"`, `paid:false`, with an `asserts` line citing its REQ.
   - Each row gets a wired stub implementation that fails with an explicit "owed — owner <ticket>" error. The runner then reports `owed`, never a pass.
   - Legs and owners. Each owner must be a single ticket id matching the owner regex:

     | Leg | Owner | Flipped green by | Notes |
     |---|---|---|---|
     | `D1.hub` | R7DEM.5b (221a) | 224 R7DEP.1 | §10 names R7DEM.5; the hub moved to 221a in the Phase-4 split |
     | `D3.readonly` | R7DEM.5 (221) | 224 R7DEP.1 | |
     | `D2.tour` | R7DEM.6a (222) | 224 R7DEP.1; re-flipped by 248 R7TOUR.2, then 250 R7DEP.2 | 248 is a **sanctioned re-flipper** (P4-23): it may re-pin and re-flip this row without becoming its owner |
     | `P1.demo` | R7DEM.4b (220a) | 224 R7DEP.1 | 209's single-owner pick (P4-5): §10 names "R7DEM.4/5"; the SPA render is 220a's after the split; 221a extends the leg body only |
     | the `R*.demo` leg | R7DEM.4b (220a) | 224 R7DEP.1 | same pick as `P1.demo`; fix its concrete id, e.g. the next free `R` number + `.demo` |
     | `U1.shell` | R7SHELL.1a | 250 R7DEP.2 | |
     | `U2.noreload` | R7RELOAD.1 | 250 R7DEP.2 | |
     | `U3.occlusion` | R7PANE.1 | 250 R7DEP.2 | |
     | `U4.controls` | R7KIT.3e (243a) | 250 R7DEP.2 | §10 names R7KIT.3d; the dossier (one of its 12 surfaces) moved to 243a, so the owner moves too. Record this as a §10 owner-map deviation |
     | `U5.write` | R7WRITE.1b | 250 R7DEP.2 | |
     | `U6.chat` | R7TALK.1a | 250 R7DEP.2 | free, stubbed turn; never a `paid:true` row (Out of scope) |
     | `U7.import` | R7HOME.2a | 250 R7DEP.2 | |
     | `U3.stopgap` (sub-assertion) | R7FIX.1 | 224 R7DEP.1 | the R7a stopgap probe |
     | `R8.showcase.spa` (sub-assertion) | R7RO.1 | 224 R7DEP.1 | SPA renderer re-expectation, REQ-DACC-6 |

   - **Flip authority** (nightly hazard; `GD-PREVIEW.R7`).
     - The nightly runs `main`'s registry against prod, and no owner has a preview of its own. Each owner therefore lands its leg body, keeps the row `expected:"red"`, and records it as `ready-to-flip` with its Stage-A evidence.
     - The phase deploy flips the leg at its phase preview and prod: 224 for R7a legs, 250 for R7b legs. These deploy tickets and 248 (for `D2.tour`) are the only **sanctioned flippers** besides an owner. The owner is still the single `owner` value on the registry row, and REQ-DACC-8's "owner flips" is met through this delegation.
   - Commit the owner → leg map, including the flipper column, as a table in this ticket's run record.
5. **Finding map + BACKLOG seeds** (spec §7; decomposition prompt § Honest accounting).
   - **`finding-map.csv`.** Seed `docs/build/planning/2026-11-03_r7-demo/finding-map.csv` with columns `finding_id,source,severity,req_ids,owner_ticket,evidence,status`.
     - It has one row per R5 finding id and per R6 UXC id.
     - REQs come from the spec §4 `[…]` brackets. Owners come from §10 as amended by the Phase-4 split rows (Notes § Split rows): a finding whose REQ moved goes to the new row.
     - Every P0/P1 maps to a REQ with exactly one owning ticket, or to a ruling (`GD-UX-P1-BACKLOG.R7`).
     - P2s outside touched surfaces map to a BACKLOG row.
   - **BACKLOG.csv.** Append the §7 residue rows (from `BL-88`):
     - the two WONTFIX-this-round rows (R5 G1; the UXC-13 remainder), citing `GD-UX-P1-BACKLOG.R7`;
     - the P2 rows (A6, A8, B8, B9, B10, H4, H5);
     - REQ-WRITE-3;
     - PANE-1 drag persistence/reset;
     - token-level chat streaming (`GD-UX-STREAM.R7`);
     - `parseDraftLedgerSections` (REQ-CONV-17).
   - **BL-13.** Record the economics evidence (R5 E1, I9, D8) as a new row pointing at `BL-13`. Never edit BL-13's existing cells.

## Out of scope
- Writing the manifest `### Round 7` table, Plan-extensions line, H14–H16 rows and Requirement-ID index rows. The decomposition did these; this ticket only verifies they exist.
- Filling any ADR's Decision. The owners above fill them.
- Any leg body beyond the owed stub (each owner); any `expected` flip.
- The U6 manual paid run. It is R7DEP.2's act. **Do not register a `paid:true` U6 row**, because the weekly cron would sweep it in. U6 is never a `paid:true` registry row at any point in the round (P4-25). R7DEP.2's paid run uses either a CLI one-shot with `--paid --headroom` or the existing R4 paid row as updated by 232 R7TALK.1a.
- Closing D-P1.17-2 or D-FIX.1-2 (R7DEM.4b, which owns `P1.demo` / R7RO.2 / R7DEP.1).

## Acceptance criteria
- [ ] `### Round 7` GATE DECISIONS covers every ruling id in brief §7a/§7b/third batch with a verbatim `answer`. That is shown by a committed id-by-id check in the run record (brief id → LEDGER row). Gaps are appended, with no duplicates and no edited cells. `check-append-only.mjs --base <actual PR base>` passes. *(deterministic · layer: engineered)*
- [ ] ADR-126…130 shells exist with owners and revisit triggers. `adr-index.sh --check docs/adr` matches the committed index. *(deterministic · layer: engineered)*
- [ ] D-OBS.1-3 and D-SPA.28-1 are flipped, each with a cited run-`41472916874` fact per row condition, or left OPEN with a dated reason. The D-P1.17-2 / D-FIX.1-2 interaction notes are appended. `deferral-status-parity` and the append-only check are green. *(agentic · layer: engineered)*
- [ ] Every D*/U* leg plus the two sub-assertions is registered `expected:"red"` and `paid:false`, with a wired owed-stub and the single owner in deliverable 4's table (split-row owners included). No U6 row is `paid:true`. The run-record table names each leg's sanctioned flipper. The registry tests are green. A local runner pass (no target needed: an offline `--steps` dry path, or the runner unit test) shows each new id as `owed`. *(deterministic · layer: fixture-verified)*
- [ ] `finding-map.csv` covers every R5 and R6 finding id. Every P0/P1 row has a REQ and one owner, or a ruling id. A small script or test counts unmapped P0/P1 rows = 0. *(deterministic · layer: engineered)*
- [ ] The BACKLOG §7 rows are appended and the existing rows are byte-identical. *(deterministic · layer: engineered)*
- [ ] verification green; every new behaviour has a test that fails if it is removed; requirement ids stamped in the PR; anything not automatically verifiable is a `DEFERRALS.md` row with its compensating control; ADRs written for every deviation and owned decision; `BUILD_INDEX.md` row and `LEDGER.md` advanced; operating clauses met — dates from the clock, PR checks read and recorded, AC layers stated, no living-record pins, protected records only appended, gate words verbatim, harness in the run-ledger header. *(agentic — the universal phase-gate AC)*

## Requirement IDs to satisfy and stamp in the PR
REQ-CLOSE-5, REQ-DACC-8, REQ-DOPS-7

## Cross-cutting invariants
- Manifest § Cross-cutting invariants 12 (a red leg is a debt, never a pass), 15 (scoped authority: record rulings and never widen them), 17 (context budget) and 18 (demo isolation: no corpus byte here).
- Spec §8.4 (browser proof) and §8.6 (records append-only).

## Operating clauses
- Cited from `docs/tickets/00_MANIFEST.md § Operating rules`. Rules 1 (clock), 4 (append-only), 5 (verbatim gate words) and 7 (harness header) bind this ticket most. The gap table has one row per clause.

## Notes
- **Decisions this ticket owns:**
  - the concrete `R*.demo` leg id;
  - the two sub-assertion ids (`U3.stopgap`, `R8.showcase.spa`);
  - the single-owner picks where §10 names two owners:
    - `R*.demo`/`P1.demo` ("R7DEM.4/5") → R7DEM.4b (220a), per P4-5 and the 220 split;
    - `D2.tour` ("R7DEM.6a / R7TOUR.2") → R7DEM.6a, with R7TOUR.2 as a sanctioned re-flipper (P4-23).

    The registry requires one owner per row.
  - the owner moves forced by the Phase-4 splits: `D1.hub` → R7DEM.5b (221a) and `U4.controls` → R7KIT.3e (243a);
  - the flipper column (224 for R7a legs, 250 for R7b legs, 248 for `D2.tour`).

  Record each pick and each §10 deviation in the run record. The spec §10 map is otherwise binding.
- **Split rows (Phase-4 review § Split decisions).** These rows did not exist in spec §10. The owner table, the finding map and the ADR owners above use them.

  | Row | Id | Takes from | Legs it owns | REQs it stamps (moved) |
  |---|---|---|---|---|
  | 214b | R7DEM.1b | 214 | — | REQ-CORPUS-12 (fetch half), REQ-CORPUS-8 (fetch half), REQ-DOPS-4 |
  | 218a | R7DEM.3b | 218 | — | REQ-DWEB-15, REQ-TOUR-1 (data), REQ-SYNC-2 (demo half) |
  | 220a | R7DEM.4b | 220 | `R*.demo`, `P1.demo` | REQ-DWEB-6 (client half), REQ-DWEB-9, REQ-DWEB-11, REQ-DWEB-16 |
  | 221a | R7DEM.5b | 221 | `D1.hub` | REQ-TOUR-1, REQ-TOUR-3, REQ-TOUR-8 |
  | 225a | R7KIT.2b | 225 | — | REQ-GUARD-1 (authoring) |
  | 240a | R7KIT.3a2 | 240 | — | the `voices.tsx` share of 240's batch (no REQ moves) |
  | 243a | R7KIT.3e | 243 | `U4.controls` | REQ-PANE-5, REQ-COPY-8 |
  | 245a | R7COPY.1c | 245 | — | REQ-COPY-2 |
  | 249a | R7PUB.1 | 250 | — | REQ-PUB-1, REQ-PUB-2 |

  `R7KIT.3a2` does not match the registry owner regex. That is acceptable because it owns no leg; never make it a leg owner.
- **`GD-PREVIEW.R7`** (one owned preview per phase, $20 total cap). This is why no owner flips its own leg: see deliverable 4 § Flip authority. The nightly hazard and the preview ruling now point the same way, so every owner holds its leg `ready-to-flip`.
- **Why the sub-assertions exist.**
  - The nightly runs `main`'s registry against prod, so a re-expected green leg would fail until R7DEP.1 deploys. `R8.showcase.spa` therefore enters red, and the existing green `R8.showcase` is untouched here.
  - U3's owner is R7b, but REQ-PANE-0 needs R7a browser evidence. `U3.stopgap` gives R7FIX.1 a leg body to land; 224 flips it.
- **Spec tension, recorded for R7DEM.2c.** REQ-CONV-17 calls the `parseDraftLedgerSections` fix "a new DEFERRALS row", while §7 lists it as BACKLOG. This ticket seeds the BACKLOG row. 217 R7DEM.2c opens the DEFERRALS row when it lands REQ-CONV-17. That row cross-references the BL id and carries an owner and a date (P4-22), and 253 R7REC.1 closes it to BACKLOG, so it does not block GATE-ACCEPT.R7.
- **Shared decisions consumed:**
  - the leg ownership in spec §10, as amended by the split rows above;
  - the decomposition's `### Round 7` GATE DECISIONS block. That includes its `GD-RATIFY.R7`, `GD-DEPLOY.R7` and `GD-UX-PAIDLEG.R7` rows, the `GD-ORDER.R7`-rides-`GD-DEPLOY.R7` preamble, and the Phase-4 rows (`GD-GOLDEN.R7`, `GD-PREVIEW.R7`, `GD-PUBDELTA.R7`, `GD-TOURSIGN.R7`). This ticket verifies and completes that block; it does not re-author it.
- **DEFERRALS interactions:**
  - flips D-OBS.1-3 and D-SPA.28-1 (on evidence);
  - annotates D-P1.17-2 and D-FIX.1-2;
  - D-R5OPS.1-1 (cohort pollution) is owned by 223 R7DEM.6b through REQ-DOPS-5. Note the pointer in the preamble.
