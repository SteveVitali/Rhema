// The single stylesheet the SSR shell injects: the §5.9 token set as CSS custom properties on `:root`
// (dark, the default) with the light overrides under `[data-theme="light"]`. Emitting it from the typed
// token maps keeps the CSS and the TS constants in lockstep — there is one source of §5.9 values.

import { DARK_VARS, LIGHT_VARS, RADIUS, SPACING } from "./tokens.js";
import type { VarMap } from "./tokens.js";

function declarations(vars: VarMap | Readonly<Record<string, number>>, unit = ""): string {
  return Object.entries(vars)
    .map(([name, value]) => `  ${name}: ${value}${typeof value === "number" ? unit : ""};`)
    .join("\n");
}

/**
 * The full theme stylesheet. `:root` carries the dark palette + the spacing/radius scales; the light theme
 * is opt-in via `[data-theme="light"]`. A tiny base resets the shell body to the shell background/foreground
 * so the SSR document reads as the studio ground before any component styles load.
 */
export function themeCss(): string {
  return [
    ":root {",
    declarations(DARK_VARS),
    declarations(SPACING, "px"),
    declarations(RADIUS, "px"),
    "}",
    '[data-theme="light"] {',
    declarations(LIGHT_VARS),
    "}",
    "* { box-sizing: border-box; }",
    "html, body { margin: 0; padding: 0; }",
    "body {",
    "  background: var(--shell-bg);",
    "  color: var(--shell-fg);",
    '  font-family: "Inter", system-ui, sans-serif;',
    "  font-size: 14px;",
    "  line-height: 1.5;",
    "  -webkit-font-smoothing: antialiased;",
    "}",
    "a { color: var(--accent); }",
  ].join("\n");
}
