# 22_spa-bff-api-shape — The BFF API shape: JSON contracts between the SPA and the existing web edge

**Stream:** B
**Researched:** 2026-10-07
**Author:** explore-subagent (B3 BFF worker)
**Ledger rows covered:** B3
**Confidence overall:** high

## Findings

### F1 — `apps/web` is already a BFF; this migration extracts wire contracts, not a new architecture

**Claim:** Every authenticated read and write in the product already flows through the web server's `DataSource` seam (~120 typed methods) into `@rhema/api-client`, so the SPA work is defining JSON responses for documents that today render HTML — not introducing a new service or trust boundary.
**Status:** VERIFIED
**Evidence:** `apps/web/src/data.ts` — the `DataSource` interface (`data.ts:740-829` shows the usage/theme/home/run/chat seam block; `:361,365` inbox seams; `:957` `confirmEmailChange`), `apiDataSource` wiring each seam to `createApiClient` (`:1048-1101,1187-1188,1535`), and the SEC.2/`stampInternal` comment (`:1043-1047`). `packages/api-client/src/index.ts` — `ApiClient` interface (`:2705-2720,2927,3014,3166`) + DTOs (`InboxItemDto` `:540-568`, `GateCardDto` `:589-593`, `PresignedImportDto` `:2074-2081`).
**Retrieved:** 2026-10-07T22:15:00Z
**Implication for the spec:** B3 endpoints are thin adapters over existing seams; no seam needs re-specifying. The API's DTOs are the payload vocabulary — BFF responses embed api-client DTOs verbatim wherever one exists.
**Outline delta:** CONFIRMS brief §"The BFF boundary" — the boundary is intra-process (`server.ts` handlers → `DataSource` → api); the SPA moves the browser's half onto typed JSON.

### F2 — The dual-mode JSON precedent already exists: `wantsJson` + `chatFail`/`chatReply` + the `/doc` twin

**Claim:** The codebase already runs three JSON shapes in production: (a) `wantsJson(c)` content-negotiation (`content-type` OR `accept` containing `application/json`) on the chat mutations (`chatReply` returns the DTO to JSON callers, 302s form posts), (b) a dedicated JSON twin path (`GET /p/:project/edit/:draftId/doc` returns `EditorDocDto` verbatim), and (c) JSON-only transports (`/p/:project/palette-search`, `/pricing/rates`, SSE, beacons).
**Status:** VERIFIED
**Evidence:** `server.ts:636-638` (`wantsJson`), `:645-647` (`chatReply`), `:700-702` (`chatFail` → `c.json({error:res.code}, res.status)`), `:4951-4963` (`/doc` JSON twin — `401 {"error":"unauthenticated"}`/`404 {"error":"not_found"}`/200 DTO), `:567` (`palette-search`), `:3082` (`/pricing/rates`), `:1135-1155` (`/p/:project/outline` POST dual-mode — `422 {"error":"save_failed"}` for JSON vs `?saved=1` redirect for forms at `:1151-1153`).
**Retrieved:** 2026-10-07T22:15:00Z
**Implication for the spec:** The established rule is: *documents get a second path; actions get a second response shape.* B3 generalizes exactly that — `/bff/*` mirrors for extracted reads, `wantsJson` branches on existing POST paths. No `?format=json` query-param convention exists or should be introduced.
**Outline delta:** EXTENDS the `/doc` twin + chat dual-mode precedents into the global convention.

### F3 — The extraction set is ~45 authenticated document GETs; ~90 registrations are transports/mutations that never become routes

**Claim:** The route surface partitions into ~10 public SSR documents, ~45 auth'd document GETs (the SPA tree), and ~90 non-document registrations (mutation POSTs, JSON/SSE/binary/beacon transports) — only the middle class needs read endpoints.
**Status:** VERIFIED
**Evidence:** `docs/design/25_spa-navigation-ia.md` F1 (the three-class partition + normative route tree at `:105-154`; the "not in the tree" transport list at `:166`); `server.ts` registration inventory — GETs `:1575,1616,1722,1740,1852,2035,2152,2329,2394-2947,3082,3093,3180,3392,3620,3673,3741,4134,4255,4288,4627,4646,4712,4848,4897,4935,4952,5056,5179,5189,5273` + POSTs `:704-926,973,1135-1254,1390-1488,1842,1961,2056,2200,2264-2390,2429-2781,2804-2854,3050,3117-3151,3371-3607,3635,3708,3849,4100,4376-4458,4513-4593,4669,4824,4877,4968-5033,5080-5119,5197-5630`.
**Retrieved:** 2026-10-07T22:15:00Z
**Implication for the spec:** The §2 table below is the normative read contract; everything else in the tree keeps today's transport.
**Outline delta:** CONFIRMS REQ-NAV-1; EXTENDS with the per-surface endpoint assignment.

### F4 — Slug→ID resolution is repeated at three layers per request today

**Claim:** API routes take project IDs while URLs carry slugs; the web resolves slug→row by `listProjects(session).find(r.slug === slug)` — once in the route handler (`projectRowFor`, `chatProject`, `editorTarget`), then AGAIN inside the data source for slug-keyed seams (`getDossier` re-lists at `data.ts:1104-1108`; `projectIdFor` re-lists at `:1070-1074`), so a composite document can issue 2–4 identical `GET /projects` calls.
**Status:** VERIFIED
**Evidence:** `server.ts:2260-2262` (`projectRowFor` helper + its comment), `:4139` (dossier handler re-finds), `server.ts:639-644` (`chatProject`), `:4304` (SSE route re-finds), `:4955` (`editorTarget`), `:3184-3185` (project home); `data.ts:1070-1074,1104-1108` (in-source re-resolution); `data.ts:785` (`getTimeline` takes `projectSlug`).
**Retrieved:** 2026-10-07T22:15:00Z
**Implication for the spec:** Each BFF request resolves slug→row ONCE (request-scoped memoized `listProjects` + find), stashes `{slug,row}` in context, and every downstream seam consumes `row.id`. `listProjects` is already tenant-scoped — the memo is authorization-safe. No cross-request slug cache (see §8).
**Outline delta:** CORRECTS a latent N×list amplification; EXTENDS into a hard per-request rule.

### F5 — The error contract is `{error: code}` + preserved upstream status; `chatFail` is the model

