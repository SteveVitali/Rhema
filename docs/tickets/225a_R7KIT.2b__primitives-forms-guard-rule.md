# R7KIT.2b — Form and menu primitives + the REQ-GUARD-1 `no-raw-controls` rule (authored off)

- **Sequence:** 225a of 254 · **Phase:** round 7 (R7b) · **Kind:** ticket
- **base_branch:** current checkout
- **Depends on:** 225_R7KIT.2, for the pinned and licence-checked dependency stack, the
  `primitives/` layout, the `uiCss()` generator and its bound, the entry-graph guard, the
  baseline and delta report, and ADR-129. This row merges after 224 (spec §5.1). Development may
  start earlier on the stack.
- **Run:** `implement-spec spec=docs/tickets/225a_R7KIT.2b__primitives-forms-guard-rule.md`
- **Gate status:** none
- **Live stage:** Stage A only ($0: unit, DOM and lint-rule tests plus a local build). No surface
  changes. No owned preview (`GD-PREVIEW.R7`).
- **Production mutations:** none
- **Size budget:** ~550 changed lines excl. generated/lockfile (M). Entry-delta allowance ≤ 15 kB
  gz (REQ-KIT-5), expected ≈ 0 because nothing in the entry graph imports these primitives. The
  actual figure is stated in the PR.

## Goal
Complete the round-7 component kit with the form and menu primitives that the KIT-3 batches and
the R7b surfaces need. These are Popover, ContextMenu, Select, Tabs, Checkbox, RadioGroup, Switch, a
cmdk Combobox and palette list base, TextField, TextArea, RadioCards, the two-variant Chip,
EmptyState and Accordion. Also author the no-raw-controls lint rule (REQ-GUARD-1). The rule is
tested here but stays **off**: the KIT-3 batches enable it file by file, and R7GUARD.1 enables it
globally. No surface is migrated in this ticket.

## Load (read these — do not re-read others)
- `docs/round-7-draft-spec.md` §3.2 ADR-129, §4.6 REQ-KIT-2 and REQ-KIT-5, §4.16 REQ-GUARD-1,
  §8 items 3, 5 and 7.
- R6 `…/R6-ux-code-audit.md` §4 (controls census), §8 (design-system health), UXC-15, UXC-18. R5
  `…/R5-ux-browser-audit.md` C6 (a static chip must not look clickable).
- REVIEW `…/REVIEW-round-7-draft-spec.md` RV-16 (guard scope), RV-36 (native fallback stays).
- 225_R7KIT.2 as landed: the `primitives/` directory, the moved `Chip`, `uiCss()` and its bound,
  the entry-graph guard, the delta report, and ADR-129.
- 210_R7KIT.1 as landed: the KIT-1 base-layer selectors. They define the no-JS/SSR controls that
  the rule's exemption list names.
