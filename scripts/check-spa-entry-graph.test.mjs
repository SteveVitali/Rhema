import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  checkSpaEntryGraph,
  deniedSourcesInMap,
  evaluateEntryGraph,
  radixPackageOf,
  radixPackagesInMap,
} from "./check-spa-entry-graph.mjs";

// REQ-KIT-5 (225_R7KIT.2) — the entry-graph guard: a planted `@radix-ui/react-dialog` source in an
// entry chunk's sourcemap MUST fail; only Tooltip and DropdownMenu are allowlisted; the guard keys
// on package paths so 225a's wrappers (Select/Popover/ContextMenu/Tabs/…) are already covered.

const DIALOG_SRC =
  "../../node_modules/.pnpm/@radix-ui+react-dialog@1.3.1/node_modules/@radix-ui/react-dialog/dist/index.mjs";
const TOOLTIP_SRC =
  "../../node_modules/.pnpm/@radix-ui+react-tooltip@1.4.1/node_modules/@radix-ui/react-tooltip/dist/index.js";
const CMDK_SRC =
  "../../node_modules/.pnpm/cmdk@1.1.1/node_modules/cmdk/dist/index.mjs";
const PALETTE_SRC = "../../apps/web/src/spa/palette.tsx";
const POPPER_SRC =
  "../../node_modules/.pnpm/@radix-ui+react-popper@1.4.0/node_modules/@radix-ui/react-popper/dist/index.mjs";

const manifest = {
  "src/spa/main.tsx": {
    file: "assets/main.js",
    isEntry: true,
    imports: ["_shared.js"],
    dynamicImports: ["src/spa/routes/x.tsx?tsr-split=component"],
  },
  "_shared.js": { file: "assets/shared.js" },
  "src/spa/routes/x.tsx?tsr-split=component": {
    file: "assets/x.js",
    isDynamicEntry: true,
  },
};

describe("radixPackageOf / radixPackagesInMap", () => {
  it("extracts the package from pnpm and bare node_modules paths", () => {
    expect(radixPackageOf(DIALOG_SRC)).toBe("react-dialog");
    expect(radixPackageOf("node_modules/@radix-ui/react-select/dist/index.js")).toBe(
      "react-select",
    );
    expect(radixPackageOf("../../src/spa/main.tsx")).toBeNull();
    expect(radixPackagesInMap({ sources: [DIALOG_SRC, TOOLTIP_SRC, "x.ts"] })).toEqual(
      new Set(["react-dialog", "react-tooltip"]),
    );
  });
});

describe("evaluateEntryGraph (REQ-KIT-5)", () => {
  const readMap = (maps) => (file) => maps[file] ?? null;

  it("FAILS on a planted react-dialog source in an entry chunk (the engineered AC)", () => {
    const r = evaluateEntryGraph(
      manifest,
      readMap({
        "assets/main.js": { sources: [DIALOG_SRC, "../../src/spa/main.tsx"] },
        "assets/shared.js": { sources: ["../../src/lib.ts"] },
      }),
    );
    expect(r.ok).toBe(false);
    expect(r.violations.join("\n")).toMatch(/@radix-ui\/react-dialog reaches the SPA entry graph/);
    expect(r.violations.join("\n")).toMatch(/leaf-chunk it/);
  });

  it("passes when only the allowlisted primitives (tooltip + dropdown-menu) reach the entry", () => {
    const r = evaluateEntryGraph(
      manifest,
      readMap({
        "assets/main.js": { sources: [TOOLTIP_SRC] },
        "assets/shared.js": {
          sources: [
            "../../node_modules/.pnpm/@radix-ui+react-dropdown-menu@2.2.1/node_modules/@radix-ui/react-dropdown-menu/dist/index.mjs",
          ],
        },
      }),
    );
    expect(r.ok).toBe(true);
    expect(r.violations).toEqual([]);
  });

  it("covers 225a's wrappers already — select/context-menu/popover/tabs/checkbox/radio-group/switch fail", () => {
    for (const pkg of [
      "react-select",
      "react-context-menu",
      "react-popover",
      "react-tabs",
      "react-checkbox",
      "react-radio-group",
      "react-switch",
    ]) {
      const r = evaluateEntryGraph(
        manifest,
        readMap({
          "assets/main.js": { sources: [`node_modules/@radix-ui/${pkg}/dist/index.js`] },
          "assets/shared.js": { sources: [] },
        }),
      );
      expect(r.ok).toBe(false);
      expect(r.violations.join("\n")).toContain(`@radix-ui/${pkg}`);
    }
  });

  it("shared internals (react-popper et al.) are exempt — the allowed parents legitimately pull them in", () => {
    const r = evaluateEntryGraph(
      manifest,
      readMap({ "assets/main.js": { sources: [POPPER_SRC] }, "assets/shared.js": { sources: [] } }),
    );
    expect(r.ok).toBe(true);
  });

  it("R7SHELL.1c — cmdk + the palette module in an entry chunk's map FAILS (the lazy-chunk AC)", () => {
    const r = evaluateEntryGraph(
      manifest,
      readMap({
        "assets/main.js": { sources: ["../../src/spa/main.tsx"] },
        "assets/shared.js": { sources: [CMDK_SRC, "../../src/lib.ts"] },
      }),
    );
    expect(r.ok).toBe(false);
    expect(r.violations.join("\n")).toMatch(/cmdk/);
    expect(deniedSourcesInMap({ sources: [CMDK_SRC, PALETTE_SRC] })).toEqual(
      new Set(["cmdk", "spa/palette (the lazy ⌘K palette chunk)"]),
    );
    // denied-sources detection is map-level only — the guard itself walks entry chunks,
    // so the identical sources inside a lazy chunk stay unflagged (the fixture test proves it).
  });

  it("fails closed when an entry chunk's sourcemap is missing", () => {
    const r = evaluateEntryGraph(manifest, readMap({}));
    expect(r.ok).toBe(false);
    expect(r.violations.join("\n")).toMatch(/no readable sourcemap/);
  });
});

describe("checkSpaEntryGraph over a fixture build", () => {
  it("reads the real manifest + maps under --out and passes a clean build", () => {
    const dir = mkdtempSync(join(tmpdir(), "spa-entry-"));
    mkdirSync(join(dir, ".vite"), { recursive: true });
    mkdirSync(join(dir, "assets"), { recursive: true });
    writeFileSync(join(dir, ".vite", "manifest.json"), JSON.stringify(manifest));
    writeFileSync(join(dir, "assets", "main.js"), "x");
    writeFileSync(join(dir, "assets", "main.js.map"), JSON.stringify({ sources: [TOOLTIP_SRC] }));
    writeFileSync(join(dir, "assets", "shared.js"), "x");
    writeFileSync(join(dir, "assets", "shared.js.map"), JSON.stringify({ sources: [] }));
    writeFileSync(join(dir, "assets", "x.js"), "x");
    writeFileSync(join(dir, "assets", "x.js.map"), JSON.stringify({ sources: [DIALOG_SRC] }));
    // dialog in a LAZY chunk (isDynamicEntry) is fine — the guard only walks the entry graph.
    const r = checkSpaEntryGraph(dir);
    expect(r.ok).toBe(true);
  });

  it("fails closed with no manifest", () => {
    const dir = mkdtempSync(join(tmpdir(), "spa-entry-empty-"));
    const r = checkSpaEntryGraph(dir);
    expect(r.ok).toBe(false);
    expect(r.violations[0]).toMatch(/fail-closed/);
  });
});
