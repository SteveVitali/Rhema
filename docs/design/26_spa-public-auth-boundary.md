# 26_spa-public-auth-boundary — Public/auth'd boundary: the concrete split and the seams across it

**Stream:** C
**Researched:** 2026-10-07
**Author:** explore-subagent (C3 boundary worker)
**Ledger rows covered:** C3
**Confidence overall:** high

All evidence is repo-local. Q-1 is fixed: **public/marketing/login stay SSR; the SPA boundary is the auth
gate** (`docs/research-ledger.md:95`). This note pins the split route-by-route, specs the SPA shell
document, the reverse-gate/session endpoint, the head contract, every cross-boundary transition, the
Q-5 flag-coexistence mechanics, and the shared asset pipeline.

## Findings

### F1 — The public SSR set is exactly REQ-INV-6's list; `routes.tsx`'s `public` flags agree

**Claim:** The surfaces reachable without a session are six document routes — `/`, `/invite`,
`/pricing`, `/signup`, `/login`, `/showcase` — plus POST siblings `/signup`, `/login`, `/logout`, and
the transport/misc endpoints `/api/auth/*`, `/a/landing`, `/pricing/rates`, `/healthz`, `/favicon.*`,
`/assets/*`, and the `*` 404. `routes.tsx`'s `public: true` manifest flags mark exactly the six
document paths and nothing else; every other manifest row is auth'd.
**Status:** VERIFIED
**Evidence:** `docs/research/01_route-census.md` REQ-INV-6 + census table rows 98-115;
`apps/web/src/routes.tsx:75-80` (the six `public: true` rows) vs `:81-139` (all auth'd);
`apps/web/src/server.ts:5669` (catch-all).
**Retrieved:** 2026-10-07T22:10:00Z
**Implication for the spec:** The boundary is a *list*, not a prefix. `/app/*`, `/p/*`, `/v/*`,
`/voices*`, `/usage`, `/settings*`, `/billing/return` are SPA space; the six public docs plus the
transport set are SSR/endpoint space. Neither side of the line is expressible as a single path prefix.
**Outline delta:** CONFIRMS Q-1; EXTENDS REQ-INV-6 into the operative boundary table below.

### F2 — `/showcase` is a three-leg public route whose signed-in leg 302s into SPA space

**Claim:** `GET /showcase` resolves: (a) signed-out → static `SAMPLE_DOSSIER` render; (b) signed-in
without a Showcase project → same static sample with app-flavored chrome (`ShowcasePage signedIn`,
nav CTA → `/app`); (c) signed-in WITH a showcase → `302 /p/:slug/review/:runId` (or `/p/:slug` when no
review run exists) — i.e., a public document route that hands a live session *into* the SPA.
**Status:** VERIFIED
**Evidence:** `apps/web/src/server.ts:1717-1736`; `apps/web/src/marketing.tsx:562-596`
(`ShowcasePage({signedIn})`); `apps/web/src/routes.tsx:26-27` (`showcaseElement` /
`showcaseSignedInElement`).
**Retrieved:** 2026-10-07T22:10:00Z
**Implication for the spec:** `/showcase` stays SSR (it is a public SEO surface; REQ-INV-6 pins it).
Its leg-(c) 302 is the canonical public→SPA transition shape: a server redirect whose target is a
document URL the SPA shell serves. The SPA never routes `/showcase`.
**Outline delta:** EXTENDS the public list with a boundary-crossing edge.

### F3 — `/billing/return` is auth'd and becomes an SPA route; its meta-refresh becomes a JSON poll

**Claim:** `GET /billing/return` is session-gated (`deps.session` → `/login`), reads
`getCheckoutSession(?session_id=)`, renders `billingReturnElement`, and — only while the Stripe
session row is `open` and younger than 30 s — stamps `autoRefresh{seconds:5, url: self}` (a
`<meta http-equiv="refresh">`); `?cancelled=1` renders cancelled copy and never polls.
**Status:** VERIFIED
**Evidence:** `apps/web/src/server.ts:3089-3114`; meta-refresh emission `apps/web/src/render.tsx:128-130`;
poll-as-data requirement `docs/research/03_data-layer-audit.md` REQ-DAT-14.
**Retrieved:** 2026-10-07T22:10:00Z
**Implication for the spec:** It sits behind the auth gate, so it is SPA space — Stripe's hosted
`return_url`/`cancel_url` simply document-navigate into it (a full shell load, acceptable for a
once-per-purchase landing). In the SPA it is a route component polling the checkout-session JSON on a
5 s interval bounded by the same 30 s `open` window — the window bound is server-computable data
(`checkoutReturn.createdAt`), not markup. The Stripe return URL configuration must keep targeting a
path the SPA space covers.
**Outline delta:** RESOLVES the row's open edge case — `/billing/return` is an SPA route.

### F4 — Redirect-only GETs and every non-document endpoint stay server-owned at any flag state

**Claim:** Several auth'd GETs never render a document: `/app/usage/r/:runId` (canonicalizing 302 to
`/p/:slug/r/:runId#report`), `/p/:project/f/:fid` (find-and-302 deep link), `/p/:project/edit/:draftId`
(302 to `/v/:n`), legacy `/settings`, `/app/settings`, `/settings/billing` alias-family 302s. Likewise
all POST mutations, beacons (`/a/*`), the SSE proxy (`/p/:p/r/:runId/events`), binary downloads
(`/usage.csv`, `POST /p/:p/export`, `/export/ai-use/:fmt`, the presigned-302 export download), and
`/api/auth/*` are transports, not documents.
**Status:** VERIFIED
**Evidence:** `apps/web/src/server.ts:4288-4295`, `4627-4642`, `4933-4949`, `2394-2401`, `2759-2778`,
`2947-2955`; beacon/SSE/binary endpoints `3117-3176`, `4299-4350`, `5056-5151`, `2725-2734`;
census F8/REQ-INV-4.
**Retrieved:** 2026-10-07T22:10:00Z
**Implication for the spec:** The boundary splits *document* routes only. Redirect GETs stay Hono
302s (a server-side redirect is the cheapest possible resolution and preserves `safeBack` confinement);
they can still 302 *into* SPA space. POSTs/beacons/SSE/binaries are BFF surface (stream B3), unchanged
by which document mode a URL serves.
**Outline delta:** EXTENDS — "the auth gate is the boundary" applies to documents; transports are
boundary-invariant.

