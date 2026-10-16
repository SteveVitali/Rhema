import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import { createSpaConsult, type SpaConsult } from "./spa-flag.js";
import { SPA_RENDERER_HEADER, type SpaSurface } from "@rhema/contracts";
import type { SessionHeaders } from "./data.js";

// SPA.2 — REQ-SEQ-1/4 + REQ-BND-11 (spec §4 fixed handler order; design/29 §flag-mechanism).
// The consult is exercised through a bare Hono probe route so every leg sees a real Context;
// createWebApp installs `deps.spa` from `spaSurfaces`/`spaOverrides` over the wrapped session
// seam (server.ts), so pinning THIS factory pins what every auth'd document handler consults.

const SIGNED_IN: SessionHeaders = { cookie: "__Host-rhema.session_token=tok.sig" };

function consult(opts: {
  surfaces?: Iterable<SpaSurface>;
  overrides?: boolean;
  session?: () => SessionHeaders | null;
}): SpaConsult {
  return createSpaConsult({
    surfaces: new Set(opts.surfaces ?? []),
    overrides: opts.overrides,
    session: opts.session ?? (() => SIGNED_IN),
  });
}

/** Mount `spa` on a probe route so the consult sees a real Hono Context (query + headers). */
function probe(spa: SpaConsult, surface: SpaSurface) {
  const app = new Hono();
  app.get("/doc", (c) => c.json({ spa: spa(c, surface) }));
  return async (path: string, headers: Record<string, string> = {}): Promise<boolean> => {
    const res = await app.request(path, { headers });
    return ((await res.json()) as { spa: boolean }).spa;
  };
}

describe("deps.spa — SPA.27 universal flag-on (the membership leg retired; REQ-SEQ-1/2 resolved)", () => {
  it("every surface key resolves true — the flag-on set IS the whole auth'd document set", async () => {
    // The deletion wave removed the SSR documents the membership leg chose between; `deps.spa`
    // remains only as the catch-all's shell-or-404 decision (and the Page family's forced-SSR arm
    // reads the SAME override signals via `ssrOverrideRequested`, not this consult).
    for (const opts of [{}, { surfaces: ["usage"] }, { surfaces: ["ide-chrome"] }] as const) {
      const spa = consult(opts);
      for (const surface of ["usage", "export", "editor", "ide-chrome", "onboarding", "inbox"] as const) {
        expect(await probe(spa, surface)("/doc")).toBe(true);
      }
    }
  });

  it("the composite AND-gate is vacuous — an IDE-framed key resolves without an ide-chrome flag", async () => {
    // REQ-SEQ-2's "surface flag AND ide-chrome" gate dissolved with the flag set: every framed key
    // is on because the whole framed set is on. Resurrecting membership would fail this.
    for (const key of ["export", "dossier", "run-sheet", "run-report", "editor"] as const) {
      expect(await probe(consult({}), key)("/doc")).toBe(true);
    }
  });
});

describe("deps.spa — renderer overrides (REQ-SEQ-4)", () => {
  it("?ssr=1 forces SSR on EVERY stage — overrides on or off, flagged or not", async () => {
    for (const overrides of [true, false]) {
      const spa = consult({ surfaces: ["usage"], overrides });
      expect(await probe(spa, "usage")("/doc?ssr=1")).toBe(false);
    }
    // even when a force-spa signal is also present, ssr wins (the escape hatch)
    const spa = consult({ surfaces: ["usage"], overrides: true });
    expect(
      await probe(spa, "usage")("/doc?ssr=1&renderer=spa", {
        [SPA_RENDERER_HEADER]: "spa",
      }),
    ).toBe(false);
  });

  it("x-rhema-renderer: ssr forces SSR on every stage", async () => {
    for (const overrides of [true, false]) {
      const spa = consult({ surfaces: ["usage"], overrides });
      expect(await probe(spa, "usage")("/doc", { [SPA_RENDERER_HEADER]: "ssr" })).toBe(false);
    }
  });

  it("?renderer=spa and x-rhema-renderer: spa are honored ONLY where SPA_OVERRIDES is set", async () => {
    const nonProd = consult({ overrides: true }); // flag ∅ — the override itself decides
    expect(await probe(nonProd, "usage")("/doc?renderer=spa")).toBe(true);
    expect(await probe(nonProd, "usage")("/doc", { [SPA_RENDERER_HEADER]: "spa" })).toBe(true);

    const prod = consult({ surfaces: ["usage"], overrides: false });
    // SPA.27 — on a no-overrides stage the force-spa signals are ignored AND membership is
    // universal, so every key resolves true either way (the override is no longer load-bearing).
    expect(await probe(prod, "usage")("/doc?renderer=spa")).toBe(true);
    expect(await probe(prod, "inbox")("/doc?renderer=spa")).toBe(true);
    expect(await probe(prod, "usage")("/doc", { [SPA_RENDERER_HEADER]: "spa" })).toBe(true);
    expect(await probe(prod, "inbox")("/doc", { [SPA_RENDERER_HEADER]: "spa" })).toBe(true);
  });

  it("an unrecognized renderer value falls through to the (now-universal) membership leg", async () => {
    const spa = consult({ surfaces: ["usage"], overrides: true });
    expect(await probe(spa, "usage")("/doc?renderer=banana")).toBe(true);
    expect(await probe(spa, "inbox")("/doc?renderer=banana")).toBe(true);
    expect(await probe(spa, "inbox")("/doc", { [SPA_RENDERER_HEADER]: "SSRish" })).toBe(true);
  });
});

describe("deps.spa — the session gate precedes the override precedes the flag", () => {
  it("a signed-out request can never reach the shell — overrides included", async () => {
    const signedOut = consult({ surfaces: ["usage"], overrides: true, session: () => null });
    expect(await probe(signedOut, "usage")("/doc")).toBe(false); // flag on, still false
    expect(await probe(signedOut, "usage")("/doc?renderer=spa")).toBe(false); // override refused
    expect(await probe(signedOut, "usage")("/doc", { [SPA_RENDERER_HEADER]: "spa" })).toBe(false);
  });
});
