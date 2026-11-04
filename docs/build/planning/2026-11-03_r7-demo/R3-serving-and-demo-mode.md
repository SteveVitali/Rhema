# R3 — Serving and demo mode: DataSource coverage, routing, side-effect gating

**Row:** R3 (round-7 demo spec research) · **Researched:** 2026-11-03 against `a34eb51` (branch
`stevevitali/r7-demo-spec`) · **Method:** read-only source census; no build, no live leg.
**Inputs read:** `AGENTS.md`, `apps/web/AGENTS.md`, `apps/api/AGENTS.md`,
`docs/design/26_spa-public-auth-boundary.md`, `docs/design/22_spa-bff-api-shape.md`,
`docs/round-7-demo-brief.md`.
**Not run:** no Docker, browser, or live leg. The one check run was `node scripts/check-spa-budget.mjs`
against a stale local build (2026-10-29). Its figures are indicative only.

## 0. Headline findings

1. Since SPA.27/28, every in-scope surface is shell-served. Its data comes from one `/bff/p/:slug/…`
   twin that runs a shared server composition. A fixture `DataSource` therefore covers the whole
   read path with **24 methods**, 9 of which are constant-empty (§1–2).
2. **Three things will silently break a logged-out demo even with a perfect `demoDataSource`.**
   Each one sends the visitor to `/login`:
   - the `_authenticated` `beforeLoad` session gate (`spa/routes/_authenticated.tsx:13-21`);
   - the `p.$project` layout loader on the session-gated `/bff/feed-labels`
     (`p.$project.tsx:12` → `server.ts:488-492`);
   - `IdeChrome`'s `useQuery(sessionQuery)` (`spa/ide/chrome.tsx:58`). A 401 from any of these
     runs `bffFetch`'s `onSessionExpired` (`spa/bff.ts:72-75`), which calls `navigateDocument("/login")`.
3. About **120 hand-built `/p/${slug}` href templates** live in browser code: `queries.ts` 22,
   `dossier-view.tsx` 22, `page-chrome.tsx` 21, `@rhema/ui` 11, `chat-pane.tsx` 8, `dossier.tsx` 7,
   `gate-card.tsx` 6, `editor.tsx` 5, `controller.ts` 3, `chrome-data.tsx` 3, `run-report.tsx` 2.
   Server compositions build more (`ideContext` palette at `server.ts:1278-1325`, `eventsUrl`,
   `runNextHref`). Threading a base path through all of them is the costliest and riskiest option.
   A reserved slug namespace makes every existing link demo-correct by construction (§3).
4. A demo sub-app must **not** return HTML through the outer app. The CSP middleware
   (`server.ts:333-353`) would stamp a second `nonce` onto each `<script>`. The browser keeps the
   first attribute, the header carries the second, and every script is blocked. Only JSON may go
   through a nested `createWebApp`.

## 1. Surface → composition → DataSource calls

Every in-scope document GET first checks the session (`if (!session) return c.redirect("/login")`).
It then either serves `spaShellDocument` (`spa-shell.ts:256-268`) or takes the forced-SSR arm
`isPhoneRequest(c) || row.showcase === true`. The data lives in the twins. All twins resolve slug→row
through `bffProjectRow` = `projectRow` (`bff.ts:224-232`). That makes one memoized
`listProjects(session)` call per request (`bff.ts:209-218`). `ideContext` (`server.ts:1239-1340`)
runs on every IDE-framed twin.

