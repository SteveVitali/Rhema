# R7HOME.2a — Editable imports (API/DB, four freeze triggers, REQ-DATA-14 overwrite rule) + import fidelity

- **Sequence:** 235 of 254 · **Phase:** round 7 (R7b) · **Kind:** ticket
- **base_branch:** current checkout
- **Depends on:**
  - 226_R7SHELL.1a: import surfaces render inside the AppShell, and 225's Button and Toast come
    through that chain.
  - 225a_R7KIT.2b: the form primitives (TextField, TextArea) that the fidelity UI and the styled
    dropzone are built from.
  - This row merges after 224 (spec §5.1).
- **Run:** `implement-spec spec=docs/tickets/235_R7HOME.2a__editable-imports.md`
- **Gate status:** none. An additive migration, if one is needed at all, ships with the next
  deploy under `GD-DEPLOY.R7` and is named in the PR. This ticket applies nothing to prod.
- **Live stage:** Stage A only ($0: unit, DOM and PGlite/integration tests plus a local build).
  - No owned preview (`GD-PREVIEW.R7`). Stage B is staging-verified at the R7b phase preview
    (250_R7DEP.2) through a DEFERRALS row, and prod Stage B rides 250.
  - U7.import is held `ready-to-flip` (nightly hazard), and 250 flips it.
  - Any need for a live preview outside 224's and 250's windows → PAUSE for the operator.
- **Production mutations:** none
- **Size budget:** ~750 changed lines excl. generated/fixtures (M, upper bound). Entry-delta
  allowance ≤ 15 kB gz (REQ-KIT-5), with the actual figure stated in the PR. A runtime split
  clause is pre-declared in Notes (P4-14).

## Goal
An imported draft is a draft the writer can type into [I4]. Today `createImportedDraft` creates v1
**born frozen**, so the first keystroke forks v2. S-4 rules that a conformance bug against DS §5.4
("editing an **unreviewed** draft is in place").

After this ticket:
- An import lands as the project's **working head**, with a seeded live doc.
- It freezes only on DS's four triggers: run read, dossier reference, promote and export.
- The REQ-DATA-14 rule from S-4 is respected:
  - an import into an empty working head **overwrites** that head;
  - otherwise it freezes the current head as vN, with its origin unchanged, and creates the
    import as working v(N+1), with a toast that says so.

Import fidelity is fixed in the same ticket: a leading `# H1` becomes the title [I3], the preview
is typeset, a clean conversion offers one CTA, and the native file input becomes a styled
dropzone. U7 is implemented and held `ready-to-flip`, and 250 flips it.

## Load (read these — do not re-read others)
- `docs/round-7-draft-spec.md` §3.3 S-4; §4.9 REQ-HOME-4 and REQ-HOME-5; §4.17 REQ-DACC-7 (U7);
  §4.6 REQ-KIT-5; §8.1.
