// §5.9 design tokens, checked in as data (REQ-IDE-38/39; R17). Two textures, ONE token set: a neutral
// cool-dark shell around a warm paper sheet. The values here are verbatim from spec §5.9 (v1.0). The shell
// is Dark by default (Q-14); the light theme overrides only the subset §5.9 lists — the full light palette
// and the paper-pinned-light hues are the design system's job (P1.01). No pure black or white anywhere.

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
 * Light-theme overrides — exactly the subset §5.9 defines under `[data-theme="light"]` (hues re-tuned
 * ≥4.5:1). Tokens not listed here inherit the dark value until the full light palette lands with the
 * design system (P1.01); the beta shell is Dark by default so this stays a partial override by design.
 */
export const LIGHT_VARS: VarMap = {
  "--shell-bg": "#f6f7f9",
  // Verbatim §5.9 (`--shell-surface:#fff`). The "no pure black/white" principle governs the shipped Dark
  // default; the light theme's full re-tune (this surface included) is the design system's job (P1.01).
  "--shell-surface": "#fff",
  "--shell-border": "#e3e6ea",
  "--shell-fg": "#1a1d21",
  "--shell-fg-muted": "#5c6670",
  "--accent": "#2f6fdb",
  "--paper-bg": "#fffdf8",
  "--paper-fg": "#1d1c1a",
  "--paper-rule": "#e8e4dc",
};

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
 * Typography (§5.9). The paper serif preset (Literata) is the default reading face; shell UI is Inter with
 * tabular figures for counts and credits; mono is JetBrains Mono. Real font files are loaded by the app.
 */
export const TYPOGRAPHY = {
  paperSerifStack: '"Literata", "Lora", Georgia, serif',
  paperSansStack: '"Inter", system-ui, sans-serif',
  shellStack: '"Inter", system-ui, sans-serif',
  monoStack: '"JetBrains Mono", ui-monospace, monospace',
  paperBodyPx: 17,
  paperBodyLineHeight: 1.55,
  shellBodyPx: 14,
  measureCh: 68,
  measureMinCh: 45,
  measureMaxCh: 80,
} as const;

/** Return `var(--name)` for a token name (with or without the leading `--`). */
export function cssVar(name: string): string {
  const v = name.startsWith("--") ? name : `--${name}`;
  return `var(${v})`;
}

/** Every hex value in the shipped Dark palette (used by the no-pure-black/white contract test). */
export function darkHexValues(): string[] {
  return Object.values(DARK_VARS).filter((v) => v.startsWith("#"));
}
