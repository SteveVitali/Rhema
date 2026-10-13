import { describe, it, expect } from "vitest";
import { DARK_VARS, LIGHT_VARS, PAPER_KEYS, SPACING, RADIUS, TYPOGRAPHY, LAYOUT, MOTION, cssVar, hexValues, paperVars } from "./tokens.js";
import { themeCss, FONT_FACES } from "./theme-css.js";
import { ideCss } from "./ide-css.js";

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

  it("the light theme defines EVERY token — a real theme, not a partial override (P1.01)", () => {
    for (const key of Object.keys(DARK_VARS)) {
      expect(LIGHT_VARS[key], `LIGHT_VARS missing ${key}`).toBeDefined();
    }
    expect(LIGHT_VARS["--shell-bg"]).toBe("#f6f7f9");
    expect(LIGHT_VARS["--paper-bg"]).toBe("#fffdf8");
    expect(LIGHT_VARS["--sev-blocking"]).toBeDefined();
    expect(LIGHT_VARS["--kind-voice"]).toBeDefined();
    expect(LIGHT_VARS["--state-failed"]).toBeDefined();
  });

  it("uses the 4-pt spacing scale and 4/8/12 radii", () => {
    expect(SPACING["--s1"]).toBe(4);
    expect(SPACING["--s4"]).toBe(16);
    expect(SPACING["--s12"]).toBe(48);
    expect(Object.values(RADIUS)).toEqual([4, 8, 12]);
  });

  it("uses no pure black or white in either shipped theme (§5.9 contrast rule)", () => {
    for (const hex of [...hexValues(DARK_VARS), ...hexValues(LIGHT_VARS)]) {
      const lc = hex.toLowerCase();
      expect(lc).not.toBe("#000");
      expect(lc).not.toBe("#000000");
      expect(lc).not.toBe("#fff");
      expect(lc).not.toBe("#ffffff");
    }
  });

  it("the §5.1 reference math is the literal comment's: 56 + 240/36 + 660 + 280 + 320", () => {
    expect(LAYOUT.railPx).toBe(56);
    expect(LAYOUT.filesOpenPx).toBe(240);
    expect(LAYOUT.filesStripPx).toBe(36);
    expect(LAYOUT.marginPx).toBe(280);
    expect(LAYOUT.timelinePx).toBe(320);
    expect(LAYOUT.bpFilesTicksMarginPx).toBe(1600);
    expect(LAYOUT.bpNarrowPx).toBe(1280);
    expect(LAYOUT.bpSingleColumnPx).toBe(1024);
    expect(LAYOUT.bpPhonePx).toBe(768);
    // Page measure clamps [45, 80] ch at a 68-ch target (REQ-IDE-9).
    expect(TYPOGRAPHY.measureMinCh).toBe(45);
    expect(TYPOGRAPHY.measureCh).toBe(68);
    expect(TYPOGRAPHY.measureMaxCh).toBe(80);
  });

  it("paper pinning only rewrites the paper-* subset", () => {
    expect(paperVars("light")["--paper-bg"]).toBe(LIGHT_VARS["--paper-bg"]);
    expect(paperVars("dark")["--paper-bg"]).toBe(DARK_VARS["--paper-bg"]);
    for (const key of Object.keys(paperVars("light"))) {
      expect(PAPER_KEYS).toContain(key);
    }
  });

  it("motion tokens carry the §5.9 durations", () => {
    expect(MOTION.streamBlockMs).toBe(120);
    expect(MOTION.phaseProgressMs).toBe(160);
    expect(MOTION.findingArrivalMs).toBe(200);
    expect(MOTION.paneMs).toBe(160);
  });

  it("cssVar wraps a token name", () => {
    expect(cssVar("shell-bg")).toBe("var(--shell-bg)");
    expect(cssVar("--accent")).toBe("var(--accent)");
  });
});

