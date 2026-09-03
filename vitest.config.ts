import { defineConfig } from "vitest/config";

// Root Vitest config — runs every colocated *.test.ts across the workspace. Vitest transpiles with
// esbuild, so tests run without a prior tsc build (build/typecheck are separate Turbo tasks).
export default defineConfig({
  test: {
    include: [
      "packages/**/*.test.ts",
      "apps/**/*.test.ts",
      "infra/**/*.test.ts",
      "integration/**/*.test.ts",
      "tools/**/*.test.{ts,mjs}",
      "scripts/**/*.test.mjs",
    ],
    exclude: ["**/node_modules/**", "**/dist/**", "**/.turbo/**"],
    environment: "node",
  },
});