### F5 — The `*` catch-all must split by prefix + session or it swallows SPA deep links

**Claim:** Today `app.all("*")` unconditionally renders `notFoundElement` at 404. Under the SPA, a
document GET to an auth'd path the server has no explicit route for (an SPA-side route not yet wired
server-side, or a genuinely unknown `/p/...` path) must NOT hit this 404 — it must serve the shell doc
and let the client router render its own not-found. Public-side misses keep the SSR 404.
**Status:** VERIFIED
**Evidence:** `apps/web/src/server.ts:5669` (unconditional 404); SSR 404 idiom
`c.html(renderDocument(c.req.path, notFoundElement), 404)` at e.g. `server.ts:3186`; the SPA-prefix
set derivable from the auth'd manifest rows `routes.tsx:81-139`.
**Retrieved:** 2026-10-07T22:10:00Z
**Implication for the spec:** The catch-all ordering becomes: explicit routes → SPA-space check
(GET + session present + path under an SPA prefix) → shell doc → else SSR 404. The SPA-prefix set
(`/app`, `/p`, `/v`, `/voices`, `/usage`, `/billing`, `/settings`) is a manifest constant the spec
must name; note `/v/:persona` (voices) collides with nothing public, and `/api`, `/a`, `/assets`,
`/favicon.*`, `/healthz` must never enter SPA space.
**Outline delta:** CORRECTS any assumption the catch-all can stay unchanged.

### F6 — The SPA shell document reuses `renderDocument`'s head machinery minus the body; the nonce middleware covers it for free

