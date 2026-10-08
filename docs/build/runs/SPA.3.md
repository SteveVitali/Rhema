# SPA.3 — SPA shell document + dual-renderer markers + boundary split (run ledger)

- **Status:** DONE (Stage A; offline-only ticket — no deploy, no live legs owed)
- **Harness:** Devin CLI (agentic coding subagent); model: Cognition Devin; tier: n/a (build work)
- **Ticket:** `docs/tickets/100_SPA.3__shell-document-markers.md` (manifest row 100)
- **Branch:** `stevevitali/spa-3-shell-document`, stacked on
  `stevevitali/spa-2-flag-plumbing` @ `e00f523` (`OPERATOR` merge policy, **not merged**).
- **Goal:** the strangler's render half — `renderSpaShell` (head parity with the SSR document, the
  mount node, the honest no-JS floor, the `data-spa-boot` embed, Vite-manifest entry tags), the
  `data-renderer`/`data-route`/`data-mounted` settle vocabulary on every SSR document, the
  `deps.spa` consult wired into every eligible authenticated document GET at spec §4's fixed
  position, the catch-all's session×prefix split, the same-origin `GET /session` probe, and the
  name-gated `/assets/spa/*` static route. Deployable dark: flag-∅ still serves every route
  byte-for-byte SSR.
- **Spend:** $0. No deploys, no production writes.

## 0 — Context load

- DEFERRALS.md read first (per AGENTS): no `OPEN` row is unblocked by SPA.3 — the open rows are
  live-deploy legs, HUMAN prerequisites, or funded-window journeys; none is SPA-scoped or gated on
  the shell. No new row owed: every AC is deterministic-engineered (the deferred leg — a served
  shell under a real Vite build — is covered in-repo by the `spaAssetRoot` fixture dir).
- LEDGER CURRENT STATE read: `nextTicket: SPA.3`, `chainTip:` = `stevevitali/spa-2-flag-plumbing`
  (tip `e00f523`), `mergePolicy: OPERATOR`.
