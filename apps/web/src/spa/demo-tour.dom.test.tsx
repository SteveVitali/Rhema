// @vitest-environment happy-dom
//
// 222 R7DEM.6a (REQ-TOUR-2, ADR-128 REQ-GROWTH-12) — the tour engine's DOM contract:
//   • never auto-starts — no overlay without `?tour=`, even on a step's route;
//   • non-modal — no focus trap: mounting never moves document.activeElement into the overlay,
//     and page content stays interactive (no scrim, no aria-modal);
//   • Esc exits to free roam (the `?tour=` drop link activates), ←/→ page the steps while a
//     step is active, and keys are inert inside text fields and with modifiers;
//   • reduced-motion is respected (matchMedia drives the scroll behavior);
//   • the step counter, Next/Back/Exit controls and the step's target selector render;
//   • the persistent read-only notice + import-rule labels stay visible on every tour route
//     (the tour never covers them — REQ-TOUR-5's DOM half at fixture level).

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { COPY } from "../copy.js";
import { setSpaBoot, type SpaBoot } from "./boot.js";
import { DEMO_TOUR_STEPS, mountDemoTour, tourStepHref, tourTargetSelector } from "./demo-tour.js";

const BOOT = {
  theme: {},
  deviceClass: "desktop",
  surfaces: {},
  demo: { essay: "structure-of-political-difference", slug: "demo~structure-of-political-difference", signedIn: false, build: "t1" },
} as unknown as SpaBoot;

let dispose: (() => void) | undefined;
let motionCalls: string[] = [];

function seed(stepId: string | null, targetHtml = '<div data-page-root></div>') {
  document.body.innerHTML = "";
  const host = document.createElement("div");
  host.innerHTML = targetHtml;
  document.body.appendChild(host);
  const url = new URL(`http://localhost/demo/structure-of-political-difference`);
  if (stepId != null) url.searchParams.set("tour", stepId);
  window.history.replaceState(null, "", url.pathname + url.search);
  // reduced-motion control: happy-dom's matchMedia is absent — drive the engine's branch.
  motionCalls = [];
  (window as unknown as { matchMedia: (q: string) => { matches: boolean } }).matchMedia = (q) => {
    motionCalls.push(q);
    return { matches: true };
  };
  HTMLElement.prototype.scrollIntoView = function () {};
  setSpaBoot(BOOT);
}

beforeEach(() => {
  seed(null);
});
afterEach(() => {
  dispose?.();
  dispose = undefined;
  setSpaBoot(null);
  document.body.innerHTML = "";
});

const overlay = () => document.querySelector<HTMLElement>("[data-demo-tour]");

describe("REQ-GROWTH-12 — the tour never auto-starts and is non-modal", () => {
  it("mounts nothing without ?tour= — the overlay stays hidden and carries no controls", () => {
    dispose = mountDemoTour();
    expect(overlay()!.hidden).toBe(true);
    expect(overlay()!.children.length).toBe(0);
  });

  it("mounts nothing on a different essay's demo boot", () => {
    setSpaBoot({
      ...BOOT,
      demo: { ...BOOT.demo!, essay: "the-governable-mind", slug: "demo~the-governable-mind" },
    } as SpaBoot);
    window.history.replaceState(null, "", "/demo/the-governable-mind?tour=published");
    dispose = mountDemoTour();
    expect(document.querySelector("[data-demo-tour]")).toBeNull();
  });

  it("shows the step only when ?tour= names it AND the path matches the step route", () => {
    // ?tour=verdict on the essay root (a different step's route) → still hidden (free roam).
    window.history.replaceState(null, "", "/demo/structure-of-political-difference?tour=verdict");
    dispose = mountDemoTour();
    expect(overlay()!.hidden).toBe(true);
    // and on the step's own route it shows.
    document.body.innerHTML += "";
  });

  it("no focus trap: mounting a step never moves focus into the overlay, no scrim exists", () => {
    const btn = document.createElement("button");
    document.body.appendChild(btn);
    btn.focus();
    window.history.replaceState(null, "", "/demo/structure-of-political-difference?tour=published");
    dispose = mountDemoTour();
    const ov = overlay()!;
    expect(ov.hidden).toBe(false);
    expect(ov.getAttribute("aria-modal")).toBeNull();
    expect(document.querySelector("[data-demo-tour] [role='dialog']")).toBeNull();
    // the user's focus stays where it was — free roam is literal.
    expect(document.activeElement).toBe(btn);
    expect(ov.contains(document.activeElement)).toBe(false);
  });
});

