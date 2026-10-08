# SPA.7 — Emitted-DOM contract manifest + component-test stack (Vitest+happy-dom+RTL+axe) (run ledger)

- **Status:** DONE (Stage A; deterministic-only — offline ticket, no live legs)
- **Harness:** Devin CLI (agentic coding subagent); model: Cognition Devin; tier: n/a (build work)
- **Ticket:** `docs/tickets/104_SPA.7__dom-contract-rtl.md` (manifest row 104)
- **Branch:** `stevevitali/spa-7-dom-contract-rtl`, stacked on
  `stevevitali/spa-6-journey-harness` @ `68cce50` (`OPERATOR` merge policy, **not merged**).
- **Goal:** the testability substrate — a committed `apps/web/src/dom-contract.ts` manifest keyed
  by surface enumerating the load-bearing `data-*`/role/field/URL-param vocabulary; a
  `check:dom-contract` lint wiring journey selector literals + SSR emits + SPA emits to the
  manifest; and the component-test stack (Vitest + happy-dom + `@testing-library/react` +
  user-event + jest-dom + component-axe on the interactive subset) with a reference test proving
  it (REQ-VFY-1/2/6, REQ-TST-2/6/10).
- **Spend:** $0. No deploys, no production writes, no live legs.

## 0 — Context load

- DEFERRALS.md read first (per AGENTS): `D-SPA.6-1` was assessed against the
  **2026-10-08T12:29Z operator ruling** (PHASE LOG) that makes `pr-<n>` preview stacks
  worker-self-serve — the ruling names D-SPA.6-1 as a leg the next preview-capable worker
  should run. It stays OPEN: leg (a) still needs the operator's merge+deploy of the chain
  (prod `6ebb1cb` predates the marker vocabulary), and leg (b) needs the CI `images` digests
  for the head SHA + `rhema:spaSurfaces` stack config — PR #125's `images` job was still
  pending at closeout, so no preview target for this head existed at run time. A dated
  blocker-update note was appended to the row. No new row opened — every ticket AC is
  discharged deterministically this run.
- LEDGER CURRENT STATE read: `nextTicket: SPA.7`, `chainTip: stevevitali/spa-6-journey-harness`,
  `mergePolicy: OPERATOR`, `round: 4`, `dispatchTarget: subagent`, `pinnedBaseSha: fab08ed`.
