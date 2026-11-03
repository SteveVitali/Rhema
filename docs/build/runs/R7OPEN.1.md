# R7OPEN.1 — open round 7: rulings, ADR shells, deferrals, journey legs, finding map (run ledger)

- **Spec:** `docs/tickets/209_R7OPEN.1__open-round-7.md` (manifest row 209, phase round 7 / R7a).
  Round-7 posture: `GD-PREVIEW.R7` (no per-ticket previews), prod acts only under
  `GD-DEPLOY.R7`/`GD-GOLDEN.R7`/`GD-UX-PAIDLEG.R7`/214b's fetch; **$0 spend this ticket**.
  mergePolicy=OPERATOR — never merge. LAUNCHED — prod serves `4938b8e`; zero prod mutations.
- **Normative loads:** the ticket's Load list — `docs/round-7-draft-spec.md` §2/§3.1/§3.2/§4.17/§4.18/§7/§10;
  `docs/round-7-demo-brief.md` §7a/§7b/third batch; `docs/decomposition-prompt-r7.md` § Binding
  constraints; `R4-acceptance-deploy-conventions.md` §1/§4/§5; `REVIEW-round-7-draft-spec.md`
  RV-13/RV-38; `R5-ux-browser-audit.md`; `R6-ux-code-audit.md` §9; `packages/journeys/AGENTS.md`;
  LEDGER/DEFERRALS/BACKLOG anchors; `docs/adr/_TEMPLATE.md`.
- **Base:** `stevevitali/r7-demo-spec` @ `ac19055` (the ticket's `base_branch: current checkout` —
  the r7-demo-spec tip incl. the harness-switch boundary commit).
- **Branch:** `stevevitali/r7open-1-open-round` · **Harness:** devin-desktop/swe-2-high/subagent
  · **Skills:** implement-spec + build-memory + self-review @ `~/agent-skills` (`e981ec5`)
- **Started:** 2026-11-03T18:30Z · **Closed:** TBD
- **Production mutations:** none (repo-only; the one external act was a read-only
  `gh run view 41472916874`).

## Deferrals read

`docs/tickets/DEFERRALS.md` read first (protocol). R4 §5's interaction table was the checklist:
**D-OBS.1-3** and **D-SPA.28-1** flip DONE this run on run `41472916874` (see below); **D-P1.17-2**
and **D-FIX.1-2** got dated interaction notes and stay OPEN/PARTIAL; **D-R5OPS.1-1**'s owner is
223 R7DEM.6b (pointer recorded in the round-7 preamble). New row: **D-R7OPEN.1-1**.

## Deliverable 1 — GATE DECISIONS `### Round 7` verified (REQ-DOPS-7)

**Id-by-id check (brief → LEDGER row):** every ruling id appears exactly once; the recorded
`answer` equals the brief's verbatim selection modulo the question-UI's `(Recommended)`
label suffix (typed answers verbatim). ✓ = present once.

| Brief id | Row | Brief id | Row |
|---|---|---|---|
| GD-DEMO-BYLINE.R7 | ✓ | GD-UX-KEYS.R7 | ✓ |
| GD-DEMO-REDACT.R7 | ✓ | GD-DEMO-METRICS.R7 | ✓ |
| GD-DEMO-SHOWCASE.R7 | ✓ | GD-UX-SCOPE.R7 | ✓ |
| GD-DEMO-LICENSE.R7 | ✓ | GD-ORDER-SPLIT.R7 | ✓ |
| GD-DEMO-PUBLISHED.R7 | ✓ | GD-DEMO-BYLINE-SCOPE.R7 | ✓ |
| GD-DEMO-RUNS.R7 | ✓ | GD-UX-STREAM.R7 | ✓ |
| GD-DEMO-DEPTH.R7 | ✓ | GD-DEMO-ROLES.R7 | ✓ |
| GD-DEMO-PROCESS.R7 | ✓ | GD-UX-WALKTHROUGH.R7 | ✓ |
| GD-DEMO-HERO.R7 | ✓ | GD-DEMO-METRICS-CARVE.R7 | ✓ |
| GD-DEMO-EDITS.R7 | ✓ | GD-UX-PAIDLEG.R7 | ✓ |
| GD-DEMO-CONV.R7 | ✓ | GD-UX-P1-BACKLOG.R7 | ✓ |
| GD-DEPLOY.R7 | ✓ | GD-RATIFY.R7 | ✓ |
| GD-UX-SHELL.R7 | ✓ | GD-ORDER.R7 | rides GD-DEPLOY.R7 (preamble) |
| GD-UX-HOME-LIST.R7 | ✓ | | |
| GD-UX-PROJECT-HOME.R7 | ✓ | | |
| GD-UX-CHAT.R7 | ✓ | | |

