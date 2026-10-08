# SPA.5 — BFF contract conventions: envelopes, {url} validators, slug memo, telemetry

Manifest row 102 · stacks on `stevevitali/spa-4-skeleton` @ `297e593` · merge policy
**OPERATOR** — do not merge from the build environment · **$0** spend, no deploys, no
production writes · offline-only ticket.

Implements `docs/tickets/102_SPA.5__bff-conventions.md` per `docs/frontend-spa-spec.md` §5
(BFF contract) + §9 (REQ-SAFE-6 R11 amendment note) and `docs/design/22_spa-bff-api-shape.md`
(normative — endpoint conventions, envelope, transports).

**Deployable dark:** additive-only — one new module (`src/bff.ts`), one new mounted route
(`GET /bff/usage`), the shared `wantsJson` replaces the identical local predicate the chat
dual-mode branches already key on (behavior-identical), and the typed api-client promotions
preserve the exact request/response shapes the raw fetches had. No HTML path, redirect, or
flash vocabulary changes; no flag set anywhere; SSE/WS/binary transports untouched.

## Requirement IDs

**REQ-BFF-1 · REQ-BFF-2 · REQ-BFF-3 · REQ-BFF-4 · REQ-BFF-5 · REQ-BFF-6 · REQ-BFF-7 ·
REQ-BFF-8 · REQ-BFF-9 · REQ-BFF-10 · REQ-BFF-11 · REQ-BFF-12 · REQ-BFF-14 · REQ-BFF-15 ·
REQ-BFF-16 · REQ-BFF-17 · REQ-BFF-18 · REQ-BFF-19 · REQ-BFF-20 · REQ-BFF-21 · REQ-BFF-22 ·
REQ-BFF-23 · REQ-BFF-24 · REQ-BFF-25 · REQ-BFF-26 · REQ-BFF-27 · REQ-BFF-28 · REQ-BFF-29 ·
REQ-BFF-30 · REQ-DAT-1 · REQ-DAT-2 · REQ-DAT-3 · REQ-DAT-4 · REQ-DAT-5 · REQ-DAT-6 ·
REQ-DAT-8 · REQ-DAT-9 · REQ-DAT-10 · REQ-DAT-11 · REQ-DAT-12 · REQ-DAT-13 · REQ-DAT-14 ·
REQ-SAFE-6 · REQ-INV-3 · REQ-INV-4 · REQ-INV-5**

## What lands