**Claim:** Every SSR document is built by `renderDocument` (`render.tsx:115-179`): `docMetaFor` gives a
per-route `<title>` (descriptions/OG/Twitter only on the six public docs); the pre-paint
`themeBootScript()` IIFE; inline `themeCss()`; favicon pair; charset/viewport; `lang`/`data-theme`/
`data-app-theme`/`data-paper`/`data-project` html attrs; conditional `ide.js` tag; dwell beacon. CSP
nonce stamping is NOT in renderDocument — it is a response middleware (`server.ts:354-371`) that
regex-stamps `nonce=` onto every `<script` in any `text/html` response (the lookahead `[\s>]` matches
`<script type="module">`), then sets `script-src 'self' 'nonce-…'` + `form-action 'self' <Stripe> <Google>`.
**Status:** VERIFIED
**Evidence:** `apps/web/src/render.tsx:35-93` (docMetaFor, THEME_CSS, BOOT), `:115-179` (document
assembly); `apps/web/src/server.ts:341-371` (cspFor + nonce middleware);
`packages/ide/src/theme.ts:52-89` (themeBootScript source).
**Retrieved:** 2026-10-07T22:10:00Z
**Implication for the spec:** The shell doc is a static string template — no `renderToStaticMarkup`,
no StaticRouter (the SPA routes client-side, TanStack per Q-2). Required contents: the docMetaFor
`<title>` floor for the requested path (cheap — call it with the pathname), theme boot IIFE verbatim
(REQ-ISL-15), inline `themeCss()`, favicons, viewport, `data-theme` (+ `data-project` extracted from
`/p/:slug` paths so paper resolves pre-paint from the localStorage mirror), one mount node, the Vite
entry `<script type="module">`. Nonce + CSP arrive automatically iff the response is `text/html` —
the middleware must run for shell responses; Vite-injected inline bootstraps would violate CSP and
are prohibited (REQ-TST-5).
**Outline delta:** EXTENDS §shell with the concrete template; CONFIRMS REQ-ISL-15/REQ-TST-5 coverage.

### F7 — The reverse gate stays server-side; the SPA needs one new same-origin session endpoint

**Claim:** Five public GETs (`/`, `/invite`, `/pricing`, `/signup`, `/login`) call `signedIn(c)` =
`deps.session(c)` presence + `dataSource.checkSession` → 302 `/app` (`/showcase` runs its own leg;
`?audience=test` bypasses for flagged test tenants). `checkSession` is a raw `f()` fetch of the api's
`GET /session`, which returns `{...principal, isTest}` or `401 {error:"unauthenticated"}`. No
same-origin session endpoint exists on the web host today — `session(c)` is just "any cookie/identity
header present" (presence ≠ validity; an expired cookie gates in and the api's 401 → `onError` →
`/login` cleans up).
**Status:** VERIFIED
**Evidence:** `apps/web/src/server.ts:1515-1518` (signedIn), `:1523-1527` (invite), `:1565-1571` (`/`),
`:1575-1577` (pricing), `:1616-1617` (signup), `:1740-1741` (login); `apps/web/src/data.ts:1096-1099`
(checkSession raw fetch); `apps/api/src/index.ts:382-392` (`GET /session` contract);
`apps/web/src/main.ts:115-125` (presence-only session); `server.ts:422-425` (onError 401→/login).
**Retrieved:** 2026-10-07T22:10:00Z
**Implication for the spec:** Keep the server-side reverse gate verbatim — first-load `/` by a live
session still 302s before render. For SPA-internal session awareness spec `GET /session` on the web
host: session absent → `401 {error:"unauthenticated"}`; else proxy api `/session` verbatim (principal
+ `isTest`). It is the TanStack Query session query (REQ-DAT-13 already demands checkSession become
first-class). 401 semantics in the SPA: any BFF 401 → invalidate the session query → `location.assign`
(document nav) to `/login` — mirroring the SSR `onError` mapping.
**Outline delta:** EXTENDS REQ-DAT-13 with the concrete endpoint; CONFIRMS REQ-INV-2 stays.

