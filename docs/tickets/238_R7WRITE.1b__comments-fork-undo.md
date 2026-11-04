# R7WRITE.1b — Comment → anchored Guidance + fork toast + discard-fork Undo

- **Sequence:** 238 of 254 · **Phase:** round 7 (R7b) · **Kind:** ticket
- **base_branch:** current checkout
- **Depends on:**
  - 237_R7WRITE.1a, for the bubble's reserved first slot and the page header strip's version chip,
    which the toast and the discarded state attach to.
  - 235_R7HOME.2a: the four freeze triggers (S-4) that `discard-fork`'s "no run has read it" test
    reads (declared per Phase-4 P4-12).
  - 236_R7HOME.2b: the blank editable new project that U5.write's first step needs (P4-12).
  - Spec §10 row 238 (†). Merges to `main` wait for 224_R7DEP.1 (spec §5.1).
- **Run:** `implement-spec spec=docs/tickets/238_R7WRITE.1b__comments-fork-undo.md`
- **Gate status:** none. Code, an additive migration and tests; `mergePolicy: OPERATOR`.
- **Live stage:** Stage A only ($0: API tests on PGlite, DOM / journey tests against a local
  build). **No owned preview** (`GD-PREVIEW.R7`). **U5.write** is held `ready-to-flip` (Phase-4
  P4-4): 250_R7DEP.2 walks it on the R7b phase preview and flips it on prod evidence. A live need
  outside 250's preview window PAUSES for the operator.
- **Production mutations:** none. The migration is additive and is applied only in local / CI
  databases here. 250's preview and prod receive it under `GD-DEPLOY.R7`.
- **Size budget:** ~600 changed lines excl. generated/fixtures (**M, at the ceiling**: API +
  migration + UI + the leg). Entry delta ≤ 15 kB gz (REQ-KIT-5).

## Goal
Writers can comment on a passage, and an accidental fork can be taken back.
- **Comment** becomes the first item in the format bubble. It writes anchored Guidance rendered in
  the margin, and the bottom-of-page note form goes away.
- The first keystroke in a frozen version still forks v(N+1) without a confirm. It now shows an
  inline toast with **Undo**.
- Undo calls a new `discard-fork` API that discards the just-created head, but only when doing so
  loses nothing. History then shows "v(N+1) · discarded".

## Load (read these — do not re-read others)
- `docs/round-7-draft-spec.md`:
  - §4.10 REQ-WRITE-2, REQ-WRITE-7;
  - §4.14 REQ-SYNC-4 (the "· discarded" label);
  - §3.3 S-3 (frozen ≠ read-only) and S-4 (the four freeze triggers);
  - §4.8 REQ-RELOAD-2/4;
  - §4.17 REQ-DACC-7 (U5) and REQ-DACC-8;
  - §8.1, §8.6;
  - §10 owner map (U5 → this ticket).
- `REVIEW-round-7-draft-spec.md` RV-19 and RV-27.
- `R6-ux-code-audit.md` §6.3 (Comments) and §9 UXC-23.
- `R5-ux-browser-audit.md` B18 and I5.
- `apps/web/AGENTS.md`, `apps/api/AGENTS.md`, `packages/db/AGENTS.md` and
  `packages/journeys/AGENTS.md`.
- LEDGER § GATE DECISIONS `### Round 7` row `GD-PREVIEW.R7`; 209_R7OPEN.1 Notes "Why the
  sub-assertions exist" (the nightly hazard).
- `docs/tickets/DEFERRALS.md`, round-7 sections.
- Manifest § Cross-cutting invariants and § Operating rules.
- Anchors (re-confirm at build time):
  - `packages/ui/src/page-editor.tsx:511-521`, the bottom note `<form>` (`noteUrl`), and `:332`
    (frozen is not read-only);
  - `packages/ui/src/margin.tsx`, which today renders finding cards only;
  - `apps/api/src/editor-routes.ts`:
    - the note → `captureGuidance` path;
    - `:236` (fork stays first-write);
    - `saveManualRevision` from `packages/mirror/src/manual-revision.ts:177`;
  - `packages/orchestrator/src/guidance.ts` `captureGuidance` / `captureGuidanceTx`;
  - `packages/contracts/src/domain/guidance.ts:45` (`anchors`);
  - `apps/web/src/spa/page-mount.tsx`:
    - the `onFork` handler around `:474`;
    - `rebase()` / `registry.rekey`;
    - the `forkFmt` banner around `:386`;
  - `apps/collab/src/` (the fork-side live doc: `doc-state.ts`, `materialize.ts`);
  - `apps/api/src/version-routes.ts` (the drafts route family);
  - `packages/db/migrations/0002_schema.sql` (the `drafts` table) and the latest migration number;
  - `packages/ui/src/version-rail.tsx`;
  - `packages/journeys/src/registry.ts` and `steps.ts`.

