# 25_spa-navigation-ia — Navigation/IA: the post-SPA route tree and its semantics

**Stream:** C
**Researched:** 2026-10-07
**Author:** explore-subagent (C2 nav/IA worker)
**Ledger rows covered:** C2
**Confidence overall:** high

## Findings

### F1 — The route surface splits into three ownership classes; only ~45 document GETs enter the SPA tree

**Claim:** The ~120 census rows collapse to (a) ~10 public/marketing/auth-funnel document GETs that stay SSR under Q-1 (`/`, `/invite`, `/pricing`, `/signup`, `/login`, `/showcase`, plus `/logout` as a POST), (b) ~45 auth'd document GETs that become the TanStack Router tree, and (c) ~90 non-document registrations that are BFF transports or mutation POSTs and never become routes at all.
**Status:** VERIFIED
**Evidence:** `apps/web/src/server.ts` registrations (route table in `docs/research/01_route-census.md`, ~181 registrations → ~120 rows); `apps/web/src/routes.tsx:72-140` (33-entry manifest covering exactly the document set); non-HTML transports enumerated in census F3/F6 (`/api/auth/*` :1503-1510, SSE :4299-4350, beacons :3117-3151, binary downloads :2889-2903,5080-5116,5133-5151,2725-2734, assets :5645-5667).
**Retrieved:** 2026-10-07T21:40:00Z
**Implication for the spec:** The SPA router registers exactly the auth'd document set; mutation POSTs and the JSON/SSE/binary/beacon endpoints stay BFF surface the SPA calls (B3's row), and public documents stay SSR documents the SPA navigates *to*, not through.
**Outline delta:** CONFIRMS Q-1/Q-2; EXTENDS with the three-class partition.

### F2 — The IDE chrome is already route-scoped: exactly ~11 project routes carry `data-ide`

**Claim:** The §5.1 shell (panes, palette, keymap, feed, findings chords) mounts only where `ideContext(c, session, row, …)` supplies `data.ide` — `/p/:project` home, `/import` + `/import/preview`, `/run`, `/review/:runId`, `/r/:runId`, `/revisions/:cid`, `/v/:v`, `/v/:n/diff/:m`, `/a/:artifactId`, `/export`. Outline, outline/promote, figures, visualize, obligations/new, project settings, project usage, voice/reseed, and every global route (`/app`, `/app/inbox`, `/app/settings/*`, `/voices`, `/v/:persona`, `/usage`, `/billing/*`) render without the shell.
**Status:** VERIFIED
**Evidence:** `grep ideContext\(c, session` → `server.ts:3277,3628,3647,3662,3685,3700,3763,3833,3981,3997,4043,4057,4081,4090,4219,4277,4443,4661,4761,4866,4912,5065` (all inside `/p/:project` handlers); absence confirmed at `voiceReseedElement` render (`server.ts:3401-3404`), `outlineElement` (`:1116-1130`), `figuresElement`/`figureCardElement` (`:1357,1376`), `settingsElement` (`:2420,2495,2559,2633,2664`), `obligationNewElement` (`:4530-4563`); mount rule `render.tsx:149-150` (census F4).
**Retrieved:** 2026-10-07T21:42:00Z
**Implication for the spec:** The SPA's IDE shell maps to a nested layout under `/p/$project` applied to exactly those branches — the shell is opt-in per route, not app-wide, and today's scoping is the parity contract.
**Outline delta:** EXTENDS REQ-ISL-8 — keymap scope is route-level AND focus-zone-level.

### F3 — The flash-param grammar is a ~60-key user-visible contract, asserted live by journeys

