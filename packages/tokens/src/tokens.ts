// §5.9 design tokens, checked in as data (REQ-IDE-38/39; R17). Two textures, ONE token set: a neutral
// cool-dark shell around a warm paper sheet. The dark palette's values are verbatim from spec §5.9 (v1.0);
// the light theme is a REAL theme — every token defined, hues re-tuned so the contrast invariants hold
// (see contrast.test.ts). No pure black or white anywhere, in either theme (P1.01).

/** A CSS custom-property map: `--var-name` → value. */
export type VarMap = Readonly<Record<string, string>>;

/**
 * Dark palette — the `:root` custom properties (§5.9). Shell neutral cool-dark, paper warm, plus the
 * severity / finding-kind / project-state accent scales the beta surfaces read from.
 */
export const DARK_VARS: VarMap = {
  // shell
  "--shell-bg": "#0f1114",
  "--shell-surface": "#161a1f",
  "--shell-raised": "#1d2229",
  "--shell-border": "#2a3039",
  "--shell-fg": "#e6e8eb",
  "--shell-fg-muted": "#9aa3ad",
  "--shell-fg-faint": "#5f6873",
  "--accent": "#8ab4f8",
  // paper (warm sheet)
  "--paper-bg": "#17161a",
  "--paper-fg": "#e8e4dc",
  "--paper-fg-muted": "#b8b2a7",
  "--paper-rule": "#2b2a2e",
  // severity
  "--sev-blocking": "#ff7b72",
  "--sev-major": "#f0b24a",
  "--sev-minor": "#6cc4a1",
  "--sev-note": "#8d97a5",
  // finding kind
  "--kind-claim": "#f0b24a",
  "--kind-discourse": "#b48ef2",
  "--kind-argument": "#8ab4f8",
  "--kind-craft": "#5fd1c8",
  "--kind-voice": "#f28ea8",
  // project / run state
  "--state-running": "#8ab4f8",
  "--state-needs-you": "#f0b24a",
  "--state-ready": "#6cc4a1",
  "--state-failed": "#ff7b72",
};

/**
 * Light palette — the FULL §5.9 set re-tuned for a light ground (P1.01; the spec's `[data-theme="light"]`
 * block lists the anchor values and rules "hues re-tuned ≥4.5:1"). Every key of DARK_VARS is defined here;
 * `--shell-surface` leaves spec-verbatim `#fff` because "no pure black or white anywhere" governs both
 * themes. The hue scales darken so chips/marks keep ≥4.5:1 on light surfaces (contrast.test.ts computes it).
 */
export const LIGHT_VARS: VarMap = {
  // shell — spec anchors #f6f7f9 / #e3e6ea / #1a1d21 / #5c6670; surface re-tuned off pure white.
  "--shell-bg": "#f6f7f9",
  "--shell-surface": "#fdfdfe",
  "--shell-raised": "#f0f2f6",
  "--shell-border": "#e3e6ea",
  "--shell-fg": "#1a1d21",
  "--shell-fg-muted": "#5c6670",
  "--shell-fg-faint": "#7a828f",
  "--accent": "#2b63c9", // spec #2f6fdb lands 4.43:1 on shell-bg — deepened a step so links clear 4.5
  // paper — the warm sheet, light (spec anchors #fffdf8 / #1d1c1a / #e8e4dc).
  "--paper-bg": "#fffdf8",
  "--paper-fg": "#1d1c1a",
  "--paper-fg-muted": "#6d6558",
  "--paper-rule": "#e8e4dc",
  // severity — re-tuned dark enough for ≥4.5:1 on the light grounds
  "--sev-blocking": "#bd352c",
  "--sev-major": "#8a5d0b",
  "--sev-minor": "#1e7a55",
  "--sev-note": "#5f6873",
  // finding kind
  "--kind-claim": "#8a5d0b",
  "--kind-discourse": "#7a45c9",
  "--kind-argument": "#2b63c9",
  "--kind-craft": "#0c6e64",
  "--kind-voice": "#ad3f78",
  // project / run state
  "--state-running": "#2b63c9",
  "--state-needs-you": "#8a5d0b",
  "--state-ready": "#1e7a55",
  "--state-failed": "#bd352c",
};