| Surface (document → twin) | Composition | DataSource calls (beyond `listProjects` + `ideContext`) | Side effects in composition | Session use |
|---|---|---|---|---|
| Overview `/p/:project` (`server.ts:3917`) → `GET /bff/p/:slug` (`:5257-5298`) | `projectOverviewComposition` (`:3751-3814`), `overviewIdeOpts` (`:3817-3846`), `loadEditorPage` (`page-data.ts:612-620`) | `listGates`, `listDecisions`, `getApprovalOverrides`, `getApprovalSettings?`, `getExplainers?`, `getProjectVoice`, `listVoices`, `getEditorDoc(exact)`, `getInboxBadge?`, `getTimeline`, `getRunEvents` (only when `row.activeRun`) | `emit("gate.presence_timer_shown")` per live gate (`:3787-3791`). The document GET also runs `getInbox` + `markInboxItemRead` + 302 handoff (`:3929-3944`). The SPA does the same through `POST /bff/p/:slug/handoff` (`bff.ts:262-292`). | Forwards session to every seam. `collabWsUrl` is emitted unless phone/showcase (`:5287-5288`). |
| Version `/p/:project/v/:v` (`:5518`) → `/bff/p/:slug/v/:v` (`:5306-5347`) | `versionPageComposition` (`:3851-3891`), `pageRailBag` (`:3894-3915`) | `resolveEditorDraft`, `getEditorDoc(exact)`, `getVersions`, `listRestorePoints?`, `previewRestorePoint?` (only with `?restore=`) | none | same `collabWsUrl` rule (`:5329-5330`) |
| Diff `/p/:project/v/:n/diff/:m` (`:5630`) → `:5351-5375` | inline | `getVersionDiff` | none | — |
| Artifact `/p/:project/a/:artifactId` (`:5693`) → `:5379-5409` | inline | `getArtifactPage` | none | `readOnly: true`, never `collabWsUrl` (`:5398`) |
| What-changed `/p/:project/revisions/:cid` (`:5438`) → `:5413-5435` | inline | `getWhatChanged` | none | — |
| Dossier `/p/:project/review/:runId` (`:4731`, shell only) → `:4744-4769` | `dossierComposition` (`:4620-4729`) | `getDossier`, `getTimeline`, `previewBulkFindings?` (only `?bulk=`), `listGates` (only `?gate=`) | `markInboxRunRead?` (`:4643-4645`); `emit` `run.report_viewed`, one `finding.viewed` per finding, `secondread.opened` (`:4653-4659`) | — |
| Run report `/p/:project/r/:runId` (`:4806`, shell only) → `:4821-4850` | `runReportComposition` (`:4777-4801`) + `liveFeedSlice` (`:1349-1360`) | `getRunReport(advanced)`, `getTimeline`, `getRunEvents` (only with `activeRun`) | `markInboxRunRead?` (`:4791-4793`) | `eventsUrl` `/p/:slug/r/:runId/events` (`:4836`) |
| IDE chrome (every row above) | `ideContext` (`:1239-1340`) | `getSessionPrincipal`, `getTheme`, `getFiles?`, `getChat?` | none | `userId` goes into the pane-storage key; `paletteSearchUrl`, `themeUrl`, `paperThemeUrl` (`:1347-1350`) |
| Palette search `GET /p/:project/palette-search` (`:1524-1548`) | inline | `listProjects`, `searchPalette?` | none | 401 `{results:[]}` when there is no session |
| Shell document (every row above) | `spaBootPayload` (`spa-shell.ts:161-196`) | `getSessionPrincipal`, `getTheme` | none | principal seeds the session query (`spa/main.tsx`) |
| Figures read, optional (`/bff/p/:slug/figures`, `/figures/:figureId`, `server.ts:1175-1205`) | inline | `listFigures?`, `getFigure?` | none | unframed (not in `SPA_IDE_FRAMED_ROUTES`) |

### DataSource method → demo implementation

Signatures are from `apps/web/src/data.ts` (line numbers in brackets).

| Method [line] → DTO | Used by | `demoDataSource` |
|---|---|---|
| `listProjects(s)` [219] → `ProjectRow[]` | all twins, palette | **Snapshot**: four rows, slug `demo~<essay>`, `showcase:false`, `activeRun:null`, `headDraftId` set |
| `getEditorDoc(s,pid,did,{exact})` [391] → `EditorDocDto` | overview, version | **Snapshot** keyed by `draftId` (lazy chunk) |
| `resolveEditorDraft(s,pid,v)` [398] → `EditorResolveDto` | version | **Snapshot**: `working` → head, `n` → draft; otherwise throw `ApiError(404)` |
| `getVersions(s,pid)` [411] → `VersionRailDto` | version rail | **Snapshot** |
| `getVersionDiff(s,pid,n,m)` [413] → `VersionDiffDto` | diff | **Snapshot** keyed by `n:m`; a missing pair throws 404 |
| `getArtifactPage(s,pid,aid)` [408] → `EditorDocDto` | artifact (source notes, dossier files, ledgers) | **Snapshot** (lazy chunk per artifact); a miss throws 404 |
| `getWhatChanged(s,pid,cid)` [381] → `WhatChangedDto` | revisions | **Snapshot** |
| `getDossier(s,{projectSlug,runId})` [221] → `DossierData` | dossier | **Snapshot** |
| `getRunReport(s,runId,{advanced})` [759] → `RunReportDto` | run report | **Snapshot**, labelled replayed/imported, no cost fields; ignore `advanced` |
| `getTimeline(s,slug)` [757] → `TimelineDto` | overview, dossier, report | **Snapshot** keyed by slug |
| `getFiles?(s,pid)` [425] → `FilesDto` | chrome | **Snapshot** |
| `getSessionPrincipal(s)` [717] → `PrincipalDto` | chrome, shell | **Constant** demo principal (`userId:"demo"`); the shell must not embed it (§4) |
| `getTheme(s)` [719] | chrome, shell | **Constant** `null`, so the localStorage mirror wins |
| `getChat?` [792] | chrome | **Omit** (`undefined`), giving the `L.desk.emptyChat` placeholder (`packages/ui/src/ide-shell.tsx:312`) and no composer |
| `listGates` [316], `listDecisions` [327] | overview, dossier `?gate` | **Constant** `[]` |
| `getApprovalOverrides` [345] | overview | **Constant** `{}` |
| `getApprovalSettings?` [354], `getInboxBadge?` [335], `listRestorePoints?` [427], `previewRestorePoint?` [429], `previewBulkFindings?` [302], `searchPalette?` [270] | as above | **Omit** or constant empty (`{points:[]}`, `[]`) |
| `getExplainers?` [377] | overview | **Constant** `{dismissed:[all]}`, so no first-approval explainer appears |
| `getProjectVoice` [492], `listVoices` [469] | overview voice picker | **Constant** `null` / `[]` (no picker) |
| `getRunEvents` [776], `streamRunEvents` [778] | feed, SSE | **Throws, never called**: `activeRun:null` keeps them unreachable |
| `markInboxRunRead?` [341], `getInbox?` [333], `markInboxItemRead?` [337] | dossier, report, handoff | **Omit**. `getInbox` absent makes the handoff a no-op (`bff.ts:268`) |
| `postAnalyticsEvent` [648], `postAcquisitionEvent?` [656] | `emit`, `/a/acq` | **No-op** resolving `{ok:true}` |
| `listFigures?` [893], `getFigure?` [895] | figures read (optional) | **Snapshot**. `FigureCardDto` carries inline `svgLight`/`svgDark` (`packages/api-client/src/index.ts:2566-2567`), so no image origin is needed. Sanitize the SVG at projection time. |
| every other method (~95) | out-of-scope surfaces, writes | Not implemented: **throw `DemoUnsupported`**, and the write guard (§3) stops them being reached |

