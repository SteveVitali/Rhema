# SPA.5 — BFF contract conventions: envelopes, {url} validators, slug memo, telemetry (run ledger)

- **Status:** DONE (Stage A; offline-only ticket — no deploy, no live legs owed)
- **Harness:** Devin CLI (agentic coding subagent); model: Cognition Devin; tier: n/a (build work)
- **Ticket:** `docs/tickets/102_SPA.5__bff-conventions.md` (manifest row 102)
- **Branch:** `stevevitali/spa-5-bff-conventions`, stacked on `stevevitali/spa-4-skeleton` @
  `297e593` (`OPERATOR` merge policy, **not merged**). PR **#123**. Tip `a545c6a` (code) +
  closeout docs commit.
- **Goal:** the shared BFF machinery every surface ticket consumes — `/bff/*` read-twin
  conventions + a reference implementation, the `wantsJson` dual-mode mutation envelope
  `{ok, redirect, flash, data, pending, url}`, `{error, detail?}` failures at preserved
  statuses, server-side `{url}` validation before serialization, request-scoped slug→id
  memoization, structured route-error telemetry with request ids, and the typed-seam
  promotion of `getRunEvents`/`streamRunEvents`/`presignImportUpload` into
  `@rhema/api-client`.
- **Spend:** $0. No deploys, no production writes.

## 0 — Context load

- DEFERRALS.md read first (per AGENTS): no `OPEN` row is unblocked by SPA.5 — every open row
  is a live-deploy leg, a HUMAN prerequisite, a funded-window spend leg, or a product
  decision; none is BFF-scoped or gated on the conventions module. No new row owed: every
  SPA.5 AC is deterministic-engineered — the whole surface is exercised through real Hono
  `app.request`s against a counting in-memory `DataSource` (47 tests in `bff.test.ts`) and
  `fakeFetch`-driven api-client calls (5 new tests in `index.test.ts`). REQ-BFF-16's
  `connect-src`/bucket-CORS prerequisites stay tracked with REQ-SAFE-6's owner and land
  with the actual `POST /bff/import/presign` route (SPA.13/14) — this ticket only promotes
  the typed seam, so nothing here defers.
- LEDGER CURRENT STATE read: `nextTicket: SPA.5`, `chainTip: stevevitali/spa-4-skeleton`
  (`297e593`), `mergePolicy: OPERATOR`, `round: 4`, `dispatchTarget: subagent`.
- Design sources applied, not re-derived: `docs/design/22_spa-bff-api-shape.md` (the
  normative contract — §2 endpoint table, REQ-BFF-1..30 in §Requirements, §7 one-shot
  conventions, §8 slug memo/OQ10, REQ-DAT-*); `docs/frontend-spa-spec.md` §5 (BFF contract)
  + §9 (the R11 amendment — `{url}` + `location.assign` replaces the literal 302-hop
  reading of REQ-SAFE-6; `form-action` never governed JS navigation); `server.ts`'s local
  `wantsJson` precedent (`:718`); `packages/contracts/src/{oauth,stripe}.ts` allowlists;
  `observability.ts` (`requestContext` request-id echo + `logWebRouteError` structured
  line — reused, not duplicated).

## 1 — What landed

