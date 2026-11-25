// @vitest-environment happy-dom
//
// 327_R7UX.4 (BL-95; RV-36) — the landing FAQ's styled disclosure marker proves the
// no-JS contract as a DOM fact, not a string: every `data-faq-item` is a real
// HTMLDetailsElement whose <summary> carries the Accordion's own chevron, and the
// item opens natively (the [open] attribute the themeCss rotate rule keys on) with
// zero script involvement — no aria-expanded, no click handler, no role button.

import { describe, expect, it } from "vitest";
import { themeCss } from "@rhema/tokens";
import { renderToStaticMarkup } from "react-dom/server";
import { LandingPage } from "./marketing.js";
import { PageDataContext } from "./page-data.js";

function mount(): HTMLDetailsElement[] {
  const html = renderToStaticMarkup(
    <PageDataContext.Provider value={{}}>
      <LandingPage />
    </PageDataContext.Provider>,
  );
  const host = document.createElement("div");
  host.innerHTML = html;
  document.body.appendChild(host);
  return [...host.querySelectorAll<HTMLDetailsElement>("[data-faq-item]")];
}

describe("the landing FAQ's styled disclosure (BL-95; RV-36)", () => {
  it("every item is a native <details> whose summary carries the accordion chevron — no JS control", () => {
    const items = mount();
    expect(items.length).toBeGreaterThan(0);
    for (const item of items) {
      expect(item.tagName).toBe("DETAILS");
      // no JS dependency vocabulary anywhere on the control
      expect(item.getAttribute("role")).toBeNull();
      expect(item.getAttribute("aria-expanded")).toBeNull();
      const summary = item.querySelector("summary.ui-accordion-trigger");
      expect(summary).not.toBeNull();
      expect(summary!.tagName).toBe("SUMMARY");
      // the styled marker is the Accordion primitive's own chevron class
      const chevron = summary!.querySelector("svg.ui-accordion-chevron");
      expect(chevron).not.toBeNull();
      expect(chevron!.getAttribute("aria-hidden")).toBe("true");
    }
  });

  it("opens natively without JS — [open] is the only state the rotate rule needs", () => {
    const item = mount()[0]!;
    expect(item.open).toBe(false);
    expect(item.hasAttribute("open")).toBe(false);
    // the native toggle is the entire mechanism — the chevron arm keys on the attribute
    item.open = true;
    expect(item.hasAttribute("open")).toBe(true);
    item.open = false;
    expect(item.hasAttribute("open")).toBe(false);
    // the served rule: [open] (never a JS-managed class) drives the chevron rotation
    expect(themeCss()).toContain(
      "details.ui-accordion-item[open] > summary.ui-accordion-trigger .ui-accordion-chevron",
    );
  });
});
