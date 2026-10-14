# 24_spa-ux-design-system — UX goals + design-system scope for the SPA

**Stream:** C
**Researched:** 2026-10-07
**Author:** explore-subagent (design worker, row C1)
**Ledger rows covered:** C1
**Confidence overall:** high

Row C1 asks four things: what "snappy, modern" concretely means for this app; how much design-system surface the migration needs under the operator's **port + polish** decision (Q-4); the a11y contract at the ⚑ WCAG 2.2 AA floor; and how the §10.1 phone posture and the copy/vocabulary gates survive a client-rendered app. The headline: this repo already has a design system — a generated-CSS-over-tokens pipeline with a tested contrast contract and an attribute-driven state model — and the correct scope is to **carry it, formalize its ad-hoc half, and spend the polish budget on interaction debt**, not to adopt a new styling stack.

## Findings

### F1 — Interaction debt is enumerable; every item maps to a named SPA mechanism

**Claim:** The "snappy" ask decomposes into six concrete taxes the SSR+islands app pays today, each with a specific fix under the chosen TanStack Router + Query stack (Q-2):

| Debt today | Evidence | SPA mechanism |
|---|---|---|
| Full-document reload on every navigation — every link is a plain `<a href>`; `renderDocument` re-renders head + shell + islands per route | `packages/ui/src/primitives.tsx:147-165` (ActionLink); `apps/web/src/render.tsx:115-178` | Client routing; the IdeShell mounts once per project context instead of re-booting per document |
| Form-POST → 302 → `?flash` reload cycle on all ~70 mutations — scroll + focus lost, flicker, re-mount of every island | `docs/research/01_route-census.md` F5; `docs/research/03_data-layer-audit.md` F7 | `useMutation` + cache invalidation; flash tokens become structured mutation responses (REQ-DAT-3); the `?saved`/`?disposed`/… URL vocabulary survives for deep links |
| Skeleton-less transitions — `ShellSkeleton`/`.ide-sk-row` exist but no route renders them; SSR blocks the document instead | `packages/ui/src/ide-states.tsx:62-70`; grep shows `ShellSkeleton` referenced only by `ide-states.tsx`, its own test, and `index.ts` — unrouted | Per-route `pendingComponent` renders the named-region chrome + skeleton rows immediately |
| 10 s visible-only lock/doc poll — a run grabbing or releasing the draft shows up to 10 s late; the findings-rail `data-lost` resync rides it | `apps/web/src/client/page.ts:31` (`LOCK_POLL_MS`), `:292-308` (poll), `:310-338` (`syncRail` DOM patching) | Query `refetchInterval` (visible-only) as floor; the project-scoped SSE feed can invalidate on `run.*` events to beat the SLA |
| Per-document EventSource — the feed stream is created and torn down per page load; `?after=<seq>` resume replays | `apps/web/src/client/ide.ts:1102-1125` | One project-scoped SSE subscription living above the route tree; feed rows become state |
| Meta-refresh self-polls (import preview 5 s; `/billing/return` 30 s window); bespoke `var R={…}` inline recompute script on the run sheet | `render.tsx:126-130`; `docs/research/04_test-surface-audit.md` F4 | `{pending, pollAfterSeconds}` payload → `refetchInterval` (REQ-DAT-14); the run sheet becomes reactive form state |

Secondary wins the port should bank: prefetch-on-intent for the primary nav targets (project rows, palette go-to rows, Timeline next-step — TanStack `preload:"intent"`); palette data fetched once per project rather than re-embedded per document; one ⌘S owner (the ide.ts `rhema:restore-point` dispatch and page.ts `rhema.restore` merge, A2 open question 4); per-route scroll restoration (the Page scrolls inside `.ide-page`, not the window).

