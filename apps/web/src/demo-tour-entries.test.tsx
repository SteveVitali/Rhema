// 222 R7DEM.6a (REQ-TOUR-4; S-14) — the three /demo entry points, all document navigations:
// the landing hero secondary CTA "See it on four real essays →", the /showcase link, and the
// shared footer link — each carrying `data-spa-native` + `data-demo-entry` and resolving to
// `/demo` verbatim (the SSR documents are native navigations by nature; the attribute is the
// contract the interceptor + the legs read).

import { describe, expect, it } from "vitest";
import { renderDocument } from "./render.js";
import { landingElement, showcaseElement, signupElement } from "./routes.js";
import { publicFooter } from "./legal.js";
import { COPY } from "./copy.js";

const ORIGIN = { origin: "https://rhema.tools" };

function entries(html: string): { attr: string; href: string; native: boolean }[] {
  return [...html.matchAll(/<a\b[^>]*data-demo-entry="([^"]+)"[^>]*>/g)].map((m) => {
    const tag = m[0];
    return {
      attr: m[1]!,
      href: /href="([^"]*)"/.exec(tag)?.[1] ?? "",
      native: /data-spa-native/.test(tag),
    };
  });
}

describe("REQ-TOUR-4 — the /demo entry points are document navigations", () => {
  it("the landing hero secondary CTA → /demo, data-spa-native", () => {
    const html = renderDocument("/", landingElement, {}, ORIGIN);
    const hit = entries(html).find((e) => e.attr === "landing");
    expect(hit).not.toBeUndefined();
    expect(hit!.href).toBe("/demo");
    expect(hit!.native).toBe(true);
    expect(html).toContain(COPY.landing.hero.demoCta);
  });

  it("the /showcase link → /demo, data-spa-native", () => {
    const html = renderDocument("/showcase", showcaseElement, {}, ORIGIN);
    const hit = entries(html).find((e) => e.attr === "showcase");
    expect(hit).not.toBeUndefined();
    expect(hit!.href).toBe("/demo");
    expect(hit!.native).toBe(true);
    expect(html).toContain(COPY.showcase.demoLink);
  });

  it("the shared footer link → /demo, data-spa-native, on every public SSR page", () => {
    for (const [path, el] of [
      ["/", landingElement],
      ["/showcase", showcaseElement],
      ["/signup", signupElement],
    ] as const) {
      const html = renderDocument(path, el, {}, ORIGIN);
      const hit = entries(html).find((e) => e.attr === "footer");
      expect(hit, `${path} footer`).not.toBeUndefined();
      expect(hit!.href).toBe("/demo");
      expect(hit!.native).toBe(true);
      expect(html).toContain(COPY.footerDemo);
    }
    // and the standalone footer partial carries it too.
    void publicFooter;
  });
});
