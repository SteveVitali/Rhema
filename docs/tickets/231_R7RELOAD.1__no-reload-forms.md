# R7RELOAD.1 — No document reloads from in-app forms and redirects + the GUARD-3 harness

- **Sequence:** 231 of 254 · **Phase:** round 7 (R7b) · **Kind:** ticket
- **base_branch:** current checkout
- **Depends on:** 226_R7SHELL.1a. The delegated submit lives at the chrome host inside the
  AppShell, and the wordmark/home target is the shell's. It uses no 225a primitive. This row
  merges after 224 (spec §5.1).
- **Run:** `implement-spec spec=docs/tickets/231_R7RELOAD.1__no-reload-forms.md`
- **Gate status:** none
- **Live stage:** Stage A only ($0: unit, DOM and integration tests, the harness's fixture walk,
  and a local build).
  - No owned preview (`GD-PREVIEW.R7`). Stage B is staging-verified at the R7b phase preview
    (250_R7DEP.2) through a DEFERRALS row, and prod Stage B rides 250.
  - U2.noreload is held `ready-to-flip` (nightly hazard), and 250 flips it.
  - Any need for a live preview outside 224's and 250's windows → PAUSE for the operator.
- **Production mutations:** none
- **Size budget:** ~550 changed lines excl. generated/fixtures (M). Entry-delta allowance ≤ 15 kB
  gz (REQ-KIT-5), with the actual figure stated in the PR.

## Goal
Inside the signed-in app, only the sanctioned exits ever load a new document. These changes close
the R6 §2 leaks:
- **Forms** in pane bodies (Timeline gate approvals, the explainer dismiss) go through one
  chrome-level delegated submit with one shared write allowlist.
- **Write redirects** stop routing through the `/edit/:id` reload stub.
- **Stale `reloadDocument:true` redirects** on in-tree targets go.
- **Form routes** answer through `mutationOutcome`, so a no-JS failure never shows raw JSON.

A journey harness then proves "one document per walk" (REQ-GUARD-3). U2 is implemented and held
`ready-to-flip`, and 250 flips it. Chat send is 232's.

## Load (read these — do not re-read others)
- `docs/round-7-draft-spec.md`:
  - §4.8 REQ-RELOAD-2, -3, -4 and -6; §4.16 REQ-GUARD-3;
  - §3.3 S-14 (the sanctioned document navigations into and out of the demo);
  - §4.17 REQ-DACC-7 (U2); §8.
- R6 `…/R6-ux-code-audit.md`:
  - §2: the T1–T8 leaks, and T9–T13 as intended exits;
  - UXC-2, -3, -4, -5 and -28.
- R5 `…/R5-ux-browser-audit.md` C1 (Showcase; fixed by 211 in R7a and consumed here).
- Anchors (re-confirm at build time; `server.ts` line numbers drift, so grep):
  - **Interception and allowlists:**
    - `apps/web/src/spa/nav-intercept.ts` ≈:32 `RELOAD_STUB_IDS`;
    - `apps/web/src/spa/surfaces/dossier.tsx` ≈:79 `DOSSIER_WRITE` and ≈:247 `PaneIntercept`;
    - `apps/web/src/spa/surfaces/editor.tsx` ≈:76 `EDITOR_WRITE`;
    - `packages/ui/src/gate-card.tsx` (the approve/decline and dismiss forms);
    - `apps/web/src/spa/ide/chrome.tsx` (the IdeChrome host).
  - **Server write redirects:** in `apps/web/src/server.ts`, the note `→ /edit/:id?noted=1`, the
    cancel-run redirect, and the palette deep link `/p/${slug}/edit/${refId}` (unless 228 retired
    that route).
  - **Mutation helpers:** `apps/web/src/bff.ts` ≈:38 `wantsJson` and ≈:102 `mutationOutcome`.
    About 121 of 123 `app.post` handlers already use `mutationOutcome`; the `/p/:project/chat/*`
    family answers through `chatReply`/`chatFail` with prose errors such as
    "threadId + message required".
  - **In-tree `reloadDocument:true`:** `routes/_authenticated/p.$project.index.tsx` ≈:39 (the
    handoff) and `p.$project.v.$v.tsx` ≈:37 and :60.
  - **Home links:** `apps/web/src/spa/states.tsx` (the 404 "Home" `href="/"`) and
    `packages/ui/src/shell.tsx` ≈:33 (`href="/"`).
  - **Journeys:** `packages/journeys/src/runner.ts` (document-load counting) and `settle.ts`; the
    U2 row in `registry.ts`.
