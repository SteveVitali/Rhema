import { defineConfig } from "vitest/config";

// Root Vitest config — runs every colocated *.test.ts across the workspace. Vitest transpiles with
// esbuild, so tests run without a prior tsc build (build/typecheck are separate Turbo tasks).
export default defineConfig({
  // React SSR tests (PRB.01 beta shell) use the automatic JSX runtime; esbuild only enables JSX for .tsx
  // files, so .ts tests keep angle-bracket type syntax working.
  esbuild: { jsx: "automatic", jsxImportSource: "react" },
  test: {
    include: [
      "packages/**/*.test.{ts,tsx}",
      "apps/**/*.test.{ts,tsx}",
      "infra/**/*.test.ts",
      "integration/**/*.test.ts",
      "tools/**/*.test.{ts,mjs}",
      "scripts/**/*.test.mjs",
    ],
    exclude: ["**/node_modules/**", "**/dist/**", "**/.turbo/**"],
    environment: "node",
    // SPA.7 (REQ-VFY-1, design/27 F2): component tests are `*.dom.test.{ts,tsx}` — the glob routes
    // them to happy-dom so a forgotten pragma can't silently run a DOM test under node. Everything
    // else stays node. The setup file registers jest-dom matchers + RTL cleanup (guarded, so the
    // node suite is unaffected).
    environmentMatchGlobs: [["apps/web/src/**/*.dom.test.{ts,tsx}", "happy-dom"]],
    setupFiles: ["apps/web/test-setup.ts"],
  },
});
