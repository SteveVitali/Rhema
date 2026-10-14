# 04_test-surface-audit — Test-surface audit: what an SSR→SPA migration breaks and what survives

**Stream:** A
**Researched:** 2026-10-07
**Author:** research-row worker (subagent)
**Ledger rows covered:** A4
**Confidence overall:** high

### F1 — The suite is ~481 `it()` blocks across 34 files, and almost every file is mixed-mode

**Claim:** `apps/web` carries 34 colocated `*.test.ts(x)` files totaling ~481 `it()` blocks; the dominant pattern is `createWebApp({dataSource})` → `app.request(path)` asserting BOTH HTTP semantics (status/redirect/`location`/upstream-API-call recording) and rendered-HTML strings (`await res.text()` → `toContain`/regex), so most files split rather than uniformly die or survive.
**Status:** VERIFIED
**Evidence:** per-file `it()` counts from a `\bit\s*\(` scan of `apps/web/src` (excludes `.test(` regex calls); representative mixed files — `apps/web/src/server.test.ts` (106 its; HTML asserts e.g. `:853`, status asserts e.g. `:648`, redirect asserts e.g. `:212`), `apps/web/src/editor.test.ts:79-203` (redirect/location/status/JSON-only — no HTML strings), `apps/web/src/feed-labels.test.ts:16-78` (pure data-layer logic, zero HTTP).
**Retrieved:** 2026-10-07
**Implication for the spec:** migration bookkeeping must be per-*test*, not per-file; the ledger's "~6k-line HTML-string test files" casualty (thesis T3, `docs/research-ledger.md:36-38`) is real but so is a large salvaged core of status/forwarding assertions that port if the BFF route layer survives (row B3 decides).
**Outline delta:** CONFIRMS T3 — SSR-string tests are the casualty; EXTENDS — the same files carry the BFF/API contract coverage that an SPA still needs, so "delete and rewrite" understates the salvageable half.

### F2 — Per-file verdict table (34 files, ~481 `it()`)

**Claim:** Each file classifies as HTML-strings (die/rewrite), route-behavior/status (survive as API tests while the Hono BFF exists), data-layer logic (survives), or client-island logic (survives/ports) — with Q-1's hybrid boundary (`docs/research-ledger.md:95`) keeping public-route HTML assertions alive.
**Status:** VERIFIED
**Evidence:** per-file inventories read from `apps/web/src/**` test files; counts below are `it()` blocks.

