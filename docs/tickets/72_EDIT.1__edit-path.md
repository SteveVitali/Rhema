# EDIT.1 — A working edit path: locked versions fork, `/v/working` resolves, the Page saves

- **Sequence:** 72 (round 3) · **Phase:** round 3 — launch readiness · **Kind:** ticket · **Tag:** fix
- **base_branch:** current checkout (the chain tip the previous round-3 row left; stacked PR)
- **Depends on:** ONB.1, HOT.1, JOURNEY.1
- **Scope (one line):** editing a locked (frozen) version forks to v(N+1) `human_revision` without a confirm and never 404s; `/p/:slug/v/working` resolves to the editable head for every project (including fresh imports and `my-first-project`); the Page editor island (`page.js`, routed by HOT.1) mounts and saves in a real browser with a truthful sync pill. No working copies (1.x).
- **Spec §§:** 5.4 (editing rules), 5.8 (version rail), 5.10 (autosave, sync pill, concurrency), 11.4 (one working head), 11.6 (freeze rules, REQ-DATA-24)
- **REQ coverage:** REQ-IDE-32 (primary), REQ-DATA-21, REQ-DATA-14, REQ-IDE-43; related REQ-DATA-24, REQ-IDE-46; REQ-IDE-44 / REQ-DATA-27 as amended (working copy 1.x) (stamp in the PR)
- **Absorbs (backlog):** BL-53 (b, c) (PR-J4) — part (a), the `/assets/page.js` route, is HOT.1's
- **Run:** `implement-spec spec=docs/tickets/72_EDIT.1__edit-path.md`
- **Gate status:** none beyond the round-3 standing authorization (ADR-013). It pauses only if `my-first-project` turns out to need a data repair rather than a code fix ("one-off prod data writes"). The journey legs need the H7 test mailbox through JOURNEY.1.
- **Live stage:** Stage A: code + tests ($0). Stage B: deploy the chain-tip SHA (pre-authorized under ADR-013) plus the JOURNEY.1 N8 leg on prod ($0, no inference).

## Goal
Every project a user opens has a way to edit it. The live review found no edit path on prod (PR-J4). **Edit
source** links to `/p/:slug/v/working` (`apps/web/src/pages.tsx` ~695). That route 404s whenever the project has
no draft in `state='working'` (`apps/api/src/editor-routes.ts` resolve ~232–262), which covers every fresh import:
`createImportedDraft` inserts v1 as `human_upload` / **`frozen`** (`apps/api/src/import.ts` ~138).
`my-first-project` was reported as redirecting to `/v/working` and so being unopenable from its own URL.

The fork machinery already exists and is tested. `saveManualRevision` (`packages/mirror/src/manual-revision.ts`
~169–210) and `openHumanRevision` (`packages/mirror/src/freeze.ts` ~48–65) fork a frozen head to v(N+1).
Collab's auth hook forks lazily on the first write (`apps/collab/src/auth.ts` header). What is missing is the
**route**: nothing resolves "the head the user should edit" when that head is frozen. The Page island was also
never served (HOT.1 routes it). This ticket connects the path end to end and proves it in a browser.

## Load (read these — do not re-read others)
- Spec §5.4 (the "Editing rules on the Page" paragraph), §5.10 (sync pill; agent-vs-human items 1–3; offline edits
  to a head frozen meanwhile), §11.6 (freeze rules REQ-DATA-21; REQ-DATA-24), §11.4 (`one_working_head_per_project`)
- `apps/api/src/editor-routes.ts`: `resolveEditorHead` ~70–97, `GET …/editor/resolve/:v` ~232–262, `POST …/save` ~353–430
- `apps/web/src/server.ts`: `GET /p/:project/v/:v` ~4050–4115, `/p/:project/edit/:draftId` redirect ~4253;
  `apps/web/src/pages.tsx` ~683–700 (the action row + `data-edit-source`); `apps/web/src/page-data.ts` `loadEditorPage` ~612
- `apps/web/src/client/page.ts` (island; `onFork`/`rebase` ~132–160; pill ~54–80); `apps/web/src/client/collab.ts`;
  `apps/collab/src/auth.ts` (lazy fork, `frozen_fork` refusal); `packages/ui/src/page-editor.tsx` ~449–458 (pill markup)
- `packages/mirror/src/manual-revision.ts`, `packages/mirror/src/freeze.ts`; `apps/api/src/import.ts` ~97–145
- Web CSP: `apps/web/src/server.ts` ~173–198 (`connect-src 'self'` against the same-origin `wss://…/collab`)
- The JOURNEY.1 package (`packages/journeys`) and its step registry (step **N8**)

