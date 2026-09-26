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
  },
});
