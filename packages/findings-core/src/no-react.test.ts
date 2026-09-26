import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// AC1 (framework-free) — @rhema/findings-core MUST NOT import React (§10.2 REQ-MOBILE-4: the logic web and the
// 1.x mobile app share verbatim). The eslint `no-restricted-imports` override is the lint enforcement; this is
// the belt-and-suspenders source scan.

const here = dirname(fileURLToPath(import.meta.url));

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      out.push(...sourceFiles(join(dir, entry.name)));
    } else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) {
      out.push(join(dir, entry.name));
    }
  }
  return out;
}

describe("findings-core is framework-free (no React)", () => {
  it("no source file imports react or react-dom", () => {
    const offenders: string[] = [];
    for (const file of sourceFiles(here)) {
      const src = readFileSync(file, "utf8");
      if (/\bfrom\s+["']react(-dom)?["']/.test(src) || /require\(\s*["']react(-dom)?["']\s*\)/.test(src)) {
        offenders.push(file);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("declares no react dependency in package.json", () => {
    const pkg = JSON.parse(readFileSync(join(here, "..", "package.json"), "utf8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
      peerDependencies?: Record<string, string>;
    };
    const all = { ...pkg.dependencies, ...pkg.devDependencies, ...pkg.peerDependencies };
    expect(all["react"]).toBeUndefined();
    expect(all["react-dom"]).toBeUndefined();
  });
});
