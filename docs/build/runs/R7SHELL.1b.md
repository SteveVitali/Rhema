# R7SHELL.1b — Remove per-leaf headers; frame outline/figures/run-report/settings/voices/usage (run ledger)

- **Spec:** `docs/tickets/227_R7SHELL.1b__header-removal-framing.md` (manifest row 227, phase
  round 7 / R7b). `GD-PREVIEW.R7` — no per-ticket preview; **$0**, repo-only; Stage A only
  (unit + DOM + SSR render tests plus a local build). mergePolicy=OPERATOR — never merge.
  LAUNCHED — prod serves `4bc8cf4a`; zero prod mutations.
- **Base:** `stevevitali/r7shell-1a-sidebar` @ `a474e3ee` (chainTip; PRs #240–#264 unmerged per
  OPERATOR).
- **Branch:** `stevevitali/r7shell-1b-headers` · **Harness:** devin-desktop/swe-2-high/subagent
  · **Skills:** implement-spec + build-memory + self-review @ `~/agent-skills` (`e981ec5`)
- **Started:** 2026-11-05T08:53Z · **Closed:** 2026-11-05T14:04:15Z
- **ci:** pass #265@04343de (ci-pass anchor 42001171390; integration 42001171390; images (build +
  scan, pin digests) 42001171390; public-safe (gitleaks / markers / licence policy) 42001171390;
  contracts 42001171390; typecheck / lint / unit 42001171390; fast-path 42001171390 —
  `logs/ci-R7SHELL.1b.json`)
- **Production mutations:** none.

## Deferrals read

`docs/tickets/DEFERRALS.md` read first. No `OPEN` row is unblocked by this ticket —
`D-R7SHELL.1a-1` (the `U1.shell` deployed walk) is owed to 250_R7DEP.2's preview, which this
ticket's extension feeds but does not discharge; `D-R7DEP.1-1/-2` are owner-ticket defects
outside this scope. This ticket opens `D-R7SHELL.1b-1` (owner 250) per its AC.

## Requirements

From the ticket's In-scope: (1) remove every SPA-surface `<Shell nav=…>` header — settings
sub-nav stays as an in-content row; (2) one page-header content row component carrying the h1
(REQ-COPY-7 route-focus target) + a `Project › Surface` breadcrumb (SPA links) in project
scope, replacing the four back-link idioms; (3) framing — outline, figures (list+detail), run
report, usage, project usage, account settings, voices (list, detail, reseed), project
settings, obligations/new render inside the AppShell, no body back links; (4) UXC-12 label
fixes — voice-reseed back target+label, project-settings outage own key, Inbox loses its
Billing link; (5) dom-contract — retired nav hooks out, title-row/breadcrumb hooks in, in the
same change; journey steps updated; `U1.shell` extended over the framed surfaces, held
ready-to-flip; (6) REQ-DACC-6 — `public-ssr-baseline` unchanged (no public route touched).

## Acceptance criteria

Tracked in the ticket file; the gap table below carries one row per AC + operating clauses.

## Plan