- Design sources applied, not re-derived: `docs/design/27_spa-acceptance-mechanics.md` (the
  manifest shape, the lint's three inclusions, the component-test disposition table);
  `docs/research/04_test-surface-audit.md` F4 (the ~90 load-bearing journey hooks + the
  SSR-mechanics exclusions); `docs/frontend-spa-spec.md` §10 (REQ-VFY-1/2/6, REQ-TST-2/6/10);
  `apps/web/src/pages.tsx` + `packages/journeys/src/steps.ts`/`stb5a.ts` (the selector sources
  the lint scans).

## 1 — What landed

### `apps/web/src/dom-contract.ts` (new) — the committed manifest (REQ-VFY-2, REQ-TST-2)

- `DOM_CONTRACT: Record<DomContractSurface, readonly DomContractEntry[]>` — **478 entries over
  18 surface keys**: all 15 `SpaSurface` flip keys + three non-flip buckets (`shell` —
  document/settle markers; `public` — the always-SSR funnel; `shared` — cross-surface widgets
  whose hooks must hold on every surface that emits them).
- Seven entry kinds, one builder each: `a()` attr literals (`data-x`), `f()` attr-prefix
  families (`data-label-` covers `data-label-{saving,saved,…}`), `r()` ARIA roles, `n()`/`nf()`
  form-field names + field-grammar prefixes (the `ed.*` gate-card/outline grammar,
  `toggle.*`/`rigor_*` run-sheet families), `u()`/`uf()` URL flash-params + param families
  (`?sort=`, `?after=`/`?created=`, `toggle.*` prefs).
- `role` = `"required"` (always emitted on the surface's render) or `"conditional"`
  (state/fixture-dependent); `emittedBy` is informational — the lint re-derives real emission
  by scanning sources. A file header comment pins the format contract the parser tolerates
  (builder calls only; Prettier may wrap them across lines).
- Coverage: the lint's own report is the coverage table — **478 hooks, 478 emitted, 478
  asserted** — and 0 unmanifested journey literals. research/04's ~90 journey `data-*` hooks
  are a strict subset of the asserted manifest (the subset inclusion is machine-checked, not
  estimated).

### `scripts/check-dom-contract.mjs` (new) — the contract lint (REQ-VFY-2)

Enforces three inclusions over a comment-stripped, symlink-safe source scan
(`apps/web/src`, `packages/{ui,journeys,contracts}/src`, `apps/api/src` for param emissions —
`node_modules`/`dist`/generated dirs skipped):

1. **CONSUMERS ⊆ MANIFEST** — every `data-*`/`role=`/field/`?param=` selector literal in
   `packages/journeys/src` and every selector literal in `apps/web/src/spa` resolves to a
   manifest entry (literal or prefix family). A journey step citing an unmanifested selector
   fails.
2. **MANIFEST ⊆ EMITTED** — every entry appears in at least one scanned emission source (JSX
   attrs, `attr()`/template emissions, `name=` fields, URL-param reads/`query.<name>` and
   dynamic `?${name}=` construction). `dom-contract.ts` itself is excluded so the manifest
   can't self-witness.
3. **MANIFEST ⊆ ASSERTED** — every entry is referenced by ≥1 journey source or `*.test.*`
   file (the ticket's "asserted by ≥1 emission test or journey step" leg).

- The manifest parser is **positional** (sticky-regex over the record body), not line-oriented —
  it survives Prettier wrapping builder calls across lines and refuses anything that isn't a
  surface header, entry call, or array close. `parseDomContractManifest` is exported for tests.
- Wired: root `package.json` `check:dom-contract`; CI `typecheck/lint/unit` job runs it after
  `pnpm test` (a pure source scan — no build or browser needed).

### Component-test stack (REQ-VFY-1, REQ-VFY-6, REQ-TST-6/10)

- **Deps (apps/web devDeps):** `@testing-library/dom` ^10.4.2, `@testing-library/jest-dom`
  ^6.9.1, `@testing-library/react` ^16.3.3, `@testing-library/user-event` ^14.6.7,
  `axe-core` ^4.13.0 (MPL-2.0 — covered by the existing `licenses.exceptions.json` axe-core
  row).
- **Config:** root `vitest.config.ts` gains `environmentMatchGlobs` routing
  `apps/web/src/**/*.dom.test.{ts,tsx}` → happy-dom (the glob, not a pragma, decides — a
  forgotten pragma can't silently run a DOM test under node) plus `setupFiles:
  apps/web/test-setup.ts` (jest-dom matchers + RTL cleanup, guarded so node tests are
  unaffected). `apps/web/vitest.config.ts` mirrors it so package-local runs share the
  environment/setup.
- **`apps/web/src/spa/testkit.ts`** — `assertSurfaceEmissions(container, surface)` (asserts every
  required manifest entry is emitted by the rendered tree — the parity helper surface tickets
  consume, not a forked vocabulary) and `expectAccessible(el)` (axe-core run over the happy-dom
  tree with layout-dependent rules — `color-contrast`, `scrollable-region-focusable`, etc. —
  disabled because happy-dom reports no real geometry; the rest of the rule set is intact).

### Tests

- `apps/web/src/spa/dom-contract.dom.test.tsx` (4) — the reference component test: mounts
  `ChatDesk`, types through the composer via user-event, asserts the `dossier` surface's
  required markers via `assertSurfaceEmissions`, covers `data-spa-error` via `SpaRouteError`
  and `data-fmt` via the audit grid, and runs component-axe — **plus a non-vacuity pin**: an
  intentionally invalid fixture (img without alt) must fail axe, so a stubbed/dead axe run
  can't green the suite.
- `apps/web/src/dom-contract.test.tsx` (7) — manifest structure: totality over surface keys,
  unique hooks per surface, builder/kind/role field sanity, and the required vocabulary pins
  (`data-fmt`, `data-spa-surface`/`data-spa-error`, `ed.`/`data-label-`/`toggle.` families).
- `scripts/check-dom-contract.test.mjs` (9) — the lint's failure legs on temp fixtures:
  unmanifested journey literal → fail; unemitted entry → fail; unasserted entry → fail; a
  conformant fixture → pass (each verdict asserted on the violation text, not just exit code).
- **Contract repairs (additive, to make the lint honest):** `packages/ui/src/dossier.tsx` —
  `DossierView`'s `<article>` gains `data-dossier` (the manifest's surface marker; the previous
  root only carried `data-readonly`); `packages/journeys/src/surface-gates.ts` — a `legNotes`
  string's phrase "data-rights" reworded to "rights-export" (the scanner read the prose token
  as a selector literal).

## 2 — Validation

| Check | Result |
|---|---|
| `pnpm check:dom-contract` | **PASS** — 478 entries / 18 surfaces, all emitted + asserted; `journey selectors ⊆ manifest ⊆ emitted+asserted` |
| `pnpm turbo build lint typecheck` | **PASS** — 135/135 tasks (lint: 1 pre-existing warning — an unused `no-var` disable in `apps/web/src/spa/spa.dom.test.tsx`, a SPA.6 file left untouched) |
| `pnpm test` (root vitest) | **PASS** — 465 files / 4,799 tests / 4 skipped / 0 failures (incl. the 3 new test files run under happy-dom via the glob) |
| `pnpm --filter @rhema/web exec vitest run src/spa/...` | **PASS** — package-local run honors `apps/web/vitest.config.ts` |
| `pnpm check:licenses` | **PASS** — 822 packages (axe-core MPL-2.0 under the existing exception) |
| `pnpm check:spa-budget` | **PASS** — all ceilings held |
| `pnpm exec prettier --check` (touched files) | **PASS** |

## 3 — Findings / deviations

- **Manifest scope narrowed to the asserted subset (owned decision, recorded):** the first
  draft enumerated ~682 emitted hooks; ~258 had no journey/test assertion coverage and the
  lint (correctly) refused them. The manifest was cut to the emitted+asserted 478 — unproven
  hooks (e.g. `data-fig`, which only appeared in fixture SVG strings) stay out until their
  owning surface ticket adds the assertion; the lint then admits them on evidence. This keeps
  the ticket's own rule — every manifest entry needs coverage — instead of weakening the lint.
- **`data-dossier` added to `DossierView`:** the surface marker the contract needs was only
  implied by `data-readonly`; the emission is additive SSR markup, no behavior change.
- **Owned decision — two vitest configs:** the root config's `environmentMatchGlobs` covers the
  repo-wide run; `apps/web/vitest.config.ts` exists so package-scoped `vitest run` inside
  `apps/web` resolves the same environment + setup (package-local runs otherwise fell back to
  node and `document` was undefined).
- **Pre-existing prettier drift on touched files:** base copies of `dossier.tsx` /
  `surface-gates.ts` were already prettier-dirty; the minimal edits were kept minimal rather
  than formatting whole files (no formatting noise in the diff; `prettier --check .` repo-wide
  carries pre-existing warnings).
- **Size:** ~2.0k changed lines vs the ~600 guide — the manifest alone is ~900 (the ticket's
  deliverable is the vocabulary), the lint ~465 + 208 test, the tests/testkit ~450. Recorded
  per the SPA.5/SPA.6 test-first precedent.
- **Deferrals:** none opened, none closed; dated blocker-update note appended to `D-SPA.6-1`
  (preview stacks now worker-self-serve per the 12:29Z ruling; images/flag-config + the prod
  merge-deploy remain).

## 4 — AC ledger

- `[check:dom-contract fails when a journey step cites an unmanifested selector and when a
  manifest entry has no emission coverage]` → **deterministic** — `check-dom-contract.test.mjs`
  fixture legs assert both failures (and the assertion-coverage leg); live gate green.
- `[Component-test stack runs green on the reference test incl. axe]` → **deterministic** —
  `dom-contract.dom.test.tsx` (4/4 incl. the non-vacuity axe-rejects-invalid pin).
- `[Manifest covers ≥ the 90 enumerated hooks from research/04 — coverage table in the PR]` →
  **deterministic** — 478 asserted entries ⊇ every journey selector literal (0 unmanifested
  literals); the lint report is the committed coverage table, echoed in `pr/SPA.7.md`.
- `[universal phase-gate AC]` → this ledger, BUILD_INDEX row 132, LEDGER advanced, append-only
  validators run, PR checks read once at closeout (result recorded below — see §5).

## 5 — CI / PR

- PR **#125** (`docs/build/pr/SPA.7.md` is the body); base `stevevitali/spa-6-journey-harness`;
  head `stevevitali/spa-7-dom-contract-rtl`; unmerged (`OPERATOR`).
- `gh pr checks --watch=false` at closeout — verbatim:
  `typecheck / lint / unit  pending  0  https://github.com/SteveVitali/Rhema/actions/runs/37790215319/job/113355309414`
  (exit 8 — the run registered but had not reported at read time; read exactly once per
  closeout discipline; the result rides the PR, not a re-read here).
- Validators: `check-build-memory.sh` + `check-append-only.mjs --base 68cce50` — results
  recorded in the closeout commit below.

### Closeout addendum (validator results)

- `bash ~/agent-skills/skills/build-memory/scripts/check-build-memory.sh .` — **0 violations,
  7 warnings**, all pre-existing classes (manifest banner/order notes incl. GATE-G1/GATE-G2,
  PHASE-LOG >2 KiB entries — this entry joins the accepted pattern, legacy index status values,
  pre-guard readouts, run ledgers without Harness headers).
- `node docs/build/tools/check-append-only.mjs --base 68cce50` — **append-only OK**.
- `gh pr checks --watch=false` (read once at closeout) — `typecheck / lint / unit pending`
  (exit 8; the run had registered but not reported).