### F8 — The public head contract is verbatim `docMetaFor` + social emission; the SPA floor is title-only plus a client head manager

**Claim:** Public docs emit `<title>` (distinct `page · Rhēma`), meta description, OG site/title/
description/type, Twitter card/title/description, canonical + `og:url` (when the handler passes the
origin), and both favicons — all attribute-escaped, copy from `COPY`. Auth'd routes emit title +
favicons only (no description/social). Journey N10 asserts distinct titles, meta presence, exactly one
`<h1>`, favicon 200, and a banned-copy scan — on public routes only; `render.test.tsx` additionally
pins auth'd-route titles.
**Status:** VERIFIED
**Evidence:** `apps/web/src/render.tsx:154-178` (emission), `:35-86` (the full title table incl.
settings sections, `/v/:persona`, `/p/:slug/*` sub-routes);
`docs/research/04_test-surface-audit.md` F7 + REQ-TST-9 (`render.test.tsx:15-83`, N10 at
`steps.ts:1925-1967`).
**Retrieved:** 2026-10-07T22:10:00Z
**Implication for the spec:** Public SSR pages keep `renderDocument` byte-for-byte semantics — nothing
in F8's public contract may change. The SPA shell serves `docMetaFor`'s title for the requested path
as the pre-hydration floor; a client head manager then owns `<title>` per client-side nav, reproducing
the same table (it is the existing contract — project-title prefix on `/p/:slug/*`, section titles on
`/app/settings/*`, etc.). No description/OG on auth'd routes (none exist today — nothing to preserve).
**Outline delta:** EXTENDS REQ-TST-9 with the title table as the port contract.

### F9 — Boundary transitions are document navigations in both directions; post-login `/app` is a full load by design and needs no session carry

