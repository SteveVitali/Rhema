# SPA.7 — Emitted-DOM contract manifest + component-test stack (Vitest+happy-dom+RTL+axe)

Manifest row 104 · stacks on `stevevitali/spa-6-journey-harness` @ `68cce50` · merge policy
**OPERATOR** — do not merge from the build environment · **$0** spend, no deploys, no
production writes.

Implements `docs/tickets/104_SPA.7__dom-contract-rtl.md` per `docs/design/27_spa-acceptance-mechanics.md`
(manifest shape + the lint's three inclusions + component-test disposition) and
`docs/research/04_test-surface-audit.md` F4 (the load-bearing hook set); `docs/frontend-spa-spec.md` §10.

**Deployable dark:** additive-only — the manifest, the lint, and the test stack are new files;
the app's only changes are additive `data-*` emissions (`data-dossier` on `DossierView`) and one
prose reword in a journey `legNotes` string. No flag set anywhere; the SSR fallback untouched.

## Requirement IDs

**REQ-VFY-1 · REQ-VFY-2 · REQ-VFY-6 · REQ-TST-2 · REQ-TST-6 · REQ-TST-10**

## What lands

- **`apps/web/src/dom-contract.ts` (new)** — `DOM_CONTRACT`, the committed emitted-DOM contract:
  **478 entries over 18 surface keys** (all 15 `SpaSurface` flip keys + `shell`/`public`/`shared`
  non-flip buckets). Seven kinds via builders: `a()` attr literals, `f()` attr-prefix families
  (`data-label-`), `r()` ARIA roles, `n()`/`nf()` field names + grammar prefixes (`ed.*`,
  `toggle.*`, `rigor_*`), `u()`/`uf()` URL params + param families. `required`/`conditional`
  marks whether every render emits it.
- **`scripts/check-dom-contract.mjs` (new)** — `pnpm check:dom-contract` enforces
  `journey/test/SPA selectors ⊆ manifest ⊆ emitted+asserted` over a comment-stripped,
  symlink-safe scan (`apps/web`, `packages/{ui,journeys,contracts}`, `apps/api`). Positional
  manifest parser tolerates Prettier-wrapped calls; the manifest file is excluded from the
  emission scan so it can't self-witness. Wired into root scripts and the CI
  `typecheck/lint/unit` job after `pnpm test`.
- **Component-test stack (REQ-VFY-1/6, REQ-TST-10):** `@testing-library/{dom,jest-dom,react,
  user-event}` + `axe-core` devDeps; `environmentMatchGlobs` routes `*.dom.test.{ts,tsx}` to
  happy-dom at both root and `apps/web` scope; `test-setup.ts` registers jest-dom + RTL cleanup;
  `src/spa/testkit.ts` ships `assertSurfaceEmissions(container, surface)` — the per-surface
  parity helper every SPA surface ticket consumes — and `expectAccessible(el)`, component-axe
  with layout-dependent rules (color-contrast et al.) disabled for happy-dom.
- **Contract repairs:** `DossierView`'s root `<article>` emits `data-dossier` (additive);
  a `legNotes` phrase "data-rights" → "rights-export" so prose can't read as a selector.

## Coverage table (the lint's own report)

| surface | hooks | emitted | asserted |
|---|---|---|---|
| billing | 16 | 16 | 16 |
| dossier | 102 | 102 | 102 |
| editor | 55 | 55 | 55 |
| export | 4 | 4 | 4 |
| figures | 8 | 8 | 8 |
| ide-chrome | 55 | 55 | 55 |
| inbox | 9 | 9 | 9 |
| onboarding | 20 | 20 | 20 |
| outline | 7 | 7 | 7 |
| project-home | 34 | 34 | 34 |
| public | 16 | 16 | 16 |
| run-report | 3 | 3 | 3 |
| run-sheet | 32 | 32 | 32 |
| settings | 34 | 34 | 34 |
| shared | 18 | 18 | 18 |
| shell | 16 | 16 | 16 |
| usage | 9 | 9 | 9 |
| voices | 40 | 40 | 40 |

478 manifest entries; 0 unmanifested journey/test/SPA selector literals. research/04's ~90
journey `data-*` hooks are a strict subset — the inclusion is machine-checked, not estimated.
Entries carry assertion coverage by construction (MANIFEST ⊆ ASSERTED is a lint failure leg);
unproven hooks were deliberately excluded and land with their owning surface tickets.

## Tests

- `scripts/check-dom-contract.test.mjs` (9) — temp-fixture legs assert each failure mode:
  unmanifested journey literal, unemitted entry, unasserted entry; conformant fixture passes.
- `apps/web/src/dom-contract.test.tsx` (7) — manifest structure: surface-key totality, unique
  hooks, kind/role field sanity, required-vocabulary pins (`data-fmt`, `data-spa-surface`,
  `data-spa-error`, `ed.`/`data-label-`/`toggle.` families).
- `apps/web/src/spa/dom-contract.dom.test.tsx` (4) — the reference component test: `ChatDesk`
  mounted under happy-dom, composer exercised via user-event, `assertSurfaceEmissions` over the
  rendered tree, `data-spa-error` + `data-fmt` coverage, component-axe — **plus a non-vacuity
  pin** proving axe rejects an invalid fixture (img without alt).

## Verification

`pnpm check:dom-contract` OK · `pnpm turbo build lint typecheck` 135/135 · `pnpm test`
465 files / 4,799 pass / 0 fail · `pnpm check:licenses` 822 pkgs (axe-core MPL-2.0 under the
existing exception) · `pnpm check:spa-budget` OK · prettier clean on touched files.
One pre-existing lint warning (unused `no-var` disable in `spa.dom.test.tsx`, a SPA.6 file —
untouched per additive-only).

## Notes for the operator

- Nothing user-visible changes; the manifest/lint/test stack is build tooling. The only runtime
  diff is `data-dossier` appearing in `DossierView`'s SSR markup — additive, selector-only.
- Surface tickets (SPA.8+) now consume `assertSurfaceEmissions` + `expectAccessible`; a surface
  PR adding a hook without an emission+assertion will fail `check:dom-contract` loudly.