**Minimum implemented set: 24 methods.**
- 13 serve snapshot data: `listProjects`, `getEditorDoc`, `resolveEditorDraft`, `getVersions`,
  `getVersionDiff`, `getArtifactPage`, `getWhatChanged`, `getDossier`, `getRunReport`,
  `getTimeline`, `getFiles`, plus `listFigures` and `getFigure` if figures are in scope.
- 11 are constant or no-op: `getSessionPrincipal`, `getTheme`, `listGates`, `listDecisions`,
  `getApprovalOverrides`, `getExplainers`, `getProjectVoice`, `listVoices`, `postAnalyticsEvent`,
  `checkSession` (→ `false`), `getRatesPublication` (only if a demo page shows prices; it should not).

Type it as `Pick<DataSource, …>` and cast to `DataSource` only at the nested-app seam, with every
other key a throwing proxy. Reaching an unimplemented seam then fails loudly in tests and is never
a silent empty.

## 2. Inputs outside the DataSource seam that must be gated

| Bypass | Where | Demo handling |
|---|---|---|
| `deps.collabWsUrl` → `page.collabWsUrl` | `server.ts:5288,5330` | Construct the nested demo app with `collabWsUrl: undefined`. The twin must still carry `readOnly:true` (§5). |
| `isPhoneRequest(c)` → `readOnly`, `compact`, and the boot `surfaces` "ssr" verdict for `pageMount` routes | `spa-shell.ts:178-182`, `server.ts:5264` | The demo boot marks every in-scope demo route `"spa"`. There is no SSR demo Page, so an `SsrHandoff` would loop (§3). |
| `row.showcase` → `twinForcesSsr` | `spa/states.tsx:64-68`; twins at `server.ts:5274,5337` | Demo rows are `showcase:false`, always. |
| `eventsUrl` `/p/${slug}/r/${runId}/events` | `server.ts:3828,4836` | Unreachable because `activeRun` is null. Also guard `useIdeFeed` (§4). |
| `ideContext` palette `settings` / `goto` literals (`/app/settings/account`, `/usage`, `/app/settings/billing`, `/p/:slug/obligations/new`) | `server.ts:1315-1325` | Add a `deps.demo` flag so `ideContext` drops these rows, or filter them client-side in demo mode. |
| `paletteSearchUrl` / `themeUrl` / `paperThemeUrl` | `server.ts:1347-1350`, `spa/ide/chrome.tsx:159-161` | Client gating (§4). The server guard returns 405 for the POSTs. |
| `emit()` analytics | `server.ts:381-393` | Goes through `postAnalyticsEvent`, which is a no-op. |
| `ensureFingerprint` Set-Cookie (`rhema_fp`) | `server.ts:411-419` | Run sheet only, so out of scope. The guard also strips `set-cookie` from demo responses. |
| `/bff/feed-labels` (pure COPY via `feedLabelMaps()`) | `server.ts:488-492` | Session-gated today. Needs a public alias (§3). |
| Page `docUrl` `${base}/doc` = `/p/:slug/edit/:draftId/doc` | `page-chrome.tsx:229,300` | Its poll is gated client-side; the path is not on the server allowlist. |

## 3. Routing design

### (a) `/demo/:essay/...` mirroring `/p/:project/...` with a parameterized base

What it touches: a new public `routes/demo.tsx` layout plus seven duplicated leaf stubs (and
`tree.test.ts:18-22`, which scans only `_authenticated/`); a `base` argument on all 22 `queries.ts`
factories; a `projectBase` through `page-chrome.tsx`, `dossier-view.tsx`, `gate-card.tsx`,
`chat-pane.tsx`, `@rhema/ui`, `controller.ts:990`, and the server compositions (`ideContext`,
`pageRailBag` via `page-chrome.tsx:244-251`, `overviewIdeOpts`).

The structural risk is that one missed template sends a visitor to `/p/<essay>/…`. That is
`_authenticated` space. A logged-in visitor whose workspace holds a project with the same slug
would land in their **own** real project. Grep-based completeness is not a guarantee.

### (b) Same `/p/:project` paths with a reserved demo slug namespace

