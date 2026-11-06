# R7KIT.3a2 — Migrate voices.tsx to the 225a primitives (batch a part 2)

- **Ticket:** `docs/tickets/240a_R7KIT.3a2__migrate-voices.md` (row 240a; split 6 file; parent R7KIT.3a)
- **Branch / base:** `stevevitali/r7kit-3a2-voices` → PR base `stevevitali/r7kit-3a-settings-billing` (local `d2669fd8` — carries `084c3a72` ci re-read + `d2669fd8` GD-KIT3A-BUDGET ruling)
- **Harness:** devin-desktop/swe-2-high/subagent
- **Stage / spend:** Stage A only, $0 — no preview, no production mutation (GD-PREVIEW.R7). mergePolicy: OPERATOR — unmerged.
- **Date:** 2026-11-06

## Plan

Per the ticket's Execute: migrate `apps/web/src/spa/surfaces/voices.tsx` to the 225a primitives —
Button/TextField/TextArea/Select/Checkbox/RadioGroup(+Item), the native file inputs onto `TextField
type="file"` (the file-carrier precedent settings already ships — the onboarding dropzone is a
visually-hidden native input anyway, so a styled file `ui-field` is the cheaper, still-accessible
carrier), zero inline style literals (`.ui-vc-*`/`.ui-set-*` `uiCss()` classes), voice source kinds
through 240's `COPY.voice.detail.sourceKind` map (plus `providerLabel`/`stateBadge`/`qualityBadge`/
`calibrationVerdict`/`runStateLabel`/`tierLabel`/`usage.workflowLabels`, humanized fallback — no
second map authored), GUARD-1 enabled on the file with one named `HiddenField` exemption.

## AC gap table (gate layers)

| AC | Layer | Status |
|---|---|---|
| GUARD-1 enabled for voices.tsx and passes | Stage A | GREEN — `rhema/no-raw-controls` `error` on the file; `@rhema/web lint` clean |
| Seeded raw `<button>` in a voices fixture fails the rule | Stage A | GREEN — `no-raw-controls.test.ts` leg lints a planted button on `voices.tsx` under the real config → violation reported |
| Every new exemption names a no-JS reason | Stage A | GREEN — one entry: `HiddenField` component, reason states the hidden id/flag carriers (runId/provider/scope/tier/quarantineKey/known, RV-36) |
| Existing voices DOM tests + `check:dom-contract` pass, hooks preserved | Stage A | GREEN — 41/41 voices dom tests; voices 114 hooks emitted+asserted |
| No source-kind/option snake_case key in rendered text outside `data-*`; DOM assertion | Stage A | GREEN — fixture carries `substack_export`; card asserts "Substack · Paste · Substack export"; new sweep leg mounts 9 voices paths and fails on any `\b[a-z0-9]+_[a-z0-9_]+\b` in `[data-spa-surface]` text |
| `check:spa-budget`/`spa-env`/vocabulary/protocol checks pass | Stage A | GREEN — see evidence |
| Stage-B walk (screenshots + computed-style probe at the R7b preview) | Stage B | **OPEN — D-R7KIT.3a2-1 → 250_R7DEP.2** (owed, never green here) |

## What shipped