- Anchors (re-confirm at build time):
  - `packages/ui/src/primitives/` (225's layout) and the existing `Chip` call sites (grep);
  - `packages/ui/package.json` (the Radix packages, `cmdk` and `lucide-react` are already pinned
    by 225);
  - `eslint.config.js`; `tools/eslint-plugin-rhema/rules/*.js` with paired `*.test.ts`;
  - `scripts/check-spa-budget.mjs` (225's delta report).
- `docs/tickets/00_MANIFEST.md` § Cross-cutting invariants and § Operating rules;
  `docs/tickets/DEFERRALS.md` (root gotcha 1).

## In scope — deliverables
1. **Radix wrappers** under `packages/ui/src/primitives/` (REQ-KIT-2): Popover, ContextMenu,
   Select, Tabs, Checkbox, RadioGroup and Switch. They load in leaf chunks only (REQ-KIT-5).
2. **cmdk** (REQ-KIT-2): a Combobox and the palette list base. The palette surface itself is 228's.
3. **In-house** (REQ-KIT-2):
   - TextField;
   - TextArea (auto-grow);
   - RadioCards;
   - **Chip, two variants** [C6]: a static chip has no interactive role, tabindex or pointer
     affordance, and existing call sites keep their rendered behaviour;
   - EmptyState;
   - Accordion.

   Every primitive forwards `ref`, `data-*` and ARIA props, and carries no user-facing text
   (REQ-UX-12). Styling comes from `uiCss()`, extended within 225's ≤ 24 kB bound, with no inline
   spacing, type, colour or radius literals.
4. **REQ-GUARD-1 rule, authored off.** `rhema/no-raw-controls`:
   - **Bans** raw `<button|input|select|textarea>` and inline spacing/type/colour/radius literals.
   - **Scope:** `packages/ui/src/**` except `primitives/**`, plus `apps/web/src/**/*.tsx` (RV-16).
   - **Exemptions:** a named no-JS/SSR exemption list (controls styled by KIT-1).
   - **Enablement:** a per-file enablement list that the KIT-3 batches append to. It is registered
     `off` globally, and the enabled list is empty in this ticket.
5. **ADR-129 note.** A dated append covers the GUARD-1 rule name, the enablement-list mechanism, the
   exemption list, and this ticket's primitive set.
6. **No new dependency** is expected. If one is needed, it is pinned exactly, passes
   `check:licenses`, and is appended to ADR-129 (REQ-DOPS-8 re-asserted).

## Out of scope
- The dependency stack, `uiCss()` generator, entry guard, baseline, and shell-critical primitives:
  225_R7KIT.2.
- Migrating any surface, and enabling the rule for any file. KIT-3 batches are owned by 240,
  240a, 241, 234, 242, 243 and 243a. 232 enables it for `chat-panel.tsx`.
- The palette surface and `GET /search`: 228. The SplitPane engine: 229.
- Enabling REQ-GUARD-1 globally: 249_R7GUARD.1.

## Acceptance criteria
- [ ] Each primitive in deliverables 1–3 has a DOM test covering render, keyboard operation,
      forwarding of `data-*`/`ref`/ARIA, and theme classes. The tests also cover these cases:
      - a static Chip has no interactive role, tabindex or pointer affordance;
      - the existing `Chip` call sites render unchanged (a before/after snapshot);
      - TextArea auto-grows;
      - Select, Popover and ContextMenu are operable by keyboard alone;
      - the Combobox filters and selects by keyboard.

      *(deterministic · layer: engineered)*
- [ ] `uiCss()` with this ticket's additions still passes 225's ≤ 24 kB raw assertion, and the
      no-`style={…}`-literal test under `primitives/` is green.
      *(deterministic · layer: engineered)*
- [ ] The entry-graph guard is green, so none of this ticket's primitives enter the SPA entry. The
      delta report prints this ticket's entry delta, which is ≤ 15 kB gz and is stated in the PR.
      *(deterministic · layer: engineered)*
- [ ] `rhema/no-raw-controls` has positive, negative, exemption and per-file-enablement tests. It
      is registered off, its enabled list is empty, and `pnpm turbo lint` is green with no new
      warnings. *(deterministic · layer: engineered)*
- [ ] `check:spa-budget`, `check:spa-env`, `check:dom-contract`, `check:licenses` and
      `check:protocol-markers` are green, with no ceiling raised.
      *(deterministic · layer: engineered)*
- [ ] verification green; every new behaviour has a test that fails if it is removed; requirement ids stamped in the PR; anything not automatically verifiable is a `DEFERRALS.md` row with its compensating control; ADRs written for every deviation and owned decision; `BUILD_INDEX.md` row and `LEDGER.md` advanced; operating clauses met — dates from the clock, PR checks read and recorded, AC layers stated, no living-record pins, protected records only appended, gate words verbatim, harness in the run-ledger header. *(agentic — the universal phase-gate AC)*

## Requirement IDs to satisfy and stamp in the PR
REQ-KIT-2 (the rest, moved from 225: Popover, ContextMenu, Select, Tabs, Checkbox, RadioGroup,
Switch, the cmdk Combobox and palette list base, TextField, TextArea, RadioCards, the two-variant
Chip, EmptyState and Accordion), REQ-GUARD-1 (authoring: the rule is authored and tested off;
enablement is per batch and then global in 249), REQ-KIT-5 (allowance)

## Cross-cutting invariants
- `docs/tickets/00_MANIFEST.md` § Cross-cutting invariants: 1 (canonical vocabularies), 2
  (licence allowlist, if a dependency is added), 3 (no protocol/eval text in bundles), 17 (context
  budget).
- Spec §8: 3 (copy; primitives carry none), 5 (budgets and checks green; no ceiling raised
  without a ruling), 6 (records append-only; the ADR-129 note is appended), 7 (sizing).

## Operating clauses
- Cited from `docs/tickets/00_MANIFEST.md § Operating rules`; the gap table has one row per clause.

## Notes
- **Origin.** This is Phase-4 Split decision 5 (`PHASE4-REVIEW-decomposition.md`), applied in
  full. REQ-GUARD-1 (authoring) and the parts of REQ-KIT-2 listed above moved here from 225.
- **Decisions this ticket owns:**
  - the GUARD-1 rule name, its enablement-list mechanism and the no-JS/SSR exemption list;
  - the two-variant Chip API;
  - the Combobox and palette-list-base API that 228 builds on.
- **Shared decisions consumed:**
  - the `primitives/` layout, `uiCss()`, the entry guard, the delta report and the dependency set
    (225);
  - the KIT-1 tokens and base layer, and focus-visible discipline (210).
- **Consumers.** 228 (cmdk, EmptyState), 229 (Tabs), 232 (TextArea, Select, Chip), 234
  (TextField, EmptyState), 235 and 236 (form fields), and every KIT-3 batch. Those batches enable
  the rule.
- **DEFERRALS.** If a Radix wrapper here does not support the repo's React 19 pin, open a dated row
  and record the choice in ADR-129. Do not silently substitute another library.
- **Size.** About 14 components, each with a DOM test, plus one lint rule, is mid-M. There is no
  pre-declared runtime cut. If the run overflows, the seam is the rule (deliverables 4 and 5)
  versus the primitives.
