# R7FIX.7 — the acceptance-routed post-round defects

Fixes the six defects GATE-ACCEPT.R7's signed list routed to this insert (F-9 + F-10…F-14),
each at source. Base `stevevitali/r7rec-1-reconcile`. **mergePolicy: OPERATOR** — the
operator merges bottom-up; a run never merges itself.

## What changed

- **F-9 — D2.tour asset-parity (leg-side, over-strict check):**
  `assertBundleParity` (`packages/journeys/src/steps.ts`) required `status===200` on every
  `/assets/**` hit. The hero clip's `<video>` negotiates `Range` requests — prod correctly
  answers `206 video/mp4` (curl-verified). 206 is now accepted only for the range-served
  media extension set; `mp4`/`webm` joined `ASSET_CONTENT_TYPE` so the media type is now
  asserted (tighter, not weaker). **D2.tour re-run green at `e578a767`** → D-R7TOUR.2-1's
  prod arm is discharged (evidence `docs/build/reports/2026-11-08_R7FIX.7/d2-tour-prod/`).
- **F-10 — N9 credit copy (evidence disposition, no defect):** the direct Stage-B red was
  the unbound-`JOURNEY_DATABASE_URL` substrate (`topups_require_plan` gate on the Free
  re-mint — correct product behavior). Post-deploy nightly `42465216426` ran N9 **PASS**
  at `e578a767`. Discharged by evidence; nothing patched.
- **F-11 — P1 links (drawer a11y):** the off-canvas sidebar at <768/IDE-drawer used
  `translateX(-100%)` only — links stayed visible-to-tools and keyboard-focusable while
  invisible (real a11y defect; also stranded `a[href^="/p/"]`.first() on the showcase recent).
  `ide-css.ts` adds `visibility: hidden` closed / `visible` open with a delayed flip.
- **F-12 — P1.app-new axe ×2:** the IDE controller stamped `aria-selected` on non-tab
  `[data-ide-panel-tab]` carriers (the "Ask in chat" ghost Button) — now gated on
  `role="tab"`; `FilesPane` moved `ui-t-pm`→`ui-t-mut` (it mounts only on the shell ground;
  the paper-muted token landed ~3.1:1 on the pinned-light-in-dark-shell pair).
- **F-13 — T4 citation select:** the Radix `Select` migration shadowed the declared
  `select[data-csl-style]`/`select[data-md-profile]` carriers (hook on a button trigger;
  hidden BubbleSelect unhooked). The export form is a native document POST — native selects
  restored with their `<option>`s (RV-36; named GUARD-1 exemption).
- **F-14 — T5 intercepted checkbox:** same class — `autoIncludeNew`/`dailySync`/`include`
  restored to native `<input type="checkbox">` in the native-POST source forms (Radix's
  aria-hidden pointer-inert BubbleInput was unclickable under the card). Named exemption.

## Verification

- Fresh `pnpm turbo build` 46/46 · `turbo typecheck lint` 138/138.
- vitest: touched files 83/83; full `apps/web/src` + `packages/journeys/src` sweep
  1893 pass (7 transient 5-s timeouts under a concurrent browser leg — re-run in isolation
  55/55 green).
- `check:dom-contract` / `spa-budget` / `spa-env` / `protocol-markers` / `licenses` — green.
- Prod read-only: `D2.tour` `--stage prod --expect-sha e578a767…` → **PASS** ($0).
- F-10 evidence: nightly `42465216426` N9 PASS at `e578a767`.
- **Deferred:** the P1.*/P1.app-new/T4/T5 prod arms are provable only on a NEW deploy →
  `D-R7FIX.7-1` (dated, in DEFERRALS). No preview, no prod mutation.
- Spend: **$0**.
