import { describe, it, expect } from "vitest";
import {
  parseSpaSurfaces,
  spaRouteFor,
  SPA_SURFACES,
  SPA_IDE_FRAMED_SURFACES,
  SPA_RENDERER_HEADER,
  SPA_DOCUMENT_ROUTES,
  SPA_PREFIXES,
  type SpaSurface,
} from "./spa.js";

// SPA.2 — REQ-SEQ-1/2 (spec §11 + Appendix D; design/29 §flag-mechanism): the surface-flag
// vocabulary + the fail-closed CSV parse. The consult order itself is pinned in
// apps/web/src/spa-flag.test.ts.

describe("SPA_SURFACES vocabulary (REQ-SEQ-2; spec Appendix D)", () => {
  it("is exactly the 14 surface keys + the ide-chrome composite, in flip order", () => {
    expect([...SPA_SURFACES]).toEqual([
      "usage",
      "inbox",
      "settings",
      "voices",
      "onboarding",
      "project-home",
      "billing",
      "export",
      "outline",
      "figures",
      "run-sheet",
      "dossier",
      "run-report",
      "editor",
      "ide-chrome",
    ]);
    expect(new Set(SPA_SURFACES).size).toBe(SPA_SURFACES.length); // no dupes
  });

  it("names the IDE-framed keys (the ide-chrome AND-gate set); ide-chrome is not framed by itself", () => {
    expect([...SPA_IDE_FRAMED_SURFACES]).toEqual([
      "export",
      "dossier",
      "run-sheet",
      "run-report",
      "editor",
    ]);
    for (const k of SPA_IDE_FRAMED_SURFACES) {
      expect(SPA_SURFACES).toContain(k);
    }
    expect(SPA_IDE_FRAMED_SURFACES).not.toContain("ide-chrome");
    // onboarding's framing is per-ROUTE (only /p/:p/import* legs) — kept out of the key set.
    expect(SPA_IDE_FRAMED_SURFACES).not.toContain("onboarding");
  });

  it("pins the override channel name", () => {
    expect(SPA_RENDERER_HEADER).toBe("x-rhema-renderer");
  });
});

describe("parseSpaSurfaces (REQ-SEQ-1 — fail-closed, never throws)", () => {
  it("unset/empty ⇒ the empty set, no warn", () => {
    const warnings: string[] = [];
    const warn = (m: string) => warnings.push(m);
    for (const raw of [undefined, null, "", "   ", ",", " , , "]) {
      expect(parseSpaSurfaces(raw, warn).size, String(raw)).toBe(0);
    }
    expect(warnings).toHaveLength(0);
  });

  it("parses a CSV into the flag set; trims whitespace; dedupes", () => {
    const set = parseSpaSurfaces(" usage , inbox,, usage ", () => {
      throw new Error("no warn expected");
    });
    expect([...set].sort()).toEqual(["inbox", "usage"]);
  });

  it("a single key parses to a one-element set; the full vocabulary round-trips", () => {
    expect([...parseSpaSurfaces("editor", () => undefined)]).toEqual(["editor"]);
    const all = parseSpaSurfaces(SPA_SURFACES.join(","), () => {
      throw new Error("no warn expected");
    });
    expect(all.size).toBe(SPA_SURFACES.length);
    for (const k of SPA_SURFACES) expect(all.has(k)).toBe(true);
  });

  it("unknown tokens are dropped and reported in ONE warn line (the parse never fails open)", () => {
    const warnings: string[] = [];
    const set = parseSpaSurfaces("usage,bogus,,PROJECT-HOME,inbox,no-such", (m) =>
      warnings.push(m),
    );
    expect([...set].sort()).toEqual(["inbox", "usage"]); // keys are case-sensitive
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("bogus");
    expect(warnings[0]).toContain("PROJECT-HOME");
    expect(warnings[0]).toContain("no-such");
    expect(warnings[0]).toContain("SPA_SURFACES");
  });

  it("a fully-invalid value fails closed to ∅ (with the warn line), never throws", () => {
    const warnings: string[] = [];
    expect(parseSpaSurfaces("everything,on,please", (m) => warnings.push(m)).size).toBe(0);
    expect(warnings).toHaveLength(1);
  });

  it("returns a ReadonlySet typed over SpaSurface", () => {
    const set: ReadonlySet<SpaSurface> = parseSpaSurfaces("export,ide-chrome", () => undefined);
    expect(set.has("export" as SpaSurface)).toBe(true);
    expect(set.has("ide-chrome" as SpaSurface)).toBe(true);
    expect(set.has("editor" as SpaSurface)).toBe(false);
  });
});