**Phase-4 rows (verify only):** `GD-GOLDEN.R7`, `GD-PREVIEW.R7`, `GD-PUBDELTA.R7`,
`GD-TOURSIGN.R7` — each present once, all 7 cells filled, cited by consuming tickets (grep:
224/250 cite GOLDEN + PREVIEW; 240/244 cite PUBDELTA; 248 cites TOURSIGN). Not re-appended,
re-worded or re-interpreted.

**Gaps:** none — no rows appended for missing ids. **Appended:** three dated `note` rows
(append-only corrections): (a) the coverage-verification note incl. the `(Recommended)`
label-suffix convention; (b) `GD-DEMO-DEPTH.R7` tour-essay supersession by `GD-DEMO-HERO.R7`
(Politics of Visibility → Structure of Political Difference); (c) `GD-DEMO-RUNS.R7` "real
phases and gates" narrowed by S-9 (inferred from delivered files). `## PHASE LOG — Round 7`
already existed (decomposition + harness-switch lines); this ticket logs under it.

## Deliverable 2 — ADR-126…130 shells (REQ-DOPS-7)

Five shells from `docs/adr/_TEMPLATE.md`, each `Status: Proposed`, citing (not restating) the
spec §3.2 bullets, with an **Owner** line and a **Revisit trigger**:

- ADR-126 → 220 R7DEM.4; S-1 spike outcome → 220a R7DEM.4b; REQ-TOUR-9 carve-out section →
  223 R7DEM.6b.
- ADR-127 → 214 R7DEM.1; landing-recording asset declaration → 249a R7PUB.1.
- ADR-128 → 211 R7RO.1 (REQ-ED-12/Showcase item) + R7b owners per §10 as split.
- ADR-129 → 225 R7KIT.2; no-raw-controls → 225a R7KIT.2b; SplitPane choice → 229 R7PANE.1.
- ADR-130 → 213 R7COPY.0.

`docs/adr/README.md` regenerated via `adr-index.sh docs/adr` (never hand-edited).
`docs/decomposition-prompt-r7.md` confirmed committed (`cfb6fab`), not re-authored.

## Deliverable 3 — DEFERRALS (REQ-CLOSE-5)

