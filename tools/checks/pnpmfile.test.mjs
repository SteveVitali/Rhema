import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

// Drives the real .pnpmfile.cjs readPackage hook against an on-disk private EVALS checkout and asserts
// @rhema/evals is rewritten to link:<path> (REQ-ARCH-37). NOTE (2026-09-01): @rhema/protocols is now a
// committed workspace member, so it is NOT path-resolved and NOT rewritten by the hook — only @rhema/evals.

const require = createRequire(import.meta.url);
const pnpmfilePath = resolve(process.cwd(), ".pnpmfile.cjs");

function loadFresh() {
  // .pnpmfile.cjs computes its overrides at load time from env, so reload per case.
  delete require.cache[require.resolve(pnpmfilePath)];
  return require(pnpmfilePath);
}

describe(".pnpmfile.cjs private-package resolution (REQ-ARCH-37)", () => {
  it("rewrites @rhema/evals to link:<path> when RHEMA_EVALS_PATH is a real checkout", () => {
    const dir = mkdtempSync(join(tmpdir(), "rhema-evals-"));
    writeFileSync(
      join(dir, "package.json"),
      JSON.stringify({ name: "@rhema/evals", version: "1.0.0" }),
    );
    process.env.RHEMA_EVALS_PATH = dir;
    try {
      const { hooks } = loadFresh();
      const pkg = hooks.readPackage({
        name: "@rhema/measure",
        dependencies: { "@rhema/evals": "workspace:*", zod: "^3" },
      });
      expect(pkg.dependencies["@rhema/evals"]).toBe(`link:${dir}`);
      expect(pkg.dependencies.zod).toBe("^3"); // unrelated deps untouched
    } finally {
      delete process.env.RHEMA_EVALS_PATH;
    }
  });

  it("leaves @rhema/evals as the workspace stub with no private path (public clone)", () => {
    delete process.env.RHEMA_EVALS_PATH;
    const { hooks } = loadFresh();
    const pkg = hooks.readPackage({
      name: "@rhema/measure",
      dependencies: { "@rhema/evals": "workspace:*" },
    });
    expect(pkg.dependencies["@rhema/evals"]).toBe("workspace:*");
  });

  it("never rewrites @rhema/protocols — it is a committed member, not path-resolved", () => {
    const dir = mkdtempSync(join(tmpdir(), "rhema-protocols-"));
    writeFileSync(
      join(dir, "package.json"),
      JSON.stringify({ name: "@rhema/protocols", version: "1.0.0" }),
    );
    process.env.RHEMA_PROTOCOLS_PATH = dir; // even if set, the hook must ignore it now
    try {
      const { hooks } = loadFresh();
      const pkg = hooks.readPackage({
        name: "@rhema/engine",
        dependencies: { "@rhema/protocols": "workspace:*" },
      });
      expect(pkg.dependencies["@rhema/protocols"]).toBe("workspace:*");
    } finally {
      delete process.env.RHEMA_PROTOCOLS_PATH;
    }
  });

  it("ignores a RHEMA_EVALS_PATH that has no package.json", () => {
    process.env.RHEMA_EVALS_PATH = join(tmpdir(), `missing-${Date.now()}`);
    try {
      const { hooks } = loadFresh();
      const pkg = hooks.readPackage({
        name: "@rhema/measure",
        dependencies: { "@rhema/evals": "workspace:*" },
      });
      expect(pkg.dependencies["@rhema/evals"]).toBe("workspace:*");
    } finally {
      delete process.env.RHEMA_EVALS_PATH;
    }
  });
});
