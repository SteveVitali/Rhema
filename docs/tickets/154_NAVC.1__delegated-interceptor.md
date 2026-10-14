# NAVC.1 — Delegated same-origin click interceptor (nav completion core)

- **Sequence:** 154 · **Phase:** round 5 · **Kind:** ticket
- **base_branch:** current checkout
- **Depends on:** 153_VERIF.1
- **Run:** `implement-spec spec=docs/tickets/154_NAVC.1__delegated-interceptor.md`
- **Gate status:** none
- **Live stage:** none (verifies in unit/dom suites; live proof is 157_NAVC.4's R10)
- **Production mutations:** none
- **Size budget:** ~600 changed lines excl. generated

## Goal
Restore the spec's letter: every same-origin in-tree anchor activation inside the SPA routes
through the router instead of a document reload — via ONE delegated `document`-level click
listener (the ratified Q-3 mechanism), with the correct guard ordering, the forced-SSR boundary
preserved, and the `SsrHandoff` Back-loop fix.

## Load
- `docs/post-spa-disposition-spec.md` §2 (REQ-NAVM-1..8 — the 11-step pipeline is normative verbatim)
- `docs/research/r5_a1_anchor-census.md` (the ~95-emitter inventory + the non-document-GET list)
- `docs/research/r5_a3_nav-mechanism.md` (mechanism + stub-id rule + SsrHandoff fix + the ~12-suite spy migration)
- `apps/web/src/spa/main.tsx` (`mountSpa` — install site), `spa/dom.ts` (`navigateDocument` seam), `spa/states.tsx` (SsrHandoff)
- `apps/web/src/spa/router.ts` / `routeTree.gen.ts` (`getMatchedRoutes`, the `**` predicate, stub ids at :804/:818/:825)
- `packages/contracts/src/spa.ts` (`spaRouteFor` — READ to see the prefix-fallback misclaim; NEVER use it as the classifier)
- `apps/web/src/dom-contract.ts` (the `data-spa-native` row)
- The ~12 `spaRuntime.assign`-spying dom suites (list in r5_a3) — they migrate to the `replace` seam here

**Shared signal (with 155_NAVC.2):** the "committed in-document location transition" both
tickets consume is the router's navigation-commit event (push/replace/pop after beforeLoad
resolution) — NAVC.2 names it in code; this ticket's navKey-semantics pin tests against it.

## In scope — deliverables
1. **The interceptor** (REQ-NAVM-1/2): one bubble-phase `click` listener on `document`, installed
   by `mountSpa` — never `createSpaRouter`. The normative ordered pipeline from spec §2.1
   verbatim, incl. `target` absent-or-`_self` (Link parity), fail-closed URL parse, hash-only
   skip (no `beforeLoad` re-fire), and `router.navigate({href})` for the intercepted commit.
   Clicks are push-only; `resetScroll` never overridden (REQ-NAVM-3).
2. **RELOAD_STUB_IDS** (REQ-NAVM-4) matched by generated route id with the full
   `/_authenticated/` prefixes — `spaRouteFor` is never consulted for the stub decision
   (`/settings`/`/app/settings` are client redirects — misclassifying them is a regression).
3. **Renderer boundary** (REQ-NAVM-6): interception is unconditional once in-tree — no boot
   `surfaces`/`deviceClass`/`twinForcesSsr` consults; leaf pipelines own the verdict.
4. **`data-spa-native`** (REQ-NAVM-8 + REQ-NAVC-13): dom-contract row + emitters on the three
   non-document GETs on BOTH renderers.
5. **No preload** (REQ-NAVM-7): `defaultPreload:"intent"` is NOT enabled; a comment records the
   side-effecting-loader audit gate for any future PRELOAD_SAFE allowlist ticket.
6. **State-map dead-link fix:** `state-map.ts:130,246` `/voices/<id>` → `/v/:persona` (pre-existing
   defect, rides this ticket).
7. **Guard-table suite** (REQ-NAVT-8): `spa/intercept.dom.test.tsx` — synthetic clicks over the
   real `routeTree` covering every A1/A2 decision row + the reloadDocument-redirect history-slot
   pin (A3-OQ1) + `navKey` semantics.

## Deploy boundary (M5 — recorded constraint)
This ticket's code MUST NOT deploy ahead of 156_NAVC.3 (the registry destroy-identity fix) —
the interceptor activates client navs that exercise the registry; the deploy segment boundary
is recorded in 173_R5REC.3's §R5 plan.

## Out of scope
- SsrHandoff replace seam + spy migration → 154a_NAVC.5
- `data-nav-count` / `data-mounted` pending semantics / settle helpers → 155_NAVC.2
- Registry/freshness invariants → 156_NAVC.3 · R10 legs + scroll/keymap/head → 157_NAVC.4
- Component ports to `<Link>` (refuted — spec §2.1)

## Acceptance criteria
- [ ] Every intercept.dom.test row behaves per the §2.1 pipeline incl. the non-document-GET skip, stub doc-nav, hash-only skip, and the `defaultPrevented` onboarding-preservation case *(deterministic · engineered)*
- [ ] SsrHandoff commits replace-mode document nav; spy suites migrated and green *(deterministic · engineered)*
- [ ] `pnpm check:dom-contract` green with the new row emitted+asserted on both renderers *(deterministic)*
- [ ] The `/p/:p/export/ai-use/*` + `/app/settings/data/export/download` + `/usage.csv` links still document-navigate (guard-table rows) *(deterministic)*
- [ ] verification green; …; `BUILD_INDEX.md` row and `LEDGER.md` advanced; operating clauses met. *(agentic — universal AC)*

## Requirement IDs to satisfy and stamp in the PR
REQ-NAVM-1 REQ-NAVM-2 REQ-NAVM-3 REQ-NAVM-4 REQ-NAVM-6 REQ-NAVM-7 REQ-NAVM-8 REQ-NAVC-13 REQ-NAVT-8
