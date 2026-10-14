// SPA.4 — `data-spa-boot` decode. The reader takes an injected `Document`-shaped seam so the
// contract is pinned without a DOM.

import { describe, expect, it } from "vitest";
import { isSpaEnabled, readSpaBoot, type SpaBoot } from "./boot.js";

function fakeDoc(json: string | null): Document {
  return {
    querySelector: (sel: string) =>
      sel === "script[data-spa-boot]" && json != null ? { textContent: json } : null,
  } as unknown as Document;
}

describe("readSpaBoot", () => {
  it("returns null when the embed is absent (fail-closed — every route hands back to SSR)", () => {
    expect(readSpaBoot(fakeDoc(null))).toBeNull();
  });

  it("returns null on malformed JSON — the embed is a seed, never trusted blindly", () => {
    expect(readSpaBoot(fakeDoc("{not json"))).toBeNull();
  });

  it("returns null on a non-object payload", () => {
    expect(readSpaBoot(fakeDoc("42"))).toBeNull();
  });

  it("decodes the wire shape — principal, theme, deviceClass, surfaces map, project slug", () => {
    const boot = readSpaBoot(
      fakeDoc(
        JSON.stringify({
          principal: { userId: "u1", workspaceId: "w1", billingAccountId: "b1" },
          theme: { appTheme: "dark", paperTheme: "light" },
          deviceClass: "phone",
          surfaces: { "/usage": "spa", "/app": "ssr" },
          project: { slug: "acme" },
        } satisfies SpaBoot),
      ),
    );
    expect(boot).not.toBeNull();
    expect(boot!.principal?.userId).toBe("u1");
    expect(boot!.theme.appTheme).toBe("dark");
    expect(boot!.theme.paperTheme).toBe("light");
    expect(boot!.deviceClass).toBe("phone");
    expect(boot!.surfaces["/usage"]).toBe("spa");
    expect(boot!.project?.slug).toBe("acme");
  });

  it("defaults a missing surfaces map to {} — nothing reads as enabled", () => {
    const boot = readSpaBoot(fakeDoc(JSON.stringify({ deviceClass: "desktop", theme: {} })));
    expect(boot?.surfaces).toEqual({});
  });

  it("drops a garbage deviceClass to desktop (the only other honest answer)", () => {
    const boot = readSpaBoot(fakeDoc(JSON.stringify({ deviceClass: "watch", surfaces: {}, theme: {} })));
    expect(boot?.deviceClass).toBe("desktop");
  });
});

describe("isSpaEnabled", () => {
  const boot: SpaBoot = {
    theme: {},
    deviceClass: "desktop",
    surfaces: { "/usage": "spa", "/app": "ssr" },
  };

  it("answers the effective verdict keyed by routeId", () => {
    expect(isSpaEnabled(boot, "/usage")).toBe(true);
    expect(isSpaEnabled(boot, "/app")).toBe(false);
  });

  it("an absent routeId or a null boot answers false — the flag set shrinks, never grows", () => {
    expect(isSpaEnabled(boot, "/billing/return")).toBe(false);
    expect(isSpaEnabled(boot, null)).toBe(false);
    expect(isSpaEnabled(null, "/usage")).toBe(false);
  });
});