**Claim:** `server.ts` reads ~60 distinct query keys as one-shot mutation flashes (`?saved`, `?notice`, `?disposed`, `?bulkdone`, `?applied`, `?promoted`, `?obligated`, `?ferr`, `?fmsg`, `?derror`, `?restored`, `?noted`, `?created`, `?cn`, `?cu`, `?commented`, `?added`, `?cancelled`, `?corrected`, `?reconstruct`, `?build_failed`, `?approvals`, `?error`, `?obligation`, `?voice_locked`) and durable view state (`?gate`, `?bulk`, `?bsec`, `?triage`, `?tab`, `?sample`, `?layout`, `?restore`, `?sev|kind|disp|sec|url|sug|obl`, `?advanced`, `?rename`, `?q`, `?voice`, `?protocol`, `?sort`, `?archived`, `?deleted`, `?workflow`, `?scope`, `?words`, `?rigor`, `?tier`, `?modelTier`, `?toggle.*`, `?draftId`, `?corrKind`, `?entry`, `?held`, `?intent`, `?src`, `?qk`, `?request`, `?kind`, `?figure`, `?prior`, `?slug`, `?back`, `?confirmEmail`, `?verified`, `?focus`, `?hc`); journeys wait for `?disposed=`/`?bulkdone=`/`?applied=` URLs and click `?gate=`/`?hc=`/`?created=` links, so the vocabulary is test-pinned.
**Status:** VERIFIED
**Evidence:** `grep req\.query` → `server.ts:542,573,1125-1126,1243,1381-1382,1569,1619-1621,1745,1857,1866-1871,1912,1918,2038,2049,2155,2163,2168,2409,2424-2425,2499,2563-2564,2637,2663,2683,2797-2798,2938-2941,3097,3192,3236,3310,3313-3324,3679,3840,4157,4178-4208,4230-4240,4262,4658,4747,4753,4775,4792,4861,4863,4947,5071-5072,5282-5308`; journey asserts `packages/journeys/src/stb5a.ts:958,1057-1059,1277-1301`, `steps.ts:288-293`, `registry.ts:243,261`; REQ-INV-3 (`01_route-census.md:268`).
**Retrieved:** 2026-10-07T21:44:00Z
**Implication for the spec:** Flash params remain first-class, deep-linkable URL state rendered through per-route `validateSearch` — they do NOT become disposable toast events; `navigate({ search, … })` after a client-side mutation re-emits the same vocabulary.
**Outline delta:** CONFIRMS REQ-INV-3; EXTENDS with the full key inventory (§Search-param schema below).

### F4 — `?focus=1` carries two distinct semantics, both contract

