# R7PUB.1 — signed-in `/pricing` + the landing refresh + the hero-recording slot (row 293)

- **Harness:** devin-desktop/swe-2-high/subagent · **Ticket:** `docs/tickets/249a_R7PUB.1__landing-pricing-refresh.md`
- **Branch:** `stevevitali/r7pub-1-landing-pricing` · **Base:** `stevevitali/r7guard-1-recurrence` @ `8408a116`
- **Requirement ids:** REQ-PUB-1, REQ-PUB-2 (code, slot, capture recipe — the recording asset + Stage B are 250's), REQ-TOUR-4 (the landing CTA — kept, extended to the marketing nav), REQ-DACC-6 (PUB-side local re-capture). Consumes REQ-COPY-6 (244's leaves), REQ-GUARD-1 (global, 249), REQ-GROWTH-3 (slot limits + markup).
- **Live stage:** Stage A only — $0. No preview (`GD-PREVIEW.R7`), no prod acts; mergePolicy OPERATOR.

## Plan (as run)

1. REQ-PUB-1 — `/pricing` renders for a signed-in reader (`server.ts` drops the `/app` redirect; `PageData.signedIn` swaps the nav's sign-in affordance for `data-pricing-app` → `/app`). The account-menu `data-shell-pricing` item (226) already doc-navs here — pair verified by test.
2. REQ-PUB-2 — `MarketingShell` (dedicated nav: Pricing · Demo `data-demo-entry="nav"` doc-nav · Sign in · CTA) + the §15.1 serif display headline (`ui-t-ffp` → `var(--font-paper)`, Literata) + the demo CTA (REQ-TOUR-4) + the REQ-COPY-6 leaves rendered unchanged + the FAQ on the `.ui-accordion*` classes over native `<details>` (the KIT-1 no-JS fallback — there is no React island on the funnel, so `<details>` IS the working control; judgement call recorded).
3. The hero-recording slot — `HeroRecordingSlot`: one reserved `aspect-ratio: 16/9` box (CLS 0), `<video muted loop playsinline preload="none" poster>` with a `data-hero-src` lazy source and NO `autoplay`; `client/landing.ts` arms src+play only when `prefers-reduced-motion` is off and the box nears the viewport (lazy). Reduced-motion and no-JS both see the poster frame; the slot keys on `HERO_RECORDING` clip+poster presence under `public/media/` (read per request in `/`).
4. `GET /assets/media/:file` — the committed-asset route (name-gated, extension allowlist, immutable cache, empty 404 — the Dockerfile's `public/` copy already ships the dir).
5. `packages/contracts/src/hero-recording.ts` — `HERO_RECORDING`, the ONE paths+limits declaration read by the slot, the recipe, and the tests.
6. `packages/journeys/src/hero-capture.ts` — 250's one-pass recipe: `--web`/`--expect-sha`/`--out`; healthz provenance; zero-cookie signed-in refusal (before + after the walk, plus credential-flag refusal); the logged-out `TOUR_STEPS` walk at 1440×900 under Playwright `recordVideo`; ffmpeg encode (no audio) + poster; `checkHeroLimits` + `checkHeroMarkup`. Dry-run output is a scratch dir — nothing commits.
7. ADR-127 — the recording is a corpus-content derivative: `licenses.exceptions.json` `"demo-hero-recording"` asset entry (declared paths; 250 completes bytes+sha256), LICENSES.md dated paragraph, ADR-127 dated note.
8. REQ-DACC-6 — local `public-ssr-baseline` BEFORE (@`8408a116` build) / AFTER (@branch build) re-capture.

## Test matrix / evidence

| Check | Result |
| --- | --- |
| `pnpm turbo build --filter=@rhema/web... --filter=@rhema/journeys...` (fresh, post-change) | 15/15 |
| `pnpm --filter @rhema/web typecheck` · `@rhema/journeys typecheck` | clean |
| `pnpm --filter @rhema/web lint` · `@rhema/journeys lint` · `@rhema/contracts lint` | 0 errors — GUARD-1 `error` reports **0 diagnostics** (`marketing.tsx` rides the committed no-JS/SSR file exemption; the funnel's native forms are the permanent KIT-1 fallback) |
| `pnpm exec vitest run apps/web/src` (full sweep) | **1667/1667** |
| `pnpm exec vitest run packages/journeys/src` | see ledger tail |
| `marketing.test.ts` (7 new legs) | signed-in `/pricing` 200 + `data-pricing-app` nav; account-menu pair leg; 12-section order intact; `data-mk-nav` + serif `data-display-headline` + demo CTA; placeholder arm (NO `<video>`) vs clip arm (muted/loop/playsinline/preload-none/poster/`data-hero-src`, no autoplay, no inline src) with the IDENTICAL aspect box pin; FAQ `<details>` count + accordion classes |
| `server.test.ts` | 118/118 (incl. signed-out `/pricing` unchanged) |
| `hero-capture.test.ts` | 9/9 — limits pass; seeded over-duration/over-bytes/audio legs FAIL; markup contract both arms; declaration pin |
| `check:dom-contract` | OK — 9 new hooks declared/emitted/asserted |
| `check:spa-budget` | WARN-held (all ceilings held) — entry **+33.3 kB** gz vs `04a4e98b`; ≈ **+0.1 kB** this ticket (landing.ts hero arm + HERO_RECORDING; marketing is SSR, SPA entry graph unchanged; GD-KIT3A-BUDGET/GD-SPA-ENTRY.R7 stand) |
| `check:spa-env` · `check:protocol-markers` · `check:no-cookies` · `check:licenses` | all green (873 packages; the `"demo-hero-recording"` asset entry parses) |
| `public-ssr-baseline` BEFORE/AFTER (local; `docs/build/reports/2026-11-07_r7pub-1-public-ssr-baseline-{BEFORE,AFTER}`) | All five routes + favicon 200. Semantic fields identical except `/`: `normalizedSha256` + bytes 61,210→62,351 — the enumerated landing-refresh delta. `/pricing`, `/signup`, `/login`, `/showcase` differ ONLY in the canonical/og:url origin port between the two captures (the script is anonymous — the signed-in `/pricing` arm is test-proven). Same 2 warnings both runs (`/login` "private beta" — pre-existing; `/showcase` sample-dossier text absent on an unseeded local boot — data-dependent, identical before/after). |
| Local LCP/CLS smoke (not REQ-GROWTH-3 evidence) | `/` TTFB 30.2 ms, full 31 ms, 62,351 B (14,217 B gz) on the local build; CLS 0 by construction — the slot's `aspect-ratio` box is byte-identical in both states (test-pinned). Preview-measured LCP/CLS owed to 250 (D-R7PUB.1-1). |
| Recipe dry run | `checkHeroLimits`/`checkHeroMarkup` legs proven by unit tests; a live Playwright+ffmpeg dry run against the local build was exercised during development of the walk (no output committed — the AC's dry-run evidence is the seeded fixture legs + the recipe's own refusal/provenance arms). |

## AC table

| AC | Layer | Evidence | Verdict |
| --- | --- | --- | --- |
| PUB-1/2 behaviours have tests that fail if removed (signed-in `/pricing`; account-menu link; `/showcase` redirect kept; marketing layout + display headline; reduced-motion poster; lazy loop + placeholder state; FAQ Accordion + no-JS fallback) | engineered | `marketing.test.ts` legs above; `/showcase` signed-in→dossier redirect covered by its pre-existing legs (302s, unchanged); reduced-motion = the island's `prefers-reduced-motion` gate + markup contract (`preload="none"`, no autoplay → poster always shows) | PROVEN (Stage A) |
| launch-surface lint, `lintCopy`, `lintGrowthCopy` green; no efficacy phrasing; pen name only | engineered | `copy.test.ts` + `launch-surface.test.ts` green; new leaves (`recordingAlt`, `backToApp`) inside `landing.*`/`pricing.*` scope | PROVEN |
| hero box reserves dimensions; layout test asserts no shift between states; local LCP/CLS smoke recorded | engineered | identical-aspect pin in `marketing.test.ts`; smoke numbers above | PROVEN |
| capture recipe dry run passes limits; seeded over-limit clip fails; signed-in session refused | fixture-verified | `hero-capture.test.ts` (seeded legs + refusal arm + contract); live preview capture → 250 | PROVEN (Stage A) |
| ADR-127 asset declaration + dated note committed; `check:licenses` green | engineered | `licenses.exceptions.json` + `LICENSES.md` + ADR-127 dated note; `pnpm check:licenses` OK | PROVEN |
| `public-ssr-baseline` re-captured locally, only enumerated deltas; guards green | engineered | BEFORE/AFTER dirs committed; diff above | PROVEN |
| Stage B — staging-verified at the R7b phase preview (250) | staging-verified → `D-R7PUB.1-1` | owed: recording committed by the recipe on the preview, landing at 1440/390 + reduced-motion, hero LCP/CLS, signed-in `/pricing` + account-menu link | **OWED** (never claimed) |
| Universal phase-gate AC | agentic | all deterministic checks run and named; requirement ids stamped; deferral appended; BUILD_INDEX/LEDGER advanced; harness named; dates from `date -u` | PROVEN |

## Judgement calls

- **FAQ "on Accordion"** — implemented as native `<details>`/`<summary>` on the `.ui-accordion*` class family. The funnel has no React island, so a Radix/in-house Accordion's buttons would be inert; the styled `<details>` IS the KIT-1 no-JS fallback and the honest working control. Recorded here per the ticket's consume-note.
- **GUARD-1** — `marketing.tsx` rides the committed file-level no-JS/SSR exemption (`no-raw-controls-exemptions.js`, RV-36); the global `error` run reports 0 diagnostics on the touched files. New markup keeps to that exemption's spirit (existing file conventions + `.ui-*` classes where they exist).
- **`/assets/media/:file`** — new same-origin GET, extension-allowlisted and name-gated like `/assets/fonts/:file`; an absent asset 404s empty, never the not-found document.
- **`?audience=test` on `/pricing`** — the signed-in preview arm no longer needs its redirect exemption: signed-in readers render `/pricing` regardless; `audienceClaims` still resolves the claims config.
- **Row numbering** — the run brief said "next row (292)"; the index's 292 is R7GUARD.1, so this row is **293**.

## Report

- Changed lines ≈ 430 excl. generated/reports (M). Spend: **$0**. Stage A only (`GD-PREVIEW.R7`).
- Deferrals: opened **D-R7PUB.1-1** (deployed walk + recording capture → 250_R7DEP.2); none closed.
- `D-R7PUB.1-1` unblocked by 250's preview walk; verification recipe committed (above).
