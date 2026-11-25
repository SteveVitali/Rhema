# Run ledger — R7UX.4 (row 327)

Harness: devin-cli/swe-2-high/subagent
Skills: unknown
Started: 2026-11-25T15:03Z
Closed: 2026-11-25T17:31Z
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
| Preview walk + side-by-side screenshots | `reports/2026-11-25_r7ux-4-dossier-walk/` | AC4 — PASS: identical computed values on both surfaces |
| Out of scope: copy, new sections, marketing nav | none touched | |

- 2026-11-25T15:5xZ — Phase 5 done: **PR #421** (base `r7ux-3`, head `6634f8cf`) →
  owned preview `pr-421` lifecycle: `init` → config (gitSha `6634f8cf`,
  protocolsVersion `0.4.0+07b1ad37ddaaa6f4`, oauth id, apparmor) → `resend-pull` →
  `up` in converging passes: `ciPreviewSweepBucketsList` role `pulumi import`ed
  (F-R7UX.1-1 class; `state delete`d + member at teardown); collab-sa hit the
  per-minute SA quota 429 → retried; `pause:3.9` still gone → all-8 Cloud Run
  creates failed (F-R7UX.1-1 stands) → Cloud Build `52e5eae6` all-10 images @
  `6634f8cf` (12m10s, `_ALLOW_PLACEHOLDER_SDK=1`) → digests pinned → api rev
  `00001` terminal pre-migrate (R7DEP.2 class) → migrate job `…-rsc56` applied →
  rev `…-mig2` forced + serving → `appBaseUrl`/`apiPublicUrl` pinned → `up`
  converged (215 resources). Provenance: api `/healthz/` → `gitSha 6634f8cf…` (the
  PR head) via `gcloud run services proxy`.
- **Headless walk PASS** — both surfaces public, $0, no fixture/invite needed:
  landing `/` `data-section="dossier"` article = `.paper ui-dsv` under
  `data-paper="light"` — computed `Literata, Lora, Georgia, serif` /
  `rgb(255,253,248)` / `rgb(29,28,26)`; the in-app dossier
  (`/demo/constitution-of-reason/review/v2-review`, `.paper > [data-letter-view]`,
  html `data-paper="light"`) computes the SAME three values — the committed token
  set end-to-end, not a copy. FAQ: native `DETAILS`, `aria-expanded: null`,
  `listStyleType: none`, chevron transform `none` → rotation matrix on real click,
  toggles both ways. Evidence `reports/2026-11-25_r7ux-4-dossier-walk/`
  (8 PNGs + `walk-facts.json`).
- 2026-11-25T16:1xZ — teardown: `ci-preview-sweep-buckets-list` member + role
  `state delete`d → `destroy` 137 deleted → the Google-owned
  `serverless-ipv4-cloudrun-1795621301247508866` reservation pinned the
  private-app subnet (F-OPS.1-12 GC-lag class).
- 2026-11-25T17:3xZ — reservations released ~17:28Z (~1h23m lag, inside the
  R7UX.2/3 1h24m–1h55m window) → `destroy` retry deleted the remaining 77
  (subnet + network + all SAs/secrets/buckets → 0) → **orphan sweep CLEAN**
  (zero live `pr-<n>` resources) → `rm` deregistered the stack.

## Evidence log

- `pnpm exec vitest run packages/ui packages/tokens` — 237 tests / 21 files
  (incl. the new DossierView paper-scope test; `tokens.test.ts`'s element-level
  pin does NOT fire on the `details.ui-accordion-*` rules).
- Web suite — 1,716 tests / 103 files; `landing-faq.dom.test.tsx` 2/2;
  `marketing.test.ts` 21/21.
- `pnpm turbo build lint typecheck --filter=@rhema/web...` — 39/39.
- `check:dom-contract` OK · `check:spa-env` OK · `check:spa-entry-graph` OK ·
  `check:protocol-markers` OK · `check:spa-budget` OK.
- Changed lines: 261+ / 10− (8 files) — inside the ~400 budget.
- **Preview `pr-421`** lifecycle + provenance + walk + teardown as logged above;
  api `/healthz/` `gitSha 6634f8cf42632b822fe7a611376fe1264f112cf8` = PR head.
- **ci:** `pass #421@6634f8cf` (run 45641711719 — all seven legs + `ci-pass`
  anchor); records head `0d0152a4` re-read `pass` (run 45666236318 — fast-path
  same-tree anchor on `6634f8cf`, all seven legs success).

## Evidence report

- **Preview `pr-421` @ `6634f8cf`** — the recorded walk is the AC4 surface pair:
  - landing `/` sample dossier: `.paper ui-dsv` inside `<div data-paper="light">`,
    computed bg `rgb(255,253,248)` (`--paper-bg` = `#fffdf8`), fg `rgb(29,28,26)`,
    body/letter type `Literata, Lora, Georgia, serif` (`--font-paper`).
  - in-app dossier (demo review `v2-review`): `.paper` sheet under
    `<html data-paper="light">`, `article.ui-letter-grid` — the identical three
    computed values.
  - verdict rows `sameMechanism`/`sameSerif`/`sameBg`/`sameFg`/`faqNoJs`/
    `chevronRestyled` all `true` (`walk-facts.json`); `landing-dossier.png` +
    `landing-dossier-top.png` vs `inapp-dossier-top.png` are the side-by-side.
- **FAQ (RV-36):** 3 `<details data-faq-item>`; `<summary>` carries
  `svg.ui-accordion-chevron`, native `::marker` suppressed (`listStyleType: none`),
  `aria-expanded` absent (no JS in the mechanism), `[open]` toggles on real clicks
  and rotates the chevron (computed transform `none` → rotation matrix).
- **Teardown clean:** `destroy` cleared 137 then the `private-app` subnet sat
  pinned by the Google-owned `serverless-ipv4-cloudrun-*` reservation
  (F-OPS.1-12 GC lag — ~1h23m, inside the R7UX.2 ~1h24m / R7UX.3 ~1h55m
  window); the retry deleted the remaining 77 → orphan sweep CLEAN → `rm`.
