import { describe, it, expect } from "vitest";
import { renderFigure } from "./render.js";
import { renderVegaLiteSvg, vegaConfig } from "./vega-render.js";
import { renderMermaidSvg, mermaidDiagramKind } from "./mermaid.js";
import { figureTheme, LABEL_CONTRAST_MIN } from "./theme.js";
import { contrastRatio } from "@rhema/tokens";

const VL_BAR = {
  $schema: "https://vega.github.io/schema/vega-lite/v6.json",
  description: "party-family GAL–TAN correlations",
  data: {
    values: [
      { family: "Radical right", r: 0.71 },
      { family: "Conservative", r: 0.42 },
      { family: "Liberal", r: 0.18 },
      { family: "Social democratic", r: 0.04 },
    ],
  },
  mark: "bar",
  encoding: {
    y: { field: "family", type: "nominal", sort: "-x", title: null },
    x: { field: "r", type: "quantitative", title: "Correlation" },
  },
};

const FLOW = "flowchart TD\n  A[Selection] --> B[Data check]\n  B --> C[Figure]";

describe("renderFigure (§7.5; REQ-VIZ-6/7/8)", () => {
  it("renders a Vega-Lite spec to light+dark SVG", async () => {
    const res = await renderFigure({ specKind: "vega_lite", spec: VL_BAR });
    expect(res.kind).toBe("rendered");
    if (res.kind !== "rendered") return;
    expect(res.svg).toContain("<svg");
    expect(res.svgDark).toContain("<svg");
    expect(res.svg).not.toBe(res.svgDark);
  });

  it("REQ-VIZ-8 — byte-identical output for identical input (two runs)", async () => {
    const a = await renderFigure({ specKind: "vega_lite", spec: VL_BAR });
    const b = await renderFigure({ specKind: "vega_lite", spec: VL_BAR });
    expect(a.kind).toBe("rendered");
    expect(b.kind).toBe("rendered");
    if (a.kind !== "rendered" || b.kind !== "rendered") return;
    expect(a.svg).toBe(b.svg);
    expect(a.svgDark).toBe(b.svgDark);
  });

  it("a second environment-equivalent render (fresh theme objects) is byte-identical", async () => {
    // simulate "two environments": separate theme objects, same tokens.
    const [l1, l2] = [
      await renderVegaLiteSvg(VL_BAR, figureTheme("light")),
      await renderVegaLiteSvg(VL_BAR, figureTheme("light")),
    ];
    expect(l1).toBe(l2);
  });

  it("the render carries the token ground — never pure white/black", async () => {
    const light = figureTheme("light");
    const dark = figureTheme("dark");
    const svgL = await renderVegaLiteSvg(VL_BAR, light);
    const svgD = await renderVegaLiteSvg(VL_BAR, dark);
    expect(svgL).toContain(light.bg);
    expect(svgD).toContain(dark.bg);
    expect(svgL).not.toContain('fill="white"');
    expect(svgL).not.toContain('fill="black"');
    expect(svgD).not.toContain('fill="white"');
    expect(svgD).not.toContain('fill="black"');
  });

  it("REQ-VIZ-7 — no animation or interactivity in a persisted render", async () => {
    const res = await renderFigure({ specKind: "vega_lite", spec: VL_BAR });
    if (res.kind !== "rendered") throw new Error("expected rendered");
    for (const svg of [res.svg, res.svgDark]) {
      expect(svg).not.toMatch(/<animate|animation|transition:|@keyframes|onclick|onmouseover/i);
    }
    const m = renderMermaidSvg(FLOW, figureTheme("light"));
    expect(m).not.toMatch(/<animate|@keyframes|onclick|onmouseover/i);
  });

  it("Mermaid renders the supported families", async () => {
    for (const src of [
      FLOW,
      "sequenceDiagram\n  A->>B: hi",
      "classDiagram\n  A <|-- B",
      "erDiagram\n  A ||--o{ B : has",
      "stateDiagram-v2\n  [*] --> A",
      "xychart-beta\n  x-axis [a, b]\n  bar [1, 2]",
    ]) {
      const res = await renderFigure({ specKind: "mermaid", spec: src });
      expect(res.kind, src.split("\n")[0]).toBe("rendered");
    }
  });

  it("Mermaid byte-identical across runs", () => {
    const a = renderMermaidSvg(FLOW, figureTheme("dark"));
    const b = renderMermaidSvg(FLOW, figureTheme("dark"));
    expect(a).toBe(b);
  });

  it("the persisted Mermaid SVG never references a remote resource", () => {
    const svg = renderMermaidSvg(FLOW, figureTheme("light"));
    expect(svg).not.toMatch(/@import|https?:\/\/fonts/);
  });

  it("unsupported Mermaid families are declined with a suggestion", async () => {
    expect(mermaidDiagramKind("gantt\n  title t\n  section s\n  a: 2024-01-01, 1d")).toBe("unsupported");
    const res = await renderFigure({ specKind: "mermaid", spec: "gantt\n  title t\n  section s\n  a: 2024-01-01, 1d" });
    expect(res.kind).toBe("declined");
    if (res.kind !== "declined") return;
    expect(res.suggestion).toMatch(/unsupported/i);
    expect(res.suggestion.length).toBeGreaterThan(20);
  });

  it("a GFM/HTML table passes through unrendered (no raster needed)", async () => {
    const res = await renderFigure({ specKind: "table", spec: "| a | b |\n|---|---|\n| 1 | 2 |" });
    expect(res.kind).toBe("table");
  });

  it("an unknown spec kind is declined with a suggestion — never silent", async () => {
    const res = await renderFigure({ specKind: "drawing_canvas", spec: {} });
    expect(res.kind).toBe("declined");
    if (res.kind !== "declined") return;
    expect(res.suggestion).toContain("unsupported figure type");
  });

  it("vega config carries the theme to chrome (axis/legend/labels)", () => {
    const cfg = vegaConfig(figureTheme("dark")) as { axis: { labelColor: string }; background: string };
    expect(cfg.background).toBe(figureTheme("dark").bg);
    expect(cfg.axis.labelColor).toBe(figureTheme("dark").fg);
  });
});

describe("figure theme (token-derived; REQ-VIZ-7 label contrast ≥4.5:1)", () => {
  for (const mode of ["light", "dark"] as const) {
    it(`${mode}: fg + muted labels clear ${LABEL_CONTRAST_MIN}:1 on the ground`, () => {
      const t = figureTheme(mode);
      expect(contrastRatio(t.fg, t.bg)).toBeGreaterThanOrEqual(LABEL_CONTRAST_MIN);
      expect(contrastRatio(t.muted, t.bg)).toBeGreaterThanOrEqual(LABEL_CONTRAST_MIN);
    });
    it(`${mode}: the accent + series hues are token-derived`, () => {
      const t = figureTheme(mode);
      for (const c of [t.accent, ...t.series]) expect(c).toMatch(/^#[0-9a-f]{6}$/i);
      expect(new Set(t.series).size).toBeGreaterThanOrEqual(4);
    });
  }
});
