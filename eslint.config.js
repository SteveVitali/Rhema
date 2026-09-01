// @ts-check
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import rhema from "eslint-plugin-rhema";

/**
 * Flat ESLint config for the monorepo. Enforces:
 *  - the Bazel-compatible "no cross-package relative import" invariant (spec §13.2), and
 *  - the "never 'Claude Code'" brand rule for user-facing strings (§13.2 / LICENSES.md).
 * Type-aware linting is intentionally off here (fast, no per-package project wiring); later tickets
 * can opt individual packages into type-aware rules.
 */

const nodeGlobals = {
  process: "readonly",
  console: "readonly",
  Buffer: "readonly",
  URL: "readonly",
  __dirname: "readonly",
  __filename: "readonly",
  module: "writable",
  require: "readonly",
  exports: "writable",
  setTimeout: "readonly",
  clearTimeout: "readonly",
  fetch: "readonly",
};

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "**/.turbo/**",
      "**/*.tsbuildinfo",
      "docs/**",
      ".agents/**",
      "**/.sst/**",
      // SST config is executed/bundled by the SST CLI (its own globals + triple-slash ref), not linted here.
      "**/sst.config.ts",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: { rhema },
    rules: {
      "rhema/no-cross-package-relative-import": "error",
      "rhema/no-banned-strings": ["error", { banned: ["Claude Code"] }],
      // Underscore-prefixed args/vars are intentional placeholders (skeleton stubs, unimplemented seams).
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
    },
  },
  {
    // Repo tooling written in CommonJS (the eslint plugin, node scripts).
    files: ["**/*.cjs", "tools/eslint-plugin-rhema/**/*.js", "scripts/**/*.mjs"],
    languageOptions: {
      sourceType: "commonjs",
      globals: nodeGlobals,
    },
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
  {
    files: ["**/*.mjs"],
    languageOptions: { sourceType: "module", globals: nodeGlobals },
  },
);