/** The `paper-*` token names — the subset `[data-paper]` pinning rewrites (§5.9 theme policy). */
export const PAPER_KEYS = ["--paper-bg", "--paper-fg", "--paper-fg-muted", "--paper-rule"] as const;

/** The paper palette for a pinned mode: `light` = the light theme's paper, `dark` = the dark theme's. */
export function paperVars(mode: "light" | "dark"): VarMap {
  const src = mode === "light" ? LIGHT_VARS : DARK_VARS;
  return Object.fromEntries(PAPER_KEYS.map((k) => [k, src[k]!]));
}

/**
 * The paper sheet is its own theme island: `.paper` remaps the SHELL var names to the paper's palette so
 * every component inside (which reads `--shell-*`) renders correctly on the sheet — pinned-light paper
 * inside the dark shell and vice versa (REQ-IDE-38 amended). This is what makes the whole-sheet metaphor
 * work with zero per-component theming.
 */
export function paperScopeVars(mode: "light" | "dark"): VarMap {
  const src = mode === "light" ? LIGHT_VARS : DARK_VARS;
  const paper = mode === "light"
    ? {
        "--shell-raised": "#f5f2ea", // a warm lift on the cream sheet
        "--shell-fg-faint": "#8a8274",
      }
    : {
        "--shell-raised": "#221f24",
        "--shell-fg-faint": "#7d7870",
      };
  return {
    "--shell-bg": src["--paper-bg"]!,
    "--shell-surface": src["--paper-bg"]!,
    "--shell-raised": paper["--shell-raised"],
    "--shell-border": src["--paper-rule"]!,
    "--shell-fg": src["--paper-fg"]!,
    "--shell-fg-muted": src["--paper-fg-muted"]!,
    "--shell-fg-faint": paper["--shell-fg-faint"],
    "--accent": src["--accent"]!,
    "--sev-blocking": src["--sev-blocking"]!,
    "--sev-major": src["--sev-major"]!,
    "--sev-minor": src["--sev-minor"]!,
    "--sev-note": src["--sev-note"]!,
    "--kind-claim": src["--kind-claim"]!,
    "--kind-discourse": src["--kind-discourse"]!,
    "--kind-argument": src["--kind-argument"]!,
    "--kind-craft": src["--kind-craft"]!,
    "--kind-voice": src["--kind-voice"]!,
    "--state-running": src["--state-running"]!,
    "--state-needs-you": src["--state-needs-you"]!,
    "--state-ready": src["--state-ready"]!,
    "--state-failed": src["--state-failed"]!,
  };
}

/** 4-pt spacing scale (§5.9) → `--s1 … --s12`, in px. */
export const SPACING: Readonly<Record<string, number>> = {
  "--s1": 4,
  "--s2": 8,
  "--s3": 12,
  "--s4": 16,
  "--s6": 24,
  "--s8": 32,
  "--s12": 48,
};

/** Corner radii (§5.9). */
export const RADIUS: Readonly<Record<string, number>> = {
  "--radius-1": 4,
  "--radius-2": 8,
  "--radius-3": 12,
};

/**
 * Typography (§5.9; REQ-IDE-39). The paper serif preset (Literata) is the default reading face; Inter is
 * the only other preset (sans); shell UI is Inter with tabular figures for counts and credits; mono is
 * JetBrains Mono. The real font files ship with the app (self-hosted woff2 via `apps/web` — see
 * build-client.mjs) and are declared by `themeCss()`'s @font-face blocks.
 */
