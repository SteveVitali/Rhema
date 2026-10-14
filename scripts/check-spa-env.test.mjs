// Tests for scripts/check-spa-env.mjs — the emitted/source scan legs run against tempdir trees;
// banned-name derivation uses the real repo roots when present and a seeded fixture otherwise.
import { test, expect, describe } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  checkSpaEnv,
  collectBannedEnvNames,
  envReadsIn,
  viteSecretsIn,
} from "./check-spa-env.mjs";

function makeTree(files) {
  const dir = mkdtempSync(join(tmpdir(), "spa-env-"));
  for (const [rel, content] of Object.entries(files)) {
    const p = join(dir, rel);
    mkdirSync(join(p, ".."), { recursive: true });
    writeFileSync(p, content);
  }
  return dir;
}

describe("envReadsIn / viteSecretsIn", () => {
  test("extracts process.env names", () => {
    expect(envReadsIn("const x = process.env.DATABASE_URL; process.env.NODE_ENV;")).toEqual([
      "DATABASE_URL",
      "NODE_ENV",
    ]);
  });
  test("flags secret-shaped VITE_ names only", () => {
    expect(viteSecretsIn("VITE_APP_NAME VITE_API_KEY VITE_STRIPE_TOKEN")).toEqual([
      "VITE_API_KEY",
      "VITE_STRIPE_TOKEN",
    ]);
  });
});

describe("collectBannedEnvNames", () => {
  test("derives sensitive server env names from real first-party sources", () => {
    const { banned, derivedCount, floorOk } = collectBannedEnvNames();
    // The real repo ships these — if any of them disappear the tripwire is weakened and this test fails.
    for (const name of ["DATABASE_URL", "BETTER_AUTH_SECRET_NAME", "STRIPE_SECRET_KEY_NAME"]) {
      expect(banned.has(name), `missing ${name}`).toBe(true);
    }
    expect(derivedCount).toBeGreaterThanOrEqual(10);
    expect(floorOk).toBe(true);
    // Generic platform names stay allowed.
    expect(banned.has("NODE_ENV")).toBe(false);
  });
});

