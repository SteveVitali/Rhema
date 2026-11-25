# Run ledger — R7UX.5 (row 328)

Harness: devin-cli/swe-2-high/subagent
Skills: unknown
Started: 2026-11-25T17:42Z
Closed: —
Spec: docs/tickets/328_R7UX.5__pricing-copy.md
Base: `stevenvitali/r7ux-4-dossier-visual-unify` @ `379e5a68` (unmerged — OPERATOR)
Branch: `stevenvitali/r7ux-5-pricing-copy`
Config: implement-spec full (ledger/self-review/gap/tests/evidence on; live = Stage A + owned
pr-<n> preview walk per the 324 ruling, $0, prod untouched)
Budget: ~250 changed lines incl. tests (S) — stop past it

## Deferrals read

- Read `docs/tickets/DEFERRALS.md` at run start (2026-11-25). No `OPEN` row names this
  ticket, its branch, or the landing pricing teaser as its unblocker. The wave's own
  deferral obligation is the ticket's Live-stage line (Stage A + preview walk — same
  ruling as 324–327): the deployed-tip re-walk is carried as D-R7UX.5-1 (appended at close).
- `D-R7UX.1-1` … `D-R7UX.4-1` (OPEN) — the 324–327 deployed re-walks — untouched: they
  unblock only on the operator's stack merge + deploy carrying those SHAs.
- BL-13 / BL-68 / BL-69 / BL-101 (open economics rows) — untouched: this ticket is
  presentation only; no pricing-model or entitlement math changes.

## Requirements (spec Goal/anchors)

1. The landing pricing teaser (`apps/web/src/marketing.tsx`, the `data-section="pricing"`
   block) must not quote the 4.5× Base→Frontier credit range (`'2,600 – 11,730 credits'`)
   beside a run sheet that quotes a single dollars-first figure (REQ-BILL-1 register).
2. Quote what a review actually costs in the reader's terms — the estimator's own
   per-review figure, or a dollarized line derived from it — whichever source the
   entitlement config (`PRICING.trial.entitlement`) exposes. Single anchor.
3. Copy boundary: presentation only; every number derived from the shared
   estimator/entitlement config through `surfacePricer()`/`buildPricingPageData`
   (REQ-SPEC-32) — never a hardcoded price; the credit mechanism stays visible.
4. Canonical vocabulary only (`reserved-strings.ts` / entitlement config) — a hardcoded
   price string is a finding, not a fix.
5. Out of scope: pricing-model changes (BL-13), entitlement math, the run sheet itself,
   §16.4 claims (G2-gated). If the honest fix needs new economics, stop and defer.

## Acceptance criteria (working checklist — layers on close)

- AC1 (engineered): the teaser's quoted figure is rendered from the
  estimator/entitlement source (recomputed in test, never a literal).
- AC2 (engineered): the 4.5×-range presentation is gone — no `' – '` credit range in
  the teaser; the new single-anchor rendering is asserted.
- AC3 (engineered): copy-guard tests still green (lintCopy / lintGrowthCopy /
  lintInternalTerms / money-format); `pnpm turbo build lint typecheck` + web suite +
  `check:dom-contract`/`spa-budget`/`spa-env` + `check:protocol-markers` green.
- AC4 (live-executed→preview): preview walk — pricing section screenshot.

## Plan

1. `apps/web/src/copy.ts` — add `COPY.landing.pricing.teaserReviewFmt`, a `{…}`-templated
   line (so `collectCopyStrings` picks it up and the funnel lints cover it) carrying
   shape, tier, rigor, dollars and credits — no literal figure.
2. `apps/web/src/marketing.tsx` — the pricing teaser: hoist the pricer, compute the
   Essay card's Review at the anchor the entitlement config exposes
   (`data.trial.entitlement.modelTier` = `base`, `rigor` = `standard`), render it
   dollarized via `formatUsd` + `formatCredits` (the run-sheet register, REQ-BILL-1)
   through the new copy template; `null` figure renders "—" (fail closed).
3. `apps/web/src/marketing.test.ts` — the teaser test recomputes the anchor from
   `surfacePricer()` + `buildPricingPageData` and asserts: the derived dollar/credit
   figures render, the named tier renders, and no `' – '` credit range remains in the
   `data-section="pricing"` block.

## Test matrix

| AC | Test | File |
|---|---|---|
| AC1/AC2 | served `/` pricing section contains `formatUsd(anchor)` + `formatCredits(anchor)` + `MODEL_TIER_DISPLAY[tier]`, and no `\d – \d` range | `apps/web/src/marketing.test.ts` |
| AC1 | the anchor recomputes through `reviewCardCredits(surfacePricer(), essayCard.words, essayCard.claims, data.trial.entitlement.modelTier)` | same |
| AC3 | copy lints over `collectCopyStrings()` incl. the new template key; money-format guard untouched (marketing.tsx is not in its FILES list, but we use `formatUsd`/`formatCredits` anyway) | `apps/web/src/copy.test.ts` (existing) |
| AC3 | turbo build/lint/typecheck + web suite + 4 checks | commands |
| AC4 | pr-<n> preview walk + pricing-section screenshot | reports/ |

