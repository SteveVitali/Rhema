# R7SHELL.1b — Remove per-leaf headers; frame outline/figures/run-report/settings/voices/usage

**Ticket:** `docs/tickets/227_R7SHELL.1b__header-removal-framing.md` (manifest row 227, R7b).
**Base:** `stevevitali/r7shell-1a-sidebar` @ `a474e3ee` · **Branch:** `stevevitali/r7shell-1b-headers`
**mergePolicy=OPERATOR** — never merge. **Stage A only, $0** (GD-PREVIEW.R7): unit + DOM +
integration tests plus a local build; the deployed walk is `D-R7SHELL.1b-1` → 250_R7DEP.2.
**Entry delta vs `spa-budget-baseline.json` (@`04a4e98b`): +9.7 kB gz** — the ≤15 kB/ticket
allowance holds (`check:spa-budget` prints the number); the marginal delta over R7SHELL.1a's
+9.6 kB head is ≈ +0.1 kB (the `PageHeader`/`PageBody` row, minus the retired nav markup).
**REQUIREMENTS: REQ-SHELL-3, REQ-SHELL-5, REQ-KIT-5.**

## What lands

- **`spa/page-header.tsx`** — the ONE page-header content row (REQ-SHELL-3): an optional
  `Project › Surface` breadcrumb plus the page's `<PageTitle>` h1, which stays the REQ-COPY-7
  route-focus target (`[data-spa-root] h1` semantics unchanged — `spa/head.tsx` focuses it on
  every leaf). `PageBody` replaces `<Shell>`'s `<main>` — same 880 px column, same padding, the
  leaf's single `<main>` landmark inside `app-shell-content`. The hosted IDE leaves keep
  `IdeShell`'s `#ide-page` main and never mount this row.
- **Every SPA-surface `<Shell nav=…>` header is gone** — 32 call sites across settings ×3,
  billing ×3, inbox ×1, project-home ×1, usage ×2, voices ×5, onboarding ×3, outline ×4,
  figures ×7, dossier (obligations/new) ×1; run-report's bare `<PageTitle>` gains the title row
  + project crumb inside the hosted IDE. `states.tsx` carries no `<Shell>` (the `SurfaceShell`
  pending skeleton is a `<main>`, already in-shell since R7SHELL.1a). The public/SSR documents
  (`pages.tsx`, `marketing.tsx`, `legal.tsx`) keep their own `<Shell>` chrome — REQ-DACC-6,
  untouched. The census is enforced by `page-header.test.tsx`: zero `<Shell` JSX or `@rhema/ui`
  `Shell` imports under `spa/surfaces/**` or `spa/states.tsx`, and a re-check that no SSR/no-JS
  document imports a `spa/surfaces/*` body (the named exemption list is **empty**).