- `apps/web/AGENTS.md`; `packages/journeys/AGENTS.md`; `docs/tickets/00_MANIFEST.md`
  § Cross-cutting invariants and § Operating rules; `docs/tickets/DEFERRALS.md`.

## In scope — deliverables
1. **One delegated submit and one write allowlist** (REQ-RELOAD-2) [UXC-2].
   - `PaneIntercept` is generalized into a single `onSubmit` at the IdeChrome host that covers
     every pane body (Timeline, panel and margin).
   - One shared write-path allowlist module replaces the per-surface `*_WRITE` regexes, which
     surfaces then import.
   - Timeline gate Approve/Decline and the explainer dismiss go as JSON mutations. Scroll position
     and focus are preserved (REQ-UX-4).
   - The chat forms are excluded; 232 replaces them with a fetch mutation.
2. **Redirect targets** (REQ-RELOAD-3) [UXC-3, -4, -5].
   - Server write responses (note, cancel-run, revise) redirect straight to `/p/:slug/v/:n…`. No
     write produces `/edit/:id`. The stub route stays for old bookmarks only.
   - The legacy palette deep link is fixed if 228 kept that route.
   - `reloadDocument:true` is removed on in-tree targets: the project-index handoff becomes an
     in-router redirect, and so does the `v/working` miss arm.
   - Every remaining in-app `href="/"` (the 404 Home link, any signed-in SSR document's Shell
     `homeHref`) targets `/app`.
3. **`mutationOutcome` everywhere** (REQ-RELOAD-4) [UXC-28].
   - Every form route returns through `mutationOutcome`: a flash redirect for no-JS, a stable
     error code for JSON.
   - This includes the residual `/p/:project/chat/*` error paths: the prose `error` values become
     stable codes, and a no-JS empty chat send lands as a flash, not a raw JSON page.
   - A census test over `server.ts` POST handlers enforces it, with a named exemption list
     (webhooks and binaries).
4. **The GUARD-3 harness** (REQ-RELOAD-6 / REQ-GUARD-3).
   - A journeys helper asserts `performance.getEntriesByType('navigation').length === 1` and a
     persisted window marker across a scripted walk.
   - Sanctioned document navigations are excluded **by name**: the S-14 demo entries and exits,
     `/logout`, Stripe/OAuth handoffs, binary exports and `/p/:p/f/:fid` (R6 T10–T13).
   - The U2.noreload steps walk list → project → dossier → compare → export → settings → inbox →
     Timeline gate approve → Showcase → back.
   - **The flip is held** (nightly hazard, P4-4; 209's note). Prod serves R7a until 250 deploys,
     so the row stays `expected:"red"`, held `ready-to-flip`, and 250_R7DEP.2 flips it.
   - The chat-send segment is appended by 232 (REQ-RELOAD-1).
5. **DOM contract** updates in the same change, where any hook moves.

## Out of scope
- Chat send as a JSON mutation and the client-side empty-send block (REQ-RELOAD-1): 232_R7TALK.1a.
- Showcase in the SPA (REQ-RELOAD-5): 211_R7RO.1 (R7a, consumed here).
- The global palette: 228. Handoff fold and prefetch (REQ-SPEED-1/3): 246_R7SYNC.1.
- Island shrink and Android tablets (REQ-RELOAD-7): 247_R7RO.2.
- The occlusion guard: 249.

## Acceptance criteria
- [ ] Approving a gate from the Timeline card issues a JSON fetch, adds no navigation entry, and
      keeps the scroll offset. The test fails if the host-level handler is removed.
      *(deterministic · layer: engineered)*
- [ ] One write-allowlist module exists. A test fails if any surface declares its own `*_WRITE`
      pattern. *(deterministic · layer: engineered)*
- [ ] No server write response redirects to `/edit/` (a route-census test over the write
      handlers). *(deterministic · layer: engineered)*
- [ ] No `reloadDocument: true` remains under `spa/routes/_authenticated/**` except the 401 →
      `/login` leg and the named stub/binary passthroughs (a test with the named list).
      *(deterministic · layer: engineered)*
- [ ] Every `server.ts` POST handler routes through `mutationOutcome` or a named exemption. A
      no-JS empty chat send returns a flash redirect. *(deterministic · layer: engineered)*
- [ ] The harness unit test fails on a planted document reload in a fixture walk and passes on the
      clean walk. *(deterministic · layer: engineered)*
- [ ] `check:dom-contract` is green, and the entry delta is ≤ 15 kB gz and reported.
      *(deterministic · layer: engineered)*
- [ ] **U2.noreload is held `ready-to-flip`.** The steps are implemented and typecheck, and the
      harness's fixture walk passes. The registry row stays `expected:"red"` in this PR (nightly
      hazard), and the run record states that 250_R7DEP.2 flips it.
      *(deterministic · layer: engineered)*
