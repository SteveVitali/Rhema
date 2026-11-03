# R7HOME.2b — A project opens to its Page; blank new project; Project settings page; outline coherence

- **Sequence:** 236 of 254 · **Phase:** round 7 (R7b) · **Kind:** ticket
- **base_branch:** current checkout
- **Depends on:**
  - 230_R7SHELL.2: the sidebar project section ("Page", "Project settings") and the Files tree
    whose outline row this ticket reconciles.
  - 235_R7HOME.2a: imports land working, plus the REQ-DATA-14 overwrite rule that the blank head's
    "Import a file" and "Paste text" rely on.
  - 225a_R7KIT.2b: TextField for the inline title, and the form primitives that the Project
    settings sections are built from.
  - It consumes 211's ReadOnlyProject and 213's record-composed run card. Both are in the R7b base
    because the stack forks after 213 (P4-16).
  - This row merges after 224 (spec §5.1).
- **Run:** `implement-spec spec=docs/tickets/236_R7HOME.2b__project-opens-to-page.md`
- **Gate status:** none
- **Live stage:** Stage A only ($0: unit, DOM and PGlite/integration tests plus a local build). No
  owned preview (`GD-PREVIEW.R7`). Stage B is staging-verified at the R7b phase preview
  (250_R7DEP.2) through a DEFERRALS row, and prod Stage B rides 250. Any need for a live preview
  outside 224's and 250's windows → PAUSE for the operator.
- **Production mutations:** none
- **Size budget:** ~800 changed lines excl. generated/fixtures (M, upper bound). Entry-delta
  allowance ≤ 15 kB gz (REQ-KIT-5), with the actual figure stated in the PR. A runtime split
  clause is pre-declared in Notes (P4-14).

## Goal
Rhēma opens like a writing tool, not an admin console.
- **Opening a project** lands on its head draft's Page. The walkthrough-card landing for an
  unread finished run is kept.
- **The overview's admin block** moves to the existing Project settings **page**: approvals
  policy, deadlines, standing notes and voice. No modal is added; REQ-IDE-41 is kept.
- **Next step** becomes a dismissible card in the Timeline tab.
- **"New project"** immediately creates the project with a blank editable working draft and
  focuses an inline "Untitled" title. There is no dialog and no duplicate title [I2]. A quiet
  affordance row sits on the empty Page.
- **"Outline exists"** comes from one source, so the Files tree and the outline route agree [G5].

## Load (read these — do not re-read others)
- `docs/round-7-draft-spec.md`:
  - §3.1 `GD-UX-PROJECT-HOME.R7`;
  - §3.2 ADR-128 items REQ-IDE-5, REQ-IDE-41 (kept), REQ-IDE-48 and REQ-GROWTH-12;
  - §4.9 REQ-HOME-2, -3 and -6;
  - §3.3 S-4 (as landed by 235); §4.6 REQ-KIT-5; §8.2.