| File | `it()`s | Verdict |
|---|---|---|
| `server.test.ts` | 106 | MIXED — auth/invite/redirect/status + POST-forward legs survive as BFF tests; the majority are SSR-HTML asserts that die on auth'd surfaces, survive on the public set (`:482-648` public legs vs `:1315-2119` app legs) |
| `marketing.test.ts` | 15 | mostly SURVIVES — public funnel stays SSR (Q-1); `/app` precedence + intent-POST legs are server-side (`:148-258`) |
| `billing-pages.test.ts` / `billing-surfaces.test.ts` | 23 / 11 | MIXED→rewrite — Stripe 302/CSP/status legs survive as API tests (`billing-surfaces.test.ts:90-215`); render asserts die |
| `voice-surfaces.test.ts` | 40 | die/rewrite (render asserts + form-POST semantics; POST-forward legs port to mutation tests) |
| `figure-surfaces.test.ts` | 23 | die/rewrite (same shape) |
| `triage-surfaces.test.ts` | 22 | die/rewrite (disposition cards, gate card anatomy — DOM asserts `:415-543`) |
| `page.test.ts` | 20 | die/rewrite — `data-page-*` embed/lock-banner asserts die; `POST save` JSON-forward + CSP legs survive (`:196-281`) |
| `settings-pages.test.ts` | 18 | die/rewrite (render asserts; POST-map legs port) |
| `chat-surfaces.test.ts` | 17 | MIXED — SSR mount assert dies (`:77`); JSON/status passthrough legs survive verbatim as API tests (`:267-401`) |
| `client/landing.test.ts` | 16 | SURVIVES/ports — happy-dom island test; landing stays SSR so the island and its hand-written fixture DOM (mirroring `data-dropzone`/`data-held-*` attrs, `:11-25`) remain valid; if the island becomes React, fixtures become render output |
| `client/editor.test.ts` | 7 | PORTS — CodeMirror-over-host mount + save/lock/rebase; becomes the React editor binding's test seed (B4) |
| `inbox-phone.test.ts` | 13 | die/rewrite — §10.1 phone-withholding is server-rendered; an SPA re-implements it client-side and "never renders" asserts must be re-specified |
| `versions-surface.test.ts` / `findings-surface.test.ts` / `outline-surfaces.test.ts` | 13 / 12 / 13 | die/rewrite (same shape) |
| `editor.test.ts` | 12 | SURVIVES as API tests — redirects/JSON save/asset serving (`:79-203`); the `/assets/editor.js` leg rewrites with the bundler |
| `billing`+`export`+`analytics-surfaces`+`observability`+`internal-token`+`data` | 11+6+12+7+7+10 | see above for billing/export/analytics (die/rewrite); `observability` + `internal-token` survive while the Hono server exists (`observability.test.ts:27-112`, `internal-token.test.ts:22-134`); `data.test.ts` survives if `apiDataSource` stays the BFF seam, else ports to client fetchers (`:54-`...) |
| `ide-surfaces.test.tsx` | 9 | die/rewrite — stylesheet/ISLE-mount asserts (`:72-215`); CSS-target rules survive only if the CSS is shared |
| `render.test.tsx` | 7 | PARTIAL — title/meta/OG/h1 asserts survive for the public SSR set; app-route title legs rewrite under client head management (`:15-83`) |
| `feed-labels.test.ts` | 6 | SURVIVES — pure template/density logic (`:16-78`); only the "SSR ≡ island serialization" framing changes |
| `copy.test.ts` | 6 | SURVIVES — `lintCopy(collectCopyStrings())` is source-level (`:18`); the SPA must keep routing copy through `COPY` |
| `dossier-evidence.test.ts` | 7 | die/rewrite as HTML asserts; the shape-tolerance matrix ports to component tests |
| `routes.test.ts` | 4 | PARTIAL — public-flags/manifest survives server-side; `matchAppRoute` portion rewrites against the SPA router (`:18-39`) |
| `asset-parity.test.ts` | 4 | REWRITES — `CLIENT_ENTRIES`↔`/assets/<entry>.js` parity (`:29-72`) is an esbuild-era invariant; Vite's hashed manifest needs a new equivalent |
| `claims-visibility.test.ts` | 3 | PARTIAL — landing/pricing claim-render legs survive SSR; the billing-page leg dies (`:16-`…) |
| `sample-dossier.test.ts` | 2 | SURVIVES — fixture-data assertions (`:9-13`); the `/showcase` page stays public SSR |
| `paywall.test.ts` | 1 | SURVIVES — source-tree scan for the single `<Paywall>` mount still applies to React SPA sources (`:21-36`) |
| `client/sync-machine.test.ts` / `client/page-dispatch.test.ts` | 6 / 3 | SURVIVE/port — framework-free FSM + PM dispatch logic (`sync-machine.test.ts:37-115`) |

**Retrieved:** 2026-10-07
**Implication for the spec:** the "rewrite" budget is ~300 of ~481 `it()`s concentrated in the surface files; ~100+ port with the BFF/mutation layer; ~40 survive untouched. Deletion of HTML-string suites must be gated on replacement coverage (component tests or journeys) per REQ-TST-1.
**Outline delta:** CONFIRMS T3; EXTENDS C3/D1 with the file-level disposition map.

### F3 — The journey registry is 45 steps (35 green / 10 red; 21 paid), and DOM dependence is bimodal