- **`apps/web/src/bff.ts` (new, 281 lines)** — the conventions module:
  - `wantsJson(c)` — `content-type` OR `accept` carrying `application/json` selects the JSON
    branch (REQ-BFF-1/2); `server.ts`'s identical local predicate deleted, its chat/outline
    dual-mode branches now import the shared helper — behavior-identical.
  - `MutationEnvelope<T>` `{ok:true, redirect?, flash?, data?, pending?:{pollAfterSeconds?},
    url?}` (REQ-BFF-3, REQ-DAT-3) — `redirect` carries the identical flash-parameterized URL
    the form post would 302 to; `pending` is the server-owned `{pollAfterSeconds}` object,
    not a bare boolean.
  - `mutationOutcome(c, env)` — JSON → the envelope; form post → today's 302 (`url`,
    validated, wins over `redirect` — the mint→validate→302 hand-off preserved).
  - `externalNavTarget(url)` — absolute `https://` on `STRIPE_HOSTED_ORIGINS` /
    `GOOGLE_OAUTH_ORIGINS` only; consulted **before serialization** inside `mutationOutcome`
    so a refused target never reaches the wire (502 `{error:"external_nav_refused"}` + one
    structured line — never serialized, never 302'd) (REQ-BFF-27, REQ-SAFE-6/R11).
  - `bffFail(c, e)` — `{error, detail?}` at the **preserved** upstream status; `ApiError`
    codes pass through unrenamed; 422 bodies verbatim (`detail` untouched); ≥500 → 502
    `upstream_unavailable`; api 401 → `{error:"unauthenticated"}` 401, never a redirect;
    non-ApiError → `{error:"internal_error"}` 500. Every failure emits ONE structured
    `routeErrorLine` — route template, request id, upstream status/code; WARNING for
    expected <500 refusals, ERROR for real faults (REQ-BFF-4/5/29, REQ-DAT-2/10).
  - `bffRoute(deps, handler)` — session gate → 401 JSON (never the `/login` redirect — that
    leg is `bffFetch`'s client-side nav), then the handler under the `bffFail` boundary;
    `x-rhema-request-id` echoes free via `requestContext`.
  - `swallowDegraded(e)` — aggregate-twin best-effort swallow: degraded reads → `null` (the
    wrapped fetch already counted `degraded_reads`), upstream 401 rethrows → the
    `unauthenticated` envelope (REQ-BFF-9, REQ-DAT-12).
  - `projectRows`/`projectRow` — the **request-scoped** slug→id memo: one `listProjects`
    promise stashed on the Hono context; every consumer in the request shares it; the next
    request re-lists (authorization-safe — deliberately no cross-request cache, design/22
    §8/OQ10) (REQ-BFF-11, REQ-DAT-6).
  - `confirmEmailHandler` — `POST /bff/settings/account/confirm-email {token}` → 200
    `{ok:true, redirect:"/app/settings/account?notice=email-confirmed|email-confirm-failed",
    data?:{email}}`; both api outcomes land the notice (parity with the document GET's 302
    bounce); idempotent-replay-safe (REQ-BFF-21). Convention only — **SPA.12 wires the
    route.**
  - `projectHandoffHandler` — `POST /bff/p/:slug/handoff` → `{ok:true,
    data:{handoff:{href,inboxItemId}|null}}`: slug→row off the request memo, unread
    `run_finished` found, `markInboxItemRead` (idempotent), `?focus=1` suppresses; POST so
    the side effect never rides a prefetchable GET (REQ-BFF-22). Convention only —
    **SPA.23 wires the route + `beforeLoad` consumer.**
- **`apps/web/src/server.ts`** — `GET /bff/usage`, the reference read twin (REQ-BFF-1/8/9,
  REQ-DAT-1/4/12): `{usage, account}` raw api-client DTOs composed once through `bffRoute`;
  degrade semantics verbatim (`swallowDegraded` → `null`; 401 → `unauthenticated` envelope).
  `GET /bff/feed-labels` (REQ-BFF-24) already landed in SPA.4 — its convention is re-pinned
  by the new suite.
- **`apps/web/src/spa/queries.ts`** — `usageQuery` (`["bff","usage"]` → `bffFetch`; the
  REQ-BFF-10 key family the surface loaders extend).
- **`apps/web/src/data.ts`** — `getRunEvents`/`streamRunEvents`/`presignImportUpload` now
  delegate to the typed api-client members (the two raw `f(...)` fetches deleted; request
  shapes — `?poll=1`, `?after`, `accept: text/event-stream`, `last-event-id` — identical);
  `FeedEventRow` → alias of `RunEventDto`; `parseSseReplay` → `parseRunEventReplay`;
  `presignImportUpload` seam declared on `DataSource`.
- **`packages/api-client/src/index.ts`** — `RunEventDto` + `parseRunEventReplay` (the feed's
  wire row + the finite-replay parser, promoted verbatim); `ApiError.detail` (the api body's
  verbatim `detail` — REQ-DAT-10's 422 passthrough half); `ApiClient.getRunEvents`
  (`?poll=1` → parsed rows; non-2xx → `ApiError{status,code,detail}`) and
  `ApiClient.streamRunEvents` (the **raw** `Response` — the proxy pipes `res.body` and maps
  upstream status itself; a resolved non-ok is never thrown). `presignImportUpload` was
  already a member — its DataSource seam now flows through it.

## 2 — Tests (every behavior fails if the code is removed)

- `apps/web/src/bff.test.ts` (47) — real Hono `app.request`s, a counting in-memory
  `DataSource`, and the real `requestContext` middleware: `wantsJson` negotiation
  (accept / content-type / form-negative); the envelope fields verbatim (redirect+flash+
  data; `{url}` on JSON callers; the form post's 302 to the same URL); refused `{url}` →
  502 + the unvalidated string absent from the body AND absent from `location`;
  `externalNavTarget` allowlist matrix (three Stripe origins + `accounts.google.com`
  permitted; suffix lookalike, userinfo trick, wrapped lookalike, scheme downgrade,
  protocol-relative, `javascript:`, `data:`, relative path, `stripe.com` proper, and a
  non-URL all refused); session gate (401 JSON, never a redirect); `{error}` at preserved
  status with the code unrenamed (409); 422 `{error,detail}` verbatim; ≥500 → 502 without
  detail leak; api 401 → `unauthenticated` (no `location`); non-ApiError → one parsed
  `routeErrorLine` (route template, requestId, `errorClass`, ERROR severity — the thrown
  message never reaches the log) + `{error:internal_error}`; WARNING-vs-ERROR severity on
  the same template; `x-rhema-request-id` echoed on success and failure; slug memo —
  `listProjects` called exactly once across two `projectRow`s in one request, and twice
  across two requests (the no-cross-request-cache half); `swallowDegraded` matrix;
  confirm-email (good token → notice+`data.email`; api `{error}` arm → failed notice at
  200; missing/non-string token and a thrown seam → failed notice — replay-safe); handoff
  (unread `run_finished` → `{href,inboxItemId}` + one idempotent mark; read item →
  `handoff:null` and no mark; `?focus=1` suppresses without touching the inbox; unknown
  slug → 404 `{error:not_found}`); `GET /bff/usage` mounted through `createWebApp`
  (payload, degraded seam → `null`, upstream 401 → envelope, anonymous → 401 JSON).
- `packages/api-client/src/index.test.ts` (+5 → 14) — `ApiError.detail` carried verbatim;
  `getRunEvents` URL/headers/parse with a malformed record skipped; refusal →
  `ApiError{status:404, code:"not_found"}`; `streamRunEvents` raw contract — `?after`,
  `last-event-id`, `accept: text/event-stream`, session headers forwarded, and a resolved
  404 handed through unthrown.

## 3 — Verify

- `pnpm turbo build lint typecheck`: **135/135 tasks** green (one pre-existing lint
  *warning* — unused eslint-disable in `spa.dom.test.tsx`, inherited from SPA.4's committed
  code; 0 errors).
- `pnpm test` (full suite): **458 files / 4,738 pass / 4 skip / 0 fail** (~470 s — includes
  the `privsep.docker` leg).
- `pnpm check:spa-budget`: **OK** — all ceilings held (entry chunk unchanged; the reference
  twin adds ~0.1 kB to the `usage` leaf).
- `pnpm check:licenses` **805 packages OK** · `check:protocol-markers` **clean (75 files)**
  · `check:no-cookies` **clean (28 surfaces)**.
- `pnpm install --frozen-lockfile`: **N/A — no manifest changes** (no `package.json` /
  `pnpm-lock` touched).
- `check-build-memory.sh` + `check-append-only.mjs --base 297e593`: recorded at closeout
  below.

## 4 — Findings / deviations / CI

- **Size budget exceeded (owned decision, recorded):** ~966 changed lines vs the ticket's
  ~600 guide. The overage is the test-first clause, not scope: `bff.test.ts` is 435 lines
  pinning every new behavior (the ticket's own AC — "a test that fails if it is removed" —
  applied to ~15 distinct behaviors), `bff.ts` itself is 281 lines, and the api-client
  promotion + tests account for the rest. Alternative considered — thinner test coverage —
  rejected: the conventions are the substrate every later surface ticket builds on, so the
  pinning matrix is the deliverable. Recorded honestly per the SPA.4 precedent.
- **Owned decision — `pending` is `{pollAfterSeconds?: number}`** (REQ-BFF-3 verbatim), not
  a boolean — cadence stays server-owned.
- **Owned decision — convention handlers exported unmounted:** `confirmEmailHandler` /
  `projectHandoffHandler` are factories; the ticket assigns the routes to SPA.12 / SPA.23.
  They are pinned end-to-end now through test-mounted Hono apps — the owner tickets mount
  the same factories.
- **Owned decision — a refused `{url}` answers 502 to form posts too:** today's mint sites
  only produce allowlisted URLs, so a refusal is a server defect, not user input; a loud
  502 + structured line beats silently falling back to `env.redirect` (which would mask the
  dropped hand-off) and the unvalidated target is never emitted either way.
- **Owned decision — `ApiError` gains a `detail` field** rather than a parallel error type:
  the 422 passthrough (REQ-DAT-10) needs the api's verbatim body field; carrying it on the
  existing error keeps one error class across the seam (additive positional param, no call
  site breaks).
- **Owned decision — `bffFail` 401 short-circuits before the telemetry line:** an api 401
  on a session-held request is the normal expiry path (`bffFetch` already owns the client
  nav); logging it as a route error would be noise — the session gate + envelope are the
  observable contract.
- **Deferrals:** none opened, none closed (REQ-BFF-16's `connect-src`/bucket-CORS
  prerequisites stay with REQ-SAFE-6's owner and land with SPA.13/14's route — not deferred
  here since the seam promotion does not create the endpoint).
- **REQ ids stamped:** REQ-BFF-1..12, 14..30; REQ-DAT-1..6, 8, 9..14; REQ-SAFE-6;
  REQ-INV-3..5.
- **Out of scope held:** no per-surface endpoint tables (each surface ticket owns its
  twins); SSE/WS/binary transports untouched (only envelopes re-typed); no business logic —
  every handler relays `DataSource` seams; no flag set; the SSR fallback untouched.
- **CI:** PR #123 · `gh pr checks --watch=false` at closeout — **<CHECKS>**; the inherited
  `integration`/privsep red on this chain is classified under GD-MAINT.4-1, not repaired.
- **Validators:** `check-build-memory.sh` — **<MEMORY>**; `check-append-only.mjs --base
  297e593` — **<APPEND>**.