// SPA.3 — REQ-BND-4/11 (design/26 §catch-all; design/29 §route-map): the path → route-id /
// surface-key map that drives `data-route`, the boot payload's `surfaces` map, and the catch-all
// split. These pins fail if a route's surface key changes or a server-owned GET leaks a key.
describe("spaRouteFor — the route → surface map (SPA.3; REQ-BND-4/11)", () => {
  it("resolves the normative design/29 route map verbatim (param shapes → $param route ids)", () => {
    const cases: [string, string, readonly string[]][] = [
      ["/app", "/app", ["project-home"]],
      ["/app/new", "/app/new", ["onboarding"]],
      ["/app/new/preview", "/app/new/preview", ["onboarding"]],
      ["/app/inbox", "/app/inbox", ["inbox"]],
      ["/usage", "/usage", ["usage"]],
      ["/billing/return", "/billing/return", ["billing"]],
      ["/app/settings/account", "/app/settings/account", ["settings"]],
      ["/app/settings/preferences", "/app/settings/preferences", ["settings"]],
      ["/app/settings/notifications", "/app/settings/notifications", ["settings"]],
      ["/app/settings/integrations", "/app/settings/integrations", ["settings"]],
      ["/app/settings/data", "/app/settings/data", ["settings"]],
      ["/app/settings/billing", "/app/settings/billing", ["billing"]],
      ["/settings/billing", "/settings/billing", ["billing"]],
      ["/voices", "/voices", ["voices"]],
      ["/voices/new", "/voices/new", ["voices"]],
      ["/v/per_1", "/v/$persona", ["voices"]],
      ["/p/acme", "/p/$project", ["editor"]],
      ["/p/acme/import", "/p/$project/import", ["onboarding", "ide-chrome"]],
      ["/p/acme/import/preview", "/p/$project/import/preview", ["onboarding", "ide-chrome"]],
      ["/p/acme/run", "/p/$project/run", ["run-sheet"]],
      ["/p/acme/review/run_1", "/p/$project/review/$runId", ["dossier"]],
      ["/p/acme/r/run_1", "/p/$project/r/$runId", ["run-report"]],
      ["/p/acme/revisions/c_1", "/p/$project/revisions/$cid", ["editor"]],
      ["/p/acme/v/working", "/p/$project/v/$v", ["editor"]],
      ["/p/acme/v/2/diff/1", "/p/$project/v/$n/diff/$m", ["editor"]],
      ["/p/acme/a/art_1", "/p/$project/a/$artifactId", ["editor"]],
      ["/p/acme/export", "/p/$project/export", ["export"]],
      ["/p/acme/outline", "/p/$project/outline", ["outline"]],
      ["/p/acme/outline/promote", "/p/$project/outline/promote", ["outline"]],
      ["/p/acme/figures", "/p/$project/figures", ["figures"]],
      ["/p/acme/figures/fig_1", "/p/$project/figures/$figureId", ["figures"]],
      ["/p/acme/visualize", "/p/$project/visualize", ["figures"]],
      ["/p/acme/obligations/new", "/p/$project/obligations/new", ["dossier"]],
      ["/p/acme/settings", "/p/$project/settings", ["settings"]],
      ["/p/acme/usage", "/p/$project/usage", ["usage"]],
      ["/p/acme/voice/reseed", "/p/$project/voice/reseed", ["voices"]],
    ];
    for (const [path, routeId, surfaces] of cases) {
      expect(spaRouteFor(path), path).toEqual({ routeId, surfaces });
    }
  });

  it("marks the server-owned redirect-only GETs null-surface — never SPA space (REQ-BND-3)", () => {
    for (const path of ["/settings", "/app/settings", "/app/usage/r/run_1", "/p/acme/edit/d_1", "/p/acme/f/fid_1"]) {
      const m = spaRouteFor(path);
      expect(m.surfaces, path).toBeNull();
      expect(m.routeId, path).not.toBeNull(); // the shape still names a route id for data-route
    }
  });

  it("marks the public documents null-surface — never SPA space (REQ-BND-5)", () => {
    for (const path of ["/", "/invite", "/pricing", "/signup", "/login", "/showcase"]) {
      const m = spaRouteFor(path);
      expect(m.surfaces, path).toBeNull();
      expect(m.routeId, path).toBe(path);
    }
  });

  it("non-document endpoints are outside SPA space entirely (routeId + surfaces both null)", () => {
    for (const path of ["/api/auth/x", "/api/x", "/assets/main.js", "/favicon.ico", "/healthz", "/session", "/p"]) {
      expect(spaRouteFor(path), path).toEqual({ routeId: null, surfaces: null });
    }
  });

  it("an unknown path under an SPA prefix resolves the prefix's surface owner (deep links)", () => {
    expect(spaRouteFor("/app/future-surface")).toEqual({ routeId: null, surfaces: ["project-home"] });
    expect(spaRouteFor("/app/settings/mystery")).toEqual({ routeId: null, surfaces: ["settings"] });
    expect(spaRouteFor("/app/settings/billing/x")).toEqual({ routeId: null, surfaces: ["billing"] });
    expect(spaRouteFor("/p/acme/future-route")).toEqual({ routeId: null, surfaces: ["editor"] });
    expect(spaRouteFor("/p/acme/review/run_1/extra")).toEqual({ routeId: null, surfaces: ["dossier"] });
    expect(spaRouteFor("/v/per_1/something")).toEqual({ routeId: null, surfaces: ["voices"] });
    expect(spaRouteFor("/usage/extra")).toEqual({ routeId: null, surfaces: ["usage"] });
  });

  it("trailing-slash normalization keeps the route shape (the catch-all and data-route agree)", () => {
    expect(spaRouteFor("/app/")).toEqual({ routeId: "/app", surfaces: ["project-home"] });
    expect(spaRouteFor("/p/acme/")).toEqual({ routeId: "/p/$project", surfaces: ["editor"] });
  });

  it("every SPA prefix resolves a surface for a deep link (design/26's prefix set)", () => {
    for (const p of SPA_PREFIXES) {
      expect(spaRouteFor(`${p}/x/y`).surfaces, p).not.toBeNull();
    }
  });

  it("the route enumeration is the full authenticated document set — no dupes, one entry each", () => {
    const ids = SPA_DOCUMENT_ROUTES.map((r) => r.routeId);
    expect(new Set(ids).size).toBe(ids.length);
    // The Page-mounting forced-SSR set is exactly the editor routes that mount the Page.
    const mounts = SPA_DOCUMENT_ROUTES.filter((r) => r.pageMount === true).map((r) => r.routeId);
    expect(mounts).toEqual([
      "/p/$project",
      "/p/$project/revisions/$cid",
      "/p/$project/v/$v",
      "/p/$project/v/$n/diff/$m",
      "/p/$project/a/$artifactId",
    ]);
    // every surfaces array references real keys (and import legs are the only AND-composites)
    for (const r of SPA_DOCUMENT_ROUTES) {
      for (const s of r.surfaces ?? []) expect(SPA_SURFACES).toContain(s);
      if (r.surfaces != null && r.surfaces.length > 1) {
        expect(r.surfaces).toEqual(["onboarding", "ide-chrome"]);
      }
    }
  });
});
