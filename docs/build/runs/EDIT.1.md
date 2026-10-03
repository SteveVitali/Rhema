# EDIT.1 — run ledger (locked versions fork, `/v/working` resolves, the Page saves)

## Spec / Base / Branch / Config
- Spec: `docs/tickets/72_EDIT.1__edit-path.md` (chain row 72; spec §§5.4, 5.8, 5.10, 11.4, 11.6;
  REQ-IDE-32 primary, REQ-DATA-21, REQ-DATA-14, REQ-IDE-43; related REQ-DATA-24, REQ-IDE-46;
  REQ-IDE-44/REQ-DATA-27 honoured as amended — no working copies; REQ-SPEC-29 for N8).
- Base: `stevevitali/onb-1-import-latency-held-draft` @ `52629b3`.
- Branch: `stevevitali/edit-1-edit-path`. Stacked PR, mergePolicy=OPERATOR, never merge.
- Depends on: ONB.1 (import path + held-draft creation N8 starts from), HOT.1 (`page.js` route +
  bundle↔route parity), JOURNEY.1 (harness, test sessions, N8 expected-red flag), SEC.1 (the
  user-serving role).
- **Harness:** Devin CLI (Cognition agentic coding CLI), Anthropic Claude.
- **Started:** 2026-10-02
- Gate answers: deploy is pre-authorized under ADR-013 / the ticket's `Live stage` line ($0
  inference, pulumi preview first — a stateful replace/delete pauses). N8 needs the JOURNEY.1
  test mailbox (H7 — landed). `my-first-project` pauses the run ONLY if it needs a one-off
  production data repair — in that case the exact operator SQL is recorded here, unexecuted.
- Spend: Stage A $0. Stage B: deploy + N8 ($0, no inference) + prod HTTP legs ($0).

## Deferrals read (start-of-run)
- `D-PRB.07-1` — OPEN/PARTIAL: "the editor fork/save/lock legs ride journey step N8 (owner
  EDIT.1)" (JOURNEY.1's 2026-10-01 note). N8's green leg discharges the browser fork+save legs;
  the lock-banner/Cancel/note/revise browser legs remain (annotate, stay OPEN).
- `D-P1.08-1` — OPEN/PARTIAL: versions-rail + dossier legs mapped to N7/N8; ⌘S + restore-apply
  legs stay with the owner. N8's reload asserts the rail chip — annotate with evidence; do NOT
  flip (⌘S/restore legs unproven).