**Status:** VERIFIED
**Evidence:** as tabled; island mechanics from `docs/research/02_island-contract-map.md` F3/F5/F9.
**Retrieved:** 2026-10-07T22:30:00Z
**Implication for the spec:** "snappy" should be written as a per-debt-item contract (no document reloads inside auth'd routes; pending skeletons per surface; optimistic/pending-in-place mutations; ≤10 s lock-visibility SLA preserved or improved), not as an aesthetic adjective.
**Outline delta:** EXTENDS the brief's "snappy, modern" goal into an enumerable acceptance list.

### F2 — The styling system is a generated-CSS-over-tokens pipeline; there is no CSS framework to replace

**Claim:** All CSS reaches a document as two `<style>` blocks generated from typed token maps — `themeCss()` (palette/spacing/typography/motion/print/reduced-motion, always emitted) and `ideCss()` (the §5.1 pane system + Page/PM chrome, IDE docs only) — plus ~1,600 inline `style={{}}` call sites reading `var(--*)` and a set of semantic classes (`.ide-*`, `.paper`, `.rm-*`, `.ide-pill`, `.ide-state`, `.ide-banner`, `.ide-menu`, `.ide-palette`, `.ide-cmdmenu`, `.ide-cheatsheet`, `.sr-only`, `.tnum`, `.table-scroll`, `.rhema-pulse`). No Tailwind, no CSS-in-JS runtime, no CSS Modules exist in the repo.
**Status:** VERIFIED
**Evidence:** `packages/tokens/src/tokens.ts:13-52` (DARK_VARS), `:60-95` (LIGHT_VARS, every dark key defined), `:152-247` (SPACING/RADIUS/TYPOGRAPHY/LAYOUT/MOTION); `theme-css.ts:53-161` (the generator incl. `:focus-visible` ring at :116 and the reduced-motion collapse at :152-153); `ide-css.ts:18-292`; `render.tsx:89-91,176` (injection); `primitives.tsx:5-6` ("Styling is inline against the §5.9 CSS custom properties … so a single injected stylesheet themes the whole SSR document"); grep counts `style={{` — 724 in `packages/ui/src`, 884 in `apps/web/src/pages.tsx`; `apps/web/package.json:23-59` (no styling dep); `contrast.test.ts` pins AA ratios per token pair.
**Retrieved:** 2026-10-07T22:30:00Z
**Implication for the spec:** The token layer needs zero porting — `themeCss()`/`ideCss()` emit strings; they inject once into the SPA shell document (or ship as a Vite-imported `.css` asset, same bytes). Inline styles are already React style objects — they work identically client-side.
**Outline delta:** CONFIRMS the brief's "tokens exist in `@rhema/tokens`" and upgrades it to "the whole stylesheet already is tokens."

### F3 — `data-*` attributes are a triple-use contract: CSS state, island wiring, journey probes

**Claim:** The same attributes drive (a) CSS (`ideCss()` selectors like `.ide[data-files='open'] …`, `[data-theme]`, `[data-paper]`, `[data-margin='ticks']`), (b) island behavior (`data-page-root`, `data-feed-events`, `data-palette`, `data-sync-pill`, `data-desk-tab`), and (c) ~90 Playwright journey probes (`data-run-card`, `data-phase-status`, `data-gate-actions`, `data-phone-blocked`, `data-inbox-*`, …). REQ-TST-2 (A4) already requires this emitted-DOM contract be published.
**Status:** VERIFIED
**Evidence:** `ide-css.ts:31-159` (attribute-driven pane/view CSS); `docs/research/02_island-contract-map.md` per-island contract table; `docs/research/04_test-surface-audit.md` F4 (the ~90-hook enumeration + "selector renames ship as codemod + registry update in the same PR").
**Retrieved:** 2026-10-07T22:30:00Z
**Implication for the spec:** Attribute-driven state stays the mechanism — a React port emits identical `data-*` + `.ide-*` markup so the generated CSS, the journey suite, and ported island behaviors (e.g. `focusZone()`'s DOM probes at `ide.ts:661-669`) all keep working. This is also why hashed-class styling (CSS Modules default) is a poor fit: the selector contract must stay literal.
**Outline delta:** CONFIRMS REQ-TST-2; EXTENDS — the `data-*` contract is load-bearing for CSS state, not only tests.

### F4 — Recommendation: keep the current approach formalized; reject Tailwind and CSS Modules

**Claim:** Matching repo conventions argues against both alternatives: **Tailwind** would introduce a second token language duplicating the `--shell-*`/`--sev-*`/`--kind-*`/`--state-*` scale (breaking the "one source of §5.9 values" invariant that keeps `contrast.test.ts` authoritative), and utility classes cannot express the attribute-driven pane selectors that are the contract (`[data-files]`/`[data-margin]`/`[data-view]`/`[data-desk-tab]` drive layout with zero JS); **CSS Modules** hashes the semantic class names journeys and `focusZone()` key on, and adds a build convention for a problem inline styles don't have. The real debt is narrower: inline `style={{}}` cannot express `:hover`/`:focus`/`@media` per-element, so controls lack hover affordances and per-component responsive rules — fixable by extracting the top repeated inline patterns (banners, cards, buttons, form fields) into generated classes in a `@rhema/tokens` component-CSS layer, next to `themeCss`/`ideCss`.
**Status:** VERIFIED (as analysis of verified code state; the recommendation is design judgement)
**Evidence:** `tokens.ts:2-4` ("one source of §5.9 values"); `ide-css.ts` attribute selectors throughout; `primitives.tsx` / `shell.tsx` inline-only patterns (hover absent — `ide-rail a:hover` exists only in generated CSS at `ide-css.ts:25`); `04_test-surface-audit.md` F4.
**Retrieved:** 2026-10-07T22:30:00Z
**Implication for the spec:** Design-system scope for the port = (a) keep `themeCss`/`ideCss` verbatim; (b) add one generated component-class sheet for repeated patterns needing pseudo-states; (c) keep semantic class names + `var(--*)` inline styles for one-offs; (d) no utility framework. That is "port + polish" scoped.
**Outline delta:** CORRECTS any implicit "adopt a modern CSS framework" reading of the brief.

### F5 — Today's a11y floor is markup/CSS-borne; the SPA's unique hazard is focus management on route change

**Claim:** REQ-IDE-42's commitments are implemented: a global 2-px accent `:focus-visible` ring; landmarks (`nav` rail, `aside` Margin `role="complementary"`, `main` Page, `footer` status bar); polite live regions on the sync pill (`role="status"`), feed panel, chat log, triage progress, restored-notice; the spend gate is `role="alert"` (assertive); `.sr-only` utility; `prefers-reduced-motion` collapses all motion to 1 ms; contrast is unit-tested per token pair (`contrast.test.ts`, ADR-070 retunes); target sizes ≥24 px baseline / ≥44 px for the §10.1 phone inputs (WCAG 2.5.8); `.table-scroll` is a focusable horizontal-scroll region (WCAG 1.4.10 — the page never scrolls horizontally); the Desk findings table is the screen-reader surface while Margin decorations are aria-hidden. Automation exists only as journey step P1's axe injection; there is no component-level a11y test stack. There is **no skip-link today**.
**Status:** VERIFIED
**Evidence:** `theme-css.ts:116-120` (ring + `.table-scroll` + `.tnum`), `:152-153` (reduced-motion); `ide-css.ts:111-151` (target sizes, phone block), `:230` (`.sr-only`); `page-editor.tsx:333-341` (pill `role="status"`); `ide-shell.tsx:195-204,244,297-315,368` (landmarks, tablist, live feed panel); `ide-states.tsx:97,116,133,157,173,193` (status/alert/alertdialog roles); `findings-desk.tsx:143`, `version-rail.tsx:303`, `chat-panel.tsx:270` (live regions); grep for `skip` across `apps/web/src/*.tsx` + `packages/ui/src` finds no skip-link; `04_test-surface-audit.md` F8 (axe only in journeys; no RTL/jsdom stack).
**Retrieved:** 2026-10-07T22:30:00Z
**Implication for the spec:** Porting preserves the floor almost for free (the markup IS the contract). The SPA adds four net obligations SSR never had: per-route `document.title` (N10/`render.test.tsx` pin titles), focus management on client navigation (a polite route-announcer live region + focus to the surface's heading — never into the ProseMirror surface), focus restoration when palette/menus/modal close, and scroll restoration. The polish budget should add the missing skip-link ("Skip to Page") — seven regions of chrome precede the Page.
**Outline delta:** CONFIRMS the ⚑ floor; EXTENDS with the SPA-specific hazard list.

### F6 — Phone posture is device-class (UA/CH-UA), not width — the DOM-absence contract decides the answer (REQ-DAT-11)

**Claim:** `isPhoneRequest` sniffs `sec-ch-ua-mobile: ?1` OR `Mobi|iPhone|Android` in the UA at SSR and produces render-time *capability* decisions: `PageData.compact`, Page `readOnly` + collab wire withheld, outline `editable` downgrade, and `PhoneBlockedNote` replacing every §10.1 ✗ surface (run-start, ingestion, export, new project, diffs, billing, voice building, approval-field editing). The journeys assert **DOM absence** under a mobile UA — a `display:none` gate fails them; a React conditional render satisfies them only if the flag is known before first render. Layout at <768 px is a *separate* axis already handled by the `ideCss()` media ladder (phonebar, `.ide-phone-only`, 44-px targets).
**Status:** VERIFIED
**Evidence:** `server.ts:5674-5680` (the sniff), `:538,965,1039,1119,3340-3343,4787-4791` (consumption); `page-data.ts:451-452` (`compact`); `pages.tsx:168-177` (`PhoneBlockedNote`); `ide-css.ts:135-159` (the <768 layout ladder); `04_test-surface-audit.md` F4 ("renders-hidden fails" — `steps.ts:1636-1651,1719`); `inbox-phone.test.ts:250-320` (per-route banned-surface asserts); `docs/research/03_data-layer-audit.md` REQ-DAT-11 (the open question).
**Retrieved:** 2026-10-07T22:30:00Z
**Implication for the spec:** **Proposed answer to REQ-DAT-11's open question — a server-resolved hint consumed as an immutable client capability.** The shell document / boot payload stamps `compact` computed by the same `isPhoneRequest` sniff (one implementation, no drift with the SSR fallback that Q-5's strangler keeps alive); the SPA exposes it as `useCapability()` resolved before the route tree renders, so banned subtrees never enter the DOM and the journey probes pass. A pure client-side `matchMedia`/`navigator.userAgentData` derivation is rejected: capability is device-class, not viewport width — today a narrow desktop window keeps full capability (only the CSS layout ladder engages), and that must not change.
**Outline delta:** CORRECTS REQ-DAT-11's framing "client-side capability signal" → "server-stamped, client-consumed."

### F7 — Loading/skeleton design exists as a catalogue but is unrouted; the SPA needs per-surface pending states

**Claim:** §5.9's state catalogue is implemented (`ide-states.tsx`: EmptyProject, EmptyFindings, ShellSkeleton, StreamingBlock, SyncPill2, RunFailed, ConflictBanner, OfflineQueued, InsufficientBalanceSwap, FrozenBanner, CancelRunModal — the product's only blocking modal) with the rule "skeleton rows in the shell, never a spinner on the paper," but `ShellSkeleton` renders in no route (SSR blocks). The Page's SSR fallback is `PmPreview` — a static typeset read of the doc — which doubles as the pre-mount paint.
**Status:** VERIFIED
**Evidence:** `ide-states.tsx:1-205`; grep `ShellSkeleton` → only definition + test + export; `page-editor.tsx:399-409` (`data-page-preview` → PmPreview); `ide-css.ts:168-183` (`.ide-sk-row`, shimmer, banner/pill styles).
**Retrieved:** 2026-10-07T22:30:00Z
**Implication for the spec:** Each SPA surface declares a pending render: the IDE routes mount the IdeShell chrome (with its `data-ide` attribute set — the same markup the stylesheet keys on) and `.ide-sk-row` skeletons in Page/Margin/Timeline/Desk; flat-shell routes render the Shell + section skeletons; the paper sheet gets skeleton rows or the PmPreview-shaped static doc, never a spinner. Every state keeps its `data-ide-state` value (`empty-project`, `run-failed`, `conflict`, `frozen`, `insufficient-balance`, `loading`) so tests/journeys keep their probes. First-load: the served shell document carries themeCss + theme boot + a minimal skeleton shell (REQ-TST-5's nonce contract applies to any inline boot script).
**Outline delta:** EXTENDS REQ-IDE-41 from "states exist" to "pending states are routed."

### F8 — Live state is three ad-hoc channels today; the SPA should converge them behind the query/subscription layer

**Claim:** (a) `page.ts` polls `GET …/doc` every 10 s visible-only → rebase + lock banner + rail `data-lost` resync + venue cap; (b) `ide.ts` opens a per-document `EventSource` on `data-feed-events?after=<lastSeq>` with `Last-Event-ID` resume and patches run-card meters/phases in the DOM; (c) meta-refresh self-polls cover import preview and `/billing/return`. All are per-document lifetimes that an SPA makes redundant.
**Status:** VERIFIED
**Evidence:** `page.ts:31,292-308,340-344`; `ide.ts:1102-1125`; `render.tsx:126-130`; `docs/research/02_island-contract-map.md` REQ-ISL-5/14.
**Retrieved:** 2026-10-07T22:30:00Z
**Implication for the spec:** The SPA contract: the doc poll becomes a `refetchInterval` query (visible-only, 10 s floor preserved per REQ-ISL-5 unless B3 lands a push channel); the feed becomes ONE project-scoped SSE subscription mounted above the route tree (survives intra-project navigation, resumes with `?after=`, drives feed rows AND lock/finding invalidation hints); pending-poll payloads (REQ-DAT-14) drive `refetchInterval`. Findings-rail/meter/status slots become reactive state — the DOM-patching code (`syncRail`, `patchCard`) is replaced by re-render, not ported.
**Outline delta:** EXTENDS REQ-ISL-5/14 into an SPA lifecycle contract.

### F9 — The non-component JS surfaces must survive verbatim: pre-paint theme boot, dwell beacon, presence ping

**Claim:** Three behaviors live outside any component: `themeBootScript()` (a synchronous ES5 IIFE resolving `data-app-theme`/`data-theme`/`data-paper`/`data-font`/`--paper-size` from SSR attrs → localStorage mirrors → defaults, *before first paint* — else FOUC returns); the 30 s visible-only dwell beacon to `/a/dwell`; the gate-card presence ping (`POST …/gates/:gid/activity`). A component-model port can silently lose all three.
**Status:** VERIFIED
**Evidence:** `packages/ide/src/theme.ts:52-89`; `render.tsx:95-113,175-177`; `gate-card.tsx:191-196,634` (per 02 F4); `docs/research/02_island-contract-map.md` F9.
**Retrieved:** 2026-10-07T22:30:00Z
**Implication for the spec:** The SPA shell document embeds themeCss + the boot script (or an equivalent module that runs before first paint — under CSP `script-src 'self'` + nonce it may need to be a nonced external module executed synchronously, not an inline script); dwell + presence become route-aware React effects. REQ-ISL-15 already pins the theme boot; the spec should pin the other two.
**Outline delta:** CONFIRMS REQ-ISL-15; EXTENDS the invisible-JS inventory into UX surface.

### F10 — The `.paper` theme island is what makes port + polish cheap

**Claim:** `paperScopeVars` remaps the `--shell-*` names *inside* `.paper` to the paper palette, so every component (which reads `--shell-*`) renders correctly on the sheet in either shell theme, with `[data-paper]` pinning overriding either direction — zero per-component theming. This is why "existing visual language migrated" is a mechanical carry, not a redesign.
**Status:** VERIFIED
**Evidence:** `tokens.ts:106-150` (`paperScopeVars`); `theme-css.ts:84-98` (emission order — pinning last); `ide-css.ts:48-50` (the sheet inset + shadow).
**Retrieved:** 2026-10-07T22:30:00Z
**Implication for the spec:** Keep the metaphor and the remapping; components must keep reading `--shell-*` (never hard-code paper values) — that is the only rule a React port can violate that would break the sheet.
**Outline delta:** CONFIRMS §5.9 theme policy.

### F11 — Copy ownership is already a contract the SPA can inherit: text-agnostic components + one linted table + server-shipped label maps

**Claim:** Every `@rhema/ui` component takes `labels` props — "text-agnostic" is enforced by convention (no user-facing literals in the package); all chrome strings live in `apps/web/src/copy.ts`'s `COPY` table, covered by `collectCopyStrings()` + `lintCopy` (Appendix D.2 vocabulary) + the ADR-059 jargon lint + ESLint `no-banned-strings`; dynamic event/notice copy is built server-side (`feedLabelMaps()` from `COPY.feed`/`COPY.review`) and shipped to the island as embedded JSON (`data-feed-labels`) so no label is authored client-side (fail-closed).
**Status:** VERIFIED
**Evidence:** `copy.ts:1-4,2264+`; `feed-labels.ts:15-66`; `ide-shell.tsx:5` + `page-editor.tsx:10-11` ("Text-agnostic" headers); `eslint.config.js:61-64`; `copy.test.ts:18`; `04_test-surface-audit.md` F6/F7.
**Retrieved:** 2026-10-07T22:30:00Z
**Implication for the spec:** React components keep receiving copy as props — never context, never literals. The `COPY` table moves to (or is imported by) the SPA source tree unchanged so the existing lints cover SPA copy verbatim; server-dependent maps (feed labels, notice/code→copy maps, pill `data-label-*` templates) keep being built server-side and ship as boot/loader JSON — REQ-ARCH-33 "server-owned copy" is about provenance and protocol IP, not about withholding strings already emitted into every HTML page.
**Outline delta:** CONFIRMS REQ-ARCH-33 boundary; EXTENDS — names the three copy channels (bundled COPY table, shipped label maps, labels props).

## Open questions

1. **Editor session keep-alive scope.** Should navigating `/p/:slug` → dossier → back preserve the live collab provider + bound Y.Doc (a project-scoped provider registry above the route tree), or is remount-on-return acceptable given y-indexeddb already makes re-entry fast? Recommend: hoist the session per `draft:<id>` within the project context — but this is B4's binding decision; C1 only names the UX bar (return-to-editor should feel instant, unsaved edits obviously preserved).
2. **Route-announce convention.** Announce-only (polite live region "Dossier — <title>") vs move-focus-to-heading per route family? Editor-mounting routes must *announce, never focus* — a caret steal into ProseMirror on client nav would be a regression. C2 owns nav semantics; this note fixes the "never focus the editor" rule.
3. **`data-feed-labels` channel.** Boot payload vs a fetched `…/feed-labels` endpoint — B3's boundary decision; either satisfies the "server-built, fail-closed" contract.
4. **Component-level a11y automation.** D1 decides (REQ-TST-10); C1 recommends the cheap floor: keep journey P1's axe + add a `jest-axe` pass in whatever DOM test env lands (happy-dom already exists) — the IDE's landmark/aria-live/table structure is worth pinning below E2E.
5. **Optimistic-mutation boundary.** Dispositions, notes, read-marks, theme/pane state: optimistic. Anything spend-adjacent (run sheet launch, gate decisions, billing, delete): pending-in-place, never optimistic — the sheet/consent surfaces are truthful-mutations territory (REQ-SPEC-32 posture). Confirm per-mutation classification lands in B3's mutation convention.
6. **Scroll-restoration granularity.** The Page scrolls inside `.ide-page` (not `window`); Desk/Timeline scroll their own bodies. Per-pane restore on back-nav — C2's row, flagged so it doesn't drop.
7. **`compact` + resize.** Device-class flag is fixed at bootstrap; rotating a phone past 768 px engages the wider *layout* but keeps the *capability* set (matches today). Confirm no surface needs live capability re-derivation.

## Spec requirements emitted

- **REQ-UX-1** — No document reloads inside the authenticated app: every route transition is client-side; the IdeShell mounts once per project context; back/forward, scroll restoration, and deep links (`#finding-<id>`, `?gate=`, `?focus=1` apply-then-strip) are preserved per today's URL contract.
- **REQ-UX-2** — Primary nav targets prefetch on intent (hover/focus/touchstart): project rows on `/app`, palette go-to rows, Timeline next-step, version-rail chips. The ⌘K palette's `PaletteData` is fetched once per project mount, not re-embedded per route.
- **REQ-UX-3** — Every surface declares a pending render: skeleton rows (`ide-sk-row` vocabulary) in shell regions; the paper sheet never shows a spinner; the editor route's pending state is the PmPreview-shaped static doc or sheet skeletons; each state keeps its `data-ide-state` value.
- **REQ-UX-4** — Mutations are pending-in-place or optimistic per the spend boundary (safe verbs optimistic; spend/destroy verbs pending-only); the `?saved`/`?notice`/`?disposed`/`?bulkdone` flash vocabulary stays valid for deep links but renders from mutation responses; no mutation may reset scroll or keyboard focus.
- **REQ-UX-5** — Styling stays generated-CSS-over-tokens: `themeCss()`/`ideCss()` (or their extracted component-class sibling) are the only token sources; no Tailwind, no CSS-in-JS runtime, no hashed-class scoping; components keep semantic `.ide-*`/`.rm-*`/`.paper` classes + `var(--*)` inline styles; new shared classes join the generator.
- **REQ-UX-6** — The emitted DOM contract is preserved verbatim on ported surfaces: the ~90 journey `data-*` hooks (REQ-TST-2), the island sentinels (`data-page-root`, `data-sync-pill`, `data-ide-*`, `data-feed-*`, `data-margin-card`, `data-desk-row`, `data-phone-blocked`), and attribute-driven pane/view state (`data-files`/`data-margin`/`data-timeline`/`data-desk`/`data-view`/`data-desk-tab`) all emit identically.
- **REQ-UX-7** — WCAG 2.2 AA floor held plus the SPA additions: every client navigation updates `document.title` AND either moves focus to the surface's heading region or announces via a polite route-announcer live region; a "Skip to Page" skip-link precedes the Rail; palette/menu/modal overlays restore focus to their trigger on close; the Page/editor surface is never auto-focused by a route change.
- **REQ-UX-8** — The §5.12 keymap ports verbatim, focus-zone scoping included: findings chords (J/K/P/A/D/R/F/E/⌥J/⌥K) inert while the caret is in the Page or a field; `dispatchIdeKey` is reused; `focusZone()`'s DOM probes keep working because the sentinel selectors are preserved.
- **REQ-UX-9** — Live-region vocabulary preserved: one sync pill per Page (`role="status"`, `aria-live="polite"`, §5.10's verbatim strings); feed/chat-log/triage-progress polite; spend gates assertive; `prefers-reduced-motion` collapses every transition including any route/view transition.
- **REQ-UX-10** — Phone capability: `compact`/readOnly/editable withholding is resolved by the existing `isPhoneRequest` device-class sniff at document/bootstrap time, shipped in the boot payload, and consumed as an immutable client capability flag — banned surfaces never enter the DOM (journeys' DOM-absence probes keep passing); viewport width continues to drive only the CSS layout ladder; a narrow desktop keeps full capability.
- **REQ-UX-11** — The boot document carries, before first paint and inside the CSP nonce contract: the theme stylesheet, the IDE stylesheet when the route is IDE-class, and a synchronous theme-resolution equivalent of `themeBootScript` (SSR attrs → localStorage mirrors → defaults; `auto` subscribes matchMedia). Dwell-beacon and gate-presence equivalents ship as route-aware effects.
- **REQ-UX-12** — Copy stays centrally owned: `@rhema/ui` remains text-agnostic (all strings via `labels` props, no literals); the SPA consumes the same `COPY` table module so `lintCopy`/`collectCopyStrings`/`no-banned-strings` cover every shipped string; feed/pill/notice label maps are built server-side and shipped as data (boot payload or BFF endpoint), never authored client-side.
- **REQ-UX-13** — The paper-sheet theme island is preserved: `.paper` keeps remapping `--shell-*`; components must never read `var(--paper-*)` directly for chrome — the pin directions work only while the indirection holds.
- **REQ-UX-14** — The interaction-model invariants hold: Cancel-run stays the only blocking modal (everything else is a banner/pill/swap/`role="status"`); no Save button and no unsaved-changes dialog anywhere (⌘S = named restore point, one owner); finding verbs, gate cards, and disposition controls remain operable by keyboard with their existing aria wiring.
- **REQ-UX-15** — Live-state convergence: the 10 s visible-only doc poll becomes a `refetchInterval` query (or a documented push channel) keeping the lock/banner/findings-resync SLA ≤10 s; the feed becomes ONE project-scoped SSE subscription above the route tree with `?after=`/`Last-Event-ID` resume; pending-poll surfaces drive `refetchInterval` from `{pending, pollAfterSeconds}` payloads.
- **REQ-UX-16** — The port fixes layout/interaction debt without redesign: hover/focus states on interactive controls (the inline-style gap), the skip-link, and per-route pending states are the sanctioned polish list; palette, severity/kind hues, pane geometry, and the sheet metaphor change only where a WCAG/contrast test forces it (the ADR-070 retune precedent).
