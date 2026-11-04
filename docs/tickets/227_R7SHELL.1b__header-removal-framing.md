# R7SHELL.1b — Remove the per-leaf headers; frame outline / figures / run report / settings / voices / usage

- **Sequence:** 227 of 254 · **Phase:** round 7 (R7b) · **Kind:** ticket
- **base_branch:** current checkout
- **Depends on:** 226_R7SHELL.1a. The AppShell must exist before the leaf headers it replaces can
  go. This row merges after 224 (spec §5.1).
- **Run:** `implement-spec spec=docs/tickets/227_R7SHELL.1b__header-removal-framing.md`
- **Gate status:** none
- **Live stage:** Stage A only ($0: unit, DOM and SSR render tests plus a local build). No owned
  preview (`GD-PREVIEW.R7`). Stage B is staging-verified at the R7b phase preview (250_R7DEP.2)
  through a DEFERRALS row, and prod Stage B rides 250. Any need for a live preview outside 224's
  and 250's windows → PAUSE for the operator.
- **Production mutations:** none
- **Size budget:** ~600 changed lines excl. generated/fixtures (M; broad but mechanical).
  Entry-delta allowance ≤ 15 kB gz (REQ-KIT-5), with the actual figure stated in the PR.

## Goal
The sidebar becomes the only signed-in chrome. The 14 hand-picked `<Shell nav=…>` headers come off
the SPA surfaces. Each page's title becomes a content row, and project scope gains a
`Project › Surface` breadcrumb. The project-scoped pages that today drop the user out of the
product all render inside the shell, with no "Back to the project" links left in the body:
outline, figures, run report, usage, settings, voices, project settings, obligations/new and voice
reseed.

## Load (read these — do not re-read others)
- `docs/round-7-draft-spec.md` §3.2 ADR-128, §4.5 REQ-SHELL-3 and REQ-SHELL-5, §4.17 REQ-DACC-6
  (public routes unchanged), §8.
- R6 `…/R6-ux-code-audit.md` §3 (the 14-header table and the "Differences" list), UXC-11 and
  UXC-12. R5 `…/R5-ux-browser-audit.md` D1, D5 (chrome half) and G5 (chrome half).
- Anchors (re-confirm at build time):
  - **`<Shell` call sites** (counted 2026-11-03): `apps/web/src/spa/surfaces/` billing ×4,
    dossier ×1, figures ×6, inbox ×2, onboarding ×4, outline ×4, project-home ×2, settings ×4,
    usage ×3 and voices ×6, plus `apps/web/src/spa/states.tsx` ×1.
  - **SSR documents that keep their Shell:** `pages.tsx`, `marketing.tsx` and `legal.tsx`. They
    are public or no-JS, so they are out of scope.
  - **The Shell component:** `packages/ui/src/shell.tsx`. `PageTitle` and `SectionTitle` are both
    20 px (:69-82).
  - **Framing truth:** `packages/contracts/src/spa.ts:65-77` `SPA_IDE_FRAMED_ROUTES`.
  - **Wrong labels:** `settings.tsx:960-966` (project-settings null path shows billing's
    `stripeDownNote`); `voices.tsx` reseed "All voices" → `/p/${slug}`.
  - **Contract:** `apps/web/src/dom-contract.ts` (nav hooks per surface).
  - **Journey steps:** in `packages/journeys/src/steps.ts`, the steps that assert today's
    per-page nav items.
- 226's AppShell, its `shell` bucket and the U1.shell walk; `apps/web/AGENTS.md`;
  `docs/tickets/00_MANIFEST.md` § Cross-cutting invariants and § Operating rules;
  `docs/tickets/DEFERRALS.md`.

## In scope — deliverables
1. **Header removal** (REQ-SHELL-3).
   - Remove every SPA-surface `<Shell nav=…>` header. The settings sub-nav stays as an in-content
     row; its styling is 240's.
   - Where an SSR/no-JS document renders the same surface body, that document keeps a working nav.
     Re-confirm which bodies are shared with SSR before removing anything.
2. **Title row and breadcrumb** (REQ-SHELL-3).
   - One page-header content row component with the h1. The h1 stays the REQ-COPY-7 route-focus
     target.
   - In project scope it carries a `Project › Surface` breadcrumb (SPA links).
   - It replaces the four back-link idioms (R6 §3).
3. **Framing** (REQ-SHELL-5) [UXC-11, G5 chrome].
   - Outline, figures (list and detail), run report, usage, project usage, account settings,
     voices (list, detail and reseed), project settings and obligations/new render inside the
     AppShell.
   - Body back links are removed.
