# ADR-110: Intra-app navigation is one delegated `document` click interceptor — no component port

- **Status:** Accepted
- **Date:** 2026-10-17
- **Ticket:** NAVC.1–NAVC.5 (the build stream); R5REC.2 (this record — the round-5 spec reconciliation; REQ-MEM-8's "once the round-5 ADR lands" clause)
- **Requirement ids:** REQ-NAVM-1…10 (the mechanism); REQ-NAVT-1…8 (the settle/verification
  contract); REQ-NAVC-16…23 (the dormant-machinery obligations the interceptor made real);
  REQ-NAV-9 + REQ-BND-9 + REQ-UX-1 (the boundary rule the mechanism finally satisfies); REQ-VFY-3 (the
  extended settle markers); REQ-MEM-6/7/8 (the fold-back itself)
- **Spec:** docs/frontend-spa-spec.md §7 (amended by §14.18/§14.19, v1.2);
  docs/post-spa-disposition-spec.md §2/§3/§4/§8 (the normative mechanism + verification
  contract this ADR ratifies)

## Context

The round-4 SPA spec required "intra-tree → `router.navigate`; no document reloads inside
the app" — but the shipped chain carried **zero `<Link>` imports and no interception
mechanism at all**: every `<a href>` activation was a full document navigation. The
journey harness could not see the gap: `awaitMounted`/`settleNav`/`gotoOk` verified
*which* document rendered (`data-renderer`/`data-route`/`data-mounted`), never *how* the
browser arrived — the `r5_a4` A4-F1 observability gap (closed harness-side by A4-F5's
`documentLoads` counter) let zero-client-routing ship invisibly. The operator ruled at **Q-scope-1** (2026-10-15,
`docs/post-spa-disposition-brief.md`) that the "MPA-mode" gap is a **defect, not an
accepted posture** — intra-app nav must go client-side per the spec's boundary rule.

The mechanism had to satisfy constraints that rule out the obvious designs:

- **No markup rewrites.** Anchors are emitted by Hono JSX SSR templates, `@rhema/ui`
  components, and ProseMirror `toDOM` serializations — PM link marks produce raw `<a>`
  nodes with no React element to port, and `@rhema/ui` also renders under `StaticRouter`
  in SSR, where TanStack `<Link>` throws outside its own router context.
- **Router construction stays listener-free.** The existing router-direct dom suites
  build `createSpaRouter` instances; installing the document listener inside the factory
  would intercept every suite's synthetic clicks.
- **The client never decides a renderer** (frontend-spa-spec §14.8): interception cannot
  consult the boot `surfaces` map, `deviceClass`, `twinForcesSsr`, or `spaRouteFor` —
  leaf pipelines own every renderer verdict, and `postProjectHandoff`'s `beforeLoad`
  POST must fire exactly as on document entry.
- **`beforeLoad`+loaders may side-effect** (`confirmEmail` token consumption, mark-read
  twins, `postProjectHandoff`): blanket intent-preload (`defaultPreload:"intent"`) is
  unsafe; prefetch hover/focus fires nothing.

## Decision

**One delegated bubble-phase `click` listener on `document`**
(`apps/web/src/spa/nav-intercept.ts`), installed by `mountSpa` (`spa/main.tsx:88`) —
never by `createSpaRouter`. `<a href>` markup is unchanged on both renderers; SSR
documents install nothing.

The ordered guard pipeline is normative (`nav-intercept.ts:43-120`): resolve
`closest("a[href]")` → `e.defaultPrevented` → `button!==0` → modifier keys →
`contenteditable` ancestor (with the `contenteditable="false"` island carve-out) →
`target` absent-or-`_self` only, `download`, `data-spa-native` → fail-closed `new URL`
same-origin test → hash-only same-path+same-search skip (native fragment nav —
intercepting would re-fire `beforeLoad`+loaders for a same-document scroll) →
`router.getMatchedRoutes(pathname)` in-tree **with the `**` fuzzy predicate** (a fuzzy
match leaves the remainder in `rawParams["**"]` → not intercepted, so the
`/p/:p/export/ai-use/{md,docx}` downloads survive under the `/p/$project/export`
wildcard; the index route is the `foundRoute.path === "/"` exception) →
`RELOAD_STUB_IDS` membership → `preventDefault` + `router.navigate({href:
pathname + search + hash})`.

**Server-owned redirect stubs stay document navigations.** `RELOAD_STUB_IDS`
(`/_authenticated/app/usage/r/$runId`, `/_authenticated/p/$project/edit/$draftId`,
`/_authenticated/p/$project/f/$fid`) route to `navigateDocument` — matched by generated
route id, never `spaRouteFor`, whose prefix fallback would misclassify the `/settings`
and `/app/settings` *client* redirects into doc-navs.

**History + scroll are untouched.** Clicks always push (document-nav parity); the
interceptor never emits `replace`, never overrides `resetScroll`/`viewTransition`/
`scrollRestoration` (`.ide-page` joins `scrollToTopSelectors`), and never checks
`e.isTrusted` — synthesized `.click()`s are ordinary activations so tests and
assistive-tech dispatches behave identically.

**`SsrHandoff` is replace-mode.** `spa/dom.ts` gained `spaRuntime.replace` +
`replaceDocument(href)`; `SsrHandoff` calls it because under interception the client
commit already occupies the history slot — `assign` would push a duplicate transient
entry and Back would bounce forward into the handoff again (the round-4 Back-loop
defect). `navigateDocument`/`replaceDocument` share the one `spaRuntime` seam so tests
assert "document nav happened" without caring which arm.

**The settle contract gained a mechanism detector.** `data-nav-count="0"` is stamped on
**every** served document (SSR `render.tsx` + the shell `spa-shell.ts`); HeadManager
(`spa/head.tsx`) increments it once per committed in-document location transition
(push/replace/pop by location `state.key` change; hydration is the seed, never a
transition). A document load lands a fresh `"0"` — the reset itself detects a document
nav where an in-page counter cannot. `data-mounted` is **removed** while `isLoading`
and re-stamped on resolution. The journey side (`settleClientNav`/`settleDocumentNav`
+ the unconditional `SettleScope.documentLoads` response counter in `runner.ts`) pins
the mechanism in both directions: a commit that document-navigates mid-wait fails, and
a document nav without a same-origin document response fails.

**No preload ships; the hash gap is compensated.** `defaultPreload:"intent"` is
deliberately unset (signed deviation — GATE-ACCEPT.R5 row 1); a `PRELOAD_SAFE` routeId
allowlist + delegated `pointerover`/`focusin` leg is a named follow-up. Native hash-only
clicks never reach router state, so `ide/controller.ts:1127` runs the same
`consumeFindingHash` consumer on `hashchange`.

## Consequences

- Intra-app navigation is genuinely client-side for the first time; REQ-NAV-9 + REQ-BND-9 +
  REQ-UX-1 are satisfied under the landed mechanism, not by the boundary rule's
  aspirational text.
- The verification contract finally *measures the mechanism*: `data-nav-count` monotonicity
  inside a document + the `documentLoads` counter make "no interception" and
  "spurious document nav" both observable — the A4-F1/F5 class of invisible-defect cannot
  recur silently.
- History behaves correctly across every arm: client pushes, `SsrHandoff` replace (no
  Back-loop), mid-`beforeLoad` `redirect({reloadDocument:true})` stubs (history-slot
  pin-verified in `intercept.dom.test.tsx`), and plain document navigations all
  preserve Back semantics.
- Signed deviations carried (GATE-ACCEPT.R5, 2026-10-17): intent-preload ships none
  (row 1); REQ-ED-12's forced-SSR arm covers only the five Page-family GETs — the
  dossier stays SPA at phone width (row 2); the NAVC-18 freshness asymmetry —
  `projectPageQuery` gains `staleTime: PAGE_SESSION_IDLE_TTL_MS` while mark-read/view
  twins keep `staleTime: 0` because their GET is the read receipt (row 4).
- `spa/intercept.dom.test.tsx` (19 synthetic-click tests over the real `routeTree`)
  covers every skip-list row, the stub arm, and the mid-`beforeLoad` history-slot pin;
  staging-verified on pr-186 (VERIF.2): R10 `/app` → `/p/:slug` → `data-edit-source` →
  `/v/working` → Back with monotone `data-nav-count` and `documentLoads === 1`.
  REQ-NAVT-5's keepalive leg stays `expected:"red"` — owed on `D-SPA.24-1`.

## Alternatives considered

- **Component port (`<Link>` everywhere)** — refuted: PM `toDOM` anchors have no React
  element; `@rhema/ui` renders under `StaticRouter` where TanStack `<Link>` throws; and
  an SSR/SPA shared markup port would have touched every anchor call-site on both
  renderers.
- **Hybrid (Link where possible, interceptor for the rest)** — refuted: two nav code
  paths double the surface and the `intercept.dom.test.tsx` matrix; one listener with a
  normative skip-list is strictly simpler and verifiable.
- **Blanket `defaultPreload:"intent"`** — unsafe under side-effecting `beforeLoad`s
  (above); the allowlist leg is follow-up work, not folded into the defect fix.
- **Intercepting inside `createSpaRouter`** — would reach into the router-direct dom
  suites and couple listener lifetime to router construction; `mountSpa` is the one
  place a real document exists.

## Revisit trigger

Revisit only if: (a) the `PRELOAD_SAFE` allowlist + pointerover/focusin leg ships (the
interceptor stays; the preload arm is additive); (b) the `**/`-fuzzy in-tree verdict
proves wrong for a new non-document GET (add a `data-spa-native` hook instead of
widening interception); or (c) a route-level need for `replace`-mode clicks appears
(none exists — push-only is document-nav parity).
