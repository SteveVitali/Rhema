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
      // Vendored proprietary bundles (e.g. apps/run-task/vendor/claude-agent-sdk) are gitignored, copied into
      // the image verbatim, and never part of the lint graph — a fresh CI checkout has no vendor dir at all.
      "**/vendor/**",
      "**/.sst/**",
      // The Pulumi program (infra/pulumi) is operator-run IaC executed by the Pulumi CLI's own ts-node
      // runtime with its own deps (@pulumi/*), not part of the monorepo build/lint graph — same posture
      // the superseded SST config had.
      "infra/pulumi/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: { rhema },
    rules: {
      "rhema/no-cross-package-relative-import": "error",
      // Global banned strings: only phrases that cannot collide with code identifiers (Appendix D.2). The
      // full reserved/banned vocabulary lint against the i18n string table is extended by later UI tickets
      // (REQ-PROD-6/REQ-BILL-18); its bedrock data lives in @rhema/contracts reserved-strings.
      "rhema/no-banned-strings": [
        "error",
        { banned: ["Claude Code", "you will be billed", "writes like you"] },
      ],
      // REQ-DATA-4 / REQ-ARCH-25: the tenant is set only via the withTenant wrapper (set_config).
      "rhema/no-raw-set-tenant": "error",
      // REQ-GROWTH-16: <RunButton> requires an `estimate` prop (a run is never launched without a shown estimate).
      "rhema/require-estimate-prop": "error",
      // Underscore-prefixed args/vars are intentional placeholders (skeleton stubs, unimplemented seams).
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
    },
  },
  {
    // The banned/reserved-string DATA file and test files legitimately contain banned strings (as the
    // Appendix D.2 bedrock, or as rule assertions). The no-banned-strings rule targets user-facing COPY, not
    // the vocabulary definition itself, so it is off for those files.
    files: ["**/reserved-strings.ts", "**/*.test.ts", "**/*.test.mjs"],
    rules: { "rhema/no-banned-strings": "off" },
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
