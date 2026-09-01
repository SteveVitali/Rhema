import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

// Closes the "and with it" half of AC1 (build with the private checkout present) at the resolution
// mechanism level, deterministically: it drives the real .pnpmfile.cjs readPackage hook against an
// on-disk private checkout and asserts @rhema/protocols is rewritten to link:<path> (REQ-ARCH-37).

const require = createRequire(import.meta.url);
const pnpmfilePath = resolve(process.cwd(), ".pnpmfile.cjs");

function loadFresh() {
  // .pnpmfile.cjs computes its overrides at load time from env, so reload per case.
  delete require.cache[require.resolve(pnpmfilePath)];
  return require(pnpmfilePath);
}

describe(".pnpmfile.cjs private-package resolution (REQ-ARCH-37; AC1 'with checkout')", () => {
  it("rewrites @rhema/protocols to link:<path> when RHEMA_PROTOCOLS_PATH is a real checkout", () => {
    const dir = mkdtempSync(join(tmpdir(), "rhema-protocols-"));
    writeFileSync(
      join(dir, "package.json"),
      JSON.stringify({ name: "@rhema/protocols", version: "1.0.0" }),
    );
    process.env.RHEMA_PROTOCOLS_PATH = dir;
    try {
      const { hooks } = loadFresh();
      const pkg = hooks.readPackage({
        name: "@rhema/api",
        dependencies: { "@rhema/protocols": "workspace:*", hono: "^4" },
      });
      expect(pkg.dependencies["@rhema/protocols"]).toBe(`link:${dir}`);
      expect(pkg.dependencies.hono).toBe("^4"); // unrelated deps untouched
    } finally {
      delete process.env.RHEMA_PROTOCOLS_PATH;
    }
  });

  it("leaves @rhema/protocols as the workspace stub with no private path (public clone)", () => {
    delete process.env.RHEMA_PROTOCOLS_PATH;
    const { hooks } = loadFresh();
    const pkg = hooks.readPackage({
      name: "@rhema/api",
      dependencies: { "@rhema/protocols": "workspace:*" },
    });
    expect(pkg.dependencies["@rhema/protocols"]).toBe("workspace:*");
  });

  it("ignores a RHEMA_PROTOCOLS_PATH that has no package.json", () => {
    process.env.RHEMA_PROTOCOLS_PATH = join(tmpdir(), `missing-${Date.now()}`);
    try {
      const { hooks } = loadFresh();
      const pkg = hooks.readPackage({
        name: "@rhema/api",
        dependencies: { "@rhema/protocols": "workspace:*" },
      });
      expect(pkg.dependencies["@rhema/protocols"]).toBe("workspace:*");
    } finally {
      delete process.env.RHEMA_PROTOCOLS_PATH;
    }
  });
});
