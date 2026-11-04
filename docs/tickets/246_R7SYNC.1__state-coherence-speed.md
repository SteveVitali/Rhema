# R7SYNC.1 — One truth per fact (timeline, versions, estimates) + snappiness

- **Sequence:** 246 of 254 · **Phase:** round 7 (R7b) · **Kind:** ticket
- **base_branch:** current checkout
- **Depends on:** 244_R7COPY.1a. Timeline, version and estimate text renders through the single
  label table, and the DOM guard covers the surfaces changed here. Spec §10 row 246. In row order it
  also follows 231 (in-router handoff redirect) and 238 (the discarded marker). Merges to `main`
  wait for 224_R7DEP.1 (spec §5.1).
- **Run:** `implement-spec spec=docs/tickets/246_R7SYNC.1__state-coherence-speed.md`
- **Gate status:** none. Code + tests; `mergePolicy: OPERATOR`.
- **Live stage:** Stage A only ($0: unit / DOM / shell tests against a local build, plus a local
  smoke of the timing leg). **No owned preview** (`GD-PREVIEW.R7`). The Stage-B AC and the
  REQ-SPEED-5 preview record are owed to the R7b phase preview in 250_R7DEP.2 through a DEFERRALS
  row. A live need outside 250's preview window PAUSES for the operator.
- **Production mutations:** none
- **Size budget:** ~600 changed lines excl. generated/fixtures (**M**: seven S-sized items; see
  Notes § Runtime split clause). Entry delta ≤ 15 kB gz.

## Goal
The same fact reads the same everywhere:
- The Timeline tab shows the real timeline on every project sub-route.
- A missing version offers a picker, and gaps say why.
- Durations and costs come only from the shared estimator.

Opening anything feels instant:
- no serial handoff POST before the loader;
- the shell and skeleton paint on every hard load;
- side-effect-free twins prefetch on hover and focus, with scoped invalidation;
- the reading faces are preloaded.

Timings are recorded, not gated. This ticket builds the timing leg; 250 records the numbers.

## Load (read these — do not re-read others)
- `docs/round-7-draft-spec.md`:
  - §4.14 REQ-SYNC-3/4/5;
  - §4.15 REQ-SPEED-1…5;
  - §3.2 ADR-128 (the REQ-NAVM-7 item, discharged by SPEED-3);
  - §5.5 (SYNC.1 is a tour-target ticket);
  - §8.2;
  - §8.
- `R6-ux-code-audit.md` §7 (the performance table) and §9 UXC-33/34/35/36.
- `R5-ux-browser-audit.md` E2, G3, G4, C11, I1 (estimates), I9 (the status-bar version mismatch),
  B14 and D5 (the chrome-less skeleton).
- `apps/web/AGENTS.md`, `packages/journeys/AGENTS.md` (the timed leg).
- LEDGER § GATE DECISIONS `### Round 7` row `GD-PREVIEW.R7`.
- DEFERRALS round-7 sections.
- Manifest § Cross-cutting invariants and § Operating rules.
- Anchors (re-confirm at build time):
  - `apps/web/src/spa/ide/chrome-data.tsx` (`timeline` / `timelineView` from the shell twin,
    around `:50-190`);
  - `apps/web/src/copy.ts:1707` ("No runs yet — the round log appears here.");
  - `apps/web/src/spa/routes/_authenticated/p.$project.index.tsx:30-45` (`postProjectHandoff` in
    `beforeLoad`; REQ-BFF-22);
  - `p.$project.v.$v.tsx` and `p.$project.v.$n.diff.$m.tsx` (missing-version handling, G4);
  - `apps/web/src/spa/main.tsx:50-66` (no router preload; the REQ-NAVM-7 note);
  - `apps/web/src/spa/queries.ts`:
    - `staleTime` at `:89` / `:100`;
    - the side-effecting twins documented at about `:860`, `:965`, `:1062` (mark-read, mint);
    - the `["bff"]` invalidations (about 16 sites across `spa/**`);
  - `apps/web/src/spa/states.tsx:44-58` (`PendingShell`);
  - `apps/web/src/spa-shell.ts` (document head and boot);
  - `apps/web/src/render.tsx` (the SSR head);
  - `packages/tokens/src/theme-css.ts:32-44` (`FONT_FACES`);
  - `@rhema/run-sheet` `buildEstimate` / the surface pricer;
  - New project and Project settings estimate sites (as reshaped by 236 / 240);
  - `packages/journeys/src/showcase-fresh-leg.ts` (the timed, numbers-printed leg template).

## In scope — deliverables
1. **REQ-SYNC-3** (E2, G3). The right panel's Timeline tab shows the project's real timeline on
   every project sub-route: `/run`, `/export`, `/v/…/diff`, 404-in-project and the rest. It comes
   from one project-scoped source, not a route-scoped empty default.
