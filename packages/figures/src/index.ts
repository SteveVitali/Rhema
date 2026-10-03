// @rhema/figures — deterministic, node-only figure rendering (§7.5; P1.13).
// Vega-Lite → validated → compiled → light+dark SVG themed from @rhema/tokens; Mermaid →
// beautiful-mermaid → the same pair; GFM/HTML tables pass through unrendered; PNG@2x lazily via
// @resvg/resvg-js. No DOM, no canvas, no timestamps, no random seeds — the same spec renders
// byte-identical output everywhere, so the worker's persisted render is the only render
// (REQ-VIZ-6/7/8). Nothing here may import a DOM-dependent module.

export { PACKAGE_NAME, packageInfo } from "./info.js";
export { figureTheme, LABEL_CONTRAST_MIN, type FigureTheme, type ThemeMode } from "./theme.js";
export { validateVegaLiteSpec, MAX_SPEC_ATTEMPTS, type VegaLiteValidation } from "./validate.js";
export { vegaConfig, renderVegaLiteSvg } from "./vega-render.js";
export {
  mermaidDiagramKind,
  renderMermaidSvg,
  SUPPORTED_MERMAID_DIAGRAMS,
  type MermaidDiagramKind,
} from "./mermaid.js";
export {
  renderFigure,
  FIGURE_SPEC_KINDS,
  type FigureSpecKind,
  type FigureRenderResult,
  type RenderFigureArgs,
} from "./render.js";
export { renderPng2x, PNG_SCALE } from "./png.js";
export { parseFigureCsv, inlineCsvData } from "./csv.js";
