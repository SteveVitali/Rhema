# 28_spa-safety-gates — Safety gates over a bundled SPA

**Stream:** D
**Researched:** 2026-10-07
**Author:** design-row worker (subagent)
**Ledger rows covered:** D2
**Confidence overall:** high

*(Namespace note: the worker drafted these as `REQ-GATE-1..10`, but `REQ-GATE-*` is the product spec's approval-gate namespace (REQ-GATE-3/8/10/12/13 in `docs/build/LEDGER.md`). Emitted here as `REQ-SAFE-1..10` to disambiguate.)*

## Findings

### F1 — The protocol-marker gate scans the wrong directories, and the silent-skip is the vacuity mechanism

**Claim:** `check:protocol-markers` TARGET_DIRS are `apps/web/dist`, `apps/web/build`, `apps/mobile/dist`, `packages/api-client/dist` (`scripts/check-protocol-markers.mjs:17-22`); esbuild actually emits to `apps/web/public/` (`build-client.mjs:15-31`), the `public-safe` job never builds `@rhema/web` (`ci.yml:199-235` builds only `protocols-stub`+`evals`), and — critically — the script *skips missing directories silently* (`:5-6`, `:39`), so the gap is invisible rather than failing.
**Status:** VERIFIED
**Evidence:** file:lines above; A4/F5 (`docs/research/04_test-surface-audit.md:78-85`) reached the same verdict; `apps/web/Dockerfile:30` confirms the runtime serves `/app/public`.
**Retrieved:** 2026-10-07T22:30:00Z
**Implication for the spec:** Two orthogonal fixes: (a) TARGET_DIRS must name the real Vite `outDir` wherever B2 puts it — note that Vite's default `apps/web/dist` is *already in the list*, so the directory fix may be free, but only if (b) the public-safe job builds the SPA before scanning; and (c) declared-required targets must **fail closed when absent** — the scan needs a `REQUIRED_DIRS` set (the SPA outDir, `packages/api-client/dist`) that exits non-zero if missing, while keeping opportunistic dirs (mobile) skippable. Without (c) the whole gate degrades to vacuous again the first time a build step is dropped.
**Outline delta:** EXTENDS REQ-TST-3 — the fix is not just "point at the new dir"; it is *build-then-scan plus fail-closed targets*.

### F2 — Substring markers cannot prove protocol containment in a minified bundle; a three-layer gate is needed

**Claim:** `findMarkers` is a `String.includes` scan (`scripts/lib/protocol-markers.mjs:23-29`). Sentinels planted as **string literals survive minification verbatim** (minifiers mangle identifiers, not string contents — the fixture is exactly this: `window.__x = "prelude RHEMA-PROTOCOL-SECRET rubric"`, `protocol-markers.test.mjs:6`), but (a) sentinels planted as *comments* are stripped by esbuild/Rollup minification and never reach the artifact, (b) a sentinel as an unused module-level `const` can be **treeshaken out** of a chunk whose *other* exports leaked, and (c) **no sentinels exist in `packages/protocols` sources today at all** — a repo-wide grep finds the four markers only in the checker, its test, and the journeys artifact-scan helper (`packages/journeys/src/stb5a-helpers.ts:15-20`). The marker gate is therefore vacuous twice over.
**Status:** VERIFIED
**Evidence:** grep over `packages/` for all four sentinels (zero hits outside checkers/helpers/tests); `check-protocol-markers.mjs` + `scripts/lib/protocol-markers.test.mjs`; `stb5a-helpers.ts` (the byte-level variant `findProtocolMarkersInBytes` already scans journey artifacts — precedent for scanning emitted binaries).
**Retrieved:** 2026-10-07T22:30:00Z
**Implication for the spec:** The bundled-SPA gate is three layers, ordered by strength:
1. **Import-boundary lint** — `no-restricted-imports` on the SPA/client source tree banning `@rhema/protocols`, `@rhema/evals` (and transitively any protocol-only package), same pattern as the findings-core React ban (`eslint.config.js:82-92`). Cheapest, runs on every file.
2. **Bundle provenance scan** — Vite `build.sourcemap: true` emits `.map` files whose `sources[]` arrays record original file paths *minification-proof*: any `packages/protocols/` / `packages/evals/` / `apps/run-task/` path inside a shipped chunk's map is a deterministic leak. The scan already reads `.map` files (TEXT_EXT, `check-protocol-markers.mjs:23`); extend it to parse `sources` rather than only substring-match.
3. **Marker substring scan retained** — and the sentinel set must actually be *planted*: `packages/protocols` sources tag sensitive blocks with the sentinels as **exported string constants adjacent to the protected text** (not comments — those are stripped), acknowledging treeshaking can still drop an unreferenced constant; it is a belt on layer 2, not the proof.
**Outline delta:** CORRECTS the implicit premise that marker-scanning suffices post-bundling — it was never sufficient even pre-bundling (no planted markers); the SPA migration is the forcing function to build the provenance layer.

### F3 — `check:no-cookies` misses JSX brace-props and the entire client tree; the SPA adds dirs, not new rules

**Claim:** The gate's RULES (`scripts/check-no-cookies.mjs:58-75`) are textual over TARGETS (`:29-56`) that pin five web server files + `voice-surfaces.test.ts` + api-client + schema + OpenAPI. Two real gaps: (a) the form-field rule `name\s*=\s*["']…` matches `name="token"` but **not** JSX `name={"token"}` or `name={expr}` — and the repo already writes brace-props (`pages.tsx:2192,4642,4769,4786,4831,5222,5522` — `name={\`ov_${d.kind}\`}` etc.), so the evasion shape is idiomatic here; (b) `apps/web/src/client/**` is absent entirely — `landing.ts`, the *pre-auth ingestion dropzone*, is an unscanned ingestion surface today.
**Status:** VERIFIED
**Evidence:** file:lines above; rules are credential-*construct* regexes; the ALLOW line (`:78`) documents the viewer-session exemption.
**Retrieved:** 2026-10-07T22:30:00Z
**Implication for the spec:** Add directories (the walker recurses, `:82-98`), not more file pins: the SPA source root (whichever dir B1/B2 name — e.g. `apps/web/src/spa` or an expanded `apps/web/src/client`), `apps/web/src/client` as it exists today, and any `packages/ui` surface that renders ingestion/connections/samples UI once components migrate there. Extend the form-field rule to `name\s*=\s*\{?\s*["'`]` (brace-aware) and add a JSX prop-name pattern for credential-named props carrying values (`(password|token|api_?key|secret|bearer)\s*=`). Genuinely dynamic `name={var}` remains regex-blind — the proportionate second layer is the BFF contract: ingestion endpoints keep their existing server-side rejection tests, since the wire grammar, not the JSX, is the security boundary.
**Outline delta:** EXTENDS REQ-TST-4 with the concrete rule gap and the landing.ts omission.

### F4 — Copy/vocab lint: the COPY table must remain the single string source; the audit sweeps need the new dirs

**Claim:** `collectCopyStrings` lives at `apps/web/src/copy.ts:2264-2279`, is re-exported from `@rhema/web` (`index.ts:12`), and is consumed by `copy.test.ts:18-135` (`lintCopy` vs Appendix D.2 + the ADR-059 jargon lint) and `packages/security-checks/src/launch-surface.test.ts:14,100-114` (`lintGrowthCopy` + the independent CLAIM_PATTERNS sweep over `SURFACE_FILES` + `apps/web/src/client/*` + `apps/export/src/*`). The lints consume `[key, text]` pairs — location-agnostic. Separately, `rhema/no-banned-strings` is an AST rule over every `Literal`/`TemplateElement` in non-ignored sources (`tools/eslint-plugin-rhema/rules/no-banned-strings.js:52-59`), so it already covers `.tsx` SPA sources with no config change — provided the files aren't under an ignore (`**/dist/**` is already ignored, `eslint.config.js:32`).
**Status:** VERIFIED
**Evidence:** file:lines above.
**Retrieved:** 2026-10-07T22:30:00Z
**Implication for the spec:** The gap is *coverage*, not mechanism: Appendix-D.2/jargon/claim lints see only COPY-table leaves, so a JSX label written inline (`<button>Run review</button>`) bypasses everything except the narrow 3-term ESLint list. Spec: (a) all SPA user-facing strings stay leaves of the one `COPY` table — components import keys; the table ships in the bundle, which is safe (it is rendered text, not protocol IP — REQ-ARCH-33 guards protocol text, not product copy); (b) `collectCopyStrings` must remain an importable export — if the SPA moves COPY to a shared package, `security-checks` and `copy.test.ts` imports are updated in the same PR; (c) `launch-surface.test.ts`'s audit-local sweep gains the SPA source root (it currently walks `apps/web/src/client` — extend, don't replace); (d) optional but recommended: a `rhema/no-inline-copy` lint or convention check flagging JSX text nodes outside allowlisted files — the proportionate version is a test that greps SPA sources for JSX text and fails on new unapproved inline strings.
**Outline delta:** EXTENDS the copy-invariant — names the enforcement path for client-rendered strings.

### F5 — CSP in the bundled world: the nonce middleware still works if the shell is a served document; `form-action` loses its job and there is no `navigate-to` successor

**Claim:** The current policy (`server.ts:341-353`) is `script-src 'self' 'nonce-N'` + `style-src 'self' 'unsafe-inline'` + `connect-src 'self' <collabWsUrl-origin>` + `form-action 'self' <STRIPE_HOSTED_ORIGINS> <GOOGLE_OAUTH_ORIGINS>`, applied by middleware that regex-stamps `nonce=` onto every `<script` in every `text/html` response (`:354-371`), with the contract test requiring nonce-on-every-script + a fresh nonce per request (`usercontent-csp.test.ts:104-134`). For the SPA: Vite emits `<script type="module" src>` tags plus an inline modulepreload-polyfill script into `dist/index.html`; `build.modulePreload.polyfill:false` removes the inline one, and Vite ≥5 `html.cspNonce` emits a nonce *placeholder* into script/link/style tags plus a `<meta property="csp-nonce">` the runtime reads when injecting preload links (vitejs/vite#16052, #20531). `<link rel="modulepreload">`/stylesheet fetches are matched against script-src/style-src host sources and are covered by the retained `'self'`. The deltas: (a) the shell document must be **served through the stamping path** — a static-file mount bypasses it and instantly violates the nonce-every-script contract; (b) `form-action` governs form submissions and their redirect targets only (BILL.3/MAINT.5 evidence) — SPA hand-offs via `location.assign` are **not** covered, and `navigate-to`, the would-be successor, was removed from the CSP spec in Sept 2022 and never shipped in any browser (w3c/webappsec-csp#564); (c) React style-attributes and runtime `<style>` tags are both covered by the existing `style-src 'unsafe-inline'` — tightening to nonce-based style-src would need `'unsafe-hashes'` and is not worth it; (d) `connect-src` stays `'self'` + the explicit collab WSS origin (WebKit) while the BFF remains same-origin — it only changes if B3 moves api calls cross-origin.
**Status:** VERIFIED (repo facts); VERIFIED (navigate-to removal); the Vite nonce mechanics are VERIFIED against the linked Vite PRs/issues.
**Evidence:** `server.ts:341-371`, `usercontent-csp.test.ts:104-134`, `render.tsx:102-113,175` (inline dwell-beacon + theme BOOT scripts the shell equivalent must nonce), `02_island-contract-map.md` REQ-ISL-15; https://github.com/vitejs/vite/pull/16052 ; https://github.com/vitejs/vite/issues/20531 ; https://github.com/w3c/webappsec-csp/pull/564 ; https://labs.copperbaytech.com/hardencheck/guides/csp-react-spa-app.html (modulepreload-polyfill inline script + `polyfill:false` option).
**Retrieved:** 2026-10-07T22:30:00Z
**Implication for the spec:** (1) The SPA `index.html` is served by a Hono route returning it as `text/html` through the existing stamping middleware — the regex already stamps `<script type="module">` and inline scripts uniformly; the theme-boot inline script (REQ-ISL-15) rides the same path. (2) Outbound hand-offs (Stripe, Google) keep the server-validated-302 shape: the SPA navigates to a same-origin BFF endpoint that 302s to an allowlisted origin — the `STRIPE_HOSTED_ORIGINS`/`GOOGLE_OAUTH_ORIGINS` validators (already shared between CSP and the redirect validator, ADR-027) become the *only* enforcement layer for JS-initiated navigation; client code must not `location.assign` a response-supplied URL without the contracts allowlist check. (3) `form-action` stays in the policy while any SSR form survives (public SSR set + strangler transition) — drop it only when the last form dies. (4) The dwell-beacon logic moves into the bundle as a React effect rather than a second inline script.
**Outline delta:** CORRECTS the assumption that CSP carries the hand-off invariant into the SPA — it does not; the compensating control is the BFF redirect validator, which must be pinned by test.

### F6 — Bundle budget: realistic initial ceilings, enforced by a measured-gzip script over the Vite output

**Claim:** Evidence-based size anchors: a bare Vite React+ReactDOM app emits ~142.7 kB raw / ~45.8 kB gzip; `react-dom` cjs prod is 122.3 kB → 39.5 kB gzip (React PR sizebot); `@tanstack/react-router` is ~31 kB gzip standalone, and TanStack's own `react-router.minimal` benchmark scenario (React+Router, code-split) reports 88.15 KiB gzip *total* emitted client JS; CodeMirror 6 basic-setup ~93 kB gzip; `y-prosemirror` 293.7 kB *minified* (gzip lower, unverified); `@tanstack/react-query` ~13 kB gzip (approximate). ProseMirror+Yjs+Hocuspocus+y-indexeddb are the heavy tail and must be a lazy chunk — never the entry.
**Status:** VERIFIED for the anchors as cited (third-party measurements, not local builds); the resulting ceilings are a proposal to calibrate on the first real build.
**Evidence:** https://news.ycombinator.com/item?id=40822632 (45.76 kB gzip hello-world); https://github.com/facebook/react/pull/20753 (react-dom 122.28 kB → 39.49 kB gzip); https://devpick.co/pkg/@tanstack/react-router (31 kB gzip); https://github.com/TanStack/router/tree/main/benchmarks/bundle-size + PR https://github.com/TanStack/router/pull/7007 (react-router.minimal 88.15 KiB gzip); https://github.com/codemirror/codemirror.next/issues/760 (CM6 ≈93–124 kB gzip); https://npmx.dev/package/y-prosemirror (293.7 kB minified).
**Retrieved:** 2026-10-07T22:30:00Z
**Implication for the spec:** Enforce with a repo script, not a new SaaS dep — consistent with `scripts/*.mjs` culture: `scripts/check-bundle-budget.mjs` reads `apps/web/dist` (Vite `build.manifest:true` → `.vite/manifest.json` for the entry/chunk graph), gzips each emitted `.js`/`.css` via Node zlib, and diffs against a checked-in `bundle-budget.json`. Proposed initial ceilings (gzip): **entry graph ≤ 250 kB** (React+Router+Query+tokens+shell ≈100 kB measured floor + app-code headroom); **editor/collab lazy group ≤ 400 kB** (PM+Yjs+y-prosemirror+Hocuspocus+y-IDB); **CodeMirror chunk ≤ 130 kB** (only if Source mode ships); **any other async chunk ≤ 150 kB**; **total JS ≤ 800 kB**; **CSS ≤ 60 kB**. Numbers get calibrated down once the first real manifest exists — the mechanism is the deliverable.
**Outline delta:** NEW — no budget mechanism exists today (islands are ~unmeasured esbuild iifes).

### F7 — Vite env exposure: the repo has zero `import.meta.env`/`VITE_*` today; the safe default is no build-time env at all

**Claim:** Repo-wide grep finds zero `VITE_`/`import.meta.env` uses — all config is server-side `process.env` in `main.ts:48-114`. Vite statically inlines `import.meta.env.VITE_*` (and any `define`-d `process.env.*`) into the bundle; anything so inlined is public by construction, and REQ-ARCH-30 bars secrets from client-reachable code.
**Status:** VERIFIED
**Evidence:** grep (`VITE_|import\.meta\.env` — no matches outside this note's sources); `apps/web/src/main.ts:48-114`.
**Retrieved:** 2026-10-07T22:30:00Z
**Implication for the spec:** Prefer the existing pattern over env-inlining: runtime config (collab origin, build SHA, feature flags) reaches the SPA as **server-rendered bootstrap JSON in the nonced shell** (the successor of today's `script[type=application/json]`/`data-*` blobs) — nothing baked at build time, so builds are stage-portable and there is no VITE_ surface to police. Whatever `VITE_*` remains (build-time-only constants that are public by construction) is guarded by: (a) one `env.ts` module as the sole `import.meta.env` reader — an ESLint `no-restricted-syntax` ban on `import.meta.env` elsewhere in the client tree; (b) a `check:spa-env` script failing on `VITE_*` names matching `/(KEY|SECRET|TOKEN|PASSWORD|PRIVATE|CREDENTIAL)/i` in sources/`.env*` files, and scanning `dist` for the *names* of known server env vars (`BETTER_AUTH_SECRET`, `API_BASE_URL`-as-value, `DATABASE_URL`) as a cheap leak tripwire.
**Outline delta:** NEW requirement — no prior convention existed to violate.

### F8 — The licence gate auto-covers the new dep set; the only requirement is ordering

**Claim:** `check-licenses` enumerates the installed graph via `pnpm licenses list --json` (`check-licenses.mjs:23-38`) and evaluates SPDX expressions against `licenses.allowlist.json` (MIT/ISC/BSD-2/3/Apache-2.0/BlueOak/CC0/Unlicense/Python-2.0) + `licenses.exceptions.json`; a *missing* license field fails closed (`license-policy.mjs:28-30`). React/react-dom/TanStack/Vite/@vitejs plugins/yjs are all MIT-class and pass with zero allowlist edits; the public-safe job already runs `pnpm install --frozen-lockfile` before the check (`ci.yml:220`), so the updated lockfile is the enumeration source.
**Status:** VERIFIED
**Evidence:** file:lines above.
**Retrieved:** 2026-10-07T22:30:00Z
**Implication for the spec:** No mechanism change; the requirement is that `install` precedes `check:licenses` in the job (true today — preserve the ordering through the job's rebuild), plus awareness that any non-allowlisted transitive dep (e.g. an LGPL asset lib) fails the job until either replaced or excepted with a checked-in rationale.
**Outline delta:** CONFIRMS REQ-TST-4's "no change needed" verdict.

### F9 — The public-safe job's new shape is build-then-scan with three new checks

**Claim:** Today's five real steps (`ci.yml:220-235`) become: install → stub/evals build → **SPA build** → gitleaks → licenses → markers → no-cookies → **bundle-budget** → **spa-env**. Lint hygiene for the new output dir is already correct: `**/dist/**` is ESLint-ignored (`eslint.config.js:32`) and `dist` is `.prettierignore`d (`.prettierignore:1`) — generated bundles stay out of the lint/format graph while remaining inside the marker/provenance scan.
**Status:** VERIFIED (as a diff against the current job); the step list is a proposal.
**Evidence:** `ci.yml:199-235`; `eslint.config.js:31-50`; `.prettierignore`; Dockerfile's `@rhema/web...` filter pattern (`apps/web/Dockerfile:15`) for building with workspace deps.
**Retrieved:** 2026-10-07T22:30:00Z
**Implication for the spec:** Concretely — add `- run: pnpm turbo build --filter=@rhema/web...` after the stub build (the `...` pulls workspace deps incl. `@rhema/api-client`, whose `dist` is also a scan target); repoint `check:protocol-markers` at the real outDir with REQUIRED_DIRS fail-closed + the sourcemap provenance scan; extend `check:no-cookies` TARGETS; add `check:bundle-budget` and `check:spa-env`. One path-collision to resolve with B2: Vite's default `publicDir` is `public/` (static files copied into outDir) while `apps/web/public/` currently holds the esbuild bundles+fonts — the SPA layout must either adopt `public/` as Vite's static dir (fonts move there, outDir becomes `dist/`) or configure `publicDir`/`outDir` explicitly; whichever lands, TARGET_DIRS + ESLint ignore + Dockerfile COPY must move together.
**Outline delta:** EXTENDS REQ-TST-3/4 into the full job delta.

## Gate map (summary)

| Gate | Today | Bundled-SPA requirement |
|---|---|---|
| `check:protocol-markers` | scans `dist`/`build` dirs that never exist; silent-skip | scan the real Vite outDir; REQUIRED_DIRS fail closed; + sourcemap `sources[]` provenance scan; sentinels planted as string consts |
| `check:no-cookies` | 5 web files + api-client + schema | + SPA source root, `apps/web/src/client`, ingestion-bearing `packages/ui` surfaces; brace-aware JSX rules |
| vocab/copy lints | `COPY` table + `collectCopyStrings` consumers + AST banned-strings | SPA strings flow through `COPY`; audit sweep covers SPA dirs; optional no-inline-copy lint |
| CSP | SSR documents, nonce middleware | shell served through stamping route; module/polyfill scripts nonced; hand-offs via server-validated 302s (form-action can't cover `location.assign`; no `navigate-to`) |
| bundle budget | none | `check-bundle-budget.mjs` + checked-in gzip ceilings in public-safe |
| env hygiene | `process.env` server-side only | bootstrap JSON > `VITE_*`; single `env.ts`; secret-name guard + dist tripwire |
| `check:licenses` | whole-graph SPDX policy | unchanged; install ordering preserved |
| gitleaks | repo scan | unchanged |

## Open questions

- **REQ id namespace collision** — `REQ-GATE-*` already denotes *approval gates* in the product spec (REQ-GATE-3/8/10/12/13 in `docs/build/LEDGER.md`). Resolved by the parent: emitted here as `REQ-SAFE-*`.
- Where does B2 put the Vite `outDir`/`publicDir`, and does `apps/web/public/` retire or become the static dir? TARGET_DIRS, ESLint/prettier ignores, and the Dockerfile COPY must move as one change.
- Does B3 keep all client traffic same-origin through the BFF? If any api call goes cross-origin, `connect-src` gains the api origin and `credentials` posture on that fetch must be re-audited.
- Sourcemode/CodeMirror disposition (02_island-contract-map Open q1) decides whether the ≤130 kB CodeMirror chunk ceiling is needed at all.
- Should the marker scan also run against the *built* `dist` inside the Docker image (image job) — i.e. is CI-time scanning sufficient, or does the image get a post-build verify leg?
- Sentinel planting: does `packages/protocols` adopt the four existing sentinels as exported constants, or should the marker set grow (per-protocol tags) while we're touching it?

## Spec requirements emitted

1. **REQ-SAFE-1** — `check:protocol-markers` scans the real SPA output directory (whatever B2 names it); a declared-required target that is absent at scan time fails closed instead of being silently skipped; the `public-safe` job builds `@rhema/web` (with workspace deps, `--filter=@rhema/web...`) before the scan.
2. **REQ-SAFE-2** — Bundle provenance: the marker script additionally parses emitted `.map` `sources[]` and fails on any path under `packages/protocols/`, `packages/evals/`, or `apps/run-task/`; the SPA/client source tree carries `no-restricted-imports` bans on `@rhema/protocols`/`@rhema/evals`; protocol sources plant the sentinels as exported string constants (surviving minification) with the marker scan retained as the third layer.
3. **REQ-SAFE-3** — `check:no-cookies` TARGETS gain the SPA source root, `apps/web/src/client/**`, and any `packages/ui` directory rendering ingestion/connections/samples surfaces; the form-field rule is brace-aware (`name={…}`) and credential-named JSX props are covered.
4. **REQ-SAFE-4** — Every SPA user-facing string is a leaf of the single `COPY` table (or a spec-declared equivalent table); `collectCopyStrings` remains an exported seam consumed by `copy.test.ts` and `packages/security-checks`; the launch-surface audit sweep extends to the SPA source dirs; JSX inline copy outside allowlisted files is flagged.
5. **REQ-SAFE-5** — The SPA shell is served as `text/html` through the nonce-stamping middleware (never a static mount); every `<script>` — module entry, inline theme-boot (REQ-ISL-15), and any modulepreload polyfill — carries the per-request nonce; `usercontent-csp.test.ts` extends to the shell route.
6. **REQ-SAFE-6** — Outbound hand-offs (Stripe, Google) remain BFF endpoints that 302 to origins validated against `STRIPE_HOSTED_ORIGINS`/`GOOGLE_OAUTH_ORIGINS`; SPA code never `location.assign`s an external URL except through those endpoints; `form-action` stays in the policy until the last SSR form is gone; `connect-src` stays `'self'` + the explicit collab WSS origin (revisited only if B3 goes cross-origin).
7. **REQ-SAFE-7** — A checked-in `bundle-budget.json` + `check-bundle-budget.mjs` measure gzip size of every emitted JS/CSS artifact against per-chunk-group ceilings (initial proposal: entry ≤250 kB, editor/collab lazy group ≤400 kB, CodeMirror ≤130 kB, other async ≤150 kB, total JS ≤800 kB, CSS ≤60 kB — calibrated on the first real build); runs in `public-safe` after the SPA build.
8. **REQ-SAFE-8** — Runtime config reaches the SPA via server-rendered bootstrap JSON in the nonced shell; a single `env.ts` module is the only permitted `import.meta.env` reader; `VITE_*` names matching secret patterns fail `check:spa-env`, and the built bundle is scanned for server env-var names as a leak tripwire.
9. **REQ-SAFE-9** — The `public-safe` job's step order becomes: install → stub build → SPA build → gitleaks → licenses → markers+provenance → no-cookies → bundle-budget → spa-env; `install` precedes the licence enumeration.
10. **REQ-SAFE-10** — Vite `outDir`/`publicDir`, the ESLint/prettier ignore sets, `check:protocol-markers` TARGET_DIRS, and the Dockerfile asset COPY change in the same PR — generated output stays outside the lint graph and inside the scan graph.
