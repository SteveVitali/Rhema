import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import {
  checkSpaBudget,
  classifyAsyncChunk,
  entryGraphFiles,
  evaluateSpaBudget,
} from "./check-spa-budget.mjs";

// SPA.1 / REQ-SAFE-7 — the bundle-budget gate is a hard fail, so its own behavior is pinned: an
// oversized entry graph MUST fail (the ticket's engineered AC), group classification must route
// CodeMirror/editor chunks to their tighter ceilings, and a missing manifest fails closed.

const BUDGET = {
  ceilings: {
    entryGzipBytes: 256000,
    editorLazyGzipBytes: 409600,
    codemirrorGzipBytes: 133120,
    otherAsyncGzipBytes: 153600,
    totalJsGzipBytes: 819200,
    totalCssGzipBytes: 61440,
  },
  groups: {
    codemirror: ["codemirror"],
    editor: ["editor", "prosemirror", "yjs", "hocuspocus"],
  },
};

// (fileURLToPath — the checkout path contains a non-ASCII char; URL.pathname would percent-encode it)
const BUDGET_PATH = fileURLToPath(new URL("../apps/web/spa-budget.json", import.meta.url));

// randomBytes compress ~0% — a reliable synthetic size for the oversized-file legs.
const blob = (bytes) => randomBytes(bytes);

function writeFixture(files) {
  const dir = mkdtempSync(join(tmpdir(), "spa-budget-"));
  mkdirSync(join(dir, ".vite"), { recursive: true });
  mkdirSync(join(dir, "assets"), { recursive: true });
  for (const [name, bytes] of Object.entries(files)) {
    writeFileSync(join(dir, name), blob(bytes));
  }
  return dir;
}

function writeManifest(dir, manifest) {
  writeFileSync(join(dir, ".vite", "manifest.json"), JSON.stringify(manifest));
}

const baseManifest = {
  "src/spa/main.tsx": {
    file: "assets/main-abc.js",
    src: "src/spa/main.tsx",
    isEntry: true,
    dynamicImports: ["src/spa/routes/index.tsx?tsr-split=component"],
  },
  "src/spa/routes/index.tsx?tsr-split=component": {
    file: "assets/routes-def.js",
    src: "src/spa/routes/index.tsx?tsr-split=component",
    isDynamicEntry: true,
  },
};

describe("check:spa-budget (REQ-SAFE-7)", () => {
  it("passes a small real-shaped build", () => {
    const dir = writeFixture({
      "assets/main-abc.js": 95_000,
      "assets/routes-def.js": 60,
      "assets/main-abc.js.map": 9_000_000, // maps are provenance — never measured
    });
    writeManifest(dir, baseManifest);
    const r = checkSpaBudget(dir, BUDGET_PATH);
    expect(r.ok).toBe(true);
    expect(r.violations).toEqual([]);
  });

  it("FAILS on a synthetic oversized entry (the engineered AC)", () => {
    const dir = writeFixture({ "assets/main-abc.js": 260_000, "assets/routes-def.js": 60 });
    writeManifest(dir, baseManifest);
    const r = checkSpaBudget(dir, BUDGET_PATH);
    expect(r.ok).toBe(false);
    expect(r.violations.join("\n")).toMatch(/entry graph .* > 250\.0 kB/);
  });

  it("fails closed when the manifest/output is absent", () => {
    const dir = mkdtempSync(join(tmpdir(), "spa-budget-empty-"));
    const r = checkSpaBudget(dir, BUDGET_PATH);
    expect(r.ok).toBe(false);
    expect(r.violations[0]).toMatch(/fail-closed/);
  });

  it("a 200 kB 'codemirror' chunk passes the 130 kB ceiling? No — group ceilings bind", () => {
    const dir = writeFixture({
      "assets/main-abc.js": 95_000,
      "assets/codemirror-xyz.js": 200_000,
    });
    writeManifest(dir, baseManifest);
    const r = checkSpaBudget(dir, BUDGET_PATH);
    expect(r.ok).toBe(false);
    expect(r.violations.join("\n")).toMatch(/CodeMirror chunk\(s\)/);
  });

  it("a 200 kB editor-group chunk passes (≤400 kB) but a 160 kB ungrouped async chunk fails", () => {
    const okDir = writeFixture({
      "assets/main-abc.js": 95_000,
      "assets/editor-prosemirror-1.js": 200_000,
    });
    writeManifest(okDir, baseManifest);
    expect(checkSpaBudget(okDir, BUDGET_PATH).ok).toBe(true);

    const badDir = writeFixture({
      "assets/main-abc.js": 95_000,
      "assets/review-1.js": 160_000, // no group match → other-async ≤150 kB
    });
    writeManifest(badDir, baseManifest);
    const r = checkSpaBudget(badDir, BUDGET_PATH);
    expect(r.ok).toBe(false);
    expect(r.violations.join("\n")).toMatch(/other-async ceiling/);
  });

  it("total-JS ceiling binds even when every chunk is individually legal", () => {
    const files = { "assets/main-abc.js": 100_000 };
    const manifest = { ...baseManifest };
    for (let i = 0; i < 6; i++) {
      files[`assets/route-${i}.js`] = 130_000; // 6×130 kB async = 780 kB + 100 kB entry = 880 kB > 800 kB
      manifest[`src/spa/routes/r${i}.tsx?tsr-split=component`] = {
        file: `assets/route-${i}.js`,
        isDynamicEntry: true,
      };
    }
    const dir = writeFixture(files);
    writeManifest(dir, manifest);
    const r = checkSpaBudget(dir, BUDGET_PATH);
    expect(r.ok).toBe(false);
    expect(r.violations.join("\n")).toMatch(/total JS/);
  });
});

describe("entryGraphFiles / classifyAsyncChunk", () => {
  it("pulls the entry's transitive static imports but never dynamicImports", () => {
    const manifest = {
      "src/spa/main.tsx": { file: "assets/main.js", isEntry: true, imports: ["_shared.js"], dynamicImports: ["src/spa/routes/x.tsx?tsr-split=component"] },
      "_shared.js": { file: "assets/shared.js", imports: ["_deep.js"] },
      "_deep.js": { file: "assets/deep.js" },
      "src/spa/routes/x.tsx?tsr-split=component": { file: "assets/x.js", isDynamicEntry: true },
    };
    const { entryFiles, error } = entryGraphFiles(manifest);
    expect(error).toBeUndefined();
    expect([...entryFiles].sort()).toEqual(["assets/deep.js", "assets/main.js", "assets/shared.js"]);
  });

  it("no isEntry record → the caller fails closed", () => {
    const { entryFiles, error } = entryGraphFiles({ "a.js": { file: "a.js" } });
    expect(entryFiles.size).toBe(0);
    expect(error).toMatch(/isEntry/);
  });

  it("classifies by manifest key OR file name; codemirror beats editor", () => {
    expect(classifyAsyncChunk("assets/codemirror-heavy-1.js", BUDGET)).toBe("codemirror");
    expect(classifyAsyncChunk("src/spa/editor.tsx?tsr-split=component", BUDGET)).toBe("editor");
    expect(classifyAsyncChunk("assets/settings-1.js", BUDGET)).toBe("other");
    expect(classifyAsyncChunk("codemirror editor yjs", BUDGET)).toBe("codemirror");
  });
});
