# R5.A3 — Nav mechanism design: delegated document interceptor

**Stream:** A (nav completion) · **Researched:** 2026-10-14 · **Ledger rows:** A3 · **Confidence:** high; one history-semantics claim needs pin-version verify (OQ1).

## Verdict

**ONE delegated `click` listener on `document` (bubble phase), installed by `mountSpa`. Zero component ports.** NavLink/hybrid refuted: PM link marks render through schema `toDOM` (`editor/src/schema.ts:267-281`) — no React element exists to port; `@rhema/ui` renders under `StaticRouter` SSR where TanStack `<Link>` throws and doesn't declare the dep; markup parity is free; precedent exists (`onIdeClick`, `dossierSubmitHandler`); rollback = one line.

## Normative pipeline (REQ-NAVM-2)

resolve `a[href]` → `defaultPrevented` → `button!==0` → modifiers → `contenteditable` ancestor → `target`/`download`/`data-spa-native` → `new URL` origin test (fail-closed) → hash-only same-path+same-search skip → `getMatchedRoutes` in-tree (`**` predicate) → `RELOAD_STUB_IDS` short-circuit → `preventDefault` + `router.navigate({href: path+search+hash})`.

Key rulings: clicks always push (REQ-NAV-11 doc-nav parity); `replace` never emitted by the interceptor; resetScroll never overridden (HeadManager + `scrollRestoration` own scroll/focus/title); `e.isTrusted` never checked (synthesized clicks must intercept); `mountSpa` install keeps the 14 router-direct dom suites un-intercepted.

## Derived findings beyond inputs

- **`SsrHandoff` must switch assign→replace (REQ-NAVM-5).** `navigateDocument`=`location.assign`=push; post-interception the client commit entry exists before the leaf mounts → `assign(sameUrl)` duplicates it → Back lands on the transient entry → leaf re-renders → re-assigns → **Back loops forward**. Unreachable pre-interception; live the day this ships. Fix: `spaRuntime.replace`/`replaceDocument` in `dom.ts`; `SsrHandoff` calls it. Correct for the initial-mount leg too.
- **Stub short-circuit = route-id membership, NOT `spaRouteFor`** (`REQ-NAVM-4`): `RELOAD_STUB_IDS = {/_authenticated/app/usage/r/$runId, /p/$project/edit/$draftId, /p/$project/f/$fid}`. `spaRouteFor===null` also matches `/settings`+`/app/settings` — *client* redirects that resolve in-router; doc-navving them is a regression.
- **Preload: ship none** — every preload runs `beforeLoad`+`loader` → hover would fire `postProjectHandoff` POST, `confirmEmail` token consumption, mark-read twin GETs (A5-F3). Follow-up shape: delegated pointerover + `PRELOAD_SAFE` routeId allowlist (candidates enumerated) + pin-verified stage coverage.
- **Hash-only skip gap:** native hash clicks never reach router state → `nav.hash`-keyed `selectFinding` (`controller.ts:1151-1154`) doesn't fire — today a doc reload applied the selection. Compensate via `hashchange` listener OR accept (REQ-NAVM-10, spec picks).
- **OQ1 pin-verify:** `reloadDocument` redirect mid-`beforeLoad` — does resolution replace the committed entry or eat the host entry? Decides whether conditional arms need `replace:false` honored.

## File plan

`spa/nav-intercept.ts` NEW (~100 lines, exported pure helpers) · `main.tsx` one install line · `dom.ts` `replace`/`replaceDocument` · `states.tsx` `SsrHandoff`→replaceDocument · `dom-contract.ts` `data-spa-native` row + emitters on the 3 non-doc GETs (incl. un-hooked `export/ai-use/*`) both renderers · `nav-intercept.dom.test.tsx` NEW (full matrix over the real routeTree). **Zero existing test updates** — no dom test clicks an anchor.

## Spec requirements

REQ-NAVM-1 delegated document listener · -2 normative pipeline · -3 push-only history parity · -4 route-id stub short-circuit (`spaRouteFor` forbidden as classifier) · -5 SsrHandoff replace · -6 never pre-judge renderer (handoff POST must fire) · -7 no preload at ship · -8 `data-spa-native` opt-out hook · -9 head duties stay with HeadManager · -10 hash-skip compensation decision.