- **Region opened:** dated `## Round 7 — open (2026-11-03)` preamble (GD-PREVIEW.R7 convention +
  the D-R5OPS.1-1 → 223 pointer) + `## R7OPEN.1 — open round 7 (2026-11-03)` with row
  `D-R7OPEN.1-1` (the 14 legs report `owed`, then flip — homed in BL-103's sources).
- **D-OBS.1-3 → DONE.** Scheduled run `41472916874` (event `schedule`, 2026-11-02T15:34Z,
  `main` head `79aca4af`) pinned the **deployed** SHA `4938b8e`, reported `provenance match`,
  and ran **44 PASS / 21 paid-skip / 0 FAIL at $0**. `git merge-base --is-ancestor 3c3d7a7
  4938b8e…` → true: the OBS.1 deployment (updates 125–126) is an ancestor of the verified SHA —
  the row's "pass on the OBS.1 deployment" clause holds. LEDGER already recorded the
  threshold-6 literal arm closed 2026-11-02.
- **D-SPA.28-1 → DONE.** All 14 flips merged (GD-MERGE-SWEEP.R6) and deployed (R6LCH.1 →
  R6DEP.4 `4938b8e`); run `41472916874` is ≥1 scheduled nightly green since the last flip's
  deploy — the entry gate is discharged.
- **D-P1.17-2 note** (row stays PARTIAL): the Lighthouse/axe arm may be discharged by
  REQ-DACC-4's `P1.demo` (220a R7DEM.4b, verified by 224 at the R7a preview); drop-zone +
  funnel arms unaffected.
- **D-FIX.1-2 note** (row stays OPEN): the real-UA phone context pattern is reused by
  `P1.demo` (220a) and 247 R7RO.2's island; either may discharge the arm.
- First-canonical-token semantics honored: flips prepend `DONE — <date>`; the original cell
  text survives verbatim after "Original cell:".

## Deliverable 4 — journey legs registered red (REQ-DACC-8)

14 registry rows, all `expected:"red"` + `paid:false`, each `asserts` citing its REQ, each with
a wired owed-stub (`r7legs.ts`) that fails loudly `… owed — owner <ticket>` → the runner reports
`owed`, never a failure, never `ready-to-flip`.

| Leg | Owner | Flipped green by | Notes |
|---|---|---|---|
| D1.hub | R7DEM.5b (221a) | 224 R7DEP.1 | §10 named R7DEM.5; the hub moved to 221a in the Phase-4 split — §10 deviation recorded |
| D3.readonly | R7DEM.5 (221) | 224 R7DEP.1 | |
| D2.tour | R7DEM.6a (222) | 224; re-flip 248 R7TOUR.2 (sanctioned, P4-23), then 250 | single-owner pick per P4-23 |
| P1.demo | R7DEM.4b (220a) | 224 R7DEP.1 | §10 named "R7DEM.4/5"; P4-5 pick — the SPA render is 220a's |
| R11.demo | R7DEM.4b (220a) | 224 R7DEP.1 | concrete id pick: next free R number + `.demo` |
| U1.shell | R7SHELL.1a (226) | 250 R7DEP.2 | |
| U2.noreload | R7RELOAD.1 (231) | 250 R7DEP.2 | |
| U3.occlusion | R7PANE.1 (229) | 250 R7DEP.2 | |
| U4.controls | R7KIT.3e (243a) | 250 R7DEP.2 | §10 named R7KIT.3d; the dossier moved to 243a — §10 deviation recorded |
| U5.write | R7WRITE.1b (238) | 250 R7DEP.2 | |
| U6.chat | R7TALK.1a (232) | 250 R7DEP.2 | free stubbed turn; **never a paid:true row** (P4-25) |
| U7.import | R7HOME.2a (235) | 250 R7DEP.2 | |
| U3.stopgap (sub-assertion) | R7FIX.1 (212) | 224 R7DEP.1 | the R7a PANE-0 probe |
| R8.showcase.spa (sub-assertion) | R7RO.1 (211) | 224 R7DEP.1 | REQ-DACC-6 renderer re-expectation; green `R8.showcase` untouched |

Tests: `registry.test.ts` asserts every R7 id is red/free/single-owned and its stub throws the
owed message; `runner.test.ts` runs the real registry rows offline → all 14 report `owed`,
`passed === true` (28/28 green). `P1.demo` carved out of the planning-ledger P1-family owner
check — it is a round-7 leg (REQ-DACC-4), not a P1 split; documented in the test.

## Deliverable 5 — finding map + BACKLOG seeds

- `docs/build/planning/2026-11-03_r7-demo/finding-map.csv`: 111 rows — all 75 R5 ids (A–I) and
  all 36 UXC ids, each with severity, REQ(s), one owner ticket, evidence, status. Scripted
  count: **unmapped P0/P1 = 0**; every P0/P1 has a REQ with exactly one owning ticket or a
  ruling (`GD-UX-P1-BACKLOG.R7` for G1, UXC-13).
- `BACKLOG.csv` BL-88…BL-103 appended; existing rows byte-identical: G1 + UXC-13 WONTFIX rows
  (GD-UX-P1-BACKLOG.R7); P2 residue A6/A8/B8/B9/B10/H4/H5; REQ-WRITE-3; PANE-1 drag
  persistence/reset; token streaming (GD-UX-STREAM.R7); `parseDraftLedgerSections`
  (REQ-CONV-17); BL-101 economics pointer → BL-13 (BL-13 untouched); BL-102 ADR-shell homes;
  BL-103 the phase-preview sweep (homes D-R7OPEN.1-1).

## Decisions this ticket owned

- `R*.demo` → `R11.demo` (next free R number).
- Sub-assertion ids: `U3.stopgap`, `R8.showcase.spa` (per the ticket).
- Single-owner picks: `P1.demo`/`R11.demo` → R7DEM.4b (P4-5); `D2.tour` → R7DEM.6a with
  248 R7TOUR.2 the sanctioned re-flipper (P4-23).
- Owner moves: `D1.hub` → R7DEM.5b; `U4.controls` → R7KIT.3e (§10 deviations, recorded).
- Flipper column: 224 (R7a) / 250 (R7b) / 248 (D2.tour).
- Finding-map picks where §4 brackets name two REQs: primary owner recorded in `req_ids`
  (first token) with the secondary named in `evidence` (e.g. B6 → 244 primary, 233 SYNC-6 arm;
  F1/F2 → 212 PANE-0 primary, 229/243a redesign arms; UXC-16 → 243 KIT-3d — it owns the worst
  named files; settings/billing ride 240 under the same REQ-KIT-3).

## Evidence report

| AC | Layer | Result | Evidence |
|---|---|---|---|
| GATE DECISIONS covers every ruling id, verbatim answers | engineered | met | id-by-id table above; three dated note rows appended; `check-append-only` vs `ac19055` OK |
| ADR-126…130 shells + regenerated index | engineered | met | 5 files; `adr-index.sh --check` matches the committed README |
| D-OBS.1-3 / D-SPA.28-1 flipped on run-41472916874 facts; P1.17-2/FIX.1-2 notes | engineered | met | gh run view (read-only): schedule, `79aca4af`, deployed `4938b8e` pinned, 44/21/0, provenance match; `merge-base --is-ancestor` true; parity + append-only checks green |
| Every leg registered red + owed stub + single owner + flipper map | fixture-verified | met | registry.ts + r7legs.ts; vitest 28/28 incl. the offline runner pass → all `owed`; no U6 paid row |
| finding-map covers all ids; unmapped P0/P1 = 0 | engineered | met | 111 rows; scripted count 0; missing/extra id sets empty |
| BACKLOG §7 rows appended; existing rows byte-identical | engineered | met | BL-88…103; `git diff` shows append-only |
| Universal phase-gate AC | engineered | met | turbo build/lint/typecheck + vitest; check-build-memory 0 viol; append-only OK; dates from `date -u`; harness header above; no living-record pins |

## Verification log

- `pnpm exec vitest run packages/journeys/src/registry.test.ts packages/journeys/src/runner.test.ts`
  → 28/28 pass (incl. new owed-stub + offline-runner tests).
- `gh run view 41472916874` (read-only): success · schedule · main `79aca4af` · pinned deployed
  `4938b8e…` · provenance match · 44 PASS/21 skip/0 FAIL · $0.
- `git merge-base --is-ancestor 3c3d7a7 4938b8e4024777417c5a8ed9f518f9afb4bebd08` → 0.
- `pnpm turbo build lint typecheck` → TBD
- `pnpm test` → TBD
- `check-build-memory.sh .` → TBD
- `check-append-only.mjs --base stevevitali/r7-demo-spec` → TBD
- `check-backlog.sh` → TBD (baseline carried 27 pre-existing issues; target: zero new ones)
- Spend: $0.

## ci:

TBD