Use the slug form `demo~<essay>`. API `slugify` emits only `[a-z0-9-]` (`apps/api/src/project-routes.ts:48-56`),
and uniqueness is per workspace (`packages/db/migrations/0002_schema.sql:52`), so `~` can never
collide with a tenant slug. `~` is RFC 3986 unreserved, so `encodeURIComponent` leaves it alone
(`queries.ts` keys stay stable).

Every hand-built and server-built href stays inside the namespace by construction.
`spaRouteFor("/p/demo~x/v/2")` still resolves `routeId:"/p/$project/v/$v"` (`contracts/spa.ts`
`routeIdPattern`), so `data-route`, `HeadManager`, the DOM contract and journeys keep their route
ids.

Risks:
1. Public pages now live inside the `/p` authenticated prefix (`SPA_PREFIXES`). The boundary
   becomes "list plus predicate".
2. Without a guard, a logged-in user's POST to `/p/demo~x/gates/g` would reach `apiDataSource` with
   a real session. It would 404, but it is still a live API call.
3. The URL reads `/p/demo~…` rather than the brief's `/demo/<essay>/…`
   (`docs/round-7-demo-brief.md:39-44`).

### Recommendation: (b) as the internal namespace, with a public `/demo/…` alias

Server (`apps/web/src/server.ts`):
- **S1. A demo guard** registered right after the middleware block (after `:443`, before
  `/session` at `:461`). It covers `/p/:project`, `/p/:project/*`, `/bff/p/:slug`,
  `/bff/p/:slug/*`, and `isDemoSlug(param)`, which matches registered essays only (unknown
  `demo~zzz` → 404).
  - Non-GET/HEAD requests get **405 `{error:"demo_read_only"}`**: JSON for `wantsJson`, otherwise a
    terminal SSR notice. No DataSource is touched.
  - GET requests are checked against an **allowlist** built from the seven in-scope routeIds, their
    twins, `palette-search` and, optionally, figures. Allowed requests are served there (S2/S3).
    Everything else (`/run`, `/export`, `/outline`, `/r/:id/events`, `/edit/:d/doc`, …) gets a
    terminal "not in the demo" SSR document, **never the shell**. That breaks any
    `SsrHandoff` → shell → `SsrHandoff` loop.
- **S2. Demo shell.** The outer app serves `spaShellDocument(c, demoShellDeps, DEMO_SESSION, …)`
  directly. Boot gets `demo:{essay, slug, signedIn}`, **no `principal`**, `theme:{}`, and all
  in-scope routeIds `"spa"` even on phone. `projectSlugFor` (`spa-shell.ts:150-153`) must also map
  `/demo/<essay>` → `demo~<essay>` so `data-project` / paper resolve before paint.