2. **REQ-SYNC-4** (G4).
   - A missing version renders a versions picker listing the existing versions, inside the shell,
     instead of "Not found / Go home".
   - Gaps render as the record holds them: "vN · discarded" via 238's marker, or the recorded
     reason.
   - The status bar and the header strip agree on the current version (I9).
3. **REQ-SYNC-5** (C11, I1). Durations and costs on every surface come only from the shared
   estimator. New project and Project settings show per-protocol values; there is no single
   "~28–53 min" constant. A grep test shows no hard-coded duration or cost literal.
4. **REQ-SPEED-1** (UXC-33, B14). Remove the serial handoff POST from `beforeLoad`. Either fold the
   unread-finished-run check into the twin GET as a **read-only** report, keeping any write
   POST-only per REQ-BFF-22, or defer it past first paint. This ticket chooses; if REQ-BFF-22's
   wording changes, write an ADR.
5. **REQ-SPEED-2** (B14, D5). The shell, sidebar frame and skeleton paint immediately on every hard
   load. The shell document carries a static frame before JS, within REQ-KIT-5's inlined-CSS bound
   (≤ 24 kB raw).
6. **REQ-SPEED-3** (UXC-34/35).
   - A declared `PREFETCH_SAFE` set of GET twins. Each is certified free of read side effects; the
     mark-read and mint twins are excluded by name.
   - Query-level hover / focus `prefetchQuery` (no router preload).
   - A per-twin `staleTime` class.
   - Scoped invalidation keys replace `invalidateQueries({queryKey:["bff"]})`.
   - Lands ADR-128's REQ-NAVM-7 item as a dated banner in the owning section.
7. **REQ-SPEED-4** (UXC-36). `<link rel=preload as=font type=font/woff2 crossorigin>` for Literata
   (normal) and Inter, in both the SPA shell and the SSR heads. CSP is unchanged.
8. **REQ-SPEED-5 timing leg (preview record, secondary stamp).** Build a timed, numbers-printed
   leg on the `showcase-fresh-leg.ts` template: project open p75 warm (SPA) and hard, plus
   pending-indicator latency, N ≥ 20 per metric, with `date -u` and the SHA, measured against the
   ≤ 400 ms / ≤ 1.2 s / ≤ 100 ms targets. It is recorded, never gated. A local smoke proves it
   runs and prints; local numbers are not REQ-SPEED-5 evidence. The **preview record** is captured
   by 250 at its phase preview (`D-R7SYNC.1-1`); the **primary** REQ-SPEED-5 record is 250's prod
   run (Phase-4 P4-19). Regressions become findings there.

