// Vega-Lite → SVG (§7.5; REQ-VIZ-6/7/8): compile with the token-derived theme config, render
// server-side via vega's scenegraph SVG serializer — node-only, no DOM, no canvas. Determinism is
// contractual (REQ-VIZ-8: IDE / review / export read byte-identical SVG): vega's `toSVG` embeds no
// timestamps or random ids, text is measured by vega's deterministic estimator (never a canvas),
// and the theme is a pure function of the token set.

import * as vega from "vega";
import { compile } from "vega-lite";
import type { FigureTheme } from "./theme.js";

/** The vega `config` block carrying one FigureTheme — chrome colors only; the spec's own encoding
 *  wins for data. `range.category` is the token-derived series so a colorless spec still lands on
 *  the design system's data hues. */
export function vegaConfig(theme: FigureTheme): Record<string, unknown> {
  return {
    background: theme.bg,
    font: theme.font,
    view: { stroke: theme.rule, fill: theme.bg, continuousWidth: 480, continuousHeight: 300 },
    title: { color: theme.fg, subtitleColor: theme.muted, font: theme.font },
    axis: {
      labelColor: theme.fg,
      titleColor: theme.fg,
      tickColor: theme.muted,
      domainColor: theme.rule,
      gridColor: theme.rule,
      labelFont: theme.font,
      titleFont: theme.font,
    },
    legend: {
      labelColor: theme.fg,
      titleColor: theme.fg,
      labelFont: theme.font,
      titleFont: theme.font,
    },
    mark: { color: theme.accent, font: theme.font },
    rule: { color: theme.rule },
    range: { category: [...theme.series] },
  };
}

/**
 * Compile + render one Vega-Lite spec to an SVG string under `theme`. Throws the compile/render
 * error verbatim — callers validate first (`validateVegaLiteSpec`) so a throw here is a render
 * fault, not a schema fault.
 */
export async function renderVegaLiteSvg(spec: unknown, theme: FigureTheme): Promise<string> {
  const compiled = compile(spec as unknown as Parameters<typeof compile>[0], { config: vegaConfig(theme) }).spec;
  const view = new vega.View(vega.parse(compiled), { renderer: "none" });
  // A spec `background` never wins over the theme ground — the paper tone is the figure's ground.
  view.background(theme.bg);
  return await view.toSVG();
}