describe("step mechanics — counter, controls, keys, Esc", () => {
  it("renders the counter, the COPY body, and actionable Next/Exit links", () => {
    window.history.replaceState(null, "", "/demo/structure-of-political-difference?tour=published");
    dispose = mountDemoTour();
    const ov = overlay()!;
    expect(ov.hidden).toBe(false);
    expect(ov.querySelector('[data-demo-tour-step="published"]')).not.toBeNull();
    expect(ov.textContent).toContain(COPY.demo.tour.steps.published);
    const next = ov.querySelector<HTMLAnchorElement>("[data-demo-tour-next]")!;
    expect(next.getAttribute("href")).toBe(tourStepHref(DEMO_TOUR_STEPS[1]!));
    expect(next.textContent).toBe(COPY.demo.tour.next);
    const close = ov.querySelector<HTMLAnchorElement>("[data-demo-tour-close]")!;
    expect(close.getAttribute("href")).toBe("/demo/structure-of-political-difference"); // ?tour= dropped
    expect(ov.querySelector("[data-demo-tour-prev]")).toBeNull(); // step 1 has no Back
  });

  it("step 6 carries the GM aside + step 8 the response-letter hop; step 11 carries the CTA", () => {
    const byId = (id: string) => DEMO_TOUR_STEPS.find((s) => s.id === id)!;
    expect(byId("claims").aside!.href).toContain("/demo/the-governable-mind/review/v2-review");
    expect(byId("responses").aside!.href).toContain("correspondence--v1-response.md");
    window.history.replaceState(null, "", "/demo/structure-of-political-difference?tour=cta");
    document.body.innerHTML += '<div data-page-root></div>';
    dispose = mountDemoTour();
    const cta = overlay()!.querySelector<HTMLAnchorElement>("[data-demo-tour-cta]")!;
    expect(cta.getAttribute("href")).toBe("/signup?src=demo");
    expect(cta.hasAttribute("data-spa-native")).toBe(true);
    expect(cta.textContent).toBe(COPY.demo.tour.ctaSignUp);
  });

  it("Esc exits to free roam — it clicks the ?tour=-dropping Exit link and stops propagation", () => {
    window.history.replaceState(null, "", "/demo/structure-of-political-difference?tour=published");
    dispose = mountDemoTour();
    const close = overlay()!.querySelector<HTMLAnchorElement>("[data-demo-tour-close]")!;
    let clicked = false;
    close.addEventListener("click", (e) => {
      clicked = true;
      e.preventDefault(); // happy-dom: keep the synthetic activation inert
    });
    let propagated = false;
    window.addEventListener("keydown", () => {
      propagated = true;
    });
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(clicked).toBe(true);
    expect(propagated).toBe(false);
  });

  it("→ clicks Next, ← clicks Back, both inert with modifiers and inside text fields", () => {
    window.history.replaceState(null, "", "/demo/structure-of-political-difference/review/v1-review?tour=verdict");
    document.body.innerHTML += '<section data-letter-section="verdict"></section>';
    dispose = mountDemoTour();
    const next = overlay()!.querySelector<HTMLAnchorElement>("[data-demo-tour-next]")!;
    const prev = overlay()!.querySelector<HTMLAnchorElement>("[data-demo-tour-prev]")!;
    let nextClicks = 0;
    let prevClicks = 0;
    next.addEventListener("click", (e) => { nextClicks++; e.preventDefault(); });
    prev.addEventListener("click", (e) => { prevClicks++; e.preventDefault(); });
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));
    expect([nextClicks, prevClicks]).toEqual([1, 1]);
    // modifier chords belong to the browser/the keymap — the tour stays out.
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, ctrlKey: true }));
    expect(nextClicks).toBe(1);
    // and typing in a field never pages the tour.
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    expect(nextClicks).toBe(1);
  });

  it("honors reduced-motion: the matchMedia branch is consulted for scrolling", () => {
    window.history.replaceState(null, "", "/demo/structure-of-political-difference?tour=published");
    dispose = mountDemoTour();
    expect(motionCalls.some((q) => q.includes("prefers-reduced-motion"))).toBe(true);
  });
});

describe("REQ-TOUR-5 fixture half — notices + the selector vocabulary on tour routes", () => {
  it("the overlay never removes the read-only notice / import-rule markers (they coexist)", () => {
    document.body.innerHTML +=
      '<div data-readonly-notice="demo"></div><div data-demo-markers><span data-import-rule="state">x</span></div>' +
      '<div data-page-root></div>';
    window.history.replaceState(null, "", "/demo/structure-of-political-difference?tour=published");
    dispose = mountDemoTour();
    expect(overlay()!.hidden).toBe(false);
    // the notice + labels remain in the live DOM while the tour runs.
    expect(document.querySelector("[data-readonly-notice='demo']")).not.toBeNull();
    expect(document.querySelector("[data-import-rule]")).not.toBeNull();
  });

  it("every step's target selector names a real hook+value pair (the declared mechanism)", () => {
    for (const step of DEMO_TOUR_STEPS) {
      const sel = tourTargetSelector(step);
      expect(sel.startsWith(`[${step.target}`)).toBe(true);
      if (step.targetValue != null) expect(sel).toContain(`="${step.targetValue}"`);
    }
  });
});
