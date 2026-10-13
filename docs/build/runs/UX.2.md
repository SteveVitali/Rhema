# UX.2 — Layout and responsive (run ledger)

- **Status:** IN PROGRESS
- **Harness:** Devin CLI (agentic coding subagent); model: Cognition Devin; tier: n/a (build work)
- **Ticket:** `docs/tickets/77_UX.2__layout-responsive.md` (manifest row 77)
- **Branch:** `stevevitali/ux-2-layout-responsive`, stacked on UX.1 `1037752`
  (`stevevitali/ux-1-copy-ia-brand` — `OPERATOR` merge policy, **not merged**).
- **Goal:** `/app/new` renders styled at desktop (no more unstyled IDE shell); pricing, the project
  page and the run sheet have no horizontal overflow at 390 px and 320 px; the phone project page's
  actions are real button-styled controls ≥ 44 px (every target ≥ 24 px); the sync pill never floats
  over text/chrome; a WCAG 2.2 AA pass covers every touched surface.
- **Spend:** $0 planned. Stage B = deploy + P1 journey (all legs $0-class). Round-3 cumulative
  entering: **$61.22**.
- **ADRs:** ADR-065 (/app/new → workspace Shell + IdeFrame document invariant), ADR-066 (pricing
  matrix → labelled contained scroll), ADR-067 (phone action row → button-styled links + target
  floors), ADR-068 (axe-core as the WCAG checker + MPL-2.0 dev-only exception),
  ADR-069 (sync pill → in-flow paper header).

## 0 — Context load

- DEFERRALS.md read (first step, per AGENTS). Rows touched this run: `D-P1.19-2` — this run supplies
  the layout legs it names (phone overflow, action sizing, sync-pill placement at 390×844 via the
  extended P1 journey); its gate/disposition/chat legs and any real-device residue stay with their
  owners — annotated, not flipped.
- Branch state: base `1037752` clean; feature branch created.
- REQ ids: `REQ-MOBILE-3` (amended, primary), `REQ-SPEC-20` (primary), `REQ-IDE-42`, `REQ-IDE-43`
  (pill placement), `REQ-IDE-8`, `REQ-SPEC-29` (P1 provenance/evidence).
- Anchors confirmed:
  - `apps/web/src/render.tsx` — `renderDocument` emits `IDE_CSS` + `/assets/ide.js` iff `data.ide`;
    `/app/new` rendered `IdeFrame` markup with `data.ide` unset → unstyled stacked shell.
  - `apps/web/src/pages.tsx` — `IdeFrame` (`data-ide="1"` via `IdeShell`), `NewProjectPage` (~1005),
    `ProjectPage` (631; action row ~726-743, phone drops import/run/export links), `RunSheetPage`
    (1324; `PhoneBlockedNote` at compact), `PhoneBlockedNote` (171).
  - `apps/web/src/server.ts` — `ideContext()` (428-543) is the one `PageData.ide` producer;
    `isPhoneRequest` (5624) keys on `sec-ch-ua-mobile: ?1` or `Mobi|iPhone|Android` UA.
  - `apps/web/src/marketing.tsx` — bare matrix `<table>` at 382-405 (no scroll wrapper).
  - `packages/ui/src/page-editor.tsx:465` — `[data-sync-pill]` `position:fixed; bottom:28px; right:24px`
    → floats over phone body text; sits on the desk's bottom-right (composer) / over statusbar edge.
  - `packages/ui/src/source-editor.tsx:92` — `SyncPill` is already in-flow (h1 row); keep states/labels.
  - `packages/ui/src/gate-card.tsx:547` — `data-gate-actions` flex row; `actionButton` ~34 px tall.
  - `packages/ui/src/decisions.tsx` — `data-decision-option` buttons ~30 px.
  - `packages/ui/src/ide-shell.tsx:187` — `.ide-phonebar` (home | title | inbox badge).
  - `packages/tokens/src/ide-css.ts` — breakpoint ladder; phone media = `max-width: bpPhonePx-1`
    (767 px); `.ide-phone-only` surfaces re-mount inside the Page.
  - `packages/tokens/src/theme-css.ts` — THEME_CSS emitted on every document.
  - `packages/journeys/src/steps.ts:1365` — P1 (red, UX.2) covered only anon `/`+`/pricing`+`/login`;
    `runner.ts` screenshots + `ready-to-flip` semantics; `cli.ts` `--stage prod --steps P1
    --expect-sha --out`; sessions mint through the real mailbox (`test+jrn-<tag>@rhema.tools`).
  - `packages/journeys/src/occlusion.ts` — `assertActionable` center-point occlusion check.
  - `scripts/check-licenses.mjs` + `licenses.exceptions.json` — axe-core is MPL-2.0 → justified
    dev-only exception (journeys test harness only, never shipped).
