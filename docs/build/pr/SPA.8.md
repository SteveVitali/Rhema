# SPA.8 — Safety-gate repair: non-vacuous markers, sourcemap provenance, env-leak tripwire, copy containment

Manifest row 105 · stacks on `stevevitali/spa-7-dom-contract-rtl` @ `8b81fb9` · merge policy
**OPERATOR** — do not merge from the build environment · **$0** spend, no deploys, no
production writes.

Implements `docs/tickets/105_SPA.8__safety-gates.md` per `docs/design/28_spa-safety-gates.md`
(the doubly-vacuous-gate diagnosis + three-layer fix) and `docs/research/04_test-surface-audit.md`
F5/F6; `docs/frontend-spa-spec.md` §9.

**Deployable dark:** additive-only — scanners, tests, and lint bans; the only production-source
diffs are sentinel constant exports in the private `packages/protocols` (outside the
`protocols_version` content-addressed trio — the frozen hash does not move). No flag set
anywhere; the SSR fallback untouched.

## Requirement IDs

**REQ-SAFE-1 · REQ-SAFE-2 · REQ-SAFE-3 · REQ-SAFE-4 · REQ-SAFE-5 · REQ-SAFE-8 · REQ-SAFE-9 ·
REQ-SAFE-10 · REQ-TST-3 · REQ-TST-4 · REQ-FW-9 · REQ-TL-14**

## What lands

### The three-layer protocol-IP gate (REQ-SAFE-1/2, REQ-TST-3) — no longer vacuous

- **Layer 1 — import lint:** `eslint.config.js` bans `@rhema/protocols`/`@rhema/evals` (+subpaths)
  in `apps/web/src/{spa,client}` and restricts `@rhema/api-client` to `import type`
  (`allowTypeImports`); `import.meta.env` is banned outside `src/spa/env.ts`, `process.env` banned
  outright. Verified by a live probe file.
- **Layer 2 — sourcemap provenance:** the marker checker parses every emitted `.map`,
  resolves `sources[]` against the map's directory, and fails on
  `packages/protocols/`·`packages/evals/`·`apps/run-task/`·bare `evals/` provenance.
- **Layer 3 — planted sentinels:** the four sentinels are exported string constants in
  `packages/protocols/src/{protocols.ts,manifest-types.ts}`; the checker **fails if they are
  absent** (arming proof) and **fails if any appears in an emitted bundle** — both directions
  test-proven.
- `TARGET_DIRS` now name real output: `apps/web/public` + `apps/web/public/spa` +
  `packages/api-client/dist` are **REQUIRED_DIRS (fail-closed)**; the old `dist`/`build`/mobile
  dirs stay opportunistic. CI builds `@rhema/web...` before scanning (SPA.1, order preserved).

### `check:no-cookies` extension (REQ-SAFE-3, REQ-TST-4)

- TARGETS += `apps/web/src/{spa,client}`, emitted `apps/web/public`, `packages/ui/src`.
- Brace-aware JSX (`name={"token"}`), credential-named JSX props (`password={…}`), and the
  existing header/field grammar — with a **value-position lookahead** so react-dom's minified
  `password:!0` input-type table is not a credential construct (fixture-proven).
- Live: 189 files scanned, zero hits.

### `check:spa-env` (new; REQ-SAFE-8, REQ-TL-14)

- Source leg: `import.meta.env` outside `env.ts`, any `process.env.*` read, secret-shaped
  `VITE_*` names in client sources + `.env*` files.
- Build-config leg: secret-patterned `process.env.*` in `vite.config.ts`/`build-client.mjs`
  (the `define` injection vector).
- Emitted leg: `process.env`/`import.meta.env` reads outside allowlists, banned server env names
  as **quoted string literals**, `VITE_*` secret names — `.map` scanning is `sourcesContent`-only
  (the `names[]` table is identifier metadata).
- Banned set = derived sensitive-shaped server env reads (armed floor ≥10; 15 derived) ∪ ~40
  curated Rhema plumbing names. 14 fixture tests.
- Wired as `pnpm check:spa-env`; CI `public-safe` runs it last; `AGENTS.md` updated.

### License non-vacuity (REQ-SAFE-9)

- `check-licenses` asserts enumeration covers the SPA dep set (react/react-dom/@tanstack/vite/
  plugin-react/axe-core) + a ≥100-package floor — a truncated graph is exit-2, not green.

### Copy containment (REQ-SAFE-4)

- `src/spa/copy-containment.test.ts` (51): no inline JSX text / literal user-facing attributes in
  SPA `.tsx`; every `COPY.*` reference resolves to a `collectCopyStrings` leaf.
- `launch-surface.test.ts` sweeps `apps/web/src/spa` recursively (84 tests).

### CI order (REQ-SAFE-9)

install → stub/evals build → `@rhema/web...` build → gitleaks → licenses → markers+provenance →
no-cookies → spa-budget → **spa-env**.

## Tests

- `scripts/check-protocol-markers.test.mjs` (20) + `scripts/lib/protocol-markers.test.mjs` (4)
- `scripts/check-no-cookies.test.mjs` (23)
- `scripts/check-spa-env.test.mjs` (14)
- `scripts/lib/license-policy.test.mjs` (+3)
- `apps/web/src/spa/copy-containment.test.ts` (51) · `launch-surface.test.ts` (84, +SPA sweep)

Every new behaviour carries a test that fails if removed — the fixtures prove each gate fails on
its target violation (leaked sentinel, missing sentinel, missing required dir, provenance hit,
cookie construct, env leak, missing license coverage, inline copy).

## Verification

`pnpm turbo build lint typecheck` **135/135** · `pnpm test` **470 files / 4,965 pass / 0 fail** ·
`check:licenses` 822 pkgs · `check:protocol-markers` armed+169 files · `check:no-cookies` 189 ·
`check:spa-budget` entry 157.8/250 kB · `check:spa-env` 94 artifacts.

## Notes for the operator

- Nothing user-visible or runtime changes — this is scanner/lint/test tooling plus four exported
  sentinel constants in the private protocols package.
- The marker gate is now *load-bearing*: dropping the SPA build step in `public-safe` would fail
  closed rather than silently skip, which is the intended behaviour (fail-closed REQUIRED_DIRS).
- `src/spa/env.ts` is declared as the single `import.meta.env` reader seam but intentionally not
  created — nothing reads env in the client today; the lint exemption exists for its first
  consumer.
- Design/28 + research/04 carry dated `Resolution` addenda; the original findings are preserved
  verbatim (append-only).
- `D-SPA.6-1` remains OPEN (needs the operator's chain merge+deploy + CI image digests +
  `rhema:spaSurfaces` stack config); blocker-update note appended.
