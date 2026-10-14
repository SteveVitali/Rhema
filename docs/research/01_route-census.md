# 01_route-census — Route/surface census of apps/web (A1)

**Stream:** A
**Researched:** 2026-10-07
**Author:** explore-subagent (route-census worker)
**Ledger rows covered:** A1
**Confidence overall:** high

## Findings

### F1 — The web app is a Hono SSR+BFF monolith; ~181 route registrations, and `routes.tsx` is a declarative manifest, not the dispatcher

**Claim:** `createWebApp` in `apps/web/src/server.ts` registers every route directly on the Hono instance (60 `app.get`, 119 `app.post` textual registrations — a few inside loops that register more — plus `app.all("/api/auth/*")`, `app.all("*")` catch-all, and two `app.use("*")` middlewares); `routes.tsx`'s 33-entry `routes` array is documentation/test parity material (`matchAppRoute`), never consulted at request time.
**Status:** VERIFIED
**Evidence:** `apps/web/src/server.ts:307-313` (createWebApp + first middleware), `server.ts:5669` (`app.all("*")` 404), `server.ts:5645-5654` (CLIENT_ENTRIES loop mounts 5 asset routes), `server.ts:2292-2308` (suffix loop mounts 3 POSTs), `server.ts:2952-2955` (billingPost mounts each of 7 POSTs twice = 14 registrations), `apps/web/src/routes.tsx:72-154` (manifest + matchAppRoute; only imported by server.ts for its elements and by tests).
**Retrieved:** 2026-10-07T20:41:26Z
**Implication for the spec:** The route census must be built from `server.ts` registrations (ground truth), cross-checked against `routes.tsx`; the manifest can drift (see F8 on `/edit/:draftId`).
**Outline delta:** EXTENDS — manifest §4.2-style route tables exist but are non-normative.

### F2 — One auth-gate idiom, three refusal shapes; plus a public-page reverse gate

**Claim:** Auth gating is a per-handler `deps.session(c)` check — null ⇒ `c.redirect("/login")` for HTML routes, `c.json({error:"unauthenticated"},401)` or `c.body(null,401/204)` for JSON/beacon routes; public funnel pages call `signedIn()` (session + `dataSource.checkSession`) and redirect live sessions to `/app`; `app.onError` maps any `ApiError` 401 from a data call to `/login`, everything else to `webOnError` (one structured line + bare 500).
**Status:** VERIFIED
**Evidence:** `server.ts:3184-3186` (canonical guard), `server.ts:4953-4954` (JSON 401 variant), `server.ts:3117-3119` (beacon 401), `server.ts:1515-1518` (`signedIn`), `server.ts:1565-1568` (landing reverse-gate), `server.ts:422-425` (onError). Session itself is just forwarded `cookie` + dev identity headers (`main.ts:115-125`, cookie `__Host-rhema.session_token`, `main.ts:24-28`).
**Retrieved:** 2026-10-07T20:41:26Z
**Implication for the spec:** The SPA spec can keep a single "session absent ⇒ /login" rule for documents and a 401 rule for JSON; must also specify the signed-in-redirects-to-/app behavior of the six public pages.
**Outline delta:** CONFIRMS auth boundary; EXTENDS with the reverse gate + onError 401 mapping.

### F3 — A substantial BFF/JSON API lives inside the web server

**Claim:** Beyond HTML pages, `server.ts` serves: the `/api/auth/*` Better-Auth proxy (all methods, strips client-supplied internal-identity headers, re-stamps the trusted client IP, relays multiple Set-Cookie verbatim); a same-origin SSE proxy `GET /p/:project/r/:runId/events` that wraps the upstream `Response.body` with `text/event-stream` + resume params; JSON endpoints (`/p/:project/palette-search`, `/ide/theme`, `/p/:project/paper-theme`, `/p/:project/chat/*` dual-mode, `/p/:project/chat/turns/:runId`, `/p/:project/edit/:draftId/doc`, `POST …/save`); beacon sinks (`/a/dwell`, `/a/landing`, `/a/acq`); binary/proxied downloads (`/usage.csv`, `POST /p/:project/export`, `GET /p/:project/export/ai-use/:fmt`, `GET /app/settings/data/export/download` → 302 presigned); the public `/pricing/rates` relay; static bundles `/assets/{editor,ide,page,outline,landing}.js` and `/assets/fonts/:file`.
**Status:** VERIFIED
**Evidence:** `server.ts:1503-1510` (auth proxy mount) + `main.ts:132-155` (header stripping, OIDC stamp, `redirect:"manual"`, `duplex:"half"`); `server.ts:4299-4349` (SSE passthrough, `after`/`Last-Event-ID`, 502 on upstream failure); `server.ts:567`, `596`, `608`, `917`, `4952`, `4968` (JSON routes); `server.ts:3117`, `3129`, `3151` (beacons, quiet 204); `server.ts:2889-2903`, `5080-5116`, `5133-5151`, `2725-2734` (downloads/presigned 302); `server.ts:3082-3088` (rates, sessionless); `server.ts:5645-5667` (assets).
**Retrieved:** 2026-10-07T20:41:26Z
**Implication for the spec:** The browser never talks to `api.rhema.tools`; spec must model the web origin as the only public surface and enumerate these non-HTML transports explicitly.
**Outline delta:** EXTENDS — BFF surface is ~20 endpoints, larger than "SSR + a few forms".

### F4 — Islands: five bundles, strict progressive-enhancement posture

