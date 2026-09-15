import { describe, it, expect } from "vitest";
import { DARK_VARS, LIGHT_VARS, SPACING, RADIUS, cssVar, darkHexValues } from "./tokens.js";
import { themeCss } from "./theme-css.js";

describe("§5.9 tokens", () => {
  it("carries the verbatim dark shell + paper + accent scales", () => {
    expect(DARK_VARS["--shell-bg"]).toBe("#0f1114");
    expect(DARK_VARS["--shell-surface"]).toBe("#161a1f");
    expect(DARK_VARS["--shell-fg"]).toBe("#e6e8eb");
    expect(DARK_VARS["--accent"]).toBe("#8ab4f8");
    expect(DARK_VARS["--paper-bg"]).toBe("#17161a");
    expect(DARK_VARS["--sev-blocking"]).toBe("#ff7b72");
    expect(DARK_VARS["--state-needs-you"]).toBe("#f0b24a");
  });

  it("light overrides re-tune only the §5.9-listed subset", () => {
    expect(LIGHT_VARS["--shell-bg"]).toBe("#f6f7f9");
    expect(LIGHT_VARS["--accent"]).toBe("#2f6fdb");
    // severity/kind/state hues are not in the §5.9 light block — they inherit until the design system.
    expect(LIGHT_VARS["--sev-blocking"]).toBeUndefined();
  });

  it("uses the 4-pt spacing scale and 4/8/12 radii", () => {
    expect(SPACING["--s1"]).toBe(4);
    expect(SPACING["--s4"]).toBe(16);
    expect(SPACING["--s12"]).toBe(48);
    expect(Object.values(RADIUS)).toEqual([4, 8, 12]);
  });

  it("uses no pure black or white in the shipped Dark palette (§5.9 contrast rule)", () => {
    for (const hex of darkHexValues()) {
      const lc = hex.toLowerCase();
      expect(lc).not.toBe("#000");
      expect(lc).not.toBe("#000000");
      expect(lc).not.toBe("#fff");
      expect(lc).not.toBe("#ffffff");
    }
  });

  it("cssVar wraps a token name", () => {
    expect(cssVar("shell-bg")).toBe("var(--shell-bg)");
    expect(cssVar("--accent")).toBe("var(--accent)");
  });
});

describe("themeCss()", () => {
  const css = themeCss();
  it("declares the dark palette on :root and the light overrides under [data-theme=light]", () => {
    expect(css).toContain(":root {");
    expect(css).toContain("--shell-bg: #0f1114;");
    expect(css).toContain("--s4: 16px;");
    expect(css).toContain('[data-theme="light"] {');
    expect(css).toContain("--shell-bg: #f6f7f9;");
  });
  it("sets the shell body ground so the SSR document reads as the studio", () => {
    expect(css).toContain("background: var(--shell-bg);");
    expect(css).toContain("color: var(--shell-fg);");
  });
});