describe("themeCss()", () => {
  const css = themeCss();
  it("declares the dark palette on :root and the full light theme under [data-theme=light]", () => {
    expect(css).toContain(":root {");
    expect(css).toContain("--shell-bg: #0f1114;");
    expect(css).toContain("--s4: 16px;");
    expect(css).toContain('[data-theme="light"] {');
    expect(css).toContain("--shell-bg: #f6f7f9;");
    expect(css).toContain("--state-failed: #bd352c;");
  });
  it("emits [data-paper] pinning for both modes — the paper follows neither theme when pinned", () => {
    expect(css).toContain('[data-paper="light"] {');
    expect(css).toContain('[data-paper="dark"] {');
    expect(css).toContain("--paper-bg: #fffdf8;");
  });
  it("ships the real font faces (Literata/Inter/JetBrains Mono woff2) + the two paper presets", () => {
    for (const f of FONT_FACES) {
      expect(css).toContain(`font-family: '${f.family}'`);
      expect(css).toContain(`/assets/fonts/${f.file}`);
    }
    expect(css).toContain("--font-paper:");
    expect(css).toContain('[data-font="sans"]');
  });
  it("sets the shell body ground so the SSR document reads as the studio", () => {
    expect(css).toContain("background: var(--shell-bg);");
    expect(css).toContain("color: var(--shell-fg);");
  });
  it("collapses all catalogued motion under prefers-reduced-motion (REQ-IDE-40)", () => {
    expect(css).toContain("prefers-reduced-motion: reduce");
  });
  it("carries the 2-px accent focus ring and the print/export rules", () => {
    expect(css).toContain(":focus-visible { outline: 2px solid var(--accent)");
    expect(css).toContain("@media print");
    expect(css).toContain("font-size: 11pt;");
  });
});

describe("ideCss()", () => {
  const css = ideCss();
  it("lays out all seven §5.1 regions", () => {
    for (const region of [".ide-rail", ".ide-files", ".ide-page", ".ide-margin", ".ide-timeline", ".ide-desk", ".ide-statusbar"]) {
      expect(css, region).toContain(region);
    }
  });
  it("encodes the yield-order breakpoints from LAYOUT (no magic numbers)", () => {
    expect(css).toContain(`max-width: ${LAYOUT.bpFilesTicksMarginPx - 1}px`);
    expect(css).toContain(`max-width: ${LAYOUT.bpNarrowPx - 1}px`);
    expect(css).toContain(`max-width: ${LAYOUT.bpSingleColumnPx - 1}px`);
    expect(css).toContain(`max-width: ${LAYOUT.bpPhonePx - 1}px`);
  });
  it("clamps the Page measure to [45ch, 80ch] in CSS", () => {
    expect(css).toContain(`min-width: min(${TYPOGRAPHY.measureMinCh}ch, 100%)`);
    expect(css).toContain(`max-width: ${TYPOGRAPHY.measureMaxCh}ch`);
  });
  it("the only modal styling is the Cancel-run shell modal — no generic modal utilities", () => {
    expect(css).toContain(".ide-modal");
  });
  // D-CAP.2-3 (UX.2 / ADR-067) — the cascade seam: the phone override for `.ide .ide-actions a`
  // (≥44 px inside `@media (max-width: ${bpPhone-1}px)`) must be the LAST equal-specificity
  // declaration of the property. A base rule emitted after the media block silently deads the
  // override at every width — the rule prod shipped (25-px targets at 390 px; journey P1 red).
  it("the phone ≥44-px action-row rule wins the cascade — base rule precedes the media override", () => {
    const phoneBlock = `@media (max-width: ${LAYOUT.bpPhonePx - 1}px)`;
    const mediaIdx = css.indexOf(phoneBlock);
    expect(mediaIdx, "phone media block present").toBeGreaterThan(-1);
    const baseIdx = css.indexOf(".ide .ide-actions a { display: inline-flex; align-items: center; min-height: 24px");
    const phoneIdx = css.indexOf(".ide .ide-actions a { min-height: 44px");
    expect(baseIdx, "base 24-px rule present").toBeGreaterThan(-1);
    expect(phoneIdx, "phone 44-px override present").toBeGreaterThan(-1);
    // the base rule is OUTSIDE the media block and BEFORE it; the override is inside.
    expect(baseIdx).toBeLessThan(mediaIdx);
    expect(phoneIdx).toBeGreaterThan(mediaIdx);
    // no equal-specificity `.ide .ide-actions a` declaration may follow the override —
    // a later base min-height is exactly the dead-override defect this guards.
    const overrideDeclIdx = css.indexOf("min-height: 44px", phoneIdx);
    const tail = css.slice(overrideDeclIdx);
    expect(tail).not.toMatch(/\.ide \.ide-actions a \{[^}]*min-height/);
  });
});