4. **Label fixes** in the touched nav copy [UXC-12]:
   - the voice-reseed back target and label;
   - the project-settings outage copy uses its own key, not billing's;
   - Inbox no longer shows a Billing link.
5. **DOM contract and journeys.**
   - Retired nav hooks are removed from `dom-contract.ts` and breadcrumb/title-row hooks are
     added, in the same change.
   - Journey steps that asserted old nav items now assert the sidebar or breadcrumb.
   - The U1.shell walk (226's leg) is extended over the framed surfaces. Its steps pass their
     Stage-A tests, and the leg stays held `ready-to-flip` for 250 (nightly hazard).
6. **REQ-DACC-6.** `public-ssr-baseline` is unchanged, because no public route is touched.

## Out of scope
- Control/primitive migration on these surfaces: 240 (settings, billing, usage, voices), 242
  (outline, figures), 241 (onboarding and new project), 234 (project list and inbox).
- The sidebar project tree and Files: 230. IDE-framed surface chrome: 229 and 230.
- The landing and marketing nav: 249a_R7PUB.1 (UXC-13 remainder goes to BACKLOG by ruling).
- Outline-existence coherence (REQ-HOME-6): 236.

## Acceptance criteria
- [ ] No `<Shell` remains under `apps/web/src/spa/surfaces/**` or `spa/states.tsx` (a grep/AST
      test with a named exemption list, empty unless an SSR-shared body requires one).
      *(deterministic · layer: engineered)*
- [ ] Each framed surface renders inside `AppShell`, with the title row and, in project scope,
      the breadcrumb. There is one DOM test per surface family.
      *(deterministic · layer: engineered)*
- [ ] No body-level back link remains on outline or figures. The UXC-12 labels are fixed and
      pinned by tests. *(deterministic · layer: engineered)*
- [ ] Every SSR/no-JS document that shares a body still renders a working nav (SSR render test).
      *(deterministic · layer: engineered)*
- [ ] `check:dom-contract` is green, the updated journey steps typecheck, and
      `public-ssr-baseline` is unchanged. *(deterministic · layer: engineered)*
- [ ] **Stage B is staging-verified at the R7b phase preview (250_R7DEP.2)** (`GD-PREVIEW.R7`: no
      per-ticket preview). This ticket opens a dated `DEFERRALS.md` row (`D-R7SHELL.1b-n`, owner
      250). The row names what 250 captures:
      - the extended U1.shell walk passing at the preview SHA (`--expect-sha`);
      - screenshots of the framed surfaces: outline, figures, run report, usage, settings,
        voices and project settings.

      Unblock: 250's preview walk. Compensating control: the Stage-A tests above.
      *(agentic · layer: engineered here; staging-verified and live-executed at 250)*
- [ ] verification green; every new behaviour has a test that fails if it is removed; requirement ids stamped in the PR; anything not automatically verifiable is a `DEFERRALS.md` row with its compensating control; ADRs written for every deviation and owned decision; `BUILD_INDEX.md` row and `LEDGER.md` advanced; operating clauses met — dates from the clock, PR checks read and recorded, AC layers stated, no living-record pins, protected records only appended, gate words verbatim, harness in the run-ledger header. *(agentic — the universal phase-gate AC)*

## Requirement IDs to satisfy and stamp in the PR
REQ-SHELL-3, REQ-SHELL-5, REQ-KIT-5 (allowance)

## Cross-cutting invariants
- Manifest § Cross-cutting invariants 1 (vocabularies), 12 (walk the surface; at 250's preview),
  17 (context budget).
- Spec §8: 3 (copy), 4 (DOM contract in the same change), 5 (budgets), 7 (sizing).

## Operating clauses
- Cited from `docs/tickets/00_MANIFEST.md § Operating rules`; the gap table has one row per clause.

## Notes
- **Decisions this ticket owns:** the page-header row component and its hook names, which 237
  extends into the Page header strip; the breadcrumb format.
- **Shared decisions consumed:** AppShell and U1 (226); REQ-COPY-7 heading focus (210).
- **Tour targets.** Some of these surfaces carry R7a tour or demo hooks (220/221/222). Keep every
  tour-target hook resolvable, so that D2.tour does not regress before 248 re-pins.
- **Merge order.** This ticket and 234 both touch `project-home.tsx` and `inbox.tsx`; this one
  lands first in the stack.
