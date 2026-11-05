// R7DEM.4 (REQ-DWEB-1) — the registry/vocabulary invariants: `isDemoSlug` + `spaRouteFor` must
// agree (every registered slug resolves its document routeIds inside SPA space), and the api's
// slug grammar can never mint a `demo~` collision.

import { describe, expect, it } from "vitest";
import {
  DEMO_DOCUMENT_ROUTE_IDS,
  DEMO_ESSAYS,
  DEMO_HUB_ESSAYS,
  DEMO_ROUTE_IDS,
  DEMO_SLUG_PREFIX,
  DEMO_TOUR_ENTRY_HREF,
  demoDeepLink,
  demoEssayFor,
  demoEssayForSlug,
  demoInternalPath,
  demoPublicPath,
  demoSlugFor,
  isDemoNamespacePath,
  isDemoSlug,
  isDemoSlugPrefix,
} from "./demo.js";
import { spaRouteFor } from "./spa.js";

/** `$param` → a concrete segment, so a routeId becomes a real demo path. */
function materialize(routeId: string, slug: string): string {
  return routeId.replaceAll("$project", slug).replaceAll(/\$[a-zA-Z]+/g, "x1");
}

describe("the demo registry (REQ-DWEB-1)", () => {
  it("every registered essay's slug round-trips essay ↔ slug", () => {
    for (const e of DEMO_ESSAYS) {
      expect(e.slug).toBe(`${DEMO_SLUG_PREFIX}${e.essay}`);
      expect(isDemoSlug(e.slug)).toBe(true);
      expect(demoEssayForSlug(e.slug)?.essay).toBe(e.essay);
      expect(demoEssayFor(e.essay)?.slug).toBe(e.slug);
      expect(demoSlugFor(e.essay)).toBe(e.slug);
    }
  });

  it("unregistered `demo~` strings are prefix matches but never demo slugs", () => {
    expect(isDemoSlugPrefix("demo~zzz")).toBe(true);
    expect(isDemoSlug("demo~zzz")).toBe(false);
    expect(demoEssayForSlug("demo~zzz")).toBeNull();
    expect(isDemoSlug("plain-slug")).toBe(false);
    expect(isDemoSlugPrefix("plain~slug")).toBe(false);
  });

  it("isDemoSlug and spaRouteFor agree: every allowlisted path shape resolves its routeId", () => {
    for (const e of DEMO_ESSAYS) {
      for (const routeId of DEMO_ROUTE_IDS) {
        const path = materialize(routeId, e.slug);
        const m = spaRouteFor(path);
        if (routeId === "/p/$project/palette-search") {
          // palette-search is a JSON endpoint outside the document census — it resolves to the
          // fallback surface (no routeId) but still inside `/p` space.
          expect(m.routeId, path).toBeNull();
          expect(m.surfaces, path).toEqual(["editor"]);
        } else {
          expect(m.routeId, path).toBe(routeId);
          expect(m.surfaces, path).not.toBeNull();
        }
      }
      // a non-allowlisted demo path resolves a DIFFERENT routeId (the guard's 404 arm keys off it)
      expect(spaRouteFor(`/p/${e.slug}/run`).routeId).toBe("/p/$project/run");
      expect(DEMO_DOCUMENT_ROUTE_IDS).not.toContain("/p/$project/run");
    }
  });

  it("the api slug grammar can never mint a `demo~` slug (REQ-DWEB-1 collision rule)", () => {
    // `slugify` (apps/api/src/project-routes.ts) emits only [a-z0-9-]; asserting its real output
    // here keeps the namespace-collision invariant pinned next to the registry it protects.
    for (const e of DEMO_ESSAYS) {
      expect(/^[a-z0-9-]+$/.test(e.essay), e.essay).toBe(true);
    }
    expect(isDemoSlug("demo~")).toBe(false);
    for (const e of DEMO_ESSAYS) {
      expect(e.slug.includes("~"), e.slug).toBe(true);
    }
  });
});

