// Mermaid → SVG via `beautiful-mermaid` (§7.5; REQ-VIZ-6 — MIT, resolves §16.3 #22). Zero DOM
// deps, synchronous, deterministic. Two post-passes keep the persisted render honest:
//   1. the library emits a Google-Fonts `@import` in its <style> block — a persisted render never
//      reaches the network (privacy + reproducibility); the Inter stack resolves locally.
//   2. `interactive` stays off — no tooltips/handlers, no animation (REQ-VIZ-7).

import { renderMermaidSVG } from "beautiful-mermaid";
import type { FigureTheme } from "./theme.js";

/** The Mermaid diagram families §7.5 supports. Parsed off the source's first directive line. */
export const SUPPORTED_MERMAID_DIAGRAMS = [
  "flowchart",
  "stateDiagram",
  "sequenceDiagram",
  "classDiagram",
  "erDiagram",
  "xychart",
] as const;
export type MermaidDiagramKind = (typeof SUPPORTED_MERMAID_DIAGRAMS)[number];

const DIRECTIVE_KIND: [RegExp, MermaidDiagramKind][] = [
  [/^(graph|flowchart)\b/i, "flowchart"],
  [/^stateDiagram(-v2)?\b/i, "stateDiagram"],
  [/^sequenceDiagram\b/i, "sequenceDiagram"],
  [/^classDiagram\b/i, "classDiagram"],
  [/^erDiagram\b/i, "erDiagram"],
  [/^xychart(-beta)?\b/i, "xychart"],
];

/**
 * Classify a Mermaid source's diagram family (first non-comment/non-directive line). `null` when
 * the source names a family outside the §7.5 set (gantt, pie, gitGraph, journey, mindmap, timeline,
 * quadrantChart, sankey, …) — the caller declines it with a suggestion.
 */
export function mermaidDiagramKind(source: string): MermaidDiagramKind | "unsupported" | null {
  for (const raw of source.split("\n")) {
    const line = raw.trim();
    if (line === "" || line.startsWith("%%") || line.startsWith("---")) continue;
    for (const [re, kind] of DIRECTIVE_KIND) if (re.test(line)) return kind;
    // A recognized-looking diagram keyword outside the supported set.
    if (/^\s*[a-zA-Z][a-zA-Z-]*/.test(line)) return "unsupported";
    return null;
  }
  return null;
}

/** Strip the remote font `@import` (and any other @import) from the emitted <style> — the
 *  persisted SVG must be self-contained and byte-stable offline. */
function stripRemoteImports(svg: string): string {
  return svg.replace(/@import\s+url\([^)]*\)\s*;?/g, "");
}

/**
 * Render Mermaid source to an SVG string under `theme`. Throws when the source doesn't parse —
 * the spec phase treats a parse error like a validation error (bounded retries, then an honest
 * decline).
 */
export function renderMermaidSvg(source: string, theme: FigureTheme): string {
  const svg = renderMermaidSVG(source, {
    bg: theme.bg,
    fg: theme.fg,
    line: theme.muted,
    accent: theme.accent,
    muted: theme.muted,
    surface: theme.surface,
    border: theme.rule,
    font: theme.font,
    interactive: false, // REQ-VIZ-7 — no animation/handlers in a persisted render.
  });
  return stripRemoteImports(svg);
}
