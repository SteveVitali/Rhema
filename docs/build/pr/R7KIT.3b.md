## R7KIT.3b — migrate run-sheet/export/import/new-project surfaces to `@rhema/ui` primitives + ONE number formatter

**Ticket:** `docs/tickets/241_R7KIT.3b__migrate-run-sheet-export.md` (row 241 of 254)
**Requirements stamped:** REQ-KIT-3 (batch b), REQ-COPY-5, REQ-KIT-5 (allowance), REQ-GUARD-1 (batch-b enablement). Findings: E1, D5, G6, I1, I3, UXC-16.
**Spend:** **$0 — Stage A only** (`GD-PREVIEW.R7`: no per-ticket preview; Stage-B evidence is owned by `250_R7DEP.2`). No preview, no production mutation, no run launched, no paid inference.

### What changed

**The ONE number formatter** — home recorded: `@rhema/contracts` `domain/estimate.ts` (the module that already owns money vocabulary: `formatUsd`/`formatCredits`/`estimateLine`/`creditsLine` stay canonical). New:

- `formatRate(r)` — bounded ≤4-decimal precision; `0.023000000000000003` renders `"0.023"` (E1's float-noise line impossible by construction); `0`/negative/non-finite/sub-0.0001 handled.
- `includedCreditsLine` / `bucketExpiryLine` — D5's generated sentences: `remaining > monthly` renders the over-allowance arm (never "4,000 of 2,000"); the expiry line normalizes so "credits" prints exactly once (never "Plan credits credits").
- `MONEY_FMT_INLINE_JS` — the no-JS run-sheet script's `usd`/`cr`, emitted from the same spec and parity-tested against `formatUsd`/`formatCredits`.
- Every `toFixed(`/`toLocaleString(` on money/credits removed from the six files (`money-format.test.ts` grep leg); `renderWhyLine`'s `× rate` goes through `formatRate`; usage's `credits()`/tables/sentences through `formatCredits` + the generators.

**Migrations (batch b):**

- `run-sheet.tsx` — rigor radios → `RadioGroup`, model-tier/protocol/approval selects → `Select`, toggles + auto-run → `Checkbox`, cap/dontAsk/venue/stage/protocol-fallback → `TextField`, user-sources/guidance → `TextArea`, run/payment-link/update-voice → `Button`; 11 hidden carriers → exempted `HiddenField` (RV-36). All `data-*` hooks + `name=` field map preserved; the JSON mutation, paywall, active-run/insufficient/included/suspended/missing arms, lever repaint, and upward-only cap floor unchanged. E1's duplicated pricing paragraphs merged (lede + meteredNote one paragraph; the cap claim once).
- `export.tsx` — format radios → `RadioGroup`, profile/CSL selects → `Select`, attach toggles → `Checkbox`, addition field → `TextField`, CTAs → `Button`. The export POST stays a native document-navigation form (byte download); the addition stays a JSON mutation with router navigation.
- `onboarding.tsx` — `FileDropzone` → `.ui-ob-drop` classes + visually-hidden file proxy (exempted — no file-input primitive exists); paste → mono `TextArea`; convert/discard → `Button`; `heldToken` → exempted `HiddenField`. Held-draft hydration/claim/discard semantics, presign→quarantine-key flow, `ConversionPreview` contract and polling unchanged.
- Zero inline spacing/type/colour/radius literals — compact `.ui-rs-*`/`.ui-ob-*` classes plus reused `.ui-set-*`/`.ui-vc-*`/`.ui-pill`/`.ui-bill-head`; `uiCss()` cascade-identical dedup (the nine-rule disabled group, duplicated focus rules, 20 selector merges) takes the file 25,355→**23,887 B ≤ 24 kB**.

**GUARD-1** — `run-sheet.tsx`/`export.tsx`/`onboarding.tsx` appended to `NO_RAW_CONTROLS_ENABLED`; exemptions only for `HiddenField` (×2) and `FileDropzone`'s file proxy; seeded raw-control legs fail on all three files.

### Verify (all run at this head)

`turbo build`/`typecheck`/`lint` green · `vitest apps/web/src` **1599/1599** (run-sheet dom 24, export dom, onboarding dom, usage dom, `money-format` 6, copy-containment) · `packages/ui` **157/157** · `packages/contracts`+`run-sheet`+`tools/eslint-plugin-rhema` **450/450** (incl. `number-format.test.ts` — rate ≤4dp property sweep, credits+$ pairing, `MONEY_FMT_INLINE_JS` parity, D5 sentences; seeded GUARD-1 legs) · `check:dom-contract` (run-sheet 71 / export 21 / onboarding 27 / usage 16 hooks emitted+asserted) · `check:spa-budget`/`spa-env`/`protocol-markers` OK.

**Entry delta:** **+15.5 kB** gz vs `04a4e98b` — ticket increment **+0.2 kB**; the +0.3 over-allowance deficit is 240's `GD-KIT3A-BUDGET`-ruled COPY-map cost, unchanged by this ticket. `check:spa-budget` still WARNs on the cumulative >15.0 — stated honestly, no ceiling touched.

### Owed at the R7b preview (never claimed green here)

`D-R7KIT.3b-1` — screenshots + provenance + computed-style probe on the four surfaces at `250_R7DEP.2`'s preview SHA.
