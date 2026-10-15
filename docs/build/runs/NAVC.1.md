# NAVC.1 — delegated same-origin click interceptor (run ledger)

- **Spec:** `docs/tickets/154_NAVC.1__delegated-interceptor.md` (manifest row 154, round 5)
- **Normative loads:** `docs/post-spa-disposition-spec.md` §2 (REQ-NAVM-1..8 — the §2.1
  11-step pipeline is normative verbatim); `docs/research/r5_a1_anchor-census.md`;
  `docs/research/r5_a2_tanstack-api.md`; `docs/research/r5_a3_nav-mechanism.md`
- **Base:** `stevevitali/verif-1-composed-ffbb8ad` @ `708ed10` (re-forked — see
  Progress: original fork base was `db40fa2`, superseded by the CIREP.1 insert +
  the operator's libcap-ng mirror-fallback repair)
- **Branch:** `stevevitali/navc-1-delegated-interceptor` (mergePolicy=OPERATOR — never merge)
- **Harness:** devin-cli subagent (Cognition agentic coding CLI)
- **Skills:** implement-spec + build-memory @ `~/agent-skills`
- **Requirement ids stamped:** REQ-NAVM-1 REQ-NAVM-2 REQ-NAVM-3 REQ-NAVM-4 REQ-NAVM-6
  REQ-NAVM-7 REQ-NAVM-8 REQ-NAVC-13 REQ-NAVT-8
- **Started:** 2026-10-15 · **Closed:** (pending)
- **Config:** full rigor (ledger + self-review + gap analysis + tests + evidence report);
  **Live stage: none**; **Production mutations: none**; metered spend **$0**;
  zero prod writes, zero deploys, zero merges

## Deferrals read

`docs/tickets/DEFERRALS.md` read first (protocol). No OPEN row is scoped to navigation /
the SPA interceptor; NAVC.1 neither lands live legs nor operator prerequisites — nothing
closes this run. New rows opened: none expected (verification is fully offline).

## Deploy boundary (contract M5 — recorded constraint)

This ticket's code MUST NOT deploy ahead of 156_NAVC.3 (the registry destroy-identity fix):
the interceptor activates client navs that exercise the page-session registry. Nothing in
this run deploys (operator merges + deploys); the constraint is recorded here and in
173_R5REC.3's §R5 plan — no restructuring is made that would route around it.

## Requirement split (recorded honestly — contract Out-of-scope is authoritative)

- **REQ-NAVM-5 (SsrHandoff `spaRuntime.replace`/`replaceDocument` + ~12-suite spy migration)
  belongs to 154a_NAVC.5**, not this run. The contract's stale AC row ("SsrHandoff commits
  replace-mode document nav; spy suites migrated and green") predates the NAVC.5 split —
  reconciled by a dated note appended to the contract this run.
- **REQ-NAVM-9 (head duties)** — stays with HeadManager; the interceptor adds no
  scroll/focus/title logic (no code needed; pinned by the suite's no-head-side-effect rows).
- **REQ-NAVM-10 (hash-gap compensation)** — spec §2.5 records the `hashchange`-listener
  decision; the contract's REQ list does not include it → not this ticket (no consumer
  lands here).

## Requirements (from the contract + spec §2)

1. **REQ-NAVM-1/2** — ONE delegated bubble-phase `click` listener on `document`, installed
   by `mountSpa` (never `createSpaRouter` — the 14 router-direct dom suites stay
   un-intercepted). The §2.1 ordered pipeline verbatim:
   `closest("a[href]")` → `e.defaultPrevented` → `button!==0` → modifier keys →
   `contenteditable` ancestor → `target` absent-or-`_self` (Link parity) / `download` /
   `data-spa-native` → `new URL` origin test (fail closed) → hash-only
   same-path+same-search skip (native fragment nav; MUST NOT re-fire `beforeLoad`) →
   `router.getMatchedRoutes(pathname)` in-tree (`**` predicate) → `RELOAD_STUB_IDS`
   membership → `preventDefault` + `router.navigate({href: pathname+search+hash})`.
   No component ports; `<a href>` markup unchanged. `e.isTrusted` never checked.
2. **REQ-NAVM-3** — clicks always push; the interceptor never emits `replace`;
   `resetScroll` never overridden.
3. **REQ-NAVM-4** — `RELOAD_STUB_IDS = {"/_authenticated/app/usage/r/$runId",
   "/_authenticated/p/$project/edit/$draftId", "/_authenticated/p/$project/f/$fid"}` —
   matched by generated route id (full `/_authenticated/` prefixes); `spaRouteFor` NEVER
   consulted for the stub decision (its prefix fallback would misclassify
   `/settings`/`/app/settings` client redirects).
4. **REQ-NAVM-6** — interception unconditional once in-tree; NEVER consults boot
   `surfaces`, `deviceClass`, `isSpaEnabled`, `twinForcesSsr`, `spaRouteFor().surfaces`;
   leaf pipelines own the verdict (the `postProjectHandoff` beforeLoad POST must fire
   exactly as on document entry).
5. **REQ-NAVM-7** — no preload at ship: `defaultPreload:"intent"` NOT enabled
   (`main.tsx:54` removed); a comment records the side-effecting-loader audit gate
   (`postProjectHandoff` POST / `confirmEmail` token / mark-read twins) for any future
   PRELOAD_SAFE allowlist ticket.
6. **REQ-NAVM-8 + REQ-NAVC-13** — `data-spa-native` dom-contract row + emitters on the
   three non-document GETs (`data-usage-csv` → `/usage.csv`; `data-export-download` →
   `/app/settings/data/export/download?id=`; the un-hooked `/p/:slug/export/ai-use/{md,docx}`
   pair). **Both-renderers resolution:** post-SPA.27/28 the SSR surface pages are deleted —
   the SPA surface modules are the ONLY surviving emitters (verified by census: A1-F7 +
   repo grep). The hook is added at every surviving emission site; the dom-contract row
   notes this.
7. **§2.8** — `state-map.ts:130,246` `/voices/<personaId>` → `/v/<persona>` dead-link fix.
8. **REQ-NAVT-8** — `spa/intercept.dom.test.tsx`: synthetic clicks over the real
   `routeTree` covering every A1/A2 decision row + the reloadDocument-redirect
   history-slot pin (A3-OQ1: `followRedirect` → `navigate({reloadDocument:true,
   replace:true})` → `window.location.replace` — router-core 1.171.33 `load-client.js`)
   + `navKey` (`location.state.key`) semantics pin.

## Acceptance criteria (from the contract)

- [ ] Every intercept.dom.test row behaves per the §2.1 pipeline incl. the
  non-document-GET skip, stub doc-nav, hash-only skip, and the `defaultPrevented`
  onboarding-preservation case *(deterministic · engineered)*
- [ ] ~~SsrHandoff commits replace-mode document nav; spy suites migrated and green~~
  — **stale row, predates the NAVC.5 split (2026-10-15 reconciliation note appended to
  the contract); REQ-NAVM-5 is 154a_NAVC.5's.** This run's deliverable: the interceptor
  itself; the replace seam is NOT implemented here (Out-of-scope is authoritative).
- [ ] `pnpm check:dom-contract` green with the new row emitted+asserted *(deterministic)*
- [ ] The `/p/:p/export/ai-use/*` + `/app/settings/data/export/download` + `/usage.csv`
  links still document-navigate (guard-table rows) *(deterministic)*
- [ ] verification green; BUILD_INDEX row + LEDGER advanced; operating clauses met
  *(agentic — universal AC)*

## Plan

1. `apps/web/src/spa/nav-intercept.ts` NEW — `RELOAD_STUB_IDS` + the §2.1 pipeline as an
   exported handler + `installSpaClickInterceptor(router)` (returns a disposer).
2. `apps/web/src/spa/main.tsx` — `mountSpa` installs the interceptor; `createSpaRouter`
   drops `defaultPreload:"intent"` (REQ-NAVM-7) with the audit-gate comment;
   `defaultPreloadStaleTime:0` stays (REQ-FW-7 convention, inert without preload).
3. `spa/dom.ts` — untouched (the replace seam is NAVC.5's); the stub short-circuit uses
   the existing `navigateDocument`.
4. `apps/web/src/dom-contract.ts` — `data-spa-native` row in `shared`.
5. Emitters: `spa/surfaces/usage.tsx:105`, `spa/surfaces/export.tsx:404,406`,
   `spa/surfaces/settings.tsx:872` gain `data-spa-native`.
6. `state-map.ts` — `/voices/` → `/v/` at the two sites.
7. `spa/intercept.dom.test.tsx` NEW — guard table over the real `routeTree`.
8. `spa/spa.dom.test.tsx:281` — the `defaultPreload === "intent"` pin flips to assert
   `defaultPreload` is unset (REQ-NAVM-7; the research note's "zero existing test
   updates" predates this requirement — spec wins; recorded as a deviation-of-note, not
   of spec).

## Test matrix (Phase 1.4)

Guard-table rows (synthetic clicks over the real routeTree, happy-dom):

| row | input | expected |
|---|---|---|
| plain in-tree | `<a href="/p/acme">` | preventDefault + commit (navKey changes, push) |
| defaultPrevented | anchor-level handler preventDefaults | skip (no commit, no assign) |
| button≠0 | `button:1` click | skip |
| modifiers | meta/ctrl/shift/alt clicks | skip each |
| contenteditable | anchor inside `[contenteditable]` | skip |
| target | `_blank` skips; `_self` intercepts | parity |
| download | `<a download>` | skip |
| data-spa-native | marked anchor | skip |
| external | `https://else`, `//else`, `mailto:` | skip (fail closed) |
| hash-only | same path+search, hash delta | skip; navKey unchanged; no beforeLoad |
| non-doc GETs | `/usage.csv`, `ai-use/md`, `export/download` | skip (native; `**`/miss rows) |
| stub ids | `/app/usage/r/x`, `/p/a/edit/d`, `/p/a/f/f` | preventDefault + assign(href verbatim) |
| client redirects | `/settings`, `/app/settings` | in-router commit → `/app/settings/account`; no assign |
| public funnel | `/`, `/login` | skip (not in-tree) |
| unknown SPA path | `/app/nope` | skip (native doc nav — parity) |
| verbatim href | `/p/a/v/v1?focus=1#finding-x` | committed href verbatim |
| search delta | `/usage` → `/usage?x=1` | intercept |
| absolute same-origin | `http://host/usage` | intercept |
| synthetic `.click()` | el.click() (isTrusted false) | intercept |
| OQ1 pin | `/p/acme` w/ handoff arm | push commits; `window.location.replace` (replace-mode doc nav — committed slot eaten) |
| navKey | push → new key; skips → same key | pinned |

## Progress

- 2026-10-15T01:13Z — Phase 0 complete: DEFERRALS read (no NAVC-scoped rows), LEDGER read
  (CURRENT STATE: nextTicket NAVC.1, chainTip verif-1 @ fd5ade2), AGENTS.md loaded,
  branch forked, anchors read (main.tsx/dom.ts/states.tsx/routeTree.gen.ts stub ids
  verified at the three `_authenticated` ids; contracts/spa.ts `spaRouteFor` prefix
  fallback confirmed the misclaim; happy-dom `location.replace`/`assign` spyable;
  `defaultPreload:"intent"` currently ON at main.tsx:54 → must drop per REQ-NAVM-7;
  `navKey` = `location.state.key` — already HeadManager's commit signal, head.tsx:29).
- Empirical probes run (deleted): `getMatchedRoutes` on the real tree — `/usage.csv` →
  found:null; `ai-use/md` → found `/p/$project/export` with `**="ai-use/md"`;
  `export/download` → found `/app/settings/data` with `**="export/download"`; stubs →
  their real route ids; `/settings`,`/app/settings` → in-tree (client redirects);
  `/`,`/login`,`/bff/*`,`/app/nope` → found:null or `**`-marked → NOT in-tree.
- 2026-10-15T05:57Z — RESUMED after the orchestrator crash + ancestor repairs: CIREP.1
  re-forked the chain to `db40fa2`; the operator landed the libcap-ng mirror-fallback
  CI repair on verif-1 (`708ed10`, incl. `625d28a` privsep capability-skip); this
  branch re-forked `db40fa2` → `708ed10` via `git rebase --onto` (clean; the 8-path
  WIP stash popped byte-identical to the recorded baseline, force-pushed as
  `adfa980`). WIP audit vs Plan: all 6 modified files + `nav-intercept.ts` match the
  planned edits (interceptor module, `mountSpa` install, `defaultPreload` dropped,
  `data-spa-native` row + 4 emitters, `state-map` dead-link fix). Remaining:
  green the TanStack `AnyRouter`/`getMatchedRoutes` typings (crash point), the
  intercept.dom.test guard-table suite, the `defaultPreload` pin flip, the contract
  reconciliation note, then full verification + PR.

## Gap table

Spec re-read fresh at Phase 4 (contract + spec §2); the Phase-0.3 extraction held — no drift.

| item (spec §) | required layer | achieved layer | status | evidence |
|---|---|---|---|---|
| REQ-NAVM-1/2 — ONE delegated bubble-phase `click` listener on `document`, installed by `mountSpa` (never `createSpaRouter`); §2.1 ordered pipeline verbatim | engineered | engineered | met | `spa/nav-intercept.ts:43-119` (`handleSpaClick` — the 11-step pipeline in order), `installSpaClickInterceptor` (:127-131); `spa/main.tsx:82` installs from `mountSpa` (never `createSpaRouter`); `spa/intercept.dom.test.tsx` (46 tests, every matrix row) |
| REQ-NAVM-3 — push-only; no `replace`, `resetScroll` never overridden | engineered | engineered | met | `nav-intercept.ts:119` (`router.navigate({href})` only); the `{href}`-only call shape is pinned in `intercept.dom.test.tsx` `expectIntercepted` (toHaveBeenCalledWith `{href}`) |
| REQ-NAVM-4 — `RELOAD_STUB_IDS` by generated route id; `spaRouteFor` never consulted | engineered | engineered | met | `nav-intercept.ts:32-36` (full `/_authenticated/` ids; routeTree.gen.ts:804/818/825 verified); stub rows assert `assign(href)` verbatim + no client commit; `/settings`+`/app/settings` rows prove client redirects resolve in-router |
| REQ-NAVM-6 — unconditional once in-tree; no boot/`deviceClass`/`twinForcesSsr`/`spaRouteFor` consult; handoff POST fires | engineered | engineered | met | `nav-intercept.ts` contains zero boot/surfaces consults; OQ1 row asserts `POST /bff/p/acme/handoff` fired under interception |
| REQ-NAVM-7 — `defaultPreload:"intent"` NOT enabled; audit-gate comment | engineered | engineered | met | `main.tsx:54-62` (option absent + the side-effecting-loader gate comment); `spa.dom.test.tsx` pin flipped to `toBeUndefined()` |
| REQ-NAVM-8 + REQ-NAVC-13 — `data-spa-native` row + emitters on the 3 non-doc GETs | engineered | engineered | met | `dom-contract.ts` shared row; emitters at `usage.tsx:105`, `export.tsx:404,406`, `settings.tsx:872`; `check:dom-contract` green (19/19 shared hooks emitted+asserted). **"Both renderers" resolution:** post-SPA.27/28 the SSR surface pages are deleted — the SPA modules are the only surviving emitters (grep-verified: `server.ts` registers the GETs, emits no anchors); the clause is satisfied at every surviving emission site, inert on SSR (no listener installed). |
| §2.8 — `state-map.ts:130,246` `/voices/` → `/v/` | engineered | engineered | met | `state-map.ts:130,246`; the `/v/p1` intercepts-/`/voices/p1` skips pair is pinned in the suite |
| REQ-NAVT-8 — guard-table suite over the real routeTree | engineered | engineered | met | `intercept.dom.test.tsx` — 46 tests covering every §2.1 decision row + A3-OQ1 history-slot pin + navKey semantics |
| AC — stale SsrHandoff row | n/a | n/a | **not this ticket — reconciled** | REQ-NAVM-5 is `154a_NAVC.5`'s (contract Out-of-scope is authoritative); dated reconciliation note appended to the contract 2026-10-15 (row text untouched) |
| AC — non-doc GETs still document-navigate | deterministic | engineered | met | unmarked + `data-spa-native`-marked rows for `/usage.csv`, `ai-use/{md,docx}`, `export/download` — all skip (no commit, no assign) |
| AC — universal (verification green, BUILD_INDEX, LEDGER advanced, operating clauses) | agentic | — | pending | closeout below |

**Out-of-scope confirmed untouched:** `spa/dom.ts` unchanged (no `replace`/`replaceDocument` —
NAVC.5's); no `data-nav-count`/`data-mounted` pending work (NAVC.2); no registry/freshness
changes (NAVC.3); zero component ports; no `<Link>` introduced.

## Evidence log

- `pnpm install` — clean (lockfile up to date), 2026-10-15T05:58Z.
- `pnpm turbo build lint typecheck` — 135/135 tasks green post-rebase (`adfa980` + WIP).
- `pnpm exec vitest run src/spa/intercept.dom.test.tsx` (in `apps/web`) — **46/46 pass**.
- `pnpm exec vitest run src/spa/spa.dom.test.tsx` — 19/19 (incl. the flipped `defaultPreload` pin).
- `pnpm check:dom-contract` — OK (829 manifest entries; `data-spa-native` emitted+asserted).
- `pnpm check:licenses` / `check:protocol-markers` / `check:no-cookies` / `check:spa-budget` /
  `check:spa-env` — all green.
- `check-build-memory.sh .` — 0 violations (8 legacy warnings).
- `node docs/build/tools/check-append-only.mjs --base adfa980` — **OK** (history only grew).
- `pnpm test` — full suite **green on re-run**: `Test Files 491 passed | 1 skipped (492)` ·
  `Tests 5627 passed | 4 skipped (5631)` (647 s). First attempt: 5625 pass / 2 fail — both
  `apps/convert/src/server.test.ts` `beforeEach` timeouts under parallel load (the ~200 s
  privsep Docker leg starved the local listener); the file passes standalone in 268 ms and
  the diff touches nothing in `apps/convert` — environmental flake, cleared by the re-run.
- OQ1 empirically pinned at `@tanstack/router-core@1.171.33`: `redirect({reloadDocument:true})`
  mid-beforeLoad → `navigate({href, reloadDocument:true, replace:true, ignoreBlocker:true})` →
  `documentNavigation` → `window.location.replace(href)` (`load-client.js:824`,
  `router.js:810-827`). The suite asserts the committed push precedes the replace (slot eaten).

## Evidence report

- **REQ-NAVM-1/2 (delegated listener + ordered pipeline):** `nav-intercept.ts`
  `handleSpaClick` (:43-119) implements the §2.1 sequence verbatim —
  `closest("a[href]")` → `defaultPrevented` → primary button → modifiers →
  contenteditable → `target`/`download`/`data-spa-native` → same-origin URL parse →
  hash-only skip → in-tree match (`getMatchedRoutes`, `**`-fuzzy rejected) →
  `RELOAD_STUB_IDS` → `preventDefault` + navigate. ONE `document` bubble listener,
  installed by `mountSpa` (`main.tsx:82`) — `createSpaRouter` untouched, so
  router-direct DOM suites stay un-intercepted (pinned by the install/dispose tests).
- **REQ-NAVM-3 (push semantics):** the only router call is `navigate({href})` —
  the verbatim `{href}` call-shape is pinned; no `replace`, no `resetScroll`
  override; `scrollRestoration: true` preserved.
- **REQ-NAVM-4 (reload stubs):** the three generated route ids
  `/_authenticated/app/usage/r/$runId`, `/_authenticated/p/$project/edit/$draftId`,
  `/_authenticated/p/$project/f/$fid` preventDefault + `navigateDocument(verbatim
  href)`; suite asserts `window.location.assign` received the verbatim href and no
  client commit occurred. `spaRouteFor` never consulted.
- **REQ-NAVM-6 (renderer boundary):** the interceptor holds zero consults of boot
  `surfaces`/`deviceClass`/`isSpaEnabled`/`twinForcesSsr`/`spaRouteFor`; forced-SSR
  stays a server + leaf verdict — the OQ1 row proves a `/p/acme` click commits
  in-router and the leaf's `postProjectHandoff` POST still fires.
- **REQ-NAVM-7 (no preload):** `defaultPreload:"intent"` removed with an audit
  comment naming the side-effecting loaders (handoff POST, email-confirm token
  consumption, mark-read GETs); `spa.dom.test.tsx` pin flipped to `toBeUndefined()`.
- **REQ-NAVM-8 + REQ-NAVC-13 (`data-spa-native`):** shared manifest row +
  emitted on `/usage.csv` (`usage.tsx:105`), `/p/:project/export/ai-use/{md,docx}`
  (`export.tsx:404,406`), `/app/settings/data/export/download` (`settings.tsx:872`);
  `check:dom-contract` green — emitted + asserted.
- **REQ-NAVT-8 (guard suite):** `intercept.dom.test.tsx` — **46 tests** over the
  real routeTree covering every §2.1 decision row: pre-defaulted, non-primary
  buttons, each modifier, contenteditable (+`false` island intercepts),
  `_blank`/`_self`/`download`/`data-spa-native`, external/protocol-relative/opaque
  schemes, hash-only same-path skip vs search-delta intercept, public funnel,
  unknown `/app/nope`, all three non-doc GETs, all three stub ids, `/settings` +
  `/app/settings` client-redirect rows (the `spaRouteFor` trap), verbatim
  query/hash, absolute same-origin, synthetic `.click()` (no `isTrusted` gate),
  OQ1 push→`location.replace`, navKey commit/skip semantics, disposer detach.
- **§2.8 state-map defect:** `/voices/<id>` → `/v/:persona` at
  `state-map.ts:130,246`; the intercepts/skips pair is pinned in the suite.
- **OQ1 resolution (spec §2.4):** empirical at `@tanstack/router-core@1.171.33` —
  `redirect({reloadDocument:true})` mid-beforeLoad resolves to
  `navigate({href, reloadDocument:true, replace:true})` → `documentNavigation` →
  `window.location.replace(href)`. The suite asserts the committed push precedes
  the replace — the history slot is eaten, matching §2.4's designed semantics.
- **AC coverage:** every contract AC is mapped in the gap table; the stale
  SsrHandoff row is reconciled (REQ-NAVM-5 → NAVC.5) via the dated append-only
  contract note; all Out-of-scope items confirmed untouched (`spa/dom.ts`, no
  `data-nav-count` work, no registry changes, zero `<Link>` ports).
- **Deferred:** CI for this PR — pending at closeout (the recurring first-read
  class; honestly recorded, never claimed green).

## Closeout

- Gates: `pnpm turbo build lint typecheck` 135/135 · all `check:*` gates green ·
  `check-build-memory.sh` 0 violations · `check-append-only` vs `adfa980` OK.
- PR: `stevevitali/navc-1-delegated-interceptor` → base
  `stevevitali/verif-1-composed-ffbb8ad`, mergePolicy=OPERATOR (opened, not merged);
  `ci:` pending at closeout (the recurring first-read class).
