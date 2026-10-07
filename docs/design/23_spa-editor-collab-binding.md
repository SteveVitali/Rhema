# 23_spa-editor-collab-binding — ProseMirror + Y.Doc + decorations into React

**Stream:** B
**Researched:** 2026-10-07
**Author:** explore-subagent (B4 design worker)
**Ledger rows covered:** B4
**Confidence overall:** high

## Findings

### F1 — The PM/Yjs core is already framework-free; `page.ts` is a thin imperative shell (~365 lines) of mount + chrome wiring

**Claim:** Everything document-bound — schema, keymaps, input rules, `ySyncPlugin`/`yUndoPlugin`, the decorations plugin (findings spans + authorship overlay + proposal target marks, fed by `tr.setMeta(decorationInputsKey, …)`), the provenance plugin (`ORIGIN_META`, `agentSpans` capture, `provenanceForSave`), `acceptProposalTr`, `statusMeters`, `markdownToDoc`/`docToMarkdown`, the `PAGE_FRAGMENT = "prosemirror"` Y.XmlFragment convention — lives in DOM-free `@rhema/editor` and needs zero porting. `collab.ts` (`createCollabSession`) is likewise framework-free: Y.Doc → `IndexeddbPersistence("rhema-page/draft:<id>")` → `HocuspocusProvider` with the whole contractual wire protocol. What `page.ts` adds is: DOM discovery of SSR inputs, an `EditorView` mount over `[data-page-host]`, `installOriginDispatch`, a 600 ms provenance piggyback, ⌘S, the 10 s lock poll, and imperative rewrites of the sync pill / banners / findings rail / proposal cards / status meters.
**Status:** VERIFIED
**Evidence:** `apps/web/src/client/page.ts:31-365`; `apps/web/src/client/collab.ts:17-225` (no DOM/framework deps — imports `yjs`, `y-indexeddb`, `@hocuspocus/provider` only); `packages/editor/src/plugins.ts:36-106`; `packages/editor/src/decorations.ts:215-243`; `packages/editor/src/provenance.ts:121-189`; `packages/editor/src/proposal.ts:38-48`; `packages/editor/package.json` (description: "DOM-free (the view mounts in the web client island)").
**Retrieved:** 2026-10-07T22:10:00Z
**Implication for the spec:** The port is a wrapper, not a rewrite. The design surface is (a) where `EditorView`/`EditorState`/session identity live in React lifecycle, (b) which imperative DOM writes become React state, (c) which emitted `data-*`/`class` vocabulary must be preserved verbatim for journeys and the shell's DOM-based affordances.
**Outline delta:** CONFIRMS T2 (`docs/research-ledger.md:34-35`) — "islands→React is mostly mechanical, except the editor/collab island."

### F2 — The binding-library landscape: `@nytimes/react-prosemirror` is maintenance-only; v2 is `@handlewithcare/react-prosemirror` and re-implements prosemirror-view's renderer in React

**Claim:** As of 2025-01-17, active development of the react-prosemirror library moved from `@nytimes/react-prosemirror` (1.x, bug-fix only; NYT itself stays on v1) to `@handlewithcare/react-prosemirror` v2 (`handlewithcarecollective/react-prosemirror`). v2 is a significant architecture change: it disables `EditorView`'s DOM update cycle and re-implements prosemirror-view's update algorithm (doc/node/mark/widget/text view descriptors) as React components, exposing `useEditorEffect`/`useEditorEventCallback`/`useEditorEventListener` hooks and React-authored node views (`NodeViewComponentProps`).
**Status:** VERIFIED
**Evidence:** https://www.npmjs.com/package/@nytimes/react-prosemirror — "Active development has moved to @handlewithcare/react-prosemirror … Bug fixes and patches may still be applied to the 1.x branch"; https://discuss.prosemirror.net/t/nytimes-react-prosemirror-is-now-handlewithcare-react-prosemirror-and-v2-is-available/8168 — "the new release moves rendering responsibility entirely into React. We disabled the EditorView's DOM update cycle, and implemented the same update algorithm that prosemirror-view uses with React components"; https://github.com/handlewithcarecollective/react-prosemirror — hooks + node-view API; https://handlewithcare.dev/blog/why_i_rebuilt_prosemirror_view/ — v1's portal+layoutEffect approach had state-tearing corner cases motivating the v2 rewrite.
**Retrieved:** 2026-10-07T22:20:00Z
**Implication for the spec:** Evaluating "react-prosemirror" means evaluating a React-implemented PM renderer, not a mount helper. For this codebase that is disqualifying: our surface's invariants are (a) ySyncPlugin rendering remote updates through the real view pipeline, (b) decoration/state plugins owning doc DOM attributes, (c) `installOriginDispatch`'s `view.setProps({dispatchTransaction})` + non-reentrant `view.state.apply(tr)` (EDIT.1 regression), (d) imperative `setDecorationInputs`/`view.dispatch(view.state.tr)` re-renders. A React-rendered doc tree changes every one of those assumptions and adds a second renderer whose fidelity to prosemirror-view semantics we'd have to trust on our heaviest surface — for a benefit (React node views) we have no requirement for: our decorations are attribute/class sidecars, not widgets.
**Outline delta:** EXTENDS §5.4 — binds the editor to the stock prosemirror-view renderer.

### F3 — TipTap 3.x is stable and actively developed, but adopting it re-expresses `@rhema/editor`'s tested core as extensions for no contract gain

