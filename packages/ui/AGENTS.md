# AGENTS.md — @rhema/ui

## Purpose

- The shared interface kit: the `primitives/**` component layer (Radix/Lucide/cmdk), the
  generated stylesheets (`uiCss()`/`uiTailCss()`), and the composed surfaces every app surface
  composes (shell, IDE frame, run card/sheet, dossier, chat panel, timeline, project list).
- Root `AGENTS.md` applies. Surface-level integration (routes, mounts, DOM hooks) belongs to
  `apps/web/AGENTS.md`; component copy passes through `apps/web`'s COPY leaves, not literals here.

## Key Files

| File                                  | Purpose                                                                   |
| ------------------------------------- | ------------------------------------------------------------------------- |
| `src/primitives/`                     | The named control layer — Button, fields, menus, Dialog, Tabs, Combobox.  |
| `src/ui-css.ts` / `src/ui-tail-css.ts` | Generated stylesheet blocks inlined into shell documents (bounded size).  |
| `src/ide-shell.tsx`                   | The IDE frame — rail/page/panel chrome and breakpoint wiring.             |

## Build & Test

```bash
pnpm turbo build --filter=@rhema/ui...
pnpm --filter @rhema/ui typecheck
pnpm --filter @rhema/ui lint
pnpm exec vitest run packages/ui
```

## Critical rules

1. **GUARD-1 is owned here.** `primitives/**` is the one place raw controls are legal;
   `rhema/no-raw-controls` errors on any raw form control outside it (`packages/ui/src/**` minus
   `primitives/**`, and `apps/web/src/**/*.tsx`). Add a control to `primitives/` and consume it;
   never hand-roll a native `<select>`/`<input>`/`<button>` in a surface file. The committed
   no-JS/SSR exemption list (`tools/eslint-plugin-rhema/rules/no-raw-controls-exemptions.js`)
   names each allowed exception with its reason.
2. **`uiCss()`/`uiTailCss()` are generated, bounded artifacts.** They are string builders, not
   runtime CSS frameworks — do not add a styling dependency. Their inlined size is asserted;
   the REQ-KIT-5 bound is a standing signed allowance (GATE-ACCEPT.R7), not headroom to spend.
3. **Deps stay exact-pinned** (ADR-129, REQ-DOPS-8): per-package `@radix-ui/react-*`,
   `lucide-react`, `cmdk` — `check:licenses` verifies. No meta-package imports.
4. **No identity or private copy.** Components render props/`COPY` leaves; corpus text and
   third-party product names never enter this package's literals.

## Do / Don't

- **Do:** keep a new control self-contained in `primitives/` with its dom test, then migrate
  surfaces onto it.
- **Don't:** add a stylesheet file consumers must import separately, or inline raw controls in
  composed surfaces to dodge the rule.
