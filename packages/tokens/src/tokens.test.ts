import { describe, it, expect } from "vitest";
import { DARK_VARS, FONT_SIZE, LIGHT_VARS, PAPER_KEYS, SPACING, RADIUS, TYPOGRAPHY, LAYOUT, MOTION, cssVar, hexValues, paperVars, paperScopeVars } from "./tokens.js";
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

  it("uses the 4-pt spacing scale and 4/8/12 radii + the named pill step (R7KIT.1)", () => {
    expect(SPACING["--s1"]).toBe(4);
    expect(SPACING["--s4"]).toBe(16);
    expect(SPACING["--s12"]).toBe(48);
    expect(Object.values(RADIUS)).toEqual([4, 8, 12, 999]);
    expect(RADIUS["--radius-pill"]).toBe(999);
  });

  it("the --fs-* scale names the shell sizes and the two off-scale bands (R7KIT.1; UXC-31)", () => {
    expect(FONT_SIZE["--fs-body"]).toBe(TYPOGRAPHY.shellBodyPx);
    expect(FONT_SIZE["--fs-dense"]).toBe(TYPOGRAPHY.shellDensePx);
    expect(FONT_SIZE["--fs-micro"]).toBe(TYPOGRAPHY.shellMicroPx);
    // the two bands R6 §8 counted outside the 14/13/12 scale — caption (10.5–11 px) and lead (15–16 px).
    expect(FONT_SIZE["--fs-caption"]).toBe(11);
    expect(FONT_SIZE["--fs-lead"]).toBe(16);
  });

  it("defines the R7KIT.1 diff/state colour tokens in BOTH themes (UXC-32 — they were undefined)", () => {
    for (const v of [DARK_VARS, LIGHT_VARS]) {
      expect(v["--paper-diff-add"]).toBeDefined();
      expect(v["--paper-diff-del"]).toBeDefined();
      expect(v["--state-ok"]).toBeDefined();
    }
    // the tints ride the [data-paper] pin — a pinned paper keeps ITS theme's diff colours.
    expect(paperVars("light")["--paper-diff-add"]).toBe(LIGHT_VARS["--paper-diff-add"]);
    expect(paperVars("dark")["--paper-diff-del"]).toBe(DARK_VARS["--paper-diff-del"]);
    // and the paper scope carries --state-ok so a control inside `.paper` reads the paper theme.
    expect(paperScopeVars("light")["--state-ok"]).toBe(LIGHT_VARS["--state-ok"]);
    expect(paperScopeVars("dark")["--state-ok"]).toBe(DARK_VARS["--state-ok"]);
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

  it("the §5.1 reference math keeps the surviving regions (R7SHELL.2: rail/files widths removed)", () => {
    // R7SHELL.2 — the rail's 56 px and the Files widths are gone: the AppShell sidebar is the
    // only left column. The constants must NOT come back (a re-added rail/files width fails here).
    expect("railPx" in LAYOUT).toBe(false);
    expect("filesOpenPx" in LAYOUT).toBe(false);
    expect("filesStripPx" in LAYOUT).toBe(false);
    expect("filesSnapPx" in LAYOUT).toBe(false);
    expect("bpFilesTicksMarginPx" in LAYOUT).toBe(false);
    expect(LAYOUT.marginPx).toBe(280);
    expect(LAYOUT.timelinePx).toBe(320);
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

  // R7KIT.1 (REQ-KIT-1) — the assertions below fail if any control class, state or scheme rule
  // is removed from the emitted stylesheet.
  it("declares color-scheme per theme: dark default, light opt-in (Auto resolves onto them)", () => {
    expect(css).toContain(":root {\n  color-scheme: dark;");
    expect(css).toContain('[data-theme="light"] {\n  color-scheme: light;');
    // the sheet's UA widgets follow the PAPER theme (incl. the pinned pairings)
    for (const rule of [
      ".paper { color-scheme: dark; }",
      '[data-theme="light"] .paper { color-scheme: light; }',
      '[data-paper="light"] .paper { color-scheme: light; }',
      '[data-paper="dark"] .paper { color-scheme: dark; }',
    ]) {
      expect(css, rule).toContain(rule);
    }
  });
  it("emits the --fs-* scale and the --radius-pill step", () => {
    for (const name of Object.keys(FONT_SIZE)) {
      expect(css, name).toContain(`${name}: ${FONT_SIZE[name]}px;`);
    }
    expect(css).toContain("--radius-pill: 999px;");
  });
  it("emits the diff + ok colour tokens in both themes and under [data-paper] pinning", () => {
    expect(css).toContain(`--paper-diff-add: ${DARK_VARS["--paper-diff-add"]};`);
    expect(css).toContain(`--paper-diff-del: ${DARK_VARS["--paper-diff-del"]};`);
    expect(css).toContain(`--paper-diff-add: ${LIGHT_VARS["--paper-diff-add"]};`);
    expect(css).toContain(`--paper-diff-del: ${LIGHT_VARS["--paper-diff-del"]};`);
    expect(css).toContain(`--state-ok: ${DARK_VARS["--state-ok"]};`);
    expect(css).toContain(`--state-ok: ${LIGHT_VARS["--state-ok"]};`);
  });
  it("carries a base rule for EVERY REQ-KIT-1 control class", () => {
    // the shared box rule covers button/select/textarea + every non-check input
    expect(css).toContain(
      "button, select, textarea, input:where(:not([type='checkbox']):not([type='radio'])) {",
    );
    expect(css).toContain("input:where([type='checkbox'], [type='radio']) {");
    expect(css).toContain("input[type='file']::file-selector-button {");
  });
  it("carries every REQ-KIT-1 control state: hover, active, disabled, focus-visible, invalid", () => {
    for (const sel of [
      "button:where(:not(:disabled)):hover",
      "input:where(:not(:disabled)):hover",
      "select:where(:not(:disabled)):hover",
      "textarea:where(:not(:disabled)):hover",
      "button:where(:not(:disabled)):active",
      "input:where(:not(:disabled)):active",
      "select:where(:not(:disabled)):active",
      "button:disabled",
      "input:disabled",
      "select:disabled",
      "textarea:disabled",
      "button:focus-visible",
      "input:focus-visible",
      "select:focus-visible",
      "textarea:focus-visible",
      "input:invalid",
      "select:invalid",
      "textarea:invalid",
    ]) {
      expect(css, sel).toContain(sel);
    }
  });
  it("the control layer stays element-level — no IDE-class selectors leak into themeCss (specificity contract)", () => {
    // The contract (ticket Notes): the base rules must LOSE to ide-css's `.ide-*` region rules and
    // to inline styles. `:where()` wrapping keeps every state rule at element specificity.
    expect(css).not.toMatch(/\.ide-[a-z-]+ (button|input|select|textarea)/);
    expect(css).not.toMatch(/!important[^}]*border|border[^}]*!important/);
  });
});

