# R5.A1 — Anchor census: every navigable element, classified for the interception decision table

**Stream:** A (nav completion) · **Researched:** 2026-10-14 · **Ledger rows:** A1 · **Confidence:** high — ~90 emit sites in `apps/web/src` + ~45 in `packages/ui/src` read or grep-verified; route/stub/redirect machinery confirmed end-to-end.

## Key established findings

- **F1** — The SPA emits plain `<a href>` almost everywhere; exactly one hand-rolled client-nav exists (`onboarding.tsx:413-433` entry cards → `preventDefault` + `router.navigate`). Delegated interception is additive; `e.defaultPrevented` makes that site a no-op.
- **F2** — In-tree same-origin anchors dominate (~95 runtime sites). `?search`/`#hash` must ride verbatim — `#report`/`#chat`/`#finding-*`/`?restore`/`?focus`/`?commented`/`?layout` are load-bearing (HeadManager hash-focus `head.tsx:53-58`; controller linked-selection `controller.ts:1151-1154`).
- **F3** — `SPA_PUBLIC_ROUTES` anchors reachable from the SPA: exactly 3 sites. `/pricing/rates` (`run-report.tsx:285`) is a session-free JSON relay, not a doc — `spaRouteFor` → `surfaces:null` anyway.
- **F4** — Five `surfaces:null` stubs: `/settings` + `/app/settings` client-redirect in-router; `/app/usage/r/:r`, `/p/:p/edit/:d`, `/p/:p/f/:fid` are `reloadDocument` stubs — intercept them; `beforeLoad` self-resolves.
- **F5** — Forced-SSR `pageMount` routes are intercepted unconditionally; leaf `isSpaEnabled`/`twinForcesSsr`/`SsrHandoff` + `/bff/p/:slug/handoff` beforeLoad own the verdict. Pre-checking would skip the handoff POST — a behavior regression.
- **F6** — Zero `target=`/`download=`/`mailto:`/`tel:`/`javascript:` emitted; externals only as DTO data (PM link marks unbounded). Guard anyway; origin test fails closed.
- **F7 (sharpest)** — Three same-origin non-document GETs live under SPA prefixes: `/usage.csv` (`data-usage-csv`), `/p/:slug/export/ai-use/{md,docx}` (**no data hook**), `/app/settings/data/export/download?id=` (`data-export-download`, 302→presigned). `getMatchedRoutes` misses all → native GET → correct; `spaRouteFor`'s prefix fallback would misclaim the last two → client 404 → **download silently dies**.
- **F8** — Hash-only vocabulary enumerated (`#ide-page`, `#desk`, `#finding-*`, `#letter-*`, `#`): same-path+same-search+hash-only → skip natively; bare `?` / search-delta → intercept.
- **F9** — Handler-bearing anchors yield via `defaultPrevented` (skip link, `#desk`, entry cards); `data-gate-artifact` beacon is passive (transparent); synthesized `.click()`s (`controller.ts:1056-1060` `finding-open`) are ordinary activations — correctly intercepted.
- **F10** — Server-computed hrefs all `/`-rooted; **two pre-existing bugs**: `state-map.ts:130,246` emit `/voices/<personaId>` — no such route (`/v/:persona` is real) — dead links that today land on shell→client-404.
- **F11** — No anchor-bearing HTML injection; PM preview renders link marks as `<a href>` (arbitrary document-authored URLs) — document-level listener covers them; keep origin test fail-closed.
- **F12–F14** — POST forms/`formAction` out of scope; ~20 `data-*` hooks already decorate anchors; any new opt-out hook needs a `dom-contract.ts` row + assertion.
- **F15** — `getMatchedRoutes` in-tree test is necessary AND sufficient; `spaRouteFor` belongs only in the optional `surfaces===null → navigateDocument` short-circuit.

## Spec requirements emitted (continuing REQ-NAVC-1..6 from A2)

- **REQ-NAVC-7** — In-tree test is `router.getMatchedRoutes(pathname)` ONLY; `spaRouteFor().surfaces` must never classify clicks (prefix fallback misclaims non-document GETs).
- **REQ-NAVC-8** — `pageMount`/showcase paths intercepted unconditionally; the handler must NOT pre-check device/showcase.
- **REQ-NAVC-9** — Hash-only activations pass through natively; bare `?`/search-delta same-path links intercept.
- **REQ-NAVC-10** — `e.defaultPrevented` checked first.
- **REQ-NAVC-11** — `surfaces:null` stubs intercepted like any in-tree route; the `→ navigateDocument` short-circuit is optional.
- **REQ-NAVC-12** — `pathname+search+hash` to `navigate` verbatim.
- **REQ-NAVC-13** — Any new `data-*` opt-out hook needs a `dom-contract.ts` row + emitting site + assertion.

## Open questions carried to §Q

- Fix `/voices/<personaId>` dead links at source (`state-map.ts:130,246`) — separate bug, recommend fixing the builders.
- `export/ai-use/*` explicit `data-*` hook or in-tree-test-only? (Census favors in-tree-test-only.)
- PM link marks: `rel`/`target` policy, or click-time origin test only (sufficient for nav correctness)?
