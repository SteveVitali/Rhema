import { describe, it, expect } from "vitest";
import { uiCss } from "./ui-css.js";
import { uiTailCss } from "./ui-tail-css.js";
import { LAYOUT, MOTION, RADIUS, FONT_SIZE } from "@rhema/tokens";

// R7KIT.2 (REQ-KIT-2/5; ADR-129) — the generated kit stylesheet: bounded raw bytes for the inlined
// shell documents, token-driven (no hex colour literals; light/dark resolve through the var layer),
// and the moved `primitives.tsx` exports' rules pinned at the SAME declaration values their inline
// styles carried — the rendered-behaviour-unchanged proof.

describe("uiCss() (REQ-KIT-2/5)", () => {
  const css = uiCss();

  it("stays under the 24 kB raw bound per shell document", () => {
    expect(css.length).toBeLessThanOrEqual(24 * 1024);
  });

  it("is generated from the tokens: var() driven, zero hex colour literals", () => {
    expect(css).toContain("var(--fs-");
    expect(css).toContain("var(--radius-");
    expect(css).toContain("var(--s");
    expect(css).toContain("var(--shell-");
    expect(css.match(/#[0-9a-fA-F]{3,8}\b/)).toBeNull();
    // The typed maps land too: the sheet width is LAYOUT.timelinePx; its slide is MOTION.paneMs.
    expect(css).toContain(`${LAYOUT.timelinePx}px`);
    expect(css).toContain(`${MOTION.paneMs}ms`);
    // Token values used in rules equal the token maps (radius-pill = 999, fs-micro = 12).
    expect(css).toContain("var(--radius-pill)");
    expect(RADIUS["--radius-pill"]).toBe(999);
    expect(FONT_SIZE["--fs-micro"]).toBe(12);
  });

  it("covers every primitive class family this ticket ships", () => {
    for (const cls of [
      ".ui-btn",
      ".ui-badge",
      ".ui-kbd",
      ".ui-skeleton",
      ".ui-pill",
      ".ui-chip",
      ".ui-fetch-chip",
      ".ui-action-link",
      ".ui-tooltip",
      ".ui-menu",
      ".ui-dialog",
      ".ui-sheet",
      ".ui-toast",
      ".ui-visually-hidden",
      // 225a_R7KIT.2b — the form/menu primitives.
      ".ui-icon",
      ".ui-popover",
      ".ui-select-",
      ".ui-tabs-",
      ".ui-checkbox",
      ".ui-radio-",
      ".ui-switch",
      ".ui-command-",
      ".ui-field",
      ".ui-empty",
      ".ui-accordion-",
    ]) {
      expect(css, cls).toContain(cls);
    }
  });

  it("keeps the static chip pointer-free (C6) — only the button variant gets cursor", () => {
    const chipRule = css.split("\n").find((r) => r.startsWith(".ui-chip {"))!;
    expect(chipRule).not.toContain("cursor");
    expect(css).toContain("button.ui-chip { cursor: pointer;");
  });

  it("moved-export rules keep the former inline declarations (rendered behaviour unchanged)", () => {
    // Pill: gap 6px · padding 2px 10px · radius 999 (→ --radius-pill) · fs 12 (→ --fs-micro) ·
    // tabular-nums · nowrap · dot 7px.
    expect(css).toContain(
      ".ui-pill { display: inline-flex; align-items: center; gap: 6px; padding: 2px 10px; border-radius: var(--radius-pill);",
    );
    expect(css).toContain(".ui-pill-dot { width: 7px; height: 7px;");
    // Chip / FetchedUrlChip: padding 1px 8px · radius 6px · fs 12.
    expect(css).toContain("padding: 1px 8px; border-radius: 6px;");
    // ActionLink: padding 6px 14px · radius 8 (→ --radius-2) · fs 13 (→ --fs-dense) · weight 600.
    expect(css).toContain(
      ".ui-action-link { display: inline-block; padding: 6px 14px; border-radius: var(--radius-2);",
    );
  });

  it("light and dark resolve through the token layer — no [data-theme] fork needed", () => {
    expect(css).not.toContain('data-theme="light"');
    expect(css).toContain("color-mix(in srgb, var(--shell-bg)");
  });
});

// 248a_R7KIT.3f — the migrate-tail block: the residual census' classes ride a SECOND bounded
// stylesheet so the REQ-KIT-5 uiCss() bound (24 kB, asserted) never moves without a ruling.
describe("uiTailCss() (248a_R7KIT.3f)", () => {
  const tail = uiTailCss();
  it("stays under its own 5 kB raw bound per shell document", () => {
    expect(tail.length).toBeLessThanOrEqual(5 * 1024);
  });
  it("is token-driven: zero hex colour literals", () => {
    expect(tail.match(/#[0-9a-fA-F]{3,8}\b/)).toBeNull();
  });
});