## In scope — deliverables
1. **Comment** as the bubble's first item (REQ-WRITE-2; UXC-23, I5).
   - It opens an inline composer anchored to the selection.
   - Submit is a JSON mutation through 231's delegated-submit/`mutationOutcome` conventions, with
     no reload. It writes a Guidance row with `anchors` through `captureGuidance` (REQ-DATA-41's
     comment path, unchanged).
   - The Guidance renders as a margin card tied to its anchor. A collapsed or tick state follows
     229's geometry.
   - The SPA Page's bottom-of-page note form is removed.
2. **Fork toast** (REQ-WRITE-7; B18).
   - The caret may sit in a frozen version with no fork.
   - The first keystroke forks v(N+1) as today (REQ-IDE-32: no confirm).
   - An inline, non-modal toast appears, using the 225 Toast queue: "You're editing a reviewed
     version, so this starts v(N+1) · Undo". The copy comes from COPY.
3. **`POST /projects/:id/drafts/:n/discard-fork`** (REQ-WRITE-7; RV-27).
   - It discards the just-created working head **iff** two conditions hold:
     - (a) it has no edits beyond the forking keystroke(s);
     - (b) no run has read it (S-4's freeze triggers).
   - The parent is restored as the project's working view.
   - Otherwise it refuses with a stable code (e.g. `fork_has_edits` / `fork_read_by_run`) and the
     toast explains why.
   - Behaviour:
     - It is session-authenticated and runs in `withTenant`.
     - A cross-workspace id returns not_found.
     - The two-tenant probe is extended (gotcha 2; spec §8.1).
     - The web BFF relay is same-origin.
     - Any `upsertProjectSearchDoc` fallout is reconciled.
   - The collab live doc for the discarded head is closed or rebound. Open sessions rekey back to
     the parent through the existing `rebase` path. Nothing is left editing a discarded head.
4. **Discarded record** (REQ-WRITE-7 → REQ-SYNC-4). An additive migration adds the discarded marker
   (the number is kept, never reused or deleted, per append-only versions). The version rail and
   history render "v(N+1) · discarded".
5. **U5.write leg** (DACC-7/8). Build the step body: new project → type → bubble → comment →
   focus in/out → source. The source step exercises the then-current toggle; 239 re-points it.
   - **Nightly hazard** (209's note; P4-4). `main` receives this PR after 224, but prod serves R7a
     until 250 deploys, so a green-expected U5 would fail the nightly. The registry row therefore
     stays `expected:"red"` with a `ready-to-flip` annotation naming 250_R7DEP.2, which walks it on
     the phase preview and flips it on prod evidence.
6. **ReadOnlyProject** (S-3). Comment is hidden for `demo`, `showcase` and `run_lock`. `run_lock`
   is truly read-only, so no fork happens and no toast appears.

## Out of scope
- The missing-version picker and general gap rendering for any cause (246_R7SYNC.1 owns
  REQ-SYNC-4's picker; this ticket owns only the discarded marker and its label).
- Source-mode changes and the Rich text / Source toggle (239).
- The freeze triggers themselves and import editability (235_R7HOME.2a). This ticket reads them.
- The phone-UA SSR reader's note form (247_R7RO.2 decides; see Notes).
- Suggestion marks and span-level provenance (spec §9).

## Acceptance criteria
- [ ] Comment from the bubble writes an anchored Guidance row through `captureGuidance`. The API
  test asserts the anchors persisted and the row is in the right workspace. The margin card renders
  at its anchor. No document reload occurs: a navigation-entry count of 1 in the DOM/journey test.
  *(deterministic · layer: engineered)*
- [ ] The SPA Page renders no bottom note form. `check:dom-contract` is updated in the same change.
  *(deterministic · layer: engineered)*
- [ ] On a frozen version, placing the caret does not fork. The first keystroke forks v(N+1) with
  no confirm and shows the toast with Undo. *(deterministic · layer: engineered)*
- [ ] `discard-fork` (API tests on PGlite):
  - it succeeds for a fork with only the forking keystroke(s);
  - it returns 409 with the stable code when there are further edits, and when a run has read the
    head;
  - it returns 404 cross-workspace, and the two-tenant probe is extended;
  - after a success the project's working view is the parent and history lists "v(N+1) ·
    discarded".

  *(deterministic · layer: engineered)*
- [ ] Collab: after a discard, a second open session rekeys to the parent, and no write lands on
  the discarded head (an integration test over the collab doc-state seam). *(deterministic · layer:
  engineered)*
- [ ] The migration is additive (passes the additive lint). The RLS / tenant tests cover the new
  column's reads. *(deterministic · layer: engineered)*
- [ ] ReadOnlyProject: no Comment item renders, and zero non-GET is issued for demo/showcase;
  `run_lock` neither forks nor toasts. *(deterministic · layer: engineered)*
- [ ] **U5.write, Stage A.** The step body passes against a locally served build with the local
  database (no preview). The registry row stays `expected:"red"`, annotated `ready-to-flip` →
  250_R7DEP.2. *(deterministic · layer: engineered)*
- [ ] **Stage B — staging-verified at the R7b phase preview (250).** No preview is stood up here
  (`GD-PREVIEW.R7`). This ticket opens `D-R7WRITE.1b-1` (kind P; owner 250_R7DEP.2; dated from
  `date -u`; unblocked by: 250's preview walk; how to verify: U5.write green at 250's preview SHA
  with `--expect-sha` and provenance PASS on web + api, plus these screenshots under
  `docs/build/runs/R7WRITE.1b/`):
  - comment card in the margin;
  - fork toast;
  - "· discarded" in history.

  250 closes the row and flips U5.write on prod evidence. This PR reports the AC owed, never
  green. *(agentic · layer: staging-verified at the R7b phase preview (250))*
- [ ] verification green; every new behaviour has a test that fails if it is removed; requirement ids stamped in the PR; anything not automatically verifiable is a `DEFERRALS.md` row with its compensating control; ADRs written for every deviation and owned decision; `BUILD_INDEX.md` row and `LEDGER.md` advanced; operating clauses met — dates from the clock, PR checks read and recorded, AC layers stated, no living-record pins, protected records only appended, gate words verbatim, harness in the run-ledger header. *(agentic — the universal phase-gate AC)*

## Requirement IDs to satisfy and stamp in the PR
REQ-WRITE-2, REQ-WRITE-7; REQ-SYNC-4 (the discarded marker and label only); REQ-DACC-7 (U5),
REQ-DACC-8 (U5 flip). Consumes REQ-RELOAD-2/4 and REQ-DWEB-14. Kept unchanged: REQ-IDE-32 and
REQ-DATA-41. Findings: UXC-23, I5, B18, RV-27.

## Cross-cutting invariants
- Manifest § Cross-cutting invariants:
  - 1 and 9 (copy);
  - 6 (immutability: versions are never deleted; discard is a marker);
  - 12;
  - 13 (tenant isolation; the probe is extended for the new route);
  - 17 (no preview is created here, per `GD-PREVIEW.R7`).
- Spec §8:
  - .1 (`withTenant` plus the two-tenant probe);
  - .3, .4, .5;
  - .6 (append-only; the migration is additive);
  - .7.

## Operating clauses
- Cited from `docs/tickets/00_MANIFEST.md § Operating rules` (1–10). The gap table has one row per
  clause.
- The migration lands only through its owning tool. It is never applied to a preview or prod here
  (gotcha 7; `GD-PREVIEW.R7`). A live need outside 250's preview window PAUSES for the operator.

## Notes
- **Owns:**
  - the `discard-fork` route, its refusal codes and its measurable definition of "no edits beyond
    the forking keystroke(s)" (record it in the PR; if it changes WRITE-7's semantics, write an
    ADR);
  - the discarded-marker column and label;
  - the Comment composer;
  - the margin Guidance card;
  - **U5.write** (built here, held `ready-to-flip`; 250 flips it).
- **Consumes:**
  - 237's bubble slot and header strip;
  - 225's Toast queue and primitives;
  - 229's margin and right-panel geometry;
  - 231's delegated submit and `mutationOutcome`;
  - 235's freeze-trigger facts;
  - 236's blank editable new project (U5's first step). Both 235 and 236 are declared
    dependencies (P4-12; formerly row-order reliance).
- **Phone reader:** `page-editor.tsx` is shared with the phone-UA SSR reader. If removing the SPA
  note form would also drop it there, gate the removal to the SPA mount and record the reader's
  disposition for 247. REQ-MOBILE-3 lists gate, disposition and chat inputs, not notes.
- **239** re-points U5's source step at the new toggle and must keep the step body passing locally;
  the leg stays `ready-to-flip` for 250.
