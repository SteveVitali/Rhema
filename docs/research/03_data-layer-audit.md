# 03_data-layer-audit — Data-layer audit for a JSON BFF

**Stream:** A
**Researched:** 2026-10-07
**Author:** Devin (Explore subagent)
**Ledger rows covered:** A3
**Confidence overall:** high

## Findings

### F1 — `apps/web` already fronts every business read/write through ONE typed seam

**Claim:** SSR route handlers never touch a database or the wire directly — they call `DataSource` (`apps/web/src/data.ts:244–1014`), whose production implementation `apiDataSource` (data.ts:1048–1554) delegates method-for-method to `createApiClient` from `@rhema/api-client` with the viewer's session headers injected.
**Status:** VERIFIED
**Evidence:** `apps/web/src/data.ts:143–147` (the seam's own doc), `244–1014` (the interface — ~120 methods across projects/runs/findings/gates/inbox/editor/versions/outline/figures/chat/voices/settings/billing/export/analytics/notifications), `1048–1554` (the api-backed impl). `apps/web/src/main.ts:102–104` wires `dataSource: apiDataSource(apiBaseUrl, undefined, stampInternal)`.
**Retrieved:** 2026-10-07T20:41:26Z
**Implication for the spec:** The DataSource method list IS effectively the BFF endpoint inventory; a BFF that re-exposes these methods as JSON endpoints needs no new api surface for the reads.
**Outline delta:** CONFIRMS — the existing seam is already a BFF-shaped contract.

### F2 — The api's error channel is a stable `{error: <code>}` string preserved end-to-end

**Claim:** `createApiClient`'s `json<T>` helper reads `{error}` off any non-ok response into `ApiError.code`; `signup` additionally converts expected <500 refusals into result data (`{ok:false,status,error}`, defaulting to `"signup_failed"`); ≥500 and transport failures rethrow.
**Status:** VERIFIED
**Evidence:** `packages/api-client/src/index.ts:2592–2606` (ApiError: status/url/code), `3301–3318` (json<T> code extraction), `3355–3377` (signup refusal→data), `225–254` (InviteCheckDto `{ok,reason?}` / SignupResultDto).
**Retrieved:** 2026-10-07T20:41:26Z
**Implication for the spec:** A BFF must pass `{error:<code>}` + HTTP status through verbatim — the web layer today makes dozens of code-level decisions (`run_in_progress`, `trial_*`, `conversion_pending`, `figure_not_ready`, `outline_cited`, `frozen`, refund codes).
**Outline delta:** EXTENDS — the spec should pin `{status, error: <stable-code>, detail?}` as the BFF error envelope; `ApiError` is the existing client-side contract.

### F3 — Auth is already a same-origin server-side proxy, including ADR-040 stamping

**Claim:** `/api/auth/*` is proxied verbatim (all methods, `redirect:"manual"`, multi `set-cookie` preserved via `getSetCookie()`); the proxy STRIPS any client-supplied `x-rhema-client-ip`/`x-rhema-internal-token` and re-stamps the resolved browser IP with a runtime-minted OIDC token; `beginAuth`/`endSession` implement Google OAuth + magic-link start and sign-out through `apiFetch` with the same stamping and Origin declaration.
**Status:** VERIFIED
**Evidence:** `apps/web/src/server.ts:1500–1510` (mount + request-id relay), `main.ts:30–45` (header strip + `relayResponse` set-cookie preservation), `main.ts:132–155` (authProxy: strips forged stamps, resolves `forwardedClientIp`, re-stamps), `main.ts:156–246` (beginAuth/endSession; `error` codes extracted from `?error=`, `{code|error|message}`, or 429→`rate_limited`), `main.ts:15–31` (the same-origin rationale + cookie names `__Host-rhema.session_token` / `rhema-dev.session_token`).
**Retrieved:** 2026-10-07T20:41:26Z
**Implication for the spec:** The BFF must keep auth on the app host (cookies, OAuth state, magic-link verify) — this is already the architecture; the spec should also keep the forged-stamp strip on every proxied leg.
**Outline delta:** CONFIRMS §auth — same-origin BFF auth is implemented today.

### F4 — ADR-040 trusted client-IP forwarding is ambient-token based, cached, and fail-open

**Claim:** `createInternalTokenMinter` mints a GCE-metadata OIDC ID token for `INTERNAL_AUTH_AUDIENCE`; positive cache to `exp−60s` (50 min fallback), negative cache 60 s, mint timeout 2 s, failure resolves `null` (never throws) and `apiFetch` falls back to `x-forwarded-for` with the resolved IP.
**Status:** VERIFIED
**Evidence:** `apps/web/src/internal-token.ts:13–84`; `apps/web/src/main.ts:54–100` (`stampInternal`, `apiFetch`), `main.ts:103–104` (the stamp is handed to `apiDataSource` — the `signup` call site at `data.ts:1116–1121` applies it via `init.headers`).
**Retrieved:** 2026-10-07T20:41:26Z
**Implication for the spec:** Any BFF running in `apps/web` inherits this for free; if the BFF becomes a separate service it must mint its own OIDC token — no shared secret exists to copy.
**Outline delta:** CONFIRMS.

### F5 — `PageData` mixes verbatim api DTOs with web-side render view-models; ~25 seams are render-bound

**Claim:** Most PageData fields are api DTOs passed through untouched (`dossier`, `gates`, `decisions`, `inbox.items`, `timelineView`, `billing.*`, `settings.*`, `voice.*`, `figure.card`, `compare.data`, `runReport.report`, `outlinePromotion.promotion`, `figures.items`, `files`, `chat`, `approvalSettings`, `pretriage`, `usage*`), but the shell also assembles render-only shapes: `ProjectRowView`/`ProjectGroupView`/`VoiceGroupView` (state-map.ts), `ide.palette` (a `JSON.stringify`ed `PaletteData`), `feed.rows` (copy-rendered `FeedRow[]`), `runSheet.view` (`RunSheetView` from `@rhema/run-sheet`), `page.docJson` (ProseMirror JSON via `markdownToDoc`), the `outline` mapped view + `draftEstimateCredits`, the `visualize` estimate, and ~15 flash/notice echo fields (`triage.dispositionError`, `dossierView.notice`, `created`, `heldConsumed`, `rename`, `saved`, `notice`, `checkoutCancelled`, `autoRefresh`, `compact`, `chatError`, `voiceNew.error`, `export.error/added`, `accountExport.notice`).
**Status:** VERIFIED
**Evidence:** `apps/web/src/page-data.ts:60–609` (the full PageData shape), `state-map.ts:107–253` (toProjectRowView/groupByAttention/groupByVoice — baked hrefs, formActions, COPY labels), `feed-labels.ts:15–66` (FeedLabelMaps + feedRowsFor), `server.ts:447–562` (`ideContext` assembling principal+theme+files+chat+PaletteData), `server.ts:3259–3299` (feed + status line), `server.ts:3902–3967` (buildSheet call), `page-data.ts:617–639` (`markdownToDoc(doc.markdown).toJSON()`), `server.ts:1064–1129` (outline view map + surfaceEstimate), `server.ts:1199–1245` (visualize estimate).
**Retrieved:** 2026-10-07T20:41:26Z
**Implication for the spec:** "Serve typed JSON" splits into (a) proxy DTOs verbatim — trivial; (b) serialize the derived view-models — the mappings live in web modules (`state-map`, `feed-labels`, `@rhema/run-sheet`, `@rhema/findings-core` filters) which are all plain TS and could run in a BFF or a client; (c) flash/notice state — replace query-param echoes with structured mutation responses.
**Outline delta:** EXTENDS — the spec must decide per surface whether view-model mapping is a BFF responsibility (ship `ProjectGroupView` JSON) or a client concern (ship `ProjectRow[]` + shared `@rhema/*` mappers).

### F6 — A dozen JSON-capable seams already exist on the web host today

**Claim:** These routes already answer JSON (or dual-mode): `GET /p/:project/palette-search` (`{results}`), `POST /ide/theme`, `POST /p/:project/paper-theme` (`{ok,…,deferred?}`), `GET /p/:project/edit/:draftId/doc` (EditorDocDto verbatim), `POST /p/:project/edit/:draftId/save` (EditorSaveDto; ApiError status passthrough; JSON or text/plain beacon), `POST /p/:project/gates/:gid/activity` (204/422), `GET /pricing/rates` (DTO passthrough), `POST /a/dwell`, `POST /a/landing`, `POST /a/acq` (beacons → 204), all 8 chat POSTs + the turn-poll GET (dual-mode via `wantsJson`/`chatReply`; failures answer `{error:<code>}` at the upstream status — `chatFail`), and `POST /p/:project/outline` (dual-mode; `{error:"save_failed"}` 422).
**Status:** VERIFIED
**Evidence:** `server.ts:567–591`, `596–621`, `627–702` (`wantsJson`/`chatCall`/`chatFail` — status-preserving error proxy with structured logging), `704–933` (chat routes), `1135–1154` (outline autosave), `3593–3604`, `3082–3088`, `3117–3176`, `4952–5003`.
**Retrieved:** 2026-10-07T20:41:26Z
**Implication for the spec:** The `wantsJson` dual-mode pattern is the migration template already in production — the SPA work is extension, not invention.
**Outline delta:** CONFIRMS feasibility; EXTENDS — `chatFail`'s "pass the api status/code verbatim; 5xx→502 `chat_upstream_error`" is the de-facto BFF error contract worth codifying.

### F7 — The form-POST→redirect mutation surface is ~70 routes; every one has a typed api call underneath

**Claim:** Enumerated web mutation POSTs by outcome (all redirect or re-render HTML; none return domain JSON except F6's set):
- projects: `/app/grouping`→`/app`; `/app/new`→`/p/:slug?created=<entry>` or re-render w/ `error`; `/app/new/create`→`/p/:slug`; `/p/:p/rename`→`/p/:slug`; `/duplicate`→new or original slug; `/archive`,`/unarchive`,`/delete`→`/app`; `/restore`→`/app?deleted=1` (server.ts:1961, 2056–2152, 2200, 2264–2324)
- inbox: `/app/inbox/read`,`/read-all`→`/app/inbox` (2368–2387)
- settings tree: account/email/sessions-revoke/delete/delete-cancel/preferences/notifications/integrations-disconnect/data-privacy/support-access/preference-learning/export/import + legacy `/settings/theme|privacy` → redirect w/ `saved=1` or `notice=<token>` (2429–2777)
- project settings: `/p/:p/settings`, `settings/guidance/:gid`, `approval-overrides`, `settings/approvals`, `guidance`, `guidance/:gid/retire`, `explainers/:n/dismiss` → `?saved=1|?notice=…` (2781–2871, 3438–3554)
- gates/decisions: `/p/:p/gates/:gid` (decideGate w/ `ed.*` grammar), `/decisions/:dcr` → `/p/:slug` (3556–3617)
- import: `import/preview` re-renders ready/pending HTML; `import/create`→`/p/:slug` or re-render on 409 `conversion_pending` (3635–3736)
- runs: `POST /p/:p/run` re-renders the sheet — `started:true` on success, 409 `run_in_progress` in-progress view, 402 insufficient-balance notice, 403 `trial_denied|phone_challenge_required|model_tier_requires_upgrade|trial_base_only|account_suspended|email_unverified`, 422 `trial_word_cap|trial_shape|entitlement_unavailable`, 429 `trial_ceiling` — all mapped to COPY notices at the api's status (3849–4094); `/exhausted`→302 Payment Link or `/p/:slug/run` (4100+); steering `pause|resume|stop|cancel|note|walkthrough` → `/p/:slug` (4376–4384); `refund`→report w/ notice (4390+)
- findings: `disposition` (×2 mount points; `verb|note|adapted_text|reason_code|next` → `?disposed|?derror|?ferr&fmsg`), `apply|promote|obligations` (×2 each → `?applied|?promoted|?obligated` or `?ferr&fmsg`), `obligations` create, `bulk-preview`, `bulk` → `?bulkdone&bulkskip` (4458–4623)
- versions/revisions: `revisions/:cid/hunks/:h/comments`→`?commented=`; `v/:v/restore/:rp`→`?restored=`; `v/:n/diff/:m/hunks/:h/comments`→`?commented=` (4669–4896)
- editor: `edit/:d/note`→`?noted=1`; `cancel-run`,`revise`→redirect (5007–5039)
- export: `POST /p/:p/export`→binary download Response (not JSON); `export/addition`→`?added=1` (5080–5130)
- voices: `/voices/new` (re-render errors) + `/v/:persona/*` ×13 (seed/samples/samples-url/sample-toggle/connections/discover/confirm/sync/sync-all/conn-settings/conn-remove/reconstruct/delete/build/update/gates/corrections/fork/cancel) → redirects w/ `?saved|?added|?notice` (5197–5646)
- figures: `visualize` POST (re-render 422 `requestRequired` / error notice), `figures/:f` patch, `spec-edit`, `versions/:n/restore`, `propose`, `proposals/accept|reject` → `?saved|?notice=<code>` (1225–1497)
- outline: `promote`→redirect or re-render notice (404/409→`COPY.promote.notFound`), `outline/delete`→redirect or `?notice=cited` on 409, `gaps/:gapId/answer`→`?saved=1` (973–1044, 1158–1190)
**Status:** VERIFIED (route registrations + representative handler bodies read; individual voice-handler bodies beyond samples/connections were pattern-matched from registrations — their outcomes are uniformly `c.redirect` as grep confirms no `c.json` exists between 5162–5646)
**Evidence:** `apps/web/src/server.ts` at the ranges cited per group above.
**Retrieved:** 2026-10-07T20:41:26Z
**Implication for the spec:** Every mutation already maps 1:1 onto a typed client call; the BFF work is (a) replacing form-fields+query-flashes with JSON request/response bodies and (b) preserving each route's code→outcome mapping (e.g., `409 conversion_pending` is a *successful state*, not an error).
**Outline delta:** CORRECTS any assumption that mutations need new api work — they need a transport translation only.

### F8 — Six surfaces are inherently non-JSON transports

**Claim:** SSE (`GET /p/:project/r/:runId/events` pipes the api's `GET /runs/:id/events` with `?after`/`last-event-id` resume), binary downloads (`POST /p/:p/export`, `GET /p/:p/export/ai-use/:fmt`, `GET /usage.csv`, `GET /app/settings/data/export/download`→302 presigned URL), multipart upload+quarantine (`parseImportInput` reads `File`/`paste`/`qk`; `apiDataSource.uploadKey` presigns then PUTs bytes straight to GCS — the cookie never leaves the api origin), the collab WebSocket (`COLLAB_WS_URL` → `wss://<host>/collab`, Hocuspocus), the api's `/export/download` + `/api/action/:token` signed/token links, and `GET /projects/:id/figures/:figureId/render.png` (api-only; the web card embeds `FigureCardDto.files.svgLight/svgDark` inline instead).
**Status:** VERIFIED
**Evidence:** `server.ts:4299–4350` (SSE pipe + status passthrough), `5056–5151` (export binary), `2889` + `api billing-routes.ts:731` (usage.csv), `2725–2734` (export-download 302), `data.ts:1079–1094` (presign→PUT; session rides only api calls), `server.ts:5982–5998` (parseImportInput), `main.ts:109–110` + `client/collab.ts:4–15` (wss), `api/account-export-routes.ts:179`, `api/notification-routes.ts:201–202`, `api/figure-routes.ts:787` + `api-client index.ts:2515–2522`.
**Retrieved:** 2026-10-07T20:41:26Z
**Implication for the spec:** The BFF contract needs three transport classes — JSON, binary download, and SSE — plus presigned-URL upload handoffs; they should be specified explicitly, not forced into a JSON envelope.
**Outline delta:** EXTENDS.

### F9 — The api exposes ~215 route handlers behind the session; the typed client covers the surface an SPA needs, with three small gaps both ways

**Claim:** `apps/api/src/index.ts:368–680` mounts 20+ route modules (run/estimate/sse/billing/revision/dossier/timeline/voice/ingest/analytics/theme/notification/signup/triage/approval/chat/outline/finding/editor/version/figure/export/account-export/shell/project/search/settings/sheet-context/import) plus `/healthz`, `/pricing/rates`, `/session`, `/api/auth/*`. The `ApiClient` interface covers every web-consumed route; gaps: the client has `estimate`, `getSession`, `getShowcase`, `getRates`, `recordLandingEvent`, `presignImportUpload` methods the DataSource wraps or bypasses (checkSession/getRunEvents/streamRunEvents use raw `f()` fetches, not client methods — data.ts:1096–1099, 1464–1482); conversely the api's `PATCH /chat/threads/:tid` and `POST …/threads/:tid/archive` exist (chat-routes.ts:393,407) but have no client/DataSource method.
**Status:** PARTIALLY VERIFIED — the route set is a grep enumeration of registrations (215 matches); every module's mount line was read in index.ts; per-route request/response schemas were verified only where cited elsewhere in this note.
**Evidence:** `apps/api/src/index.ts:362–680`; route lists per module (triage-routes.ts:311–699, run-routes.ts:226–1163, timeline-routes.ts:198–970, billing-routes.ts:124–731, settings-routes.ts:193–827, editor-routes.ts:239–712, chat-routes.ts:291–924, outline-routes.ts:323–603, voice-routes.ts:279–1919, ingest-routes.ts:196–664, figure-routes.ts:338–787, finding-routes.ts:196–411, version-routes.ts:486–636, export-routes.ts:433–649, account-export-routes.ts:84–205, approval-routes.ts:93–252, revision-routes.ts:32–111, notification-routes.ts:51–246, theme-routes.ts:31–60, analytics-routes.ts:58–195, project-routes.ts:104–538, project-list.ts:566–641 (`/projects`, `/showcase`, `/invite/check`), import.ts:239–295, signup.ts:303, sse-routes.ts:82, sheet-context.ts:48, estimate-routes.ts:136, search.ts:93).
**Retrieved:** 2026-10-07T20:41:26Z
**Implication for the spec:** The typed client IS the contract; a BFF can proxy ~all api routes unchanged. The DataSource's three raw-fetch seams (`checkSession`, `getRunEvents`, `streamRunEvents`) and the upload presign compose should become first-class client methods.
**Outline delta:** EXTENDS — catalog the client-vs-DataSource asymmetries in the spec's endpoint table.

### F10 — The web layer does slug→id resolution by listing all projects on nearly every project route

**Claim:** `projectIdFor`/`projectRow`/`chatProject`/`editorTarget` each call `listProjects()` then `.find(r=>r.slug===slug)` — one extra `GET /projects` per request, sometimes two (loader + mutation share it per request, e.g. `getDossier` at data.ts:1104–1108 does the join inside the seam). No api route accepts a slug directly.
**Status:** VERIFIED
**Evidence:** `data.ts:1070–1074`, `1104–1108`; `server.ts:3184–3185`, `5050–5054`, plus every `/p/:project` handler's `rows.find(r => r.slug === slug)`.
**Retrieved:** 2026-10-07T20:41:26Z
**Implication for the spec:** A BFF can collapse this (one resolve per request, or slug-keyed endpoints); for an SPA the cost is the same — spec should decide whether slug-keyed BFF routes cache/forward the join.
**Outline delta:** EXTENDS — this is latent N+1 the spec should name.

### F11 — Request-time derivations live in the SSR layer and must be relocated for an SPA

**Claim:** (a) `isPhoneRequest` (UA/`Sec-CH-UA-Mobile` sniff → `compact`, Page `readOnly`, outline `editable` downgrade); (b) flash state arrives via query params (`?saved`,`?notice`,`?disposed`,`?created`,`?hc`,…); (c) self-polling is `autoRefresh` meta-refresh (import preview 5 s; billing return only within a 30 s `open` window); (d) error display maps stable codes→COPY strings server-side (e.g. `signupErrorFor`, the run-sheet `noticeByCode` map); (e) `decodeGateEditFields` decodes the `ed.*` flat-form grammar into the structured edit payload the api's PATCH/POST expects.
**Status:** VERIFIED
**Evidence:** `server.ts:5676–5680` (isPhoneRequest), `3338–3343`+`1119` (readOnly/editable gates), `2129`/`3656`/`3694`/`3110–3111` (autoRefresh policies), `3968–4086` (noticeByCode + COPY maps), `server.ts:92` + `3566`/`1142` (decodeGateEditFields from `@rhema/findings-core`).
**Retrieved:** 2026-10-07T20:41:26Z
**Implication for the spec:** The spec should decide: code→copy mapping stays a BFF concern (ship localized strings) or moves client-side (ship `error.code` and let the SPA render copy — this also removes COPY from the data path). The `ed.*` grammar should be replaced by structured JSON `edit` bodies (the api already accepts them).
**Outline delta:** EXTENDS.

### F12 — Several read seams are "best-effort optional" by design, and PageData degrades rather than erroring

**Claim:** ~half the DataSource methods are declared optional (`getInbox?`, `getChat?`, `getFiles?`, `getRunSheetContext?`, …); `apiDataSource` binds all of them, but every loader wraps them in `.catch(() => null|[]|undefined)` so a failed read degrades the page instead of failing it; `apiDataSource` instruments ≥500 upstreams via `noteDegradedUpstream`.
**Status:** VERIFIED
**Evidence:** `data.ts:290–1014` (the `?` seams), `1053–1067` (degraded-upstream instrumentation), `server.ts:3209–3273` (`Promise.all` + per-read `.catch` degrade), `466–479` (ideContext reads).
**Retrieved:** 2026-10-07T20:41:26Z
**Implication for the spec:** A JSON page-data endpoint must decide how to represent "optional seam failed": today's contract is "field absent", which JSON can express as `null`/omitted — but the degraded-upstream telemetry side-channel (`x-rhema-*` counters) needs an equivalent signal.
**Outline delta:** EXTENDS.

## Coverage table — route/surface → JSON today → extraction needed

| Web surface (route) | Loads via (DataSource→api) | Has JSON today? | Extraction needed |
|---|---|---|---|
| `GET /app` home | listProjects, listVoices, getProjectGrouping, getBillingBalance, searchProjects, listProtocolCards, listDeletedProjects, getShowcaseEntry | No (HTML) | Serialize composed `home` + row views (state-map) or ship DTOs |
| `GET /app/new`, preview polling | listProtocolCards, listVoices, previewWorkspaceImport, createProject | No | ImportPreviewOutcome already JSON-shaped; form/echo fields are render state |
| `GET /app/inbox` | getInbox, getInboxBadge, listGates (per-row cards) | No | DTOs verbatim — near-trivial |
| `GET /p/:project` overview | listProjects, listGates, listDecisions, getApprovalOverrides/Settings, getExplainers, getProjectVoice, listVoices, getInboxBadge, getTimeline, getRunEvents→feedRowsFor, loadEditorPage | No | The heaviest composite (ideContext + feed + page + voice) |
| `GET /p/:project/palette-search` | searchPalette | **Yes** (`{results}` remapped) | None — contract exists |
| `POST /ide/theme`, `/p/:p/paper-theme` | setTheme, setPaperTheme | **Yes** | None |
| Chat POSTs + `GET chat/turns/:runId` | getChat/postChatTurn/… | **Yes** (dual-mode) | Choose JSON branch; drop form branch |
| `POST /p/:p/outline` autosave | patchOutline | **Yes** (dual-mode) | Same |
| `GET /p/:p/outline`, promote, delete, gap-answer | getOutline, getOutlinePromotion, promoteOutline, deleteOutline, answerOutlineGap | No | OutlineDto is JSON; `view` mapping + ed.* grammar need replacing |
| `GET/POST /p/:p/visualize`, `/p/:p/figures*` | listFigures, getFigure, patchFigure, editFigureSpec, restoreFigureVersion, proposeFigure, accept/reject, createRun(figure) | No | DTOs verbatim; estimate is web-computed |
| `GET /p/:p/import`, preview, create | previewImport, createImport (+ presign/PUT) | No | ImportPreviewOutcome is JSON-ready; multipart→quarantine handoff |
| `GET/POST /p/:p/run` | getRunSheetContext, getBillingBalance, getProjectVoice, estimateVoice, setConsentPref, createRun | No | RunSheetContextDto is JSON; RunSheetView is render-bound — the largest extraction |
| `GET /p/:p/review/:runId` dossier | getDossier, markInboxRunRead, getTimeline, listGates, previewBulkFindings | No | DossierDto is JSON; dossierView (filters/bulk/notice) is render state |
| `GET /p/:p/r/:runId` report | getRunReport(+advanced), getUsageRunAdvanced | No | DTOs verbatim |
| `GET /p/:p/r/:runId/events` | streamRunEvents | SSE (not JSON) | Keep SSE; document `?after` resume |
| Steering POSTs (pause/resume/stop/note/walkthrough/refund) | pauseRun…requestRefund | No | Return DTO instead of redirect |
| Finding POSTs (disposition/apply/promote/obligations/bulk) | recordDisposition, applyFinding, … | No | DTOs + structured error codes already exist upstream |
| `GET /p/:p/revisions/:cid`, hunk comments | getWhatChanged, commentOnHunk | No | DTOs verbatim |
| `GET /p/:p/v/:v`, `/a/:artifactId`, `v/:n/diff/:m`, restores | resolveEditorDraft, getEditorDoc, getArtifactPage, getVersionDiff, listRestorePoints, preview/applyRestorePoint, commentOnCompareHunk | No | EditorDocDto/VersionDiffDto JSON; `docJson` is web-derived (markdownToDoc) |
| `GET /p/:p/edit/:d/doc`, `POST …/save` | getEditorDoc, saveEditorDraft | **Yes** | None — pure pass-through |
| `POST …/edit/:d/note|cancel-run|revise` | postEditorNote, cancelEditorRun, reviseWithEdits | No | Return DTO instead of redirect |
| `GET/POST /p/:p/export`, `/export/ai-use/:fmt` | getExportDialog, exportProject, appendAiUseAddition, downloadAiUseStatement | Mixed (binary) | Dialog DTO is JSON; downloads stay binary |
| `GET /voices`, `/voices/new`, `/v/:persona` (+~15 writes) | listVoiceGroups/listVoices, getVoice, createVoice, +13 writes | No | DTOs verbatim; notice echoes are render state |
| `GET /p/:p/voice*` (picker/adopt/fork/reseed) | getProjectVoice, setProjectVoice, adoptProjectVoice, forkProjectVoice, getVoiceReseedPreview | No | DTOs verbatim |
| `GET/POST /app/settings/*` (6 sections) | getAccountSettings…updateNotificationPrefs | No | All DTO-backed — near-trivial |
| `GET /usage`, `/p/:p/usage`, `/usage.csv` | getUsage, getUsageProject, downloadUsageCsv | Mixed (CSV binary) | JSON for pages; CSV stays binary |
| `GET /app/settings/billing`, checkout POSTs, `/billing/return` | getSubscription, getPlans, startCheckout, createBillingPortalSession, cancelSubscription, changePlan, getCheckoutSession, setAutoReload, joinTeamWaitlist | No | DTOs verbatim; checkout = JSON {url} not redirect |
| `GET /pricing`, `GET /pricing/rates` | (page is static+claims) / getRatesPublication | **Yes** (rates) | Page is static — no seam needed |
| `GET/POST /signup`, `/login`, `/logout`, `/invite`, `/` | checkInvite, signup, checkSession, beginAuth/endSession/authProxy | No | Keep HTML flows OR JSON endpoints for SPA auth-start; auth proxy unchanged |
| `POST /a/dwell`, `/a/landing`, `/a/acq` | postAnalyticsEvent, recordLandingEvent, postAcquisitionEvent | **Yes** (204) | None |
| `GET /p/:p/r/:run/events` initial rows | getRunEvents (`?poll=1` SSE replay → parse) | Semi | FeedEventRow[] is JSON-serializable; labels are COPY-rendered |
| Collab (page island) | `collabWsUrl` → wss | No (WebSocket) | Out of BFF scope — direct wss |
| `GET /p/:p/exhausted` POST | recordExhaustedPrompt + Payment-Link 302 | No | Return `{url}` for SPA navigation |

## Open questions

1. **Slug-keyed or id-keyed BFF routes?** Every web route does listProjects→find(slug); a BFF could resolve once and/or the api could accept slugs — undecided cost/UX tradeoff.
2. **Who renders copy?** Today error codes→strings is server-side (`COPY.*`, `feedLabelMaps`). An SPA either ships `ApiError.code` and localizes client-side, or the BFF returns display strings. Mixed answer today (chat returns codes; findings pages return copy).
3. **`docJson` home:** `markdownToDoc` is DOM-free (`page-data.ts:619–639`) — ship markdown and derive client-side, or formalize a `docJson` field on an editor read DTO?
4. **`ed.*` form grammar** (`decodeGateEditFields`, `@rhema/findings-core`): replace with structured JSON `edit` payloads the api already accepts; confirm the PATCH edit schema covers every emitted shape.
5. **SSE vs alternatives** for the live feed in an SPA (EventSource already works same-origin via the proxy) — likely keep; confirm multi-instance stickiness/`?after` resume suffices.
6. **Flash-state replacement:** ~15 query-param echo fields (`?saved`, `?notice`, `?disposed`, `?created`, `?hc`…) need a chosen SPA convention (mutation response payloads carrying the same tokens).
7. **`compact`/`readOnly` gating:** `isPhoneRequest` SSR decisions (Page read-only on phone width; outline `editable`) — move to client capability checks or keep a BFF hint?
8. **Unused api surface:** `PATCH /chat/threads/:tid`, `POST …/threads/:tid/archive` exist with no client method — spec should decide whether the BFF exposes them.
9. **Signed/token routes** (`/export/download`, `/api/action/:token`, `/stripe/webhook`) are not session-bearing SPA surfaces — out of scope, but the BFF must not accidentally require auth on the emailed-link routes if it proxies them.
10. **`checkSession`/`getRunEvents`/`streamRunEvents` bypass the typed client** (raw `f()` calls in data.ts) — fold into ApiClient for one contract?

## Spec requirements emitted

1. **REQ-DAT-1** — The BFF SHALL expose a JSON endpoint per user surface, returning `api-client` DTOs verbatim where the underlying api route is already JSON (read proxy table = DataSource method list).
2. **REQ-DAT-2** — The BFF error envelope SHALL be `{ error: <stable code>, detail?: string }` at the upstream HTTP status, preserving every `ApiError.code` the api emits (incl. `rate_limited`, `invite_required`, `run_in_progress`, `conversion_pending`, `figure_not_ready`, `outline_cited`, `frozen`, `trial_*`, `email_unverified`, `account_suspended`, `refund_*`).
3. **REQ-DAT-3** — Every form-POST mutation SHALL gain a JSON request/response equivalent; redirect-only flows' notice semantics (`?saved`, `?notice=<token>`, `?disposed`, `?ferr&fmsg`, `?bulkdone&bulkskip`) SHALL become structured response fields.
4. **REQ-DAT-4** — Composite page payloads (workspace home, project overview, dossier, run sheet) SHALL be served either as BFF-assembled aggregates or as a documented fan-out of typed reads; per-`ideContext` seams (principal, theme, files, chat, badge, timeline, feed, palette) SHALL be enumerable.
5. **REQ-DAT-5** — Render-bound derivations SHALL be located explicitly: view-model mapping (`state-map`, `feedRowsFor`/`feedLabelMaps`, `buildRunSheetView`), `docJson` (`markdownToDoc`), and estimator calls (`surfaceEstimate`) either run in the BFF and ship as data or ship raw DTOs for client-side mapping — per surface, never implicit.
6. **REQ-DAT-6** — Slug→id resolution SHALL happen once per request (BFF-side join or slug-keyed api routes), not one listProjects round-trip per call.
7. **REQ-DAT-7** — The BFF SHALL keep the `/api/auth/*` same-origin proxy verbatim (set-cookie relay, forged-stamp strip, ADR-040 re-stamp) and apply the ADR-040 stamp (or XFF fallback) to every rate-limited web→api call.
8. **REQ-DAT-8** — Non-JSON transports SHALL be specified separately: binary downloads (content-disposition preserved), SSE run-events passthrough (`?after`, `last-event-id`), presigned-URL upload handoff (session never leaves api origin), and the collab WebSocket (out of BFF).
9. **REQ-DAT-9** — Multipart/import flows SHALL keep the presign→PUT→quarantine-key pattern; the BFF SHALL NOT proxy file bytes.
10. **REQ-DAT-10** — Validation failures SHALL surface the api's 422 `{error, detail}` (e.g. `invalid_disposition`, `invalid_reason_code`, `invalid_overrides`, alt≤250) without remapping.
11. **REQ-DAT-11** — Capability-derived flags (`compact`, `readOnly`, `editable` downgrades from `isPhoneRequest`) SHALL be re-specified for the SPA (client-side capability signal) rather than inherited from SSR UA-sniffing.
12. **REQ-DAT-12** — Optional-seam degradation SHALL be representable in JSON: absent/degraded fields as `null`/omitted with an explicit degraded signal, matching today's `.catch(() => undefined)` posture plus the `degraded` telemetry channel.
13. **REQ-DAT-13** — `checkSession`, `getRunEvents` (SSE-replay parse), `streamRunEvents`, and `presignImportUpload` SHALL become first-class typed contract members (they currently bypass `ApiClient` as raw fetches in `apiDataSource`).
14. **REQ-DAT-14** — Polling self-refresh semantics SHALL be specified as data (e.g. `{pending:true, quarantineKey, pollAfterSeconds}` for import preview; the 30 s `open` window for `/billing/return`) rather than `<meta refresh>` markup.