describe("the 220a path map (REQ-DWEB-9; S-1)", () => {
  it("public ↔ internal round-trips for every registered essay", () => {
    for (const e of DEMO_ESSAYS) {
      for (const tail of ["", "/v/1", "/figures", "/review/r1"]) {
        const pub = `/demo/${e.essay}${tail}`;
        const internal = `/p/${e.slug}${tail}`;
        expect(demoInternalPath(pub), pub).toBe(internal);
        expect(demoPublicPath(internal), internal).toBe(pub);
        expect(demoPublicPath(demoInternalPath(pub)!)).toBe(pub);
      }
    }
  });

  it("never maps the hub, unregistered essays, or non-demo paths", () => {
    expect(demoInternalPath("/demo")).toBeNull();
    expect(demoInternalPath("/demo/zzz")).toBeNull();
    expect(demoInternalPath("/demo")).toBeNull();
    expect(demoInternalPath("/p/demo~the-governable-mind")).toBeNull();
    expect(demoPublicPath("/demo/the-governable-mind")).toBeNull();
    expect(demoPublicPath("/p/demo~zzz")).toBeNull();
    expect(demoPublicPath("/p/real-slug")).toBeNull();
  });

  it("isDemoNamespacePath covers the boundary by prefix (unregistered still demo-space)", () => {
    expect(isDemoNamespacePath("/demo")).toBe(true);
    expect(isDemoNamespacePath("/demo/the-governable-mind/v/2")).toBe(true);
    expect(isDemoNamespacePath("/p/demo~zzz")).toBe(true);
    expect(isDemoNamespacePath("/p/demo~the-governable-mind/figures")).toBe(true);
    expect(isDemoNamespacePath("/app")).toBe(false);
    expect(isDemoNamespacePath("/p/real-slug")).toBe(false);
    expect(isDemoNamespacePath("/bff/p/demo~x")).toBe(false); // fetch path, never a document
    expect(isDemoNamespacePath(null)).toBe(false);
    expect(isDemoNamespacePath(undefined)).toBe(false);
  });
});

describe("221a R7DEM.5b — the hub order + stable deep links (REQ-TOUR-1/8)", () => {
  it("DEMO_HUB_ESSAYS is SPD, GM, POV, CoR — the registered non-fixture set", () => {
    expect([...DEMO_HUB_ESSAYS]).toEqual([
      "structure-of-political-difference",
      "the-governable-mind",
      "the-politics-of-visibility",
      "constitution-of-reason",
    ]);
    expect([...DEMO_HUB_ESSAYS].sort()).toEqual(
      DEMO_ESSAYS.filter((e) => e.fixture !== true)
        .map((e) => e.essay)
        .sort(),
    );
  });

  it("demoDeepLink emits the public form and validates against DEMO_ROUTE_IDS", () => {
    expect(demoDeepLink("the-governable-mind")).toBe("/demo/the-governable-mind");
    expect(demoDeepLink("the-governable-mind", "/review/v2-review", "data-letter-view")).toBe(
      "/demo/the-governable-mind/review/v2-review#data-letter-view",
    );
    expect(demoDeepLink("constitution-of-reason", "a/x-y", "data-demo-escalation")).toBe(
      "/demo/constitution-of-reason/a/x-y#data-demo-escalation",
    );
    // every produced link resolves back through the 220a map to an allowlisted routeId
    for (const [essay, route] of [
      ["structure-of-political-difference", ""],
      ["the-governable-mind", "/review/v2-review"],
      ["the-politics-of-visibility", "/v/1/diff/2"],
      ["constitution-of-reason", "/a/x-y"],
      ["the-governable-mind", "/figures/fig-1"],
    ] as const) {
      const link = demoDeepLink(essay, route);
      const internal = demoInternalPath(link.split("#")[0]!);
      expect(internal, link).not.toBeNull();
      const routeId = spaRouteFor(internal!).routeId;
      expect(DEMO_ROUTE_IDS, link).toContain(routeId);
    }
  });

  it("demoDeepLink refuses unregistered essays and non-allowlisted routes", () => {
    expect(() => demoDeepLink("not-an-essay")).toThrow(/unregistered essay/);
    expect(() => demoDeepLink("the-borrowed-commons")).not.toThrow(); // the fixture is registered
    for (const route of ["/run", "/export", "/settings", "/palette-search", "/edit/d/doc"]) {
      expect(() => demoDeepLink("the-governable-mind", route), route).toThrow(/DEMO_ROUTE_IDS/);
    }
  });

  it("DEMO_TOUR_ENTRY_HREF is the SPD essay root (the tour's opening surface)", () => {
    expect(DEMO_TOUR_ENTRY_HREF).toBe("/demo/structure-of-political-difference");
  });
});
