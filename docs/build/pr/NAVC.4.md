# NAVC.4 — Nav acceptance: R10 + keepalive legs, scroll/keymap/head, boundary acceptance

Manifest row 157 · stacks on `stevevitali/navc-3-session-invariants` · merge policy
**OPERATOR** — do not merge from the build environment · contract
`docs/tickets/157_NAVC.4__nav-acceptance-legs.md` · run ledger
`docs/build/runs/NAVC.4.md`.

## What lands

The navigation machinery NAVC.1–NAVC.5/NAVC.2/NAVC.3 delivered is now *exercised*: real
acceptance legs over the interceptor/registry/settle contracts, the scroll+head+keymap
acceptance items each carrying a deterministic test, and the server-owned boundaries tested
rather than asserted.

- **`packages/journeys/src/steps.ts`** — **R10** (REQ-NAVT-4, $0): `/app` → *click* the
  `/p/:slug` row link (Quiet-folded rows open through `<summary>` first) → *click*
  `a[data-edit-source]` → `/p/:slug/v/working` → **Back**. Every hop is mechanism-pinned by
  `settleClientNav` — `data-nav-count` must tick +1 while the runner's unconditional
  `documentLoads` counter records zero new documents — then the Back pop's wire is watched:
  the warm return must **not** re-issue `GET /bff/p/<slug>` inside NAVC.3's
  `staleTime: PAGE_SESSION_IDLE_TTL_MS` freshness window (the accept-stale twin; the handoff
  POST may still fire). **R10.keepalive** (REQ-NAVT-5 leg half): a real synced keystroke on
  `/v/working` → `/app` away-hop → Back inside the 120 s idle TTL → asserts the SAME
  `data-page-session` is re-acquired AND that ⌘Z/Ctrl+Z removes the synced marker — a
  re-seeded `EditorState` would show the marker but could never undo it, so this is the
  semantic proof the registry entry (and its undo stack) survived. Both rows land
  `expected:"red"`, `paid:false`, owned by NAVC.4, and gate `project-home` + `editor`
  (`SURFACE_GATES` + `registry.test.ts` updated).
- **`spa/main.tsx`** — `scrollToTopSelectors: [".ide-page"]`: the IDE's inner page scroller
  tops on push/replace commits while the keyed restoration cache re-applies its position on
  pop — document-nav parity for the real scroller, not just `window` (REQ-NAVC-16).
- **`spa/ide/{chrome,controller}.ts`** — `IdeChromeNav.push/replace` accept
  `{resetScroll?: boolean}`; the three island-parity preserved-scroll navs all ride
  `{resetScroll:false}` now — `[`/`]` version stepping, the `?triage` toggle, and the
  `?focus=1` strip (the island's `replaceState` never scrolled either). The
  **REQ-NAVM-10/REQ-NAVC-19 hash gap is closed**: a delegated-interceptor-skipped fragment
  click is a *native* nav — the browser fires `hashchange` but `opts.nav.hash` never moves, so
  the mount effect couldn't see it. The controller now binds a symmetric `hashchange`
  listener feeding the ONE shared `consumeFindingHash` consumer (StrictMode-safe; router-
  committed hops fire it too — idempotent re-selection), so `#finding-<id>` selects the card
  whichever stack observed the hop.
- **Server-boundary acceptance (REQ-NAVC-23)** — `spa.dom.test.tsx`: a mid-document hop onto
  a `surfaces:null` path hands off through `SsrHandoff` (replace-mode — the client entry is
  eaten); a hop onto a `reloadDocument` stub doc-navs through `beforeLoad`; the
  mid-`beforeLoad` redirect's history-slot semantics stay pinned by the OQ1 leg in
  `intercept.dom.test.tsx`. `intercept.dom.test.tsx`: **`/app` precedence skip** — in-app
  clicks on `/app`, `/app?verified=1`, `/app?entry=draft&held=1` all land the leaf
  client-side with params verbatim (the server's `?verified`-mint/carried-intent precedence
  runs on document entry only) and the flip-side pin: the `data-spa-native` opt-out keeps the
  same href a document GET where precedence DOES run. External/opaque-origin and binary
  (`data-spa-native`, `download`, `**`-fuzzy) doc-navs were already covered by the §2.1 rows.
- **Head duties stay put (REQ-NAVM-9)** — the interceptor owns interception only: a
  comment-stripped source scan asserts `nav-intercept.ts` contains no `scrollTo`/
  `scrollIntoView`/`.focus(`/`document.title`/`history.scrollRestoration` write/
  `data-route`-family/`aria-live`/`resetScroll:`/`hashScrollIntoView:` vocabulary; the
  checklist lives in the run ledger.
- **Scroll/head deterministic coverage (REQ-NAVC-16/21)** — `spa.dom.test.tsx`:
  `history.scrollRestoration` flips `manual`; push tops + Back restores the keyed window
  position; the `.ide-page` element tops on push and restores on pop; a hash push favors
  `scrollIntoView` on the fragment target over the cached window position; a mid-navigation
  hash target wins focus over the h1; a same-title commit re-announces clear-then-set
  (MutationObserver on added/removed nodes — never a silent no-op); a replace commit
  announces identically. `transitions.dom.test.tsx`: `hashchange` joins `TRACKED_TYPES` and
  the leave/return listener balance still nets to the two named per-boot singletons.
  `ide-chrome.dom.test.tsx`: native `hashchange` selects the finding without router state; a
  non-finding hash is inert; all three `resetScroll:false` arms pinned through
  `navigate({…, resetScroll:false})` calls.

## Requirement ids

REQ-NAVT-4 · REQ-NAVT-5 (leg half) · REQ-NAVC-16 · REQ-NAVC-19 · REQ-NAVC-21 ·
REQ-NAVC-23 · REQ-NAVM-9 · REQ-NAVM-10

## Verification

- `pnpm turbo build lint typecheck` — **135/135 green**
- `pnpm test` — **493 files / 5,690 pass / 4 skip / 0 fail** (the NAVC.3-local
  `privsep.docker` env flake did NOT recur — 247 s green)
- `pnpm check:{licenses,protocol-markers,no-cookies,spa-budget,spa-env,dom-contract}` — all
  six green (831 manifest hooks, no new rows needed)
- focused: `spa.dom.test.tsx` 35 · `intercept.dom.test.tsx` 51 · `ide-chrome.dom.test.tsx`
  35 · `transitions.dom.test.tsx` 8 · `registry.test.ts` 7 — all green
- build-memory `check-build-memory.sh` — 0 violations (pre-existing `~` warnings only) ·
  `check-append-only.mjs --base a825ea2` — OK

## Production legs (paid:false — the only authorized arms)

`rhema-journeys --stage prod --steps R10,R10.keepalive --expect-sha <pushed impl head>` —
**expected to report owed**: prod serves the pre-NAVC-chain deploy (`ffbb8ad`… per VERIF.1),
so the `data-nav-count`/`data-page-session` markers are absent and provenance cannot match;
both rows are `expected:"red"` and failure reads as *owed* with the report preserved under
`docs/build/reports/`. No `--paid`, no other prod legs, no deploys. Results recorded in the
run ledger.