- Decision sketches for ADR numbering (ADR-065 first free — UX.1 consumed 059-064): /app/new gets the
  workspace `Shell` (no project exists yet ⇒ the §5.1 regions would be dead chrome); `renderDocument`
  gains a belt-and-braces (`.ide` markup ⇒ IDE_CSS) so the class of bug can't recur; matrix goes in a
  `role="region" tabIndex=0` labelled scroll container (restacking loses the row↔column mapping);
  phone action row stays links-become-buttons (a single surviving navigation isn't a menu); pill goes
  in-flow at the paper head (fixed-bottom can't not overlap at phone; every other anchor point is a
  pane's territory); axe-core = the standard checker, MPL-2.0 weak copyleft, dev-tooling-only
  exception.

## 1 — Requirements → test matrix (Stage A plan)

| # | Change | Test that fails on the old behavior |
|---|---|---|
| 1 | `/app/new` renders inside workspace `Shell` (no `.ide` markup); `renderDocument` emits IDE_CSS+island whenever rendered markup carries `data-ide="1"` | route-enumeration test renders each route element; any document containing `.ide` without IDE_CSS fails (pre-fix: `/app/new`) |
| 2 | Pricing matrix in `role="region" aria-label tabIndex=0` `.table-scroll` (overflow-x:auto, table min-width) | marketing SSR test: matrix section has the labelled scroll container; tokens test: `.table-scroll` rule exists; journey: 390/320 no page overflow |
| 3 | Phone project-page action row → `.ide-actions` links ≥44 px at <768 (≥24 elsewhere); gate actions, decision options, phone-chat composer buttons ≥44 px; phonebar links ≥44 px | SSR markup class present; ide-css string asserts the rules; journey P1: primary controls ≥44, all controls ≥24, mis-tap gaps |
| 4 | Sync pill → in-flow at the paper head (styled pill), never `position:fixed` | page SSR test: pill not fixed, sits before doc preview; journey: pill rect disjoint from statusbar/composer rects (desktop) and is in-flow at phone |
| 5 | axe-core WCAG 2.2 AA scans on touched surfaces inside P1 | journeys dep + licenses exception; P1 fails on any AA violation |
| 6 | P1 rewrite: anon pricing at 390+320; signed-in phone project page + run sheet (mobile header); `/app/new` at 1440; axe legs | step fails on today's defects; flip `expected` after a green prod run |
| 7 | §10.1 on the phone project page: no run/import/export/new-project/diff/billing/rename controls | SSR + journey assertions on the phone markup |

## 2 — Implementation (Stage A)

- **ADR-065 — `/app/new` → workspace `Shell`** (`apps/web/src/pages.tsx` `NewProjectPage`): the §5.3
  sheet renders `Shell` chrome (header/back link/footer) at desktop and `PhoneBlockedNote` at phone;
  no `.ide` markup is emitted. `render.tsx` `renderDocument` now treats rendered markup carrying
  `data-ide="1"` as an IDE document (`isIde = data.ide != null || body.includes('data-ide="1"')`) —
  the stylesheet+island can never be dropped by a forgetful handler again.
- **ADR-066 — pricing matrix → contained scroll** (`apps/web/src/marketing.tsx` `PricingPage`,
  `packages/tokens/src/theme-css.ts`): the matrix keeps its `<table>` (row↔column mapping) inside
  `<div class="table-scroll" role="region" aria-label tabIndex="0">`; `.table-scroll { overflow-x:
  auto; max-width: 100% }` in THEME_CSS; the table pins `min-width: 560px`. Page never scrolls
  sideways; the region is named + keyboard-scrollable (axe `scrollable-region-focusable`).
- **ADR-067 — phone action row + target floors** (`apps/web/src/pages.tsx` `ProjectPage`,
  `packages/tokens/src/ide-css.ts`): the row is `class="ide-actions"` (links stay `<a>` — they
  navigate); at <768 the surviving links are bordered ≥44×44 controls with `var(--s3)` gap;
  ≥24×24 at every width (WCAG 2.5.8). Same floor on `[data-gate-actions] button`,
  `[data-decision-option]`, the compact `.chat-composer` send, and `.ide-phonebar a`.
- **ADR-069 — sync pill in flow** (`packages/ui/src/page-editor.tsx`): `[data-sync-pill]` moved from
  `position:fixed; bottom:28px; right:24px` at the card's foot to a right-aligned in-flow chip at
  the paper's head (border, 999-px radius). ADR-049 semantics untouched: same element,
  `role="status"`/`aria-live="polite"`, same `data-label-*` vocabulary, still the only indicator.
- **ADR-068 — axe-core WCAG 2.2 AA checker** (`packages/journeys/package.json`,
  `licenses.exceptions.json`, `steps.ts` `assertAxeClean`): axe-core 4.13 (MPL-2.0) is a
  journeys-only dev dep; `AXE_SOURCE` injects via `addScriptTag`, `axe.run` scoped to
  wcag2a/2aa/21a/21aa/22aa; every violation fails the step. Licence exception checked in.
- **P1 rewrite** (`packages/journeys/src/steps.ts`, `registry.ts` asserts text): three legs —
  (1) anon `/`+`/pricing`+`/login` at 390 and 320, matrix region scroll/label/Tab-reachability,
  200%-zoom reflow, axe; (2) signed-in phone context (`sec-ch-ua-mobile`) — project page overflow,
  `.ide-phonebar a`/`.ide-actions a` ≥44 px + actionable, all buttons ≥24 px, §10.1 ✗-set absent,
  `/v/working` pill in-flow + covers no text, run sheet shows `data-phone-blocked` and no
  `data-run-sheet` form, axe on all three; (3) desktop 1440×900 — `/app/new` styled chrome (no
  `.ide`, bordered header, three `data-entry` cards), the pill rect disjoint from statusbar/composer/
  open-desk rects, overflow, axe. Per-width screenshots land in `ctx.outDir` (`p1-*.png`; `StepCtx`
  gained `outDir` in `runner.ts`). `expected` stays `red` until prod proof.
- **Tests** (`apps/web/src/ide-surfaces.test.tsx`, 9 tests): route-enumeration IDE invariant (every
  element emitting `data-ide="1"` ⇒ document carries IDE_CSS+ide.js; `/app/new` absent from the set),
  server-driven legs (`/p/seed-essay` `/run` `/import`), `/app/new` Shell anatomy + phone blocked
  note + one `<h1>`, `.ide-actions` markup + phone CSS floor strings, matrix region markup +
  `themeCss` rule, pill not `position:fixed` at either width. Verified red→green: stashing
  `pages.tsx`+`render.tsx` fails 4 tests including `/app/new renders .ide without the IDE
  stylesheet`.

## 3 — Verification

- `pnpm install` clean (axe-core 4.13.0 resolved + locked).
- `pnpm turbo build lint typecheck` — 135/135 tasks green.
- `pnpm test` — 432 files / 4279 tests pass (6 skipped: pre-existing), incl. the new 9-test
  `ide-surfaces` suite; red-check confirmed by stash (4 failures on pre-fix code).
- `pnpm check:licenses` — OK, 610 packages (the `axe-core` MPL-2.0 exception is checked in with
  rationale — dev tooling, never shipped).
- `pnpm check:protocol-markers` — OK, 54 public-facing files.
- `pnpm check:no-cookies` — pre-existing failure at base `1037752` (`server.ts:378,395`
  `FP_COOKIE` — unchanged by this ticket); noted, not new.
- Prettier: the touched pre-existing files fail `--check` at base too (not gate-enforced); the new
  test file is prettier-clean.

## 4 — Stage B

- `ux2b` build → Pulumi update 132 (9 image updates + proxy template rotation) deployed
  `993920c`; provenance OK on both healthz; deployment row recorded (IAP tunnel re-established
  after proxy rotation).
- P1 prod run #1 → CSP blocked `addScriptTag`; fix: evaluate axe source via CDP.
- P1 prod run #2 → axe `color-contrast ×1` (`footer > span`): `--shell-fg-faint` was ~3.3:1.
  Retuned faint tiers to AA (dark `#868d97`, light `#646b74`, pinned `#9a948a`/`#6d6659`) +
  contrast tests + ADR-070; redeployed.
- P1 prod run #3 → axe `target-size ×1`: compact chat thread links (`padding: 2px 8px`) < 24px.
- **Pre-flight sweep** (cached `jrn-a` session + local axe against prod, all touched surfaces)
  found three more classes rather than discovering them one deploy at a time:
  1. `aria-required-children` — desk close × was a non-tab child of `role=tablist` → moved out
     into a new `.ide-desk-head` flex row (tablist is now a pure tab container).
  2. `select-name` — `ov_*` override selects (×8, /v/working) and the /app groupBy/protocol/sort
     selects (×3) had visual labels but no programmatic names → `aria-label` added.
  3. compact-chat targets → `.ide-phone-only` media block now covers `.chat-threads a` and
     `[data-chat-chip]` at ≥44px.
- `ux2c` build `511ddeb5` of `6723784` → all nine digests pinned → `pulumi preview` 9 updates +
  1 proxy-template replacement, no stateful → `pulumi up` **update 133** → healthz provenance
  `6723784c2a3b4aa449fc237c7aaddca254ab4f00` on api+web → IAP tunnel re-established
  (`rhema-prod-proxy-c519`) → `deployments` row `prod:6723784…` (`0.4.0+ec61156725a895ab`).
- P1 prod run #4 (`4ff89a27d950`): the phone `/v/working` leg exposed a **test-side** assumption —
  `/v/working` 302s to `/p/:slug` on phone (§10.1) and also when a project has no working head
  (EDIT.1 draft-less redirect). Fixed the leg to assert the honest contract: no pill may float
  wherever the request lands; the mounted-editor pill must exist + sit in-flow. The desktop leg
  now walks the project list for a mounted editor (first-12) instead of assuming the first
  project has a working head, and `pillTextOverlap` excludes closed-`<details>` children
  (Chromium keeps layout boxes for unpainted content-visibility subtrees — false positive on the
  restore menu).
- P1 prod run #5 — **GREEN** on prod at `6723784`, provenance matched, $0 spend, zero console
  errors/failed requests; screenshots `p1-pricing-390 / p1-project-390 / p1-pill-390 /
  p1-runsheet-390 / p1-app-new-1440 / p1-pill-1440` in `docs/build/reports/UX.2/`.
  `registry.ts` P1 `red → green`.

## 5 — Deferrals / closeout

- `D-P1.19-2` annotated: the ≤768-px geometry legs it mapped onto P1 are now PROVEN on prod
  (no overflow at 390/320, ≥44-px primaries, §10.1 set absent, axe AA clean); its interactive
  gate/disposition/chat/email-deep-link legs remain HUMAN (real-device) as before.
- No new deferrals: every ticket obligation is verified in-repo or live on prod.