**Claim:** TipTap 3.0 is stable (changelog currently at 3.30.x); it wraps ProseMirror with its own extension model, ships `@tiptap/pm` (a PM repackaging), a new Decorations API, and prefers its own collab extensions over raw y-prosemirror. TipTap extensions can host raw PM plugins (`addProseMirrorPlugins`), so our plugins *could* ride inside it — but the schema (`pageSchema`), markdown-flavored input rules, `ORIGIN_META`/provenance capture, `acceptProposalTr`'s `addToHistory:false` semantics, and the ySyncPlugin fragment binding would each need re-wrapping and re-verifying against the contractual wire protocol.
**Status:** VERIFIED
**Evidence:** https://tiptap.dev/blog/release-notes/tiptap-3-0-is-stable — 3.0 stable, ~9M npm downloads/mo; https://github.com/ueberdosis/tiptap/blob/main/packages/react/CHANGELOG.md — 3.30.x line, Decorations API landed in 3.30.0; https://tiptap.dev/docs/resources/whats-new.
**Retrieved:** 2026-10-07T22:20:00Z
**Implication for the spec:** TipTap buys an ecosystem (menus, node views, collaboration conveniences) we don't consume, at the cost of re-verifying EDIT.1-class subtleties on a new abstraction layer, plus `@tiptap/*` bundle weight on the heaviest surface. The four-layer autosave, provenance vocabulary, and `rhema.*` stateless protocol are all ours to keep regardless — TipTap cannot reduce the contractual surface. Rejected for the Page; not precluded for unrelated future surfaces.
**Outline delta:** CONFIRMS "a React binding is welcome" (brief) — evaluated and declined with recorded rationale.

### F4 — y-prosemirror 1.x + yjs 13 is the pinned pair on BOTH sides of the wire; an upstream rewrite (`@y/prosemirror`, Yjs 14 delta API) is in flight

**Claim:** `apps/web` and `packages/editor` pin `y-prosemirror@^1.3.7` / `yjs@^13.6.21`; `apps/collab` pins the same pair and imports `updateYFragment`/`yDocToProsemirror` server-side. Upstream is rewriting the binding as `@y/prosemirror` on Yjs 14's delta API — explicitly to fix transaction-commit semantics (ephemeral EditorStates must not sync), selection restoration, and undo handling — but it is a PR-stage rewrite, not a released line.
**Status:** VERIFIED
**Evidence:** `apps/web/package.json:49-51`; `packages/editor/package.json:47-48`; `apps/collab/package.json:36-37`; `apps/collab/src/blocks.ts:11` (`updateYFragment, yDocToProsemirror`); `apps/collab/src/collab.test.ts:18`; https://github.com/yjs/y-prosemirror/pull/208 — "a rewrite of the y-prosemirror binding … released under a new package name: @y/prosemirror".
**Retrieved:** 2026-10-07T22:20:00Z
**Implication for the spec:** The SPA must not bump the binding independently of the server — the fragment shape and update semantics are the contract. The migration should ship on the existing pins; a `@y/prosemirror` evaluation is a separate, later, coordinated change.
**Outline delta:** EXTENDS REQ-ISL-4 — protocol fidelity includes the y-prosemirror major version on both ends.

### F5 — TanStack Router offers no mounted-component keep-alive; route navigation unmounts the tree — session/Y.Doc identity must live outside the component tree

**Claim:** Q-2 fixed TanStack Router + Query. TanStack Router has no first-class keep-alive for mounted route components (community threads build it via context-cloning hacks or third-party packages like `tanstack-router-cache`); loader *data* caches (`staleTime`/`gcTime`) are not component instances. Navigating `/p/:slug` → a version page → back therefore unmounts `<PageSurface>` and, without an external home, would destroy the Y.Doc/provider/IDB store on every hop.
**Status:** VERIFIED (router capability via public discussion; our consequence is design inference)
**Evidence:** https://github.com/TanStack/router/discussions/1447 — "Cache Routes to allow for Tabs to keep alive while offscreen" (open discussion; workarounds only); https://github.com/santiago-ramos-02/tanstack-router-cache — third-party keep-alive package exists precisely because the router lacks it.
**Retrieved:** 2026-10-07T22:25:00Z
**Implication for the spec:** Session identity must be a module-scope registry keyed by `draft:<draftId>` — router-agnostic, so the design holds even if C-stream revises router details. The registry entry should also hold the `EditorState` (DOM-free): unmount destroys only the `EditorView`, remount recreates it from the stored state — preserving the ySyncPlugin binding, the provenance/decorations plugin state, and the yUndoPlugin undo stack across intra-app navigation (strictly better than today, where every navigation is a full reload).
**Outline delta:** EXTENDS §13-ish durability story into SPA lifecycle; CORRECTS any "keep the route mounted" plan.

### F6 — Decision: hand-rolled mount. "React never re-renders the PM surface" is the isolation principle

**Claim:** The recommended binding is today's pattern wrapped in React: a `<div ref>` host under `[data-page-host]`, a mount `useEffect` that creates `EditorView` once (from the registry's `EditorState`), and effects that push inputs imperatively (`setDecorationInputs`, `view.setProps`, empty-`tr` re-reads of `editable`). React renders *around* the surface — pill, banners, proposals rail, findings rail, meters, note form — and renders *nothing inside* it after mount except the pre-mount `<PmPreview>` sibling, unmounted when the view binds.
**Status:** VERIFIED (design recommendation grounded in F1/F2/F4/F5)
**Evidence:** The mount pattern is identical to upstream y-prosemirror's documented React example (useRef + useEffect + `new EditorView` + destroy cleanup): https://github.com/yjs/y-prosemirror/ README example and the ycs React sample https://github.com/yjs/ycs/blob/main/samples/YcsSample/ClientApp/src/components/proseMirror.tsx. Current mount: `page.ts:190-198`.
**Retrieved:** 2026-10-07T22:25:00Z
**Implication for the spec:** This is the lowest-risk path for every contractual invariant: REQ-ISL-2 (four layers), REQ-ISL-3 (⌘S-only), REQ-ISL-4 (wire protocol), REQ-ISL-7 (provenance/undo separation), the decoration/proposal machinery, and the EDIT.1 non-reentrancy guarantee. The strict-mode double-mount hazard is handled by registry refcounting (F5), not by mount-side guards.
**Outline delta:** EXTENDS §5.4 — names the mount pattern and the isolation rule.