- REVIEW RV-20. R5 `…/R5-ux-browser-audit.md` I3 and I4.
- `docs/rhema-design-spec.md`:
  - line 524: the §5.4 editing rule;
  - line 1333: the four freeze triggers ("freezes on first run read, dossier reference, promote,
    or export (REQ-VIS-4)");
  - REQ-DATA-14 at ≈:3226 and the index at ≈:2041.
- `apps/api/AGENTS.md` and `packages/db/AGENTS.md` (forward-only additive migrations; parity of
  `schema/` with SQL; `withTenant`). `packages/orchestrator/AGENTS.md`, read only, for the
  run-read trigger.
- Anchors (re-confirm at build time):
  - **The import write:** `apps/api/src/import.ts` ≈:101-160. `createImportedDraft` inserts
    `state='frozen'` plus `promoted_version_id`.
  - **Schema:** `packages/db/migrations/0002_schema.sql` ≈:82-90. It defines `drafts` with
    `check (state <> 'frozen' or promoted_version_id is not null)`, the
    `one_working_head_per_project` partial unique index and `live_docs`. Migrations run to
    `0060_*` today.
  - **Freeze helpers:** `packages/mirror/src/freeze.ts` (`FreezeCause` is
    `run_read | dossier_ref | promote | export`; `freezeDraft`; `openHumanRevision`).
  - **Freeze call sites:**
    - `packages/orchestrator/src/run-creation.ts` ≈:155 (`run_read`);
    - `packages/mirror/src/delivery.ts` ≈:759 (`dossier_ref`);
    - the **promote** and **export** call sites. A 2026-11-03 grep found no `promote` or `export`
      cause passed in `apps/api`, so verify them: `apps/api/src/export-routes.ts` ≈:531 and the
      outline/draft promote routes.
  - **Live-doc seeding:** `packages/mirror/src/manual-revision.ts` ≈:382 (the precedent) and
    `apps/api/src/editor-routes.ts` ≈:236 (lazy-fork seeding of "a frozen import, a seeded
    head").
  - **Conversion:** `packages/markdown/src/import-doc.ts` (`assembleImportedDoc` drops the body
    H1 — the I3 drop); `packages/contracts/src/domain/conversion.ts` (`ConversionResult`,
    conversion notes); `packages/ui/src/conversion.tsx`.
  - **SPA import routes:** `routes/_authenticated/p.$project.import.tsx`,
    `p.$project.import_.preview.tsx` and `app.new_.preview.tsx`;
    `apps/web/src/spa/surfaces/onboarding.tsx`.
  - **Leg:** the U7 row in `packages/journeys/src/registry.ts`.
- `docs/tickets/00_MANIFEST.md` § Cross-cutting invariants and § Operating rules;
  `docs/tickets/DEFERRALS.md`.

## In scope — deliverables
1. **Imports land working** (REQ-HOME-4; S-4).
   - The import creates a `working` draft whose live doc is seeded from the converted markdown:
     either written at import, or through the editor's lazy seed path. Choose one and record it.
   - The writer's first keystroke edits in place. No fork.
2. **The REQ-DATA-14 rule** (S-4), applied in one transaction under the
   `one_working_head_per_project` index:
   - **Empty working head** (no blocks): the import overwrites that head. The definition of
     "empty" is recorded and tested.
   - **Otherwise:** the current head freezes as vN with its origin unchanged and its freeze cause
     recorded, and the import becomes working v(N+1). If `FreezeCause` needs a new member for
     "superseded by import", that is an ADR-noted decision owned here.
   - **Concurrency:** concurrent imports and saves cannot produce two working heads.
   - A toast says which of the two happened, using COPY.
3. **The four freeze triggers** (REQ-HOME-4; DS:1333). A working imported draft is frozen by:
   - run read (run creation);
   - dossier reference (delivery);
   - promote;
   - export.

   Each has a test. Wire any trigger that is missing: verify promote and export.
4. **Import fidelity** (REQ-HOME-5) [I3].
   - A leading `# H1` becomes the draft/project title. It is never silently dropped, and every
     normalization is listed in Conversion notes.
   - The preview uses paper typography, not monospace.
   - A clean conversion offers one "Create draft".
   - A styled, keyboard-accessible dropzone replaces the native file input.
5. **Web landing.** After an import the writer lands on the editable Page `/p/:slug/v/:n` by SPA
   navigation, and the toast is shown.
6. **Migration only if required.** If one is needed, it is additive, passes
   `scripts/check-additive-migrations.mjs`, and keeps the Drizzle `schema/` parity test green. The
   expectation is none: working drafts may already carry `promoted_version_id`.
7. **U7.import leg.** Paste text that begins with an H1; the title is kept; the draft is editable,
   and typing creates no fork.
   - **The flip is held** (nightly hazard, P4-4; 209's note). Prod serves R7a until 250 deploys,
     so the row stays `expected:"red"`, held `ready-to-flip`, and 250_R7DEP.2 flips it.
8. **Tenancy.** No new tenant GET is expected. If one is added, the two-tenant probe is extended.

## Out of scope
- Blank new-project creation and the empty-Page affordance row (REQ-HOME-3): 236. It consumes the
  overwrite rule.
- The frozen-version fork toast and discard-fork (REQ-WRITE-7): 238.
- The rest of the import and new-project control migration (KIT-3 batch b): 241.
- Outline import and promote UX: unchanged here.

## Acceptance criteria
- [ ] PGlite: an import into a project whose working head is empty overwrites it. There is exactly
      one working head, no extra `n` is consumed, and the content is the import's.
      *(deterministic · layer: engineered)*
- [ ] PGlite: an import into a project with a non-empty working head freezes that head as vN (its
      origin unchanged and its cause recorded) and creates working v(N+1). A concurrent pair of
      imports never yields two working heads. *(deterministic · layer: engineered)*
- [ ] There are four tests, one per trigger (run read, dossier reference, promote, export). Each
      freezes a working imported draft, and each fails if its trigger call is removed.
      *(deterministic · layer: engineered)*
- [ ] A save to a freshly imported draft edits in place (an editor-route test, no fork).
      *(deterministic · layer: engineered)*
- [ ] Converting `# Title\n\nBody` yields title "Title" and a conversion note. The preview's
      computed font is the paper face, not monospace. A clean conversion shows exactly one CTA.
      The dropzone is operable by keyboard. *(deterministic · layer: engineered)*
- [ ] If a migration was added, `check-additive-migrations` and schema parity are green. The entry
      delta is ≤ 15 kB gz and reported, and `check:dom-contract` is green.
      *(deterministic · layer: engineered)*
- [ ] **U7.import is held `ready-to-flip`.** The steps are implemented and typecheck, and the
      editor-route and conversion tests above cover each step's behaviour. The registry row stays
      `expected:"red"` in this PR (nightly hazard), and the run record states that 250_R7DEP.2
      flips it. *(deterministic · layer: engineered)*
- [ ] **Stage B is staging-verified at the R7b phase preview (250_R7DEP.2)** (`GD-PREVIEW.R7`: no
      per-ticket preview). This ticket opens a dated `DEFERRALS.md` row (`D-R7HOME.2a-n`, owner
      250). The row names what 250 captures:
      - U7.import green at the preview SHA (`--expect-sha`): a paste beginning with an H1 keeps
        its title, and typing into the imported draft creates no fork;
      - screenshots of the preview, the landed Page and the toast.

      Unblock: 250's preview walk. Compensating control: the PGlite and DOM tests above. 250 closes
      the row and flips the leg.
      *(agentic · layer: engineered here; staging-verified and live-executed at 250)*
- [ ] verification green; every new behaviour has a test that fails if it is removed; requirement ids stamped in the PR; anything not automatically verifiable is a `DEFERRALS.md` row with its compensating control; ADRs written for every deviation and owned decision; `BUILD_INDEX.md` row and `LEDGER.md` advanced; operating clauses met — dates from the clock, PR checks read and recorded, AC layers stated, no living-record pins, protected records only appended, gate words verbatim, harness in the run-ledger header. *(agentic — the universal phase-gate AC)*

## Requirement IDs to satisfy and stamp in the PR
REQ-HOME-4, REQ-HOME-5, REQ-DACC-7 (U7; held `ready-to-flip`, flipped by 250), REQ-KIT-5
(allowance). REQ-DATA-14 and REQ-VIS-4 are re-asserted (conformance, not amendment).

## Cross-cutting invariants
- Manifest § Cross-cutting invariants:
  - 6 (immutability: delivered artifacts write-once; freeze one-way);
  - 13 (tenant isolation: writes stay `withTenant`);
  - 12, 17.
- Spec §8: 1, 4, 5, 6 (append-only records; S-4 is a conformance fix, not an amendment), 7.

## Operating clauses
- Cited from `docs/tickets/00_MANIFEST.md § Operating rules`; the gap table has one row per clause.

## Notes
- **Decisions this ticket owns:**
  - the definition of an "empty working head";
  - live-doc seeding at import versus lazy seeding;
  - the freeze-cause value for "superseded by import" (an ADR if `FreezeCause` grows);
  - the toast copy keys;
  - where the H1-to-title rule lives (`@rhema/markdown`).
- **Shared decisions consumed:** the primitives (225, 225a); AppShell (226).
- **Downstream.** 236 relies on the overwrite rule: a blank new project's empty head is
  overwritten by "Import a file" or "Paste text". 238 relies on frozen versions staying explicit.
- **DEFERRALS.** If the promote or export trigger needs work beyond this ticket's size, wire run
  read and dossier reference (already present), test them, and open a dated row for the remainder
  with an owner. Do not ship an import that a promote or export can leave unfrozen silently.
- **REQ-DACC-8 deviation.** DACC-8 has the owner flip U7 in its own PR. Under `GD-PREVIEW.R7` and
  the nightly hazard, 250 flips it instead. Record this in the run record as an accepted
  deviation for 252's list.
- **Runtime split clause** (P4-14; invariant 17). If the run must split, the worker requests it
  at this seam, and orchestrate-build writes the split back to the manifest:
  - **(a)** the API/DB work, the freeze triggers, REQ-DATA-14 and U7 (REQ-HOME-4). That is
    deliverables 1, 2, 3, 5, 6, 7 and 8;
  - **(b)** the fidelity UI (REQ-HOME-5). That is deliverable 4.

  (b) stacks on (a). U7's "title kept" step depends on (b)'s H1-to-title rule. Under a split, (a)
  lands the leg's editable and no-fork steps, and (b) adds the title step. The leg is held
  `ready-to-flip` only once both have landed.
