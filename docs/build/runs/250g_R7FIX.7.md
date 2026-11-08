# R7FIX.7 — the acceptance-routed post-round defects (run ledger)

- **Ticket:** `docs/tickets/250g_R7FIX.7__postround-defects.md` · **Branch:**
  `stevevitali/r7fix-7-postround-defects` · **Base:** `stevevitali/r7rec-1-reconcile`
  (`da233783`) · **Date:** 2026-11-08 · **Harness:** devin-desktop/swe-2-high/subagent
- **Scope:** the GATE-ACCEPT.R7-signed routing — F-9 (D2.tour asset-parity) + F-10…F-14
  (the five product defects), each fixed at source. Stage A + prod read-only leg arms only;
  **$0**, zero production mutations.
- **Provenance:** `GET https://rhema.tools/healthz` → `gitSha e578a767…` (2026-11-08) — the
  deployed SHA every prod arm cites.

## Root causes → fixes (per finding)

| finding | leg | root cause | fix (file) | verdict |
|---|---|---|---|---|
| **F-9** | D2.tour | The leg's `assertBundleParity` required `status===200` on every `/assets/**` hit; the hero clip's `Range` request is correctly answered **206 Partial Content** (`curl -I -H 'Range: bytes=0-1023' → 206 video/mp4`). Asset correct; the leg's status check was over-strict. | `packages/journeys/src/steps.ts` — 200 stays required; **206 accepted only for the range-served media extension set** (mp4/webm/m4a/mp3/wav/ogg/mov); `mp4`/`webm` added to `ASSET_CONTENT_TYPE` (type now asserted — a strengthening). | **prod arm GREEN at `e578a767`** — `cli --stage prod --steps D2.tour --expect-sha e578a767…` PASS, `docs/build/reports/2026-11-08_R7FIX.7/d2-tour-prod/report.json`. D-R7TOUR.2-1 prod arm discharged. |
| **F-10** | N9 | **Not a product defect.** The direct Stage-B run had `JOURNEY_DATABASE_URL` unbound → `ensureJrnaPaidFixture` no-ops → jrn-a on Free tier → `topups_require_plan` gate hides the form (correct product behavior, fixture-substrate's own comment). Post-deploy nightly `42465216426` (DSN bound → fixture seats) ran **N9 PASS** at `e578a767`. | none — discharged by nightly evidence, not a code change. | **prod arm already green at `e578a767`** (nightly 42465216426). Recorded honestly; no fabricated fix. |
| **F-11** | P1.project/pill/runsheet/outline/figures | The `<768`/IDE-drawer blocks park the sidebar `translateX(-100%)` but leave it Playwright-visible + keyboard-focusable — a real a11y defect (invisible focusables) that also stranded `a[href^="/p/"]`.first() on the `showcase-copy` recent outside the viewport. | `packages/tokens/src/ide-css.ts` — both drawer blocks gain `visibility: hidden` + delayed visibility transition; `[data-drawer='open']` restores `visibility: visible` with the transform-only transition. | Stage-A pin in `tokens.test.ts`. Prod arm owed on the next deploy → **D-R7FIX.7-1**. |
| **F-12** | P1.app-new | (a) the IDE controller stamped `aria-selected` on EVERY `[data-ide-panel-tab]` element — including the empty Page's "Ask in chat" ghost Button (no `role="tab"`) → axe `aria-allowed-attr`. (b) `FilesPane` (mounts only in the AppShell sidebar — a shell ground) used `ui-t-pm` (`--paper-fg-muted`); with the paper pinned light inside the dark shell the token resolved #6d6558 on #161a1f ≈ **3.1:1** → axe `color-contrast` (confirmed in the committed screenshot's pixel census). | (a) `apps/web/src/spa/ide/controller.ts` — `aria-selected` set only on `role="tab"` carriers, removed otherwise. (b) `packages/ui/src/files-pane.tsx` — `ui-t-pm`→`ui-t-mut` (`--shell-fg-muted`; inside `.paper` it remaps to `--paper-fg-muted`, correct on both grounds). | Stage-A: typecheck+lint+axe-subset clean. Prod arm owed on the next deploy → **D-R7FIX.7-1**. |
| **F-13** | T4 | R7KIT.3b's Radix `Select` migration moved `data-csl-style`/`data-md-profile` onto `button` triggers; Radix's hidden BubbleSelect carries the form name but not the hooks, so `select[data-csl-style]` — the declared contract the leg drives — no longer existed. The export form is a NATIVE document POST (REQ-BFF-17): native selects are the correct carrier (RV-36). | `apps/web/src/spa/surfaces/export.tsx` — native `<select name data-md-profile>`/`<select name data-csl-style>` restored with `<option>`s; GUARD-1 exemption entry (`ExportSurface`). | Stage-A: `export.dom.test.tsx` strengthened to `select[data-*]` — green. Prod arm owed → **D-R7FIX.7-1**. |
| **F-14** | T5 | Same migration class: the source-settings/review checkboxes became Radix `Checkbox` — `input[name="autoIncludeNew"]` resolved to Radix's `aria-hidden` pointer-inert BubbleInput under `<li.ui-vc-card>` → `uncheck()` times out; the named carriers were untogglable/invisible to the form grammar. | `apps/web/src/spa/surfaces/voices.tsx` — native `<input type="checkbox">` for `autoIncludeNew`/`dailySync`/`include` (same posts: `on`/`<external_id>`); GUARD-1 exemption entry (`VoiceSourceCard`). | Stage-A: `voices.dom.test.tsx` pins `input[type="checkbox"][name=…]` — green. Prod arm owed → **D-R7FIX.7-1**. |

## Verification (all run, fresh `pnpm turbo build` 46/46 first)

- `pnpm turbo build` — 46/46 · `pnpm turbo typecheck lint` — 138/138.
- vitest touched: `steps-parity.test.ts` (new, 3) · `tokens.test.ts` (drawer pin) ·
  `export.dom.test.tsx` · `voices.dom.test.tsx` → **83/83**.
- Full sweeps: `vitest apps/web/src packages/journeys/src` → 1893 pass / 2 files showed 7
  contention timeouts while the prod browser leg ran concurrently; **both files re-run in
  isolation → 55/55 green** (contention, not defects — recorded honestly).
- `check:dom-contract` · `check:spa-budget` · `check:spa-env` · `check:protocol-markers` ·
  `check:licenses` — all green.
- **Prod read-only arm:** `--stage prod --steps D2.tour --expect-sha e578a767…` → **PASS**
  (report + screenshots committed). N9's arm cited from nightly `42465216426`.
- `curl -sI -H 'Range: bytes=0-1023' /assets/media/hero-tour.mp4` → `206 video/mp4` (asset
  verified correct before touching the leg).
- P1.*/P1.app-new/T4/T5 prod arms are provable only on a NEW deploy (the product fixes are
  undeployed) → `D-R7FIX.7-1`, dated.

## Judgement calls

- **F-10:** the capstone classified "credit copy" as a product defect; the nightly evidence
  proves the direct run's red was the unbound-DSN substrate honest-failure mode. Discharged
  by evidence, not patched — no fabricated fix.
- **F-13/F-14:** fixed at source per the ticket (native carriers in native-POST forms —
  RV-36's own rule), not by retargeting the legs.
- **F-9:** the 206 arm is accepted only for the range-media extension set and the media
  content-type is now asserted — the check is tighter, not weaker.
