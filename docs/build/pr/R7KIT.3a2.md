# R7KIT.3a2 — Migrate voices.tsx to the 225a primitives (batch a part 2)

Ticket: `docs/tickets/240a_R7KIT.3a2__migrate-voices.md` (row 240a). Stage A only — $0, no preview,
no production mutation. Stacked on `stevevitali/r7kit-3a-settings-billing` (PR #278, unmerged).

## What changes

`apps/web/src/spa/surfaces/voices.tsx` migrates to the 225a `@rhema/ui` primitives (REQ-KIT-3 batch
a, REQ-GUARD-1, REQ-KIT-4's D4, UXC-16):

- **Controls** — every raw `<button>` → `Button` (name/value/`data-*`/`aria-label` verbatim);
  text/url inputs → `TextField`; textareas → `TextArea`; the mode `<select>` → `Select`; tier radios
  → `RadioGroup`/`RadioGroupItem`; six checkboxes → `Checkbox`; all three native file inputs →
  `TextField type="file"` (`accept` preserved). The Radix pickers' own hidden carriers keep the
  no-JS post grammar verbatim — `name="mode"`, `name="tier"`, `include`/`autoIncludeNew`/`dailySync`
  still post exactly as before.
- **Styling** — every inline spacing/type/color/radius literal removed; `.ui-vc-*` classes for the
  voices-only shapes plus reused `.ui-set-*`/`.ui-prow-heading`/`.ui-tabs-*`.
- **Labels (D4)** — voice source kinds and every other enum render through the COPY label maps
  (`sourceKind`, `providerLabel`, `stateBadge`, `qualityBadge`, `calibrationVerdict`,
  `runStateLabel`, `tierLabel`, `usage.workflowLabels`) with a humanized fallback — no second map;
  `substack_export` renders "Substack export".
- **GUARD-1** — enabled for the file; one reasoned exemption: `HiddenField`, the hidden id/flag
  carriers (runId/provider/scope/tier/quarantineKey/known) the Radix pickers do not own (RV-36).
- **`uiCss()`** — voices' `.ui-vc-*` block fits the ≤24 kB bound via a cascade-identical dedup
  (repeated border/radius/background declarations hoisted into selector groups; themeCss-covered
  form-element font decls dropped; `:focus-visible` rules merged) — 24,553 → 23,976 B. Includes a
  dated fix: `ui-set-sec` referenced the nonexistent `--s5` → `--s6` (the rule was a silent no-op).
- **Grammar preserved** — form actions/methods/`encType`, submitter name/values, the delegated
  submit's collect-before-busy + submitter + repeat-name fold, the presign→PUT→`quarantineKey`
  file leg (REQ-BFF-16), `?tab=` links, phone suppressions, and all `data-*`/aria hooks.

## AC evidence (Stage A)

- GUARD-1 enabled + green; a seeded raw `<button>` linted on `voices.tsx` reports the rule
  (`no-raw-controls.test.ts`).
- Voices DOM tests 41/41; `check:dom-contract` green — 114 voices hooks emitted+asserted.
- D4 legs: card sources assert "Substack · Paste · Substack export"; a new sweep mounts all nine
  voices paths and fails on any snake_case token in rendered text.
- `turbo build` / `typecheck` / `lint` green; web sweep **1593/1593**; ui+plugin **194/194**.
- `check:spa-budget`/`spa-env`/`protocol-markers` green. **Entry delta +15.3 kB vs `04a4e98b` —
  this ticket's increment is +0.0 kB** (voices is a leaf chunk; the +0.3 overage is the parent's
  GD-KIT3A-BUDGET-ruled deficit, unchanged).

## Owed to 250

`D-R7KIT.3a2-1` (OPEN): Stage-B voices list/detail screenshots + computed-style probe at the R7b
phase preview SHA — this PR reports it owed, never green.
