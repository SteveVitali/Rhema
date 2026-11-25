# Run ledger — R7UX.4 (row 327)

Harness: devin-cli/swe-2-high/subagent
Skills: unknown
Started: 2026-11-25T15:03Z
Closed: (pending)
Spec: docs/tickets/327_R7UX.4__dossier-visual-unify.md
Base: `stevenvitali/r7ux-3-files-panel-polish` @ `d4d4c928` (unmerged — OPERATOR)
Branch: `stevenvitali/r7ux-4-dossier-visual-unify`
Config: implement-spec full (ledger/self-review/gap/tests/evidence on; live = Stage A + owned
pr-<n> preview walk per the 324 ruling, $0, prod untouched)
Budget: ~400 changed lines incl. tests (S–M)

## Deferrals read

- Read `docs/tickets/DEFERRALS.md` at run start (2026-11-25). No `OPEN` row names this
  ticket, its branch, or the landing/sample-dossier surface as its unblocker. The wave's
  own deferral obligation is the ticket's Live-stage line (Stage A + preview walk — same
  ruling as 324–326): the deployed-tip re-walk is carried as D-R7UX.4-1 (appended at close).
- `D-R7UX.1-1`, `D-R7UX.2-1`, `D-R7UX.3-1` (OPEN) — the 324/325/326 deployed re-walks —
  untouched: they unblock only on the operator's stack merge + deploy carrying those SHAs.

## Requirements (spec Goal/anchors)

1. Unify the landing sample dossier with the in-app dossier visual system — the canonical
   side is the in-app cream-serif language (R5 review note, BL-95/R5 H4): the
   `sample-dossier` path + `dossier-view` share the committed type/color tokens.
2. FAQ gets a styled disclosure control consistent with the design system — the native
   `<details>` stays (RV-36 no-JS contract); only its marker is restyled.
3. Landing stays a public marketing surface — no private-app bundles; spa-env /
   protocol-markers stay green.
4. Out of scope: copy/content changes, new dossier sections, marketing nav (UX.11).

## Acceptance criteria (working checklist — layers on close)

- AC1 (engineered): landing dossier snapshot renders with the in-app token set — assert
  the shared class/token source, not a copied hex.
- AC2 (engineered): FAQ disclosure renders `<details>` with the styled marker class and
  still opens without JS (DOM test over the SSR output).
- AC3 (engineered): `pnpm turbo build lint typecheck` + web suite +
  `check:dom-contract`/`spa-budget`/`spa-env` + `check:protocol-markers` green.
- AC4 (live-executed→preview): preview walk — landing `/` + sample dossier screenshots
  side-by-side with the in-app dossier.

## Plan

1. `packages/ui/src/dossier.tsx` `DossierView`: mount the `.ui-dsv` article as the `.paper`
   sheet under a `data-paper="light"` scope — the SAME mechanism the in-app Page column
   uses (`[data-paper="light"] .paper` → `paperScopeVars("light")`, `.paper` serif typeset).
   No new CSS, no copied values; every public consumer (landing, invite, signup-sent,
   /showcase) unifies. Verified: the in-app dossier components (`ClaimsTable` h3.ui-d-cap)
   already render inside `.paper`, so the cascade is identical.
2. `apps/web/src/marketing.tsx` FAQ: `<summary className="ui-accordion-trigger">` gains
   the same `ChevronDown` (`ui-icon ui-accordion-chevron`) the `Accordion` primitive
   renders; the redundant inline flex style drops (the class supplies it).
3. `packages/tokens/src/theme-css.ts`: the no-JS `<details>` marker rules — suppress the
   native ::marker (`list-style:none` + `::-webkit-details-marker`) and rotate the
   chevron on `details[open]` — beside the existing `details[data-collapsed-group]`
   rules. Reason: `uiCss()` measures 24,567 B / 24,576 bound (9 B) and `uiTailCss()`
   5,093 B / 5,120 (27 B) — both at their REQ-KIT-5 bounds; themeCss has no bound and
   already owns native-element theming (the KIT-1 base layer + the collapsed-group
   details rules).
4. Tests per the matrix below; records per the close sequence.

## Test matrix