- **The breadcrumb replaces the four back-link idioms** (R6 §3's "All projects" / "Back to the
  project" / project-title / body-link variants — UXC-11): crumbs are plain `<a>` SPA links
  riding the one interceptor; the last crumb is the current surface's `aria-current="page"`
  text, never a link. Detail pages keep the retired affordance as a middle crumb
  (`{project} › {Figures} › {card}`). Outline and figures carry **no body-level back link**;
  the project crumb is the only `/p/:slug` anchor left on those leaves.
- **UXC-12 label fixes:** the voice-reseed nav (was "All voices" pointing at `/p/:slug`) is now
  `{slug} › Voice reseed` — correct target *and* label; the project-settings degraded-twin note
  uses its own `settings.projectSettings.unavailable` copy, never billing's `stripeDownNote`;
  Inbox loses its stray Billing link (the sidebar's Settings/account menu carry the path).
  The settings sub-navigation stays as an in-content row under the title — its styling is
  240_R7KIT.3's.
- **DOM contract in the same change:** `shell` bucket gains `data-page-header`,
  `data-page-breadcrumb`, `data-breadcrumb-link` (all conditional — emitted by
  `spa/page-header.tsx`, asserted by the per-family DOM legs). No nav hooks retire — the
  per-leaf navs carried no `data-*` hooks; `data-settings-nav` stays in-content.
- **`U1.shell` extended** (`packages/journeys/src/r7legs.ts`): after the sidebar walk it visits
  the framed surfaces — `/usage`, `/app/settings/account`, `/voices`, `/app/inbox` (title row,
  no crumb) and `/p/:slug/outline|figures|usage|settings` (crumb present, first crumb →
  `/p/:slug`, one AppShell each) — with screenshots per leaf. Still `expected:"red"`; 250
  flips it at the phase preview (`D-R7SHELL.1b-1`).

## Evidence (achieved: engineered + fixture-verified)

- `pnpm turbo build lint typecheck` — green, no ceiling raised.
- `pnpm test` — full suite green; new `page-header.test.tsx` (6 legs: the census + the row's
  unit contract + the SSR-shared-body re-check), updated DOM asserts in usage/figures/outline/
  inbox/voices/dossier specs — 626 `spa/` tests green locally.
- `pnpm check:dom-contract` — 18 `shell`-bucket hooks emitted + asserted.
- `pnpm check:spa-budget` — **entry +9.7 kB gz vs baseline** (≈ +0.1 kB over the parent's head).
- `pnpm check:spa-env` / `check:protocol-markers` / `check:no-cookies` — green.
- `public-ssr-baseline` untouched — no public route, document, or `surfaces:null` flip changed;
  `Shell` remains the SSR documents' chrome by design.
- Focused evidence: `apps/web/src/spa/page-header.test.tsx`, the updated `*.dom.test.tsx`
  asserts, and this PR diff.

## AC coverage map

| AC | Where it lives | Proof |
|----|----------------|-------|
| No `<Shell` under `spa/surfaces/**` or `spa/states.tsx` (exemption list empty) | `page-header.test.tsx` census + SSR-shared-body leg | source-level test |
| One page-header content row component with the h1 (REQ-COPY-7 focus target) | `spa/page-header.tsx` | unit + DOM legs |
| `Project › Surface` breadcrumb in project scope | crumbs prop; figures/usage/outline/voices/dossier crumb asserts | DOM legs |
| Framed surfaces render inside AppShell | `_authenticated` layout (R7SHELL.1a) + per-family mounted-through-router specs | DOM legs |
| No body-level back link on outline/figures | `outline.dom.test.tsx`/`figures.dom.test.tsx` negative asserts | DOM legs |
| UXC-12 label fixes | `voices.dom.test.tsx` reseed crumb; `settings.dom.test.tsx` unavailable pin; `inbox.dom.test.tsx` no-Billing-link | DOM legs |
| Settings sub-nav as in-content row | `SettingsNav` under `PageHeader`; `data-settings-nav` asserts kept | DOM legs |
| dom-contract updated in the same change | `shell` bucket + `check:dom-contract` | gate |
| Journey steps updated; `U1.shell` extended, ready-to-flip | `r7legs.ts` framed walk, `expected:"red"` | typecheck + authored leg |
| Every SSR/no-JS document sharing a body keeps a working nav | exemption list empty — no SSR doc imports `spa/surfaces/*` | census test + unchanged SSR specs |
| `public-ssr-baseline` unchanged | no public route touched | scope + tests |
| `D-R7SHELL.1b-n` deferral row | `DEFERRALS.md` | record |

## Out of scope (per ticket)

Control/primitive migration (240/241/242), settings-page redesign & sub-nav styling (240),
run-report page-header strip inside the IDE content region (237), sidebar project tree/Files
(230), IDE framing (229/230), marketing (249a), outline-existence coherence (236), `Shell`
deprecation (243), `/settings` & `/billing` redirects (236).

## Deferrals

- `D-R7SHELL.1b-1` → 250_R7DEP.2: the deployed `U1.shell` walk over the framed surfaces +
  screenshots (same preview as `D-R7SHELL.1a-1`). No other OPEN row unblocked or closed.
