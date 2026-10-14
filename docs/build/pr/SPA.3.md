# SPA.3 — SPA shell document + dual-renderer markers + boundary split

Manifest row 100 · stacks on `stevevitali/spa-2-flag-plumbing` @ `e00f523` · merge policy
**OPERATOR** — do not merge from the build environment · **$0** spend, no deploys, no
production writes.

Implements `docs/tickets/100_SPA.3__shell-document-markers.md` per `docs/frontend-spa-spec.md`
§3.1/§4/§9, `docs/design/26_spa-public-auth-boundary.md` §shell-doc §catch-all, and
`docs/design/29_spa-migration-sequencing.md` §route-map + §flag-mechanism.

**Deployable dark:** additive-only — **no flag is set on any stage** (REQ-SEQ-5), so every route
still serves today's SSR byte-for-byte; the consult only wins where `spaSurfaces` is injected
(tests) or a preview stack sets `rhema:spaSurfaces`. The SSR fallback is never deleted.

## Requirement IDs

**REQ-BND-1 · REQ-BND-2 · REQ-BND-3 · REQ-BND-4 · REQ-BND-5 · REQ-BND-11 · REQ-BND-12 ·
REQ-SEQ-8 · REQ-INV-1 · REQ-INV-6 · REQ-INV-7 · REQ-FW-3 · REQ-FW-10 · REQ-TL-4 · REQ-TL-5 ·
REQ-TL-7 · REQ-TST-5 · REQ-ISL-11 · REQ-ISL-12**

## What lands

- **`@rhema/contracts` `spa.ts`** — `SPA_DOCUMENT_ROUTES` (the full authenticated document
  enumeration: `routeId` = the `$param` path pattern shared as `data-route` and the boot map's
  key; `surfaces` = the flag key(s) ANDed — the `/p/:p/import*` legs carry
  `["onboarding","ide-chrome"]`; `null` for server-owned redirect-only GETs; `pageMount` marks
  the Page family), `SPA_PUBLIC_ROUTES`, `SPA_PREFIXES`, and `spaRouteFor(path)` — anchored
  `$param` matching + the longest-prefix surface fallback for deep links.
  *(REQ-BND-4/11; design/29 route map applied verbatim)*
- **`apps/web` `render.tsx`** — every SSR document stamps `data-renderer="ssr"`,
  `data-route="<id>"`, `data-mounted` on `<html>` (REQ-SEQ-8); `docMetaFor`/`escapeHtml`
  exported for head parity.
- **`apps/web` `spa-shell.ts`** — `renderSpaShell`: SSR-parity head (charset, viewport, both
  favicons, `docMetaFor` title, theme boot script, theme + IDE stylesheets) +
  `data-renderer="spa"`, `data-device`, `data-project`, the `#spa-root` mount node, the honest
  `noscript` floor naming the app surface and linking the `?ssr=1` escape, the `data-spa-boot`
  JSON embed (principal's public fields + per-route `surfaces` map + theme/device — a runtime
  seed, not an authorization grant), and the Vite-manifest entry tags. `loadSpaManifest`
  degrades to a warn line + tagless shell — never a 500. `spaShellResponse` is the handler seam:
  any key's consult fails ⇒ `null` and today's SSR continues. *(REQ-BND-1/4/10/12, REQ-TL-4/5/7,
  REQ-INV-1/6/7)*
- **`apps/web` `server.ts`** — `deps.spa` consults wired into all 36 eligible authenticated
  document GETs at spec §4's fixed position (after session gate + server-owned redirects +
  forced-SSR checks; the Page family's consult sits inside `!isPhoneRequest && !row.showcase` —
  REQ-ED-12); `GET /session` same-origin probe (anonymous ⇒ 401; the api's payload verbatim;
  upstream down ⇒ a logged 502, never a forged principal); `GET /assets/spa/*` name-gated to
  `assets/<name>.<ext>` (traversal/dotdirs/`.map` refused by the name pattern, empty 404s,
  immutable cache); the catch-all splits on session × SPA-prefix — anonymous ⇒ `/login`, authed
  + flipped ⇒ the shell, everything else ⇒ today's SSR 404. *(REQ-BND-2/3/4/5/6/11, REQ-FW-10)*
- **`apps/web` `device.ts`** — `isPhoneRequest`/`deviceClassFor`, moved verbatim so the shell
  shares the one §10.1 verdict.
- **`apps/web` `copy.ts`** — `COPY.spaShell` (the noscript floor). *(REQ-ISL-11)*

## CSP + no-credentials floor

The shell flows through the existing nonce middleware — every `<script>` (theme boot, JSON
embed, module entry) carries the per-response nonce; `script-src 'self' 'nonce-…'` unchanged, no
`unsafe-eval`, no inline modulepreload polyfill (`modulePreload.polyfill: false` stands).
*(REQ-FW-3)* The boot payload carries no credentials, keys, or per-request secrets — markup and
bundle stay clean (REQ-ISL-12).

## Test evidence

- contracts `spa.test.ts` +8 (route-map pins, server-owned null-surface, prefix fallback,
  enumeration invariants) · web `spa-shell.test.ts` 29 (document contract, markers, catch-all
  session×flag×override matrix, `/session`, `/assets/spa/*` gating, CSP, manifest degrade,
  no-JS floor, precedence/forced-SSR ordering).
- Gate: `turbo build lint typecheck` 135/135 · full `pnpm test` green · frozen-lockfile clean
  (tallies in `runs/SPA.3.md`).
- CI: inherited `integration`/privsep red classified under GD-MAINT.4-1, not repaired.