| AC | Test | File |
|---|---|---|
| AC1 | `DossierView` SSR markup carries `data-paper="light"` scope + `paper`/`ui-dsv` classes | `packages/ui/src/dossier.test.tsx` (or ui.test.tsx) |
| AC1 | Landing `/` SSR emits the pinned `.paper` dossier; themeCss emits `[data-paper="light"] .paper` + `paperVars` values (shared token source — the emitted scope equals LIGHT_VARS, never a copied hex) | `apps/web/src/marketing.test.ts` |
| AC2 | SSR: `details.ui-accordion-item[data-faq-item]` > `summary.ui-accordion-trigger` > `ui-accordion-chevron`; themeCss carries the marker-suppress + `[open]`-rotate rules | `apps/web/src/marketing.test.ts` |
| AC2 | DOM test: `<details>` opens natively without JS (`open` attr toggles; no ARIA/JS dependency) | `apps/web/src/landing-faq.dom.test.tsx` |
| AC3 | turbo build/lint/typecheck + web suite + the four checks | commands |
| AC4 | pr-<n> preview walk + screenshots | reports/ |

## Progress

- 2026-11-25T15:03Z — Phase 0/1 done: DEFERRALS read (nothing unblocked by this ticket);
  anchors verified — `DossierView` (`packages/ui/src/dossier.tsx`) is the shared sample
  renderer for landing + invite + signup-sent + /showcase; `.ui-dsv` reads `--paper-*`
  which is DARK under the default `:root` while the in-app sheet pins `light`
  (paper-boot default) and typesets serif — the mechanism to ride is `.paper` under a
  `data-paper="light"` ancestor. `uiCss()` 24,567/24,576 B + `uiTailCss()` 5,093/5,120 B
  both at bound → the three new `details` rules land in `themeCss()` (no bound; already
  owns the `details[data-collapsed-group]` native arm). `data-paper`, `data-dossier`,
  `data-faq`, `data-faq-item` are all already manifested — no dom-contract additions.
- 2026-11-25T15:0xZ — Phase 2 done: `DossierView` wraps `article.paper.ui-dsv` in
  `<div data-paper="light">` (the fix point is inside the component — all four public
  consumers unify at once). FAQ `<summary>` carries `ChevronDown
  ui-icon ui-accordion-chevron` (lucide 1.68.0 already a dep; SSR-only import — the
  entry-graph check confirms nothing reached the client entry). themeCss gains the
  marker-suppress + `[open]`-rotate rules. `data-paper`'s dom-contract emittedBy
  note extended to `ui/dossier.tsx`.
- 2026-11-25T15:0xZ — Phase 3 done: tests per the matrix — `ui.test.tsx` asserts the
  `.paper`/`data-paper` scope; `marketing.test.ts` asserts the served document carries
  the pin, the scope rules, and the disclosure CSS; `landing-faq.dom.test.tsx` (new)
  proves the no-JS contract in happy-dom (native `<details>` toggles `[open]`; no
  aria-expanded/role). Test friction found & fixed: chevron count regex also matched
  the inlined stylesheet's `.ui-accordion-chevron` selector text → scoped to `<svg`.
  The feared `tokens.test.ts` element-level pin does NOT fire — it targets IDE-class
  selectors specifically.
- 2026-11-25T15:0xZ — Phase 4 green: `turbo build lint typecheck --filter=@rhema/web...`
  39/39; web suite 103 files / 1716 tests; ui+tokens 21 files / 237 tests;
  `check:dom-contract`, `check:spa-budget`, `check:spa-env`, `check:protocol-markers`,
  `check:spa-entry-graph` all OK. Changed lines ≈ 78 + 60-line new test — well under
  the ~400 budget.

## Gap table

| Spec line | Where satisfied | Note |
|---|---|---|
| sample dossier shares the in-app dossier visual system (canonical = in-app cream serif) | `dossier.tsx` — `article.paper.ui-dsv` under `data-paper="light"` | the same `[data-paper]`/`paperScopeVars`/`paperVars` mechanism the in-app Page column rides (`ide-shell.tsx:270` `.paper` inside `<html data-paper="light">`); no copied values |
| FAQ styled disclosure, `<details>` kept (RV-36) | `marketing.tsx` chevron + `theme-css.ts` native-element rules | `list-style:none` + `::-webkit-details-marker` suppress; `[open]` rotates the primitive's own chevron |
| Tests: shared class/token source, not a copied hex | `ui.test.tsx`, `marketing.test.ts` | asserts emitted scope rules + tokens, never a literal hex |
| DOM test: opens without JS | `landing-faq.dom.test.tsx` | happy-dom over the real SSR component output |
| build/lint/typecheck + web suite + 4 checks | Phase 4 log | all green; spa-entry-graph run too |
| Preview walk + side-by-side screenshots | Phase 5 (pending) | AC4 |
| Out of scope: copy, new sections, marketing nav | none touched | |

## Evidence log

(pending Phase 5)

## Evidence report

(pending Phase 6)
