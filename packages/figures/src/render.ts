// The render entry point (§7.5; REQ-VIZ-6/7/8): one call produces the persisted light+dark SVG
// pair for a spec. Vega-Lite and Mermaid render; GFM/HTML tables pass through unrendered (they
// need no raster — the card shows the table itself); anything else is declined with a suggestion,
// never silently rasterized. Node-only — the browser never produces the canonical SVG.

import type { FigureTheme, ThemeMode } from "./theme.js";
import { figureTheme } from "./theme.js";
import { renderVegaLiteSvg } from "./vega-render.js";
import { mermaidDiagramKind, renderMermaidSvg, SUPPORTED_MERMAID_DIAGRAMS } from "./mermaid.js";

/** The spec kinds the §7.5 renderer carries (the `figures.spec_kind` vocabulary). */
export const FIGURE_SPEC_KINDS = ["vega_lite", "mermaid", "table"] as const;
export type FigureSpecKind = (typeof FIGURE_SPEC_KINDS)[number];

export type FigureRenderResult =
  | {
      readonly kind: "rendered";
      /** `render.svg` — the light-theme render (the export's only render; dark never exports). */
      readonly svg: string;
      /** `render.dark.svg` — the dark-theme render. */
      readonly svgDark: string;
    }
  | { readonly kind: "table" } // GFM/HTML tables need no render (§7.5).
  | {
      readonly kind: "declined";
      /** the suggestion the card/chat surfaces (§7.5: declined with a suggestion, never silent). */
      readonly suggestion: string;
    };

export interface RenderFigureArgs {
  readonly specKind: FigureSpecKind | string;
  /** the spec source: parsed Vega-Lite JSON object for `vega_lite`, Mermaid source for `mermaid`,
   *  the GFM/HTML table text for `table`. */
  readonly spec: unknown;
}

/**
 * Render a figure spec to its persisted light+dark SVG pair. Both renders derive from the same
 * theme source (`figureTheme`), so the pair is consistent by construction and byte-identical
 * across runs and environments for identical input.
 */
export async function renderFigure(args: RenderFigureArgs): Promise<FigureRenderResult> {
  switch (args.specKind) {
    case "table":
      return { kind: "table" };
    case "vega_lite": {
      const [svg, svgDark] = await Promise.all([
        renderVegaLiteSvg(args.spec, figureTheme("light")),
        renderVegaLiteSvg(args.spec, figureTheme("dark")),
      ]);
      return { kind: "rendered", svg, svgDark };
    }
    case "mermaid": {
      if (typeof args.spec !== "string") {
        return { kind: "declined", suggestion: "a Mermaid figure needs its `.mmd` source text" };
      }
      const kind = mermaidDiagramKind(args.spec);
      if (kind === "unsupported") {
        return {
          kind: "declined",
          suggestion: `that Mermaid diagram type is unsupported — ${SUPPORTED_MERMAID_DIAGRAMS.join(", ")} render; a Vega-Lite chart or a table can carry the data instead`,
        };
      }
      if (kind == null) {
        return { kind: "declined", suggestion: "unrecognized Mermaid source — start with a diagram directive (flowchart, sequenceDiagram, xychart, …)" };
      }
      const [svg, svgDark] = [
        renderMermaidSvg(args.spec, figureTheme("light")),
        renderMermaidSvg(args.spec, figureTheme("dark")),
      ];
      return { kind: "rendered", svg, svgDark };
    }
    default:
      return {
        kind: "declined",
        suggestion: `unsupported figure type "${String(args.specKind)}" — a Vega-Lite chart, a Mermaid diagram, or a table can be produced instead`,
      };
  }
}

export { figureTheme };
export type { FigureTheme, ThemeMode };