- **S3. Demo twins.** A nested
  `demoApp = createWebApp({dataSource: demoDataSource, session: () => DEMO_SESSION, collabWsUrl: undefined, demo: true})`
  answers **JSON only**. The guard forwards a cloned request with `cookie` and `authorization`
  removed. On the way back it deletes `set-cookie` and overwrites `cache-control`, because the
  nested app's `no-store` floor (`server.ts:378-384`) fires since its session is non-null.
  - This reuses every composition verbatim (REQ-BFF-2's one-composition rule). The cost is the
    CSP double-nonce hazard (headline finding 4).
  - The alternative is to extract the compositions out of the closure into a module. That is
    larger, but cleaner long-term.
- **S4. Public alias.** `GET /demo` (hub) and `GET /demo/:essay/*` serve the demo shell.
  `GET /bff/demo/feed-labels` returns `feedLabelMaps()` with no session.
  `/p/demo~:essay/*` document GETs serve the same shell, so a new tab or reload works.
- **S5. Catch-all** (`server.ts:6525-6535`): no change. The guard runs first. `spaRouteFor("/demo/…")`
  returns `surfaces:null`, so an unknown `/demo` path gets the SSR 404.

Contracts (`packages/contracts/src/spa.ts`):
- **C1.** Add `/demo` to `SPA_PUBLIC_ROUTES`, with a `spa.test.ts:120` case.
- **C2.** Add `DEMO_SLUG_PREFIX = "demo~"`, `isDemoSlug`, and `DEMO_ROUTE_IDS` (the allowlist,
  shared by server and SPA). Do **not** add `demo` to `SPA_SURFACES`: `spa.test.ts:17` pins
  exactly 14 + 1.
- **C3.** `SPA_PREFIXES` stays as it is. `/demo` is public.

SPA:
- **P1.** `routes/_authenticated.tsx:13`: `if (context.boot?.demo && isDemoPath(location.pathname)) return;`
  before `ensureQueryData(sessionQuery)`. This is client-only; the server stays the authority.
  The predicate is the pathname, not just the boot, so an in-SPA hop to `/app` still hits the gate.
- **P2.** `p.$project.tsx:12`: in demo mode the loader warms `demoFeedLabelsQuery` (key
  `["feed-labels"]`, URL `/bff/demo/feed-labels`).
- **P3.** `ide/chrome.tsx:58,63`: `useQuery({...sessionQuery, enabled: !demo})`, `userId = "demo"`.
- **P4.** `spa/main.tsx`: when `boot.demo` is set, use `staleTime: Infinity` and
  `refetchOnWindowFocus: false`. Twins are immutable, and the "GET is the read-receipt" rationale
  (`queries.ts` dossier/report notes) no longer applies.
- **P5.** `routes.tsx`: add `{path:"/demo", public:true, element: demoHubElement}` (SSR, like
  `/showcase`).
- **P6.** `doc-meta.ts`: add a `/demo` description/OG, plus a `/demo/<essay>` title.
- **P7. Router rewrite** (`spa/main.tsx` `createRouter({ rewrite })`): input
  `/demo/:essay/rest` → `/p/demo~:essay/rest`, output the reverse. TanStack Router 1.170.40 /
  router-core 1.171.33 ships `rewrite` (`router-core/dist/esm/router.d.ts:364`, `rewrite.d.ts`).
  - **Open behaviour to spike:** does `router.navigate({href})` from the nav interceptor
    (`spa/nav-intercept.ts:119`) apply the output rewrite to raw `/p/demo~…` anchors? Does
    `getMatchedRoutes(url.pathname)` (`:102`) need the input form?
  - If the spike fails, ship S4 as a 302 `/demo/:essay/*` → `/p/demo~:essay/*` and accept the
    internal URL in the address bar.

**Logged-in visitors** use the same routes and bytes. The demo shell never reads the session
(no principal, no API theme read, cookie stripped before the nested app). The only difference is
`boot.demo.signedIn`, which is cookie **presence** only (`deps.session(c) != null`; no API call),
is cosmetic, and never feeds authorization:
- signed in: the banner CTA reads "Back to your projects" → `/app`;
- signed out: it reads "Create your account / Sign in".

Every exit link carries `data-spa-native` (`nav-intercept.ts:71`). Leaving the demo is then a
document navigation that rebuilds a real boot and a fresh QueryClient, so no demo cache leaks
into the workspace.

## 4. SPA side-effect inventory and gating

**Mechanism:** a `DemoMode` value derived once from `boot.demo` (set in `spa/boot.ts` `readSpaBoot`).
- React consumers use `useDemoMode()`.
- Non-React code (page-mount effects, the controller) uses an `isDemo()` module read, following
  the `getSpaBoot()` singleton precedent (`spa/boot.ts`).
- One **capture-phase `submit` listener** on the demo layout root calls `preventDefault` on every
  `method="post"` form and shows a single `data-demo-readonly-notice`. It runs before the
  surface-level delegated handlers (`editor.tsx:135-160`, `dossier.tsx:147-200`,
  `run-report.tsx:124-150`).
- The server's 405 is the backstop.

This is not a renderer control (AGENTS gotcha #1). It is a boot fact keyed to a path namespace.
There is no `?demo=1`.

| # | Side effect | file:line | Gate |
|---|---|---|---|
| 1 | Feed `EventSource` | `spa/ide/feed.ts:175-202` | Never armed (`feed` absent); belt-and-braces: `if (isDemo()) return` at `:72` |
| 2 | Palette search `fetch` | `spa/ide/controller.ts:869` | Demo returns `[]` server-side; client may skip in demo |
| 3 | Theme / paper POSTs | `controller.ts:560-568` (`post`), `:704`, `:712`, `:981` | Skip `post` in demo, keep the localStorage apply |
| 4 | Keymap navigations to out-of-scope routes (`/run?workflow=`, run-next) | `controller.ts:990-1000` | Drop the `sheet` / `run-next` actions in demo |
| 5 | Page `/doc` 10 s poll + visibility re-poll | `spa/page-mount.tsx:453-470,526,535` | No `setInterval` / poll when `isDemo()` |
| 6 | ⌘S → `mintRestorePoint` + `rhema:restore-point` | `page-mount.tsx:498-524` | With `wire` null, this only fakes a "syncing" pill (`:505`) — a lie. Demo: no-op + read-only notice. |
| 7 | Provenance flush | `page-mount.tsx:284-302` | Inert (`entry.session` null without collab) |
| 8 | Dwell beacon `/a/dwell` | `spa/dwell.ts:23-30`; callers `editor.tsx:418,511,553,586`, `run-report.tsx:214` | Off in demo. For a logged-in visitor it would otherwise attribute `surface.dwell` to their account. |
| 9 | Showcase anchor beacon `/a/acq` | `spa/showcase-beacon.ts:22-33`; caller `dossier.tsx:362` | Inert (`showcase:false`); also gate |
| 10 | Gate presence pings | `spa/gate-presence.ts:25-26`; callers `editor.tsx:383`, `dossier.tsx:277,357` | Inert (no gates); also gate |
| 11 | Handoff POST in `beforeLoad` | `routes/_authenticated/p.$project.index.tsx:35-41` | `if (demo) return` |
| 12 | Session refetch (→ `/login`) | `ide/chrome.tsx:58`; `_authenticated.tsx:15` | P1/P3 |
| 13 | Feed-labels 401 (→ `/login`) | `p.$project.tsx:12` | P2 |
| 14 | Editor writes (`useEditorWrite`): note, cancel-run, revise, restore, two hunk-comment paths, rename, approval-overrides, voice / adopt / fork, gates, decisions | `editor.tsx:76` (`EDITOR_WRITE`), `:166-205`; forms `page-chrome.tsx:251,425,549,577,623,631,652` | Capture listener; hide affordances where a prop already exists (§4.1) |
| 15 | Dossier writes: disposition, apply, promote, obligations, bulk, bulk-preview, gates, obligation create | `dossier.tsx:79-80`, `:202-236`, `:473-508`; forms `dossier-view.tsx:505,529,551-560,886` | Capture listener; pass `compact`-style withholding for Apply / bulk |
| 16 | Run-report refund | `run-report.tsx:63,162-180`, form `:255` | Capture listener; hide the form in demo (a refund on a replay is incoherent) |
| 17 | Chat composer (turns, plan-decision, pins, corrections, suggestions, notes) | `chat-pane.tsx:58-66` (native forms) | `getChat` omitted, so there is no composer; placeholder `ide-shell.tsx:312` |
| 18 | Source-mode commit | `page-mount.tsx:598-611` → `applySourceMarkdown` | `editable: () => editableRef.current` is false, so it is a read-only source view. Needs a test asserting CodeMirror honours it. |
| 19 | Held-file delete (`?hc=`) | `editor.tsx:211-219` | URL-only; harmless |

### 4.1 How read-only looks today (reuse candidates)

- **Showcase is enforced server-side.** The api returns 409 `showcase_read_only` from
  `triage-routes.ts:297`, `finding-routes.ts:183`, `editor-routes.ts:171`, `outline-routes.ts:306`
  and `run-routes.ts:261` (`showcase.ts:12`). The SPA does not pre-disable anything.
  - The editor swallows 400/403/404/409 silently and re-reads (`editor.tsx:196-200`).
  - The dossier shows the raw code as the notice (`dossier.tsx:226-232`, `err.detail ?? err.code`).
  - That precedent is not good UX. The demo should prevent the write and explain it, not
    round-trip a 409.
- **Copy to reuse:**
  - `COPY.dossier.readOnlyNote` (`copy.ts:308`: "Read-only sample. In your projects, each finding is
    something you can act on.")
  - `COPY.showcase.bannerTitle/bannerBody` (`copy.ts:2324-2326`)
  - the version `readOnlyNote` (`copy.ts:928`, rendered at `packages/ui/src/page-editor.tsx:398`)
  - the sync pill's `data-label-readonly` (`page-editor.tsx:356`)
  - the showcase banner markup `data-showcase-banner` (`dossier-view.tsx:716-735`). Its "Duplicate
    it" form (`:731`) must not show in the demo, which is guaranteed by `showcase:false`.
- **Existing withholding lever:** `compact === true` already removes Apply and bulk controls
  (`dossier-view.tsx:504`) and makes the Page reader-only (`page-chrome.tsx:298`). A
  `readOnly`/`demo` prop alongside `compact` is the cheapest render-time hide.

## 5. Collab and editor read-only path (confirmed)

- **The server emits** `page.readOnly: true` only for phone/showcase on overview and version
  (`server.ts:5286-5288`, `:5328-5330`) and always for artifacts (`:5398`). `collabWsUrl` is
  withheld under the same predicate. The demo twins must emit `readOnly:true` everywhere, either
  through a `deps.demo` branch in those three spreads or because the nested app has
  `collabWsUrl: undefined` and the demo flag.
- **The client:** with `collabUrl === ""`, `acquire` builds `createPageState(docJson, …)` with
  `session:null` (`page-mount.tsx:205-229`). The editable rule is
  `!locked && !(hostReadOnly && collabUrl === "")` (`:174`, re-applied `:408`). So **`readOnly`
  must be true**: an empty collab URL alone leaves the Page *editable*, and local edits would sit in
  memory (no persistence, but a misleading "you can type here").
- `editor.tsx:94` also forces read-only on `compact`.
- The SPA read-only path has been exercised so far only by `/a/:artifactId`. Showcase and phone
  pages are forced-SSR and "never reach this code" (`page-mount.tsx:628-629`). The demo is the first
  read-only SPA overview/version Page, so it needs its own DOM tests.

## 6. Constraints

- **DOM contract** (`apps/web/src/dom-contract.ts`, `scripts/check-dom-contract.mjs`):
  - Add a `demo` bucket to `DomContractSurface` (`dom-contract.ts`, the `SpaSurface | "shell" | "public" | "shared"`
    union). It goes in the manifest type only, not in `SPA_SURFACES`.
  - Proposed entries: `data-demo-root` (shell, required on demo documents), `data-demo-banner`,
    `data-demo-exit`, `data-demo-readonly-notice` (conditional), `data-demo-hub`,
    `data-demo-essay-card`, `data-demo-tour`, `data-demo-tour-step`, `data-demo-tour-next`/`-prev`/`-close`,
    and possibly the `tour` urlparam if the tour step rides the URL.
  - All four directions apply to each entry: journeys ⊆ manifest; SPA emissions ⊆ manifest
    (direction 2 scans `apps/web/src/spa`, so a tour selector invented there fails); every entry
    emitted; every entry asserted by a test or journey.
  - Tour steps must target **existing** manifest hooks (`data-findings-rail`, `data-pane="timeline"`,
    `data-finding`, …), never new test-only hooks.
- **SPA budget** (`apps/web/spa-budget.json`):
  - Snapshot JSON must arrive through twins, never be `import`ed. The projector output lives in a
    server-only package read from disk by `demoDataSource`.
  - The stale local build shows entry 205.9 kB of 250 kB, total JS 541 kB of 800 kB.
  - Make the tour overlay a lazy chunk (dynamic import from the demo layout, like
    `page-source-mode.ts`). It falls under the per-file `otherAsyncGzipBytes` 150 kB ceiling.
  - Tour copy must be `COPY` leaves (copy-containment, `spa/copy-containment.test.ts`). COPY ships
    in the entry, so keep tour copy small (a few kB) or accept the entry growth.
  - `tree.test.ts:46-60` forbids dynamic `import()` in route files. Lazy-load the tour from a
    surface or layout module, not a route file.
- **`check:spa-env`** (`scripts/check-spa-env.mjs`): no `import.meta.env` / `process.env` for a
  demo flag. Demo mode comes from server-rendered boot JSON only.
- **`tree.test.ts`:** under (b) no new route files are needed. Under (a) it would need to scan a
  `demo` subtree.
- **`contracts/spa.test.ts`:** add `/demo` to the public-routes case (`:120`); add a property test
  that `isDemoSlug` and `spaRouteFor` agree; keep `:17` and `:167` unchanged.
- **CSP:** the HTML middleware stamps nonce + policy on any `text/html` (`server.ts:333-353`), and
  demo documents inherit it. `connect-src 'self'` covers the twins, and no collab origin is needed.
  The only rule is the one in headline finding 4: no nested HTML.
- **Caching:**
  - Prod `web-backend` has Cloud CDN `CACHE_ALL_STATIC`, with a host + protocol + full-query cache
    key and no cookie in the key (`infra/pulumi/compute.ts:1217-1229`).
  - Twins: the guard sets `cache-control: public, max-age=300, s-maxage=86400` and an `ETag` of
    snapshot hash + deploy SHA. Bodies must be **cookie-invariant**, because the CDN ignores cookies.
  - The shell must stay `no-cache` (it carries a per-request CSP nonce, so edge-caching it would
    freeze the nonce).
  - The authed `no-store` floor (`server.ts:378-384`) only applies when no `cache-control` is set,
    so explicit headers win.
  - Static bundle assets are already `immutable` (`server.ts:6505-6520`). Snapshot chunks stay
    server-side inside the web image, not in `public/`. They could move to `public/` later if
    browser-direct fetch is wanted.

## 7. Security boundary

The demo path never reaches the API or the DB, by construction:
- `demoDataSource` imports nothing at runtime from `@rhema/api-client` (types only), `@rhema/db`,
  or `@rhema/live-clients`;
- it has no `fetch`;
- the nested app's session headers are a constant that nothing forwards.

Tests should assert:
1. **Static:** `demoDataSource`'s module graph has no `fetch(`, no `process.env`, and no runtime
   import of `api-client`, `db` or `live-clients` (an eslint boundary rule plus an
   `asset-parity.test.ts`-style scan).
2. **No outer DataSource call.** Build `createWebApp` with an outer `dataSource` whose every method
   throws and records calls. Then `GET /demo`, `/demo/:essay`, `/p/demo~x/{,v/1,v/1/diff/2,a/:id,revisions/:cid,review/:r,r/:r}`
   and every matching `/bff/p/demo~x/…`, with **no cookie** and **with** a session cookie. Each
   returns 200, there are **zero** outer-DataSource calls, and the JSON bodies are byte-identical
   across cookie states.
3. **No cookies set:** no `Set-Cookie` on any demo response (including `rhema_fp`).
4. **Writes refused:** every non-GET to `/p/demo~*` and `/bff/p/demo~*` returns 405
   `demo_read_only`, with zero DataSource calls of either kind.
5. **Non-allowlisted GETs:** `/p/demo~x/run`, `/export`, `/r/:id/events`, `/edit/:d/doc` and
   `demo~unknown` return a terminal 404 document, never the shell (no handoff loop).
6. **Slug grammar:** api `slugify` (`project-routes.ts:48`) never emits `~`.
7. **SPA DOM test:** a demo boot issues no `/session` request, constructs no `EventSource`, calls no
   `sendBeacon`, makes no POST, and only fetches `/bff/p/demo~*` and `/bff/demo/feed-labels`. A
   submit on any post form shows `data-demo-readonly-notice`.
8. **Tenant isolation:** `demoDataSource` is absent from `tools/system-pool-boundary.json`. Nothing
   new enters the two-tenant probe, since there is no new tenant read.

`apps/web/AGENTS.md` gotchas that apply: #1 (demo is a path fact, never a renderer flag); #2 (one
interceptor; the rewrite lives in `createRouter`); #3 (exits use `navigateDocument` /
`data-spa-native`); #4 (`data-renderer`, `data-nav-count`, truthful `data-route` on demo documents);
#5 (selectors are a contract); #8 (Stage-B acceptance needs JOURNEY screenshots of served `/demo`
routes at the deployed SHA, logged out and logged in; root gotcha #4).

## Requirements emitted

- **REQ-DEMO-WEB-1:** Demo projects use the reserved slug form `demo~<essay>` (from a
  contracts-owned registry). `~` is outside the API slug grammar. *Hook:* contracts property test;
  `slugify` never emits `~`.
- **REQ-DEMO-WEB-2:** A demo guard runs before every `/p/:project…` and `/bff/p/:slug…` handler.
  Non-GET returns 405 `{error:"demo_read_only"}`. GETs outside `DEMO_ROUTE_IDS` get a terminal 404
  document. Neither path calls any DataSource. *Hook:* the §7 tests 4–5.
- **REQ-DEMO-WEB-3:** Demo data is served only through `demoDataSource`, which implements the 24
  §1 methods and makes every other seam throw `DemoUnsupported`. It never calls `fetch`, the API,
  or the DB. *Hook:* the §7 tests 1–2.
- **REQ-DEMO-WEB-4:** Demo responses are cookie-invariant. The request's cookie and authorization
  headers never reach the demo compositions, and no demo response sets a cookie. *Hook:* §7 tests
  2–3.
- **REQ-DEMO-WEB-5:** Demo twins carry `readOnly:true`, no `collabWsUrl`, `showcase` false or
  absent, and no `activeRun`. *Hook:* twin unit test; a DOM test asserting the PM view is not
  editable.
- **REQ-DEMO-WEB-6:** The demo shell boot carries `demo:{essay,slug,signedIn}` and no `principal`.
  It marks every in-scope demo routeId `"spa"` on every device class. *Hook:* `spa-shell` unit test;
  a phone-UA DOM test with no `SsrHandoff`.
- **REQ-DEMO-WEB-7:** In demo mode the SPA issues no `/session`, `/bff/feed-labels`, handoff,
  beacon, SSE, palette-write, theme-write or `/doc` poll request. All writes are prevented client
  side, with a single read-only notice. *Hook:* the §7 test 7; the §4 table is the checklist.
- **REQ-DEMO-WEB-8:** HTML is never produced by a nested `createWebApp`; demo documents come from
  the outer app (CSP single-nonce). *Hook:* a test asserting each `<script>` has exactly one
  `nonce` matching the header.
- **REQ-DEMO-WEB-9:** `/demo` is a public SSR document in `SPA_PUBLIC_ROUTES`, with the full public
  head contract (N10). Essay pages are served at `/demo/<essay>/…` (rewrite, or the S4 fallback).
  *Hook:* `spa.test.ts:120`; `render.test.tsx` titles; a journey N10 leg.
- **REQ-DEMO-WEB-10:** Demo twins send explicit `cache-control: public` with an ETag. The demo shell
  sends `no-cache`. *Hook:* a header test; a prod CDN hit check at Stage B.
- **REQ-DEMO-WEB-11:** Exits from the demo (sign up, sign in, back to projects) are document
  navigations. Signed-in state is cosmetic only, derived from cookie presence. *Hook:* a DOM test
  for `data-spa-native` on `data-demo-exit`; a journey run under both sessions.
- **REQ-DEMO-WEB-12:** Every demo and tour hook is in `dom-contract.ts` (a `demo` bucket), emitted,
  and asserted. Tour steps target existing hooks. *Hook:* `pnpm check:dom-contract`.
- **REQ-DEMO-WEB-13:** The tour overlay is a lazy async chunk within the `otherAsync` ceiling, its
  copy is `COPY` leaves, and no snapshot JSON is in any bundle. *Hook:* `pnpm check:spa-budget`,
  copy-containment, and a bundle grep for snapshot markers.

## Open questions for operator

1. **Canonical demo URL.**
   - *Recommendation:* `/demo/<essay>/…` in the address bar via the TanStack `rewrite` (P7), after
     a half-day spike.
   - If the spike fails, accept `/p/demo~<essay>/…` after first navigation, keeping `/demo` and
     `/demo/<essay>` as entry aliases.
   - Reject option (a): about 120 href rewrites, plus the risk of a logged-in user being sent to
     their own project.
2. **Phone posture.** REQ-ED-12 forces the SSR Page on phone, and there is no SSR demo Page.
   - *Recommendation:* serve the SPA read-only Page with `compact` on phone, recorded as a dated
     amendment note to REQ-ED-12 scoped to demo (read-only already satisfies its no-editing intent).
   - The alternative is building SSR demo Pages, which roughly doubles the server work.
3. **Server reuse strategy.**
   - *Recommendation:* the nested `createWebApp` for JSON twins only (fast, and parity by
     construction), plus a follow-up to extract the compositions into a module.
4. **Analytics for demo visitors.** Today every beacon is session-attributed, or the landing-only
   allowlist.
   - *Recommendation:* add anonymous `demo.viewed` / `demo.tour_step` / `demo.cta_clicked` events
     to the `/a/landing`-style public allowlist. No dwell, no per-user attribution, even for
     logged-in visitors.
5. **Figures read on *Structure of Political Difference*.** The cost is low to moderate:
   - two snapshot methods, with the twins already present;
   - an unframed surface (no IDE chrome);
   - about 13 write hooks in `spa/surfaces/figures.tsx` that the capture listener covers;
   - inline SVG that must be sanitized at projection time.
   - *Recommendation:* include it as read-only cards, with the figure editor out of scope.
