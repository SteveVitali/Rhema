// The figure render theme (§7.5; REQ-VIZ-7/8): ONE token-derived neutral palette, applied twice —
// the light theme's paper palette for `render.svg` and the dark theme's for `render.dark.svg`.
// Every color comes from @rhema/tokens (never a hard-coded hue that can drift from the design
// system); the label/axis colors are chosen to satisfy ≥4.5:1 against the figure ground (the
// contrast test computes it — a token re-tune that breaks the floor fails the build).

import { LIGHT_VARS, DARK_VARS, TYPOGRAPHY, contrastRatio, type VarMap } from "@rhema/tokens";

export type ThemeMode = "light" | "dark";

/** The concrete colors a figure render consumes (vega config + mermaid DiagramColors + the card). */
export interface FigureTheme {
  readonly mode: ThemeMode;
  /** the figure ground — the paper sheet's own tone in this mode. */
  readonly bg: string;
  /** primary ink: title, axis labels, mark text — ≥4.5:1 on `bg`. */
  readonly fg: string;
  /** secondary ink: ticks, subtitles, grid labels — ≥4.5:1 on `bg` (falls back to fg otherwise). */
  readonly muted: string;
  /** hairlines: grid, axis rules, borders. */
  readonly rule: string;
  /** the single accent hue + the categorical series the design system already owns. */
  readonly accent: string;
  /** categorical mark series, token-derived (the §5.7 finding-kind hues are the data hues). */
  readonly series: readonly string[];
  /** a subtle fill for bands/areas — a lift on the ground, not a new hue. */
  readonly surface: string;
  /** the sans stack the paper/UI uses; never a webfont import inside the SVG. */
  readonly font: string;
}

/**
 * Resolve a mode's theme from the token palette. `muted` is promoted to `fg` when a token re-tune
 * would drop it under the 4.5:1 label floor — the assertion test keeps the honest failure visible.
 */
export function figureTheme(mode: ThemeMode): FigureTheme {
  const vars: VarMap = mode === "light" ? LIGHT_VARS : DARK_VARS;
  const bg = vars["--paper-bg"]!;
  const fg = vars["--paper-fg"]!;
  const mutedCandidate = vars["--paper-fg-muted"]!;
  const muted = contrastRatio(mutedCandidate, bg) >= 4.5 ? mutedCandidate : fg;
  return {
    mode,
    bg,
    fg,
    muted,
    rule: vars["--paper-rule"]!,
    accent: vars["--accent"]!,
    series: [
      vars["--accent"]!,
      vars["--kind-craft"]!,
      vars["--kind-claim"]!,
      vars["--kind-structure"]!,
      vars["--kind-discourse"]!,
      vars["--kind-voice"]!,
    ],
    surface: vars["--shell-raised"]!,
    font: TYPOGRAPHY.shellStack,
  };
}

/** The WCAG floor every label color in a figure render must clear (§7.5). */
export const LABEL_CONTRAST_MIN = 4.5 as const;