describe("checkSpaEnv", () => {
  const clean = () =>
    makeTree({
      "apps/web/src/spa/main.tsx": "export const a = 1;",
      "apps/web/src/client/api.ts": "export const b = 2;",
      "apps/web/vite.config.ts": "export default {};",
      "apps/web/public/spa/main-abc.js": "console.log('bundle');",
      "apps/api/src/server.ts": "process.env.DATABASE_URL; process.env.STRIPE_SECRET_KEY_NAME;",
    });

  test("clean tree passes", () => {
    const dir = clean();
    try {
      const r = checkSpaEnv(dir, { floor: 1 });
      expect(r.violations).toEqual([]);
      expect(r.ok).toBe(true);
      expect(r.stats.bannedNames).toBeGreaterThanOrEqual(40);
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  test("server env NAME inside an emitted bundle fails", () => {
    const dir = makeTree({
      "apps/web/src/spa/main.tsx": "export const a = 1;",
      "apps/web/src/client/api.ts": "export const b = 2;",
      "apps/web/public/spa/main-abc.js": 'const dsn = "DATABASE_URL";',
      "apps/api/src/server.ts": "process.env.DATABASE_URL;",
    });
    try {
      const r = checkSpaEnv(dir, { floor: 1 });
      expect(r.ok).toBe(false);
      expect(r.violations.some((v) => v.includes("DATABASE_URL"))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  test("process.env read inside a client artifact fails", () => {
    const dir = makeTree({
      "apps/web/src/spa/main.tsx": "export const a = 1;",
      "apps/web/src/client/api.ts": "export const b = 2;",
      "apps/web/public/spa/main-abc.js": "const x = process.env.WHATEVER_FLAG;",
      "apps/api/src/server.ts": "process.env.DATABASE_URL;",
    });
    try {
      const r = checkSpaEnv(dir, { floor: 1 });
      expect(r.ok).toBe(false);
      expect(r.violations.some((v) => v.includes("process.env.WHATEVER_FLAG"))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  test("generic env reads (NODE_ENV / FORCE_COLOR) in artifacts are allowed", () => {
    const dir = makeTree({
      "apps/web/src/spa/main.tsx": "export const a = 1;",
      "apps/web/src/client/api.ts": "export const b = 2;",
      "apps/web/public/spa/main-abc.js": "process.env.NODE_ENV; process.env.FORCE_COLOR;",
      "apps/api/src/server.ts": "process.env.DATABASE_URL;",
    });
    try {
      const r = checkSpaEnv(dir, { floor: 1 });
      expect(r.violations).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  test("VITE_API_KEY in a client source fails", () => {
    const dir = makeTree({
      "apps/web/src/spa/main.tsx": "export const k = import.meta.env.VITE_API_KEY;",
      "apps/web/src/client/api.ts": "export const b = 2;",
      "apps/web/public/spa/main-abc.js": "x",
      "apps/api/src/server.ts": "process.env.DATABASE_URL;",
    });
    try {
      const r = checkSpaEnv(dir, { floor: 1 });
      expect(r.ok).toBe(false);
      expect(r.violations.some((v) => v.includes("VITE_API_KEY"))).toBe(true);
      expect(r.violations.some((v) => v.includes("import.meta.env"))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  test("import.meta.env inside env.ts is allowed; outside it fails", () => {
    const dir = makeTree({
      "apps/web/src/spa/env.ts": "export const v = import.meta.env.MODE;",
      "apps/web/src/spa/main.tsx": "import { v } from './env.js'; export { v };",
      "apps/web/src/client/api.ts": "export const b = 2;",
      "apps/web/public/spa/main-abc.js": "x",
      "apps/api/src/server.ts": "process.env.DATABASE_URL;",
    });
    try {
      const r = checkSpaEnv(dir, { floor: 1 });
      expect(r.violations).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true });
    }
    const dir2 = makeTree({
      "apps/web/src/spa/env.ts": "export const v = import.meta.env.MODE;",
      "apps/web/src/spa/main.tsx": "export const m = import.meta.env.DEV;",
      "apps/web/src/client/api.ts": "export const b = 2;",
      "apps/web/public/spa/main-abc.js": "x",
      "apps/api/src/server.ts": "process.env.DATABASE_URL;",
    });
    try {
      const r = checkSpaEnv(dir2, { floor: 1 });
      expect(r.ok).toBe(false);
      expect(r.violations.some((v) => v.includes("import.meta.env"))).toBe(true);
    } finally {
      rmSync(dir2, { recursive: true });
    }
  });

  test("process.env in a client source fails", () => {
    const dir = makeTree({
      "apps/web/src/spa/main.tsx": "export const u = process.env.API_BASE_URL;",
      "apps/web/src/client/api.ts": "export const b = 2;",
      "apps/web/public/spa/main-abc.js": "x",
      "apps/api/src/server.ts": "process.env.DATABASE_URL;",
    });
    try {
      const r = checkSpaEnv(dir, { floor: 1 });
      expect(r.ok).toBe(false);
      expect(r.violations.some((v) => v.includes("process.env.API_BASE_URL"))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  test("secret-patterned process.env in vite.config fails", () => {
    const dir = makeTree({
      "apps/web/src/spa/main.tsx": "export const a = 1;",
      "apps/web/src/client/api.ts": "export const b = 2;",
      "apps/web/vite.config.ts": 'define: { "k": process.env.DATABASE_URL }',
      "apps/web/public/spa/main-abc.js": "x",
      "apps/api/src/server.ts": "process.env.DATABASE_URL;",
    });
    try {
      const r = checkSpaEnv(dir, { floor: 1 });
      expect(r.ok).toBe(false);
      expect(r.violations.some((v) => v.includes("vite.config.ts"))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  test("missing required SPA output fails closed", () => {
    const dir = makeTree({
      "apps/web/src/spa/main.tsx": "export const a = 1;",
      "apps/web/src/client/api.ts": "export const b = 2;",
      "apps/api/src/server.ts": "process.env.DATABASE_URL;",
    });
    try {
      const r = checkSpaEnv(dir, { floor: 1 });
      expect(r.ok).toBe(false);
      expect(r.violations.some((v) => v.includes("fail-closed"))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  test("VITE_* secret in a committed .env file fails", () => {
    const dir = makeTree({
      "apps/web/src/spa/main.tsx": "export const a = 1;",
      "apps/web/src/client/api.ts": "export const b = 2;",
      "apps/web/public/spa/main-abc.js": "x",
      "apps/api/src/server.ts": "process.env.DATABASE_URL;",
      ".env.production": "VITE_AUTH_TOKEN=abc",
    });
    try {
      const r = checkSpaEnv(dir, { floor: 1 });
      expect(r.ok).toBe(false);
      expect(r.violations.some((v) => v.includes("VITE_AUTH_TOKEN"))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  test("live repo tree passes the gate", () => {
    const r = checkSpaEnv();
    if (!existsSync("apps/web/public/spa")) {
      // Locally the SPA build may not have run — the live check is exercised in CI after the build.
      return;
    }
    expect(r.violations).toEqual([]);
    expect(r.ok).toBe(true);
  });
});