export const TYPOGRAPHY = {
  paperSerifStack: '"Literata", "Lora", Georgia, serif',
  paperSansStack: '"Inter", system-ui, sans-serif',
  shellStack: '"Inter", system-ui, sans-serif',
  monoStack: '"JetBrains Mono", ui-monospace, monospace',
  paperBodyPx: 17,
  paperSansBodyPx: 16,
  paperBodyLineHeight: 1.55,
  /** Shell UI sizes (§5.9): base 14, dense 13, micro 12 — tabular figures for counts/credits. */
  shellBodyPx: 14,
  shellDensePx: 13,
  shellMicroPx: 12,
  monoPx: 13,
  /** Heading weights 600 at these em sizes (h1…h4). */
  headingEm: [2.0, 1.625, 1.375, 1.125] as const,
  headingWeight: 600,
  /** Paragraph spacing 1.0 em, no indent. */
  paragraphSpacingEm: 1.0,
  /** Measure: 68 ch target, clamped [45, 80] (REQ-IDE-9). */
  measureCh: 68,
  measureMinCh: 45,
  measureMaxCh: 80,
  /** Reader size stepper: ±2 px, three steps from the preset base (persisted per user). */
  readerStepPx: 2,
  readerSteps: 3,
  /** Print/export: 11 pt / 1.4, 6.5 in measure. */
  printPt: 11,
  printLineHeight: 1.4,
  printMeasureIn: 6.5,
} as const;

/**
 * §5.1 layout tokens — the reference width math every pane rule is derived from (ticket Notes):
 * Rail 56 + Files 240 open / 36 collapsed + Page 660 (68 ch target) + Margin 280 + Timeline 320.
 * At 1440 px the full open sum is 1,556 px — it fits only because Files defaults collapsed (→ 1,352 px).
 */
export const LAYOUT = {
  railPx: 56,
  filesOpenPx: 240,
  filesStripPx: 36,
  filesSnapPx: [240, 320, 400] as const,
  pageTargetCh: 68,
  pageMinCh: 45,
  pageMaxCh: 80,
  /** ≈ px per ch at the 17-px paper body — for layout MATH only; the rendered clamp is CSS `ch`. */
  chPx: 9.7,
  marginPx: 280,
  timelinePx: 320,
  timelineSnapPx: [280, 320, 400] as const,
  deskHeightPx: 280,
  statusBarPx: 28,
  /** Yield-order breakpoints (§5.1). */
  bpFilesTicksMarginPx: 1600, // Files open below this ⇒ Margin collapses to ticks; Timeline → overlay
  bpNarrowPx: 1280, // below: Margin → ticks, Timeline → overlay (regardless of Files)
  bpSingleColumnPx: 1024, // below: single-column, Timeline → sheet
  bpPhonePx: 768, // below: phone layout — reader-only Page + the §10.1 inputs (P1.19 owns inputs)
} as const;

/** §5.9 motion tokens (REQ-IDE-40) — named durations; `prefers-reduced-motion` collapses all to instant. */
export const MOTION = {
  /** streaming text: 120-ms fade per block + caret pulse */
  streamBlockMs: 120,
  caretPulseMs: 1200,
  /** phase progress */
  phaseProgressMs: 160,
  /** finding arrival: slide + one tick pulse */
  findingArrivalMs: 200,
  /** pane transitions */
  paneMs: 160,
  /** approval countdown: numeric only; amber at 5 min */
  gateAmberBelowMin: 5,
} as const;

/** `prefers-reduced-motion` collapse: every catalogued motion becomes instant (REQ-IDE-40). */
export function motionMs(kind: keyof typeof MOTION & string, reducedMotion: boolean): number {
  const v = MOTION[kind as keyof typeof MOTION];
  return reducedMotion || typeof v !== "number" ? 0 : v;
}

/** Return `var(--name)` for a token name (with or without the leading `--`). */
export function cssVar(name: string): string {
  const v = name.startsWith("--") ? name : `--${name}`;
  return `var(${v})`;
}

/** Every hex value in a theme's palette (used by the no-pure-black/white contract test). */
export function hexValues(vars: VarMap = DARK_VARS): string[] {
  return Object.values(vars).filter((v) => v.startsWith("#"));
}
