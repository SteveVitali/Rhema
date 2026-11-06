# R7KIT.3a — Migrate settings / billing / usage to primitives + copy fidelity

harness: devin-desktop/swe-2-high/subagent · ticket 240 of 254 · $0 · Stage A only (GD-PREVIEW.R7) · 2026-11-06

## Plan
REQ-KIT-3 batch a (settings/billing/usage — voices deferred to 240a): every control a 225a
primitive (Button/TextField/Select/Checkbox/RadioGroup), every style literal a `uiCss()` class,
REQ-GUARD-1 enabled per-batch for the three files; REQ-KIT-4 copy fidelity — sessions read
"Chrome on macOS · this device" (in-house UA parser, `spa/ua-label.ts`), enum keys render via
COPY-owned label maps with humanized fallback (usage workflow/state/bucket/plan, settings
integration status/log actions, voice sourceKind map authored for 240a); plan-value lines round
down — <1 prints "less than 1 essay review a month on Base" (D8/RV-28, spec §8.2, R6MNY.1 divisor
untouched, no money-mode change). Public `/pricing` delta accepted under GD-PUBDELTA.R7.

## Test matrix (all run locally, exit 0)
- `turbo build --filter=@rhema/web...` 13/13 · `@rhema/web typecheck` (3 tsconfigs) · `@rhema/web lint`
- `vitest` — settings/billing/usage dom 74/74; ua-label table 21 legs; pricing-page.test
  (floor/<1/hidden legs); no-raw-controls.test 68/68
- `check:dom-contract` · `check:spa-budget` · `check:spa-env` · `check:protocol-markers` · `check:licenses` (873) all green
- Entry delta vs baseline 04a4e98b: see PR body (primitives land in leaf chunks; Radix
  select/checkbox/radio-group denied in entry by check:spa-entry-graph design — leaf-only)

## Evidence — public-ssr-baseline (REQ-DACC-6, GD-PUBDELTA.R7)
Local `node apps/web/dist/main.js` (dead API_BASE_URL), baseline script before (pricing-page.ts +
ui-css.ts stashed) vs after (this head). Raw-HTML diff: /pricing differs ONLY in the
plan-value line ("≈0.7 …" → "less than 1 a month on Frontier" etc.); index/login/signup/showcase
diff = inlined uiCss batch-a block only (additive `.ui-set-*` rules, no removed/modified rules —
content-identical). WARN legs (login "private beta", showcase dossier text) are local-fixture
absences, unrelated. 250 re-checks at phase preview (D-R7KIT.3a-1).

## AC gap table (deterministic legs engineered+green)
- GUARD-1 on for 3 files ✓ (eslint.config NO_RAW_CONTROLS_ENABLED + exemption entries for
  HiddenField hidden carriers, each reasoned RV-36; seeded raw <button> fixture leg stays in
  rule tests) · hooks preserved (dom-contract green, 74 dom legs) · UA parser table-tested ×16
  combos + curl/unknown/partial · enum keys: DOM assert no snake_case in usage run rows ·
  formatter: <1 → "less than 1", ≥1 floored, null/non-computable hidden, every gated plan/tier
  over pricing.json · ssr-baseline diff committed above
- Stage-B (staging-verified at 250): D-R7KIT.3a-1 OPEN — screenshots + computed-style probe.

## Operating clauses 1–10
1 dates from `date -u` (2026-11-06T17:01Z) · 2 CI read at exact head via ci-boundary (below) ·
3 layers stated per AC · 4 protected records appended only · 5 gate words verbatim
(GD-PREVIEW.R7/GD-PUBDELTA.R7) · 6 no secrets/PII · 7 harness in header · 8 no living-record pins ·
9 ledger notes ride this push · 10 per-ticket boundary accepts fast-path.
