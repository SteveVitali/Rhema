import { defineConfig } from "vitest/config";

// apps/web/vitest.config.ts — the package-local twin of the root config's DOM routing (SPA.7,
// REQ-VFY-1): `pnpm --filter @rhema/web exec vitest` runs with this package as cwd and would
// otherwise fall back to vitest defaults (node env, no setup file). Kept in lockstep with the
// `environmentMatchGlobs`/`setupFiles` block in ../../vitest.config.ts — component tests are
// `*.dom.test.{ts,tsx}`; the pragma-only escape hatch is intentionally not the mechanism.
export default defineConfig({
  esbuild: { jsx: "automatic", jsxImportSource: "react" },
  test: {
    environment: "node",
    environmentMatchGlobs: [["src/**/*.dom.test.{ts,tsx}", "happy-dom"]],
    setupFiles: ["test-setup.ts"],
  },
});
