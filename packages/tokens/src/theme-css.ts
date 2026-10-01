// The single stylesheet the SSR shell injects: the §5.9 token set as CSS custom properties on `:root`
// (dark, the default), the full light theme under `[data-theme="light"]`, and the paper-pinning overrides
// under `[data-paper]` (REQ-IDE-38 amended — R17: pinned-light paper inside the dark shell reads as a
// sheet). Emitting it from the typed token maps keeps the CSS and the TS constants in lockstep — there is
// one source of §5.9 values. Also carries: self-hosted font faces (the preset IS the mechanism — the
// family stacks in TYPOGRAPHY resolve to these files), paper typography, motion durations, the
// prefers-reduced-motion collapse, the print/export rules, and the 2-px accent focus rings (REQ-IDE-42).

import {
  DARK_VARS,
  LIGHT_VARS,
  MOTION,
  RADIUS,
  SPACING,
  TYPOGRAPHY,
  paperVars,
  paperScopeVars,
} from "./tokens.js";
import type { VarMap } from "./tokens.js";

function declarations(vars: VarMap | Readonly<Record<string, number>>, unit = ""): string {
  return Object.entries(vars)
    .map(([name, value]) => `  ${name}: ${value}${typeof value === "number" ? unit : ""};`)
    .join("\n");
}

/**
 * Self-hosted variable fonts (OFL-1.1, Fontsource; copied to apps/web/public/fonts by build-client.mjs and
 * served at /assets/fonts/). `font-display: swap` + the stacks' Georgia/system-ui fallbacks mean a missing
 * file degrades to the fallback face — the preset choice stays the mechanism either way.
 */
export const FONT_FACES: readonly { family: string; file: string; weight: string; style: string }[] = [
  { family: "Literata", file: "literata-latin-standard-normal.woff2", weight: "200 900", style: "normal" },
  { family: "Literata", file: "literata-latin-standard-italic.woff2", weight: "200 900", style: "italic" },
  { family: "Inter", file: "inter-latin-wght-normal.woff2", weight: "100 900", style: "normal" },
  { family: "JetBrains Mono", file: "jetbrains-mono-latin-wght-normal.woff2", weight: "100 800", style: "normal" },
];

function fontFaceCss(): string {
  return FONT_FACES.map(
    (f) =>
      `@font-face { font-family: '${f.family}'; font-style: ${f.style}; font-display: swap; ` +
      `font-weight: ${f.weight}; src: url('/assets/fonts/${f.file}') format('woff2-variations'); }`,
  ).join("\n");
}

/**
 * The full theme stylesheet. `:root` carries the dark palette + the spacing/radius/typography/motion
 * scales; the light theme is opt-in via `[data-theme="light"]`; `[data-paper]` pins the paper tokens
 * inside EITHER shell theme (`follow`, the absent value, lets the paper inherit the shell theme's paper
 * set). `data-font="sans"` on the paper root selects the sans preset — the only other choice.
 */
