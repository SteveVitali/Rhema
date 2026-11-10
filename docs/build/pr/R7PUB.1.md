# R7PUB.1 — signed-in `/pricing` + the landing refresh + the hero-recording slot

Row 293 · base `stevevitali/r7guard-1-recurrence` @ `8408a116` · Stage A only ($0, `GD-PREVIEW.R7`) · mergePolicy OPERATOR — never self-merged.

**Requirement ids:** REQ-PUB-1, REQ-PUB-2 (code, slot, capture recipe — the recording asset + Stage B are 250's), REQ-TOUR-4 (CTA), REQ-DACC-6 (PUB-side local re-capture). Consumes REQ-COPY-6 (244), REQ-GUARD-1 (249 global), REQ-GROWTH-3. Findings: H1–H3 rendered, RV-32.

## What lands

- **REQ-PUB-1** — `/pricing` renders signed-in (200, the `/app` redirect dropped); `PageData.signedIn` swaps the nav's sign-in link for `data-pricing-app` → `/app`. The account-menu `data-shell-pricing` item (226) already doc-navs here. Signed-in `/showcase` keeps its redirect (unchanged legs).
- **REQ-PUB-2** — `MarketingShell` dedicated nav (Pricing · Demo `data-demo-entry="nav"` doc-nav · Sign in · CTA) + §15.1 serif display headline (`ui-t-ffp`/Literata) + demo CTA (REQ-TOUR-4) + 244's REQ-COPY-6 leaves + FAQ on `.ui-accordion*` classes over native `<details>` (the KIT-1 no-JS fallback — the funnel has no React island).
- **Hero-recording slot** — one reserved 16:9 box, identical aspect in both states (CLS 0). Placeholder until the declared asset exists; then `<video muted loop playsinline preload="none" poster>` with `data-hero-src` (lazy, no autoplay) — `client/landing.ts` arms only when `prefers-reduced-motion` is off and the box nears the viewport. Keys on `HERO_RECORDING` clip+poster presence under `public/media/`; `GET /assets/media/:file` serves them (name-gated, immutable).
- **`HERO_RECORDING`** (`packages/contracts/src/hero-recording.ts`) — the ONE paths+limits declaration (≤15 s, ≤2 MB, 16/9) the slot, the recipe, and the tests all read.
- **Capture recipe** (`packages/journeys/src/hero-capture.ts`) — 250's one-pass logged-out tour recording: `--web`/`--expect-sha`/`--out`, healthz provenance, zero-cookie signed-in refusal, Playwright `recordVideo`, ffmpeg encode+poster, `checkHeroLimits`/`checkHeroMarkup`. Dry-run output commits nothing.
- **ADR-127 carve-out** — `"demo-hero-recording"` asset entry + LICENSES.md dated paragraph + ADR-127 dated note (250 completes bytes+sha256).

## Verification (all run, honestly)

fresh `pnpm turbo build` 15/15 · typecheck web+journeys · lint web/journeys/contracts **0 err — GUARD-1 `error` 0 diagnostics** (marketing.tsx rides the committed no-JS/SSR file exemption) · web sweep **1667/1667** · journeys **228/228** · `check:dom-contract`/`spa-budget`/`spa-env`/`protocol-markers`/`no-cookies`/`licenses` all green · entry **+33.3 kB** gz vs `04a4e98b` (≈ +0.1 kB this ticket — SPA entry graph unchanged; GD-KIT3A-BUDGET/GD-SPA-ENTRY.R7 stand) · `public-ssr-baseline` BEFORE/AFTER — only `/` moved (the enumerated landing refresh; other routes differ solely by capture port) · LCP/CLS smoke: TTFB 30 ms, 62,351 B; CLS 0 by construction.

## Deferrals

- Opened **D-R7PUB.1-1** → `250_R7DEP.2`: deployed walk + the recording captured by this recipe at the preview SHA, landing 1440/390 + reduced-motion, hero LCP/CLS, signed-in `/pricing` + account-menu link, ADR-127 row completed.
- Stage-B AC owed — reported, never claimed.

Run ledger: `docs/build/runs/R7PUB.1.md`.