**Claim:** `STEP_REGISTRY` holds 45 steps; red = N6, T8, T15, T16, B17, B18A, B18B, B19A, B19B, B19C (10); `paid: true` = T9, N5, N6, N11, R4, R6, R9, T10–T16, B16–B19C (21 — the weekly `--paid` leg in `.github/workflows/journeys.yml:12-29`, bounded by the spend guard). The steps split into three DOM-dependence classes.
**Status:** VERIFIED
**Evidence:** `packages/journeys/src/registry.ts:24-444` (all 45 rows read); `.github/workflows/journeys.yml:62-76` (`--paid` gating); `runner.ts:120-124` (paid-skip semantics).
**Retrieved:** 2026-10-07
**Implication for the spec:** ~2/3 of paid legs (the B-legs) are DOM-free; the expensive-to-rewrite surface is concentrated in steps.ts/stb5a.ts legs.
**Outline delta:** EXTENDS D1 — the registry is reusable (T3) but needs a per-step DOM-contract mapping, not a blanket keep.

### F4 — Journeys lean on ~90 `data-*` hooks plus SSR-only mechanics; a DOM-identical render survives only the former

**Claim:** The suite asserts (a) semantic `data-*` hooks that port verbatim under a DOM-identical React render, and (b) SSR-mechanics that no client-rendered app emits and which need new probes regardless of fidelity.
**Status:** VERIFIED
**Evidence:**
- *Portable `data-*` probes* (sampled, all in `packages/journeys/src/`): `data-dropzone`, `data-held-notice`, `data-held-discard`, `data-credits-line`, `data-time-line`, `data-included`, `data-protocol-card`, `data-next-step`, `data-cost-card`, `data-page-root`, `data-page-view`, `data-sync-pill`+`data-sync-state`, `data-page-banner`, `data-version-chip`+`data-state`+`data-origin`, `data-edit-source`, `data-page-host`+`data-readonly`, `data-collab-url`, `data-showcase-banner`, `data-subscribe-form`, `data-topup-form`, `data-portal-form`, `data-payment-link`, `data-run-button`, `data-run-card`+`data-run-state`, `data-credits`, `data-phase-status`+`data-phase`, `data-run-report`, `data-estimate-line`, `data-metered-line`, `data-refund`, `data-refund-cta`, `data-refund-state`, `data-difference`, `data-report-phase`, `data-usage-row`, `data-usage-balance`, `data-informational`, `data-waiting-gate`, `data-blocking`, `data-verdict`, `data-tier`, `data-fetched`+`data-fetched-chip`, `data-claim-url`+`data-url-in-log`, `data-finding-evidence`, `data-collapsed-group`, `data-desk`, `data-ide-desk-tab`, `data-desk-tab`, `data-desk-panel`, `data-chat-composer`, `data-chat-turn`, `data-chat-thread`, `data-chat-chip`, `data-export-form`, `data-entry`, `data-phone-blocked`, `data-run-sheet`, `data-ide`, `data-page-mount`, `data-version-rail`, `data-inbox-badge`, `data-inbox-section`, `data-inbox-row`+`data-inbox-kind`+`data-inbox-type`, `data-inbox-project`, `data-inbox-open`, `data-inbox-empty`, `data-letter-view`, `data-claims-table`+`data-claim`, `data-second-read`, `data-rubric`+`data-rubric-row`, `data-finding`+`data-finding-link`, `data-trust-chip`, `data-version-obligations`, `data-project-row`, `data-notification-matrix`+`data-notification-row`, `data-account-export`+`data-export-status`+`data-export-download`+`data-account-import`+`data-import-notice`, `data-csl-style`, `data-link-export`, `data-source`+`data-provider`+`data-source-error`, `data-review-item`, `data-confirm-cta`, `data-sample`+`data-sample-state`+`data-sample-open`+`data-sample-versions`, `data-resync`, `data-discover`, `data-deleted-section`+`data-deleted-row`, `data-findings-filters`, `data-findings-list`, `data-verb`, `data-margin-card`+`data-margin-chip`, `data-findings-desk`, `data-desk-row`+`data-severity`, `data-disposition-form`+`data-disposition`+`data-note`, `data-add-obligation`, `data-finding-notice`, `data-obligation-id`+`data-obligation-items`+`data-obligation-state`, `data-apply`, `data-bulk-preview`+`data-bulk-skipped`+`data-bulk-confirm`+`data-bulk-done`, `data-decisions-list`+`data-decision`+`data-decision-option`, `data-focused-gate`, `data-gate-actions`, `data-rename-form`, `data-new-project` (`steps.ts:206-2191`, `stb5a.ts:41-1332`).
- *SSR-mechanics legs that break under client rendering:* `form[action="/app/new/create"]` + `button[name="action"][value="create"]` (N3, `steps.ts:285-289`), `form[action="${path}"] input[name="code"]` field-order + `<details>` disclosure (N2.invite, `steps.ts:148-177`), `<meta http-equiv="refresh">` pending-poll (N3 comment + `render.tsx:126-130`), `waitForLoadState("domcontentloaded")` after clicks (`steps.ts:113`), full-page `gotoOk` reloads, `waitForSelector('[role="status"]')` on the SSR sent-state (`steps.ts:223`), the `var R={…}` inline recompute payload read off `document.scripts` (`steps.ts:338-355`), raw-JSON `data-page-*` embeds whose parseability is itself a contract (`page.test.ts:108`), and the UA-sniffed §10.1 phone-withheld render (`server.ts:5679` isPhoneUa; P1's `context.setExtraHTTPHeaders(MOBILE)` at `steps.ts:1611` — the "never renders on phone" asserts at `steps.ts:1636-1651, 1719` inspect DOM *absence*, which a client-side gate that renders-hidden fails).
- *DOM-free legs:* every `stb5b.ts` step (B16–B19C) drives `apiFetch` + Postgres `db()` only (`stb5b.ts:1-71`) — no `page.locator` exists in the file.
**Retrieved:** 2026-10-07
**Implication for the spec:** publish the `data-*` set as the load-bearing DOM contract the SPA must emit (or deliberately rename via codemod + registry update); SSR-mechanics legs get re-specified probes (e.g., `?created=` + `?hc=` handshake survives as URL state, form-action posts become mutation→nav). The `?focus=1`, `?gate=`, `?applied=`, `?disposed=`, `?obligated`, `?bulkdone=` URL-state conventions (registry T11–T15 asserts) are already SPA-compatible.
**Outline delta:** EXTENDS D1 — "which steps need new probes" is enumerable: the SSR-mechanics legs listed above, not the data-attr legs.

### F5 — The safety gates scan sources today; the protocol-marker gate misses the real bundle path and is vacuous in CI

**Claim:** `check:protocol-markers` scans `apps/web/dist`, `apps/web/build`, `apps/mobile/dist`, `packages/api-client/dist` — it never scans `apps/web/public/`, where `build-client.mjs` actually emits the served bundles, and the `public-safe` CI job never builds `apps/web`, so the web scan silently skips in CI.
**Status:** VERIFIED
**Evidence:** `scripts/check-protocol-markers.mjs:17-22` (TARGET_DIRS — `public/` absent), `:5-6` (admits "the placeholder scan P0.01 ships"); `apps/web/build-client.mjs:17-31` (output is `public/<entry>.js`); `.github/workflows/ci.yml:199-235` (public-safe job builds only `protocols-stub` + `evals` — `apps/web/dist` therefore doesn't exist at scan time); `apps/web/Dockerfile:30` (runtime serves `/app/public`).
**Retrieved:** 2026-10-07
**Implication for the spec:** a bundled-SPA build makes this gap *load-bearing* — the whole client surface ships from the bundle dir. The spec must require (a) the marker scan to target the real Vite output dir, and (b) the public-safe job to build the SPA before scanning (or accept a dev-time-only scan with an explicit admission).
**Outline delta:** CORRECTS D2's implicit premise — today the gate is weak *before* the migration; the SPA must strengthen it, not just preserve it.
**Resolution (SPA.8, 2026-10-08):** RESOLVED — `check-protocol-markers` scans `apps/web/public` + `apps/web/public/spa` + `packages/api-client/dist` as REQUIRED_DIRS (fail-closed, no silent skip); `public-safe` builds `@rhema/web...` before scanning (SPA.1); the four sentinels are planted in `packages/protocols/src` and the checker verifies arming; `.map` `sources[]` provenance rejects protocols/evals/run-task paths. Full mapping in `docs/design/28_spa-safety-gates.md` §Resolution.

### F6 — no-cookies, licenses, copy lints, and CSP all survive — with scan-list maintenance obligations

**Claim:** `check:no-cookies` is a source-level credential-construct scan that keeps working on JSX but enumerates specific `apps/web/src` files; `check:licenses` is whole-graph and auto-covers new client deps; `lintCopy`/`lintGrowthCopy`/`no-banned-strings` are source/table-level; the CSP nonce contract is asserted on emitted documents and must extend to the SPA shell.
**Status:** VERIFIED
**Evidence:** `scripts/check-no-cookies.mjs:29-75` (TARGETS pin `apps/web/src/{pages,copy,data,page-data,server}.ts` + `voice-surfaces.test.ts`; rules are textual — JSX `name=` props still match); `scripts/check-licenses.mjs:23-38` (`pnpm licenses list` over the whole graph); `apps/web/src/copy.test.ts:18` (`lintCopy` over `collectCopyStrings()`); `eslint.config.js:61-64` (`no-banned-strings`, `:34` ignores `apps/web/public`); `packages/security-checks/src/launch-surface.test.ts:14,92-103` (`lintGrowthCopy` over collected strings + email/export surfaces); `packages/security-checks/src/usercontent-csp.test.ts:104-134` (every `<script>` carries the per-request nonce — imports `createWebApp` from `@rhema/web`).
**Retrieved:** 2026-10-07
**Implication for the spec:** the SPA's source tree must be added to `check:no-cookies` TARGETS wherever ingestion-facing components land; the Vite/Vite-served shell document must satisfy the nonce-per-`<script>` contract (inline modulepreload/boot scripts need nonces or must not exist); ESLint's `apps/web/public` ignore anticipates generated bundles — Vite's `dist/` must likewise stay out of the lint graph while remaining inside the marker scan.
**Outline delta:** CONFIRMS D2's premise that gates survive; EXTENDS with the concrete scan-list deltas.

### F7 — Emails, SEO/meta, and the screenshot pipeline are either independent or already contract-shaped

**Claim:** No email or downstream renderer consumes the web's HTML — mails are self-contained string templates; SEO/meta lives in `renderDocument`'s head emission asserted by `render.test.tsx` and journey N10; screenshots are journey evidence artifacts (not a regression pipeline).
**Status:** VERIFIED
**Evidence:** `apps/api/src/magic-link-email.ts:53-64` + `packages/contracts/src/notifications.ts:506-768` (own HTML shells, no shared render); `apps/web/src/render.tsx:154-178` (description/OG/Twitter/canonical/favicon emission) + `render.test.tsx:15-83` + `steps.ts:1925-1967` (N10: distinct titles, meta set, one `<h1>`, favicon 200, banned-copy scan); `runner.ts:188-197` (per-step fullPage PNG into the evidence dir, `report.json` at `:219`); `render.tsx:102-112` (`dwellBeacon` inline script — an SPA needs an equivalent instrumentation hook); `runner.ts:139` (bundle-parity regex `/assets/[^/]+\.js$` — Vite's `assets/[name]-[hash].js` still matches if the outDir convention is kept); `packages/security-checks` also imports `collectCopyStrings` from `@rhema/web` (`launch-surface.test.ts:14`) — copy collection stays a web export or moves.
**Retrieved:** 2026-10-07
**Implication for the spec:** under Q-1's hybrid, the public meta surface is untouched; the SPA needs a head-management contract (route titles — registry N10 asserts `<title>` on public routes only, but `render.test.tsx` pins app-route titles too) and a dwell-beacon replacement.
**Outline delta:** EXTENDS D1 (screenshots are evidence, not visual regression — don't conflate).

### F8 — Component-test infra, visual regression, and unit-level a11y do not exist today

**Claim:** The repo has no React component-test stack (no `@testing-library`, no jsdom env — Vitest runs `environment: "node"`; three island tests opt into happy-dom via pragma), no playwright-ct, no visual-regression tooling, and no a11y automation outside journey step P1's axe injection.
**Status:** VERIFIED
**Evidence:** `vitest.config.ts:8-19` (node env; automatic JSX); `apps/web/package.json:53-59` (devDeps = esbuild + happy-dom + fake-indexeddb only); `apps/web/src/client/{landing,editor,page-dispatch}.test.ts:1` (`// @vitest-environment happy-dom` — the only DOM-env tests); `packages/journeys/package.json:27,30` (playwright + axe-core live only in journeys); `steps.ts:21-24` (axe injected via `addScriptTag`); repo-wide grep finds zero `@testing-library`/`storybook`/visual-regression deps; `client/ide.ts` (~800+ lines) and `client/page.ts` have NO colocated unit tests — only extracted pure modules (`sync-machine`, `page-dispatch`) are unit-tested.
**Retrieved:** 2026-10-07
**Implication for the spec:** the component-test layer is greenfield (feeds B1/D1's vitest+RTL vs playwright-ct decision); a11y exists only as an E2E axe pass — a component-level axe contract would be net-new; visual regression would be net-new infrastructure (journeys PNGs are artifacts, not diffs). The heaviest island (`ide.ts`) also has the thinnest unit coverage — its React port gets no safety net from existing tests.
**Outline delta:** EXTENDS D1 — the "component-test strategy" row is a build-from-scratch decision, not an adaptation.

## Open questions

- Does the Hono BFF (apps/web server) persist as the SPA's backend under B3? It decides whether ~100+ route-behavior/status `it()`s port verbatim or die with the routes.
- Will the `data-*` journey contract be published as a spec-level emitted-DOM contract, or will journeys move to role/text probes (a larger rewrite of `steps.ts`/`stb5a.ts`)?
- §10.1 phone withholding is server-rendered via `isPhoneUa` (`server.ts:5679`) — does the SPA keep a server stamp for it, gate client-side (rendered-but-hidden ≠ "never renders"), or keep those routes SSR?
- Progressive-enhancement fallbacks (form POSTs, meta-refresh polls, no-JS renders): retained per-route during strangler flips (Q-5) or dropped on flip — the SSR test files can only be deleted when the last flag falls.
- The `var R={…}` estimate payload and `data-page-*` raw-JSON embeds are read by both journeys and tests — are these re-expressed as typed JSON endpoints under the BFF?
- Bundle-parity (runner `assetHits` + `asset-parity.test.ts`) assumes the `/assets/<name>.js` convention — does Vite emit to `/assets/` (default: yes) and does the parity test get re-pointed at the manifest?

## Spec requirements emitted

1. **REQ-TST-1** — No SSR-surface test file may be deleted until each covered behavior has a declared replacement (component test, API test, or journey step); the F2 table is the disposition source of truth.
2. **REQ-TST-2** — The spec must publish the journey load-bearing `data-*`/role/URL-state selector set as an emitted-DOM contract the SPA satisfies; selector renames ship as codemod + registry update in the same PR.
3. **REQ-TST-3** — `check:protocol-markers` must scan the actual emitted bundle directory and CI must build the SPA before the scan runs (today it misses `apps/web/public` and is vacuous in the `public-safe` job).
4. **REQ-TST-4** — `check:no-cookies` TARGETS must be extended to every SPA source location carrying ingestion-facing components; `check:licenses` needs no change.
5. **REQ-TST-5** — The served SPA shell document must satisfy the CSP nonce contract (`usercontent-csp.test.ts:104-134`): every `<script>` in it carries the per-request nonce — no bundler-injected inline bootstrap without one.
6. **REQ-TST-6** — A component-test stack (vitest+DOM env + RTL, or playwright-ct) must be stood up before the HTML-string suites are retired; the sync-machine/page-dispatch framework-free tests port unchanged.
7. **REQ-TST-7** — Journey steps whose asserts ride SSR mechanics (form-action posts, meta-refresh polls, document reloads, UA-sniffed withholding) must be re-specified to SPA-equivalent probes before their surface flips; green-flip semantics (`runner.ts:180-186`) unchanged.
8. **REQ-TST-8** — Bundle↔serve parity (asset-parity.test.ts + runner `assetHits`) must be re-expressed over the Vite manifest; every emitted asset referenced by the shell must serve 200.
9. **REQ-TST-9** — Route `<title>`/meta coverage on the auth'd SPA must be asserted by *something* (client head manager + journey or component test) — N10 covers public routes only.
10. **REQ-TST-10** — a11y automation exists only as journey-level axe (P1); the spec must decide whether component-level axe + visual regression are required new infra or explicitly deferred.