### F7 — The emitted-DOM contract on the Page route is journey-load-bearing; the React render must emit the same `data-*` vocabulary in both modes

**Claim:** Journey legs and the shell's own DOM-based affordances read: `data-page-root`/`data-draft-id`/`data-draft-n`/`data-doc-url`/`data-collab-url` (empty string is itself asserted), `data-readonly`, `data-locked`, `data-fork-fmt`, `data-focus-finding`, `data-page-mount="working"`, `data-page-host`+`data-readonly`, `data-page-view=1` on the mounted view (`view.dom`), `data-page-preview`, `data-sync-pill`+`data-sync-state`+`data-label-*`+`role=status`+`aria-live`, `data-page-banner={version,lock,readonly}`+`data-page-banner-text`+`data-writer-text`/`data-reader-text`, `data-findings-rail`+`data-finding-id`+`data-lost`+`data-lost-note`+`data-lost-note-text`, `data-proposal-card`+`data-proposal-{kind,from,to,md,origin,accept,reject}`, `data-status-{words,readmin,venue}`+`data-fmt`, `data-edit-source`, `data-phone-blocked`, `.rm-page`, `.ProseMirror`, and `[contenteditable]` absence at phone width.
**Status:** VERIFIED
**Evidence:** Emission: `packages/ui/src/page-editor.tsx:315-481`; `apps/web/src/pages.tsx:741,748` (`data-edit-source`, `data-page-mount`); mount attrs `page.ts:196-198`. Consumers: `packages/journeys/src/steps.ts:1662-1709` (phone reader contract: `data-readonly="1"` + `data-collab-url=""` + `[data-page-banner="readonly"]` + no `[data-version-rail]` + no `[contenteditable="true"]`; `data-page-mount` accept-set), `:569` (`data-edit-source`), EDIT.1's N8 leg (`docs/build/runs/EDIT.1.md:222` — `data-page-view`, `data-sync-state="synced"`, `"Editing vN"` banner, one-pill assert); `apps/web/src/client/ide.ts:665` (focusZone `.ProseMirror`/`[data-page-host]`), `:623` (rail scroll `.rm-page-host [data-finding-id]`); audit `docs/research/04_test-surface-audit.md` F4.
**Retrieved:** 2026-10-07T22:30:00Z
**Implication for the spec:** The React `PageSurface` emits the identical attribute vocabulary — including SSR-mode `data-collab-url=""` and `data-save-url`'s deliberate removal being a *rename-class* change (see F11/OQ3, requires registry/test updates if journeys ever read it — they don't today). `data-page-*` JSON embeds (`script[data-page-doc|prov|findings]`) are SSR-bootstrap artifacts; the SPA replaces them with a bootstrap fetch and derives `docJson` client-side via `markdownToDoc` (the same function `page-data.ts:637-638` runs server-side) — the `\u003c` escaping/`dangerouslySetInnerHTML` constraint (EDIT.1) dies with the embeds.
**Outline delta:** EXTENDS REQ-TST-2 — the Page's emitted-DOM contract is enumerated in full here.

### F8 — Read-only mounts still mount a non-editable `EditorView` today; switching them to `PmPreview` alone would regress decorations

**Claim:** When `data-collab-url` is absent (artifact reads `/a/:id`; phone/showcase pages where `collabWsUrl` is withheld), `page.ts` still mounts `createPageState(docJson, initSources)` over `pageSchema` with local `history()` and `editable: () => !locked && !readonly` → `contenteditable="false"` — and the decorations/provenance plugins still resolve finding spans and authorship block classes. `<PmPreview>` (the SSR static render) draws none of those.
**Status:** VERIFIED
**Evidence:** `page.ts:150` (`readonly = root.dataset["readonly"] === "1" && !collabUrl`), `:190-195` (view mounts regardless of session), `:210-219` (decorations refresh is unconditional); phone journey contract asserts `[data-page-host] [contenteditable="true"]` *absence* — not editor absence (steps.ts:1698); PmPreview is decoration-free by construction (`page-editor.tsx:287-290` + `decorations.ts:10-14`).
**Retrieved:** 2026-10-07T22:30:00Z
**Implication for the spec:** Read-only mounts keep the non-editable PM mount (findings spans + authorship overlay parity, cheap — the view exists anyway). A PmPreview-only read path is a deliberate-change option only if PmPreview is extended to render finding decorations — net-new work, not recommended for parity.
**Outline delta:** EXTENDS §5.4 read-only surfaces — names the decoration-parity reason the mount persists.

### F9 — ⌘S is bound twice today; in the merged SPA two live call paths would double-mint restore points