describe("ideCss()", () => {
  const css = ideCss();
  it("lays out the §5.1/ADR-128 regions (page|margin|panel|statusbar; rail+files deleted by R7SHELL.2)", () => {
    const css = ideCss();
    for (const region of [".ide-page", ".ide-margin", ".ide-panel", ".ide-statusbar"]) {
      expect(css, region).toContain(region);
    }
    // R7PANE.1 — the bottom Desk is retired: no desk rules remain.
    expect(css).not.toContain(".ide-desk");
    // R7SHELL.2 — the icon rail and the Files strip are DELETED (not hidden): a reintroduced
    // rule fails here (the acceptance criterion's removal-catching test).
    expect(css).not.toContain(".ide-rail");
    expect(css).not.toContain(".ide-files");
    expect(css).not.toContain("data-files");
  });
  it("encodes the yield-order breakpoints from LAYOUT (no magic numbers)", () => {
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
  it("R7FIX.7 (F-R7DEP.2-11) — a closed off-canvas drawer exposes no visible/focusable links", () => {
    // translateX(-100%) alone kept the drawer's anchors Playwright-visible + keyboard-focusable
    // while invisible (the P1.* legs timed out clicking the parked first recent). `visibility`
    // joins the slide in BOTH drawer blocks, flipping instantly on open and delayed on close.
    const blocks = css.match(/\.app-shell-sidebar \{ position: fixed[^}]+\}/g) ?? [];
    expect(blocks.length).toBeGreaterThanOrEqual(2);
    for (const b of blocks) {
      expect(b).toContain("transform: translateX(-100%)");
      expect(b).toContain("visibility: hidden");
    }
    expect(css).toContain("[data-drawer='open'] .app-shell-sidebar { transform: none; visibility: visible");
  });
  it("R7PANE.1 — the desk/status-bar collision is gone WITH the drawer (B2/B16)", () => {
    const css = ideCss();
    // the B2 fix was the drawer's last defect; the region that owned it is retired.
    expect(css).not.toContain("ide-desk-head");
    // the panel's head is plain in-flow chrome — the status bar never overlaps it.
    expect(css).toContain(".ide-statusbar");
    expect(css).toContain(".ide-panel .ide-panel-head");
  });
  // R7FIX.8 (F-R7DEP.3-1) — the focus-exit pill's hide rule must OUT-SPECIFY the primitive's
  // `.ui-btn { display: inline-flex }`: the bare `.ide-focus-exit` selector tied on specificity
  // and lost on source order, leaving the invisible fixed button a live hit-box at top-centre in
  // every view (the P1.pill 1440×900 overlap: `sync pill covers text … "Exit focus · Esc"`).
  // The `.ide`-scoped selector restores the authored gate; the focus-view reveal keeps its
  // higher specificity, and no bare `.ide-focus-exit {` selector may lead a rule again.
  it("R7FIX.8 — the focus-exit hide rule wins the cascade over .ui-btn (F-R7DEP.3-1)", () => {
    const css = ideCss();
    expect(css).toContain(".ide .ide-focus-exit { display: none;");
    expect(css).toContain(".ide[data-view='focus'] .ide-focus-exit { display: inline-flex;");
    expect(css).not.toMatch(/(^|\n)\s*\.ide-focus-exit \{/);
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
