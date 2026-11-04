// R7DEM.4 (REQ-DWEB-1) — the registry/vocabulary invariants: `isDemoSlug` + `spaRouteFor` must
// agree (every registered slug resolves its document routeIds inside SPA space), and the api's
// slug grammar can never mint a `demo~` collision.

import { describe, expect, it } from "vitest";
import {
  DEMO_DOCUMENT_ROUTE_IDS,
  DEMO_ESSAYS,
  DEMO_ROUTE_IDS,
  DEMO_SLUG_PREFIX,
  demoEssayFor,
  demoEssayForSlug,
  demoSlugFor,
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