export function themeCss(): string {
  return [
    fontFaceCss(),
    ":root {",
    declarations(DARK_VARS),
    declarations(SPACING, "px"),
    declarations(RADIUS, "px"),
    // typography vars — the paper font preset + the reader stepper's live size
    `  --font-paper: ${TYPOGRAPHY.paperSerifStack};`,
    `  --font-shell: ${TYPOGRAPHY.shellStack};`,
    `  --font-mono: ${TYPOGRAPHY.monoStack};`,
    `  --paper-size: ${TYPOGRAPHY.paperBodyPx}px;`,
    // §5.9 motion tokens (REQ-IDE-40)
    `  --dur-stream: ${MOTION.streamBlockMs}ms;`,
    `  --dur-phase: ${MOTION.phaseProgressMs}ms;`,
    `  --dur-finding: ${MOTION.findingArrivalMs}ms;`,
    `  --dur-pane: ${MOTION.paneMs}ms;`,
    `  --dur-caret: ${MOTION.caretPulseMs}ms;`,
    "}",
    '[data-theme="light"] {',
    declarations(LIGHT_VARS),
    "}",
    // Paper pinning (REQ-IDE-38 amended): a pinned paper rewrites the paper-* tokens inside EITHER shell
    // theme. Declared AFTER the theme blocks so pinning wins over the theme's own paper set; `follow`
    // (the default, attribute absent) leaves the theme's paper values in place.
    '[data-paper="light"] {',
    declarations(paperVars("light")),
    "}",
    '[data-paper="dark"] {',
    declarations(paperVars("dark")),
    "}",
    // The paper sheet is its own theme island: inside `.paper` the --shell-* names remap to the paper's
    // palette so existing components render correctly on the sheet whatever the pin. Order matters —
    // `[data-paper]` pinning is emitted LAST so it wins over the theme's own paper mode.
    ".paper {",
    declarations(paperScopeVars("dark")),
    "}",
    '[data-theme="light"] .paper {',
    declarations(paperScopeVars("light")),
    "}",
    '[data-paper="light"] .paper {',
    declarations(paperScopeVars("light")),
    "}",
    '[data-paper="dark"] .paper {',
    declarations(paperScopeVars("dark")),
    "}",
    // The sans paper preset — the only other choice (REQ-IDE-39). Set on the paper root or the document.
    '[data-font="sans"] {',
    `  --font-paper: ${TYPOGRAPHY.paperSansStack};`,
    `  --paper-size: ${TYPOGRAPHY.paperSansBodyPx}px;`,
    "}",
    "* { box-sizing: border-box; }",
    "html, body { margin: 0; padding: 0; }",
    "body {",
    "  background: var(--shell-bg);",
    "  color: var(--shell-fg);",
    "  font-family: var(--font-shell);",
    `  font-size: ${TYPOGRAPHY.shellBodyPx}px;`,
    "  line-height: 1.5;",
    "  -webkit-font-smoothing: antialiased;",
    "}",
    "a { color: var(--accent); }",
    // WCAG 2.2 AA chrome: a 2-px accent focus ring on every keyboard-focused control (REQ-IDE-42).
    ":focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }",
    ".tnum { font-variant-numeric: tabular-nums; }",
    // The paper sheet — the reading surface. Font/size resolve from the preset vars so the preset choice
    // (serif|sans) is the ONLY knob; the pinned-light paper sits inset as a sheet (border + shadow below,
    // in ide-css where the Page region lives).
    ".paper {",
    "  background: var(--paper-bg);",
    "  color: var(--paper-fg);",
    "  font-family: var(--font-paper);",
    "  font-size: var(--paper-size);",
    `  line-height: ${TYPOGRAPHY.paperBodyLineHeight};`,
    "}",
    ".paper h1, .paper h2, .paper h3, .paper h4 { font-weight: 600; line-height: 1.25; }",
    `.paper h1 { font-size: ${TYPOGRAPHY.headingEm[0]}em; }`,
    `.paper h2 { font-size: ${TYPOGRAPHY.headingEm[1]}em; }`,
    `.paper h3 { font-size: ${TYPOGRAPHY.headingEm[2]}em; }`,
    `.paper h4 { font-size: ${TYPOGRAPHY.headingEm[3]}em; }`,
    `.paper p { margin: 0 0 ${TYPOGRAPHY.paragraphSpacingEm}em; text-indent: 0; }`,
    `.paper code, .paper .cite-key, .diff-hunk { font-family: var(--font-mono); font-size: ${TYPOGRAPHY.monoPx}px; }`,
    ".paper a { color: var(--accent); }",
    ".paper .muted, .muted-paper { color: var(--paper-fg-muted); }",
    // REQ-IDE-40 — `prefers-reduced-motion` collapses every catalogued motion to instant. The 1ms floor
    // keeps transitionend listeners firing; visually it is instant.
    "@media (prefers-reduced-motion: reduce) {",
    "  *, *::before, *::after { animation-duration: 1ms !important; animation-iteration-count: 1 !important; transition-duration: 1ms !important; scroll-behavior: auto !important; }",
    "}",
    // Print/export (REQ-IDE-39): 11 pt / 1.4 over a 6.5-in measure; the shell chrome drops out.
    "@media print {",
    `  .paper { font-size: ${TYPOGRAPHY.printPt}pt; line-height: ${TYPOGRAPHY.printLineHeight}; max-width: ${TYPOGRAPHY.printMeasureIn}in; color: #1d1c1a; background: #fffdf8; }`,
    "  .ide-rail, .ide-files, .ide-timeline, .ide-desk, .ide-statusbar, .ide-margin { display: none !important; }",
    "}",
  ].join("\n");
}