**Claim:** Client entries are `["editor","ide","page","outline","landing"]` (single source of truth `client-entries.mjs`, served from `public/`); `ide.js` mounts on every document carrying `data.ide`/`data-ide="1"` (pane state in localStorage, ⌘K palette fetch to `palette-search`, theme POSTs, `EventSource` feed tail with `?after=` resume); `page.js` mounts inside the `PageEditor` component (PM/Tiptap over `data-page-doc`, Hocuspocus WS to `collabWsUrl`, lock poll via `GET …/doc`); `outline.js` adds debounced autosave to the outline form; `landing.js` handles the IndexedDB drop-zone hold (landing `/`, `/app/new` hydration, `?hc=` consumed handshake on project pages); `editor.js` is built+served but unreachable — `GET /p/:project/edit/:draftId` now 302s to `/v/:n`. Inline (nonce'd) scripts cover: theme boot on every HTML doc, the dwell beacon on `dwellSurface` pages, the gate presence ping (`POST …/gates/:gid/activity`), the showcase anchor-viewed beacon (`/a/acq`).
**Status:** VERIFIED
**Evidence:** `apps/web/client-entries.mjs:5`; `render.tsx:149-150` (ide.js emit condition); `packages/ui/src/page-editor.tsx:479` (page.js), `packages/ui/src/source-editor.tsx:371` (editor.js), `pages.tsx:5439` (outline.js), `marketing.tsx:235` + `pages.tsx:268,1282` (landing.js sites); `client/ide.ts:1105-1123` (EventSource), `541` (palette fetch), `309` (POST helper); `client/page.ts:1-11` (collab, no markdown POST); `client/landing.ts:1-18`; `packages/ui/src/gate-card.tsx:191-196,634` (presence script); `render.tsx:95-113,177` (dwell beacon); `pages.tsx:2423-2431` (showcase beacon); `server.ts:4933-4949` (edit GET redirect).
**Retrieved:** 2026-10-07T20:41:26Z
**Implication for the spec:** Interactivity is layered, not app-wide; spec should preserve the no-JS fallbacks and name which bundle owns which surface.
**Outline delta:** EXTENDS; CORRECTS any assumption that the editor bundle serves a route.

### F5 — Mutation convention: plain form POSTs → 302 + flash query; truthful-refusal re-renders

**Claim:** Nearly every mutation is a `application/x-www-form-urlencoded` (or multipart) form POST that resolves slug→id, forwards the session via `deps.dataSource`, and redirects back with a flash param (`?saved=1`, `?notice=`, `?disposed=`, `?bulkdone=`…); validation/ApiError refusals re-render the owning page with the notice and the upstream status (400/403/409/422/429); chat write routes are dual-mode (`wantsJson` ⇒ JSON DTO, else 302) and `/outline`,`/visualize` message verbs short-circuit to the consent sheets by 302; `safeBack` confines `next`/`returnTo` to `/p/…` (no open redirects).
**Status:** VERIFIED
**Evidence:** `server.ts:4458-4457`/`4458` (disposition: 302 `?disposed=` or 422/409 dossier re-render), `server.ts:636-647,700-742` (`wantsJson`/`chatReply`/`chatFail`, verb intercepts at `716-733`), `server.ts:5682-5685` (`safeBack`), `server.ts:3484-3492` (`?approvals=saved|invalid`), `server.ts:3968-4094` (run POST's six-branch error matrix re-rendering the sheet).
**Retrieved:** 2026-10-07T20:41:26Z
**Implication for the spec:** Mutation surface = redirect-outcome contract + notice vocabulary; any SPA rewrite must keep flash-param semantics for deep links.
**Outline delta:** CONFIRMS progressive enhancement; EXTENDS with the flash-param grammar.

### F6 — Unusual transports: SSE wrap, binary Response downloads, meta-refresh polls, buffered multipart uploads, external 302s

**Claim:** (a) SSE events are proxied as a wrapped upstream body stream; (b) exports/CSV/AI-use statement return `new Response(dl.bytes, {content-disposition: attachment})`; (c) pending conversions and the Stripe return use `<meta http-equiv="refresh">` self-polls (`autoRefresh` in PageData); (d) all file uploads (new project, import, voice samples, Substack export zip, account-export restore) are buffered server-side and pushed to GCS quarantine via api-presigned PUT — the browser never holds a signed URL except… see Open questions; (e) purchase hand-offs are server-minted 302s validated against `STRIPE_HOSTED_ORIGINS`/`GOOGLE_OAUTH_ORIGINS` allowlists (mirrored into CSP `form-action`); (f) a `rhema_fp` HttpOnly device-fingerprint cookie is minted on the run-sheet GET and forwarded on Run POST.
**Status:** VERIFIED
**Evidence:** `server.ts:4341-4348` (SSE), `server.ts:5106-5112`, `2896-2902`, `5144-5150` (downloads), `server.ts:2725-2734` (presigned 302), `page-data.ts:608` + `render.tsx:128-130` (autoRefresh), `data.ts:1075-1094` (`uploadKey` presign→PUT), `server.ts:5982-5998` (`parseImportInput` multipart), `server.ts:255-260,198-203,353` (redirect allowlists + CSP), `server.ts:395-416,3822,3966` (fingerprint cookie).
**Retrieved:** 2026-10-07T20:41:26Z
**Implication for the spec:** The spec needs explicit transport classes — document / JSON / SSE / binary / redirect-out / meta-poll — not a single page model.
**Outline delta:** EXTENDS.

### F7 — SSR error/empty states are systematic, not incidental

**Claim:** Unknown slugs/params render `notFoundElement` at 404 (sometimes inside the surface's own element, e.g. outline/figure 404 views); every ancillary read is wrapped `.catch(() => null/[])` so a missing seam degrades to a hidden affordance rather than a failed page; `app.onError` maps ApiError 401→/login and everything else to one structured line + bare 500; degraded upstream calls (≥500/transport) bump a request counter via `noteDegradedUpstream`.
**Status:** VERIFIED
**Evidence:** `server.ts:3186,3443,3612,4147,4274,4729` (404 pattern), `server.ts:4741-4752` (best-effort rail reads), `server.ts:473-479` (ideContext best-effort reads), `server.ts:422-425` + `data.ts:1058-1067` (onError + degraded counter).
**Retrieved:** 2026-10-07T20:41:26Z
**Implication for the spec:** Empty/degraded rendering is a first-class contract ("hide the affordance, never fail the page") — spec must carry it.
**Outline delta:** CONFIRMS/EXTENDS.

### F8 — Drift/legacy surfaces worth flagging

**Claim:** (a) `/p/:project/edit/:draftId` GET is a pure 302 to `/v/:n` — the manifest still maps it to `editorElement`, which nothing renders; the `/edit/:draftId/{doc,save,note,cancel-run,revise}` endpoints remain the Page's live transport; (b) legacy settings GET `/settings`, `/app/settings` 302 to `/app/settings/account`; legacy POSTs `/settings/theme`, `/settings/privacy` still write and 302 to canonical sections; `/settings/billing` is a full alias mount of the billing page + all 7 POSTs; (c) `/app/usage/r/:runId` is a canonicalizing redirect; `/p/:project/f/:fid` is a find-and-302 deep link; (d) `POST /logout` has no session check (harmless — `endSession` no-ops); (e) `POST /a/landing` is the only intentionally public write.
**Status:** VERIFIED
**Evidence:** `server.ts:4935-4949` vs `routes.tsx:93`; `server.ts:2394-2401,2759-2778` (legacy), `server.ts:2947-2955` (billing dual mount), `server.ts:4288-4295,4627-4642` (redirect routes), `server.ts:1842-1845` (logout), `server.ts:3129-3146` (`/a/landing`).
**Retrieved:** 2026-10-07T20:41:26Z
**Implication for the spec:** Spec should mark redirect-only and alias routes distinctly; dead `editorElement`/`editor.js` is cleanup or deliberate build parity.
**Outline delta:** CORRECTS manifest completeness assumptions.

### F9 — No `/sample` route exists; the sample dossier is embedded static data

**Claim:** The read-only sample dossier (`SAMPLE_DOSSIER`, `apps/web/src/sample-dossier.ts`) is rendered inline inside `/` (landing), `/invite`, `/signup` (sent state), and `/showcase`; `/showcase` is the closest thing to a `/sample` route — signed-out visitors get the static board, signed-in users 302 to their own Showcase project's dossier.
**Status:** VERIFIED
**Evidence:** `server.ts:1722-1736`, `marketing.tsx:549-556,587-593`, `pages.tsx:304-307`, `sample-dossier.ts:19`.
**Retrieved:** 2026-10-07T20:41:26Z
**Implication for the spec:** Any "sample dossier" requirement maps onto `/showcase` + embeds, not a dedicated route.
**Outline delta:** CORRECTS the assumed `/sample` surface.

## Route census

Columns: Route (method + path) | class | surface group | server data / api calls | interactivity | mutation surface → outcome. `auth` = `deps.session(c)` guard (302 /login on HTML, 401 on JSON).

| Route | Class | Group | Data needs | Interactivity | Mutation → outcome |
|---|---|---|---|---|---|
| GET `/healthz` | public | misc | `buildGitSha` env | none | — ; JSON `{ok,service,build}` |
| GET `/favicon.ico`, `/favicon.svg` | public | misc | inline `FAVICON_SVG` | none | — |
| GET `/assets/{editor,ide,page,outline,landing}.js` | public | bff-api | `public/<entry>.js` from disk | — | — ; empty 404 when unbuilt |
| GET `/assets/fonts/:file` | public | bff-api | woff2, name regex-gated | — | — |
| ALL `/api/auth/*` | public | bff-api (auth) | forwards req to api; strips forged internal headers, re-stamps client IP, relays Set-Cookie | browser auth flows (OAuth callback, magic-link verify, sign-out) | any method → upstream response verbatim; unmounted (`authProxy` unset) ⇒ 404 |
| GET `/pricing/rates` | public | bff-api | `getRatesPublication()` (sessionless) | none | — ; JSON or 503 |
| POST `/a/dwell` | auth(401) | bff-api beacon | `{surface,ms}` → `surface.dwell` event | inline dwell beacon (sendBeacon/fetch) | JSON → 204 always |
| POST `/a/landing` | public | bff-api beacon | `landing.viewed`/`dropzone_used` + IP + token | landing.js beacon | JSON → 204 |
| POST `/a/acq` | session-optional | bff-api beacon | `postAcquisitionEvent` (event/props/projectId/runId) | inline beacon script | JSON → 204 |
| GET `/` | public | marketing | `signedIn`→`/app`; `landing.viewed` beacon; `?audience=test` for test tenants | landing.js (IndexedDB drop-zone hold) | — |
| GET `/invite` | public | shell/auth | `signedIn`→`/app`; `signupOpen` flag | none | — |
| GET `/pricing` | public | marketing | `signedIn`→`/app`; `?cycle=annual`; claims fold | none | — |
| GET `/showcase` | public | marketing | signed-in: `getShowcaseEntry`→302 to own dossier/project; else static `SAMPLE_DOSSIER` | none | — |
| GET `/signup` | public | shell/auth | `signedIn`→`/app`; `?entry/?intent/?src/?held` | none | — |
| POST `/signup` | public | shell/auth | `dataSource.signup{email,code,method,clientIp,intent}` + `checkInvite` + `beginAuth` | form-POST | → "sent" render / 302 Google OAuth / error re-render 400\|429 |
| GET `/login` | public | shell/auth | `signedIn`→`/app`; `?error=` code→copy map | none | — |
| POST `/login` | public | shell/auth | `signup` + `checkInvite` + `beginAuth` | form-POST | → sent render / OAuth 302 / error 400\|429 |
| POST `/logout` | public (no gate) | shell/auth | `endSession` → api sign-out + cookie clears | form-POST | → 302 `/` |
| GET `/app` | auth | project home | `listProjects`, `listVoices`, `getProjectGrouping`, `getBillingBalance`, `searchProjects(?q=)`, `listProtocolCards`, `listDeletedProjects(?deleted=1)`; showcase/intent precedence may 302 to dossier or `/app/new`; `?verified=1` mints `email.verified` | form POSTs only (no island — not an IDE doc) | — ; first-run redirects as above |
| POST `/app/grouping` | auth | project home | `setProjectGrouping` | form | → 302 `/app` |
| GET `/app/new` | auth | onboarding | `listProtocolCards`+`listVoices`; `?entry`,`?held` | landing.js (hold→file-input hydration) | — |
| POST `/app/new` | auth | onboarding | scratch→`createProject`; upload→`previewWorkspaceImport` (multipart file/paste) | form + meta-refresh pending | → 302 `/p/:slug?created=scratch` / preview / pending+poll render |
| GET `/app/new/preview` | auth | onboarding | `previewWorkspaceImport(qk)` poll leg | meta-refresh | — ; no `qk` ⇒ 302 `/app/new` |
| POST `/app/new/create` | auth | onboarding | `createProject{quarantineKey,picks}` | form | → 302 `/p/:slug?created=…(&hc=)` or fix_now→`/v/:n`; 409 `conversion_pending`→pending render |
| POST `/p/:project/rename` | auth | project home | `renameProject{title}` | form | → 302 `/p/:slug` |
| POST `/p/:project/duplicate` | auth | project home | `duplicateProject` | form | → 302 `/p/:newSlug` |
| POST `/p/:project/{archive,unarchive,delete}` | auth | project home | `archive/unarchive/deleteProject` | form | → 302 `/app` |
| POST `/p/:project/restore` | auth | project home | `restoreProject` over `listDeletedProjects` | form | → 302 `/app?deleted=1` |
| GET `/app/inbox` | auth | inbox/feed | `getInbox`, `getInboxBadge`, `listGates` per referenced project (gate-card join) | form POSTs | — |
| POST `/app/inbox/read`, `/app/inbox/read-all` | auth | inbox/feed | `markInboxItemRead` / `markInboxAllRead` | form | → 302 `/app/inbox` |
| GET `/app/usage/r/:runId` | auth | misc redirect | `getRunReport`→projectSlug | — | → 302 `/p/:slug/r/:runId#report` |
| GET `/p/:project` | auth | project home (IDE flagship) | `listProjects` row; unread `run_finished` inbox row ⇒ mark-read + 302; `listGates`, `listDecisions`, `getApprovalOverrides`, `getApprovalSettings`, `getExplainers`, `getProjectVoice`+`listVoices`, `getInboxBadge`, `getTimeline`, `getRunEvents` (feed), `loadEditorPage(head)` | ide.js + page.js (working-head mount; collab WSS when configured) + SSE feed tail + dwell "project" + landing.js on `?hc=` + gate presence inline scripts | — (GET); dozens of POST children below |
| GET `/p/:project/palette-search` | auth | bff-api | `searchPalette(q, projectId)` | ide.js ⌘K fetch | — ; JSON `{results}` |
| POST `/ide/theme` | auth | bff-api | `setTheme{appTheme}` | ide.js fetch | JSON `{ok}` or `deferred` |
| POST `/p/:project/paper-theme` | auth | bff-api | `setPaperTheme{paperTheme}` | ide.js fetch | JSON `{ok}` or `deferred` |
| POST `/p/:project/chat/turns` | auth | bff-api (dual) | `postChatTurn{message,modelTier?,idempotencyKey?}`; `/outline`,`/visualize` verbs ⇒ 302 to sheets | ChatDesk form + island JSON | → 201 JSON \| 302 `/p/:slug#chat` \| sheet 302; upstream status/code passthrough |
| POST `/p/:project/chat/{plan-decision,threads,pins,pins/:pinId/remove,corrections,suggestions,notes,attachments}` | auth | bff-api (dual) | `postChatPlanDecision`, `createChatThread`, `add/removeChatPin`, `postChatCorrection`, `postChatSuggestion`, `postChatNote`, `postChatAttachment{quarantineKey,…}` | same dual-mode | → 201/200 JSON \| 302 `#chat`; `chatCall` truthful errors (402/409 verbatim, 5xx→502) |
| GET `/p/:project/chat/turns/:runId` | auth | bff-api | `getChatTurn(thread,runId)` | island turn-status poll | — ; JSON |
| GET `/p/:project/run` | auth | run sheet (only paywall) | `getRunSheetContext{workflow,scope}`, `getBillingBalance`, `getProjectVoice`(+`estimateVoice` chained action), `getPretriage` (revise); mints `rhema_fp` cookie; records `exhausted_prompt=shown` when insufficient | inline estimate-repaint script | — |
| POST `/p/:project/run` | auth | run sheet | `createRun{…full sheet state,idempotencyKey,toggles,inputSnapshot,scope,guidance,protocol/venue/stage,userSources,approvalPolicy,autoProceedRun,draftId,corrKind,entitlementId,fingerprint}` + `setConsentPref` | form | → sheet re-render `started` \| rich error re-renders: 402 insufficient, 409 `run_in_progress`, 403 tier/suspended/email_unverified, 403\|422\|429 trial codes |
| POST `/p/:project/exhausted` | auth | billing | `recordExhaustedPrompt` + `getBillingBalance` | form | → 302 Stripe payment link (allowlist + `client_reference_id`) \| `/run?notice=purchase_paused` |
| GET `/p/:project/r/:runId` | auth | run report | `getRunReport{advanced}`, `getTimeline`, `markInboxRunRead` | dwell "report" | — |
| GET `/p/:project/r/:runId/events` | auth | bff-api SSE | `streamRunEvents{after,lastEventId}` | ide.js EventSource (`?after=<lastSeq>` resume) | — ; wrapped `text/event-stream`; 502/404 on upstream failure |
| POST `/p/:project/r/:runId/{pause,resume,stop,cancel,note,walkthrough}` | auth | run steering | `pauseRun`/`resumeRun(note)`/`stopRun`×2/`postRunNote(text)`/`retryWalkthrough` | form | → 302 `/p/:slug`; stale 400/404/409 swallowed |
| POST `/p/:project/r/:runId/refund` | auth | run report | `requestRefund` | form | → 302 `/p/:slug/r/:runId#report` |
| GET `/p/:project/review/:runId` | auth | dossier/review | `getDossier` (404→notFound), `markInboxRunRead`, `getTimeline`, `listGates` (`?gate=` focus card), `previewBulkFindings` (`?bulk=`); emits `run.report_viewed`/`finding.viewed`/`secondread.opened`; severity budget + shared filters from query | ide.js + dwell "dossier" + inline `/a/acq` beacon (showcase dossiers) | — |
| POST `/p/:project/review/:runId/findings/:fid/disposition` **and** `/p/:project/findings/:fid/disposition` | auth | dossier/review | `recordDisposition{verb,note,adapted_text,reason_code}` | form | → 302 `?disposed=<fid>`/`?derror=` \| 422/409 dossier re-render w/ inline error |
| POST `/p/:project/review/:runId/findings/:fid/{apply,promote,obligations}` **and** `/p/:project/findings/:fid/{apply,promote,obligations}` (6 regs) | auth | dossier/review | `applyFinding`/`promoteFinding`/`addFindingToObligations` | form | → 302 `?applied\|promoted\|obligated=<fid>#finding-<fid>` \| `?ferr=<fid>&fmsg=` on 404/409/422 |
| POST `/p/:project/review/:runId/findings/bulk-preview` | auth | dossier/review | — (pure bounce) | form | → 302 GET `?bulk=<action>&bsec=` |
| POST `/p/:project/review/:runId/findings/bulk` | auth | dossier/review | `applyBulkFindings{action,section,only[]}` | form | → 302 `?bulkdone=<n>&bulkskip=<n>` \| `?ferr=bulk` |
| GET `/p/:project/f/:fid` | auth | dossier deep link | `resolveFinding` | — | → 302 `/p/:slug/review/:runId#<anchor>` |
| GET `/p/:project/obligations/new` | auth | findings Desk | project row + `back` | none | — |
| POST `/p/:project/obligations` | auth | findings Desk | `createObligation{title,severity}` | form | → 302 `back?obligation=new` \| 422 re-render |
| GET `/p/:project/revisions/:cid` | auth | dossier/review | `getWhatChanged` | none | — |
| POST `/p/:project/revisions/:cid/hunks/:hunkId/comments` | auth | revisions | `commentOnHunk{text}`→Guidance row | form | → 302 `?commented=<hunkId>` |
| GET `/p/:project/v/:v` | auth | editor/Page | `resolveEditorDraft(v)`, `getEditorDoc{exact}`+PM `docJson`, `getVersions`, `listRestorePoints`, `previewRestorePoint(?restore=)`; phone/showcase ⇒ `readOnly` + no collab | page.js (PM island) + collab WSS `collabWsUrl` + dwell "page" | — |
| POST `/p/:project/v/:v/restore/:rp` | auth | editor/Page | `applyRestorePoint` | form | → 302 `/v/:n?restored=<n>` \| back `/v/:v` |
| GET `/p/:project/v/:n/diff/:m` | auth | editor/Page (compare) | `getVersionDiff(n,m)`; `?layout=side\|inline\|moves` | none | — |
| POST `/p/:project/v/:n/diff/:m/hunks/:hunkId/comments` | auth | compare | `commentOnCompareHunk{text}` | form | → 302 `?commented=` |
| GET `/p/:project/a/:artifactId` | auth | editor/Page | `getArtifactPage` (404/415→notFound) | page.js read-only | — |
| GET `/p/:project/edit/:draftId` | auth | editor (redirect-only) | `getEditorDoc`→draftN | — | → 302 `/p/:slug/v/<draftN>` (`?noted` survives) |
| GET `/p/:project/edit/:draftId/doc` | auth | bff-api | `getEditorDoc` JSON (lock poll) | page.js/editor.js poll | — ; JSON \| 401/404 |
| POST `/p/:project/edit/:draftId/save` | auth | bff-api | `saveEditorDraft{markdown,provenanceSpans?,agentSpans?}` — JSON body or `text/plain` pagehide beacon | island autosave/beacon | → JSON `EditorSaveDto` \| ApiError status passthrough (409 lock flips client read-only) |
| POST `/p/:project/edit/:draftId/note` | auth | editor transport | `postEditorNote{text}` | form | → 302 `?noted=1` |
| POST `/p/:project/edit/:draftId/cancel-run` | auth | editor transport | `cancelEditorRun` | form | → 302 same page |
| POST `/p/:project/edit/:draftId/revise` | auth | editor transport | `reviseWithEdits` | form | → 302 `/p/:slug` |
| GET `/p/:project/outline/promote` | auth | outline | `getOutlinePromotion{scope,threadId,turnId,slug}` (404 render when absent) | none | — |
| POST `/p/:project/outline/promote` | auth | outline | `promoteOutline{idempotencyKey,…}` — creates the `outline` run | form | → 302 `/p/:slug` \| sheet re-render + notice at upstream status |
| GET `/p/:project/outline` | auth | outline | `getOutline{slug?}` (view-mapped spine/sections/gaps/provenance) + `surfaceEstimate` draft line; `editable` flag | outline.js debounced autosave (editable only); phone ⇒ read-only | — |
| POST `/p/:project/outline` | auth | outline | `patchOutline{edit: decoded ed.*}` | form + island fetch (`Accept: json`) | → JSON DTO \| 302 `?saved=1` \| 422 `save_failed` |
| POST `/p/:project/outline/delete` | auth | outline | `deleteOutline` | form | → 302 `/p/:slug` \| 409→`/outline?notice=cited` |
| POST `/p/:project/outline/gaps/:gapId/answer` | auth | outline | `answerOutlineGap{text}` | form | → 302 `?saved=1` |
| GET `/p/:project/visualize` | auth | figures | local `surfaceEstimate(figure)`; `?request/?kind/?figure/?prior/?entry` | none | — |
| POST `/p/:project/visualize` | auth | figures | `createRun{workflow:"figure",figure:{…}}` — only figure-run creator | form | → 302 `/p/:slug/figures` \| sheet re-render + notice (status passthrough) \| 422 `request required` |
| GET `/p/:project/figures` | auth | figures | `listFigures` | none | — |
| GET `/p/:project/figures/:figureId` | auth | figures | `getFigure` | none | — |
| POST `/p/:project/figures/:figureId` | auth | figures | `patchFigure{caption,alt,sourceLine}` | form | → 302 `?saved=1` \| `?notice=` (422 alt>250) |
| POST `/p/:project/figures/:figureId/spec-edit` | auth | figures | `editFigureSpec{mark}` (0-cr iterate) | form | → 302 `?notice=` on failure |
| POST `/p/:project/figures/:figureId/versions/:n/restore` | auth | figures | `restoreFigureVersion` | form | → 302 same card |
| POST `/p/:project/figures/:figureId/propose` | auth | figures | `proposeFigure{draftId,afterBlockId}` | form | → 302 card (`?notice=figure_not_ready` on 409) |
| POST `/p/:project/figures/:figureId/proposals/accept` | auth | figures | `acceptFigureProposal` | form | → 302 `/v/:draftN` on insert else card |
| POST `/p/:project/figures/:figureId/proposals/reject` | auth | figures | `rejectFigureProposal` | form | → 302 card |
| GET `/p/:project/import` | auth | onboarding/import | project row | none | — |
| POST `/p/:project/import/preview` | auth | import | `previewImport` (multipart file \| paste \| `qk`) — web presigns + PUTs quarantine | form + meta-refresh pending | → preview render \| pending+`autoRefresh` render |
| GET `/p/:project/import/preview` | auth | import | `previewImport(qk)` poll leg | meta-refresh | — ; no `qk` ⇒ 302 `/import` |
| POST `/p/:project/import/create` | auth | import | `createImport{qk}` | form | → 302 `/p/:slug` \| 409 `conversion_pending`→pending render |
| GET `/p/:project/export` | auth | export/data-rights | `getExportDialog` (formats, obligations line, statement preview) | none | — |
| POST `/p/:project/export` | auth | export | `exportProject{format,profile?,cslStyle?,attachAiUse,attachProvenance}` | form | → **binary attachment Response** \| 302 `?error=1` |
| POST `/p/:project/export/addition` | auth | export | `appendAiUseAddition{sentence}` (append-only) | form | → 302 `?added=1` |
| GET `/p/:project/export/ai-use/:fmt` | auth | export | `downloadAiUseStatement` | none | — ; binary attachment \| 404 |
| POST `/p/:project/voice` | auth | voices | `setProjectVoice{personaId,register}` | form | → 302 `/p/:slug` (`?voice_locked=1` on 409) |
| GET `/p/:project/voice/reseed` | auth | voices | `getVoiceReseedPreview` | none | — |
| POST `/p/:project/voice/adopt` | auth | voices | `adoptProjectVoice{reseed}` | form | → 302 `/p/:slug` |
| POST `/p/:project/voice/fork` | auth | voices | `forkProjectVoice{personaId}` | form | → 302 `/p/:forked.slug` |
| POST `/p/:project/update-voice` | auth | voices | `buildVoice{tier:"quick",projectId}` | form | → 302 `/p/:slug/run` (+preserved query) |
| GET `/voices` | auth | voices | `listVoiceGroups` | none | — |
| GET `/voices/new` | auth | voices | none | none | — |
| POST `/voices/new` | auth | voices | `createVoice` + `addVoiceSample` (multipart file/paste) + `addVoiceSampleUrl` + `buildVoice` | form multipart | → 302 `/v/:persona` (`?build_failed=1`) \| 400 re-render |
| GET `/v/:persona` | auth | voices | `getVoice`, `estimateVoice`, `getVoiceUpdatePlan`, `listVoiceConnections`+`getVoiceSample` (samples tab) | none | — ; `?tab=`/`?sample=`/`?saved`/`?added`/`?cancelled`/`?corrected`/`?reconstruct`/`?build_failed` flashes |
| POST `/v/:persona/seed` | auth | voices | `saveVoiceSeed{description,byline,registers}` | form | → 302 `?saved=1` |
| POST `/v/:persona/samples` | auth | voices | `addVoiceSample` (multipart file \| text,title) | form multipart | → 302 `?added=1` |
| POST `/v/:persona/samples/url` | auth | voices | `addVoiceSampleUrl{url,title}` (api-side fetch only) | form | → 302 `?tab=samples&added=1` |
| POST `/v/:persona/samples/:itemId` | auth | voices | `setVoiceSampleIncluded{included}` | form | → 302 `?tab=samples` |
| POST `/v/:persona/samples/:itemId/reconstruct` | auth | voices | `reconstructVoiceSample{tier,confirmed:true}` | form | → 302 `?tab=samples&sample=&reconstruct=queued` |
| POST `/v/:persona/connections` | auth | voices | `createVoiceConnection{substack handle \| url}` or `linkVoiceExportZip` (multipart zip→quarantine) | form multipart | → 302 `?tab=samples` |
| POST `/v/:persona/connections/:cid/{discover,confirm,sync,settings,remove}` | auth | voices | `discover`/`confirm{items include[]}`/`sync`/`patch{autoIncludeNew,dailySync}`/`remove` VoiceConnection | form | → 302 `?tab=samples` |
| POST `/v/:persona/sync` | auth | voices | `syncAllVoiceConnections` | form | → 302 `?tab=samples` |
| POST `/v/:persona/delete` | auth | voices | `deleteVoice` (typed `confirm=="delete"`) | form | → 302 `/voices` |
| POST `/v/:persona/build` | auth | voices | `buildVoice{tier}` | form | → 302 `/v/:persona` |
| POST `/v/:persona/update` | auth | voices | `updateVoice{scope?,register?}` | form | → 302 `/v/:persona` |
| POST `/v/:persona/gates/:gid` | auth | voices | `decideRunGate{action}` + hidden `runId` | form | → 302 `/v/:persona` |
| POST `/v/:persona/corrections` | auth | voices | `addVoiceCorrection{text,statementRef?,artifactId?}` | form | → 302 `?tab=description&corrected=1` |
| POST `/v/:persona/fork` | auth | voices | `forkVoice` | form | → 302 `/v/:newPersona` |
| POST `/v/:persona/cancel` | auth | voices | `cancelVoiceRun{runId}` | form | → 302 `?cancelled=1` |
| GET `/settings`, GET `/app/settings` | auth | settings (legacy) | — | — | → 302 `/app/settings/account` |
| GET `/app/settings/account` | auth | settings | `getAccountSettings`; `?confirmEmail=<token>` consumed server-side first | forms | — |
| POST `/app/settings/account` | auth | settings | `updateAccountSettings{name,byline,image}` | form | → `?saved=1` |
| POST `/app/settings/account/email` | auth | settings | `requestEmailChange{email}` | form | → `?notice=email-pending\|email-invalid` |
| POST `/app/settings/sessions/revoke` | auth | settings | `revokeSession{sessionId}` | form | → `?saved=1` |
| POST `/app/settings/account/delete` | auth | data-rights | `requestAccountDeletion{confirmation}` | form | → `/app/settings/data?notice=deletion-scheduled\|confirmation-required` |
| POST `/app/settings/account/delete/cancel` | auth | data-rights | `cancelAccountDeletion` | form | → `?notice=` |
| GET `/app/settings/preferences` | auth | settings | `getPreferencesSettings` | forms | — |
| POST `/app/settings/preferences` | auth | settings | `updatePreferences` + `setConsentPref` (clamp ≤1000) + `setTheme` | form | → `?saved=1` |
| GET `/app/settings/notifications` | auth | settings | `getNotificationPrefs` + `listProjects` | form | — |
| POST `/app/settings/notifications` | auth | settings | `updateNotificationPrefs` — sequential per-project patches + digest + quiet hours | form | → `?saved=1` |
| GET `/app/settings/integrations` | auth | settings | `getIntegrationsSettings` | form | — |
| POST `/app/settings/integrations/:id/disconnect` | auth | settings | `disconnectIntegration` | form | → `?saved=1` |
| GET `/app/settings/data` | auth | data-rights | `getPrivacySettings`, `getDataSettings`, `getAccountExportState` | forms | — |
| POST `/app/settings/data/privacy` | auth | data-rights | `setAnalyticsOptOut` | form | → `?saved=1` |
| POST `/app/settings/data/support-access` | auth | data-rights | `setSupportAccess` (72-h grant) | form | → `?saved=1` |
| POST `/app/settings/data/preference-learning` | auth | data-rights | `setPreferenceOptOut` (inverted checkbox) | form | → `?saved=1` |
| POST `/app/settings/data/export` | auth | data-rights | `requestAccountExport` | form | → `?notice=requested` |
| GET `/app/settings/data/export/download` | auth | data-rights | `getAccountExportDownloadUrl?id=` | — | → **302 presigned URL** \| `?notice=expired` |
| POST `/app/settings/data/import` | auth | data-rights | `importAccountExport` (multipart zip) | form multipart | → `?notice=imported&p&v&f` \| `deduped` \| `importFailed` |
| POST `/settings/theme`, `/settings/privacy` | auth | settings legacy | `setTheme` / `setAnalyticsOptOut` (inverted) | form | → 302 canonical section `?saved=1` |
| GET `/p/:project/settings` | auth | settings (project) | `getProjectSettings` + `getApprovalSettings` | forms | — |
| POST `/p/:project/settings` | auth | settings (project) | `updateProjectSettings` patch: venue/protocolId/rigorDefault/modelTierDefault/paperTheme + `pd_*`/`ov_length`/`stage` protocol overrides | form | → `?saved=1` \| `?notice=invalid` |
| POST `/p/:project/settings/guidance/:gid` | auth | settings (project) | `updateGuidance{body,workflows}` | form | → `?saved=1` |
| POST `/p/:project/settings/approvals` | auth | settings (project) | `putApprovalSettings{policy, ov_<kind> grid}` | form | → `?approvals=saved` \| `?approvals=invalid` (422) |
| POST `/p/:project/guidance` | auth | settings (project) | `createProjectGuidance{body,workflows}` | form | → 302 `back` |
| POST `/p/:project/guidance/:gid/retire` | auth | settings (project) | `retireGuidance` (never deletes) | form | → 302 `back` |
| POST `/p/:project/approval-overrides` | auth | project home | `getApprovalOverrides`+`setApprovalOverrides` (triage 24-h opt-in) | form | → 302 `/p/:slug` |
| POST `/p/:project/explainers/:name/dismiss` | auth | misc | `dismissExplainer` | form | → 302 `/p/:slug` |
| POST `/p/:project/gates/:gid` | auth | project home (Needs-you) | `decideGate{action,guidance,standing,ed.* structured edits,ed.runOverride}`; `listGates` consulted for runOverride kind | form | → 302 `/p/:slug` |
| POST `/p/:project/gates/:gid/activity` | auth | bff-api-ish | `recordGateActivity{present\|reading\|blur}` | inline presence script in gate card | → 204 \| 401 \| 404 \| 422 |
| POST `/p/:project/decisions/:dcr` | auth | project home | `answerDecision{answer}` | form | → 302 `/p/:slug` |
| GET `/usage` | auth | billing/usage | `getUsage` + `getUsageAccount` | dwell "usage" | — |
| GET `/usage.csv` | auth | billing/usage | `downloadUsageCsv` | none | — ; binary attachment \| 404 |
| GET `/p/:project/usage` | auth | billing/usage | `getUsageProject` | none | — |
| GET `/app/settings/billing` **and** `/settings/billing` | auth | billing | `getSubscription` + `getPlans` | forms | — ; `?saved`/`?notice` flashes |
| POST `…/settings/billing/{subscribe,topup,portal}` (×2 mounts each) | auth | billing | `startCheckout{kind,tier/cycle|packId}` / `createBillingPortalSession` | form | → **302 Stripe-hosted URL** (allowlist-validated) \| `?notice=<api code>` |
| POST `…/settings/billing/{change-plan,cancel,auto-reload,waitlist}` (×2 mounts each) | auth | billing | `changePlan` / `cancelSubscription` / `setAutoReload` / `joinTeamWaitlist` | form | → `?saved=1` \| `?notice=<code>` |
| GET `/billing/return` | auth | billing | `getCheckoutSession(session_id)`; `?cancelled=1` | meta-refresh 5 s while `open` <30 s | — |
| ALL `*` | — | misc | `notFoundElement` | — | 404 catch-all |

(routes.tsx manifest adds no server-undiscovered surface; its `/p/:project/edit/:draftId`→`editorElement` entry is stale — F8.)

## Open questions

1. **Chat-attachment presign gap:** `server.ts:890-891` says "the island presigns + PUTs to quarantine first", but no web route exposes presign and no client file references it — the only presign leg is server-side `uploadKey` in `data.ts:1079-1094`. Does the island's attachment upload exist, or is the form's pasted-`quarantineKey` path the only live one?
2. **Page provenance saves under collab:** `client/page.ts:7` states "NO markdown POST" (collab persists), yet `POST …/save` accepts `provenanceSpans`/`agentSpans` (server.ts:4975-4996). Does page.js still POST provenance-only saves when the collab wire is up, and what happens when `collabWsUrl` is unset but the page isn't read-only?
3. **Session presence ≠ validity:** `session(c)` returns headers whenever *any* cookie exists (`main.ts:115-124`); an expired cookie still "gates in" and relies on the api's 401 → `onError` redirect. Intentional? The spec should pin this.
4. **CSRF posture:** no form carries a CSRF token anywhere; protection rests on SameSite=Lax session cookies + origin checks upstream. The spec should state whether that posture is intentional for all ~100 mutation routes.
5. **`editorElement`/`editor.js` disposition:** dead on routes but still in the manifest and built — cleanup or deliberate asset parity?
6. **`/app` reverse-redirect edge:** the showcase-first-open precedence (server.ts:1905-1927) can redirect `/app` to a dossier or `/app/new` — spec must decide how an SPA handles a navigation that conditionally rewrites its landing.

## Spec requirements emitted

1. **REQ-INV-1** — The spec's route model must distinguish SSR document routes from same-origin BFF endpoints (JSON, SSE, beacon, binary download, redirect-out, asset) living in the same server; ~20 non-HTML endpoints exist.
2. **REQ-INV-2** — A single auth rule covers documents (session headers absent ⇒ 302 `/login`; api-side `ApiError` 401 ⇒ `onError` redirect to `/login`) and a JSON variant (401 body); public funnel pages additionally reverse-gate live sessions to `/app`.
3. **REQ-INV-3** — Mutation contract: plain form POST → 302 + flash query param (`?saved`/`?notice`/`?disposed`/`?bulkdone`/…); refusals re-render the owning page at the upstream status with named-notice copy. The `?`-param notice vocabulary is user-visible contract.
4. **REQ-INV-4** — Transport exceptions enumerated: SSE passthrough (`/r/:runId/events`), binary `Response` downloads (export, CSV, AI-use statement), presigned 302 (account export download), meta-refresh self-polls (import preview ×2, `/app/new` pending, `/billing/return`), external allowlisted 302s (Stripe checkout/portal/payment-link, Google OAuth), WS collab that is NOT proxied by web (LB path-routes `/collab`).
5. **REQ-INV-5** — Islands are progressive enhancement over working forms: `landing.js` (hold claim), `ide.js` (panes/⌘K/theme/SSE feed), `page.js` (PM + collab + lock poll), `outline.js` (autosave); every island write has a same-origin route that also accepts a no-JS form POST. A missing bundle artifact 404s with empty body and the page still works.
6. **REQ-INV-6** — Public surface is exactly: `/`, `/invite`, `/pricing`, `/pricing/rates`, `/signup`(GET+POST), `/login`(GET+POST), `/logout`(POST), `/showcase`, `/api/auth/*`, `/a/landing`, `/healthz`, `/favicon.*`, `/assets/*` — plus the `*` 404.
7. **REQ-INV-7** — Degraded-render contract: best-effort reads `.catch(() => null)` and hide their affordance; unknown ids render `notFoundElement` at 404; upstream 5xx bumps the request's degraded counter and surfaces as a bare request-id'd 500.
8. **REQ-INV-8** — Legacy/redirect surfaces (`/settings`, `/app/settings`, `/settings/theme`, `/settings/privacy`, `/settings/billing` alias mount, `/app/usage/r/:runId`, `/p/:project/f/:fid`, `/p/:project/edit/:draftId` GET) must be carried or explicitly retired in the spec.