- REVIEW RV-18 and RV-20. R6 `…/R6-ux-code-audit.md` §6.3 ("Overview versus the draft"), UXC-25
  and Q8. R5 `…/R5-ux-browser-audit.md` I1 (copy/estimate parts are 241/246's), I2, I5 and G5.
- Anchors (re-confirm at build time):
  - **Project index route:** `routes/_authenticated/p.$project.index.tsx` (the handoff and the
    walkthrough-card landing for an unread `run_finished`; its `reloadDocument` was removed by
    231).
  - **The overview today:**
    - `apps/web/src/spa/surfaces/editor.tsx` ≈:467-486 (`ProjectOverviewBody`);
    - `apps/web/src/page-chrome.tsx` (the overview: approvals, triage, voice,
      `ApprovalSettingsSection`, and the link to `/v/working`);
    - `apps/web/src/spa/surfaces/settings.tsx` ≈:960-1000 (the existing Project settings page at
      `/p/:slug/settings`).
  - **Create:** `apps/api/src/project-routes.ts` ≈:163 `POST /projects`. Today
    `entry:'scratch'` creates an empty project with no draft. `apps/web/src/spa/surfaces/onboarding.tsx`
    serves `/app/new`.
  - **Outline sources:** `apps/web/src/spa/surfaces/outline.tsx` with
    `copy.ts` ≈:1606 `notFound: "This project has no outline yet."`; the Files-tree outline row
    data (`apps/web/src/spa/ide/chrome-data.tsx` and the server twin); `apps/api/src/outline-routes.ts`.
- 230 sidebar project section; 229 Timeline tab; 213 record-composed run card; 225 and 225a
  primitives;
  `apps/api/AGENTS.md`; `apps/web/AGENTS.md`; `docs/tickets/00_MANIFEST.md` § Cross-cutting
  invariants and § Operating rules; `docs/tickets/DEFERRALS.md`.

## In scope — deliverables
1. **Opens to the Page** (REQ-HOME-2) [UXC-25].
   - `/p/:slug` lands on the head draft's Page, by in-router redirect or render.
   - An unread finished run still lands on 213's record-composed walkthrough card.
   - "Edit source" style links to `/v/working` are no longer the way to reach the draft.
2. **The admin block moves** (REQ-HOME-2) [I5].
   - Approvals policy, deadlines, standing notes and voice move from the overview to sections of
     the Project settings page.
   - Decisions surface in the Inbox and the Timeline.
   - Nothing renders below the document body inside the paper.
   - **Next step** is a dismissible card in the Timeline tab. The dismissal is a JSON write,
     remembered per user per project.
   - **No modal is introduced** (REQ-IDE-41 kept).
3. **Blank new project** (REQ-HOME-3) [I2].
   - "New project" from the sidebar or palette makes **one** create call that produces the
     project with protocol Essay by default, a blank `working` draft and a seeded live doc. The
     writer lands on its Page with an inline title "Untitled", focused.
   - No dialog. No placeholder heading above the real title.
   - Venue and voice live in Project settings.
   - The empty Page shows a quiet affordance row: **Import a file** · **Paste text** · **Start
     from an outline** · **Ask in chat**. Each opens its existing flow, and imports apply 235's
     overwrite rule to the empty head.
   - The fate of `/app/new` is decided here and recorded: a no-JS/SSR fallback, or a redirect.
4. **One outline source** (REQ-HOME-6) [G5]. The outline route and the Files tree read the same
   "outline exists" fact, either as one API field or one shared selector, so they can never
   disagree.
5. **ADR-128 banners.** Dated banners in `docs/rhema-design-spec.md` for:
   - REQ-IDE-5: new project is an immediate blank Page, and the three entry points become the
     affordance row;
   - REQ-IDE-48: opens to the head draft's Page;
   - REQ-IDE-41: kept, with no new modal;
   - REQ-GROWTH-12: the first-five-minutes empty state.
6. **DOM contract.** Updates land in the same change. Every R7a tour target stays resolvable until
   248 re-pins.

## Out of scope
- The format bubble and page header strip: 237. The fork toast and discard-fork: 238.
- Control migration of the new-project, run-sheet, import and export surfaces (KIT-3 batch b) and
  REQ-COPY-5: 241.
- Per-protocol durations and costs (REQ-SYNC-5): 246. This ticket adds no local numbers.
- Imports landing working (REQ-HOME-4/5): 235, consumed here.

## Acceptance criteria
- [ ] `/p/:slug` renders the head draft's Page, except when an unread finished run exists, which
      renders the walkthrough card (route plus DOM tests). *(deterministic · layer: engineered)*
- [ ] The Project settings page holds the approvals, deadlines, standing-notes and voice
      sections. The Page renders no admin form below the document. No new `aria-modal="true"`
      element appears on these flows (a test over the touched routes).
      *(deterministic · layer: engineered)*
- [ ] Dismissing Next step persists per user per project, and it reappears for another user.
      *(deterministic · layer: engineered)*
- [ ] PGlite: one create call yields a project, one `working` draft and a seeded live doc, with
      exactly one working head. The DOM test shows the title inline and focused, with no
      duplicate heading. Typing creates no fork. *(deterministic · layer: engineered)*
- [ ] Each affordance-row action opens its flow. Import into the blank head overwrites it (235's
      rule, exercised end to end). *(deterministic · layer: engineered)*
- [ ] A test fails if the outline route says "no outline" while the Files tree lists one, or the
      reverse. *(deterministic · layer: engineered)*
- [ ] `check:dom-contract` is green, every R7a tour target resolves, and the entry delta is
      ≤ 15 kB gz and reported. *(deterministic · layer: engineered)*
- [ ] **Stage B is staging-verified at the R7b phase preview (250_R7DEP.2)** (`GD-PREVIEW.R7`: no
      per-ticket preview). This ticket opens a dated `DEFERRALS.md` row (`D-R7HOME.2b-n`, owner
      250). The row names what 250 captures at the preview SHA (`--expect-sha`):
      - New project leads to typing immediately;
      - opening an existing project shows its Page;
      - the Project settings page renders;
      - the outline is coherent;
      - screenshots of each.

      This walk feeds U5, which is owned by 238 and flipped by 250. Unblock: 250's preview walk.
      Compensating control: the Stage-A tests above.
      *(agentic · layer: engineered here; staging-verified and live-executed at 250)*
- [ ] verification green; every new behaviour has a test that fails if it is removed; requirement ids stamped in the PR; anything not automatically verifiable is a `DEFERRALS.md` row with its compensating control; ADRs written for every deviation and owned decision; `BUILD_INDEX.md` row and `LEDGER.md` advanced; operating clauses met — dates from the clock, PR checks read and recorded, AC layers stated, no living-record pins, protected records only appended, gate words verbatim, harness in the run-ledger header. *(agentic — the universal phase-gate AC)*

## Requirement IDs to satisfy and stamp in the PR
REQ-HOME-2, REQ-HOME-3, REQ-HOME-6, REQ-KIT-5 (allowance). The ADR-128 banners amend REQ-IDE-5 and
REQ-IDE-48, and record REQ-IDE-41 (kept) and REQ-GROWTH-12.

## Cross-cutting invariants
- Manifest § Cross-cutting invariants:
  - 1;
  - 11 (Ask in chat never creates a paid run; the run sheet stays the only creator);
  - 13 (the create stays tenant-scoped);
  - 14 (any estimate shown comes from the one estimator);
  - 12, 17.
- Spec §8: 2, 3, 4, 5, 6 (ADR-128 banners only appended), 7.

## Operating clauses
- Cited from `docs/tickets/00_MANIFEST.md § Operating rules`; the gap table has one row per clause.

## Notes
- **Decisions this ticket owns:**
  - the landing rule for `/p/:slug`;
  - the Project settings page section order;
  - persistence of the Next-step dismissal;
  - the single create call for a blank project (extending `entry:'scratch'`, or a new entry);
  - the fate of `/app/new`;
  - the single outline-existence source.
- **Shared decisions consumed:**
  - the overwrite rule and live-doc seeding (235);
  - the sidebar project section (230);
  - the Timeline tab (229);
  - the record-composed run card (213);
  - ReadOnlyProject (211): a Showcase or demo project opens to its Page read-only.
- **Tour targets.** This ticket touches tour targets (spec §5.5), so 248 depends on it.
- **Runtime split clause** (P4-14; invariant 17). If the run must split, the worker requests it
  at this seam, and orchestrate-build writes the split back to the manifest:
  - **(a)** opens-to-Page and the Project settings page (REQ-HOME-2). That is deliverables 1 and
    2, with the REQ-IDE-48 and REQ-IDE-41 banners;
  - **(b)** the blank new project and the outline source (REQ-HOME-3, REQ-HOME-6). That is
    deliverables 3 and 4, with the REQ-IDE-5 and REQ-GROWTH-12 banners.

  Deliverable 6 (the DOM contract) rides each half for the hooks it moves. (b) stacks on (a).