**Claim:** `ApiError` carries `{status, url, code?}` (the `json()` helper lifts the api body's `{error}` into `.code`); the web's refusal path passes the upstream status through verbatim and emits `{error: code}` — a 402 stays `insufficient_balance` at 402, a 409 stays `run_in_progress`.
**Status:** VERIFIED
**Evidence:** `packages/api-client/src/index.ts:2592-2605` (`ApiError` shape per prior reading; `json` helper extracts `{error}` → `.code`); `server.ts:649-702` (`chatCall` maps `ApiError` → `{status, code}`: `e.status>=500 → 502/chat_upstream_error`, else `e.status`/`e.code ?? "chat_refused"`; `chatFail` = `c.json({error:res.code}, res.status)`), `:5001` (`/save` passes `ApiError` status through), `:4329` (SSE `{error:"upstream_unavailable"}` at 404 or 502).
**Retrieved:** 2026-10-07T22:15:00Z
**Implication for the spec:** The canonical BFF error envelope is `{ "error": "<stable_code>", "detail"?: "<safe text>" }` at the upstream's status — `chatFail` extended with an optional `detail`, never a different status. Stable codes (`unauthenticated`, `rate_limited`, `invite_required`, `run_in_progress`, `conversion_pending`, `figure_not_ready`, `outline_cited`, `frozen`, `trial_*`, `email_unverified`, `account_suspended`, `refund_*`, `invalid_disposition`, `invalid_reason_code`, `invalid_overrides`, `suggestion_too_large`, `chat_*`) pass through unrenamed. 422 validation bodies pass through verbatim (the outline POST already returns `422 {error:"save_failed"}` to JSON callers — `:1151`).
**Outline delta:** CONFIRMS the api's code contract; EXTENDS `chatFail` to the `{error, detail?}` envelope shape without touching status/code semantics.

### F6 — The flash-param grammar is ~60 keys of test-pinned, user-visible URL state

**Claim:** One-shot mutation outcomes ride query keys (`disposed`, `bulkdone`, `applied`, `promoted`, `obligated`, `ferr`, `fmsg`, `derror`, `restored`, `noted`, `created`, `cn`, `cu`, `cancelled`, `corrected`, `reconstruct`, `build_failed`, `approvals`, `saved`, `notice`, `error`, `obligation`, `voice_locked`, `commented`, `added` …) that journeys assert via `waitForURL(/disposed=|bulkdone=|applied=|notice=imported|notice=deduped/)`.
**Status:** VERIFIED
**Evidence:** `docs/design/25_spa-navigation-ia.md` F3 (the ~60-key inventory + test-pinning evidence: `stb5a.ts:958,1057-1059,1277-1301`, `steps.ts:288-293`); `server.ts:2241-2254` (`/app/new/create` → `?created=&cn=&cu=&hc=` redirect construction), `:4157-4193` (dossier reads `disposed/bulk/bsec/bulkdone/applied/promoted/obligated/ferr/fmsg/triage`).
**Retrieved:** 2026-10-07T22:15:00Z
**Implication for the spec:** The mutation envelope (§3) carries the server-built redirect INCLUDING its flash params — the server keeps assembling the same `?key=value` vocabulary it would 302 to, so the keys stay deep-linkable URL state and journey asserts hold (REQ-NAV-3).
**Outline delta:** CONFIRMS REQ-INV-3/REQ-NAV-3; EXTENDS with the structured-envelope mapping.

### F7 — For JS-initiated navigation, the server-side redirect validators are the ONLY enforcement layer

**Claim:** `form-action` covers form submissions only; SPA `location.assign` hand-offs have no CSP coverage (`navigate-to` never shipped), so `oauthRedirectTarget`/`stripeRedirectTarget` become the sole control — REQ-SAFE-6 pins it: SPA code never `location.assign`s an external URL except through BFF-validated endpoints.
**Status:** VERIFIED
**Evidence:** `docs/design/28_spa-safety-gates.md` F5 + REQ-SAFE-6 (`form-action` loses its job; validators become the only enforcement; pin by test); `server.ts:195-260` (`oauthRedirectTarget` permits relative URLs + Google-OAuth absolutes only; `stripeRedirectTarget` permits Stripe-hosted absolutes only — both log+refuse others), `:2976-2998,3050-3063` (checkout/topup/portal mint→validate→302 flow), `:4121-4125` (`paymentLinkWithReference` + validation).
**Retrieved:** 2026-10-07T22:15:00Z
**Implication for the spec:** A mutation that hands off externally returns `{url}` where `url` has ALREADY passed the allowlist server-side (a refusal returns the error envelope, never an unvalidated URL); the client `location.assign(url)`s. The validators must be exercised on the JSON path by test.
**Outline delta:** CONFIRMS REQ-SAFE-6; EXTENDS with the `{url}` envelope field semantics.

### F8 — The SSE route is a pass-through proxy with resumable replay; its semantics port verbatim

**Claim:** `GET /p/:project/r/:runId/events` resolves the slug, forwards `?after` + the `Last-Event-ID` header to `streamRunEvents`, pipes the upstream body through with `text/event-stream` + `no-cache, no-transform` + `x-accel-buffering: no`, preserves upstream status (404→404, resolved non-ok→that status, unreachable→502), and emits the OBS.1 structured line on each failure class.
**Status:** VERIFIED
**Evidence:** `server.ts:4299-4350` (the whole route); `data.ts:804-810` (`getRunEvents`/`streamRunEvents` seams + `?poll=1` replay), `:1017-1040` (`FeedEventRow` + `parseSseReplay`); consumption: `server.ts:3263-3272` (initial `feedRowsFor` rows + `lastSeq`), `ide-shell.tsx:312-329` (`data-feed-run`/`data-feed-events`/`data-feed-labels`/`data-feed-last-seq` + `aria-live` panel).
**Retrieved:** 2026-10-07T22:15:00Z
**Implication for the spec:** The SPA keeps `EventSource` on this same URL — same-origin, cookie-authed, `?after=<lastSeq>`/`Last-Event-ID` resume. It is a layout-owned subscription (one per `p.$project` branch, REQ-NAV-6), NOT a Query; Query only stores the lastSeq checkpoint. Slug resolution happens before stream creation (§8).
**Outline delta:** CONFIRMS REQ-ISL-14; EXTENDS with the Query/subscription boundary.

### F9 — Beacons are lossy 204 endpoints; acquisition events ride `/a/acq`

**Claim:** `/a/dwell` (authed `{surface, ms}`), `/a/landing` (public `landing.viewed|dropzone_used` + hold token), and `/a/acq` (authed arbitrary acquisition event forward to `postAcquisitionEvent`, quiet 204 without session) are all fire-and-forget 204s — `/a/acq` already accepts `email.verified`-class events.
**Status:** VERIFIED
**Evidence:** `server.ts:3117-3176` (all three handlers; `/a/acq` comment at `:3148-3150` names the email.verified case; `postAcquisitionEvent` forward `:3162-3171`).
**Retrieved:** 2026-10-07T22:15:00Z
**Implication for the spec:** The SPA keeps the same three endpoints via `sendBeacon`/keepalive fetch — never blocking navigation, never surfaced as errors. The `?verified=1` mint additionally has a JSON fallback (§7) but `/a/acq` is the client-side channel for it.
**Outline delta:** CONFIRMS the beacon transport class; EXTENDS — `email.verified` maps to `/a/acq` in SPA mode.

### F10 — Uploads currently transit the web server; direct browser PUT is a deliberate change with two prerequisites

**Claim:** Today the browser multipart-POSTs bytes to web (`parseImportInput`), and the WEB presigns + PUTs to GCS (`uploadKey`: `presignImportUpload` → `PUT pre.url` with `requiredHeaders`, `data.ts:1079-1094`). Moving the PUT to the browser is a new transport requiring (a) `connect-src` to admit the GCS origin (today it's `'self'` + collab WSS only — REQ-SAFE-6) and (b) bucket CORS allowing cross-origin PUT from the app origin.
**Status:** VERIFIED (repo facts); the CORS/bucket-config half is an infra prerequisite, not yet code-verified.
**Evidence:** `data.ts:1075-1094` (`uploadKey` — "the session cookie rides ONLY the api calls"), `:277-279,591` (presign→PUT→key seam comments), `server.ts:3639-3656` (`previewImport` consumes the parsed upload), `packages/api-client/src/index.ts:2074-2081` (`PresignedImportDto {url, key, maxBytes, requiredHeaders}`), `:2083-2087` (`ImportRequestDto {quarantineKey, waitMs?}`).
**Retrieved:** 2026-10-07T22:15:00Z
**Implication for the spec:** The SPA spec adopts presign→direct-PUT→`{quarantineKey}` (bytes never enter BFF memory); the SSR form path keeps byte-transit (no-JS floor + CSP unchanged there). The CSP amendment is scoped to the SPA and is an explicit cross-note dependency on REQ-SAFE-6's connect-src clause (open Q4).
**Outline delta:** EXTENDS the upload contract; FLAGS a CSP/infra dependency.

### F11 — Binary outputs are document navigations; the envelope never carries bytes

**Claim:** `/usage.csv`, `GET /p/:project/export/ai-use/:fmt`, `GET /app/settings/data/export/download` (302→presigned), and `POST /p/:project/export` (binary `content-disposition` Response) are all navigations — none is a JSON fetch.
**Status:** VERIFIED
**Evidence:** `server.ts:2889-2903` (`/usage.csv` authed `content-disposition: attachment`), `:5056-5151` (export GET dialog / POST binary / ai-use downloads), `:2725-2734` (account-export presigned 302); `docs/design/25_spa-navigation-ia.md` F10 + REQ-NAV-9 (downloads = document navs); `data.ts:740` (`downloadUsageCsv` seam).
**Retrieved:** 2026-10-07T22:15:00Z
**Implication for the spec:** §5 pins the rule: binary stays navigation (native `<a href>`/form POST/`location.assign`); JSON callers get the export *metadata* (`ExportDialogDto`) or a validated `url`, never bytes.
**Outline delta:** CONFIRMS REQ-NAV-9/F10's categorical rule.

### F12 — `/session`, the boot embed, and the server-side precedence chain

**Claim:** The api serves `GET /session` → `{userId, workspaceId, billingAccountId, isTest}` (`apps/api/src/index.ts:382-392`); the web needs a same-origin twin. On the document path, `/app` runs `?verified=1` mint (`:1857-1865`) then showcase/held-file precedence (`:1898-1927`), and `/p/:project` runs the unread-`run_finished` handoff (`:3192-3207`) — all before render, so all must run before the SPA-shell branch too.
**Status:** VERIFIED
**Evidence:** `apps/api/src/index.ts:382-392`; `data.ts:745` (`getSessionPrincipal`), `:1096-1098` (`checkSession` fetches `${baseUrl}/session`); `server.ts:1855-1927` (verified mint + precedence 302s), `:3192-3207` (handoff: find unread `run_finished` → `markInboxItemRead` → `c.redirect(finishedRow.href)`; suppressed by `?focus=1`); `docs/design/25_spa-navigation-ia.md` F5 + REQ-NAV-5.
**Retrieved:** 2026-10-07T22:15:00Z
**Implication for the spec:** §6 fixes the boot contract (`GET /session` + `data-spa-boot` embed) and §6.3 the pre-shell precedence order. Boot data seeds the shell — it is not an authorization grant (first BFF 401 → `/login` document nav).
**Outline delta:** EXTENDS REQ-NAV-5 into an ordered pre-shell pipeline; ANSWERS C2's open Q1/Q2 with concrete endpoints (§7).

### F13 — `RunSheetView` is already a JSON-shaped, data-only BFF payload — including the recompute matrix + minted idempotency key

**Claim:** `buildRunSheetView` composes `surfaceEstimate` + the lever matrix into a view object that is pure data (numbers, canonical-vocab display strings, `recompute.cells` keyed `rigor|tier|toggles` → `{e,c,lo,hi}`, `idempotencyKey`, `entitlementId`, `paymentLinkUrl`, flags) — the inline `var R={…}` script is just `JSON.stringify(view.recompute)` + trivial DOM repaint.
**Status:** VERIFIED
**Evidence:** `packages/run-sheet/src/view.ts:152-264` (`RunSheetView` — all JSON types; display strings pre-rendered server-side: `modelTierDisplay`, `whyLine`, `scopeApprovalLine`, `scopeLine`, `entitlementLine`, `promoteLine`), `:268-279` (`RecomputePayload`), `:410` (`buildRunSheetView` calls `surfaceEstimate` at `:417`), `:653` (`recompute` field assembly); `packages/ui/src/run-sheet.tsx:659-693` (`recomputeScript` — the `var R=` payload is `view.recompute`; repaint is key-lookup + `$0.01`/credit formatting, never the estimator); `lever-matrix.ts:44-45,122-124` (full lever cross-product precomputed).
**Retrieved:** 2026-10-07T22:15:00Z
**Implication for the spec:** Ship the server-built view object as the run-sheet aggregate's `sheet` field — the browser repaints levers by `recompute.cells` lookup in React state (identical semantics to the inline script, now declarative). `surfaceEstimate`/`buildLeverMatrix` never enter the bundle (estimator constants are server IP). A typed estimate endpoint still exists for revalidation (§7.3).
**Outline delta:** ANSWERS the aggregate-vs-fan-out question for the run sheet (aggregate, view-as-DTO); CONFIRMS REQ-VFY-4's "typed estimate DTO" re-spec path.

### F14 — Render-time derivations split three ways: client-portable pure maps, server-owned copy maps, and DOM-free doc conversion

**Claim:** `state-map.ts` (ProjectRow→ProjectRowView, groupings) is pure `COPY`+DTO mapping — portable to the bundle verbatim. `feedLabelMaps`/`feedRowsFor` are server-controlled label templates today serialized into `data-feed-labels` — the maps ride a payload field (server-owned; copy changes ship server-side). `markdownToDoc` lives in DOM-free `@rhema/editor` — the client derives PM JSON from `EditorDocDto.markdown`. `surfaceEstimate`/`buildRunSheetView` stay server-side.
**Status:** VERIFIED
**Evidence:** `state-map.ts:107-149` (`toProjectRowView` — facts→view, COPY labels + hrefs + formAction strings), `:184-253` (`groupByAttention`/`groupByVoice`); `feed-labels.ts:40,49` (`feedLabelMapsJson`, `feedRowsFor`), `pages.tsx:227` (`labelMaps: feedLabelMapsJson()` emitted onto `data-feed-labels`), `ide-shell.tsx:318-319`; `page-data.ts:623-638` (`loadEditorPage`/`docJsonFor` = `markdownToDoc(doc.markdown).toJSON()`); `packages/editor/src/index.ts:3` + `md-to-pm.ts:193` (`markdownToDoc` export — used in non-DOM tests, `ydoc.ts:11,24`); `docs/design/23_spa-editor-collab-binding.md` parity row 1 (`:197` — "docJson derived client-side via `markdownToDoc`") + `:237` (typed bootstrap DTO replacing `script[data-page-doc]`).
**Retrieved:** 2026-10-07T22:15:00Z
**Implication for the spec:** §2's "derivation" column: aggregates return RAW DTOs (`ProjectRow[]`, `FeedEventRow[]`, `EditorDocDto`) plus the feed-label map; `toProjectRowView`/groupings/feed-row-formatting/`markdownToDoc` port client-side (all pure, COPY/labels-dependent — REQ-SAFE-4 already assumes COPY ships in the bundle); `buildRunSheetView` stays server-built.
**Outline delta:** ANSWERS the four named derivations' placement; EXTENDS REQ-SAFE-4 (COPY in bundle makes client derivation lawful).

### F15 — Request-id + one-structured-line telemetry is middleware-level and survives the SPA unchanged

**Claim:** `requestContext` middleware mints (never trusts inbound) the request id, echoes it on EVERY response as `x-rhema-request-id`, stamps it onto forwarded session headers (`withRequestId`), emits ONE structured `routeErrorLine` (route template, status, upstream status/code, errorClass, severity, requestId) per failure, counts degraded best-effort reads into one WARNING `degraded_reads` line, and `webOnError` answers 500 with `internal error — reference <id>` and nothing else.
**Status:** VERIFIED
**Evidence:** `apps/web/src/observability.ts:71-106` (`requestContext` — inbound `x-rhema-request-id` deliberately not read, `:74-76`; echo `:82`; fallback 5xx sweep `:88-89`; degraded sweep `:90-99`), `:112-115` (`withRequestId`), `:121-151` (`logWebRouteError` — `routePath` template, never `c.req.path`, `:134`), `:158-172` (`webOnError`); `packages/contracts/src/observability.ts:16-18` (header constants).
**Retrieved:** 2026-10-07T22:15:00Z
**Implication for the spec:** The SPA error contract: a single `bffFetch` transport reads `x-rhema-request-id` off every non-2xx response and surfaces "reference <id>" in error UI; the browser NEVER sends the header. Aggregate endpoints keep the `.catch(()=>null)` + `noteDegradedUpstream` pattern per seam — same one-line semantics.
**Outline delta:** CONFIRMS ADR-053 unchanged; EXTENDS with the client-side request-id surface rule.

### F16 — Two one-shot server-side effects need explicit JSON contracts: `?confirmEmail` and the unread handoff

**Claim:** `?confirmEmail=<token>` is consumed inside `GET /app/settings/account` before render (confirm → `?notice=email-confirmed|email-confirm-failed` bounce), and the `/p/:project` unread-`run_finished` handoff marks the item read then redirects — both are side-effects on document GETs that a client-side nav would skip.
**Status:** VERIFIED
**Evidence:** `server.ts:2407-2416` (confirmEmail → `confirmEmailChange` → notice redirect), `data.ts:957` (`confirmEmailChange` → `{ok:true,email}|{error}`), `api-client:3964-3969` (`POST /settings/account/email/confirm {token}`); `server.ts:3192-3207` (handoff + `?focus=1` suppression + idempotent mark); `InboxItemDto` shape (`api-client:540-568`: `kind:"event"`, `type:"run_finished"`, `unread`, `href`, `projectId`); `docs/design/25_spa-navigation-ia.md` open Q1/Q2.
**Retrieved:** 2026-10-07T22:15:00Z
**Implication for the spec:** §7 fixes `POST /bff/settings/account/confirm-email` (uniform envelope, notice-as-redirect) and `POST /bff/p/:slug/handoff` (POST not GET — the mark-read side effect must never ride a prefetchable/cached read). Document-load semantics stay server-side per F12.
**Outline delta:** ANSWERS C2 open Q1 + Q2 — B3 owns both endpoints.

## Design

### 1. Endpoint convention — one rule, named exceptions

**Rule:** three classes, three conventions —

| Class | Convention |
|---|---|
| **Extracted document reads** (the ~45 auth'd GETs) | `GET /bff/<surface-path>` — a JSON twin mirroring the document path (`/bff/p/:slug`, `/bff/app/inbox`, `/bff/settings/account`, …). The document path keeps serving SSR HTML forever (rollback + no-JS floor + phone/showcase posture). This generalizes the `/edit/:draftId/doc` twin precedent (F2). |
| **Mutations** (every existing POST) | Keep the existing path; the handler gains a JSON branch keyed on `wantsJson(c)` (`content-type` or `accept` containing `application/json` — F2's helper verbatim). Form posts keep 302+flash; JSON callers get the §3 envelope. Bodies: the SPA sends the **structured** equivalent — e.g. `GateStructuredEdits` directly instead of flat `ed.*` fields (`gate-edits.ts:74-85` — `decodeGateEditFields` remains the form-only translator). |
| **Existing non-document transports** | Unchanged paths, unchanged shapes: `GET /p/:project/palette-search`, `GET /pricing/rates`, `POST /ide/theme`, `POST /p/:project/paper-theme`, `POST /settings/theme`, all `/p/:project/chat/*`, `GET|POST /p/:project/outline` (already dual-mode), `/p/:project/edit/:draftId/{doc,save,note,cancel-run,revise}`, `GET /p/:project/r/:runId/events` (SSE), `POST /a/{dwell,landing,acq}`, binary downloads, `/api/auth/*` proxy, `/healthz`, `/logout` (native form POST — never a fetch), redirect-only document paths (`/p/:project/edit/:draftId`, `/p/:project/f/:fid`, `/app/usage/r/:runId`, `/settings`, `/app/settings`). |

**Exceptions to `/bff/*` naming:**
- `GET /session` — at `/session`, not `/bff/session`: the boundary note's contract names it and it is infra-shaped, not a document mirror (§6).
- `POST /bff/import/presign` — a NEW transport (no document twin); the `/bff` prefix marks it as SPA-era.
- `POST /bff/p/:slug/handoff` and `POST /bff/settings/account/confirm-email` — new endpoints with no form ancestor (§7).

**Why `/bff/*` over `Accept`-negotiation on document paths:** content-negotiation would put three response classes (SSR HTML, JSON, redirect) behind one handler on every document route, doubling each handler's tested surface and entangling the per-surface flag with a format dimension. A separate namespace keeps the SSR handler byte-identical for rollback, gives each endpoint an independent contract test, and makes the flag matrix two-way (shell vs document) instead of three-way.

### 2. Read endpoints — the per-surface table

**Aggregation policy (normative):** (a) a surface that today composes ≥3 reads inside one handler gets ONE aggregate endpoint — the composite IS the surface's contract and the SPA must not waterfall it; (b) a single-read surface gets a typed fan-out endpoint; (c) every best-effort seam keeps its degrade contract — the field is `null`/omitted in the payload AND `noteDegradedUpstream` still counts the swallow (F15); (d) aggregates return RAW api-client DTOs — the client runs the ported derivations (F14); (e) browser Query keys carry the SLUG (`["bff","p",slug,…]`), the server resolves to id (§8); (f) every IDE-shell-bearing aggregate embeds the `ide` block (pane config, chat availability, `feed` incl. `labelMaps` when a live run exists, `badge`) — the JSON equivalent of `ideContext()`'s `data-*` emission.

| SPA route (tree id per note 25) | Endpoint | Shape | Seams composed | Derivations |
|---|---|---|---|---|
| `app.index` `/app` | `GET /bff/app` | aggregate | `listProjects`, `listVoices`, `getProjectGrouping`, `getBillingBalance`, `searchProjects(?q)`, `listProtocolCards`, `listDeletedProjects(?deleted=1)` | client: `toProjectRowView`/`groupByAttention`/`groupByVoice` + filters/sort. `?verified=1` mint + showcase precedence stay server-side (§6.3) |
| `app.new` `/app/new` | `GET /bff/app/new` | aggregate | `listProtocolCards`, `listVoices`, entry/picks defaults, held-intent state | client: entry-form state |
| `app.newPreview` `/app/new/preview` | `GET /bff/app/new/preview?qk=&src=` | typed | `previewWorkspaceImport` → `{status:"pending",quarantineKey}\|{status:"ready",preview,quarantineKey}` | `{pending}` → `refetchInterval` (IMPORT_PREVIEW_POLL_SECONDS); `qk` absent → `redirect(/app/new)` |
| `app.inbox` `/app/inbox` | `GET /bff/app/inbox` | aggregate | `getInbox` (`InboxItemDto[]`), `getInboxBadge`; gate-card joins ride the items' `gate`/`decision` fields (`api-client:554-567`) | client renders rows |
| `app.usageRun` `/app/usage/r/:runId` | none — document nav (server 302 canonical) | — | — | per note 25 F7 |
| `usage` `/usage` | `GET /bff/usage` | aggregate | `getUsage`/`UsageDto`, `UsageAccountDto` | client renders |
| `billingReturn` `/billing/return` | `GET /bff/billing/return?session_id=&cancelled=` | typed | `CheckoutStatusDto` + balance | `open` ⇒ `refetchInterval: 5000` inside the ≤30 s window (REQ-BILL-14 parity) |
| `settings.account` | `GET /bff/settings/account` | typed | `getAccountSettings` → `AccountSettingsDto` | `?confirmEmail` consumed via §7.1 before read |
| `settings.preferences` | `GET /bff/settings/preferences` | typed | `getPreferencesSettings` | — |
| `settings.notifications` | `GET /bff/settings/notifications` | typed | `NotificationPrefsDto` seam | — |
| `settings.integrations` | `GET /bff/settings/integrations` | typed | `IntegrationsSettingsDto` seam | — |
| `settings.data` | `GET /bff/settings/data` | typed | `getDataSettings`/`DataSettingsDto` | download links are navigations |
| `settings.billing` (+ `/settings/billing` alias) | `GET /bff/settings/billing` | aggregate | `BillingPlansDto`, `BillingSubscriptionDto`, `getBillingBalance`, payment-link/`purchase` state | `paymentLinkUrl` values pass `stripeRedirectTarget` before serialization |
| `voices` `/voices` | `GET /bff/voices` | typed | `listVoices` → `VoiceListDto` | — |
| `voicesNew` `/voices/new` | `GET /bff/voices/new` | typed | creation-form options seam | — |
| `voiceDetail` `/v/:persona` | `GET /bff/voices/:persona` | aggregate | `VoiceDetailDto`, samples, `VoiceConnectionsDto`, `VoiceEstimateDto`/`VoiceUpdatePlanDto` | `?tab`/`?sample` are search state |
| `p.index` `/p/:slug` | `GET /bff/p/:slug` | **aggregate** (the largest) | `listProjects`→row, `listGates`, `listDecisions`, `getApprovalOverrides`, `getApprovalSettings`, `getExplainers`, `getProjectVoice`+`listVoices`, `getInboxBadge`, `getTimeline`, `getRunEvents`+`lastSeq` when `row.activeRun`, `loadEditorPage` when `row.headDraftId` | `feed` field = `{runId, eventsUrl, density, events: FeedEventRow[], lastSeq, labelMaps}`; `page` field = §7 bootstrap subset incl. server-decided `readOnly`/`collabWsUrl` (phone/showcase withhold stays server-computed); unread handoff is §7.2 |
| `p.import` `/p/:slug/import` | `GET /bff/p/:slug/import` | aggregate | project facts + `ide` block + import-form context | — |
| `p.importPreview` | `GET /bff/p/:slug/import/preview?qk=&src=` | typed | `previewImport` → pending\|ready (same DTO as `app.newPreview`) | `{pending}` → `refetchInterval`; `qk` absent → `redirect(../import)` |
| `p.run` `/p/:slug/run` | `GET /bff/p/:slug/run?workflow=&scope=&words=&rigor=&modelTier=&toggle.*=&draftId=&corrKind=` | **aggregate** | `RunSheetContextDto`, `getBillingBalance`, `getProjectVoice` + chained `VoiceEstimateDto`, pretriage when revising, `sheet: RunSheetView` (server-built via `buildRunSheetView` — F13) | `sheet` ships verbatim incl. `recompute` + `idempotencyKey` + `entitlementId`; client repaints levers by `cells` lookup — never calls the estimator |
| `p.review` `/p/:slug/review/:runId` | `GET /bff/p/:slug/review/:runId?sev=&kind=&disp=&sec=&url=&sug=&obl=&triage=&bulk=&bsec=` | **aggregate** | `getDossier` (404→not-found), `markInboxRunRead` (kept: idempotent seen-mark on read, `:4150-4152`), `getTimeline`, `listGates`, `previewBulkFindings` when `?bulk` | client: `filterFindings`/`applySeverityBudget` parity port or server-filtered rows (open Q8); `run.report_viewed`/`finding.viewed`/`secondread.opened` emits ride the aggregate (server-side, same as today) |
| `p.report` `/p/:slug/r/:runId` | `GET /bff/p/:slug/r/:runId?advanced=` | aggregate | `getRunReport`, `getTimeline`, usage-advanced read | — |
| `p.revision` `/p/:slug/revisions/:cid` | `GET /bff/p/:slug/revisions/:cid` | typed | `WhatChangedDto` | — |
| `p.page` `/p/:slug/v/:v` | `GET /bff/p/:slug/v/:v` | aggregate = Page bootstrap + version context | resolved draft (`resolveEditorDraft`; `working`→head; numeric→that version; miss-on-`working`→`redirect(/p/:slug)`), `doc: EditorDocDto` (`{exact}` semantics per note 23), provenance/findings/restore rail, lock state | §7.4 bootstrap fields: `{resolved:{draftId,draftN,state,origin,baseDraftN}, doc, collabWsUrl\|null, readOnly, focusFindingId?}` |
| `p.diff` `/p/:slug/v/:n/diff/:m` | `GET /bff/p/:slug/v/:n/diff/:m` | typed | `VersionDiffDto` + `VersionRailDto` | — |
| `p.artifact` `/p/:slug/a/:artifactId` | `GET /bff/p/:slug/a/:artifactId` | aggregate | artifact read + Page bootstrap (read-only mount) | same bootstrap subset as `p.page` with `readOnly:true` |
| `p.editRedirect` `/p/:slug/edit/:draftId` | none — BFF-canonical 302; client-side resolution via existing `GET /p/:project/edit/:draftId/doc` (`draftN` → `throw redirect`) | — | — | per note 25 F7 |
| `p.findingRedirect` `/p/:slug/f/:fid` | none today — server 302 canonical; a JSON `resolveFinding` endpoint is a follow-up (open Q7) | — | — | — |
| `p.export` `/p/:slug/export` | `GET /bff/p/:slug/export` | typed | `ExportDialogDto` | POST stays a document nav (binary) |
| `p.outline` `/p/:slug/outline` | `GET /bff/p/:slug/outline` | aggregate | outline read + `GateOutlineView` + `?slug` context | — |
| `p.outlinePromote` | `GET /bff/p/:slug/outline/promote?scope=&threadId=&turnId=` | typed | `OutlinePromotionDto` | — |
| `p.figures` `/p/:slug/figures` | `GET /bff/p/:slug/figures` | typed | `FigureListItemDto[]` | — |
| `p.figureCard` | `GET /bff/p/:slug/figures/:figureId` | typed | `FigureCardDto` | — |
| `p.visualize` `/p/:slug/visualize` | `GET /bff/p/:slug/visualize` | typed | visualize read seam | — |
| `p.obligationNew` | `GET /bff/p/:slug/obligations/new` | typed | obligation-form context | `?back` keeps `safeBack` `/p/…` confinement (`server.ts:5682-5685`) |
| `p.settings` `/p/:slug/settings` | `GET /bff/p/:slug/settings` | aggregate | `ProjectSettingsDto` + `getApprovalSettings` + `getApprovalOverrides` | — |
| `p.projectUsage` `/p/:slug/usage` | `GET /bff/p/:slug/usage` | typed | `UsageProjectDto` | — |
| `p.voiceReseed` `/p/:slug/voice/reseed` | `GET /bff/p/:slug/voice/reseed` | typed | `ReseedPreviewDto` | — |
| Desk chat tab (not a document route) | `GET /bff/p/:slug/chat?thread=` | typed | `getChat` → `ChatPanelDto` | turn poll stays `GET /p/:project/chat/turns/:runId` (existing JSON) |
| Feed labels (shared) | `GET /bff/feed-labels` | typed | `feedLabelMaps()` parsed object (§7.4) | long-`staleTime` key `["feed-labels"]` |

Redirects, `/logout`, binaries, SSE, beacons, auth proxy: no `/bff` twin (§1 table).

### 3. Mutation conventions — POST → JSON envelope

**Request:** the SPA `fetch`es the existing POST path with `content-type: application/json`, `accept: application/json`, `credentials: "same-origin"`, body = structured JSON (`GateStructuredEdits`, `{title}`, `{personaId}`, … — never the `ed.*` flat grammar, which stays the form-only translation layer).

**Success envelope:**

```ts
{
  ok: true,
  redirect?: string,              // full target incl. flash params — client navigate({to}) PUSH
  flash?: Record<string, string>, // structured copy of the flash keys in `redirect` (inline-notice use)
  data?: T,                       // the returned DTO when the action produces one (CreatedProjectDto,
                                  //   ChatTurnCreatedDto, {ok,guidanceId}, UserRefundResponseDto…)
  pending?: { pollAfterSeconds?: number },  // 202-class async: import preview, refund review
  url?: string                    // external hand-off — ALWAYS server-validated (F7); location.assign only
}
```

- `redirect` carries the SAME URL the form path would 302 to — flash keys stay baked in (`/p/slug?disposed=<fid>`), preserving the journey-asserted vocabulary verbatim (F6). `navigate` is a **push** (POST→302 history parity — REQ-NAV-11).
- Mutations with no navigation return `{ok:true, data?}`.
- **Error:** non-2xx → `{ "error": "<stable_code>", "detail"?: "<safe text>" }` at the upstream's preserved status (F5). 422 validation bodies pass through unaltered. The `wantsJson` branch NEVER redirects on error — the client owns rendering.
- **Refusal-as-rerender:** today's bounce-with-inline-error (`?derror=<fid>`, `?applied/?ferr`, outline `422 save_failed`, `voice_locked`) becomes `error`+`detail` (+ optional `flash`/`fields`); the client stays mounted on the owning surface and renders inline — no navigation, no toast substitution.
- **Stale-state writes:** the `steerHandler` contract (400/404/409 → re-render current state, `server.ts:4366-4372`) maps to: client catches those statuses → invalidates the owning Query (`["bff","p",slug]`, `["bff","p",slug,"r",runId]`) → the fresh read is the answer. The mutation response for them is still the error envelope; the client treats them as stale, not failed.
- **Idempotency:** server-minted keys ride mutation bodies (`view.idempotencyKey` on the run POST — `view.ts:245-246`); TanStack Query mutations are not retried; the api's dedupe remains the boundary.
- **Pending vs optimistic classification (normative):**
  - **Pending-only, never optimistic:** run creation (`POST /p/:slug/run`), all billing (`subscribe`, `topup`, `portal`, `checkout`, `payment-link`), `refund`, voice `build`/`update`/`reconstruct` (credit-spending), `import/create`, `/app/new/create`, gate `decide`, findings `apply/promote/obligations/bulk`, run steering (`pause/resume/stop/cancel/note`), `exhausted` ack, outline `promote`, editor `revise`/`cancel-run`. Rule: anything spend-adjacent or workflow-state-changing shows a pending state until the response lands.
  - **Optimistic-eligible** (UI-only, idempotent, cheaply rolled back): `/ide/theme`, `/settings/theme`, `/p/:project/paper-theme`, `/app/grouping`, `explainers/:name/dismiss`, `/app/inbox/read` + `read-all`, notification-preference writes. Roll back on non-2xx.
  - Everything else defaults to pending; optimism requires an explicit per-endpoint spec line.

### 4. Subscriptions & event transports

- **SSE:** `GET /p/:project/r/:runId/events` verbatim — same-origin, cookie-authed, `?after=<lastSeq>` + `Last-Event-ID` forwarded, upstream-status passthrough incl. the 404/502 split and structured lines (F8). Owned by the `p.$project` layout as ONE `EventSource` (REQ-NAV-6); lastSeq checkpoints in the layout store, not Query; `EventSource`'s built-in reconnect+`Last-Event-ID` is the resume mechanism.
- **Collab WSS:** `collabWsUrl` is an EXTERNAL origin — the browser connects directly (cookie-authed upgrade, doc naming + protocol per note 23); the BFF never proxies WS. `connect-src` already names the origin. `collabWsUrl` is delivered inside the Page bootstrap (§7.4) and withheld server-side for phone/showcase/read-only mounts — the SPA cannot enable collab by asking.
- **Beacons:** `/a/dwell`, `/a/landing`, `/a/acq` unchanged — `sendBeacon` or `keepalive` fetch, 204-and-forget, never gate navigation, same allowlisted event/payload filtering (F9). Dwell becomes a React effect (28-F5).
- **Polls (meta-refresh → Query):** import preview (`IMPORT_PREVIEW_POLL_SECONDS`), `/app/new/preview` pending, `/billing/return` (5 s / ≤30 s `open` window), the Page 10 s visible-only `/doc` lock poll (note 23 row 19 — `refetchInterval: 10_000`, `refetchIntervalInBackground: false`). Each pending-capable read returns `{pending, pollAfterSeconds}` so cadence stays server-owned.

### 5. File transports

- **Uploads (SPA):** `POST /bff/import/presign` → `PresignedImportDto {url, key, maxBytes, requiredHeaders}`; the browser `PUT`s bytes DIRECTLY to `url` echoing `requiredHeaders` verbatim (no cookies — the signature carries auth; `data.ts:1076-1077`); then `POST` preview/create with `{quarantineKey}` (`ImportRequestDto`). The BFF NEVER proxies bytes. `maxBytes` is enforced client-side AND by the signature's content-length bound. Pending/replay semantics unchanged (replaying `quarantineKey` re-polls the same conversion).
  - **Prerequisites (flagged):** `connect-src` must add the GCS upload origin for the SPA document (interacts with REQ-SAFE-6's `'self'`-only clause) and the GCS bucket needs a CORS policy allowing `PUT` + the signed headers from the app origin (F10). The SSR form path keeps server-side byte-transit — the no-JS floor and phone posture are unaffected.
- **Downloads:** navigations, never fetches — `/usage.csv`, `GET /p/:project/export/ai-use/:fmt`, `GET /app/settings/data/export/download` (302→presigned), `POST /p/:project/export` (binary `content-disposition` response: keep it a native form POST or a `location.assign`-able GET). `Content-Disposition` is preserved end-to-end; no binary ever enters a JSON envelope or a fetch-and-render path.

### 6. Session & bootstrap

- **`GET /session`** (same-origin, at `/session`): no cookie → `401 {"error":"unauthenticated"}`; session → the api `/session` payload relayed (`{userId, workspaceId, billingAccountId, isTest?}` — `apps/api/src/index.ts:382-392`). This is the session-guard's backing read; a 401 anywhere else maps to the same `location.assign("/login")` document nav.
- **`data-spa-boot`** (`<script type="application/json" data-spa-boot>` on the shell document — the `script[data-page-doc]` embed precedent): `{ principal, theme: { appTheme, paperTheme? }, deviceClass: "phone"|"desktop", surfaces: Record<routeId,"spa"|"ssr">, project?: { slug } }`. The flag map lets the router render `SsrHandoff` on unflipped leaves (note 25). Boot data is a SEED — it seeds Query/theme/routing hints; it never substitutes for per-call authorization.
- **Cookie-expiry posture:** unchanged — the shell may be served on cookie presence; the first BFF 401 invalidates and hard-navs to `/login`.
- **Pre-shell server precedence (order is normative, every flipped document GET):** session check → `?verified=1` mint → `/app` showcase/held-file precedence → `/p/:slug` unread handoff → phone/showcase SSR-document override (flag-independent per note 23 §7) → flag → shell-or-SSR document. Server-owned redirects execute before shell generation; nothing in this chain moves client-side.

### 7. New contracts this note fixes

1. **`?confirmEmail` → `POST /bff/settings/account/confirm-email` `{token}`** → uniform envelope `{ok:true, redirect:"/app/settings/account?notice=email-confirmed"|"email-confirm-failed", data?:{email}}` — both outcomes are 200+redirect (the api's `{error}` arm maps to the failed notice, as today). One-shot and idempotent-replay-safe (api dedupes; a replay lands the failed notice). The token never enters `data-spa-boot`. Client: `settings.account`'s `beforeLoad` fires it when the param is present, then `replace`-navs to `redirect`.
2. **Unread handoff → `POST /bff/p/:slug/handoff`** → `{ok:true, data:{ handoff: { href, inboxItemId } | null }}`. Server: resolve slug→row; find the unread `run_finished` item for `row.id`; `markInboxItemRead` (idempotent — the api's mark tolerates re-marks); return `href`. POST (not GET) so the side effect never rides a prefetched/cached read. `?focus=1` suppresses — the client only calls it when `focus!==1` on a CLIENT-side entry; document loads keep the server-inline check (§6.3).
3. **Run-sheet estimate:** the `p.run` aggregate ships `sheet: RunSheetView` (incl. `recompute`, `idempotencyKey`, `entitlementId`) — lever repaints are client-side `cells` lookups, no network (≤100 ms parity for free). PLUS `POST /bff/p/:slug/estimate` (`EstimateRequestDto` body → `EstimateDto`: `estimateCredits`, `capCredits`, `rateTableVersion`, `provisional`, `claimCount?`, `levers`) for revalidation and out-of-matrix inputs; it gives D1's `waitForResponse(/estimate/)` probe a typed target. The run POST continues to carry estimate/cap/rate-table/idempotency fields — the api recomputes authoritatively; the client never prices.
4. **`data-feed-labels` → typed field + standalone read:** IDE aggregates' `feed`/`ide` block carries `labelMaps` as a parsed object (replacing the serialized attribute); `GET /bff/feed-labels` is the standalone read for remounts (`staleTime` long — copy-only, deploy-versioned). The client formatter (ported from the island's live-row path) keeps fail-closed semantics: an event type without a template drops, never renders raw. Feed rows in payloads are raw `FeedEventRow[]` + `lastSeq`; formatting is client-side.

### 8. Slug→ID resolution — once per request, request-scoped

Every `/bff/p/:slug/*` and every `/p/:slug/*` JSON branch resolves `{slug → row}` exactly once via a request-scoped memoized `listProjects` + find, stashed on the context (`c.get`/`c.set`) before the handler body; all downstream seams consume `row.id` — including the seams that today re-list internally (`getDossier`, `getTimeline`, `projectIdFor`); give them an id-taking overload or resolve once inside the request's memo. No cross-request slug→id cache: `listProjects` is session-scoped so the memo is authorization-safe per request; anything longer-lived would need session-keyed invalidation for zero benefit (the list call is cheap and shares the request). Browser Query keys stay slug-keyed (`["bff","p",slug,…]`) — slug is stable across renames (`server.ts:2258-2259` comment: "Slugs never change on rename"); project mutations (`rename`, `duplicate`, `archive`, `delete`, `restore`, `voice`, `approval-overrides`, `settings/approvals`, `guidance*`, `explainers`) invalidate `["bff","p",slug]` plus the list key `["bff","app"]`; idempotency of mutations rides api keys, never the resolution memo.

### 9. Errors & telemetry

- ONE transport (`bffFetch`): `credentials:"same-origin"`, `accept:"application/json"`; non-2xx → parse `{error, detail?}` → throw `BffError { status, code, detail, requestId }` where `requestId` is read from the `x-rhema-request-id` RESPONSE header (echoed on every response — F15). The browser NEVER sends `x-rhema-request-id` (server-side minting is deliberate — `observability.ts:4-5,74-76`).
- 401 → invalidate the session Query → `location.assign("/login")` document nav (`/login` is SSR — REQ-NAV-9).
- Error UI displays "…reference `<requestId>`" for 5xx — matching `webOnError`'s `internal error — reference <id>` text contract (`observability.ts:171`); 4xx codes render their product meaning (the stable-code vocabulary, F5).
- Server side unchanged: `logWebRouteError` emits the one structured line (route TEMPLATE — never `c.req.path`; status; upstream status/code; errorClass; severity; requestId); the ≥500 fallback sweep and the `degraded_reads` WARNING counter persist into the BFF handlers verbatim — aggregate best-effort seams keep `.catch(()=>null)` + `noteDegradedUpstream`.
- SSE failures keep the upstream-status passthrough incl. 404→404, resolved-non-ok→that-status, unreachable→502 + the `sse_*` line family (`server.ts:4311-4339`).

## Open questions

1. **`/bff/*` namespace confirmation** — recommended here (document-path `/bff` twins for reads; `wantsJson` dual-mode on existing POSTs; no `?format=`). If the spec instead wants `Accept`-negotiation on document paths, every document handler gains a third response class and the flag matrix complicates — flag for operator if disputed.
2. **External hand-off shape** — `{url}` returns the server-VALIDATED external URL and the client `location.assign`s (recommended — zero new state). The stricter REQ-SAFE-6 reading would add a same-origin `GET` hop endpoint that 302s (`/bff/billing/go?r=…`) needing server-side minted-URL storage; adopt only if reviewers read "except through those endpoints" as requiring a literal 302 response.
3. **Feed-label ownership** — recommended: server-owned map delivered as an aggregate field + `/bff/feed-labels` (deploy-versioned copy). Alternative: move `feed-labels.ts` into the shared bundle with COPY (REQ-SAFE-4 already ships COPY) — that makes copy changes need a client rebuild but deletes an endpoint. Pick one.
4. **Direct-PUT prerequisites** — the presign→browser-PUT design needs `connect-src` + GCS bucket CORS amended (F10). Confirm the infra change lands with the first SPA import-surface flip; until then SPA imports could fall back to the server-transit POST (multipart) — is a two-path upload acceptable as interim, or is the flip gated on infra?
5. **`RunSheetView` display strings** — recommended: ship pre-rendered strings (`whyLine`, `scopeApprovalLine`, `scopeLine`, `promoteLine`, `entitlementLine`, `protocolChangedLine`, `memoConfidentialityLine`, `collapsedSummary`, `modelTierDisplay`) as opaque text in the aggregate (parity, zero client copy logic). Alternative: re-key them to COPY keys + structured inputs and let the client format — cleaner i18n-wise, but duplicates formatter logic. Confirm the opaque-strings choice.
6. **`/p/:slug` aggregate granularity** — recommended: one aggregate embedding the Page bootstrap (`page` field). Alternative: `GET /bff/p/:slug` (chrome+gates+feed) + `GET /bff/p/:slug/page` (editor bootstrap) as two parallel loader reads — better when the Page defers. The single-aggregate choice mirrors today's single composition; confirm.
7. **Finding deep-link (`/p/:slug/f/:fid`)** — stays a server-canonical 302 today; a JSON `resolveFinding` (`GET /bff/p/:slug/resolve-finding/:fid` → `{href}`) would let client-side entries skip a document hop. Add it now or defer (note 25 marks it a possible follow-up)?
8. **Dossier filtering** — today `filterFindings`/`applySeverityBudget` run server-side on `?sev/kind/disp/sec/url/sug/obl`. Options: (a) server filters — aggregate takes the same params and returns filtered rows (parity, bigger payload churn per filter change); (b) ship `dossier.findings` raw + `rigor` and port the pure filters client-side (single fetch, instant filter navs). Recommend (b) — the filters are pure functions — flag for confirmation since it moves logic into the bundle.
9. **`GET /session` shape** — recommended principal-only relay (api payload verbatim). Should it additionally carry boot fields (theme/deviceClass/flags) to save the embed? Recommend keeping it pure — boot belongs to the document, session belongs to the Query layer (`["session"]`, refetchable).
10. **Per-request slug memo vs short-lived cache** — recommended: request-scope only. A `(session,slug)→row` cache (~seconds TTL) would save one `GET /projects` per request inside aggregates that already fetch it once; measured cost first, cache only if it shows.

## Spec requirements emitted

1. **REQ-BFF-1** — Endpoint convention: extracted document reads are `GET /bff/<surface-path>` JSON twins (document paths keep serving SSR HTML); mutations keep their existing POST paths with a `wantsJson` JSON branch; existing transports (`/session`, `/pricing/rates`, `/p/:project/palette-search`, theme/paper-theme routes, `/p/:project/chat/*`, `/p/:project/outline` dual-mode, `/edit/:draftId/{doc,save,note,cancel-run,revise}`, SSE `/p/:project/r/:runId/events`, `/a/{dwell,landing,acq}`, binaries, `/api/auth/*`, redirect-only paths, `/logout`) keep their paths and shapes. No `?format=` convention exists.
2. **REQ-BFF-2** — Mutation request contract: `content-type: application/json` + `accept: application/json` + `credentials: "same-origin"`; bodies are structured JSON (`GateStructuredEdits` for gate/finding edits — the `ed.*` flat grammar remains the form-only translation layer, never a JSON-body shape).
3. **REQ-BFF-3** — Mutation success envelope: `{ok:true, redirect?, flash?, data?, pending?:{pollAfterSeconds?}, url?}`; `redirect` carries the identical flash-parameterized URL the form path would 302 to (the ~60-key journey-pinned vocabulary is emitted verbatim by the server); `navigate` on `redirect` is a push (POST→302 history parity); `url` is only ever a server-validated hand-off target.
4. **REQ-BFF-4** — Error contract: non-2xx → `{error:"<stable_code>", detail?}` at the preserved upstream status (the `chatFail` semantic generalized — ApiError `{status,code}` maps directly, ≥500 upstreams become 502 with the gateway code, `unauthenticated`/`run_in_progress`/`conversion_pending`/`frozen`/`trial_*`/`insufficient_balance`/`refund_*`/`invalid_*`/`suggestion_too_large`/`chat_*` pass through unrenamed); 422 bodies pass through verbatim; JSON callers are never answered with a redirect.
5. **REQ-BFF-5** — Refusal-as-rerender semantics: bounces that today re-render a document with inline error state (`derror`, `applied`/`ferr`, `voice_locked`, outline save 422) become `error`/`detail`(+`flash`/`fields`) responses; the client stays on the owning surface and renders inline — the refusal is data, not a page.
6. **REQ-BFF-6** — Stale-state semantics: 400/404/409 on run-steering and similar writes mean "re-read current state" — the client invalidates the owning Query keys and renders the fresh read, not an error view.
7. **REQ-BFF-7** — Mutation classification: spend-adjacent and workflow-state-changing actions (run creation; billing subscribe/topup/portal/checkout/payment-link; refund; voice build/update/reconstruct; import/create; `/app/new/create`; gate decisions; finding apply/promote/obligate/bulk; run steering; outline promote; editor revise/cancel-run) are pending-only — never optimistic. UI-preference writes (theme, paper theme, grouping, explainer dismissal, inbox mark-read/read-all, notification prefs) may be optimistic with rollback on non-2xx. Every other endpoint defaults to pending; optimism is opt-in per endpoint in the spec.
8. **REQ-BFF-8** — Read-aggregation policy: a surface composing ≥3 reads ships ONE aggregate (the §2 table is normative: per-route endpoint, aggregate-vs-typed, seams, derivation placement); single-read surfaces get typed endpoints; the SPA never waterfalls a composite.
9. **REQ-BFF-9** — Degraded-read contract: best-effort seams keep their degrade semantics — `null`/omitted fields in aggregates + the server-side `noteDegradedUpstream` count and its `degraded_reads` WARNING line; a degraded optional read never fails the response and never silently passes unlogged.
10. **REQ-BFF-10** — Query-key/cache contract: keys are slug-scoped (`["bff","p",slug,…]`, `["bff","app"]`, `["session"]`, `["feed-labels"]` long-staleTime); project mutations invalidate the project's key family + the list key; nothing sensitive is cached across sessions (the Query client is rebuilt per document boot).
11. **REQ-BFF-11** — Slug→ID resolution: exactly once per request — a request-scoped memoized `listProjects` + find stashed in context before the handler; every downstream seam (incl. `getDossier`, `getTimeline`, `projectIdFor`-class internal resolutions) consumes the resolved `row.id`; no cross-request slug cache; idempotency keys (not the resolution memo) carry mutation dedupe.
12. **REQ-BFF-12** — SSE: `GET /p/:project/r/:runId/events` unchanged — same-origin `EventSource`, `?after` + `Last-Event-ID` forwarded, upstream status passthrough incl. 404→404 and ≥500→502 + structured lines; one layout-owned `EventSource` per `p.$project` branch with lastSeq checkpointing; not a Query.
13. **REQ-BFF-13** — Collab WSS: external-origin direct browser connect, cookie-authed upgrade, no BFF proxy; `collabWsUrl` arrives in the Page bootstrap and is withheld server-side for phone/showcase/read-only mounts; protocol/document naming per the editor-collab note.
14. **REQ-BFF-14** — Beacons: `/a/dwell`, `/a/landing`, `/a/acq` stay lossy 204 `sendBeacon`/keepalive endpoints with today's allowlisted event filtering; `email.verified` rides `/a/acq` for the SPA `?verified=1` fallback; beacons never block navigation or surface errors.
15. **REQ-BFF-15** — Polls: every meta-refresh becomes a `refetchInterval`/`invalidate` loop at the same cadence (import preview `IMPORT_PREVIEW_POLL_SECONDS`; `/app/new/preview`; `/billing/return` 5 s within the ≤30 s `open` window; Page 10 s visible-only `/doc` lock poll); pending-capable reads return `{pending, pollAfterSeconds}` so cadence stays server-owned.
16. **REQ-BFF-16** — Uploads (SPA): `POST /bff/import/presign` → `PresignedImportDto`; browser `PUT`s bytes directly to the signed URL echoing `requiredHeaders` verbatim (no session material to GCS — the signature carries auth); preview/create take `{quarantineKey}`; the BFF never proxies file bytes; `maxBytes` enforced client-side and by the signature bound; pending/replay-by-key semantics unchanged. Prerequisites: `connect-src` admits the GCS upload origin for SPA documents and the bucket CORS policy permits cross-origin PUT from the app origin (both tracked with REQ-SAFE-6's owner). The SSR form path keeps server-side byte-transit.
17. **REQ-BFF-17** — Downloads/binaries are document navigations (`/usage.csv`, `/p/:project/export/ai-use/:fmt`, `/app/settings/data/export/download`, `POST /p/:project/export`) with `Content-Disposition` preserved; no binary ever traverses a JSON envelope or a fetch-and-render path.
18. **REQ-BFF-18** — `GET /session` (same-origin, at `/session`): absent session → `401 {"error":"unauthenticated"}`; present → the api `/session` principal relayed (`{userId, workspaceId, billingAccountId, isTest?}`); it backs the route-level session guard and stays principal-only (boot fields live in `data-spa-boot`).
19. **REQ-BFF-19** — `data-spa-boot` shell embed carries `{principal, theme:{appTheme, paperTheme?}, deviceClass, surfaces:Record<routeId,"spa"|"ssr">, project?:{slug}}`; it seeds Query/theme/routing hints only — never an authorization grant; the first BFF 401 invalidates session state and document-navs to `/login`.
20. **REQ-BFF-20** — Pre-shell precedence (ordered, every flipped document GET): session → `?verified=1` mint → `/app` showcase/held-file precedence → `/p/:slug` unread handoff → phone/showcase SSR-document override → flag → shell-or-SSR. Server-owned redirects run before shell generation; none of these checks moves client-side for document loads.
21. **REQ-BFF-21** — `POST /bff/settings/account/confirm-email {token}` consumes the email-confirm token and returns `{ok:true, redirect:"/app/settings/account?notice=email-confirmed|email-confirm-failed", data?:{email}}` — both outcomes are 200+redirect (parity with the 302 bounce); one-shot, idempotent-replay-safe; the token never enters `data-spa-boot`; the route's `beforeLoad` fires it and `replace`-navs to `redirect`.
22. **REQ-BFF-22** — `POST /bff/p/:slug/handoff` → `{ok:true, data:{handoff:{href, inboxItemId}|null}}`: resolves slug→row, finds the unread `run_finished` inbox item for the project, marks it read (idempotent), returns its href. POST only — the mark-read side effect never rides a prefetched GET; `?focus=1` suppresses; client `beforeLoad` calls it on client-side entries only.
23. **REQ-BFF-23** — Estimate contract: the `p.run` aggregate ships `sheet: RunSheetView` (server-built — `recompute` lever matrix, `idempotencyKey`, `entitlementId`, `paymentLinkUrl`, display strings); lever repaints are client `cells` lookups; `POST /bff/p/:slug/estimate` (`EstimateRequestDto` → `EstimateDto` with `estimateCredits`/`capCredits`/`rateTableVersion`/`provisional`/`claimCount?`/`levers`) exists for revalidation and out-of-matrix inputs; the run POST carries estimate/cap/rate-table/idempotency fields while the api recomputes authoritatively; `surfaceEstimate`/`buildLeverMatrix` never enter the client bundle.
24. **REQ-BFF-24** — Feed labels: IDE aggregates carry `feed.labelMaps` (parsed object, the `data-feed-labels` payload verbatim); `GET /bff/feed-labels` is the standalone long-stale read; the client formatter keeps fail-closed semantics (unmapped event types drop, never render raw); feed payloads carry raw `FeedEventRow[]` + `lastSeq`.
25. **REQ-BFF-25** — Doc conversion: `markdownToDoc` runs client-side (`@rhema/editor` is DOM-free) — BFF payloads ship `doc: EditorDocDto` (markdown + metadata; `{exact}` semantics where today applies) and the client derives PM JSON; `script[data-page-doc]` embeds exist only in SSR mode.
26. **REQ-BFF-26** — Derivation placement: `toProjectRowView`/`groupByAttention`/`groupByVoice` and feed-row formatting port to the bundle verbatim (pure COPY/DTO maps — lawful because COPY ships in the bundle per REQ-SAFE-4); `buildRunSheetView`/`surfaceEstimate` stay server-side; aggregates ship raw DTOs + server-controlled maps.
27. **REQ-BFF-27** — External hand-offs: `{url}` envelope values pass `oauthRedirectTarget`/`stripeRedirectTarget` server-side before serialization (a refusal returns the error envelope, never an unvalidated URL); the client `location.assign`s only envelope-supplied URLs; the validators' coverage on the JSON path is pinned by test.
28. **REQ-BFF-28** — Single transport: all SPA calls funnel through one `bffFetch` (`credentials:"same-origin"`, `accept:"application/json"`); non-2xx → typed `BffError{status,code,detail,requestId}` with `requestId` read from the `x-rhema-request-id` response header; the browser never SENDS `x-rhema-request-id`; error UI surfaces "reference <requestId>" on 5xx.
29. **REQ-BFF-29** — Telemetry parity: BFF handlers emit the one structured `routeErrorLine` (route template — never `c.req.path`; status; upstream status/code; errorClass; severity; request id), keep the ≥500 fallback sweep and the `degraded_reads` WARNING counter; a 401 anywhere triggers session invalidation + `/login` document nav.
30. **REQ-BFF-30** — Idempotency: server-minted keys (e.g. `RunSheetView.idempotencyKey`) ride mutation bodies; the api's dedupe remains the retry boundary; the client layer issues no automatic POST retries.