**Claim:** On every IDE-framed route `?focus=1` is a shareable view flag the island applies once then strips via `history.replaceState`; on `/p/:project` specifically it additionally suppresses the REQ-IDE-48 unread-`run_finished` redirect (a `?focus=1` landing does NOT hand off to the finished run's walkthrough).
**Status:** VERIFIED
**Evidence:** `ide.ts:60-65` (apply + `replaceState` strip; file header `:6-7` "the ONE shareable pane URL flag"); server `initialView` stamp `server.ts:542` inside `ideContext`; hand-off suppression `server.ts:3192-3207` (`if (c.req.query("focus") !== "1" && deps.dataSource.getInbox)`).
**Retrieved:** 2026-10-07T21:45:00Z
**Implication for the spec:** `focus` is the sole apply-then-strip param (validated, consumed into pane state, removed via `replace` nav); the `/p/$project` index route's conditional-redirect logic must check the raw param before stripping.
**Outline delta:** EXTENDS REQ-ISL-10.

### F5 — Conditional landing rewrites are server-side decisions by construction

**Claim:** Two document GETs conditionally 302 away from themselves: `/app` (showcase-first-open vs carried-file precedence, `server.ts:1898-1927`) and `/p/:project` (unread-finished-run hand-off, `server.ts:3187-3207`); both need async workspace reads (`listProjects` + `getShowcaseEntry`/`getInbox`) that today run inside the document request.
**Status:** VERIFIED
**Evidence:** `server.ts:1898-1927` (ownRows==0 && showcaseRows>0 → `/app/new?entry=…&held=1` or `/p/:slug/review/:runId#finding-…`); `server.ts:3187-3207` (mark-read + `c.redirect(finishedRow.href)`); census open question 6 (`01_route-census.md:262`).
**Retrieved:** 2026-10-07T21:46:00Z
**Implication for the spec:** Keep the rewrites at the BFF document boundary: the server evaluates precedence on the document request and either 302s or serves the SPA shell — an SPA `beforeLoad` client-side equivalent requires new BFF JSON endpoints (open question 1) and is not required for parity on hard loads, only on client-side entries.
**Outline delta:** ANSWERS census open question 6 with a server-boundary recommendation.

### F6 — Editor teardown is already designed for it; keep-alive is an enhancement, not a requirement

**Claim:** Today every navigation is a document unload that kills the ProseMirror `EditorView`, the Hocuspocus provider, and the Y.Doc — yet no edits are lost because the four-layer autosave (Y.Doc → `y-indexeddb` `rhema-page/draft:<id>` → WS → debounced server materialization) + pagehide flush make unmount safe by design.
**Status:** VERIFIED
**Evidence:** `02_island-contract-map.md` F3 (`page.ts` autosave layers, pagehide `:354-358`), F4 (rebind keeps ONE Y.Doc, fresh provider; `collab.ts:185-218`); REQ-ISL-2/REQ-ISL-4; `/p/:project` also mounts the Page on the working head (`pages.tsx:747-751`, contract table row `page.ts`).
**Retrieved:** 2026-10-07T21:47:00Z
**Implication for the spec:** A keep-alive policy that preserves the editor session only *within* the project branch, keyed by `(projectId, draftId)`, is strictly-better-than-today and cheap; unmount-on-nav is already safe. The Page mounts on `/p/:project`, `/v/:v`, and `/a/:artifactId` — three of them inside one branch.
**Outline delta:** EXTENDS REQ-ISL-2 with a route-scope lifecycle.

### F7 — Four redirect-only document routes exist; their semantics split server vs client cleanly

**Claim:** `/p/:project/edit/:draftId` (302 → `/v/:draftN`, `?noted` preserved), `/p/:project/f/:fid` (302 → dossier anchor via `resolveFinding`), `/app/usage/r/:runId` (302 → `/p/:slug/r/:runId#report` via `getRunReport`), and `/settings` + `/app/settings` (302 → `/app/settings/account`) are pure redirect surfaces; `/settings/billing` is a full alias mount, not a redirect.
**Status:** VERIFIED
**Evidence:** `server.ts:4935-4949` (edit, non-exact resolution comment `:4940-4941`), `:4627-4642` (finding deep link, §5.7 shared href), `:4288-4295` (usage deep link), `:2394-2401` (legacy settings), `:2947-2955` (billing dual-mount, census F8).
**Retrieved:** 2026-10-07T21:48:00Z
**Implication for the spec:** `/edit/:draftId` stays a BFF-level redirect (operator constraint) — but its `/doc` JSON twin lets the SPA resolve the target client-side without a new endpoint (`GET /doc` → `draftId`/`draftN` → `throw redirect({to:"/p/$p/v/$n"})`); `/f/:fid` and `/app/usage/r/:runId` need `resolveFinding`/`getRunReport` — keep them server-side 302s for external deep links and give client-side nav a document-handoff fallback.
**Outline delta:** EXTENDS census F8 into per-route SPA dispositions (§Redirect surfaces).

### F8 — Cross-route client state already lives in localStorage/IndexedDB/CustomEvents — none of it in the URL or the server session

**Claim:** The full cross-route state inventory is: pane arrangement `paneStorageKey(userId, projectId)` → `rhema:ide:v1:*`, authorship overlay `rhema:authorship:v1:<projectId>`, typography `rhema:font:v1` / `rhema:reader-step:v1`, theme mirrors (`data-app-theme`/paper `rhema:paper:v1:<slug>` boot-read), the IDB hold `rhema-hold/holds/landing-dropzone`, the PM offline store `rhema-page/draft:<id>`, and three `window` CustomEvents (`rhema:authorship`, `rhema:restore-point`, `rhema:finding-action`); findings-desk selection (`findingIx`, `data-selected`) is the only ephemeral cross-surface state, and it is DOM-scoped.
**Status:** VERIFIED
**Evidence:** `ide.ts:47` (storageKey), `:211-243` (AUTHORSHIP_KEY + event), `:37-38` (font/step keys), `:50-131` (state apply/persist), `:612-680` (selection); `theme.ts:52-89` (boot resolution + mirrors); `landing.ts` F8 (IDB hold); `collab.ts` (IDB store); event list `02_island-contract-map.md` F5.
**Retrieved:** 2026-10-07T21:50:00Z
**Implication for the spec:** Everything except findings selection survives client-side nav for free (same document lifetime); the SPA must keep the CustomEvent contracts verbatim because the React port of the Page still listens for `rhema:authorship`; findings selection persists across same-route search changes only (component state, not URL).
**Outline delta:** CONFIRMS REQ-ISL-10/13; EXTENDS with the desk-selection policy.

### F9 — SSR 404s are surface-shaped, not generic; the SPA must reproduce both levels

**Claim:** Unknown slugs render `notFoundElement` at status 404 globally, but several surfaces render their *own* not-found element at 404 (outline renders `outlineElement` at 404, figure card `figureCardElement` at 404, voiceReseed/export similar), meaning the not-found chrome is scoped, not uniform.
**Status:** VERIFIED
**Evidence:** `server.ts:3186,4147,4627-4640,4729,4735` (global `notFoundElement`); `server.ts:1058-1062` (`outlineElement` at 404), `:1374` (`figureCardElement` at 404), `:3399,5062` (surface-element 404s); catch-all `app.all("*")` `server.ts:5669`; census F7.
**Retrieved:** 2026-10-07T21:51:00Z
**Implication for the spec:** `notFoundMode:"fuzzy"` (TanStack default) reproduces this exactly: the `p.$project` layout and per-route `notFoundComponent`s preserve the surface chrome for missing children, while the root's `defaultNotFoundComponent` covers unmatched paths and unknown slugs — and the server catch-all stays for paths outside the SPA tree.
**Outline delta:** EXTENDS census F7 to a router-level mapping.

### F10 — Boundary crossings are document semantics: `/logout` is a POST, external 302s are navigations, downloads are navigations

**Claim:** `POST /logout` clears the session server-side and 302s to `/` (no session check — `endSession` no-ops anonymously); Stripe checkout/portal/payment-link and Google OAuth are server-minted 302s to allowlisted origins (the MAINT.5 `form-action` lesson); binary exports and the presigned account-export download are `content-disposition` Responses/302s — all of which are document-level acts a client router must never intercept.
**Status:** VERIFIED
**Evidence:** `server.ts:1842-1845` (logout), census F6 (`server.ts:255-260,198-203,353` redirect allowlists + CSP `form-action`), `:2725-2734` (presigned 302), `:5080-5116,2896-2902,5144-5150` (binary Responses); T6 thesis (`research-ledger.md:44-46`).
**Retrieved:** 2026-10-07T21:52:00Z
**Implication for the spec:** The SPA boundary rule is categorical: intra-app paths → `router.navigate`; SSR-owned paths, external allowlisted 302 targets, binary downloads, and `/logout` → real document navigations (`<a href>`, `location.assign`, or a native `<form method="post">`), never `fetch`-and-render.
**Outline delta:** CONFIRMS T6; EXTENDS with the categorical rule.

## Design: the SPA route tree

The router registers every auth'd document path **on day one** (strangler flips happen at the component/BFF level, not by tree membership — Q-5). Route ids below are code-based (`createRoute` ids); file-based naming is B2's choice and immaterial to the contract.

```
__root                                    (SPA shell; theme booted at document load)
└─ _authenticated                         (pathless layout: session guard — a missing
                                           session throws redirect({ href:"/login" })
                                           = a DOCUMENT nav, since /login is SSR)
   ├─ app.index                /app                         (conditional rewrite — server)
   ├─ app.new                  /app/new
   ├─ app.newPreview           /app/new/preview             (?qk required → redirect /app/new)
   ├─ app.inbox                /app/inbox
   ├─ app.usageRun             /app/usage/r/$runId          (redirect surface — server canonical)
   ├─ usage                    /usage
   ├─ billingReturn            /billing/return              (poll surface — meta-refresh→Query refetch)
   ├─ settings                 /app/settings                (layout)
   │  ├─ settings.index        /app/settings                → beforeLoad redirect → ./account
   │  ├─ settings.account      /app/settings/account        (?confirmEmail consumed — open Q2)
   │  ├─ settings.preferences  /app/settings/preferences
   │  ├─ settings.notifications/app/settings/notifications
   │  ├─ settings.integrations /app/settings/integrations
   │  ├─ settings.data         /app/settings/data
   │  └─ settings.billing      /app/settings/billing
   ├─ legacySettings           /settings                    → beforeLoad redirect → /app/settings/account
   ├─ legacySettingsBilling    /settings/billing            (alias render of Billing — parity, F7)
   ├─ voices                   /voices
   ├─ voicesNew                /voices/new
   ├─ voiceDetail              /v/$persona
   └─ p.$project               /p/$project                  (project layout — owns IDE shell,
      │                                                       editor-session provider, feed EventSource)
      ├─ p.index               /p/$project                  IDE · Page mount (working head)
      ├─ p.import              /p/$project/import           IDE
      ├─ p.importPreview       /p/$project/import/preview   IDE (?qk required → redirect ../import)
      ├─ p.run                 /p/$project/run              IDE
      ├─ p.review              /p/$project/review/$runId    IDE · heaviest search schema
      ├─ p.report              /p/$project/r/$runId         IDE
      ├─ p.revision            /p/$project/revisions/$cid   IDE
      ├─ p.page                /p/$project/v/$v             IDE · $v = "working" | positive int
      ├─ p.diff                /p/$project/v/$n/diff/$m     IDE · $n,$m positive ints
      ├─ p.artifact            /p/$project/a/$artifactId    IDE · read-only Page mount
      ├─ p.editRedirect        /p/$project/edit/$draftId    redirect-only (BFF canonical — F7)
      ├─ p.findingRedirect     /p/$project/f/$fid           redirect-only (server canonical)
      ├─ p.export              /p/$project/export           IDE (GET dialog; POST → binary doc-nav)
      ├─ p.outline             /p/$project/outline          no shell (parity F2)
      ├─ p.outlinePromote      /p/$project/outline/promote  no shell
      ├─ p.figures             /p/$project/figures          no shell
      ├─ p.figureCard          /p/$project/figures/$figureId no shell
      ├─ p.visualize           /p/$project/visualize        no shell
      ├─ p.obligationNew       /p/$project/obligations/new  no shell
      ├─ p.settings            /p/$project/settings         no shell
      ├─ p.projectUsage        /p/$project/usage            no shell
      └─ p.voiceReseed         /p/$project/voice/reseed     no shell
```

**Param validation** (`parseParams`/`validateSearch`); a failed parse ⇒ `notFound()`:

| Param | Type | Notes |
|---|---|---|
| `$project` | non-empty slug string | opaque; the loader resolves slug→row and throws `notFound()` on miss (today's `!row` ⇒ `notFoundElement`) |
| `$v` | `"working" \| /^\d+$/` | `working` resolves the editable head; a 404 on `working` redirects to `/p/$project` (server.ts:4726-4729), numeric stays a true 404 |
| `$n`, `$m` | `/^\d+$/` | diff endpoints |
| `$runId`, `$cid`, `$fid`, `$figureId`, `$draftId`, `$artifactId`, `$persona` | opaque non-empty string | ULID-ish ids; no shape assertion today — keep opaque (server resolves) |
| `$runId` on `app.usageRun` | opaque | redirect surface |

**Not in the tree** (BFF transports + public SSR): every `POST`, `/api/auth/*`, `/p/:project/palette-search`, `/ide/theme`, `/p/:project/paper-theme`, `/p/:project/chat/*`, `/p/:project/edit/:draftId/{doc,save,note,cancel-run,revise}`, `/p/:project/r/:runId/events`, `/p/:project/gates/:gid/activity`, `/a/{dwell,landing,acq}`, `/usage.csv`, `/p/:project/export/ai-use/:fmt`, `/app/settings/data/export/download`, `/assets/*`, `/healthz`, favicons, `/`, `/invite`, `/pricing`, `/signup`, `/login`, `/showcase`, `/logout`.

## Design: search-param schema

`validateSearch` per route. **Retention policy:** every flash/state key stays in the URL (deep-linkable outcomes are the contract — F3); the apply-then-strip set is exactly `focus` (into pane state, `replace` nav) and `hc` (consumed by the hold handshake, then `replace`-stripped); `verified` and `confirmEmail` are one-shot side-effect keys (fire once per mount, api dedupes; `confirmEmail` consumption is open Q2).

| Route | `validateSearch` keys |
|---|---|
| `app.index` | `q?`, `voice?`, `protocol?`, `sort?:"title"`, `archived?:"1"`, `deleted?:"1"`, `verified?:"1"`, `entry?`, `held?:"1"` |
| `app.new` | `entry?:"scratch"\|"outline"\|"draft"`, `held?:"1"` |
| `app.newPreview` | `qk` (missing ⇒ redirect `/app/new`), `src?` |
| `app.inbox` | — |
| `usage`, `billingReturn` | `cancelled?:"1"` (billingReturn only) |
| `settings.account` | `saved?`, `notice?`, `confirmEmail?` (consumed → `?notice=`) |
| `settings.{preferences,notifications,integrations,data,billing}` | `saved?`, `notice?` |
| `p.index` | `focus?`, `rename?`, `created?`, `cn?`, `cu?`, `hc?`, `derror?`, `obligation?`, `voice_locked?` |
| `p.importPreview` | `qk` (missing ⇒ redirect `../import`), `src?` |
| `p.run` | `workflow?`, `scope?`, `words?`, `protocol?`, `rigor?`, `tier?`/`modelTier?`, `toggle.<key>?`, `draftId?`, `corrKind?`, `notice?` |
| `p.review` | `disposed?`, `gate?`, `bulk?`, `bsec?`, `bulkdone?`, `bulkskip?`, `applied?`, `promoted?`, `obligated?`, `ferr?`, `fmsg?`, `triage?`, `sev?,kind?,disp?,sec?,url?,sug?,obl?`, `focus?` |
| `p.report` | `advanced?`, `focus?` |
| `p.revision` | `commented?`, `focus?` |
| `p.page` | `restore?`, `restored?`, `noted?`, `hc?`, `focus?` |
| `p.diff` | `layout?:"side"\|"inline"\|"moves"`, `commented?`, `focus?` |
| `p.artifact`, `p.export` | `focus?`; export adds `error?`, `added?` |
| `p.outline` | `saved?`, `notice?`, `slug?` |
| `p.outlinePromote` | `scope?`, `threadId?`, `turnId?`, `slug?` |
| `p.figures`, `p.figureCard` | `saved?`, `notice?` |
| `p.settings` | `saved?`, `notice?`, `approvals?:"saved"\|"invalid"` |
| `voiceDetail` | `tab?:"description"\|"samples"`, `sample?`, `saved?`, `added?`, `cancelled?`, `corrected?`, `reconstruct?`, `build_failed?` |
| `p.obligationNew` | `back?` (same-origin `/p/…` confinement — `safeBack`, server.ts:5682-5685) |
| `p.editRedirect` | `noted?` (preserved through the redirect) |

Unknown keys are tolerated (forward-compatible — today's handlers simply ignore unrecognized params).

## Design: redirect surfaces

| Surface | Today | SPA disposition |
|---|---|---|
| `/app` precedence (showcase/intent) | server 302 → dossier or `/app/new` | **server-side**: the BFF evaluates precedence on the document request and 302s or serves the shell (F5) |
| `/p/:project` unread hand-off | server mark-read + 302 → run href | **server-side** on document load; client-side entry replication needs a small BFF check — open Q1 |
| `/app/usage/r/:runId` | server 302 → `/p/:slug/r/:runId#report` | server 302 canonical (emails/deep links); the registered SPA route's `beforeLoad` performs a document nav to let the server answer (no internal link should target it — `/usage` rows already know their slug) |
| `/p/:project/f/:fid` | server 302 → dossier `#anchor` | server 302 canonical; SPA `beforeLoad` document-nav fallback for client-side entry (a JSON `resolveFinding` endpoint is a possible B3 follow-up) |
| `/p/:project/edit/:draftId` | server 302 → `/v/:draftN` | **BFF canonical** (operator constraint); SPA `beforeLoad` may resolve client-side via the existing `/doc` JSON (`draftN`) and `throw redirect({to:"/p/$project/v/$n", search:{noted}})` — no new endpoint |
| `/settings`, `/app/settings` | server 302 → `/app/settings/account` | client `throw redirect` in `beforeLoad`; server 302 retained during strangler for hard loads |
| `/settings/billing` | alias mount (renders billing page + posts) | alias **route rendering Billing** (parity), or a redirect — alias-render preserves today's mount semantics including POST targets |
| `/p/:project/v/working`, no drafts | 302 → `/p/:slug` | client `throw redirect` in loader on resolve-miss |
| preview routes without `qk` | 302 → owning page | client `throw redirect` in `beforeLoad` |
| Stripe/OAuth/presigned/binary | server 302/Response out | **document navs** (F10) — never router navs |
| `?confirmEmail` consumption | server consume → `?notice=` bounce | needs a BFF endpoint or pre-shell server step — open Q2 |

## Design: keep-alive & cross-route state

- **Editor session (the Y.Doc):** a `PageSessionProvider` lives in the `p.$project` layout, memoizing the live `CollabPageState`/`EditorView` keyed `(projectId, draftId)`. Navigating `/p/:project` ↔ `/p/:project/v/:v` ↔ `/a/:artifactId` *within* the same draft keeps the session warm (the component is shared via the layout, not remounted); a draft change triggers the existing `rebind` path (fresh provider, same Y.Doc — collab.ts:201-218); leaving the `/p/:project` subtree unmounts and tears down — safe by REQ-ISL-2's four-layer autosave + pagehide/`hidden` flush (F6). The `p.page` component keys its boundary on resolved `draftId`, not on the raw `$v` param.
- **Pane/theme/typography/authorship:** unchanged — localStorage keys verbatim (`rhema:ide:v1:*` per user×project, `rhema:authorship:v1:<projectId>`, `rhema:font:v1`, `rhema:reader-step:v1`, theme mirrors); the `rhema:authorship` window CustomEvent remains the chrome→Page contract (the React Page still subscribes).
- **Held-file handshake:** untouched — the IDB hold is landing-side state; `/p/:project` and `/v/:v` must keep emitting the `data-held-consumed` marker for `?hc=` and the token-matched deletion (landing.ts F8; journeys `steps.ts:288-293`).
- **Findings-desk selection (`findingIx`, `data-selected`):** component state inside the IDE layout; survives search-param-only navigations on the same route (filter/triage/bulk changes do not remount); resets on cross-route nav — strictly ≥ today's parity (every nav is a document reload today).
- **Live feed:** one `EventSource` per project owned by the `p.$project` layout with `?after=<lastSeq>` resume on remount; teardown on leaving the branch (REQ-ISL-14 unchanged).
- **Meta-refresh polls** (`/app/new` pending, import preview, `/billing/return`): become TanStack Query `refetchInterval`/`router.invalidate` loops — the self-poll cadence (~2.5-4 min import window; 5 s checkout return) is preserved (census F6).
- **History semantics:** mutation → `navigate` is a **push** (mirrors POST→302: the POST never sat in history, the GET does — Back returns to the pre-form page); apply-then-strip and poll self-updates use `replace`.

## Design: scroll restoration & focus

- `createRouter({ scrollRestoration: true })` restores per-history-entry scroll; `hash` in locations (`#finding-<id>`, `#report`, `#chat`) scrolls the anchor — the dossier `#finding-<id>` deep link and `data-focus-finding` Page scroll (`page.ts:347`) are preserved.
- **Focus management (a11y, WCAG 2.2 AA ⚑):** on route change the SPA moves DOM focus to the route's `<h1>` (or the main landmark) and announces the navigation via an `aria-live` region; deep-link targets (`?gate=` card, `?disposed=` finding, `#finding-<id>`) receive focus per today's `focusFinding` contract (`el.tabIndex=-1; el.focus()`, `ide.ts:636-638`).
- Naming note: `?focus=1` is view-state (focus mode), unrelated to DOM focus — the two must not be conflated in the spec.

## Design: the keymap in the SPA

- `dispatchIdeKey` ports verbatim (pure; REQ-ISL-8). The `keydown` listener mounts **inside the IDE layout only** — the same ~11-route scope as today (F2); `focusZone()` stays DOM-derived, so findings chords remain inert in `page`/`input` and simply unreachable on shell-less routes.
- Navigation chords swap `window.location.assign` for `router.navigate`: ⌘⇧D/E/V → `/p/$slug/run?workflow=…`; ⌘I → `/app/inbox`; ⌘, → `/app/settings/account`; ⌘G → `/p/$slug`; ⌘⇧R → the `data-run-next` href (loader data); ⌘⇧C → the `data-compare-previous` link else palette; ⌘⇧T toggles `?triage` on `p.review` via `navigate` (push — Back exits triage, matching today's `location.assign`); `[`/`]` version walk computes from route params instead of the pathname regex (`ide.ts:772-776`).
- **⌘S single owner:** today ⌘S is bound twice (ide.ts `:848-853` emits `rhema:restore-point`; page.ts `:273-279` sends `rhema.restore`). In the SPA the Page session provider owns the binding; the shell chord delegates to it and is inert where no Page exists (resolves A2 open question 4).

## Design: boundary crossings

- **SPA→SSR:** any intra-app link to `/`, `/pricing`, `/showcase`, `/login`, `/invite`, `/signup` is a real document navigation (`<a href>` or `location.assign`); `redirect({ href })` covers `beforeLoad`-level bounces like the session guard.
- **SSR→SPA:** document loads — login/magic-link land on `/app` where the server runs precedence (F5) and serves the shell; the SPA boots once per document.
- **`/logout`:** stays a native `<form method="post" action="/logout">` — cookie clear + 302 `/` on the server; never a client mutation (F10).
- **External 302s & downloads:** Stripe/Google allowlisted targets and binary/presigned downloads are document navs (native form POST or `location.assign`) — the BFF's POST→302 shape is preserved so CSP `form-action` semantics stay intact (MAINT.5).
- **Strangler (Q-5):** the shell is served only for flipped routes; every auth'd path is registered in the tree, and an unflipped leaf renders an `SsrHandoff` component that `location.assign`s the same URL — per-surface flags stay server-side config, and client nav to an unflipped surface lands on SSR exactly like a hard load.

## Design: 404 / unknown-slug behavior

- `notFoundMode: "fuzzy"` (default): loaders `throw notFound()` on unknown slug/missing resource; nearest `notFoundComponent` handles it — `p.$project` provides the project-scoped not-found; per-surface 404 elements (outline's own 404 view, figure-card's, voiceReseed's, export's — F9) become route-level `notFoundComponent`s; `defaultNotFoundComponent` on `__root` renders the `NotFoundPage` equivalent for unmatched paths.
- Invalid `$v`/`$n`/`$m` (non-numeric where numeric required) fail param parsing ⇒ not-found — matching today's `resolveEditorDraft("abc")` ⇒ 404.
- The server `app.all("*")` catch-all (`server.ts:5669`) stays for paths outside both trees (belt during strangler and forever for typos at the document level).

## Open questions

1. **Client-side `/p/:slug` unread hand-off replication** — the REQ-IDE-48 mark-read + redirect fires on document load today; a client-side nav to `/p/$project` would skip it unless the route's `beforeLoad` calls a small BFF check (e.g., `GET /app/inbox/unread-handoff?project=`). Replicate (new endpoint — B3 owns) or accept document-load-only semantics?
2. **`?confirmEmail` consumption** — today the token is consumed server-side before `/app/settings/account` renders (`server.ts:2407-2425`). Options: a BFF `POST /app/settings/account/confirm-email` the route's `beforeLoad` calls then `replace`-navs to `?notice=` (recommended), or keep that GET server-handled until the endpoint ships. Which row owns it — B3?
3. **Editor keep-alive ambition** — the hoisted `(projectId, draftId)` session provider is recommended; the cheap alternative is unmount-on-nav (y-indexeddb + reconnect already makes that safe). Does the multi-tab story (A2 open question 6) need a written policy before the provider lands?
4. **Flash-param stripping after render** — recommended: keep all except `focus`/`hc`/`verified`/`confirmEmail` (deep-linkable outcomes; journeys assert the URLs). Any product objection to permanently visible `?disposed=`/`?bulkdone=` URLs is a C-level decision, not a technical one.
5. **`/app` client-side precedence bypass** — a client nav from `/app/inbox` to `/app` skips the server precedence check; the precedence is first-run-shaped so this is near-harmless, but should the `/app` route also run the check in `beforeLoad` for defense-in-depth (another BFF call), or is document-load-only accepted?
6. **Desk selection on cross-route nav** — recommended reset-on-route-change; if product wants dossier↔Page selection continuity (`data-finding-id` exists on both surfaces), that's net-new state to spec.
7. **TanStack version surface** — `redirect({href})`, `scrollRestoration`, `notFoundMode` exist on current Router; pin the version in B1 so `href`-redirects-for-document-nav is verified at that pin.

## Spec requirements emitted

1. **REQ-NAV-1** — The SPA router owns exactly the auth'd document set: the §route-tree table is normative (route ids, paths, IDE-shell scoping per F2); public/marketing/login documents, all POSTs, and all BFF transports (SSE, JSON, beacon, binary, presigned, assets) stay outside the tree.
2. **REQ-NAV-2** — Path params are type-validated per §param table (`$v` ∈ `"working"|positive-int`, `$n`/`$m` positive ints, ids opaque); a parse failure or unknown slug resolves to the scoped `notFoundComponent`, never a rendered error page.
3. **REQ-NAV-3** — The search-param vocabulary is contract: each route declares `validateSearch` per §schema; flash params remain deep-linkable URL state (mutation ⇒ `navigate({search})` re-emits the same keys journeys assert); the apply-then-strip set is exactly `focus`, `hc`, `verified`, `confirmEmail`.
4. **REQ-NAV-4** — Deep links never break: every census GET path resolves in the tree or through a maintained redirect; the §redirect table's server-vs-client dispositions are normative; email/journey targets (`/app?verified=1`, `/p/:p/f/:fid`, `/app/usage/r/:runId`, magic-link → `/app`, `#finding-`, `#report`, `#chat`) are enumerated deep-link contract.
5. **REQ-NAV-5** — Conditional landing rewrites (`/app` showcase/intent precedence; `/p/:project` unread hand-off incl. its `?focus=1` suppression) remain server-side decisions on the document request; client-side equivalents are `beforeLoad` + BFF checks only where the open questions land them.
6. **REQ-NAV-6** — Cross-route state policy: editor session keep-alive keyed `(projectId, draftId)` inside the `p.$project` layout with rebind-on-draft-change and teardown-on-branch-exit; all localStorage keys and the `rhema:authorship`/`rhema:restore-point`/`rhema:finding-action` CustomEvent contracts preserved verbatim; the IDB hold + `?hc=` token-matched consumption unchanged; desk selection persists across same-route search navs only.
7. **REQ-NAV-7** — `scrollRestoration` is enabled; hash anchors scroll and focus their target; every route change moves DOM focus to the route `<h1>` and announces via `aria-live` (WCAG 2.2 AA floor ⚑).
8. **REQ-NAV-8** — The §5.12 keymap listener mounts inside the IDE layout only; `focusZone` stays DOM-derived; navigation chords use `router.navigate`; `?triage` toggle is a push navigation; ⌘S has exactly one owner (the Page session provider).
9. **REQ-NAV-9** — Boundary rule: intra-tree paths use `router.navigate`; SSR-owned paths, `/logout` (native form POST), allowlisted external 302s (Stripe/OAuth), and binary/presigned downloads are document navigations — never client-side fetches or router navs; unflipped strangler routes hand off via `location.assign`.
10. **REQ-NAV-10** — 404 semantics: `notFoundMode:"fuzzy"`; per-surface not-found elements preserved as route-level `notFoundComponent`s; the root `defaultNotFoundComponent` renders the `NotFoundPage` equivalent; the server `app.all("*")` catch-all stays for out-of-tree paths.
11. **REQ-NAV-11** — History semantics: mutation-outcome navigations push (POST→302 parity — Back returns to the pre-form page); apply-then-strip params and poll self-updates use `replace`; meta-refresh self-polls become `refetchInterval`/`invalidate` loops at the same cadence.
