# R7KIT.1 — control base layer, missing tokens, programmatic-focus rings (run ledger)

- **Spec:** `docs/tickets/210_R7KIT.1__control-base-layer.md` (manifest row 210, phase round 7 / R7a).
  Round-7 posture: `GD-PREVIEW.R7` (no per-ticket previews), **$0 spend**, repo-only; Stage A only.
  mergePolicy=OPERATOR — never merge. LAUNCHED — prod serves `4938b8e`; zero prod mutations.
- **Normative loads:** the ticket's Load list — `docs/round-7-draft-spec.md` §4.0/§4.6/§4.13/§8;
  `R6-ux-code-audit.md` §0/§4/§8/§9 (UXC-14/31/32); `R5-ux-browser-audit.md` (A4, D7 et al.);
  `REVIEW-round-7-draft-spec.md` RV-36; the named anchors.
- **Base:** `stevevitali/r7open-1-open-round` @ `f60d464` (the ticket's `base_branch: current checkout` —
  out-of-order R7 stack continues on R7OPEN.1's tip; PR #240 unmerged per OPERATOR).
- **Branch:** `stevevitali/r7kit-1-control-base` · **Harness:** devin-desktop/swe-2-high/subagent
  · **Skills:** implement-spec + build-memory + self-review @ `~/agent-skills` (`e981ec5`)
- **Started:** 2026-11-03T18:47Z · **Closed:** 2026-11-03T19:1xZ
- **Production mutations:** none (repo-only; the external act is the read-only `gh`/`ci-boundary` CI read).

## Deferrals read

`docs/tickets/DEFERRALS.md` read first (protocol). The ticket defers no prior OPEN row's owner:
**D-R7OPEN.1-1** stays OPEN (closed by 224/250, not this ticket); the only new row is
**D-R7KIT.1-1** (the Stage-B AC the ticket instructs to open).

## What shipped (deliverables 1–4)

1. **`color-scheme` + the control base layer** (`packages/tokens/src/theme-css.ts`,
   `packages/tokens/src/tokens.ts`). `:root` emits `color-scheme: dark`;
   `[data-theme="light"]` emits `light`; `auto` resolves to dark|light by the boot script before
   paint, so the resolved `data-theme` carries it (Auto covered by the same mechanism). The sheet's
   UA widgets follow the PAPER theme (`.paper` + the `[data-paper]` pinned pairings). Token-based
   rules for `button`, `input`, `select`, `textarea`, checkbox/radio (`accent-color` + 14-px box)
   and `input[type=file]`/`::file-selector-button`, with hover/active/disabled/focus-visible/invalid
   states. Every selector is element-level with `:where()` refinements — the IDE-region rules and
   inline styles always win (the ticket's specificity contract; computed-style legs prove it).
   Emitted through `themeCss()` → SPA shell (`spa-shell.ts`) and SSR documents (`render.tsx`).
2. **Missing tokens.** `--fs-{caption,micro,dense,body,lead}` (11/12/13/14/16 — the §5.9 shell
   sizes plus the two off-scale bands R6 §8 counted), `--radius-pill: 999`, `--paper-diff-add/del`
   per paper theme (opaque hues: paper text ≥10:1 on the tint, tint ≥1.1:1 vs `--paper-bg`) carried
   on the `[data-paper]` pin via `PAPER_KEYS`, and `--state-ok` (the affirmative green, re-emitted
   by `paperScopeVars`). Consumers repointed: `compare.tsx`, `what-changed.tsx` drop the light-tuned
   rgba fallbacks; `outline.tsx` + `figures.tsx` (3 sites) `--sev-ok` → `var(--state-ok)`.
3. **REQ-COPY-7 focus.** `HeadManager` stamps `outline-style: none` inline on the programmatic
   focus target (h1 or hash target, `tabindex=-1` already) and restores the prior value on blur —
   the stamp IS the programmatic-vs-keyboard distinction: keyboard focus never passes through the
   route-focus arm, so the 2-px `:focus-visible` ring (REQ-IDE-42/REQ-UX-7) is untouched.
4. **Tests.** `tokens.test.ts`: emitted `color-scheme` per theme + `.paper`/pinned pairings, every
   control class + state rule, `--fs-*`/`--radius-pill` emission, diff/state tokens both themes +
   pin/scope, element-specificity guard. `contrast.test.ts`: ≥10:1 paper text on each tint + ≥1.1:1
   tint-perceptibility (both themes + pinned pairings), `--state-ok` ≥4.5:1 on shell + scoped-paper
   grounds. `control-base.dom.test.tsx` (new, happy-dom): computed `color-scheme`/background/border/
   fg/`accent-color` for all 7 control classes in dark + light, `.paper` remap + pinned-light leg,
   IDE-region precedence (rail/statusbar/palette), inline-style precedence. `spa.dom.test.tsx`:
   three REQ-COPY-7 legs — suppressed on programmatic h1 focus, lifted on blur, unstamped on direct
   (keyboard-class) focus, re-stamps per nav on hash targets.

## Verification

- `pnpm exec vitest run packages/tokens/src` → 44 pass (tokens 27 + contrast 17).
- `pnpm exec vitest run apps/web/src/spa/spa.dom.test.tsx apps/web/src/spa/control-base.dom.test.tsx`
  → 44 pass (38 + 6).
- `pnpm turbo build lint typecheck --filter=@rhema/web --filter=@rhema/ui --filter=@rhema/tokens`
  → 18/18 tasks.
- `pnpm test` (full suite) → **6,202 pass / 4 skip / 1 fail**: the one fail is
  `apps/run-task/src/privsep.docker.test.ts` — the Docker daemon died mid-build (`error reading
  from server: EOF` at the `pnpm deploy` step); with the daemon down the leg self-skips
  (`docker info` → down; re-run → 2 skipped). Environmental, unrelated to this change — reported
  as a skipped/unrun leg, not a pass.
- `pnpm check:dom-contract` OK · `check:spa-env` OK · `check:spa-budget` OK (no ceiling touched) ·
  `check:protocol-markers` OK · `check:no-cookies` OK.
- `pnpm format` — pre-existing repo-wide red at base (base files already non-clean incl. the
  touched `theme-css.ts`/`tokens.test.ts`/`head.tsx`/`figures.tsx`/`outline.tsx`/`compare.tsx`);
  the only previously-clean touched file (`index.ts`) stays clean and the new test file is
  prettier-formatted. No formatter run across files (AGENTS.md).
- **Deltas (cross-cutting invariant 20):** `themeCss()` 7,503 → 10,049 bytes (**+2,546 B raw**,
  inlined per document; gzip share smaller). JS entry delta ~0 (head.tsx +11 lines, no imports).

## Self-review + gap analysis

- happy-dom normalizes `outline` to `none none` — the mechanism uses `outline-style` (precise,
  cleanly restorable); legs assert that property.
- happy-dom binds selector matches at insertion — the pinned-paper leg mounts the sheet AFTER
  stamping `data-paper` (exactly what a served pinned document does); noted in the test.
- happy-dom does not emulate `:focus-visible`/`:invalid` — those states are pinned at the
  stylesheet level (`tokens.test.ts`), the DOM tier covers resolvable properties; the interactive
  ring/box proof is D-R7KIT.1-1's screenshot leg.
- Incident: an accidental `git stash` mid-run reverted sources while `dist` kept/stale-rebuilt —
  caught by the DOM tests reading `@rhema/tokens` dist (empty computed styles); restored and
  rebuilt. No content lost.

## Evidence report

| AC | Layer reached | Evidence |
|---|---|---|
| `color-scheme` dark/light/Auto + a rule per control class and state; generator test fails if removed | engineered | `tokens.test.ts` (7 assertions) + `control-base.dom.test.tsx` computed `color-scheme` |
| `--paper-diff-add/del`, `--state-ok`, `--fs-*`, `--radius-*` defined both themes + contrast floors; tints resolve to tokens | engineered | `contrast.test.ts` (4 assertions); `compare.tsx`/`what-changed.tsx`/`outline.tsx`/`figures.tsx` repointed |
| Route-change focus lands on the heading with no visible ring; keyboard focus keeps the ring — DOM test | fixture-verified | `spa.dom.test.tsx` REQ-COPY-7 legs ×3 (stamp → blur-restore → unstamped direct focus → re-stamp) |
| IDE-region rules + inline-styled controls render unchanged; checks green; byte delta reported | engineered | `control-base.dom.test.tsx` IDE + inline legs; `check:dom-contract`/`spa-env`/`spa-budget` green; +2,546 B reported |
| Stage-A proxy: computed-style DOM test for every control class the six surfaces use, dark + light | fixture-verified | `control-base.dom.test.tsx` (7 classes, both themes, `.paper` + pinned legs) |
| Stage B (deferred, `GD-PREVIEW.R7`) | met-engineered(D-R7KIT.1-1) | row names the six surfaces, the light spot check, and the probe fields 224 captures |
| Universal phase-gate | — | this ledger; PR body `pr/R7KIT.1.md`; `ci:` read recorded below |

**ci:** pending at first record (read owed at PR head via `ci-boundary.sh` — recorded in the
closeout + `logs/ci-R7KIT.1.json`).

**Deferrals:** opened `D-R7KIT.1-1`; none closed. **Deviations:** none (design choices documented
above — `outline-style` inline stamp; `--state-ok` = the `--state-ready` hue, one green per semantic).
**Carries:** `10.5/11.5/12.5/15-px` and `6/7/10-px` literal resolutions ride the R7KIT.3x migrations
(tokens emitted now); the `U4.controls` computed-style leg stays 243a R7KIT.3e's.
