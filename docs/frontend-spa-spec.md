# Rhēma — Frontend SPA Migration Specification

- **Status:** v1.0 — **canonical** · 2026-10-08 · **ratified by the operator** (Q-1…Q-7 register + Q-8…Q-14 §12.2 answers resolved). O2 adversarial review applied (Appendix E, 15 findings, no blockers); R20 reversed per operator ruling — Source mode revived as REQ-ED-17. Hand-off: `docs/decomposition-prompt.md` → `decompose-spec`.
- **Synthesized from:** the frontend-SPA research ledger (`docs/research-ledger.md`), the brief (`docs/frontend-spa-brief.md`), four research notes (`docs/research/01`–`04`) and ten design notes (`docs/design/20`–`29`). Binding inputs are the brief's ⚑ operator-fixed constraints and the ledger's §Q register (Q-1…Q-7, all ratified 2026-10-07).
- **Supersedes:** the nine SPA design notes on any point of disagreement (they are inputs; this spec is canonical). Amends ADR-007 and ADR-012 via **ADR-106** (§3.6); amends no product-spec `REQ-*` — this document adds its own families (§0.2) and references product requirements by id.

## 0. Front matter

### 0.1 How to read this document

One self-contained specification for the migration of `apps/web`'s authenticated surfaces from server-rendered HTML (Hono + server-only React + vanilla-TS islands) to a client-rendered React single-page application, while the public/marketing/login surfaces stay server-rendered. It states decisions, not options; rejected alternatives appear in single "Rejected:" lines. Sources are cited as `[design/22 §2]`, `[research/03 F4]`, `[ledger Q-5]` etc.

Four normative contracts are too long to restate and are **adopted by reference** — a ticket writer implementing them must open the named table/section and apply it verbatim:

1. **The route → surface-key map and flip order** — `docs/design/29_spa-migration-sequencing.md` §"route → surface key map" and §"flip order" (14 keys + `ide-chrome`; 14-step order).
2. **The BFF read-endpoint table** — `docs/design/22_spa-bff-api-shape.md` §2 (per-route endpoint, aggregate-vs-typed shape, seam composition, derivation placement).
3. **The editor parity checklist** — `docs/design/23_spa-editor-collab-binding.md` (the 29-row feature-parity enumeration the `editor` flip is gated against).
4. **The journey `data-*` hook inventory** — `docs/research/04_test-surface-audit.md` (the ~90 load-bearing selectors) — realized during the build as the committed `dom-contract.ts` manifest (REQ-VFY-2).

Everything else in the notes is superseded where this spec differs; where this spec is silent, the note's detail applies.

### 0.2 Requirement-ID convention

- Every requirement carries `REQ-<FAMILY>-<n>`, **append-only** — never renumber. The `req_id_pattern` for decomposition/validation is the ERE `REQ-[A-Z]+-[0-9]+`.
- Families emitted by this program's research (and their source notes): `INV` (census, research/01), `ISL` (island contracts, research/02), `DAT` (data audit, research/03), `TST` (test audit, research/04), `FW` (framework binding, design/20), `TL` (toolchain, design/21), `BFF` (BFF contract, design/22), `ED` (editor/collab, design/23), `UX` (design system, design/24), `NAV` (navigation/IA, design/25), `BND` (public/auth boundary, design/26), `VFY` (acceptance, design/27), `SAFE` (safety gates, design/28), `SEQ` (sequencing, design/29).
- These families are disjoint from the product spec's (`REQ-IDE-*`, `REQ-ARCH-*`, `REQ-GATE-*`, `REQ-BILL-*`, `REQ-SPEC-*`, …). Two worker-emitted namespaces were renamed at note-commit time to preserve that disjointness: B1's `REQ-ARCH-*` → `REQ-FW-*`, D2's `REQ-GATE-*` → `REQ-SAFE-*`.
- Acceptance-hook convention reserved: no source note supplied explicit **AC:** lines, so none appear here; `decompose-spec` writes at least one acceptance criterion per requirement.

### 0.3 Decision register summary

The binding operator decisions (Q-1…Q-7) are restated in Appendix B. The synthesis rulings that resolved inter-note conflicts or adopted a note's recommended disposition are:

| # | Question contested across notes | Ruling |
|---|---|---|
| R1 | `/bff/*` JSON-twin namespace vs `Accept`-negotiation on document paths (B3 OQ1) | **`/bff/*` twins for reads; `wantsJson` dual-mode on existing POSTs.** Negotiation would put three response classes behind each handler and entangle the surface flag with a format dimension; the `/edit/:draftId/doc` twin is the in-prod precedent. [design/22 §1] |
| R2 | `/p/:slug` flag assignment — `project-home` [design/27 gate table] vs `editor` [design/29 F2] | **`editor`.** `/p/:slug` mounts the working-head Page; it cannot flip before the Page port exists. `project-home` reduces to `/app` alone. [design/29 F2] |
| R3 | File-based vs code-based routing (B1 OQ2) | **File-based.** `@tanstack/router-plugin` `autoCodeSplitting` requires it and emits the typed `routeTree.gen.ts`; manual `.lazy()` discipline across ~45 routes is unenforceable. [design/21 F4] |
| R4 | `routeTree.gen.ts` committed vs generated pre-typecheck (B2 OQ2) | **Committed.** Keeps `tsc -p tsconfig.spa.json` a pure typecheck; the artifact diff is reviewable; precedent exists in `packages/protocols` committed generated source. |
| R5 | `vite dev` HMR server (B2 OQ1) | **Deferred.** Baseline dev loop is `vite build --watch` + watched server; HMR may be added later behind fail-closed `SPA_DEV_ORIGIN` (REQ-TL-8). Not phase-1 scope. |
| R6 | Sourcemaps in the Docker image (B2 OQ3) | **Strip in the builder stage.** `.map` files exist for the CI provenance scan (REQ-SAFE-2) but are never served and never ship in the image. |
| R7 | `?ssr=1` escape hatch scope and retention (B1 OQ3, D3 OQ3) | **Exists, honored on all stages, retained through the whole migration window** — zero cost while SSR exists; retires in post-last-flag cleanup (REQ-SEQ-4). |
| R8 | Per-request renderer override mechanism (needed to run REQ-VFY-8's two legs on one deployment) | **`x-rhema-renderer: ssr|spa` header + `?ssr=1` param.** Force-SSR honored everywhere; force-SPA only where `SPA_OVERRIDES=1` (non-prod, the `IDENTITY_HEADERS` precedent). Without it each flip costs two deploys. [design/29 F5] |
| R9 | `ide-chrome` as flag vs ordering-only (D3 OQ6) | **Real flag.** AND-gate on IDE-framed surfaces doubles as a one-line chrome-wide rollback. |
| R10 | Dev-stage flip inside the surface ticket vs separate PR (D3 OQ5) | **Inside the surface ticket.** Dev is the dogfood stage; the flip rides the same PR as `STAGES.dev.spaSurfaces += key`. Prod flips remain separate one-line PRs (REQ-SEQ-10). |
| R11 | External hand-off shape — `{url}` + `location.assign` vs a same-origin hop endpoint (B3 OQ2) | **`{url}`** validated server-side before serialization; the client navigates only envelope-supplied URLs. REQ-SAFE-6 is satisfied because the BFF validators are the enforcement — the literal-302-hop reading adds minted-URL state for no security gain. |
| R12 | Feed-label map ownership (B3 OQ3) | **Server-owned, shipped in aggregates + `GET /bff/feed-labels`.** Copy stays deploy-versioned server-side; client formatter stays fail-closed. |
| R13 | `/p/:slug` aggregate granularity (B3 OQ6) | **One aggregate** embedding the Page bootstrap `page` field — mirrors today's single composition; no waterfall. |
| R14 | `docJson` derivation location (flagged pre-research as an open call) | **Client-side.** `markdownToDoc` is DOM-free in `@rhema/editor`; BFF ships `EditorDocDto`, client derives PM JSON. [design/22 F14/F25, design/23 parity row 1] |
| R15 | RunSheetView display strings (B3 OQ5) | **Opaque pre-rendered strings** in the aggregate — parity, zero client copy logic; canonical vocab assembled server-side. |
| R16 | Dossier filtering — server-filtered rows vs client-ported pure filters (B3 OQ8) | **Client-port.** `filterFindings`/`applySeverityBudget` are pure functions; shipping raw findings + `rigor` gives instant filter navs. Moving pure logic into the bundle is lawful (REQ-SAFE-4 ships COPY anyway). |
| R17 | `/p/:slug/f/:fid` finding deep-link resolver (B3 OQ7) | **Defer.** Stays a server-canonical 302 (document boundary resolves before flag per REQ-BND-3/11); a JSON `resolveFinding` twin is post-migration cleanup, not spec scope. |
| R18 | `GET /session` shape (B3 OQ9) | **Principal-only relay.** Boot fields live in `data-spa-boot`; session stays a refetchable `["session"]` Query. |
| R19 | Slug→id cache (B3 OQ10) | **Request-scoped memo only.** Session-scoped `listProjects` + find once per request; no cross-request cache (authorization-safe by construction). |
| R20 | Dead-code dispositions (`editor.js`, `intent:"ro"`, `data-save-url`, stale `routes.tsx` manifest entries) | **Drop the dead code; revive Source mode as a designed feature** (operator ruling 2026-10-07). The orphaned artifacts (`editor.js`/`SourceEditor`/`sync-machine.ts`, `intent:"ro"`, `data-save-url`) have no live consumers and still retire with the migration set (REQ-ED-16) — the revival is a *rebuild*, not a rescue. Source mode returns as a real designed surface in the SPA editor (a CodeMirror-class source view bound to the same ProseMirror doc — see REQ-ED-17), scoped as its own ticket landing after the `editor` flip so it rides the migrated mount rather than the island. |
| R21 | Direct-PUT upload prerequisite (B3 OQ4) | **The first SPA surface performing browser-side uploads is gated on the infra change** (`connect-src` + GCS bucket CORS) — that is `voices` (zip-link via `linkVoiceExportZip`) at flip #4, earlier than the import legs (`/p/:p/import*` is IDE-framed and cannot flip before `ide-chrome` lands at #8; `/app/new` preview/create rides `onboarding` #5). A two-path interim upload is rejected — the infra delta is small and a dual upload path is false economy. [design/22 F10/F16] |
| R22 | Flag granularity — `import` under `onboarding`, `settings` as one key (D3 OQ1/OQ2) | **As designed.** 14 keys + `ide-chrome`; finer splits rejected — each extra flag is a second two-leg gate with no independent rollback value. |
| R23 | Boot-set staleness (D3 OQ4) | **Documented convergence, no probe.** Stale flag sets converge at the next document boundary; the tree registers every route day one (REQ-NAV-1). |
| R24 | Rebase checkpoint (D3 OQ7) | **One declared checkpoint at the foundations↔surfaces boundary** + per-surface replay if the chain lands mid-build (surface tickets are ~pure addition). [design/29 F10] |
| R25 | Bundle budgets (design/28 ceilings) | **Adopted as initial ceilings, calibrated on the first real build** — entry ≤250 kB gz, editor/collab lazy group ≤400 kB, CodeMirror ≤130 kB, other async ≤150 kB, total JS ≤800 kB, CSS ≤60 kB (REQ-SAFE-7). |
| R26 | React version | **Pin to the newest stable ≥7 days old at implementation time** (the staleness rule, same as the toolchain pins); React 19-era is expected. |
| R27 | SSR-mechanics probe re-spec scope | **Renderer-agnostic probes emitted by BOTH renderers** — SSR documents carry `data-route`/`data-renderer`/`data-mounted` statically so the same leg runs under flag-off and flag-on (design/29 F6). |

### 0.4 Table of contents

1. Goal and scope
2. Invariants carried forward (the ⚑ set)
3. Application architecture — framework and shell binding
4. The public / authenticated boundary
5. The BFF contract
6. The editor and collaboration surface
7. Navigation, URL state, and information architecture
8. UX and the design system
9. Safety gates: CSP, protocol containment, secrets, budgets
10. Verification and acceptance
11. Migration sequencing: flags, flips, rollback, chain interplay
12. Risks, departures, and open questions
13. Out of scope
- Appendix A — Requirement index
- Appendix B — Decision register (operator decisions Q-1…Q-7; synthesis rulings R1–R27)
- Appendix C — Research index
- Appendix D — Reserved strings and emitted-DOM vocabulary
- Appendix E — Review dispositions *(seeded empty; O2 fills it)*

---

## 1. Goal and scope

### 1.1 The goal, verbatim

Migrate `apps/web` from full-document SSR to a single React SPA for the authenticated application — client routing, no document refreshes inside the app, a markedly snappier and more polished UI/UX — while the public/marketing/login funnel stays server-rendered [brief; Q-1]. "Snappy" is made testable by the UX contract (§8): client-side transitions, intent prefetch, skeleton pending states, pending-vs-optimistic mutation classes, and a bundle budget.

### 1.2 What the migration is

- **Not a redesign.** Port + polish: the existing visual language (tokens, pane geometry, palette, severity colors, the paper-sheet metaphor) is preserved verbatim; interaction debt (hover/focus states, skeletons, skip-link, focus management) is fixed inside the port (Q-4; REQ-UX-16).
- **Not a new backend.** `apps/web` remains the same Hono process, the same session-cookie BFF, the same `DataSource` seam into `@rhema/api-client`. The work extracts JSON contracts for documents that today render HTML — no new service, no new trust boundary [design/22 F1].
- **Not a replacement of the islands toolchain.** The esbuild island pipeline stays (§3.7); the SPA is a *second* build artifact inside the existing `public/` generated-asset root.
- **A strangler migration.** Every authenticated document surface keeps serving SSR until its per-surface flag is flipped — identical markup modulo the new settle markers (`data-renderer`/`data-route`/`data-mounted`, which SSR documents gain statically per REQ-SEQ-8); journeys verify each flip on both renderers; rollback is a config flip (Q-5; §11).

### 1.3 Scale honesty

The A-stream measured the surface: ~181 route registrations collapse to ~120 route rows (~10 public documents, ~45 authenticated document GETs, ~90 transports/mutations/redirects); ~70 form-POST mutations map onto existing typed api calls; ~1,600 inline-style sites and ~6,300 lines of `pages.tsx`; five island bundles (~3,100 LOC) with the editor/collab island carrying the heaviest contract. The honest decomposition envelope is **~28 substantive tickets plus ~14 one-line prod-flip PRs ≈ 40 PRs** [design/29 F12]. This is the largest workstream in the repo's history by surface area; the strangler discipline exists precisely so none of it is irreversible mid-flight.

## 2. Invariants carried forward (the ⚑ set)

These are operator-fixed constraints restated as enforceable spec lines; every ticket inherits them.

- **⚑ I-1 — Process:** `mergePolicy: OPERATOR`; stacked PRs; build-memory conventions; append-only contracts and history. A run never merges its own PR; a gate is a pause.
- **⚑ I-2 — Acceptance:** JOURNEY.1 browser journeys remain the user-surface acceptance mechanism (REQ-SPEC-29). Component tests supplement; they never substitute.
- **⚑ I-3 — Gates:** canonical-vocabulary lint, `check:protocol-markers`, `check:no-cookies`, `check:licenses` continue to apply to everything that ships to browsers — and are *strengthened* for the bundled world (§9).
- **⚑ I-4 — CSP:** strict posture retained — `script-src 'self' 'nonce-…'`, no `unsafe-eval`, `connect-src 'self'` + the collab WSS origin (plus the GCS upload origin once a browser-side-upload surface flips — R21), `form-action` allowlists while SSR forms survive. MAINT.5's lesson is encoded: outbound hand-offs are validated server-side before the browser navigates (REQ-SAFE-6, REQ-BFF-27).
- **⚑ I-5 — Auth seam:** session cookies stay on `rhema.tools`; the ADR-040 web→api internal-stamp seam is preserved — every SPA call rides the same-origin BFF or an audited equivalent (REQ-DAT-7).
- **⚑ I-6 — Editor parity:** ProseMirror + Y.Doc + Hocuspocus collab survives at feature parity minimum — the 29-row checklist [design/23] is the gate.
- **⚑ I-7 — Copy discipline:** prohibited-claims and banned-vocabulary rules unchanged (REQ-EVAL-19); every SPA string is a leaf of the shared `COPY` table (REQ-SAFE-4).
- **⚑ I-8 — First paint:** public/SEO surfaces keep SSR; first paint is never knowingly regressed (Q-1; REQ-BND-1/12).
- **⚑ I-9 — Accessibility:** WCAG 2.2 AA, shipped today via journey-level axe, must not regress (REQ-VFY-6).
- **⚑ I-10 — No-JS floor:** the SSR fallback retains working forms; flipped SPA surfaces carry a `<noscript>` floor and this spec says so explicitly — full no-JS parity on a flipped surface is not possible (REQ-BND-11, honest departure).

## 3. Application architecture — framework and shell binding

**Decision (Q-2, Q-3):** TanStack Router + TanStack Query, bundled by Vite, mounted inside a Hono-served shell document. No second server framework. *Rejected:* React Router 7 framework mode and TanStack Start (both re-buy SSR/data capabilities Hono already owns — sessions, CSP, gates — and would fork the server); esbuild-only (cannot deliver code-splitting + the client-graph toolchain the SPA needs). [design/20 decision matrix; design/21]

### 3.1 The shell document

Every authenticated document GET serves either the SSR document or the SPA shell on the **same URL**, chosen by the server-side flag consult (REQ-FW-3, REQ-SEQ-1). The shell is produced by `renderSpaDocument` — a Hono-served `text/html` string template that carries the same `<head>` contract as SSR documents: `themeCss()`/`ideCss()` stylesheets, the nonce'd pre-paint `themeBootScript`, `docMetaFor`'s `<title>` for the requested path, favicons, viewport meta, `data-theme` (+`data-device` + `data-project` on project paths), one mount node, `<noscript>` floor, `data-renderer="spa"`, the `data-spa-boot` JSON embed, and the Vite entry tags resolved from `public/spa/.vite/manifest.json` (REQ-BND-5, REQ-TL-4). Served only through the nonce-stamping middleware — every `<script>` carries the per-request nonce; a missing/corrupt manifest degrades to a shell without script tags + one structured log line, never a 500 (the islands' empty-404 convention).

### 3.2 The route tree

File-based routes under `src/spa/routes/` mirroring `routes.tsx` paths verbatim for the authenticated subset (REQ-FW-4, REQ-NAV-1); redirect-only aliases stay server-side 302s and are never client routes (REQ-BND-3). One `beforeLoad` at the auth'd tree root is the auth boundary — session absent → `/login` document navigation; any BFF 401 produces the same outcome (REQ-FW-5). Lifecycle maps onto the existing guard/loader behavior: `validateSearch` (the ~60-key flash grammar, REQ-NAV-3) → serial `beforeLoad` → parallel `loader` (Query `ensureQueryData`) → pending → component → error boundary (REQ-FW-7).

### 3.3 Data transport

One client module (`bffFetch`) carries all JSON traffic: `credentials:"same-origin"`, `accept: application/json`, non-2xx → `BffError{status,code,detail,requestId}` with `requestId` read from the `x-rhema-request-id` *response* header (REQ-FW-6, REQ-BFF-28). DTO types arrive via `import type` from `@rhema/api-client` — erased by `verbatimModuleSyntax`; `createApiClient`/`DataSource` never enter the bundle (REQ-FW-9). Non-JSON transports unchanged: SSE `EventSource` with `?after`/`Last-Event-ID`, the external collab WSS upgrade, binary downloads as navigations, presigned PUTs, `sendBeacon` sinks (REQ-FW-8, REQ-BFF-12/13/14/16/17).

### 3.4 Runtime configuration

No `VITE_*` secrets, no `import.meta.env` outside a single `env.ts`; runtime config rides the shell's `data-spa-boot` JSON: `{principal, theme:{appTheme,paperTheme?}, deviceClass, surfaces:Record<routeId,"spa"|"ssr">, project?:{slug}}` — a seed, never an authorization grant (REQ-SAFE-8, REQ-BFF-18/19).

### 3.5 Toolchain

`apps/web/vite.config.ts` scoped to `@rhema/web` — `publicDir:false`, `outDir:"public/spa"`, `manifest:true`, `sourcemap:"hidden"`, `modulePreload.polyfill:false`, `@tanstack/router-plugin` (`autoCodeSplitting`) registered before `@vitejs/plugin-react` (REQ-TL-1..7, REQ-TL-9). Build order `tsc -b && node build-client.mjs && vite build`; `turbo.json` outputs gain `public/**`; sibling `tsconfig.spa.json` (`jsx:"react-jsx"`, `types:["vite/client"]`); pins are newest-versions-≥7-days-old (as of research: vite `~8.3.1`, plugin-react `~6.1.1`, router-plugin `1.168.41` + react-router `1.170.40`, react-query `^5.104.x`); root `engines` floor rises to `>=20.19` (REQ-TL-10/11). Route-config code never imports the editor/collab graph — enforced by the entry budget (REQ-TL-9, REQ-SAFE-7). Assets serve through a name-gated `GET /assets/spa/*` route with immutable caching; islands keep `no-cache` (REQ-TL-5, REQ-BND-12). Dev loop baseline: `vite build --watch` + watched server — no HMR, no CSP delta (REQ-TL-8; HMR deferred per R5).

### 3.6 ADR-106

ADR-007 ("no Vite") and ADR-012 are amended by a new ADR-106 per the append-only convention: *reason — the authenticated application shell requires a real client toolchain (code-splitting, typed route codegen, hashed assets); the public SSR posture and the esbuild island pipeline are unchanged.* The ADR-106 draft lives in [design/20 F12]; the first foundation ticket lands it.

### 3.7 Island coexistence

`build-client.mjs` is unchanged (REQ-TL-12): the iife/unhashed/fail-inert island contract is load-bearing, `landing.js` serves the public `/` drop-zone permanently, and flagged-off surfaces keep working islands throughout the migration. Auth'd islands retire per-surface as flags flip and are deleted in the post-last-flag cleanup wave (§11.6).

## 4. The public / authenticated boundary

The definitive split [design/26; REQ-BND-1..12]:

- **Forever SSR:** `/`, `/invite`, `/pricing`, `/pricing/rates`, `/signup`, `/login`, `/logout`, `/showcase`, `/api/auth/*`, the `/a/{dwell,landing,acq}` beacons, `/favicon.*`, assets, `/healthz` — the REQ-INV-6 enumeration is the cited contract (REQ-BND-1). Public GETs keep the `signedIn()` reverse-gate and the `?audience=test` bypass (REQ-BND-7).
- **SPA-eligible (behind per-surface flags):** the ~45 authenticated document GETs per the normative route→key map [design/29 §route-map].
- **Never routes:** redirect-only GETs, all POST/SSE/binary/beacon/proxy registrations — server-owned at every flag state (REQ-BND-3).
- **The catch-all** splits on GET + session-present + SPA-prefix (manifest constant, pinned by test) → shell; otherwise the existing 404 (REQ-BND-4).
- **`GET /session`** same-origin: `401 {error:"unauthenticated"}` absent; api payload verbatim when present (REQ-BND-6, REQ-BFF-18).
- **`/logout`** stays a native form POST document boundary; Stripe/Google hand-offs are `{url}` + `location.assign` against server-validated targets (REQ-BND-9).
- **The IndexedDB hold contract** (`rhema-hold`, ≤10 MB, extension allowlist, `?hc=` confirmation, `data-held-consumed`) is realized on both sides of the boundary (REQ-BND-10, REQ-ISL-13).
- **Fixed handler order** on every authenticated document GET: session gate → `?verified=1` mint → `/app` showcase/held-file precedence → `/p/:slug` unread handoff → phone/showcase forced-SSR override → **renderer override** (`?ssr=1`/`x-rhema-renderer`, applied inside `deps.spa(c, surface)` per REQ-SEQ-4) → flag membership → shell-or-SSR (REQ-BND-11, REQ-BFF-20, REQ-SEQ-1). Nothing in this chain moves client-side.

## 5. The BFF contract

`apps/web` is already a BFF; this section extracts the wire contract [design/22 — adopted sections §1–§9]:

- **Reads:** `GET /bff/<surface-path>` JSON twins per the normative endpoint table [design/22 §2] — one aggregate per composite surface (≥3 seams), typed fan-out for single reads, raw api-client DTOs + server-owned maps in payloads, degrade semantics preserved (`null` + `noteDegradedUpstream`) (REQ-BFF-1/8/9, REQ-DAT-1/4/12).
- **Mutations:** existing POST paths gain a `wantsJson` branch — structured JSON bodies in (`GateStructuredEdits`, never the `ed.*` flat grammar), `{ok,redirect?,flash?,data?,pending?,url?}` out; `redirect` carries the identical flash-parameterized URL the 302 would have carried, preserving the journey-pinned vocabulary verbatim (REQ-BFF-2/3, REQ-DAT-3, REQ-INV-3).
- **Errors:** `{error:"<stable_code>", detail?}` at the preserved upstream status — every `ApiError.code` passes through unrenamed; 422s verbatim; JSON callers never get a redirect (REQ-BFF-4, REQ-DAT-2/10). Refusals are data (inline re-render on the owning surface); stale-state 400/404/409s mean "re-read" — the client invalidates the owning Query keys (REQ-BFF-5/6).
- **Mutation classes:** spend-adjacent and workflow-state-changing actions are pending-only, never optimistic; UI-preference writes may be optimistic with rollback; the enumeration is normative (REQ-BFF-7, REQ-UX-4).
- **Slug→id once per request** — request-scoped memoized `listProjects` + find in context; internal re-resolutions (`getDossier`, `getTimeline`, `projectIdFor`) consume the memo (REQ-BFF-11, REQ-DAT-6).
- **Polls as data:** every meta-refresh becomes a `refetchInterval`/pending-payload loop at the same cadence — `{pending, pollAfterSeconds}` keeps cadence server-owned (REQ-BFF-15, REQ-DAT-14).
- **Two new POST endpoints for one-shot side effects** (in addition to the presign and estimate endpoints above): `POST /bff/settings/account/confirm-email {token}` and `POST /bff/p/:slug/handoff` (POST, so the mark-read never rides a prefetched GET) (REQ-BFF-21/22).
- **Typed-seam promotion:** the `DataSource`'s raw-fetch seams (`checkSession`, `getRunEvents`, `streamRunEvents`, `presignImportUpload`) become first-class typed `@rhema/api-client` members — the BFF stops bypassing the client for them (REQ-DAT-13).
- **Run sheet:** the `p.run` aggregate ships `sheet: RunSheetView` verbatim (`recompute` matrix, `idempotencyKey`, `entitlementId`, `paymentLinkUrl`, opaque display strings — R15); `POST /bff/p/:slug/estimate` exists for revalidation; `surfaceEstimate`/`buildLeverMatrix` never enter the bundle (REQ-BFF-23).
- **Uploads:** `POST /bff/import/presign` → browser PUTs bytes directly to the signed URL echoing `requiredHeaders`; the BFF never proxies bytes; gated on the `connect-src` + bucket-CORS prerequisite (REQ-BFF-16, REQ-DAT-9, R21).
- **Derivation placement (R12–R16):** `toProjectRowView`/groupings/feed formatting/`markdownToDoc` port client-side (pure COPY/DTO maps — lawful because COPY ships per REQ-SAFE-4); `buildRunSheetView`/`surfaceEstimate`/`feedLabelMaps` stay server-side (REQ-BFF-24/25/26, REQ-DAT-5).
- **Observability:** `bffFetch` reads `x-rhema-request-id` off every response and surfaces "reference `<id>`" on 5xx; the browser never sends the header; server-side `routeErrorLine`/`degraded_reads` lines persist verbatim (REQ-BFF-28/29).

## 6. The editor and collaboration surface

The heaviest contract — feature parity is the floor, not the ceiling (⚑ I-6):

- **Binding:** hand-rolled `useRef`+`useEffect` mount — the `EditorView` lives outside React state; React never re-renders the PM surface (REQ-ED-1/2). *Rejected:* `@handlewithcare/react-prosemirror` (re-implements prosemirror-view in React — violates the mount invariants) and TipTap (wrong editor core; `markdownToDoc`/`acceptProposalTr`/`ORIGIN_META` are ProseMirror-shaped).
- **Session identity:** module-scope `PageSessionRegistry` keyed `draft:<draftId>` — acquire/release refcounting, idle-destroy TTL, `rekey` on rebind; holds `CollabSession` + `EditorState` so unmount/remount preserves doc, undo stack, plugin state (StrictMode-safe). The keep-alive key REQ-NAV-6 names `(projectId, draftId)` is equivalent — draft ids are globally unique; `draft:<id>` is the canonical form (REQ-ED-4, REQ-NAV-6).
- **Wire protocol verbatim:** `collab.ts` ports as a framework-free module — `draft:<id>` doc naming, `rhema-page/draft:<id>` IDB, cookie-auth upgrade, `rhema.*` vocabulary (`provenance`, `restore`, `fork`, `readonly`, `restore_point`, `frozen_fork`), rebind-keeps-Y.Doc (REQ-ED-3, REQ-ISL-4, REQ-BFF-13).
- **Autosave:** the four layers preserved — bound Y.Doc → IndexedDB → collab WS → debounced server materialization; route-leave is a pagehide-equivalent flush at refcount 0; no `beforeunload`, no Save verb except ⌘S (REQ-ED-5, REQ-ISL-2/3).
- **Semantics kept:** provenance origins (`human`/`pasted`/agent via `ORIGIN_META`), agent transactions out of the human undo stack (`yUndoPlugin` scoping, `acceptProposalTr`), decorations as plugin sidecar fed by transaction meta, exactly one `markRestorePoint` path per ⌘S, the 10 s visible-only `/doc` lock poll (REQ-ED-7..11, REQ-ISL-7).
- **Forced-SSR posture unchanged:** phone/showcase keeps the server-decided read-only Page — `data-readonly="1"`, empty `data-collab-url`, no `contenteditable`, no version rail; the SPA cannot enable collab by asking (REQ-ED-12, REQ-VFY-5).
- **Page flips last** in the strangler order — `editor` is the 14th flag and absorbs `/p/:slug` (REQ-ED-13, R2).
- **Emission parity:** the 29-row checklist [design/23] is the `editor` flip's gate; `data-page-root`/`data-page-mount`/`data-page-host`/`data-readonly`/`data-collab-url`/`data-page-view`/`data-page-preview` emit verbatim in both modes (REQ-ED-6); `<PmPreview>` is both the no-JS floor and the SPA pending paint (REQ-ED-14).
- **Dead code ships its own disposition:** `data-save-url` removed, `intent:"ro"`/`editor.js`/`SourceEditor`/`sync-machine.ts` retired with the migration PR set (REQ-ED-16, R20). Per the operator's ruling, Source mode is a live product intent: **REQ-ED-17 — Source-mode revival** — a real designed source view (CodeMirror-class, bound to the same ProseMirror doc and collab session) ships as its own ticket after the `editor` flip; it is a rebuild on the SPA mount, not a port of the dead island.
- **Other islands port smaller:** `ide.ts` (feed, palette, keymap, panes) → layout-owned React under `p.$project`; `outline.ts` → Query mutations + `refetchInterval`; the §5.12 keymap ports verbatim with focus-zone scoping; island bootstraps become loader data + typed bootstrap DTOs — no `script[type=json]` embeds in SPA mode (REQ-ISL-1/6/8/9/10/16, REQ-NAV-6/8).

## 7. Navigation, URL state, and information architecture

[design/25 — adopted route tree §"normative route tree" and search-param schema]:

- The SPA router owns exactly the authenticated document set; path params type-validated (`$v` ∈ `"working"|positive-int`, ids opaque); every SSR-consumed flash/search param declared in `validateSearch` (REQ-NAV-1/2/3, REQ-FW-11).
- **Deep links never break:** every census GET path resolves in the tree or through a maintained server redirect; conditional landings (`/app` precedence, `/p/:slug` unread handoff) stay server-side on the document request (REQ-NAV-4/5, REQ-BFF-20).
- **Settle contract:** every route root emits `data-route="<id>"` + `data-mounted` on first data paint — on **both** renderers (SSR emits statically) so one probe set runs under either flag (REQ-VFY-3, REQ-SEQ-8, R27).
- **Boundary rule:** intra-tree → `router.navigate`; SSR-owned paths, `/logout`, external hand-offs, binaries → document navigations; unflipped strangler targets hand off via `SsrHandoff`→`location.assign` driven by the boot flag map (REQ-NAV-9, REQ-BND-9).
- **History semantics:** mutation outcomes push (POST→302 parity — Back returns to the pre-form page); apply-then-strip and self-polls `replace` (REQ-NAV-11).
- **Client state:** localStorage/IDB schemas byte-identical across modes (theme, panes, `rhema:authorship:v1:*`, `rhema-hold`, `rhema-page/draft:*`); `scrollRestoration` on; hash anchors focus their target; every client navigation updates `document.title` via the head manager reproducing `docMetaFor`'s table (REQ-NAV-6/7, REQ-BND-8, REQ-UX-7).
- **404s:** `notFoundMode:"fuzzy"` + per-surface `notFoundComponent`s; the server catch-all stays for out-of-tree paths (REQ-NAV-10).

## 8. UX and the design system

[design/24]:

- **The system carries verbatim:** generated-CSS-over-tokens (`themeCss()`/`ideCss()`), the `.ide-*`/`.paper`/`.rm-*` class vocabulary, the ~90 `data-*` hooks, pane geometry, palette, severity colors, the sheet metaphor (REQ-UX-5/6/13). *Rejected:* Tailwind, CSS-in-JS, CSS Modules — each is a second system; the tokens are already the system.
- **The snappy contract:** no document reloads inside the app; intent prefetch on primary nav targets; every surface declares a skeleton pending render (existing `ide-sk-row`/`ShellSkeleton` primitives — routed for the first time); mutations pending-in-place or optimistic per the §5 spend boundary (REQ-UX-1/2/3/4).
- **Polish budget (Q-4):** hover/focus states on interactive controls, skip-link ahead of the Rail, overlay focus-return, the deferred `?theme` papers — all inside the port, no redesign ticket (REQ-UX-16).
- **Accessibility floor (⚑ I-9):** WCAG 2.2 AA — title updates on every nav; focus to the surface heading or polite announcer; live-region vocabulary preserved verbatim (sync pill, feed/chat/triage polite, spend gates assertive); reduced-motion enforced; the editor surface never auto-focused (REQ-UX-7/9).
- **Phone capability is a mount-time contract:** `data-device` stamped server-side (`isPhoneRequest` → boot `deviceClass`); desktop-only subtrees never enter the DOM — CSS hiding is a contract violation; narrow desktop keeps desktop capability (REQ-UX-10, REQ-VFY-5, REQ-DAT-11).
- **Keymap** ports verbatim — `dispatchIdeKey`, focus-zone scoping, ⌘S single-owner (REQ-UX-8, REQ-NAV-8, REQ-ISL-8).
- **Copy** stays centrally owned — `@rhema/ui` text-agnostic, SPA strings from the `COPY` table; feed/pill/notice label maps are server-built data (REQ-UX-12, REQ-SAFE-4, R12).
- **Live-state convergence:** the feed is ONE project-scoped layout-owned SSE subscription; polls become `refetchInterval` (REQ-UX-15, REQ-BFF-12/15); interaction invariants hold — Cancel-run is the only blocking modal (REQ-UX-14).

## 9. Safety gates: CSP, protocol containment, secrets, budgets

[design/28 — the audit found the current protocol-marker gate **vacuous twice over**: it scans directories that never exist at CI time AND no sentinels are planted in `packages/protocols` at all. Fixing it is load-bearing, not optional.]

- **Three-layer protocol containment (REQ-SAFE-1/2):** (a) `no-restricted-imports` bans `@rhema/protocols`/`@rhema/evals` in SPA source; (b) the marker scan gains `.map` `sources[]` provenance — fails on any path under `packages/protocols/`, `packages/evals/`, `apps/run-task/`; (c) sentinel constants planted in protocol sources so the text scan retains meaning post-minification. `check:protocol-markers` gains `apps/web/public` in TARGET_DIRS, declares REQUIRED_DIRS that fail closed when absent, and the `public-safe` job builds `@rhema/web` first (REQ-TST-3).
- **no-cookies extended (REQ-SAFE-3, REQ-TST-4):** TARGETS gain the SPA source root; the form-field rule becomes brace-aware (`name={…}`); credential-named JSX props covered.
- **Copy containment (REQ-SAFE-4):** every SPA string is a `COPY` leaf; `collectCopyStrings` stays exportable; launch-surface audit sweeps SPA sources; unapproved inline JSX text flagged.
- **CSP unchanged by construction (REQ-SAFE-5, REQ-TL-7):** shell through the nonce middleware; no inline polyfills; no `unsafe-eval`; `form-action` stays until the last SSR form dies; `connect-src` gains the GCS upload origin only when the import surface flips (R21).
- **External navigation enforcement moves into the BFF (REQ-SAFE-6, R11):** `form-action` never governed JS navigations (`navigate-to` never shipped); the `STRIPE_HOSTED_ORIGINS`/`GOOGLE_OAUTH_ORIGINS` validators are the sole enforcement — `{url}` envelope values are validated before serialization and coverage is pinned by test (REQ-BFF-27). *Recorded amendment:* R11 supersedes REQ-SAFE-6's mechanism clause — "except through those [302] endpoints" reads as "`{url}` validated before serialization + client `location.assign`"; the literal same-origin hop endpoint (a minted-URL store) is rejected as state without security gain.
- **Secrets tripwire (REQ-SAFE-8):** single `env.ts` reader of `import.meta.env`; `VITE_*` secret-pattern names fail `check:spa-env`; built bundles scanned for server env-var names.
- **Bundle budget (REQ-SAFE-7, R25):** committed `bundle-budget.json` + `check-bundle-budget.mjs` in `public-safe`, gzip-measured against the §0.3-R25 ceilings, calibrated on the first real build.
- **CI order (REQ-SAFE-9):** `public-safe` becomes install → stub build → SPA build → gitleaks → licenses → markers+provenance → no-cookies → bundle-budget → spa-env.
- **Same-PR atomicity (REQ-SAFE-10):** `outDir`/`publicDir`, lint ignores, TARGET_DIRS, and Dockerfile COPY move together; `pnpm.onlyBuiltDependencies` re-verified at first install against Rolldown natives (REQ-TL-10).

## 10. Verification and acceptance

[design/27; research/04]:

- **Component-test stack (REQ-VFY-1):** Vitest + happy-dom + `@testing-library/react@^16` + `dom`/`user-event`/`jest-dom` (jsdom sanctioned fallback). *Rejected:* playwright-ct — the experimental packages were removed upstream; the replacement mount story is unsettled.
- **The emitted-DOM contract (REQ-VFY-2, REQ-TST-2):** committed `apps/web/src/dom-contract.ts` manifest keyed by surface — every load-bearing `data-*`/role selector incl. prefix families (`ed.*`, `data-label-*`, `data-fmt`); `check:dom-contract` lints journey selector literals against it; per-surface component tests assert emission; selector renames ship codemod+manifest in one PR covering **both** renderers.
- **Renderer identity (REQ-VFY-7):** `data-renderer="ssr|spa"` on every document `apps/web` serves; journey CLI gains `--expect-renderer` + `--surface` backed by a `SURFACE_GATES` table.
- **Per-flip gate (REQ-VFY-8, REQ-SEQ-7):** on one flagged preview deployment — leg A (`x-rhema-renderer: ssr` + `--expect-renderer ssr`: the fallback proves unchanged), leg B (flag on, `--expect-renderer spa`), leg C (full `paid:false` suite), then a rollback drill. Per-flip legs are `$0`-only — no paid steps, ever (REQ-VFY-10).
- **Two coverage debts owed before their flips (REQ-VFY-10):** a delivered run-report render step (off seeded/own-tenant fixtures) gating the `run-report` flip; seeded-dossier mutation sub-steps (T12/T13 write coverage) gating the `dossier` flip.
- **SSR-mechanics re-spec (REQ-VFY-4, REQ-TST-7):** meta-refresh → pending markers + client poll; `var R=` → typed estimate DTO; `form[action]` waits → manifest hooks; reloads → remount asserts. Probes assert hooks + settle markers, never SSR internals — so leg A stays meaningful (R27).
- **Test disposition (REQ-VFY-9, REQ-TST-1/6):** HTML-string suites replaced per the class map (render → RTL; status/forward → BFF API tests; form-POST → mutation tests; pure logic → port); SSR test files retained green until the last flag falls — they are the fallback's safety net.
- **a11y (REQ-VFY-6, REQ-TST-10):** journey-level axe remains the authoritative WCAG 2.2 AA gate; component-axe required on the interactive-component manifest subset; pixel-diff deferred (per-step PNGs remain evidence).
- **Asset parity (REQ-TL-13, REQ-TST-8):** journeys' bundle-parity regex covers `/assets/spa/**`; `asset-parity.test.ts` gains a manifest leg — every manifest artifact answers its URL.
- **Titles (REQ-TST-9):** the client head manager's `docMetaFor` parity is asserted (component test + journey probe).

## 11. Migration sequencing: flags, flips, rollback, chain interplay

[design/29 — the flag mechanism, route map, flip order, per-flip runbook, and coexistence contract are normative and adopted by reference]:

- **The flag (REQ-SEQ-1..3):** `SPA_SURFACES` CSV → `parseSpaSurfaces` (fail-closed to ∅, the `signupMode` precedent end-to-end) → `WebDeps.spaSurfaces` → `deps.spa(c, surface)` inside the fixed handler order → `StageConfig.spaSurfaces` fact → `SPA_SURFACES` env on web → `rhema:spaSurfaces` Pulumi stack config for previews. `SPA_OVERRIDES=1` on non-prod only.
- **Override mechanics (REQ-SEQ-4, R7/R8):** `?ssr=1` + `x-rhema-renderer: ssr` honored on all stages during the window; `x-rhema-renderer: spa`/`?renderer=spa` only where `SPA_OVERRIDES=1`; overrides never bypass the session gate, server redirects, or forced-SSR checks.
- **Foundation gate (REQ-SEQ-5):** no flag on any stage until the eight-workstream foundation set lands — toolchain, shell + flag plumbing, dual-renderer markers, router skeleton + `GET /session` + `bffFetch` + `SsrHandoff`, journey harness (`--expect-renderer`/`--surface`/`SURFACE_GATES`/settle helpers/P1+X1 splits), dom-contract manifest + RTL stack, public-safe delta, `ide-chrome` layout.
- **Flip order (REQ-SEQ-6):** usage → inbox → settings → voices → onboarding → project-home → billing → export(+ide-chrome) → outline → figures → run-sheet → dossier → run-report → **editor last** (fixed, REQ-ED-13). Per-position rationale is normative [design/29 §flip-order] so reorderings are conscious decisions.
- **Surface ticket shape (REQ-SEQ-9):** BFF reads + JSON mutations + ported components emitting the manifest vocabulary + component tests/axe + retained SSR tests + journey re-specs + `SURFACE_GATES` entry + preview two-leg + rollback drill evidence + the dev stage-fact line. Never contains: the prod flip, SSR deletions, api/schema changes.
- **Prod flip (REQ-SEQ-10):** separate minimal PR touching only `STAGES.prod.spaSurfaces`, operator-merged, `pulumi up`-deployed; ≥ one nightly green before the next surface's prod flip; rollback = revert + redeploy.
- **Rollback envelope (REQ-SEQ-11/12, design/29 F8/F11):** covers document serving only — standing invariants are SSR-never-deleted-mid-migration, additive-only shared files, verbatim localStorage/IDB schemas, manifest-vocabulary parity on both renderers. A live-session rollback degrades at the next document boundary.
- **Chain interplay (Q-7, design/29 F10):** stacks on the current tip; additive-only; one declared rebase checkpoint at foundations↔surfaces; the two standing CI reds are inherited without in-branch fixes.
- **Nightly invariant:** the nightly journey run never flips flags; the `data-renderer` markers keep it mode-correct by construction (design/29 F9).

## 12. Risks, departures, and open questions

### 12.1 Risks

- **Scale:** ~40 PRs is the honest envelope [design/29 F12]; the strangler posture means the *worst case at any point* is a config flip, not a failed cutover.
- **The protocol-marker gate was vacuous.** Discovered during research (A4/D2): the scan's target dirs don't exist in CI and no sentinels exist to find. This build fixes it *and* depended on the discovery happening before SPA output existed — had the migration proceeded without it, the new bundle would have shipped through a gate that checks nothing. The fix is in the foundation set, not bolted on.
- **First-install unknowns:** Rolldown native bindings vs `pnpm.onlyBuiltDependencies`, plugin peer-range verification — resolved at the first `pnpm install` (REQ-TL-10).
- **Two journey coverage gaps** are pre-conditions, not afterthoughts (REQ-VFY-10).
- **Bundle-weight risk** concentrates in the editor/collab lazy group; the eager-import ban (REQ-TL-9) + budget gate (REQ-SAFE-7) are the enforcement pair.
- **The `?verified=1`/`?hc=`/`?focus=1` one-shot params** are easy to lose on client navs — the pre-shell precedence order (REQ-BFF-20) and the handoff/confirm-email endpoints (REQ-BFF-21/22) exist precisely to cover them.

### 12.2 Open questions for operator ratification (O3)

These were raised by the research notes and are operator-level or benefit from operator confirmation; rulings above mark where synthesis adopted a recommendation that the operator may still reverse:

All seven answered by the operator 2026-10-07 (interactive ratification session):

1. **R20 — Source-mode disposition → REVIVED as a designed feature.** The operator ruled Source mode a live product intent: the dead artifacts still drop (they have no consumers — REQ-ED-16) but the feature gets a real designed rebuild as its own ticket after the `editor` flip (REQ-ED-17). R20 updated accordingly.
2. **R21 — upload gating → CONFIRMED.** Gate on the `connect-src` + GCS bucket-CORS infra change; earliest binding surface is `voices` (flip #4). No server-transit interim path.
3. **R8/R7 — override surface area → CONFIRMED.** `?ssr=1`/`x-rhema-renderer` stay honored on prod for the entire migration window; removed at final cleanup.
4. **R24 — rebase checkpoint → CONFIRMED.** One declared checkpoint at the foundations↔surfaces boundary; per-surface replay if the 45-PR chain lands mid-build.
5. **R9 — `ide-chrome` composite → CONFIRMED as a real flag.** AND-gated with each IDE surface flag; one-line chrome-wide rollback.
6. **R25 — bundle ceilings → CONFIRMED as a hard CI gate from the start.** Values calibrated and ratified in the toolchain ticket's PR.
7. **R22 — flag granularity → CONFIRMED.** The 14-key vocabulary is final: `usage`, `inbox`, `settings` (one flip across sub-pages), `voices`, `onboarding` (carries import), `project-home`, `billing`, `export`, `outline`, `figures`, `run-sheet`, `dossier`, `run-report`, `editor` — plus the `ide-chrome` composite.

### 12.3 Departures recorded honestly

- **No-JS floor narrows on flipped surfaces** (REQ-BND-11): the SSR fallback retains the full no-JS posture; a flipped surface serves `<noscript>` only. This is inherent to an SPA and accepted as the strangler's interim state — it resolves back to full no-JS only if a surface's flag never flips or a rollback engages.
- **`/p/:slug` cannot be reached early** (R2): the Page mount forces it into the last flag — project home rides the editor's schedule.
- **SSR test retirement is delayed by design** (REQ-TST-1): ~300 HTML-string tests carry forward as the fallback's net until the last flag; the suite's tail shrinks only in cleanup.
- **SSR surfaces keep meta-refresh** where today they use it; the SPA's poll-as-data applies to flipped surfaces only — the two renderers are allowed to differ internally as long as the emitted contract matches (REQ-VFY-4 probes are renderer-agnostic).

## 13. Out of scope

Per the brief: backend data-model changes; api route semantics; billing/auth semantics; §16.4 marketing claims (G2 still frozen). Additionally: no public-page redesign, no visual redesign of auth'd surfaces beyond the Q-4 polish budget, no api-versioned endpoints, no mobile-native changes (phone posture is a capability contract, not a new client), no changes to `apps/api`, `apps/collab`, `apps/run-task` beyond what the BFF contract strictly requires (none anticipated — the BFF is additive).

---

## Appendix A — Requirement index

All 192 requirements, id → governing section. `AC:` marks explicit acceptance hooks from source notes; decomposition derives criteria for the rest.

| Family | Count | Governing section | Notes |
|---|---|---|---|
| `REQ-INV-1..8` | 8 | §4, §5, §11 | Route-class model, auth rule, mutation contract, transport exceptions, progressive enhancement, public set, degraded renders, redirect surfaces |
| `REQ-ISL-1..16` | 16 | §5, §6 | Bootstraps, 4-layer autosave, ⌘S, collab wire protocol, live-state transport, sync pill, provenance, keymap, palette-no-POST, localStorage, no-JS floor, no credentials, IDB hold, SSE feed, theme boot, `/edit/*` transports |
| `REQ-DAT-1..14` | 14 | §5 | Endpoint-per-surface, error envelope, mutation JSON, aggregates, derivation placement, slug-once, ADR-040 stamp, non-JSON transports, upload pattern, 422 passthrough, capability flags, degraded JSON, typed seams, polls-as-data |
| `REQ-TST-1..10` | 10 | §9, §10 | Test-retention rule, selector manifest, marker-scan fix, no-cookies coverage, nonce contract, component stack, probe re-spec, asset parity, title coverage, a11y posture |
| `REQ-FW-1..12` | 12 | §3 | Stack choice, public exclusion, flag-served documents, route mirroring, auth boundary, single transport, Query orchestration, transport preservation, type-only DTOs, head contract, boundary navs, Vite scope |
| `REQ-TL-1..14` | 14 | §3 | Config placement, outDir/publicDir, build wiring + turbo outputs, manifest serving, asset route, hidden sourcemaps, CSP-by-construction, dev loop, file-based routing + eager-import ban, pins + engines, tsconfig.spa.json, island coexistence, parity regex + manifest leg, marker TARGET_DIRS |
| `REQ-BFF-1..30` | 30 | §5 | Endpoint conventions, envelopes, error/stale/refusal semantics, mutation classes, aggregation, degradation, Query keys, slug memo, SSE, WSS, beacons, polls, uploads, downloads, session, boot, precedence order, confirm-email, handoff, estimate, feed labels, doc conversion, derivations, hand-off validation, transport, telemetry, idempotency |
| `REQ-ED-1..17` | 17 | §6 | Mount discipline, hand-rolled binding, collab module, session registry, route-leave flush, DOM contract, ⌘S single-path, origin dispatch, decorations, undo separation, lock poll, forced-SSR, Page-last, PmPreview pending, authorship overlay, dead-code drops, Source-mode revival (designed rebuild post-editor-flip; operator ruling R20) |
| `REQ-UX-1..16` | 16 | §8 | No reloads, prefetch, skeletons, mutation posture, token CSS, DOM parity, a11y nav contract, keymap, live regions, phone capability, boot document, COPY ownership, paper island, interaction invariants, live-state convergence, polish budget |
| `REQ-NAV-1..11` | 11 | §7 | Route set, param validation, search grammar, deep links, conditional landings, cross-route state, scroll/focus, keymap mount, boundary rule, 404s, history semantics |
| `REQ-BND-1..12` | 12 | §4 | Public set, showcase legs, server-owned non-documents, catch-all split, shell doc, `/session`, reverse gate, head manager, boundary crossings, IDB hold, flag order + noscript honesty, shared asset pipeline |
| `REQ-VFY-1..10` | 10 | §10 | Component stack, dom-contract manifest, settle contract, probe re-spec, phone mount contract, a11y tiers, renderer markers + CLI, flip procedure, test disposition map, $0-only flip gates + coverage debts |
| `REQ-SAFE-1..10` | 10 | §9 | Marker-scan repair, provenance + sentinels, no-cookies extension, copy containment, nonce middleware, BFF-validated hand-offs, bundle budget, env containment, CI order, same-PR atomicity |
| `REQ-SEQ-1..12` | 12 | §11 | Flag pipeline, key vocabulary, deploy wiring, request overrides, foundation gate, flip order, per-flip procedure, renderer-agnostic probes, surface-ticket shape, prod-flip PR, deployable-dark + rebase checkpoint, coexistence |

## Appendix B — Decision register

**Operator decisions (binding):**

| id | question | ruling |
|---|---|---|
| Q-1 | SSR scope | Hybrid — public/marketing/login stay Hono SSR; auth'd app becomes the SPA (2026-10-07) |
| Q-2 | Framework/data | TanStack Router + TanStack Query (2026-10-07) |
| Q-3 | Bundler | Vite — amends ADR-007 via ADR-106 (2026-10-07) |
| Q-4 | Design ambition | Port + polish — existing visual language; no redesign ticket (2026-10-07) |
| Q-5 | Migration strategy | Strangler behind per-surface flags; SSR fallback; config-flip rollback (2026-10-07) |
| Q-6 | Budget | $50 envelope; frugal — cheapest viable models, small fixtures (2026-10-07) |
| Q-7 | Chain interaction | Stack on the current chain tip; the 45-PR merge proceeds on the operator's schedule (2026-10-07) |

**Synthesis rulings:** R1–R27 in §0.3 — adopted recommendations the operator may reverse at ratification (§12.2 lists the ones explicitly queued for confirmation).

**Awaiting ratification:** the §12.2 questions (Q-8+ once answered).

## Appendix C — Research index

| note | row | covers |
|---|---|---|
| `docs/research/01_route-census.md` | A1 | ~181 registrations → ~120 route rows; ~20 non-HTML endpoints; REQ-INV-1..8 |
| `docs/research/02_island-contract-map.md` | A2 | 5 island bundles + 2 inline scripts; collab wire protocol; 4-layer autosave; REQ-ISL-1..16 |
| `docs/research/03_data-layer-audit.md` | A3 | DataSource ~120 methods; ~70 form-POST mutations; dual-mode precedent; REQ-DAT-1..14 |
| `docs/research/04_test-surface-audit.md` | A4 | 34 files/~481 tests; ~90 load-bearing `data-*` hooks; protocol-marker gate found vacuous; REQ-TST-1..10 |
| `docs/design/20_spa-framework-binding.md` | B1 | Router+Query matrix; ADR-106 draft; lifecycle mapping; REQ-FW-1..12 |
| `docs/design/21_spa-toolchain.md` | B2 | Vite config, outDir/publicDir resolution, manifest serving, hidden sourcemaps, pins; REQ-TL-1..14 |
| `docs/design/22_spa-bff-api-shape.md` | B3 | `/bff/*` twins, mutation envelope, error/stale/refusal semantics, transports, endpoint table; REQ-BFF-1..30 |
| `docs/design/23_spa-editor-collab-binding.md` | B4 | Hand-rolled PM mount, session registry, wire preservation, 29-row parity checklist; REQ-ED-1..16 |
| `docs/design/24_spa-ux-design-system.md` | C1 | Tokens-verbatim styling, polish budget, phone capability, a11y floor; REQ-UX-1..16 |
| `docs/design/25_spa-navigation-ia.md` | C2 | Route tree, search-param schema, redirect dispositions, cross-route state; REQ-NAV-1..11 |
| `docs/design/26_spa-public-auth-boundary.md` | C3 | Boundary table, shell doc spec, catch-all split, `/session`; REQ-BND-1..12 |
| `docs/design/27_spa-acceptance-mechanics.md` | D1 | Component-test stack, dom-contract manifest, flip gates, coverage debts; REQ-VFY-1..10 |
| `docs/design/28_spa-safety-gates.md` | D2 | 3-layer protocol gate, CSP analysis, budgets, env tripwires; REQ-SAFE-1..10 |
| `docs/design/29_spa-migration-sequencing.md` | D3 | Flag pipeline, route→key map, flip order, per-flip runbook, coexistence; REQ-SEQ-1..12 |

## Appendix D — Reserved strings and emitted-DOM vocabulary

- **Settle/markers:** `data-renderer="ssr|spa"`, `data-route="<id>"`, `data-mounted`, `data-device="phone|desktop"`, `data-spa-boot`.
- **Overrides:** `x-rhema-renderer: ssr|spa` header; `?ssr=1`, `?renderer=spa` params (non-prod for force-spa); env `SPA_SURFACES`, `SPA_OVERRIDES`, `SPA_DEV_ORIGIN` (deferred); Pulumi `rhema:spaSurfaces`.
- **Flag vocabulary (14 keys + composite):** `usage`, `inbox`, `settings`, `voices`, `onboarding`, `project-home`, `billing`, `export`, `outline`, `figures`, `run-sheet`, `dossier`, `run-report`, `editor`, `ide-chrome`.
- **Envelope fields:** `{ok, redirect, flash, data, pending{pollAfterSeconds}, url}` / `{error, detail}`; `BffError{status, code, detail, requestId}`.
- **Query-key convention:** `["session"]`, `["bff","app"]`, `["bff","p",<slug>,…]`, `["feed-labels"]`.
- **Preserved verbatim contracts:** the ~60-key flash-param grammar; the ~90 `data-*` hooks (manifest in `dom-contract.ts`); localStorage/IDB keys (`rhema:ide:v1:*`, `rhema:authorship:v1:<p>`, `rhema-hold`, `rhema-page/draft:<id>`); the `rhema.*` collab vocabulary; the live-region vocabulary.

## Appendix E — Review dispositions

O2 fresh-context adversarial review, 2026-10-07. Method: every emitted REQ id (191, per the notes' "Spec requirements emitted" lists) was cross-checked against the spec body and Appendix A; rulings R2/R8/R16/R21 were spot-verified against repo ground truth; OUTLINE_TRACE's discharges were re-walked.

| # | finding | severity | disposition | rationale |
|---|---|---|---|---|
| E-1 | §4's "fixed handler order" (line 161) omits the **renderer-override consult** entirely — the chain jumps "phone/showcase forced-SSR override → flag". The adopted REQ-SEQ-1 (design/29 emitted list) orders it "forced-SSR capability checks → **renderer override** → flag membership", and the whole two-leg gate (R8, line 42; §10 leg A, line 240; §11, line 253) depends on `x-rhema-renderer`/`?ssr=1` being applied relative to the flag. Two normative orderings in the same document disagree, and neither says whether the override sits inside `deps.spa` or is its own step. | major | adapt | A ticket implementing §4 verbatim leaves the override with no consult point; fix before decomposition. |
| E-2 | R21/§9/§12.2 gate the `connect-src`+GCS-CORS prerequisite on "the import-surface flip" (lines 55, 226, 278), but the seam is `uploadKey`→presign→PUT (data.ts:1079-1094) and its earliest SPA consumer is **`voices`** — `linkVoiceExportZip` (data.ts:1307-1311, server.ts:5409-5435) — flipping at position 4, plus `/app/new` preview/create at `onboarding` position 5 (data.ts:1412). Meanwhile the `/p/:p/import*` legs are IDE-framed and cannot flip until `ide-chrome` lands with `export` at position 8 (adopted design/29 route map). The prerequisite actually binds the `voices` flip — one earlier than stated — and ⚑ I-4's "connect-src 'self' + the collab origin" restatement (line 110) never names the carve-out. | major | adapt | Mis-scoped cross-ticket dependency: a literal reading ships SPA zip-link uploads against an unchanged CSP at the voices flip. |
| E-3 | Front-matter counts are wrong twice: line 3 "all 13 research rows closed" and lines 4-5 "nine design notes (docs/design/20–22, 23–29)". The ledger's done item rows are **14** (A1–A4, B1–B4, C1–C3, D1–D3; research-ledger.md:52-80) and this spec's own Appendix C lists 14 notes — design/20–29 inclusive is **10**. | minor | adapt | Internal contradiction with Appendix C; harmless but should not ship to ratification. |
| E-4 | §0.1's fallback clause (line 20) reads "where a note is silent the note's detail applies" — it must mean "where the **spec** is silent". As written it is self-defeating, and it is the only clause giving normative force to the 23 REQ ids cited solely in Appendix A (E-12). | minor | adapt | One-word fix; load-bearing for the index-only ids. |
| E-5 | REQ-DAT-13 never appears in the body: promoting `checkSession`/`getRunEvents`/`streamRunEvents`/`presignImportUpload` from raw fetches to typed `@rhema/api-client` members (research/03:198; the raw-fetch bypasses at data.ts:1096-1099,1464-1482) is real work invisible to any §5 sentence; only the Appendix A gloss "typed seams" (line 306) gestures at it. | minor | adapt | A workstream a decomposer could miss entirely; one line in §5 closes it. |
| E-6 | §3.1's shell head-contract enumeration (line 124) is presented as complete but omits `<title>` — REQ-BND-5 requires the shell to carry `docMetaFor`'s title for the requested path at serve time (the client head manager in §7/§10 covers only post-boot navs). | minor | adapt | First paint/tab label on the shell would be blank under a literal reading. |
| E-7 | §1.2 promises flag-off surfaces serve "**byte-identical** SSR" (line 97), but REQ-SEQ-8/R27/REQ-VFY-3 require SSR documents to *gain* `data-renderer`/`data-route`/`data-mounted` markers (lines 61, 200, 239) — none are emitted today (no emission found in render.tsx/server.ts). The fallback document is semantically identical, not byte-identical. | minor | adapt | The emitted contract intentionally changes at flag-off; qualify the phrase. |
| E-8 | REQ-SAFE-6's emitted text — "SPA code never `location.assign`s an external URL **except through those [BFF 302] endpoints**" — is silently superseded by R11's `{url}`+direct-assign design (lines 45, 159, 227). The ruling is correct (the hop adds minted-URL state with no security gain — form-action never covered JS navs anyway), but nothing marks the REQ itself amended; a worker reading the note text builds the rejected hop. | minor | adapt | Annotate the REQ-SAFE-6 index row or add one line in §9 recording that R11 amends its mechanism clause. |
| E-9 | §4's "Forever SSR" list (line 154) omits `/favicon.ico`/`/favicon.svg` (root routes, server.ts:439-440 — not under `/assets/`) and names the `/a/*` beacons only collectively; REQ-INV-6's enumeration (research/01:271) is the cited contract. | note | adapt | The list is descriptive rather than the frozen set (REQ-BND-1 freezes documents only), but completeness is cheap. |
| E-10 | OUTLINE_TRACE OL-13 cites "spec §5" for REQ-DAT-7 (`/api/auth/*` proxy + ADR-040 stamp), but §5 never mentions either — the coverage lives in §2 I-5 (line 111). | note | adapt | Trace-row fix; OL-13 is discharged, just at the cited-wrong section. |
| E-11 | §5's "Two new POST endpoints" (line 173) is accurate only within its "one-shot side effects" clause — the section mints four net-new POSTs overall (`/bff/import/presign`, `/bff/p/:slug/estimate`, confirm-email, handoff). | note | adapt | A reader inventorying new surface area could miscount; scope the sentence. |
| E-12 | 23 ids are cited only via Appendix A ranges; most are covered in substance by body text, but several carry normative detail no sentence restates: REQ-BFF-10 (Query client rebuilt per document boot — nothing sensitive cached across sessions), REQ-BFF-30 (client issues **no automatic POST retries**), REQ-ISL-5 (poll payload `{draftId, lock, findings, venueCap}` + `data-lost` resync), REQ-ISL-14 (400-row DOM bound, fail-closed label maps), REQ-ED-15 (`rhema:authorship` CustomEvent broadcast), and REQ-NAV-6's keep-alive key `(projectId, draftId)` vs §6's `draft:<draftId>` registry key (line 184) — a cosmetic mismatch worth one phrase. | note | accept | Legit once E-4 fixes the fallback clause; only the NAV-6/ED-4 keying nuance merits an explicit body phrase. |
| E-13 | The `AC:` convention (lines 27, 300) is vacuous — no source note supplied an `AC:` hook and none appears anywhere in the spec or notes. | note | adapt | Either drop the clause or keep it knowingly for future families; harmless as-is. |
| E-14 | Verified-correct rulings (recorded, no action): R2 — `/p/:project` mounts the working-head Page via `loadEditorPage` (server.ts:3180, 3237-3241), so the `editor` flag assignment is evidence-backed; R8 — `setExtraHTTPHeaders` precedent exists (packages/journeys/src/steps.ts:1611) and IDENTITY_HEADERS is a dev/preview-only shim never honored on prod (main.ts:117-123); R16 — `filterFindings`/`applySeverityBudget` are pure (packages/findings-core/src/surface.ts:100-120) and their `openObligationIds` ctx is derivable inside the verbatim `getDossier` aggregate (pages.tsx:1870-1873); R21's CSP premise — current `connect-src 'self'${collabWsSource}` admits no GCS origin (server.ts:343). | note | accept | The sampled rulings match repo ground truth. |
| E-15 | Verified-correct gate claims (recorded, no action): the protocol-marker gate is vacuous as charged — the `public-safe` job builds only `protocols-stub`+`evals` (ci.yml), so all four TARGET_DIRS are absent at scan time, and zero sentinels are planted in `packages/protocols`; `wantsJson` (server.ts:636), the `/edit/:draftId/doc` JSON twin (server.ts:4952), `STRIPE_HOSTED_ORIGINS`/`GOOGLE_OAUTH_ORIGINS` shared validators (server.ts:198,255,348-353), the `signupMode` fail-closed pipeline (main.ts:108, stages.ts:310-342, compute.ts:734), `markdownToDoc` DOM-free in `@rhema/editor` (md-to-pm.ts imports are pure), and `verbatimModuleSyntax` (tsconfig.base.json:22) all check out. Appendix A's 191-id index matches the emitted sets exactly (14 families; extras are only legitimate product ids REQ-EVAL-19/REQ-SPEC-29). | note | accept | REQ-id integrity and the load-bearing mechanisms are all real. |

### Proposed edits (for `accept`/`adapt` findings; author folds — body not touched by this review)

- **E-1:** amend §4's chain to "session gate → `?verified=1` mint → `/app` precedence → `/p/:slug` unread handoff → phone/showcase forced-SSR override → **renderer override (`?ssr=1`/`x-rhema-renderer`, REQ-SEQ-4)** → flag → shell-or-SSR", or state explicitly that `deps.spa(c, surface)` applies the override inside the flag consult.
- **E-2:** reword R21/§9/§12.2-Q2 to bind the prerequisite to "the first SPA surface performing browser-side uploads — `voices` (zip-link) at the earliest; the `/p/:p/import*` legs cannot flip before `ide-chrome` regardless", and add the connect-src carve-out to I-4's restatement.
- **E-3:** change line 3 to "all 14 research/design rows closed" and lines 4-5 to "ten design notes (docs/design/20–29)".
- **E-4:** line 20: "where a note is silent the note's detail applies" → "where this spec is silent, the note's detail applies".
- **E-5:** add to §5: "the DataSource's raw-fetch seams (`checkSession`, `getRunEvents`, `streamRunEvents`, `presignImportUpload`) become typed `@rhema/api-client` members (REQ-DAT-13)".
- **E-6:** add "`docMetaFor`'s `<title>` for the requested path" to §3.1's head-contract enumeration (REQ-BND-5).
- **E-7:** qualify §1.2's "byte-identical" as "identical markup modulo the new settle markers (`data-renderer`/`data-route`/`data-mounted`, REQ-SEQ-8)".
- **E-8:** in §9 or the REQ-SAFE-6 index row, record "mechanism clause amended by R11: `{url}` validated before serialization replaces the literal-302-hop reading".
- **E-9:** extend §4's list with `/favicon.*` and the `/a/{dwell,landing,acq}` beacons explicitly (or defer to REQ-INV-6's enumeration by name).
- **E-10:** OUTLINE_TRACE OL-13 "Discharged at" should read "spec §2 I-5 + §5".
- **E-11:** §5 → "two new POST endpoints for one-shot side effects (in addition to the presign and estimate endpoints above)".
- **E-13:** drop "AC:" from §0.2/Appendix A or note that no source supplied hooks.
- **E-12 (optional):** one phrase in §6 noting the registry key `(projectId, draftId)` (REQ-NAV-6) — draft ids are globally unique so `draft:<id>` is equivalent, but saying so removes the apparent mismatch.