**Claim:** `page.ts:273-279` binds `window keydown` unconditionally → `session?.markRestorePoint()` + pill flip. `ide.ts:848-853`'s dispatcher also answers ⌘S (`restore-point` action) but only emits a `rhema:restore-point` CustomEvent with no consumer — `markRestorePoint` is sent exactly once today. Each send mints a server restore point (`rhema.restore{cause:"named"}` → materialize → `rhema.restore_point` broadcast), so it is not idempotent: two listeners = two points per keystroke.
**Status:** VERIFIED
**Evidence:** `page.ts:273-279`; `ide.ts:848-853`; `apps/collab/src/extension.ts:252-263` (each `rhema.restore` mints + broadcasts `rhema.restore_point`); `packages/ide/src/keymap.ts:77-78,100` (in `input` zone the dispatcher returns `null` for ⌘S — today page.ts's unconditional listener still catches it, e.g. inside the note textarea).
**Retrieved:** 2026-10-07T22:30:00Z
**Implication for the spec:** Exactly one call path must exist. Recommendation: the `PageSessionProvider` owns a `window` keydown identical to `page.ts:273-279` (fires in every focus zone while a writable session is mounted — preserving today's unconditional semantics), and the shell's `restore-point` IdeAction resolves through the session registry (`activeSession?.markRestorePoint()`) **without** a second binding when the provider is mounted. Alternative (single dispatcher + `dispatchIdeKey` `input`-zone amendment so `s` dispatches there too) is cleaner architecturally but changes the tested §5.12 table — recorded as OQ4.
**Outline delta:** CORRECTS A2's open-question-4 framing — "one owner" is a hard requirement, not a preference.

### F10 — The phone/showcase reader posture is server-decided; the flag check must come after it in both modes

**Claim:** `server.ts:4787-4791` (and `:3341-3343` on `/p/:slug`) withholds `collabWsUrl` and sets `readOnly` when `isPhoneRequest(c) || row.showcase` — the journey accept-set asserts SSR-level markers (`data-readonly="1"`, `data-collab-url=""`, `[data-page-banner="readonly"]`, no editable mount). A client-side gate that renders-then-hides fails the DOM-absence asserts.
**Status:** VERIFIED
**Evidence:** `server.ts:4783-4791,3338-3343`; `steps.ts:1683-1709`; `docs/tickets/DEFERRALS.md` D-CAP.3-3 (the leg's accept-set was extended to the P1.19 reader surface); `docs/research/04_test-surface-audit.md` F4 (UA-sniffed withhold is an SSR-mechanics leg).
**Retrieved:** 2026-10-07T22:30:00Z
**Implication for the spec:** On the Page routes the server branch order is: `isPhoneRequest || showcase` → SSR PageEditor (flag-independent) → flag off → SSR + island → flag on → SPA shell. The SPA additionally receives `readOnly`/`collabWsUrl` in its bootstrap payload (server-computed) so a desktop-resized-to-phone viewport never gains an editable mount mid-session.
**Outline delta:** EXTENDS REQ-ISL-11 + §10.1 into the strangler contract.

### F11 — Three dead-code inputs have clear dispositions; `/edit/:draftId/*` routes stay regardless

**Claim:** (a) `data-save-url` is emitted at `page-editor.tsx:319` and read by nothing — `page.ts` has no `saveUrl` reference (the Page's transport is collab-only; there is no markdown POST). (b) `CollabSessionOptions.intent:"ro"` (collab.ts:40,96) appends `?intent=ro` to the WS URL and has no caller — `/v/:n` deliberately attaches write-intent because fork-on-type IS the feature (the frozen_fork auth-refusal flow). (c) `editor.js`/`SourceEditor`/`editor.ts`/`sync-machine.ts` are unrouted (`GET /edit/:draftId` → 302 `/v/:n`), but the `/edit/:draftId/{doc,save,note,cancel-run,revise}` routes are the Page's live transport — `/doc` is the poll; `/note`/`/cancel-run`/`/revise` are the SSR forms (becoming client mutations in the SPA); `/save` is consumed by nothing once `editor.js` is gone.
**Status:** VERIFIED
**Evidence:** `page-editor.tsx:319`; grep shows no `saveUrl`/`save-url` read in `page.ts` (`docs/research/02_island-contract-map.md` F3, OQ3); `collab.ts:40,96`; `server.ts:4935-4963,5007-5033`; `docs/research/01_route-census.md` F8; `docs/research/02_island-contract-map.md` F6, REQ-ISL-16.
**Retrieved:** 2026-10-07T22:30:00Z
**Implication for the spec:** Recommendations (spec-level open questions §8): drop `data-save-url` from emitted markup; drop `intent:"ro"` unless a read-only collab-attach surface is spec'd (restore is a 4-line revert); drop the `editor.js`/`SourceEditor`/`editor.ts`/`sync-machine.ts` island stack (resurrecting Source mode would be a *new feature*, not a port) while keeping all `/edit/:draftId/*` routes — with `/save` itself flagged for a keep/drop decision (it is also a plausible HTTP-save fallback seam if one is ever spec'd; recommend keep until that question is closed).
**Outline delta:** EXTENDS A1 F8 + A2 OQ1-3 into concrete dispositions.

### F12 — `installOriginDispatch`'s non-reentrancy is a prod-caught invariant, and the multi-tab question stays "as today"

**Claim:** `installOriginDispatch` must apply the transaction directly (`view.updateState(view.state.apply(tr))`) — calling `view.dispatch` inside `dispatchTransaction` re-enters the hook and blew the stack on the first keystroke in prod (EDIT.1/N8); the happy-dom regression test drives a real `EditorView`. Separately, two tabs on the same draft each hold provider + IDB store with no explicit coordination beyond y-indexeddb's implicit broadcasts — today's behavior, unverified-as-a-defect.
**Status:** VERIFIED
**Evidence:** `page.ts:112-130` (comment + implementation); `apps/web/src/client/page-dispatch.test.ts:16-54`; `docs/research/02_island-contract-map.md` OQ6.
**Retrieved:** 2026-10-07T22:30:00Z
**Implication for the spec:** The hook ports verbatim into the shared mount module (not re-created inside a component); its test ports as a happy-dom test against that module. Multi-tab: spec names current behavior verified-unchanged (a per-tab session registry changes nothing cross-tab).
**Outline delta:** CONFIRMS REQ-ISL-7's capture half; EXTENDS with the test-port requirement.

## Design

### 1. Binding decision — hand-rolled mount (option (c))

**Recommendation: option (c), the wrapped `useRef`+`useEffect` mount.** Isolation principle, stated as a spec rule: **React never re-renders the PM surface.** Concretely:

- `EditorView` is created exactly once per mount inside a `useEffect` over a `<div ref>` child of `[data-page-host]`; the view instance lives in a ref/effect scope, never in `useState` (and never as an effect *dependency*).
- `EditorState` lives in the session-registry entry (F5) — it is DOM-free and survives unmount; the view is recreated from it on remount.
- All doc-adjacent updates are imperative calls on the view (`dispatch`, `setProps`, `setDecorationInputs`), issued from effects or event handlers — never from render output. The only React child ever inside `[data-page-host]` is the pre-mount `<PmPreview>` sibling, which unmounts the render before/at view bind (today's `preview?.remove()`, declarative).
- Nothing else touches the PM-managed subtree: decorations are DOM owned by the decorations plugin; remote updates are DOM owned by ySyncPlugin. React reads doc state through plugin keys (`provenanceKey.getState(view.state)`, `statusMeters(view.state.doc)`), not through the DOM.

Option (a) rejected (F2): the maintained library *is* a React reimplementation of prosemirror-view — it violates the isolation principle by construction and re-risks the EDIT.1 dispatch/ySyncPlugin/decorations pipeline on the flagship surface. Option (b) rejected (F3): re-wrapping a tested schema-first core as TipTap extensions buys nothing the contract needs. Revisit (a) only if a real requirement for React-authored node views appears (none today — decorations are class/attr sidecars).

### 2. Component tree — the PM/React boundary

```
<PageSurface>                          // route component: /p/:slug · /p/:slug/v/:v · /p/:slug/a/:id
  <PageSessionProvider draftRef>       // registry acquire/release; owns session + EditorState + lifecycle
    <SyncPill/>                        // data-sync-pill + data-sync-state + role=status aria-live + verbatim labels
    <VersionBanner/>                   // data-page-banner="version"; forkFmt template on onFork
    <LockBanner lock onCancelRun/>     // data-page-banner="lock"; cancel → mutation POST /cancel-run
    <ReadOnlyBanner/>                  // data-page-banner="readonly" (artifact / SSR-forced reader)
    <ProposalsRail proposals/>         // data-proposal-card …; accept → acceptProposalTr dispatch
    <PageHost>                         // data-page-host + data-readonly
      {viewMounted ? null : <PmPreview docJson/>}   // data-page-preview — no-JS floor + SPA pending paint
      <div ref={hostRef}/>             // the PM mount point; EMPTY in React forever after
    </PageHost>
    <FindingsRail findings dangling/>  // data-findings-rail + data-finding-id + data-lost + data-lost-note
    <NoteForm/>                        // POST /note → client mutation (Guidance row; was SSR form POST)
    <StatusMeters/>                    // data-status-words/readmin/venue + data-fmt (shell status bar slots)
  </PageSessionProvider>
</PageSurface>
```

**PM owns:** everything inside the host div post-mount — `.ProseMirror` DOM, `contenteditable`, doc structure, decorations (`rm-finding*`, `rm-author-*`, `rm-proposal-target`, suggestion previews), drop/gap cursor, selection, input rules, remote-caret updates.
**React owns:** all chrome state — pill (`CollabSyncEvent` + `lockedOverride`), banners (lock, version/fork, readonly), proposals list, findings list (incl. `lost` resync), meters, note form, and the *inputs* pushed to PM (decorations inputs, editable flag, provenance flush cadence).
**Boundary rule:** PM plugin state is read via plugin keys and written via transaction meta; React state changes that must reach PM go through an effect bridge (`editable` read from a mutable ref + empty-`tr` re-read, `setDecorationInputs` on input change). No React element mounts inside the host after mount.

### 3. The four durability layers in React lifecycle — `PageSessionRegistry`

Module-scope registry (framework-free, lives beside `collab.ts` — e.g. `apps/web/src/spa/page-sessions.ts`):

```
registry: Map<"draft:<draftId>", { session|null, state: EditorState, refs: number, destroyTimer? }>
acquire(key, init) → refs++  ·  release(key) → refs-- ; at 0: flush + schedule TTL destroy
rekey(oldId, newId)           // session.rebind — the frozen_fork path re-keys the entry
IDLE_TTL ≈ 120 s · LRU cap ≈ 4 drafts
```

- **Layer 1–3 (Y.Doc / y-indexeddb / provider):** owned by `CollabSession` inside the registry entry — created on first acquire, survive unmount within TTL, destroyed on TTL expiry (provider.destroy → idb.destroy → doc.destroy, `collab.ts:219-223`).
- **Layer 4 (server materialization):** unchanged — rides the same WS; no client action.
- **Rebind:** `session.rebind(newDraftId)` (same Y.Doc, fresh provider, IDB re-home+clear — collab.ts:201-218) + `rekey` so a later acquire of the child hits the live entry. The `EditorView` is *not* rebuilt — identical to today.
- **Route-leave = pagehide-equivalent:** at `refs → 0`, run today's pagehide sequence — pending provenance flush + `rhema.restore{cause:"blur"}` + `provider.pageHide()` (`page.ts:354-358`, `collab.ts:195-200`). Real `pagehide`/`visibilitychange:hidden` do the same via window listeners on the provider, plus full destroy on actual unload.
- **StrictMode:** React 18 dev double-mount acquires/releases/re-acquires — refcount handles it (release at 0 only *schedules* the TTL destroy; the immediate re-acquire cancels it). Never destroy synchronously in cleanup.
- **EditorState in the registry** (F5): remount binds `new EditorView(host, {state: entry.state, editable: editableRef})` — undo stack, plugin state, and decorations survive intra-app navigation (a genuine improvement over today's reload-everything world, at zero risk).

### 4. Decorations + provenance — what lives where

- **React state (inputs):** `findings` (bootstrap + poll-patched `lost`), `authorshipOn` (shared store — F7/REQ-ED-15, localStorage key `rhema:authorship:v1:<projectId>` unchanged, `rhema:authorship` CustomEvent still dispatched as the broadcast), `proposals`, `locked`/`readonly` flags.
- **PM plugin state (derived):** the `DecorationSet`, the provenance `sources`/`agentSpans` — never mirrored into React.
- **Bridge:** `useEffect` on `[findings, authorshipOn]` → `setDecorationInputs(view, {findings, authorship: on && prov ? authorshipClasses(prov) : null})` — the `page.ts:210-219` `refreshDecorations` verbatim as an effect.
- **`installOriginDispatch`:** moves verbatim into the mount module (F12); `armed` reads a `pasteArmed` ref set by the `view.dom` paste listener; `onDocChanged` → `setMeters(statusMeters(view.state.doc))` (throttled to a frame) + arm the 600 ms `provTimer` → `session.sendProvenance({spans: provenanceForSave(state), agentSpans: …})` (`page.ts:254-270`).
- **Proposals:** accept = `view.dispatch(acceptProposalTr(view.state.doc, view.state.tr, proposal))` + remove the card from React state; reject = remove only (`page.ts:222-239`). The agent-origin exclusion from human undo is unchanged (`addToHistory:false`).

### 5. Findings rail + keymap interface (C2 owns the keymap; this row owns the editor-side contract)

- **Focus zone:** keep the DOM contract — the mounted view is inside `[data-page-host]` and carries `.ProseMirror`, so the shell's `focusZone()` (`activeElement.closest(".ProseMirror") → "page"`) works verbatim on the React render (`ide.ts:661-669`, `keymap.ts:110-112` inert-bare-keys rule preserved). No code change needed in the ported dispatcher; optionally expose an explicit `PageFocusContext` later.
- **Linked selection:** the rail rows keep `data-finding-id`/`data-lost`/`data-severity`; `selectFinding` scroll targets `.rm-page-host [data-finding-id]` — decoration spans carry the same attr (`decorations.ts:114`), so the scroll-into-view works unchanged.
- **⌘S:** one owner per F9 — provider-owned window binding (unconditional, today's semantics); shell `restore-point` action delegates to the active session via the registry (no second binding).
- **`rhema:finding-action`:** keep emitting on cards (bubbles) — currently unlistened, spec'd surface (A2 OQ7).
- **Deep-link focus:** `data-focus-finding` → route search param (`?focus=` or `?f=`); an effect scrolls `[data-finding-id="<id>"]` on mount (`page.ts:347-350`).

### 6. Parity checklist vs `page.ts` — the ticket's acceptance contract

Every line-range behavior, classified **PORT** (must preserve) or **DELIBERATE CHANGE** (spec-named difference):

| # | Behavior (page.ts) | Verdict |
|---|---|---|
| 1 | Mount gating on `[data-page-root]` + `data-doc-url`/`data-draft-id`/`script[data-page-doc]` presence (:133-147) | DELIBERATE CHANGE — inputs arrive from a BFF bootstrap fetch + route params; embedded `script[type=json]` blobs exist only in SSR mode. `docJson` derived client-side via `markdownToDoc` (same code as `page-data.ts:637`). |
| 2 | `data-collab-url` branch → `createCollabSession` vs `createPageState` local-history mount (:150,155-175,190-195) | PORT — same branch on `collabWsUrl` prop. |
| 3 | Session callbacks `onSync/onFork/onReadOnly/onRestorePoint` (:157-174) | PORT — callbacks become provider→React state writes. |
| 4 | `rebase()` — docUrl rewrite + dataset + `session.rebind` (:178-184) | PORT — state + registry `rekey`; route URL updated only when the route itself encodes the draft (it doesn't — `/v/:n` is display version; draftId is data). |
| 5 | `toBlockSource` kind-guard + `initSources` map (:97-110,187-188) | PORT verbatim. |
| 6 | View mount + `.rm-page` + `data-page-view=1` + `preview.remove()` (:190-198) | PORT — mount effect + conditional `<PmPreview>`; emitted DOM identical. |
| 7 | `editable: () => !locked && !readonly` re-read per tr (:194) | PORT — `editable` reads a mutable ref; lock flips dispatch `view.state.tr` (the empty-tr re-read, :171,:285). |
| 8 | Paste one-shot arm (:203-207) | PORT verbatim. |
| 9 | `installOriginDispatch` non-reentrant apply + `onDocChanged` (:117-130,264-270) + happy-dom test | PORT verbatim; test moves to the shared mount module (F12). |
| 10 | 600 ms provenance piggyback `sendProvenance` (:254-262,267-268) | PORT verbatim. |
| 11 | ⌘S → `markRestorePoint` + pill syncing (:273-279) | DELIBERATE CHANGE — single-owner binding per F9 (behavior identical to user; double-binding bug removed). |
| 12 | `setPill` + `lockedOverride` precedence + `data-label-*`/`{n}` templates (:54-78) | PORT — React state; labels from the same COPY source; verbatim vocabulary; `data-sync-state` emitted. |
| 13 | `setLockBanner` writer/reader `{workflow}` templates + cancel form (:80-86) | PORT — React banner; cancel becomes a client mutation POSTing the same route. |
| 14 | `showForkBanner` `forkFmt` `v{n}`/`v{base}` (:88-94) | PORT — React state on `onFork`. |
| 15 | `refreshDecorations` + `rhema:authorship` listener + `[data-ide]` dataset read (:210-219) | DELIBERATE CHANGE — authorship flag comes from a shared store (same localStorage key; CustomEvent retained as the broadcast). |
| 16 | Proposal cards accept/reject wiring (:222-239) | PORT — React renders the cards; accept dispatches `acceptProposalTr`. |
| 17 | Status meters `data-status-*` + `data-fmt` (:242-249) | PORT — React meters in the status-bar slots; same emitted attrs. |
| 18 | `applyLock` + `lockedOverride` + `data-locked` (:281-289) | PORT — lock state; still needs the empty-tr for `editable` re-read + decoration remap. |
| 19 | 10 s visible-only lock poll: fetch `docUrl` `accept:json` → rebase, banner, applyLock, syncRail, venue (:291-308,340) | PORT — TanStack Query `refetchInterval:10_000`, `refetchIntervalInBackground:false`, `refetchOnWindowFocus`-equivalent on visibilitychange→visible; same route. |
| 20 | `syncRail` lost badges + findings `lost` sync + decoration refresh (:310-338) | PORT — poll result patches React findings state; rail renders it; effect pushes decorations. |
| 21 | `visibilitychange`: hidden→`flushOnHide`, visible→poll (:341-344) | PORT — provider effect listeners. |
| 22 | `data-focus-finding` scroll (:347-350) | PORT — search-param-driven mount effect. |
| 23 | `pagehide`: flushProvenance + `flushOnHide` + clearInterval (:354-358) | PORT — registry release + window listeners (F5; extends to route-leave). |
| 24 | No Save button, no `beforeunload`, no `sendBeacon`, no markdown POST (:7-11) | PORT — architectural invariant; spec'd as REQ-ED + REQ-ISL-2/3. |
| 25 | `onReadOnly` → `locked=true` + empty tr (:167-172) | PORT — state → ref + empty tr. |
| 26 | `onRestorePoint` → pill synced (:173) | PORT. |
| 27 | `data-save-url` emitted, unread (page-editor.tsx:319) | DELIBERATE CHANGE — dropped (OQ3/F11). |
| 28 | `PageDocResponse`/`readJson` embedded-blob readers (:34-52,144-146) | DELIBERATE CHANGE — typed bootstrap DTO instead of `script[type=json]` scraping in SPA mode; SSR mode keeps them. |
| 29 | Read-only mounts still mount non-editable PM (:149-150,190-195) | PORT per F8 (the PmPreview-only option is the alternative; not recommended). |

### 7. Dual-mode SSR contract + flip ordering (Q-5 strangler)

**Recommendation: the Page flips last.** It is the flagship surface, carries the deepest emitted-DOM contract (F7), owns the only WebSocket, and its journey legs (N8 edit/fork/save, P1 phone reader) are the migration's most intricate probes. Suggested intra-surface order (input to D3): outline → landing → ide-shell chrome → **Page last**.

Route-handler branch order on `/p/:slug`, `/p/:slug/v/:v`, `/p/:slug/a/:id` (both modes):

1. `isPhoneRequest(c) || showcase` → **SSR `PageEditor`** (readOnly, `collabWsUrl` withheld) — flag-independent forever (F10; no-JS floor REQ-ISL-11; §10.1 DOM-absence asserts).
2. flag off → existing SSR document + `<script defer /assets/page.js>` island (today's path, untouched).
3. flag on → SPA shell document; client route resolves → bootstrap fetch → `<PageSurface>`.

Bootstrap contract (one read, replaces doc-embed + resolve + `data-*` config): a BFF endpoint returning `{resolved:{draftId,draftN,state,origin,baseDraftN}, doc: EditorDocDto (exact semantics — the SSR loader used `{exact:true}`, `page-data.ts:632`), collabWsUrl|null, readOnly: server-computed, focusFindingId?}`. Today's `/edit/:draftId/doc` stays the *poll* route verbatim (it lacks `exact` — the poll wants follow-child semantics). Forms (`/note`, `/cancel-run`, `/revise`) become client mutations hitting the same routes; flash params (`?noted=1`, `?restored=`) become route search params. The SSR-mode `script[data-page-doc|prov|findings]` embeds + `\u003c` escaping constraint exist only in SSR mode — they do not cross into the SPA.

### 8. Dead-code dispositions (spec open questions, with recommendations)

| Item | Evidence | Recommendation |
|---|---|---|
| `editor.js` / `SourceEditor` / `editor.ts` / `sync-machine.ts` | unrouted (`server.ts:4935-4949` 302s); built+served+tested today | **DROP** the island + component + its two test files in the SPA wave; Source mode's return would be a new-feature spec, not a port. Keep `/edit/:draftId/*` routes (REQ-ISL-16). `sync-machine.ts` drops with it unless an HTTP fallback transport is spec'd. |
| `intent:"ro"` (collab.ts:40,96) | implemented, no caller; `/v/:n` needs write-intent (fork is the feature) | **DROP** unless a read-only collab-attach ("observe") surface is spec'd; restoration is a 4-line revert. |
| `data-save-url` (page-editor.tsx:319) | emitted, unread; Page transport is collab-only | **DROP** the attribute. `/save` route: **KEEP** pending the fallback-transport decision (it is the only plausible HTTP-save seam; dropping is a separate cleanup once that question closes). `/doc`,`/note`,`/cancel-run`,`/revise` stay regardless. |

## Open questions

1. **Source mode** — drop `editor.js`/`SourceEditor`/`sync-machine.ts` outright (recommended), or spec a markdown-source mode as a new SPA feature? `/edit/:draftId/*` routes survive either way.
2. **`intent:"ro"`** — remove the dead option (recommended), or wire it for a real read-only collab attach (e.g., a spectator/co-read surface)? No consumer exists; `/v/:n` intentionally keeps write-intent.
3. **`data-save-url` + `/save`** — prune the attribute (recommended); then does the `/save` route stay as a latent HTTP-fallback seam or get removed with SourceEditor's tests? (Recommend keep until the fallback question is answered; it is also the text/plain beacon target.)
4. **⌘S ownership** — provider-owned unconditional `window` binding + shell-delegation through the registry (recommended; zero change to `dispatchIdeKey`'s tested table) vs. making the shell dispatcher the sole caller and amending `dispatchIdeKey`'s `input`-zone narrowing so `s` dispatches there too. Both satisfy REQ-ED-7; pick one.
5. **Read-only mount shape** — keep the non-editable PM mount on artifact/phone/showcase/SSR-reader paths (recommended — findings/authorship decorations parity, F8) vs. `PmPreview`-only (requires extending PmPreview to render finding spans; new work, regression risk).
6. **Poll → push** — keep the 10 s visible-only `/doc` poll verbatim under REQ-ISL-5 (recommended for this pass), or spec a push channel as a follow-up?
7. **Registry sizing** — proposed `IDLE_TTL ≈ 120 s`, LRU cap ≈ 4 drafts; confirm the memory bound (each entry holds Y.Doc + IDB + open WS).
8. **`rhema:finding-action` consumer** — keep emitting for a future anchored-composer listener (recommended keep; currently unlistened).
9. **`@y/prosemirror` (Yjs 14)** — the upstream binding rewrite; when/if adopted it is a client+server lockstep change (`apps/collab` uses the same pair). Defer past the migration; dependency-policy owner needed.
10. **Multi-tab collab** — today's implicit y-indexeddb cross-tab behavior is unchanged; name it verified-as-is or spec coordination?

## Spec requirements emitted

- **REQ-ED-1** — The Page's PM surface mounts via a ref-managed host div inside `[data-page-host]`; the `EditorView` is created once in a mount effect and lives outside React state; **React never re-renders the PM surface** — no React children inside the host after mount, all doc-adjacent updates imperative (`dispatch`/`setProps`/transaction meta). The sole exception is the pre-mount `<PmPreview>` sibling, unmounted when the view binds.
- **REQ-ED-2** — The binding is the hand-rolled mount; `@handlewithcare/react-prosemirror` (ex-`@nytimes/react-prosemirror`) and TipTap are explicitly rejected for this surface (F2/F3 rationale). Revisit only if React-authored node views become a requirement.
- **REQ-ED-3** — `collab.ts` moves verbatim as a framework-free module: doc name `draft:<id>`, IDB `rhema-page/draft:<id>`, cookie-auth upgrade, the `rhema.provenance`/`rhema.restore{cause,label}` outbound and `rhema.fork`/`rhema.readonly`/`rhema.restore_point`/`frozen_fork` inbound vocabulary, and rebind-keeps-the-Y.Doc semantics (REQ-ISL-4) — unchanged.
- **REQ-ED-4** — Session identity is a module-scope `PageSessionRegistry` keyed by `draft:<draftId>` with acquire/release refcounting, an idle-destroy TTL, and `rekey` on `rebind`; each entry holds the `CollabSession` AND the `EditorState` so intra-app unmount/remount preserves doc, undo stack, and plugin state (StrictMode-safe).
- **REQ-ED-5** — Route-leave is a pagehide-equivalent: at refcount 0 (and on real `pagehide`/`visibilitychange:hidden`) the pending provenance flush, `rhema.restore{cause:"blur"}`, and `provider.pageHide()` run before the idle-TTL destroy; there is no `beforeunload` prompt and no Save verb other than ⌘S.
- **REQ-ED-6** — The Page route's emitted-DOM contract is preserved verbatim in both modes: `data-page-root`/`data-page-mount`/`data-page-host`/`data-readonly`/`data-collab-url` (empty string when absent)/`data-page-view` on the mounted view/`data-page-preview`/`data-sync-pill`+`data-sync-state`/`data-page-banner={version,lock,readonly}`/`data-findings-rail`/`data-finding-id`/`data-lost`/`data-lost-note`/`data-proposal-card`+accept/reject/`data-status-{words,readmin,venue}`/`data-fmt`/`data-edit-source`/`data-phone-blocked`/`.rm-page`/`.ProseMirror`, and `[contenteditable="true"]` never present at phone width.
- **REQ-ED-7** — Exactly one call path reaches `markRestorePoint` per ⌘S (double-mint is a defect); the binding fires in every focus zone while a writable session is mounted; the §5.12 `restore-point` IdeAction resolves to the same call.
- **REQ-ED-8** — `installOriginDispatch` ports verbatim into the shared mount module: apply the tr directly (never re-enter `view.dispatch`), the one-shot `pasted` arm, `onDocChanged` → meters + 600 ms provenance piggyback; its happy-dom regression test moves with it.
- **REQ-ED-9** — Decorations stay PM-plugin sidecar state fed by `setDecorationInputs` transaction meta; React owns only the inputs (findings incl. `lost` resync, authorship toggle, proposals); findings re-resolve on every edit; nothing document-adjacent is mirrored into React state.
- **REQ-ED-10** — Undo/provenance separation is preserved: collab mount = `ySyncPlugin`+`yUndoPlugin` (peer edits never enter local undo); proposal accept = one `ORIGIN_META=agent:*` tr with `addToHistory:false`; non-collab mount = `history()`; `human`/`pasted`/agent stamping via `ORIGIN_META`.
- **REQ-ED-11** — The §6.3 contract ports with identical semantics: 10 s visible-only same-origin `/doc` poll, immediate poll on visibilitychange→visible, rebase on returned `draftId`, lock→editable flip + writer/reader banner + pill (`lockedOverride` precedence), rail `data-lost` resync, `data-status-venue` update.
- **REQ-ED-12** — The phone/showcase reader posture stays server-decided: `isPhoneRequest`/`showcase` renders the SSR `PageEditor` read-only surface (no collab wire, no editable mount) *before* the feature-flag branch is consulted — in both migration modes.
- **REQ-ED-13** — The Page route flips last in the strangler order; until then SSR+island is the default render; the SPA bootstrap is a single endpoint returning resolved draft ref + exact `EditorDocDto` + `collabWsUrl` + server-computed `readOnly`.
- **REQ-ED-14** — `<PmPreview>` remains the no-JS read view and becomes the SPA pending-state paint; SPA `docJson` is derived client-side via `markdownToDoc` (the SSR-embed code path), so the `script[data-page-doc]` embeds and the `\u003c`-escape constraint exist only in SSR mode.
- **REQ-ED-15** — The authorship overlay toggle persists to `localStorage[rhema:authorship:v1:<projectId>]`, broadcasts `rhema:authorship`, and is read by the editor through a shared store (not `[data-ide]` DOM); the shell's focus-zone detection keeps working via the preserved `.ProseMirror`/`[data-page-host]` DOM contract.
- **REQ-ED-16** — Dead-code dispositions ship in the migration PR set: `data-save-url` removed from emitted markup (no consumer; OQ3); `intent:"ro"` and the `editor.js`/`SourceEditor`/`sync-machine.ts` stack dispositioned per OQ1/OQ2 (recommended: drop); `/edit/:draftId/{doc,note,cancel-run,revise}` routes preserved (REQ-ISL-16).