- Design sources applied, not re-derived: `docs/frontend-spa-spec.md` §3.1 (the shell doc), §4
  (the fixed handler order — session gate → server-owned redirects → forced-SSR capability checks
  → `deps.spa` → shell‖SSR), §9 (CSP); `docs/design/26_spa-public-auth-boundary.md` §shell-doc
  (the shape: title floor, theme boot, stylesheets, favicons, viewport, mount node, noscript,
  boot JSON, Vite entry tags) + §catch-all (session×prefix split) + F5/F6/F11;
  `docs/design/29_spa-migration-sequencing.md` §route-map (the normative path → surface table
  applied verbatim, `onboarding`'s import legs ANDed with `ide-chrome`) + F6;
  `docs/design/27` (the settle-marker contract — `data-mounted` flips client-side after first
  data paint, so the shell never stamps it).

## 1 — What landed

- **`packages/contracts/src/spa.ts`** (+~180) — the route vocabulary both renderers share:
  `SPA_DOCUMENT_ROUTES` (the full authenticated document enumeration — `routeId` is the TanStack
  `$param` path pattern AND the emitted `data-route` AND the boot map's key; `surfaces` the flag
  key(s) ANDed, `null` for the server-owned redirect-only GETs; `pageMount` marks the Page
  family for the phone/showcase forced-SSR mirror), `SPA_PUBLIC_ROUTES`, `SPA_PREFIXES`
  (design/26's prefix set), `spaRouteFor(path)` — anchored `$param`-pattern matching first, then
  the longest-prefix surface fallback for unknown deep links, `null` outside SPA space.
- **`apps/web/src/device.ts`** (new) — `isPhoneRequest` moved verbatim out of `server.ts` +
  `deviceClassFor` (`"phone"|"desktop"`) — the one §10.1 capability verdict, shared by the shell
  module without a server↔shell import cycle.
- **`apps/web/src/render.tsx`** — every SSR document now stamps the settle vocabulary on
  `<html>`: `data-renderer="ssr"`, `data-route="<resolved $param id, else the normalized path>"`,
  `data-mounted` (a served SSR document is complete — the marker lands statically; REQ-SEQ-8).
  `docMetaFor` + `escapeHtml` exported for the shell's head parity.
- **`apps/web/src/spa-shell.ts`** (new, ~290 LOC) — `renderSpaShell(c, {path, boot, entry})`:
  `<!doctype html>` + `lang/data-theme/data-device/data-renderer="spa"` (+`data-app-theme`,
  `data-paper`, `data-project` when known — the same stamping rules as SSR), charset + viewport +
  the `/favicon.svg` + `/favicon.ico` enumeration, `<title>` via `docMetaFor(path, {})` (the O2
  E-6 floor — title for the REQUESTED path, never a generic shell title), the shared theme boot
  script (nonce-stamped by the CSP middleware like every `<script>`), theme + IDE stylesheets,
  manifest `modulepreload`/stylesheet hints, `<div id="spa-root" data-spa-root>`, the honest
  `<noscript>` floor (`COPY.spaShell` — names the app surface + links the `?ssr=1` SSR escape
  merged into the CURRENT query), the `<script type="application/json" data-spa-boot>` embed
  (`<` → `\u003c` so a crafted field can't close the element), and the manifest module
  entry. `spaManifestEntry(unknown)` resolves the Vite manifest (entry chunk + transitive
  `imports` + `css`); `loadSpaManifest(root, warn)` degrades to an empty entry + ONE warn line —
  REQ-TL-7's log-and-serve posture, never a 500. `spaBootPayload` = the session principal's
  public fields + `{appTheme, paperTheme?}` + `deviceClass` + the per-route `surfaces` map
  resolved THROUGH `deps.spa` (memoized; `pageMount` rows mirror the phone forced-SSR) +
  `project.slug` for `/p/<slug>` paths. `spaShellResponse(c, deps, surfaces, session, opts?)` —
  the handler seam: EVERY surface key's consult must resolve or it returns `null` (the handler
  continues SSR); the consult re-checks the session itself so an override never hands an
  anonymous request the shell.
- **`apps/web/src/server.ts`** — `WebDeps.spaAssetRoot?: string` (the Vite out-dir; injectable
  for tests). `GET /session` — the same-origin probe (REQ-BND-6): no session ⇒ 401
  `unauthenticated`; the api's `/session` payload verbatim otherwise; a dropped upstream is a
  `logWebRouteError`'d 502 — never a forged principal. **`GET /assets/spa/*`** — serves ONLY
  `assets/<name>.<ext>` shapes (each segment starts `[\w]` — `..`, dotdirs, and `.map` files are
  refused by construction) with the extension→MIME map + `immutable` long-cache; a miss is an
  empty 404. **The catch-all split** (`app.all("*")`): GET under an SPA prefix with no session ⇒
  `/login` (a signed-out deep link never sees the shell nor the public 404); with a session the
  consult decides — flipped (or an honored override) ⇒ the shell (the client router owns the
  not-found), else today's SSR 404 byte-for-byte. **36 consult call sites** — every eligible
  authenticated document GET at spec §4's fixed position: after the session gate AND after the
  handler's server-owned redirects/precedence (`/app`'s first-five-minutes precedence, the
  `?qk`/`?confirmEmail` redirect legs, `/p/:slug`'s unread-run handoff) — and for the five
  Page-mounting editor routes the consult sits INSIDE `!isPhoneRequest(c) && row.showcase !==
  true` (REQ-ED-12/REQ-VFY-5: the flag never re-enables a mount the capability refused).
  Redirect-only GETs (`/settings`, `/app/settings`, `/app/usage/r/:id`, `/p/:p/edit/:d`,
  `/p/:p/f/:fid`), POSTs, `/api/*`, SSE, and binary endpoints are untouched.
- **`apps/web/src/copy.ts`** — `COPY.spaShell` (the noscript floor's two strings).

## 2 — Tests (every behavior fails if the code is removed)

- `packages/contracts/src/spa.test.ts` (+8, 17 total) — the normative design/29 route map pinned
  verbatim (36 cases); server-owned redirect GETs + public docs resolve `surfaces: null`;
  non-document endpoints outside SPA space entirely; the deep-link prefix fallback;
  trailing-slash normalization; every `SPA_PREFIXES` member resolves; enumeration invariants (no
  dupes, the `pageMount` set is exactly the five editor routes, AND-composites are only the
  import legs).
- `apps/web/src/spa-shell.test.ts` (29) — the document contract (charset/viewport/favicons/
  `docMetaFor` title; `data-renderer="spa"` + `data-device` + `data-project` + `data-app-theme`;
  **no `data-mounted`/`data-route` on the shell** — the client stamps those post-paint); mount
  node + noscript + `?ssr=1` escape merging the current query; `</`-escape in the boot embed;
  manifest entry/preload tags, never inline module code; empty-manifest degrade. The manifest
  parser: transitive imports + css + malformed ⇒ null. SSR markers on `/login`, `/`, a 404, and
  a `$param`-shaped 404. `GET /session`: 401 / verbatim principal / designed 502 with its one
  structured line. The catch-all matrix: anonymous SPA-prefix ⇒ `/login`; anonymous non-SPA ⇒
  public 404; authed flag-off ⇒ byte-identical SSR 404; authed flipped ⇒ the shell (with
  `data-project`); `?ssr=1` on a flipped prefix ⇒ SSR 404; the force-spa header under
  `SPA_OVERRIDES` serves the shell flag-off but NEVER past the session gate; non-GET verbs keep
  the SSR 404. The handler consult: a flipped surface serves the full shell (manifest tags
  nonce-stamped by CSP middleware; boot map `surfaces["/usage"]==="spa"` + others `"ssr"`;
  principal fields present; **no session material in markup**); flag-off ⇒ SSR byte-identical;
  `/app`'s precedence redirect still wins under a flipped `project-home`; the Page family's
  phone forced-SSR holds under a flipped `editor`; a missing manifest still serves the shell +
  the one warn line. `/assets/spa/*`: 200 + MIME + immutable; nested chunks; `.vite/` refused;
  `.map` refused; traversal/`%2f`/unknown-ext/missing all empty-404. CSP: `script-src 'self'
  'nonce-…'`, no `unsafe-eval`, every `<script` nonce'd.

## 3 — Verify

- `pnpm vitest run` scoped (contracts `spa.test.ts` + web `spa-shell.test.ts` + `server.test.ts`
  + `render.test.tsx`): **46 + 143 = green**; full `apps/web` suite **36 files / 522 pass**.
- `pnpm turbo build lint typecheck`: **135/135 tasks**.
- `pnpm test` (full suite): **453 files / 4,648 pass / 4 skip / 0 fail** (includes the ~230 s
  `privsep.docker` leg locally — green).
- `pnpm install --frozen-lockfile`: clean (no manifest changes).
- `check-build-memory.sh` + `check-append-only.mjs --base e00f523`: (recorded at closeout).

## 4 — Findings / deviations / CI

- **Owned decision (recorded, no ADR owed):** `data-route` ids are the `$param` path patterns
  (design/25's path-derived convention), emitted by `spaRouteFor` — the same string both
  renderers can agree on; SSR stamps `data-route` + `data-mounted` statically, the shell stamps
  `data-renderer="spa"` only (the client flips `data-mounted` and stamps `data-route` after first
  data paint — SPA.4 owns the client half; the probe contract `[data-route][data-mounted]`
  can't satisfy on a bare shell either way).
- **Owned decision:** the catch-all consults on `surfaces` alone (no `pageMount` guard) — the
  shell it may serve mounts only the client router's own not-found on a phone, never a Page;
  the `pageMount` forced-SSR mirror lives in the registered handlers + the boot map.
- **Deferrals:** none opened, none closed.
- **REQ ids stamped:** REQ-BND-1, REQ-BND-2, REQ-BND-3, REQ-BND-4, REQ-BND-5, REQ-BND-11,
  REQ-BND-12, REQ-SEQ-8, REQ-INV-1, REQ-INV-6, REQ-INV-7, REQ-FW-3, REQ-FW-10, REQ-TL-4,
  REQ-TL-5, REQ-TL-7, REQ-TST-5, REQ-ISL-11, REQ-ISL-12.
- **Out of scope held:** no surface components, no client routing (SPA.4+); no flag set anywhere
  (REQ-SEQ-5); public pages/redirects/mutations/SSE/binary unchanged; the SSR fallback never
  deleted.
- **CI:** `gh pr checks --watch=false` recorded at closeout (inherited `integration`/privsep red
  is classified under GD-MAINT.4-1, not repaired).