- **`apps/web/src/bff.ts` — the shared conventions module** every surface ticket's twins and
  mutation branches build from (design/22 §1–§9):
  - `wantsJson(c)` — the dual-mode negotiation (`content-type` OR `accept` carrying
    `application/json`; no `?format=` convention). The server.ts local predicate is deleted
    and the existing chat/outline dual-mode branches now import the shared helper —
    identical semantics (REQ-BFF-1/2).
  - `MutationEnvelope<T>` — `{ok:true, redirect?, flash?, data?, pending?:{pollAfterSeconds?},
    url?}`; `redirect` carries the identical flash-parameterized URL the 302 would have (the
    journey-pinned vocabulary emitted verbatim, REQ-BFF-3, REQ-DAT-3).
  - `mutationOutcome(c, env)` — JSON callers get the envelope; form posts keep the 302
    (`url` — validated — wins over `redirect`, matching today's mint→validate→302 hand-off).
  - `externalNavTarget(url)` — the `{url}` gate (REQ-BFF-27, REQ-SAFE-6 as amended by R11):
    only absolute `https://` URLs on `STRIPE_HOSTED_ORIGINS` / `GOOGLE_OAUTH_ORIGINS`
    survive; consulted **before serialization** inside `mutationOutcome`, so a refused
    target can never reach the wire through this helper (502 `external_nav_refused` +
    a structured log line; the unvalidated URL never serializes, never 302s).
    `form-action` never governed JS navigations — this allowlist is the sole enforcement.
  - `bffFail(c, e)` — the failure responder (REQ-BFF-4/5, REQ-DAT-2/10): `{error, detail?}`
    at the **preserved** upstream status; `ApiError.code` passes through unrenamed
    (`insufficient_balance`, `run_in_progress`, `frozen`, `trial_*`, `invalid_*`…); 422
    bodies re-serialize verbatim (`detail` rides along untouched); upstream ≥500 collapses
    to the 502 gateway code; an api 401 answers `{error:"unauthenticated"}` 401 — **never**
    the `/login` document redirect (the client owns that nav off the 401).
  - `bffRoute(deps, handler)` — the `/bff/*` wrapper: session gate → 401 JSON, then the
    handler under the `bffFail` boundary; request id echoes via `requestContext` and every
    failure emits ONE structured `routeErrorLine` keyed on the route **template**
    (REQ-BFF-29 — no user-controlled path text, no prompt/page content).
  - `swallowDegraded(e)` — the aggregate-twin best-effort swallow (REQ-BFF-9, REQ-DAT-12):
    degraded reads → `null` (the wrapped fetch already counted `degraded_reads`), while an
    upstream 401 rethrows so the envelope answers `unauthenticated`, never a politely empty
    page.
  - `projectRows(c, ds, session)` / `projectRow(…, slug)` — the **request-scoped** slug→id
    memo (REQ-BFF-11, REQ-DAT-6): one `listProjects` promise stashed on the Hono context per
    request — every downstream consumer shares it; deliberately NOT a cross-request cache
    (session-scoped ⇒ authorization-safe; no global invalidation hazard).
  - `confirmEmailHandler(deps)` — the REQ-BFF-21 convention:
    `POST /bff/settings/account/confirm-email {token}` → 200 `{ok:true,
    redirect:"/app/settings/account?notice=email-confirmed|email-confirm-failed",
    data?:{email}}` — both api outcomes land the notice redirect (parity with today's 302
    bounce); idempotent-replay-safe. **SPA.12 wires the route.**
  - `projectHandoffHandler(deps)` — the REQ-BFF-22 convention: `POST /bff/p/:slug/handoff` →
    `{ok:true, data:{handoff:{href,inboxItemId}|null}}`; slug→row off the request memo,
    unread `run_finished` found + `markInboxItemRead` (idempotent), `?focus=1` suppresses.
    POST so the side effect never rides a prefetchable GET. **SPA.23 wires the route.**
- **`GET /bff/usage` (`server.ts`) — the reference read twin** (REQ-BFF-1/8/9,
  REQ-DAT-1/4/12): the `/usage` document's data contract as JSON — `{usage, account}` raw
  api-client DTOs composed once; degrade semantics verbatim (each seam best-effort → `null`;
  upstream 401 → `unauthenticated` envelope). Mounted through `bffRoute`; SPA.10's usage
  twins build on this shape.
- **`src/spa/queries.ts` — `usageQuery`** (`["bff","usage"]` → `bffFetch` — REQ-BFF-10's
  slug-scoped key family, the surface tickets' loader pattern).
- **Typed-seam promotion (REQ-DAT-13, REQ-BFF-12/16) — `packages/api-client`:**
  - `RunEventDto` + `parseRunEventReplay` — the feed's wire row + the `?poll=1` finite-replay
    parser now live in the api client; `data.ts`'s `FeedEventRow` is a type alias and
    `parseSseReplay` delegates (call-site vocabulary stable).
  - `ApiClient.getRunEvents(runId)` — `GET /runs/:id/events?poll=1` parsed to `RunEventDto[]`;
    non-2xx → `ApiError{status, code, detail}`.
  - `ApiClient.streamRunEvents(runId, {after?, lastEventId?})` — the live SSE `Response`
    returned **raw** (the proxy pipes `res.body` and maps upstream status itself — a
    resolved non-ok is handed through unthrown); `accept: text/event-stream` +
    `last-event-id` forwarded. SSE transport preserved as-is.
  - `ApiError.detail` — the api body's verbatim `detail` now rides the error (the 422
    passthrough half of REQ-DAT-10); `presignImportUpload` was already a member — the
    `DataSource` seam now delegates to it (`POST /bff/import/presign` lands with
    SPA.13/14).
- **`GET /bff/feed-labels`** — landed in SPA.4; this ticket's tests re-pin the convention
  (REQ-BFF-24).

## Test evidence (every behavior fails if the code is removed)

- `apps/web/src/bff.test.ts` — **47 tests** over real Hono `app.request`s:
  `wantsJson` negotiation (accept/content-type/form); the full envelope (redirect+flash+
  data; `{url}` for JSON callers; form-post 302 parity); refused `{url}` never serializes
  and never 302s; `externalNavTarget` allowlist matrix incl. suffix lookalikes, userinfo
  tricks, scheme downgrade, protocol-relative, `javascript:`/`data:`, relative paths;
  session gate (401 JSON, never a redirect); `{error, detail?}` at preserved statuses;
  422 verbatim passthrough; ≥500 → 502 gateway collapse; non-ApiError → one structured
  `routeErrorLine` + `{error:internal_error}`; WARNING-vs-ERROR severity split;
  `x-rhema-request-id` echo on success AND failure; slug memo instrumented
  (`listProjects` called exactly once across two `projectRow`s; next request re-lists —
  no cross-request cache); `swallowDegraded` matrix; confirm-email + handoff conventions
  end-to-end; `GET /bff/usage` mounted through `createWebApp` (payload, degrade→null,
  401→envelope, session gate).
- `packages/api-client/src/index.test.ts` — **+5 tests** (14 total): `ApiError.detail`
  passthrough; `getRunEvents` URL/headers/parse (malformed record skipped); refusal →
  `ApiError{status,code}`; `streamRunEvents` raw-response contract + `?after`/`last-event-id`
  forwarding + resolved-404 passthrough.
- Gate: `turbo build lint typecheck` **135/135** · full `pnpm test` **458 files / 4,738 pass
  / 4 skip / 0 fail** · `check:spa-budget` **OK** · `check:licenses` **805** ·
  `check:protocol-markers` clean · `check:no-cookies` clean · frozen-lockfile **N/A** (no
  manifest changes).

## Deviations / owned decisions

- **Size budget:** ~966 changed lines vs the ticket's ~600 guide. The overage is the
  test-first clause — 435 lines are `bff.test.ts` covering every new behavior (per the
  ticket's "a test that fails if it is removed" AC) + the api-client seam tests; the module
  itself is 281 lines. No fat found to cut; recorded honestly (same disposition as SPA.4's
  structural overage).
- **`pending` envelope field typed `{pollAfterSeconds?: number}`** per design/22 REQ-BFF-3 —
  cadence stays server-owned; not a bare boolean.
- **Convention handlers exported, not mounted** — `confirmEmailHandler` /
  `projectHandoffHandler` are factories per the ticket's convention split (SPA.12 wires
  confirm-email, SPA.23 wires handoff + its `beforeLoad` consumer); tests mount them
  against real Hono apps so the behavior is pinned now.
- **`mutationOutcome` refuses `{url}` at 502 for form posts too** — today the SSR mints only
  produce allowlisted URLs, so a refused `url` through the helper is a server defect;
  answering a bare 502 + log line (rather than silently redirecting to `env.redirect`)
  keeps the refusal loud and never leaks the unvalidated target.
- **Deferred:** nothing new — every AC is deterministic-engineered offline. REQ-BFF-16's
  `connect-src`/bucket-CORS prerequisites stay tracked with REQ-SAFE-6's owner and land
  with the `POST /bff/import/presign` route (SPA.13/14), not this seam promotion.

**CI:** `gh pr checks --watch=false` recorded in `runs/SPA.5.md`; inherited
`integration`/privsep red on the chain is classified under GD-MAINT.4-1, not repaired.