**Claim:** SPA→public: `POST /logout` is ungated, clears both session-cookie names via `endSession`
(api sign-out + `Max-Age=0` Set-Cookie), 302s to `/` — a document transition today and still one in
the SPA (a real `<form method="post" action="/logout">` or fetch-then-`location.assign("/")`).
Public→SPA: `beginAuth` sets `callbackURL` to `/app[?entry&held&src]`; the api relays Set-Cookie on the
auth response *before* redirecting the browser, so the cookie is already planted when `/app` loads —
the first `/app` GET is a full document load + hydration carrying only URL state. Additionally `GET
/app` runs server-side precedence BEFORE rendering: `?verified=1` mints `email.verified`, and the
first-five-minutes rule (only-child unopened Showcase, or `?entry=draft|outline`/`?held=1` intent) can
302 to `/p/:slug/review/:runId#finding-…` or `/app/new?entry=…&held=1`.
**Status:** VERIFIED
**Evidence:** `apps/web/src/server.ts:1842-1845` (logout), `main.ts:235-246` (endSession cookie clears),
`main.ts:156-174,210,231` (beginAuth callbackURL + set-cookie relay — cookie lands on the auth leg),
`server.ts:1852-1927` (`?verified` mint + precedence redirects); census F8(d) + Open question 6.
**Retrieved:** 2026-10-07T22:10:00Z
**Implication for the spec:** No "session-carry" seam exists or is needed — the cookie rides the
auth-callback response. The `/app` precedence logic is routing, not rendering: it stays in the `/app`
handler *ahead of* the shell-doc branch at every flag state (moving it client-side would flash the
shell then navigate, and would lose `?verified=1`'s server-side mint). Stripe/OAuth outbound
hand-offs become `{url}` JSON + `location.assign` — and `form-action` does NOT govern script-initiated
navigation, so allowlist enforcement (`stripeRedirectTarget`/`oauthRedirectTarget`,
`server.ts:198-260`) must move into the BFF that mints the URL.
**Outline delta:** RESOLVES the transition questions; EXTENDS T6 — MAINT.5's enforcement point moves
from CSP to the BFF.

### F10 — The `?hc=` hold handshake crosses the boundary through IndexedDB + URL params; only the JS is per-side

**Claim:** The drop-zone hold is written client-side into IndexedDB `rhema-hold`/`holds`/
`landing-dropzone` (≤10 MB, ext allowlist) by `landing.js` on the SSR `/`; the token (never bytes)
beacons to `/a/landing` and `?held=1` rides `/signup` → `beginAuth` → `/app` intent. On `/app/new`
the `data-held` form + `data-held-token` input let the island hydrate the file input and stamp the
token; `/app/new/create` echoes it back as `?hc=<token>` on the success redirect; the landing page
renders `data-held-consumed=<token>` and the island deletes the hold only on a token match (also on
the `/v/:n` fix-now landing).
**Status:** VERIFIED
**Evidence:** `docs/research/02_island-contract-map.md` F8 + REQ-ISL-13;
`apps/web/src/client/landing.ts` (per F8's read); `apps/web/src/server.ts:2246-2254` (`hc=` emit),
`:3311-3313` + `:4774-4775` (`heldConsumed` on project + fix-now pages);
`apps/web/src/pages.tsx:265-269` (`data-held-consumed` marker + landing.js mount), `:1116-1127`
(`data-held`/`data-held-token` form contract); `server.ts:1916-1918` (intent.held fallback).
**Retrieved:** 2026-10-07T22:10:00Z
**Implication for the spec:** IndexedDB is origin-scoped — the hold survives the `/` (SSR) → `/app/new`
(SPA) crossing with zero server involvement; `?hc=`, `?held=1`, `?entry=`, `?src=` are URL state that
survives document nav. What must exist on BOTH sides: (a) the store/key/token contract is a shared
spec object (one module or two ports with identical semantics — REQ-ISL-13 verbatim); (b) the SSR side
keeps `landing.js` for `/`; (c) the SPA side needs a React port of the claim (`/app/new`) and
consumption (`/p/:slug`, `/p/:slug/v/:n` render the `data-held-consumed` marker → effect deletes on
match). `POST /app/new/create` as a JSON mutation returns the `?hc=`-carrying target as data
(REQ-DAT-3).
**Outline delta:** EXTENDS REQ-ISL-13 with its boundary-split realization.

### F11 — Q-5 flag coexistence is a per-handler branch with a fixed order; flipped surfaces lose the no-JS floor to a `<noscript>` + rollback

**Claim:** Each auth'd document GET can serve SSR OR the shell on the same URL. The branch order must
be: (1) session gate (`!session → 302 /login`) — unchanged; (2) server-owned redirect logic that must
run regardless (`/app` precedence, `?verified=1` mint) — unchanged; (3) the per-surface flag — ON:
serve the shell doc and skip the PageData fan-out (the SPA fetches data via BFF); OFF: the existing
data fan-out + `renderDocument`. No-JS posture: today's floor is working forms/meta-refresh/read-views
(REQ-ISL-11); on a flipped surface the shell's body is a mount node, so the honest floor is a
`<noscript>` block plus Q-5's config-flip rollback — a real degradation the spec must acknowledge, not
paper over.
**Status:** VERIFIED (mechanism design; the no-JS delta is a consequence, honestly flagged)
**Evidence:** session-gate idiom `server.ts:3184-3186`; `/app` precedence `server.ts:1898-1927`;
no-JS floor inventory `docs/research/02_island-contract-map.md` F10 + REQ-ISL-11 + contract table
("SSR fallback without JS" column); Q-5 decision `docs/research-ledger.md:99`; test-audit Open
question 4 (fallback retention per flip).
**Retrieved:** 2026-10-07T22:10:00Z
**Implication for the spec:** Specify the branch order explicitly (it is the strangler seam's core);
the flag lives in deps/config so a flip is a redeploy-config change, matching Q-5's "rollback is a
config flip". The `<noscript>` floor (message + sign-in link) is the REQ-ISL-11 realization on flipped
surfaces — the full no-JS app is only ever available by flipping back.
**Outline delta:** EXTENDS Q-5 with mechanics; CONTRADICTS any reading of REQ-ISL-11 as
"no-JS parity on flipped surfaces" — it cannot be, by construction.

### F12 — Fonts, theme tokens, and CSS are one pipeline; the bundler count is temporarily two

**Claim:** `themeCss()`/`ideCss()` from `@rhema/tokens` are inlined into every document's `<style>`;
`/assets/fonts/:file` serves Fontsource-derived woff2 (regex-gated names, `max-age=31536000,
immutable`); island bundles serve from `public/` at `/assets/<entry>.js` with `no-cache`. The `@rhema/ui`
components (`Shell`, `DossierView`, …) are already React rendered server-side — the same package feeds
the SPA. So: ONE design-token/font/CSS source and ONE component library; TWO bundlers during the
transition (esbuild islands still serve public pages; Vite builds the SPA per Q-3).
**Status:** VERIFIED
**Evidence:** `render.tsx:4,89-93,176`; `server.ts:5645-5667` (asset routes — `no-cache` islands vs
`immutable` fonts); `apps/web/build-client.mjs` output to `public/` (census F4, test-audit F5);
`marketing.tsx:10` + `routes.tsx:3-4` (pages already `@rhema/ui` React); Q-3
(`docs/research-ledger.md:97`).
**Retrieved:** 2026-10-07T22:10:00Z
**Implication for the spec:** The shell doc inlines the same `themeCss()` and the SPA's `@font-face`
rules keep pointing at `/assets/fonts/*` — no font pipeline change. Vite emits under `/assets/` too;
hashed names get the `immutable` cache profile (the `no-cache` profile is for unhashed entry points).
`landing.js` remains the only island bundle public pages need post-migration (`/` drop-zone); whether
it stays esbuild or becomes a Vite entry is a B2 detail — the boundary note only requires that `/`'s
hold capability never regress.
**Outline delta:** RESOLVES the pipeline question — one token/font pipeline, transitional dual bundler.

## Design

### The boundary table (definitive)

| Path / class | Side | Notes |
|---|---|---|
| `GET /`, `/invite`, `/pricing`, `/signup`, `/login`, `/showcase` | **SSR, forever** | reverse gate: signed-in → 302 (`/app`; `/showcase` → own dossier); full head contract |
| `POST /signup`, `/login`, `/logout` | **SSR endpoints** | public writes; `/logout` clears cookies → 302 `/` |
| `ALL /api/auth/*` | **unchanged proxy** | set-cookie relay, forged-stamp strip, ADR-040 re-stamp (REQ-DAT-7) |
| `POST /a/landing` | **public beacon** | unchanged |
| `POST /a/dwell`, `/a/acq` | **auth'd/optional beacons** | unchanged; the SPA posts them too |
| `GET /pricing/rates`, `/healthz`, `/favicon.*` | **unchanged** | |
| `GET /assets/*` | **unchanged mount** | + hashed-asset long-cache profile for Vite output |
| All auth'd document GETs (`/app*`, `/p/*`, `/v/*`, `/voices*`, `/usage`, `/billing/return`, `/app/settings/*`, …) | **flag-branched SSR‖SPA → SPA** | incl. `/billing/return` (F3) and the pending-poll pages |
| Redirect-only auth'd GETs (`/app/usage/r/:runId`, `/p/:p/f/:fid`, `/p/:p/edit/:d`, legacy `/settings*`) | **server-owned** | thin 302s; targets may be SPA space |
| All auth'd POSTs, SSE, binary, JSON endpoints | **BFF (stream B3)** | boundary-invariant |
| `*` catch-all | **split** | GET + session + SPA-prefix → shell; else SSR 404 (F5) |

### The shell document

Served by each auth'd document GET under flag-ON (and by the catch-all's SPA branch), as `text/html`
so the existing nonce/CSP middleware stamps it:

```html
<!doctype html><html lang="en" data-theme="dark" [data-app-theme] [data-project=<slug>]>
<head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<link rel="icon" href="/favicon.svg" type="image/svg+xml"><link rel="icon" href="/favicon.ico" sizes="any">
<title>{docMetaFor(path)}</title>
<script nonce>{themeBootScript()}</script>
<style>{themeCss()}</style>
<modulepreload links per Vite manifest>
</head>
<body><div id="spa-root"></div>
<noscript>…requires-JavaScript floor + /login link…</noscript>
[<script type="application/json" data-spa-boot>{principal?, theme pref?}</script>]
<script type="module" src="/assets/spa.<hash>.js"></script>
</body></html>
```

Session gate first (`!deps.session(c)` → `302 /login`) — a signed-out deep link never receives the
shell. Expired-cookie case inherits today's semantics: shell serves on cookie presence, the first BFF
401 → `location.assign("/login")`.

### Handler shape (flag coexistence)

```
onAuthdDocumentGET(c):
  session = deps.session(c); if (!session) return c.redirect("/login")   // (1) gate
  run server-owned redirect logic for this route (if any)                // (2) e.g. /app precedence
  if (deps.spa(surfaceName(c))) return c.html(spaShell(c.req.path))      // (3) flag → shell
  return c.html(renderDocument(path, element, await loadPageData(...)))  //      else SSR
```

Catch-all: `app.all("*")` → `if (GET && deps.session(c) && isSpaPath(path)) c.html(spaShell(path))
else c.html(renderDocument(path, notFoundElement), 404)`.

## Open questions

1. **`/app` precedence cost under flag-ON:** keeping the showcase-first-open/`?entry` precedence
   server-side costs one `listProjects` + `getShowcaseEntry` per cold `/app` load. Alternative: return
   the precedence decision in the session/boot payload — but the server-side 302 keeps deep-link
   semantics exact. Recommend keeping it server-side; confirm cost is acceptable (REQ-DAT-6's
   slug-join collapse mitigates).
2. **Boot payload vs session round-trip:** ship `{principal, theme pref}` in `data-spa-boot` (saves
   one `/session` fetch AND fixes the fresh-device `data-app-theme` hole — today SSR stamps the real
   pref; the shell otherwise only has the localStorage mirror, so a light-pref user on a new device
   flashes dark) — or keep the shell dumb and always query `/session`. Recommend the boot payload.
3. **Pending-poll pages during partial flips:** `/app/new/preview` and `/import/preview` are auth'd
   meta-refresh pages — do they flip with their parent surface or stay SSR until the import flow's
   flag? (D3 sequencing input; the answer matters because a flipped `/app/new` + SSR `/app/new/preview`
   mixes document models mid-flow — legal under this design, but must be deliberate.)
4. **SPA-prefix manifest ownership:** the `isSpaPath` set (`/app`, `/p`, `/v`, `/voices`, `/usage`,
   `/billing`, `/settings`) — a constant in the route manifest vs derived from the TanStack route
   tree? Must stay in sync either way; a test should pin it (routes.test.ts-style parity check).
5. **`data-paper` on cross-project nav:** the shell stamps `data-project` from the path, so the boot
   script resolves paper from the localStorage mirror; first-ever visit to a project whose paper pref
   isn't mirrored resolves default-then-corrects. Acceptable (mirror fills on first stamp) — confirm.
6. **`/logout` as form vs fetch:** a real `<form method="post">` is the no-JS-safe, CSP-clean answer;
   an SPA might prefer fetch+nav for a confirming toast. Either works — the endpoint is unchanged;
   pick one convention in B3's mutation spec.

## Spec requirements emitted

1. **REQ-BND-1** — The public SSR document set is exactly `/`, `/invite`, `/pricing`, `/signup`,
   `/login`, `/showcase` (REQ-INV-6); additions/removals require a ledger amendment, not a code diff.
2. **REQ-BND-2** — `/showcase` keeps all three legs SSR; its signed-in 302 may target SPA space.
   `/billing/return`, `/app/new/preview`, `/import/preview` and every other auth'd document GET are
   SPA routes; pending-state polling becomes client-driven against JSON carrying the poll window as
   data (per REQ-DAT-14: `{pending, pollAfterSeconds}` / the 30 s `open` bound).
3. **REQ-BND-3** — Redirect-only GETs (`/app/usage/r/:runId`, `/p/:p/f/:fid`, `/p/:p/edit/:draftId`,
   legacy `/settings*` aliases) and ALL POST/beacon/SSE/binary/proxy endpoints remain server-owned at
   every flag state; the boundary splits document routes only.
4. **REQ-BND-4** — The `*` catch-all SHALL branch: GET + session-present + SPA-prefix path → shell
   doc; otherwise the existing SSR `notFoundElement` 404. The SPA-prefix set is a manifest constant
   pinned by test.
5. **REQ-BND-5** — The shell doc SHALL be served only behind the session gate (absent ⇒ 302 `/login`),
   carry `docMetaFor`'s `<title>` for the requested path, the verbatim `themeBootScript()` IIFE
   (REQ-ISL-15), inline `themeCss()`, both favicons, viewport, `data-theme` (+`data-project` on
   `/p/:slug` paths), one mount node, a `<noscript>` floor, and the Vite entry as
   `<script type="module">` — every `<script>` nonce-stamped by the existing middleware (served as
   `text/html`; REQ-TST-5).
6. **REQ-BND-6** — A same-origin `GET /session` SHALL exist on the web host: absent session →
   `401 {error:"unauthenticated"}`; else the api `/session` payload verbatim (`{...principal, isTest}`).
   The SPA's session query consumes it; any BFF 401 ⇒ invalidate + `location.assign("/login")`,
   mirroring the SSR `onError` mapping.
7. **REQ-BND-7** — Public GETs keep the server-side `signedIn()` reverse gate (302 `/app`), including
   the `?audience=test` test-tenant bypass; `/app` keeps `?verified=1` mint + first-five-minutes
   precedence redirects server-side ahead of the shell branch.
8. **REQ-BND-8** — The SPA SHALL ship a client head manager reproducing `docMetaFor`'s title table
   (project-prefix, settings-section, `/v/:persona` rules); auth'd routes carry no description/OG —
   matching today. Public pages keep `renderDocument` head emission verbatim (N10 contract).
9. **REQ-BND-9** — Boundary crossings are document navigations: logout = `POST /logout` form → 302
   `/`; post-auth landing = full `/app[?entry&held&src]` load (no session carry — the cookie lands on
   the auth-callback response); Stripe/OAuth hand-offs are `{url}` payloads + `location.assign` with
   server-side allowlist validation (`form-action` does not govern script navigation — the MAINT.5
   enforcement moves into the BFF).
10. **REQ-BND-10** — The IndexedDB hold contract (`rhema-hold` store, `landing-dropzone` key, token,
    ≤10 MB + extension allowlist, `?hc=` server-confirmed consumption, Discard) SHALL be realized on
    both sides of the boundary per REQ-ISL-13: `landing.js` on SSR `/`; a React port inside the SPA
    for `/app/new` claim and the `data-held-consumed` marker on `/p/:slug` + `/p/:slug/v/:n`.
11. **REQ-BND-11** — Flag coexistence SHALL follow the fixed handler order: session gate →
    server-owned redirect logic → per-surface flag → shell ‖ `renderDocument`. Q-5 rollback is a
    config flip; flipped surfaces carry only the `<noscript>` floor (REQ-ISL-11 is honored by the
    flag-OFF state — full no-JS parity on a flipped surface is not possible and the spec must say so).
12. **REQ-BND-12** — One token/font pipeline: `themeCss()`/`ideCss()` and `/assets/fonts/:file` serve
    both document models unchanged; Vite emits under `/assets/` with hashed names on the immutable
    cache profile while unhashed island entries keep `no-cache`; `landing.js` (or its Vite equivalent)
    keeps `/`'s drop-zone hold capability until its in-SPA port exists.