## In scope — deliverables
1. **Resolve the editable head** (REQ-IDE-32, REQ-DATA-14). `/v/working` and the api resolve route return the
   project's single `working` draft when one exists, and otherwise the highest-`n` draft. That draft is served
   editable, so the first write forks it (REQ-DATA-24). Merely opening a draft never mints a draft (the
   collab lazy-fork rule). No project with at least one draft ever 404s on `/v/working`. A project with zero
   drafts routes to the entry cards, never a 404.
2. **Fork without a confirm** (REQ-IDE-32, REQ-DATA-21). Typing on a frozen/reviewed version forks to v(N+1)
   `origin=human_revision`, with the banner "Editing vN+1 · findings from vN follow your text" (§5.4). There is
   no modal, and the rail gains the chip. A second write routes to the existing child and never forks v(N+2)
   (the invariant already in `saveManualRevision` and collab; keep it tested through the new route).
3. **The Page editor mounts and saves** (REQ-IDE-43). With `page.js` served (HOT.1), the island mounts over the
   SSR preview and opens the collab session. A keystroke goes `syncing…` → `synced ✓`, and the saved markdown is
   readable back through `GET …/editor/:draftId`.
   - Exactly one sync indicator tells the truth. Today the status bar's `.ide-sync`
     (`packages/ui/src/ide-shell.tsx` ~371) and the Page's fixed `data-sync-pill` both render. Which one stays is
     an owned decision. Its phone placement is UX.2's.
   - Confirm that the WSS connect passes the prod CSP in Chromium **and** WebKit. If `connect-src 'self'` does
     not cover `wss:` in a target engine, add the explicit same-origin `wss://` source.
4. **`my-first-project` recoverable** (BL-53 c). Reproduce read-only, since no server-side redirect to
   `/v/working` exists at `cf40f28` (re-confirm; the redirect may be client-side or come from a stale Files-pane
   link). After the fix, `/p/my-first-project` and its `/v/working` both render. If recovery needs a data repair,
   stop at the pause and write the exact statement for the operator.
5. **Every "edit" entry point uses the one resolver.** That covers the Edit source link, the IDE `sourceHref`
   (`server.ts` ~333 → `/edit/:id` → `/v/:n`), the version rail chips, and the Files pane. None of them points
   at a URL that can 404 for an existing draft.
6. **Tests.**
   - api + PGlite: resolve over each head shape — only-frozen import, working child, agent-delivered frozen,
     Showcase (read-only guard kept).
   - web SSR for `/v/working` on an import-only project.
   - a collab-socket test: a first write on a frozen head forks exactly once.
   - a regression test that fails on the pre-fix resolver.
7. **Stage B.** Deploy, then turn journey step **N8** green: a new user's imported draft, **Edit source**, type, a
   v(N+1) chip, a `synced ✓` pill, and a reload shows the edit. Then run the same flow on a reviewed version.

## Out of scope
- Working copies, reconciliation-as-suggestions and multi-writer merge: 1.x (REQ-IDE-44 / REQ-DATA-27 amended;
  00_MANIFEST § Out of scope).
- The `/assets/page.js` route and the bundle↔route parity test: **HOT.1**.
- Import latency, held-draft persistence, H1 demotion and relative figure paths: **ONB.1**.
- The sync pill's phone-width overlap, and tap targets: **UX.2**.
- Changing the import freeze semantics (import inserts `frozen`): not changed here; see Notes.
- The chat composer and gates on the same page: **RUN.1**.

## Acceptance criteria
- [ ] `GET /projects/:id/editor/resolve/working` returns a draft (never 404) for a project whose only draft is a
      frozen `human_upload` v1. A test built on `createImportedDraft` fails against the pre-fix resolver. *(deterministic)*
- [ ] With a working `human_revision` child present, `working` resolves to it; `one_working_head_per_project`
      is never violated; a write on the frozen base routes to the child and never forks v(N+2). *(deterministic)*
- [ ] Typing on a frozen version forks v(N+1) `origin=human_revision` with no confirm and the banner (§5.4). The
      frozen bytes are byte-identical afterwards (immutability, invariant 6). *(deterministic — collab + api tests)*
- [ ] Opening `/v/working` or `/v/:n` without typing creates no draft row. *(deterministic)*
- [ ] Every edit entry point (Edit source, `sourceHref`, rail chips, Files pane) resolves through the one
      resolver; an SSR test asserts that no rendered edit link targets a 404ing URL for a seeded import-only
      project. *(deterministic)*