- `D-P1.03-1` — DONE with residual HUMAN legs ("type-to-materialize, frozen_fork rebind,
  offline-queue + ⌘S click-through"). N8 proves type-to-materialize + the `frozen_fork` rebind
  live — annotate.
- `X-p102-page-editor-live-verify` (BL-32's automatable half) — N8 IS its live evidence;
  recorded in the journey report + this ledger.
- New rows this ticket may add: `D-EDIT.1-1` for anything unverifiable here (WebKit CSP leg —
  the harness is Chromium-only; `my-first-project` operator-session HTTP render if no session
  mint exists for it).

## Context map (re-confirmed at build time)
- **The defect (single root):** `GET /projects/:id/editor/resolve/:v`
  (`apps/api/src/editor-routes.ts:234-260`) answers `working` by querying
  `state='working'` only → 404 for every project whose head is frozen: fresh imports
  (`createImportedDraft` inserts v1 `human_upload`/`frozen` — `apps/api/src/import.ts:~138`),
  reviewed-but-unedited heads (`agent`/`frozen`), `duplicate`/`frozen` copies, and any
  `my-first-project`-shaped project without a working head.
- **Fork machinery (already landed, tested):** `saveManualRevision`
  (`packages/mirror/src/manual-revision.ts:169-439`) — frozen → route to existing working
  `human_revision` child OR `openHumanRevision` (`freeze.ts`) v(N+1); `origin=human_revision`,
  `state='working'`, `base_draft_id` = frozen parent; frozen bytes untouched; findings
  re-project; `draft.forked` + `revision.move_traced` timeline events. Both the HTTP save
  (`POST /projects/:id/editor/:draftId/save`, editor-routes.ts:353-432) and the collab
  materialization (`apps/collab/src/materialize.ts` `storeDocument`) go through it.
- **Collab lazy-fork (already landed):** `apps/collab/src/auth.ts:167-205` — write intent on a
  frozen head: child exists ⇒ `AuthRefusal` with `frozen_fork {draftId, draftN}` payload; no
  child ⇒ writable attach, first debounced store forks then `onStoreDocument`'s `headMoved`
  closes connections so the client re-auths into the refusal → `rebind`. `intent=ro` attaches
  read-only. Working non-`human_revision` heads attach read-only. Run-lock ⇒ read-only attach.
- **Collab client (already landed):** `apps/web/src/client/collab.ts` — `onFork` → `rebind`
  (fresh provider on the same Y.Doc; y-indexeddb rehomed); `onStateless` handles
  `rhema.readonly` + `rhema.restore_point`; pill machine synced/syncing/offline/readonly.
- **Page island (already landed):** `apps/web/src/client/page.ts` — mounts PM over
  `data-page-doc` (preview replaced), provenance capture piggybacks stateless, `rebase` on
  `onFork` + on the 10 s lock-poll `doc.draftId` change, `data-page-view`, ⌘S → named restore
  point, NO save button/beforeunload.
- **Page SSR:** `packages/ui/src/page-editor.tsx:308-462` — `readOnly = props.readOnly || lock`;
  frozen ⇒ `data-page-banner="version"` (`frozenBannerFmt`) + editable host
  (`data-readonly="0"`); `data-sync-pill` fixed bottom-right, always SSR'd as `synced ✓`.
- **Web routes:** `server.ts:4432-4526` `GET /p/:project/v/:v` — resolves
  `resolveEditorDraft(session,row.id,v)` → `loadEditorPage(exact)` → 404 on resolve failure.
  `server.ts:4642-4654` `GET /p/:project/edit/:draftId` — redirects `/v/<n>` via an **exact**
  doc read (lands a stale base on the frozen view rather than its working child).
  `server.ts:3014-3113` project overview mounts the Page on `headDraftId` (highest-n, any
  state) + `collabWsUrl`. `pages.tsx:737-741` Edit source → `/v/:slug/v/working`, gated on
  `headDraftId` — a draft-less project never links `/v/working`.
- **`headDraftId`:** `apps/api/src/project-list.ts:474-477,528` — highest-`n` draft (any
  state) — the same "editable head candidate" the `/working` fallback needs.
- **Sync indicators (two today):** `[data-sync-pill]` (page-editor.tsx:451 — the live
  collab-driven indicator) AND `.ide-sync` (ide-shell.tsx:371 — renders `Synced`
  unconditionally whenever `status.sync` is unset, i.e. ALWAYS — and nothing feeds it
  client-side; it is a second, lying indicator on every IDE page). `SyncPill2`/`OfflineQueued`
  in ide-states.tsx are §5.9 state-catalogue fixtures (test-only, not mounted).
- **CSP:** `server.ts:286-295` `connect-src 'self'`; `COLLAB_WS_URL = wss://<app-host>/collab`
  (`infra/pulumi/compute.ts:703`) — same-origin WSS. `'self'` covers `wss://<same-host>` under
  CSP3 scheme mapping in Chromium; Safari's coverage has been historically inconsistent → the
  ticket's compensating control is an explicit same-origin `wss://` source.
- **Read-only attach is invisible to the client today:** `connectionConfig.readOnly` is
  server-side only; the client learns "read-only" only from the `rhema.readonly` stateless —
  which NOTHING sends (collab.ts:141 handler is dead code). A lock-attach pill therefore says
  `synced` while updates drop (until the 10 s doc poll corrects it).
- **Showcase guard:** `showcaseReadOnlyGuard` (api showcase.ts) covers api POSTs only — the
  collab WS leg bypasses it: typing on the Showcase's frozen v1 would fork `human_revision`
  inside the user's read-only worked example. Pre-existing hole on the same surface this
  ticket opens wider.
- **Version rail:** `packages/ui/src/version-rail.tsx` — `li[data-version-chip="<n>"][data-origin][data-state]`
  + `span[data-reviewed]` when a review correspondence exists (version-routes.ts:81).
- **N8 today:** `steps.ts:418-430` — returningUser("a") → /app → first project link → looks
  for a legacy `/edit/` affordance; no typing/fork/save/pill assertions. Registry: expected
  `red`, owner EDIT.1, paid `false`.
- **my-first-project:** exists on prod with a delivered review
  (`/p/my-first-project/review/01M36663…` referenced in D-PRB.04-1) and a PRB.16-forked v2
  `human_revision` (D-PRB.07-1 progress). `showcase=false`. The reported "redirect to
  /v/working" was client-side/link-side; `/p/:slug` itself has no server redirect — re-confirm
  via HTTP legs in Stage B.

## Plan (Phase 1)

### Deliverable 1 — resolve the editable head (REQ-IDE-32, REQ-DATA-14)
- `apps/api/src/editor-routes.ts` — `resolve/:v` for `v === "working"`: prefer the working
  head; else the highest-`n` draft (the lazy-fork source). One query:
  `order by (state='working') desc, n desc limit 1`. Numeric `v` stays exact.
- `apps/web/src/server.ts` — `GET /p/:project/v/:v`: when `v === "working"` and the resolve
  404s (a project with zero drafts), redirect to `/p/:slug` (the entry-cards surface) instead
  of 404ing. Numeric `v` keeps truthful 404.
- Update the stale route comment (frozen ⇒ editable-with-banner, not read-only).

### Deliverable 2 — fork without a confirm + §5.4 banner
- `apps/web/src/copy.ts` — `versionForkFmt` + `forkFmt` → the §5.4 wording
  ("Editing v{n} · findings from v{base} follow your text").
- No code path mints a draft on open (the resolver reads; the fork stays first-write —
  `openHumanRevision` is never called by a GET).

### Deliverable 3 — the Page mounts + saves + ONE truthful indicator
- `packages/ui/src/ide-shell.tsx` — remove the `.ide-sync` status-bar span (it always claimed
  `Synced` and nothing fed it), its `sync`/`syncLabel` derivation, `status.sync` prop field,
  and the `statusBar.synced|syncing|offline` label fields (+ `copy.ts` + test fixture). The
  `[data-sync-pill]` is the ONE indicator; add `role="status" aria-live="polite"` to it.
- `apps/collab/src/extension.ts` — new `connected` hook: when `context.readOnly`, send the
  already-specified `rhema.readonly` stateless to the attaching connection → the pill flips
  to read-only immediately at attach (was: silently lied `synced` until the 10 s poll).
- `apps/collab/src/auth.ts` — `resolveDraftBinding` selects `p.showcase`; a showcase draft
  attaches `readOnly: true` (the worked example stays unwritable through the WSS leg — the
  same posture the api guard enforces on HTTP).
- `apps/web/src/server.ts` — `page.readOnly` on the `/v/:v` route for `row.showcase` (the SSR
  read-only note + no edit affordance; belt for the collab attach).
- CSP: `connect-src 'self' <collabWsUrl-origin>` — the explicit same-origin `wss://` source
  (removes the WebKit ambiguity entirely; harness is Chromium-only → the WebKit browser leg
  becomes a `D-EDIT.1-1` row with this as the compensating control).
- `server.ts:4647` — the legacy `/edit/:draftId` redirect reads non-exact so a stale base id
  lands on `/v/<childN>` (the live head), not the frozen view.

### Deliverable 6 — tests
- `apps/api/src/editor-routes.test.ts`:
  - resolve `working` on an only-frozen `human_upload` head → the frozen draft id
    (regression: fails against the pre-fix resolver — the ticket's required regression test).
  - resolve `working` prefers the working `human_revision` child; numeric resolve still exact.
  - first save on the imported head forks v(N+1) human_revision; second base save routes to
    the child (never v(N+2)); frozen bytes byte-identical.
  - resolve `working` on a showcase project resolves (read) but its save POST keeps
    `showcase_read_only` 409 (the guard).
- `apps/web/src/page.test.ts` (+ server fixture): `/v/working` on an import-only project →
  200, `data-readonly="0"`, frozen banner, one `[data-sync-pill]`, no `.ide-sync`;
  `/v/working` on a draft-less project → redirect to `/p/:slug`; every rendered edit link
  (Edit source / rail chips / sourceHref) resolves through the resolver for the seeded
  import-only project.
- `apps/collab/src/collab.test.ts`: showcase draft → `readOnly` attach; `connected` hook
  emits `rhema.readonly` on a read-only attach; frozen first-store forks exactly once
  (existing test already covers — keep green).
- `packages/ui/src/ide-shell.test.tsx` — status bar renders no `.ide-sync`.
- `packages/journeys/src/registry.ts` — N8 stays `expected: red` at merge time (the green flip
  rides `D-EDIT.1-1`'s deployed walk); `steps.ts` N8 rewritten:
  - Leg A (`freshUser`): `createDraftProject` → Edit source → `/v/working` 200 →
    `[data-page-view]` mounts → frozen banner → type → fork banner (v(N+1)) →
    `[data-sync-pill][data-sync-state="synced"]` → reload → `human_revision`/`working` chip +
    marker persisted. No confirm surface anywhere (no modal/dialog locators match).
  - Leg B (`returningUser("a")`): scan /app project pages for a reviewed-frozen chip
    (`li[data-version-chip][data-state="frozen"]:has([data-reviewed])`) that is editable;
    prefer an un-forked one. Type → synced → reload → working chip + edit persisted (on an
    already-forked lineage the same assertions hold through the `frozen_fork` rebind).
    Fallback: no reviewed head on the tenant ⇒ duplicate the Showcase (`/p/:slug/duplicate`)
    and run the same flow on the copy's `duplicate`-origin frozen head — recorded honestly as
    the frozen-lineage stand-in (a real reviewed head on jrn-a is preferred whenever one
    exists).

### Deliverable 7 — Stage B (operator-gated per the ticket's Live stage line)
- `pulumi preview` (expect image/env bumps only — zero stateful replace/delete) → deploy
  chain-tip SHA → `pnpm journeys N8 --stage prod` → screenshots + report →
  `my-first-project` HTTP legs (authed `/p/my-first-project` + `/v/working` ⇒ 200; else the
  paused operator SQL here, unexecuted).

## Test matrix (Phase 1)
| Surface | Case | Where |
| --- | --- | --- |
| api resolve | only-frozen `human_upload` → returns head (was 404) | editor-routes.test.ts |
| api resolve | working child preferred; numeric exact | editor-routes.test.ts |
| api save | frozen → v(N+1) once; stale base → child; frozen bytes stable | editor-routes.test.ts |
| api save | showcase 409 `showcase_read_only` | editor-routes.test.ts |
| web route | `/v/working` import-only → 200 editable Page | page.test.ts |
| web route | `/v/working` draft-less → redirect `/p/:slug` | page.test.ts |
| web SSR | one `[data-sync-pill]`, zero `.ide-sync`, `role=status` | page.test.ts / ide-shell.test.tsx |
| collab | readOnly attach → `rhema.readonly` stateless | collab.test.ts |
| collab | showcase draft → readOnly attach | collab.test.ts |
| journeys | N8 legs A+B above | steps.ts |
| CSP | `connect-src` carries the configured `wss://` origin | server CSP test |

## ADR(s) to write
- **ADR-048** — `/v/working` = the editable head: working head, else highest-`n` draft served
  editable with the lazy (first-write) fork — versus an eager fork on open. Records the
  import-freeze plan-vs-code deviation (§5.4 says unreviewed edits in place; `import.ts`
  freezes every import, so imports fork on first type — kept per the ticket Notes).
- **ADR-049** — one sync indicator: `[data-sync-pill]` survives (the `.ide-sync` status-bar
  span is removed — it always claimed `Synced`, unfed); plus the `rhema.readonly`
  attach-time stateless (server now sends what the client already handled) and the explicit
  same-origin `wss://` `connect-src` source.

## Baseline (Phase 1 health check)
- `vitest run apps/api/src/editor-routes.test.ts apps/web/src/page.test.ts
  apps/collab/src/collab.test.ts` → **31/31 green** at `52629b3`.

## Execution (Phase 2 — implemented)

All deliverables landed as planned. Diff shape:

| File | Change |
| --- | --- |
| `apps/api/src/editor-routes.ts` | `resolve/:v` for `working`: `order by (state='working') desc, n desc limit 1` — the working head, else the highest-n draft (frozen `human_upload`/`agent`/`duplicate` heads all qualify as the lazy-fork source). Numeric `v` untouched (exact). |
| `apps/web/src/server.ts` | `/v/working` resolve-404 ⇒ redirect `/p/:slug` (numeric `/v/:n` keeps the truthful 404); showcase ⇒ `readOnly` SSR + no `collabWsUrl` on `/v/:v` AND the overview Page; `sourceHref` → `/v/working`; CSP `connect-src` gains the configured `collabWsUrl` origin explicitly; legacy `/edit/:draftId` redirect reads non-exact so a stale base id lands on `/v/<childN>`. |
| `apps/collab/src/auth.ts` | `resolveDraftBinding` selects `p.showcase`; showcase draft ⇒ `readOnly` attach before the frozen-fork path (the worked example can never reach `human_revision` through WSS — matching the api's `showcaseReadOnlyGuard` on HTTP). |
| `apps/collab/src/extension.ts` | New `connected` hook: `context.readOnly` ⇒ `rhema.readonly` stateless at attach — the client's existing handler + pill were dead code until now. |
| `apps/collab/src/materialize.ts` | Belt: `storeDocument` returns `locked` for `projects.showcase` — no fork, no `y_state` write even via a stale connection / block patch / direct store. |
| `apps/web/src/client/page.ts` | `onFork` → `rebase(child)` + `showForkBanner` (already wired); fork banner fallback text updated to §5.4 verbatim. |
| `apps/web/src/copy.ts` | `versionForkFmt`/`forkFmt` → "Editing v{n} · findings from v{base} follow your text" (§5.4 verbatim); status-bar sync strings removed. |
| `packages/ui/src/ide-shell.tsx` | `.ide-sync` span, `status.sync` prop, `synced|syncing|offline` labels removed — the bar kept version/words/readMin/venue/credits only. |
| `packages/ui/src/page-editor.tsx` | `[data-sync-pill]` gains `role="status" aria-live="polite"`. |
| `packages/tokens/src/ide-css.ts` | `.ide-sync` CSS rule removed (comment records the ADR-049 rationale). |
| `packages/journeys/src/steps.ts` | N8 rewritten: shared `n8TypeForkSave` (open → mount → one-pill/no-`.ide-sync` assert → no-confirm check → type → `"Editing vN"` banner → `data-sync-state="synced"` → `/v/working` reload → working `human_revision` chip + persisted marker); leg A fresh import via `createDraftProject` + `[data-edit-source]`; leg B reviewed/frozen chip scan on jrn-a with Showcase-duplicate fallback. |
| `packages/journeys/src/registry.ts` | N8 `asserts` updated; `expected` stays **`red`** — the flip rides D-EDIT.1-1's deployed walk (registry test enforces the green baseline set). |
| `docs/adr/ADR-048`, `ADR-049`, `docs/adr/README.md` | New ADRs; index regenerated by `build-memory adr-index`. |
| `docs/tickets/DEFERRALS.md` | `D-EDIT.1-1` OPEN — Stage B deploy + N8 on prod + my-first-project HTTP legs + WebKit CSP leg, with the deterministic proxies listed. |

### Deviation recorded (ADR-048)
The ticket's plan/code tension: §5.4 says an *unreviewed* draft edits in place, but `import.ts`
freezes every import — kept per the ticket Notes (the ledger scopes EDIT.1 to "locked versions
fork"); ADR-048 names it and D-EDIT.1-1's Stage B records the observed first-type fork on prod.

## Self-review (Phase 3 — mechanical + design)

- `resolveEditorDraft` query is project-scoped (`project_id = $1`) behind `ownProject` — the
  widened `ORDER BY` cannot cross tenants; the existing cross-tenant 404 test stays green.
- No GET path mints a draft: the resolver only SELECTs; `resolve working` test asserts the draft
  count + frozen sha are unchanged after resolve.
- `exact` semantics preserved: `/v/:n` → `getEditorDoc(exact)` renders that version's bytes; the
  doc route non-exact follows the child only for the editing seam (GET doc / POST save / stale
  `/edit/:id` redirect).
- One-pill check: `grep 'class="ide-sync"'` → 0 in rendered SSR (test-asserted); `SyncPill2`/
  `OfflineQueued` in `ide-states.tsx` are the §5.9 catalogue's test fixtures — unmounted.
- `rhema.readonly` emission confirmed over a real WebSocket (collab test).
- User-facing entry points audited: Edit source (`pages.tsx:738` → `/v/working`), Files-pane
  `sourceHref` (→ `/v/working`), rail chips (`/v/:n` exact), legacy `/edit/:id` (redirect →
  child `/v/<n>`). No rendered path dead-ends on the dormant CodeMirror surface.
- N8's DOM hooks verified against SSR markup: `[data-page-root]` (page-editor.tsx:316),
  `[data-page-view]` (island-set, page.ts:177), `[data-sync-pill]`, `li[data-version-chip]
  [data-origin][data-state]` + `span[data-reviewed]` (version-rail.tsx:117-156),
  `[data-page-banner="version"] span` (page-editor.tsx:330-335), `[data-page-host]
  [data-readonly]` (page-editor.tsx:384), `[data-showcase-banner]` + duplicate form
  (pages.tsx:2385-2399).
- `waitForFunction(fn, undefined, {timeout})` — Playwright arg shape corrected.
- Frozen pages render `data-readonly="0"` by design: the keystroke must reach collab to fork —
  read-only is reserved for showcase/run-lock/artifact reads (ADR-049).

## Verification (Phase 5)

- `vitest run apps/api/src/editor-routes.test.ts` → **13/13** (incl. the real
  `createImportedDraft` path — the seeded head is written by the actual ingest function, not a
  hand-rolled insert; agent-frozen resolve; working-child preference; draft-less 404;
  lazy-fork mints nothing; showcase 409).
- `vitest run apps/web/src` → **434/434** (new: `/v/working` frozen head editable 200,
  draft-less redirect, CSP connect-src wss origin, one `[data-sync-pill]`/zero `.ide-sync`,
  showcase read-only SSR, stale `/edit/` lands on child).
- `vitest run apps/collab/src` → **13/13** (new: showcase read-only attach + store belt —
  no fork/no `y_state` delta; `rhema.readonly` reaches a real provider at connect).
- `vitest run packages/{ui,journeys,tokens}` → **155/155** (ide-shell no-`.ide-sync`;
  registry green-baseline set still enforces N8 red).
- `pnpm turbo typecheck` → **90/90**; `pnpm turbo lint` → **45/45**; `pnpm turbo build` → **45/45**.

## Stage B (D-EDIT.1-1 — OPEN; operator-gated, recorded in DEFERRALS)

Deploy chain-tip → `pnpm journeys N8 --stage prod` → my-first-project HTTP legs → WebKit CSP
leg → flip N8 `red→green` with report + screenshots under `docs/build/reports/`.
