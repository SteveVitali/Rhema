import { describe, it, expect } from "vitest";
import {
  parseSpaSurfaces,
  SPA_SURFACES,
  SPA_IDE_FRAMED_SURFACES,
  SPA_RENDERER_HEADER,
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