- [ ] One sync indicator renders, driven by the island's real states (`synced ✓` / `syncing…` /
      `offline · n changes queued` / `read-only`); there is no Save button and no beforeunload
      (REQ-IDE-43). *(deterministic)*
- [ ] Prod: `/p/my-first-project` and `/p/my-first-project/v/working` render 200 for the operator (HTTP) plus a
      journey screenshot, or a paused data-repair statement is recorded. *(agentic)*
- [ ] **Journey step N8 green on prod** (JOURNEY.1 harness; expected-red flag cleared). Asserted:
      - a new visitor's imported draft opens from **Edit source**
      - typing forks v(N+1) with the visible chip and banner
      - the pill reaches `synced ✓`
      - a reload shows the edit
      - the same holds on a reviewed version
      Screenshots are committed as evidence. *(agentic — JOURNEY.1)*
- [ ] Deployed provenance equals this ticket's chain-tip SHA (REQ-SPEC-29). *(deterministic)*
- [ ] verification green; every new behaviour has a test that fails if it is removed; requirement ids stamped in the PR; anything not automatically verifiable is a `DEFERRALS.md` row with its compensating control; ADRs written for every deviation and owned decision; `BUILD_INDEX.md` row and `LEDGER.md` advanced. *(agentic — the universal phase-gate AC)*

## Requirement IDs to satisfy and stamp in the PR
REQ-IDE-32 (primary), REQ-DATA-21, REQ-DATA-14, REQ-IDE-43; touched: REQ-DATA-24, REQ-IDE-46; REQ-IDE-44 /
REQ-DATA-27 honoured as amended (no working copy); REQ-SPEC-29 (N8).

## Cross-cutting invariants
- 00_MANIFEST § Cross-cutting invariants **6** (immutability: freeze is one-way; a frozen draft's bytes never
  change; the fork is a new row) and **12** (walk it — N8 via JOURNEY.1; provenance = chain tip).
- **13 / REQ-SPEC-30** (tenant isolation): every draft read stays inside `txRunner.run(workspaceId, …)` on the
  user-serving role (SEC.1). A cross-workspace draft id is `not_found`. If the resolver adds a tenant read route,
  extend the two-tenant probe.
- **14 / REQ-SPEC-32**: not touched (no price or claim surface).
- **REQ-SPEC-29**: N8 is this ticket's registry step.

## Notes
- **Owned decisions (write an ADR):**
  - (1) what `/v/working` means when the head is frozen: the highest-`n` draft served editable with a lazy fork
    (recommended; it matches collab's lazy rule and REQ-IDE-32's "typing forks") versus an eager fork on open
    (REQ-DATA-24 reads "opening … for editing creates", but an eager fork mints empty versions on every view)
  - (2) which sync indicator survives (REQ-IDE-43 "the only autosave UI")
- **Plan-vs-code tension (record in the ADR; do not silently change it).** §5.4 says an *unreviewed* draft is
  edited in place, and REQ-DATA-21's freeze triggers do not include import. Yet `import.ts` ~138 freezes every
  import, so typing on a fresh import forks v2 instead of editing v1 in place. The planning ledger scopes EDIT.1
  to "locked versions fork", so keep the import freeze. Name the deviation in the ADR, and open a
  `D-EDIT.1-n` row if the operator wants in-place editing of unreviewed imports.
- **Consumed:**
  - HOT.1: the `page.js` route plus the bundle↔route parity test, and LB request logs for 404 evidence
  - ONB.1: the import path and held-draft project creation that N8 starts from
  - JOURNEY.1: the harness, test sessions and the N8 expected-red flag
  - SEC.1: the user-serving role
- **Anchors to re-confirm at build time:**
  - `pages.tsx` ~695, `editor-routes.ts` ~232–262 / ~70–97, `server.ts` ~4050 / ~4253 / ~333 / ~173–198
  - `import.ts` ~138, `manual-revision.ts` ~169–210, `freeze.ts` ~48–65, `ide-shell.tsx` ~371, `page-editor.tsx` ~451
- **DEFERRALS:**
  - If N8 exercises ⌘S, annotate **D-P1.08-1**'s ⌘S restore-point leg with the evidence; flip only the legs proven.
  - N8 is also the live evidence for BACKLOG `X-p102-page-editor-live-verify` (BL-32's automatable half). Record
    it in the run ledger.
  - Anything unverifiable (e.g. WebKit if the harness lacks it, or the H7 mailbox missing) becomes
    `D-EDIT.1-<n>` per the H7 DEFERRALS rule.