## Out of scope
- REQ-SYNC-1/2 (213, landed in R7a). REQ-SYNC-6, the burn-vs-cap investigation (233).
- Estimator values, rates or caps (spec §9; BL-13). Only the *source* is unified here.
- Router-level `defaultPreload` (kept off; REQ-NAVM-7's reason stands).
- The AppShell's in-shell pending states for SPA navigations (226). This ticket covers the
  hard-load paint.
- The `reloadDocument` handoff redirect (231, REQ-RELOAD-3).

## Acceptance criteria
- [ ] A DOM test on each project sub-route (with a fixture project that has runs) shows Timeline
  rows, never the empty state. *(deterministic · layer: engineered)*
- [ ] A missing `/v/:n` or `/v/:n/diff/:m` renders the picker with the existing versions. A gap
  with a discarded marker renders "vN · discarded". Status bar and header version agree.
  *(deterministic · layer: engineered)*
- [ ] Every duration or cost shown on New project, Project settings, the run sheet, list ⋯ items
  and the header Run ▾ resolves through the shared estimator (spy or test). The grep test finds no
  literal "min" range or credit constant in surfaces. *(deterministic · layer: engineered)*
- [ ] `beforeLoad` issues no POST on project open (request spy). The handoff behaviour is
  preserved, and `?focus=1` still suppresses it. *(deterministic · layer: engineered)*
- [ ] The first document bytes of a hard load contain the shell frame and skeleton (shell test).
  The inlined-CSS bound is asserted. *(deterministic · layer: engineered)*
- [ ] A `PREFETCH_SAFE` membership test covers each listed twin's loader / handler, certified
  side-effect-free by a test. Excluded twins are named. Hover or focus triggers exactly one
  prefetch. A write invalidates only its scoped keys, not `["bff"]` (grep plus test).
  *(deterministic · layer: engineered)*
- [ ] Font preload links are present in the SPA shell and SSR heads. `check:spa-budget`, `spa-env`
  and `dom-contract` are green. *(deterministic · layer: engineered)*
- [ ] The REQ-SPEED-5 timing leg runs against a locally served build and prints all three metrics
  with N, `date -u` and the SHA; a test fails if a metric is dropped or the gate flag is set.
  *(deterministic · layer: engineered)*
- [ ] **Stage B — staging-verified at the R7b phase preview (250).** No preview is stood up here
  (`GD-PREVIEW.R7`). This ticket opens `D-R7SYNC.1-1` (kind P; owner 250_R7DEP.2; dated from
  `date -u`; unblocked by: 250's preview walk; how to verify: these states at 250's preview SHA,
  `--expect-sha`, provenance PASS, committed under `docs/build/runs/R7SYNC.1/`):
  - Timeline on `/run` and `/export` (E2, G3);
  - the versions picker (G4);
  - per-protocol estimates (C11, I1);
  - a hard-load filmstrip or screenshot showing the shell before data (B14, D5);
  - the REQ-SPEED-5 preview timing table from this ticket's leg (recorded, not gated).

  250 closes the row. This PR reports the AC owed, never green. *(agentic · layer:
  staging-verified at the R7b phase preview (250))*
- [ ] verification green; every new behaviour has a test that fails if it is removed; requirement ids stamped in the PR; anything not automatically verifiable is a `DEFERRALS.md` row with its compensating control; ADRs written for every deviation and owned decision; `BUILD_INDEX.md` row and `LEDGER.md` advanced; operating clauses met — dates from the clock, PR checks read and recorded, AC layers stated, no living-record pins, protected records only appended, gate words verbatim, harness in the run-ledger header. *(agentic — the universal phase-gate AC)*

## Requirement IDs to satisfy and stamp in the PR
REQ-SYNC-3, REQ-SYNC-4 (picker and gap rendering), REQ-SYNC-5, REQ-SPEED-1, REQ-SPEED-2,
REQ-SPEED-3, REQ-SPEED-4, REQ-SPEED-5 (preview record only — the timing leg and its preview
capture via 250; primary stamp is 250's prod record, P4-19); ADR-128 (the REQ-NAVM-7 item). Findings:
E2, G3, G4, C11, I1 (estimates), I9 (the version mismatch; the cost floor → BL-13), B14, D5 (the
skeleton), UXC-33/34/35/36.

## Cross-cutting invariants
- Manifest § Cross-cutting invariants:
  - 1, 9, 12;
  - 14 (every duration and price claim comes from the one estimator);
  - 17 (context budget; no preview is created here, per `GD-PREVIEW.R7`).
- Spec §8:
  - .2 (no money change; estimator-sourced);
  - .4;
  - .5 (budgets; no ceiling raised);
  - .6 (the ADR-128 banner is append-only);
  - .7.

## Operating clauses
- Cited from `docs/tickets/00_MANIFEST.md § Operating rules` (1–10). The gap table has one row per
  clause.
- No preview is stood up here (`GD-PREVIEW.R7`). A live need outside 250's preview window PAUSES
  for the operator (gotcha 7).

## Notes
- **Owns:**
  - the SPEED-1 choice (fold versus defer) and any REQ-BFF-22 ADR;
  - the `PREFETCH_SAFE` set and its certification tests;
  - the `staleTime` classes and scoped key scheme;
  - the hard-load static frame;
  - the versions picker;
  - the REQ-SPEED-5 timing leg (250 runs it at the preview and at prod).
- **Consumes:**
  - 238's discarded marker and label;
  - 229 / 232's right-panel Timeline tab;
  - 231's in-router handoff redirect;
  - 236 / 240's New-project and Project-settings surfaces;
  - 244's label table.
- **Tour:** Timeline and version targets are R7TOUR.2 targets (§5.5). List every moved target for
  248.
- **Demo isolation:** the demo QueryClient is never shared (S-14). `PREFETCH_SAFE` must not
  prefetch demo twins from workspace pages or the reverse.
  **Demo boot (Phase-4 P4-3, decomposer edit 2026-11-03):** in a demo boot, hover/focus prefetch is
  restricted to demo twin URLs only (never `/bff/p/<real slug>`, `/bff/search` or any session-gated
  read), with a DOM test asserting zero non-demo requests from prefetch on a demo page.
- **Runtime split clause** (Phase-4 P4-14; manifest invariant 17). If the working set or diff
  measures over M, the worker stops and requests a split at this pre-declared seam:
  - **cut (a):** REQ-SYNC-3, REQ-SYNC-4 and REQ-SYNC-5 (deliverables 1–3; Timeline, versions
    picker, estimator source);
  - **cut (b):** REQ-SPEED-1 … REQ-SPEED-5 (deliverables 4–8; handoff POST, static frame,
    `PREFETCH_SAFE`, font preload, timing leg), with the ADR-128 REQ-NAVM-7 banner.

  Each cut carries its own `D-R7SYNC.1-*` Stage-B row for 250. Do not stretch.
- **DEFERRALS:** `D-R7SYNC.1-1` (Stage B and the SPEED-5 preview record → 250, `GD-PREVIEW.R7`) is
  opened by design.