- `apps/web/src/spa/surfaces/voices.tsx` — all ~68 raw controls migrated: submits → `Button`
  (name/value/`data-*`/`aria-label` verbatim), text/url inputs → `TextField`, textareas → `TextArea`,
  the mode `<select>` → `Select` (BubbleSelect keeps `name="mode"` in the collected grammar), tier
  radios → `RadioGroup`/`RadioGroupItem` (`data-tier-full` preserved; the BubbleInput keeps
  `name="tier"`), the six checkboxes → `Checkbox` (name/value/defaultChecked/`aria-label`), all
  three native file inputs (`sample_file`, `file` ×2) → `TextField type="file"` with `accept`
  preserved; ~15 hidden carriers → the exempted `HiddenField` component. All `style={{…}}` removed —
  `.ui-vc-*` classes plus reused `.ui-set-*`/`.ui-prow-heading`/`.ui-tabs-*` (tab anchors mirror
  `data-state` onto Radix's own active selector; `aria-current` kept as the semantic + contract
  hook). Enum keys render via `enumLabel(map, key)` / `humanizeKey` fallback — no second
  source-kind map authored (240's `COPY.voice.detail.sourceKind` consumed verbatim). Form actions,
  methods, `encType`, submitter name/values, delegated-submit collection, presign→PUT→`quarantineKey`
  leg, `?tab=` links, phone-`compact` suppressions, and every `data-*`/aria hook preserved verbatim.
- `packages/ui/src/ui-css.ts` — added a terse `.ui-vc-*` block (~24 rules) for the voices-only
  shapes; to fit the ≤24 kB bound the file's repeated `border`/`border-radius`/`background`
  declarations were hoisted into three shared selector groups and the form-element
  font/size/line-height/color decls already supplied by `themeCss()` to `button/input/select/
  textarea` were dropped — cascade-identical (identical decls, identical order; all override rules
  still land later). `:focus-visible` rules merged into three groups. `uiCss()` now measures
  **23,976 B** (was 24,553 B — the parent's near-bound state; the dedup frees ~577 B net after the
  voices block). Dated fix folded in: `.ui-set-sec` `var(--s5)` → `var(--s6)` — `--s5` does not
  exist on the spacing scale so the rule silently resolved to `margin-top: 0` on settings/billing/
  usage section gaps (240's intended value is `s6`=24 px; recorded honestly as a shared-CSS
  correction, no behavior asserted by tests).
- `eslint.config.js` — `voices.tsx` appended to `NO_RAW_CONTROLS_ENABLED` (batch a complete).
- `tools/eslint-plugin-rhema/rules/no-raw-controls-exemptions.js` — voices `HiddenField` entry
  with the no-JS reason.
- `tools/eslint-plugin-rhema/rules/no-raw-controls.test.ts` — voices moved to the enabled list;
  the seeded `<button>` leg now asserts a violation on `voices.tsx` under the real config;
  `dossier.tsx` stands in as the not-yet-migrated control.
- `apps/web/src/spa/voices.dom.test.tsx` — fixture sources +`substack_export`; card asserts the
  label list verbatim and `not.toContain("substack_export")`; runs leg asserts "Voice profile" and
  `not.toContain("profile_voice")`; new 9-path sweep describe asserts zero snake_case tokens in
  `[data-spa-surface]` rendered text.

## Test matrix + evidence log (2026-11-06, local head)

| Check | Result |
|---|---|
| `pnpm turbo build --filter=@rhema/web...` | PASS (13 tasks) |
| `pnpm --filter @rhema/web typecheck` | PASS |
| `pnpm --filter @rhema/web lint` | PASS (0 errors; 1 pre-existing `chat-live.tsx` unused-disable warning) |
| `pnpm --filter @rhema/ui lint` | PASS |
| `pnpm exec vitest run apps/web/src/spa/voices.dom.test.tsx` | PASS 41/41 |
| `pnpm exec vitest run tools/eslint-plugin-rhema/rules/no-raw-controls.test.ts` | PASS 21/21 |
| `pnpm exec vitest run packages/ui/src/ui-css.test.ts` | PASS 6/6 (bound holds) |
| `pnpm exec vitest run apps/web/src` (full sweep) | PASS 1593/1593 (92 files) |
| `pnpm exec vitest run packages/ui/src tools/eslint-plugin-rhema` | PASS 194/194 |
| `pnpm check:dom-contract` | PASS — voices 114 hooks emitted+asserted |
| `pnpm check:spa-budget` | PASS — entry delta **+15.3 kB** vs `04a4e98b` (unchanged: this ticket adds **+0.0 kB** to the entry — voices is a leaf chunk; the +0.3 overage remains the parent's GD-KIT3A-BUDGET-ruled deficit) |
| `pnpm check:spa-env` | PASS |
| `pnpm check:protocol-markers` | PASS |
| `uiCss()` raw bytes | 23,976 / 24,576 — voices block fit inside the bound via the shared-chrome dedup |

## Operator judgement calls

1. **File inputs → `TextField type="file"`** (settings precedent) rather than a new Dropzone
   primitive: the only existing dropzone keeps a visually-hidden native input as its carrier, so a
   styled native `ui-field` input is the same no-JS grammar with fewer bytes and no new primitive.
2. **`ui-set-sec` `var(--s5)`→`var(--s6)`** — a latent 240 typo (no s5 on the scale; the rule was a
   no-op). Fixed + recorded; shared CSS corrected, not worked around.
3. **uiCss shared-chrome dedup** — repeated declarations hoisted into selector groups; computed
   cascade unchanged. Recorded in-file and here; no ceiling raised (the bound still holds at
   ≤24,576 raw).
4. **`data-state` on the tab anchors** — additive attr reusing `.ui-tabs-*` (Radix emits the same
   attr on its triggers); `aria-current`/`data-voice-tab` contract hooks unchanged.

## Deferrals

- **Opened D-R7KIT.3a2-1** (P) — Stage-B voices list/detail screenshots + computed-style probe at
  250_R7DEP.2's preview SHA; none closed.