## Progress

- 2026-11-25T17:4xZ — Phase 0/1: anchors verified. Teaser is `marketing.tsx:291–305`
  rendering `{words} words · {claims} claims — Review {rangeLabel(reviewRow.range)}
  credits`; `reviewRow.range` is contracts' `tierRange` (Base→Frontier at Standard —
  `modelTierMultipliers` 1.0→4.5 ⇒ the 4.5× span). Run sheet is dollars-first
  (`estimateLine` — "≈ $85.35 · never more than …", REQ-BILL-1). Entitlement config
  exposes `PRICING.trial.entitlement = { kind:"review", wordCap:2800, rigor:"standard",
  modelTier:"base" }` — the trial reader's own first-run anchor. Page conventions
  already anchor derived figures on Base (`pricingFaq` `reviewBase`, `quickReviewLine`
  on Base). `formatUsd`/`formatCredits`/`reviewCardCredits`/`MODEL_TIER_DISPLAY`/
  `RIGOR_DISPLAY` all exported from `@rhema/contracts`.
- BL-96 read: `apps/web` scope, "a pricing-copy pass (economics → BL-13/BL-101)" — the
  presentation fix is in scope; no new economics needed (the source figure already
  exists), so no stop-and-defer.
- 2026-11-25T17:5xZ — Phase 2/3 done: `COPY.landing.pricing.teaserReviewFmt` added (so
  the funnel lints cover the line); the teaser renders the Essay card's Review at
  `data.trial.entitlement.modelTier` (`base`) via `reviewCardCredits(pricer, …)`,
  dollarized `formatUsd` + `formatCredits`, rigor/tier named via `RIGOR_DISPLAY`/
  `MODEL_TIER_DISPLAY`; `null` → "—". Rendered line: "5,000 words · 20 claims — a
  Standard Review on Base costs ≈ $26.10 (2,610 credits)" (verified via tsx render).
  marketing.test.ts now recomputes the anchor and asserts dollars+credits+named terms
  present and no `\d – \d` in `data-section="pricing"`. 21/21 file green; web
  typecheck+lint clean; turbo 39/39.
- 2026-11-25T18:0xZ — Phase 4: gap walk clean (table below). No other teaser surface
  exists (`billing-copy.ts` and the other pages carry no cost-card teaser). The
  `/pricing` page's per-tier cost-card ranges are the designed §15.2 presentation and
  stay. Pre-existing environment flake noted: `settings.dom.test.tsx` 3–4 tests hit
  the 5 s timeout in this worktree — identical on the unmodified base (verified via
  stash), unrelated to this change.

## Gap table

| Spec line | Where satisfied | Note |
|---|---|---|
| teaser quotes the estimator's per-review figure/dollarized line (not the 4.5× credit span) | `marketing.tsx` — `reviewCardCredits(pricer, essayCard…, ent.modelTier)` + `formatUsd` | single anchor, dollars first like the run sheet |
| anchor source = what the entitlement config exposes | `pricing.trial.entitlement` (`rigor:"standard"`, `modelTier:"base"`) — the reader's first-run terms | no hardcoded tier |
| every number derived (REQ-SPEC-32); never hardcoded | `surfacePricer()` → `buildEstimate`; `formatUsd`/`formatCredits`; test recomputes | no literal anywhere in the line |
| credit mechanism stays visible | `({credits} credits)` clause in `teaserReviewFmt` | "2,610 credits" renders |
| canonical vocabulary | `RIGOR_DISPLAY`/`MODEL_TIER_DISPLAY` | no hand-typed tier/rigor names |
| AC: figure derived not literal | `marketing.test.ts` — recomputes + asserts `formatUsd(anchor)`/`formatCredits(anchor)` | |
| AC: 4.5×-range presentation gone | same test — `not.toContain(range)` + `not.toMatch(/\d\s*–\s*\d/)` scoped to the pricing section | the `/pricing` cards keep their designed ranges |
| AC: copy/billing guards green | copy.test.ts / billing suites in the web run; `lintGrowthCopy` covers the new key | |
| AC: turbo + checks green | 39/39 turbo; dom-contract/spa-env/spa-entry-graph/protocol-markers OK; spa-budget OK (cumulative-drift WARN inherited, ticket delta ≈0 — SSR only) | |
| AC: preview walk + screenshot | Phase 5.3 (below) | |
| Out of scope: BL-13 economics, entitlement math, run sheet, §16.4 | untouched | |

## Evidence log

_(populated at Phase 5)_

## Evidence report

_(populated at close)_