- [ ] **Stage B is staging-verified at the R7b phase preview (250_R7DEP.2)** (`GD-PREVIEW.R7`: no
      per-ticket preview). This ticket opens a dated `DEFERRALS.md` row (`D-R7RELOAD.1-n`, owner
      250). The row names what 250 captures:
      - U2.noreload green at the preview SHA (`--expect-sha`), including 232's chat-send segment;
      - the navigation-entry count;
      - screenshots of the walk.

      Unblock: 250's preview walk. Compensating control: the harness unit test and the Stage-A
      tests above. 250 closes the row and flips the leg.
      *(agentic · layer: engineered here; staging-verified and live-executed at 250)*
- [ ] verification green; every new behaviour has a test that fails if it is removed; requirement ids stamped in the PR; anything not automatically verifiable is a `DEFERRALS.md` row with its compensating control; ADRs written for every deviation and owned decision; `BUILD_INDEX.md` row and `LEDGER.md` advanced; operating clauses met — dates from the clock, PR checks read and recorded, AC layers stated, no living-record pins, protected records only appended, gate words verbatim, harness in the run-ledger header. *(agentic — the universal phase-gate AC)*

## Requirement IDs to satisfy and stamp in the PR
REQ-RELOAD-2, REQ-RELOAD-3, REQ-RELOAD-4, REQ-RELOAD-6, REQ-GUARD-3, REQ-DACC-7 (U2; held
`ready-to-flip`, flipped by 250), REQ-KIT-5 (allowance)

## Cross-cutting invariants
- Manifest § Cross-cutting invariants:
  - 11 (the run sheet is the only run creator; no form re-route creates a run);
  - 12 (walk the surface);
  - 13 (writes stay session-forwarded and tenant-scoped);
  - 17 (context budget).
- Spec §8: 1, 4 (skipped legs reported as skipped), 5, 7.

## Operating clauses
- Cited from `docs/tickets/00_MANIFEST.md § Operating rules`; the gap table has one row per clause.

## Notes
- **Decisions this ticket owns:**
  - the shared write-allowlist module and its location;
  - the named list of sanctioned document navigations (GUARD-3's exclusion list, which 232 and
    249 consume);
  - the `mutationOutcome` exemption list;
  - the stable error codes for the chat routes, which 245's `errorCopy` maps to sentences.
- **Shared decisions consumed:** ReadOnlyProject and the SPA Showcase (211); AppShell (226); the
  palette-search route decision (228).
- **U2 handoff to 232.** 232 appends the chat-send segment to U2's walk. U2 stays held
  `ready-to-flip` across that change, and its Stage-A walk keeps passing.
- **REQ-DACC-8 deviation.** DACC-8 has the owner flip U2 in its own PR. Under `GD-PREVIEW.R7` and
  the nightly hazard, 250 flips it instead. Record this in the run record as an accepted
  deviation for 252's list.
