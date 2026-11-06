## R7KIT.3a — Migrate settings / billing / usage to the primitives + copy fidelity

Ticket **240** (spec §10 row 240, Phase-4 split 6 — voices → 240a). `mergePolicy: OPERATOR`.
Stage A only ($0; GD-PREVIEW.R7 — no preview). Requirements: **REQ-KIT-3 (batch a: settings,
billing, usage), REQ-KIT-4, REQ-KIT-5 (allowance), REQ-GUARD-1 (batch-a enablement),
REQ-DACC-6 (/pricing delta under GD-PUBDELTA.R7)**. Findings: **D3, D4, D8, RV-28; UXC-16**.

### What changed
- `settings.tsx` (49→0 raw controls, ~225→0 style literals): every button→`Button`/`IconButton`,
  input→`TextField`/Radix `Checkbox`+`RadioGroup`, select→Radix `Select` (hidden form carriers
  keep the verbatim post grammar — `collectFormFields`/`bodyFields` unchanged); inline literals →
  `.ui-set-*`/`.ui-matrix` classes in `uiCss()` (≤24 kB bound held).
- `billing.tsx` (15→0 raw, 52→0 style): waitlist/subscribe/top-up/auto-reload/portal forms on
  primitives; `cycle` keeps its monthly default.
- `usage.tsx` (0 raw, ~40→0 style): `.ui-matrix` tables + label-mapped enum cells.
- `pricing-page.ts` `planCoverageLine` ROUNDS DOWN (spec §8.2): figure <1 → "less than 1 essay
  review a month on Base"/"less than 1 a month on {Tier}"; ≥1 floored to 0.1 (unchanged). Raw
  divisor untouched (R6MNY.1). No money-mode change.
- New `spa/ua-label.ts` — in-house UA→"Chrome on macOS" parser (no dependency); sessions render
  "· this device" on the current row only (D3).
- COPY label maps: `usage.workflowLabels/stateLabels`, `voice.detail.sourceKind` (authored for
  240a), `settings.sessionThisDeviceInline`; enum fallbacks humanize — no snake_case key can
  render (D4). `planLabel` reads `PRICING.plans[…].display`.
- `uiCss()` batch-a classes (+~3 kB of the ≤24 kB bound).
- REQ-GUARD-1 enabled for the three files (per-batch config, RV-16); `HiddenField` exemption
  entries (sessionId/personaId/tier/packId hidden carriers, RV-36 reasons).

### Verification (all local, exit 0)
`turbo build --filter=@rhema/web...` · typecheck · lint · vitest dom 74/74 + ua-label 21 legs +
pricing-page formatter + no-raw-controls 68 · check:dom-contract · check:spa-budget ·
check:spa-env · check:protocol-markers · check:licenses. **Entry delta vs 04a4e98b: +15.3 kB gz — +0.3 kB over the ≤15.0 kB per-ticket allowance** (the
running total at ticket 239 was already +15.0 — zero headroom, as the ticket warned). The ~0.3 kB
is the COPY-owned label maps (workflowLabels/stateLabels/sourceKind) riding the entry graph's
copy.ts; every new Radix dep is leaf-chunked (check:spa-entry-graph clean). The ticket anticipates
'an honestly declared deficit' — flagged for an operator ruling, not hidden. `public-ssr-baseline` local re-capture: /pricing
differs only in the plan-value lines (evidence + method in `docs/build/runs/R7KIT.3a.md`).

### Owed to 250_R7DEP.2 — never green here
`D-R7KIT.3a-1` (OPEN): Stage-B screenshots (settings account/sessions/notifications, billing plan
cards — no Stripe action, usage, public /pricing rounded lines) + computed-style probe (zero
native-styled controls) at the R7b phase preview, `--expect-sha`, committed under
`docs/build/runs/R7KIT.3a/`.
