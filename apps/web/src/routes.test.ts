import { describe, it, expect } from "vitest";
import { routes, matchAppRoute } from "./routes.js";

// AC5 — no public route exposes pricing, plans, or signup-without-invite (REQ-BETA-19). The beta is private
// and capped; the launch moment (landing, pricing) is reserved for the full IDE.

describe("route manifest (§4.2 / REQ-BETA-19)", () => {
  it("P1.17 — /pricing + /signup are the public §15 funnel; billing surfaces stay authed", () => {
    // §15.2's pricing page is public by spec — its figures derive from pricing.json server-side.
    // The billing surfaces (P1.16) remain auth-gated — plan management is never public.
    for (const r of routes) {
      if (/billing|settings/i.test(r.path)) expect(r.public).toBe(false);
    }
    expect(routes.find((r) => r.path === "/pricing")!.public).toBe(true);
    expect(routes.find((r) => r.path === "/signup")!.public).toBe(true);
  });

  it("only /, /invite, /pricing, /signup and /login are public; everything else is auth-gated", () => {
    const publicPaths = routes.filter((r) => r.public).map((r) => r.path).sort();
    expect(publicPaths).toEqual(["/", "/invite", "/login", "/pricing", "/signup"]);
    // the project surfaces are gated
    expect(routes.find((r) => r.path === "/app")!.public).toBe(false);
    expect(routes.find((r) => r.path === "/p/:project")!.public).toBe(false);
  });

  it("uses the canonical /p/:project shape and resolves the param", () => {
    const m = matchAppRoute("/p/the-politics-of-visibility");
    expect(m?.route.path).toBe("/p/:project");
    expect(m?.params.project).toBe("the-politics-of-visibility");
  });

  it("resolves the public pages and returns undefined for an unknown path", () => {
    expect(matchAppRoute("/")?.route.path).toBe("/");
    expect(matchAppRoute("/login")?.route.path).toBe("/login");
    expect(matchAppRoute("/pricing")?.route.path).toBe("/pricing");
    expect(matchAppRoute("/signup")?.route.path).toBe("/signup");
    expect(matchAppRoute("/definitely-not-a-page")).toBeUndefined();
  });
});