- New `apps/web/src/spa/page-header.tsx`: `PageHeader` (content row: optional
  `Project › Surface[ › item]` breadcrumb + `<PageTitle>` h1) and `PageBody` (the `<main>`
  content column replacing `<Shell>`'s main, same 880 px/24 px metrics). Decision owned by
  this ticket: hook names `data-page-header` / `data-page-breadcrumb` / `data-breadcrumb-link`;
  crumb = project title (twin-carried) else slug → `/p/:slug`, surface label as
  `aria-current` tail, a middle crumb links the list page on detail surfaces.
- Surfaces edited (all `<Shell>` removed): settings ×3, billing ×3, inbox ×1, project-home ×1,
  usage ×2, voices ×5, onboarding ×3 (`sheetShell`), outline ×4, figures ×7, dossier ×1
  (obligations/new). run-report (IDE-framed) gains `PageHeader` + project crumb.
- Copy: `COPY.pageHeader` (breadcrumb aria + separator) + `settings.projectSettings.unavailable`
  (UXC-12 — replaces billing's `stripeDownNote` on the null path).
- `dom-contract.ts`: `shell` bucket gains the three header hooks (conditional); no nav hooks
  retire (the per-leaf navs carried no data-* hooks; `data-settings-nav` stays in-content).
- Tests: one grep/AST census test (no `<Shell` under `spa/surfaces/**` or `spa/states.tsx`,
  empty exemption list — reconfirmed: no SSR document imports `spa/surfaces/*`), one DOM test
  per surface family asserting shell+title-row+breadcrumb, updated back-link assertions.
- `U1.shell` leg extended over the framed surfaces (still `expected:"red"`).

## Test matrix

| AC | Test |
|---|---|
| no `<Shell` under surfaces/** / states.tsx | `apps/web/src/spa/page-header.test.ts` census |
| framed surface → AppShell + title row + crumb | per-family DOM legs (usage/figures/outline/settings/voices/run-report + shared `page-header.dom.test.tsx`) |
| no body back link on outline/figures; UXC-12 labels | updated `outline.dom.test.tsx`/`figures.dom.test.tsx`/`usage.dom.test.tsx`/`inbox.dom.test.tsx` + reseed-label + project-settings-unavailable pins |
| SSR documents keep working nav | `pages`-family SSR render tests still green (unchanged sources) |
| `check:dom-contract` + journeys typecheck + `public-ssr-baseline` | the check commands |
| entry delta vs baseline | `pnpm check:spa-budget` reported figure |

## Progress

- Phase 0 — branched `stevevitali/r7shell-1b-headers` @ `a474e3ee`; DEFERRALS read (no row
  unblocked); spec Load docs + all anchors read. Reconfirmed at build time: `<Shell` sites =
  settings ×3 (`:282,:963,:976`), billing ×3, inbox ×1, project-home ×1, usage ×2, voices ×5,
  onboarding ×3, outline ×4, figures ×7, dossier ×1; `states.tsx` carries NO `<Shell>` (drift
  vs the ticket's count — `SurfaceShell` is a `<main>` skeleton); no `spa/surfaces/*` import
  from `pages.tsx`/`marketing.tsx`/`legal.tsx` (empty SSR-shared exemption list stands).
- Phase 1 — plan + test matrix above. Breadcrumb format owned: crumbs array, last = current
  (`aria-current`), middle crumbs link — detail pages keep the retired "Back to <list>" target
  as a middle crumb (`{project} › {Surface} › {item}`).
- Phase 2 — ALL surfaces edited; zero `<Shell` under `spa/surfaces/**` or `states.tsx`
  (`SurfaceShell` skeleton is a `<main>`, untouched). Crumbs: usage `projectName › Usage`,
  project settings `title › Project settings`, figure card `slug › Figures › card`, reseed
  `slug › Voice reseed` (UXC-12 — label+target fixed), obligations `projectTitle › New
  obligation`, run-report `slug › Run report` (inside hosted IDE). `pnpm turbo build
  --filter=@rhema/web...` + typecheck green; 4 stale asserts (figures ×3, usage ×1) converted
  to `data-page-breadcrumb` asserts (dom-contract "asserted" legs covered).
- Phase 2 done — `spa/page-header.test.tsx` (census: zero `<Shell` under surfaces/states, empty
  exemption list + the SSR-shared-body re-check; the row's unit contract) 6 green; per-family
  DOM asserts added (outline/inbox/voices/dossier on top of figures/usage). `U1.shell` extended
  in `r7legs.ts` — workspace leaves (title row, no crumb) + project outline/figures/usage/
  settings (crumb + first crumb → `/p/:slug`), held `expected:"red"`. All 626 `spa/` tests
  green. Removed dead `fmt` in project-home (last lint red).
- Phase 5/6 — resumed session re-verified at `04343de`: `pnpm turbo build lint typecheck`
  138/138 (FULL TURBO), `vitest apps/web/src/spa/` 626/626, `vitest packages/journeys/` 212/212,
  `check:dom-contract` (shell 18/18), `check:spa-env`, `check:protocol-markers`,
  `check:no-cookies`, `check:spa-entry-graph` (Tooltip+DropdownMenu allowance only),
  `check:spa-budget` — **entry +9.7 kB vs baseline `04a4e98b`** (≤15 kB), append-only vs
  `stevevitali/r7shell-1a-sidebar` OK, `check-build-memory.sh` 0 violations (16 legacy
  warnings). PR #265 created `gh pr create --base stevevitali/r7shell-1a-sidebar` (body
  `docs/build/pr/R7SHELL.1b.md`); `ci-boundary --pr 265` → **pass** run 42001171390.
  DEFERRALS `D-R7SHELL.1b-1` OPEN (owner 250_R7DEP.2). Records: BUILD_INDEX row 266,
  LEDGER `lastCompleted: R7SHELL.1b` / `nextTicket: 228_R7SHELL.1c` /
  `chainTip: stevevitali/r7shell-1b-headers` + PHASE LOG entry under
  `## PHASE LOG — Round 7`.

## Gap table

| Spec clause | Disposition | Evidence |
|---|---|---|
| Remove every SPA-surface `<Shell nav=…>` header | DONE — all 32 call sites replaced by `PageBody`+`PageHeader`; `Shell`/`PageTitle`/`footer()` imports pruned per file | `spa/page-header.test.tsx` census leg; grep shows zero `<Shell` under `spa/surfaces/**` |
| Settings sub-nav stays as an in-content row (240 styles) | DONE — `SettingsNav` renders under `PageHeader` in `SettingsFrame` + `BillingSurface`; `data-settings-nav` asserts unchanged | `billing.dom.test.tsx:241`, `settings.dom.test.tsx:380` |
| One page-header content row component with the h1; h1 stays the REQ-COPY-7 focus target | DONE — `PageHeader` emits `<PageTitle>`; `useDocMeta`/leaf-focus machinery untouched | `page-header.test.tsx` row legs; `spa/head.tsx` unchanged |
| `Project › Surface` breadcrumb in project scope (SPA links) | DONE — crumbs array; project crumb links `/p/:slug`, tail `aria-current="page"` text; detail pages add a middle crumb | usage/figures/outline/voices/dossier DOM asserts |
| Replaces the four back-link idioms | DONE — "All projects", "Back to the project", project-title, and body-link idioms all retire; figure card keeps `Figures` as a middle linked crumb | surface diffs + census |
| Framed surfaces render inside AppShell with the title row (+ crumb in project scope) | DONE — every listed leaf mounts under `_authenticated` → `AppShell`; run-report gets the row inside the hosted IDE | mounted-through-router DOM specs |
| No body-level back link on outline/figures | DONE — negative assert: every `/p/:slug` anchor lives inside `[data-page-breadcrumb]` | `outline.dom.test.tsx`, `figures.dom.test.tsx` |
| UXC-12 labels: reseed target+label, project-settings own outage key, Inbox loses Billing | DONE — `{slug} › Voice reseed`; `settings.projectSettings.unavailable`; no `/app/settings/billing` anchor on inbox | `voices.dom.test.tsx`, `settings.tsx` (`data-settings-unavailable="project"`), `inbox.dom.test.tsx` |
| No `<Shell` under surfaces/** or states.tsx — grep/AST test with named exemption list | DONE — `page-header.test.tsx`, `SHELL_EXEMPTIONS: []` + the SSR-shared-body re-check leg | the test itself |
| Every SSR/no-JS document sharing a body still renders a working nav | N/A — verified no SSR document (`pages`/`marketing`/`legal`) imports a `spa/surfaces/*` body; SSR specs unchanged+green | census second leg |
| `check:dom-contract` green; journeys typecheck; `public-ssr-baseline` unchanged | DONE — 18 shell hooks emitted+asserted; `r7legs.ts` compiles; no public route/file touched | gate runs |
| `U1.shell` extended over the framed surfaces, ready-to-flip | DONE — workspace + project leaves walk with title-row/crumb asserts + screenshots; stays `expected:"red"` | `r7legs.ts` |
| `D-R7SHELL.1b-n` dated row, owner 250 | DONE — `D-R7SHELL.1b-1` appended | `DEFERRALS.md` |
| Entry delta vs `spa-budget-baseline.json` reported, ≤15 kB | DONE — **+9.7 kB** (marginal ≈ +0.1 kB over parent head) | `check:spa-budget` |
| Public routes unchanged (REQ-DACC-6) | DONE — zero edits to `server.ts` public routes / `pages`/`marketing`/`legal` / sitemap / `public-ssr-baseline` | `git diff` scope |
| Preserve 220/221/222 demo & tour hooks | DONE — demo surfaces/tour code untouched; `data-demo*` hooks still emitted+asserted | `check:dom-contract` |

## Evidence log

- `pnpm turbo build lint typecheck` — 138/138 green.
- `pnpm exec vitest run apps/web/src/spa/` — 626/626 green (new `page-header.test.tsx` ×6;
  updated figures/usage/outline/inbox/voices/dossier asserts).
- `pnpm check:dom-contract` — green; `shell` 18/18 emitted+asserted.
- `pnpm check:spa-budget` — entry delta **+9.7 kB vs baseline @04a4e98b** (≤15 kB; marginal
  ≈ +0.1 kB over R7SHELL.1a's +9.6 kB head).
- `pnpm check:spa-env`, `check:protocol-markers`, `check:no-cookies` — green.
- `pnpm test` (full suite) — green (see CI/evidence section; 4k+ tests).
- Append-only vs `stevevitali/r7shell-1a-sidebar` — green.
- `check-build-memory.sh` — green, zero violations.

## Evidence report

**Verdict: DONE — engineered, $0, Stage A only (GD-PREVIEW.R7). Entry delta +9.7 kB gz vs
`spa-budget-baseline.json` @`04a4e98b` (≤15 kB allowance; ≈ +0.1 kB marginal over R7SHELL.1a's
+9.6 kB head).**

- **Commits:** `04343deb` (implementation + records) · closeout `docs(build)` commit at push.
- **PR:** #265 → `stevevitali/r7shell-1a-sidebar` (unmerged, OPERATOR; body `pr/R7SHELL.1b.md`).
- **Requirement IDs stamped:** REQ-SHELL-3, REQ-SHELL-5, REQ-KIT-5.

| AC | Required layer | Achieved layer | Status | Evidence |
|---|---|---|---|---|
| No `<Shell` under `spa/surfaces/**` / `states.tsx` (named exemption list) | engineered | engineered | met | `page-header.test.tsx` census leg; `SHELL_EXEMPTIONS: []`; grep zero |
| Framed surfaces inside AppShell + title row + crumb (one DOM test per family) | engineered | engineered | met | usage/figures/outline/inbox/voices/dossier `*.dom.test.tsx`; `page-header.tsx` |
| No body-level back link on outline/figures; UXC-12 labels pinned | engineered | engineered | met | `outline.dom.test.tsx`, `figures.dom.test.tsx`, `voices.dom.test.tsx`, `settings.tsx` `data-settings-unavailable="project"`, `inbox.dom.test.tsx` |
| SSR/no-JS documents sharing a body keep a working nav | engineered | engineered | met (vacuous) | census leg 2 — no `pages`/`marketing`/`legal` import of `spa/surfaces/*`; SSR specs unchanged+green |
| `check:dom-contract` green; journeys typecheck; `public-ssr-baseline` unchanged | engineered | engineered | met | shell 18/18 emitted+asserted; `r7legs.ts` compiles; zero public-route edits |
| Stage-B staging-verified at 250 (`D-R7SHELL.1b-n` row opened) | staging-verified | engineered | met-engineered(D-R7SHELL.1b-1) | `DEFERRALS.md` row, owner 250_R7DEP.2, `U1.shell` held `expected:"red"` |
| Universal phase-gate AC | — | — | met | this ledger + BUILD_INDEX 266 + LEDGER advance + CI read below |

- **Gap-analysis:** every gap-table row above is `met` with cited evidence except the Stage-B
  AC, engineered here and staging-verified at 250 under `D-R7SHELL.1b-1` (compensating control:
  the Stage-A census + per-family DOM legs). Drift noted vs ticket's counts: `states.tsx`
  carries no `<Shell>` (its `SurfaceShell` is a `<main>` skeleton) — recorded, adapted, not a
  spec-invalidating drift.
- **Verification:** `pnpm turbo build lint typecheck` 138/138 · `vitest apps/web/src/spa/`
  626/626 · `vitest packages/journeys/` 212/212 · `check:dom-contract` green (shell 18/18) ·
  `check:spa-budget` +9.7 kB · `check:spa-env`/`protocol-markers`/`no-cookies`/`spa-entry-graph`
  green · `check-build-memory.sh` 0 violations (16 legacy warnings) · `check-append-only.mjs
  --base stevevitali/r7shell-1a-sidebar` OK. Not run: any preview/deploy leg (GD-PREVIEW.R7 —
  $0, none owned this ticket; owed leg is `D-R7SHELL.1b-1`).
- **CI:** `ci: pass #265@04343de` (run 42001171390 — all seven legs + `ci-pass` anchor;
  `docs/build/logs/ci-R7SHELL.1b.json`).
- **Deferrals:** opened `D-R7SHELL.1b-1` (owner 250) · closed none · no prior OPEN row
  unblocked by this ticket.
- **Deviations:** none vs spec; owned decisions (page-header component + hook names, crumb
  format) recorded in `pr/R7SHELL.1b.md`; ADR-131 gained a Revisit-trigger section.
