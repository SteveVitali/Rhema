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
      // The generated editor client bundle (PRB.07; built by apps/web/build-client.mjs, gitignored).
      "apps/web/public/**",
      "**/node_modules/**",
      "**/.turbo/**",
      "**/*.tsbuildinfo",
      "docs/**",
      ".agents/**",
      // Operator/one-off scratch scripts (gitignored) — never part of the lint graph.
      "**/.scratch/**",
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
      // REQ-SPEC-30 (SEC.1): the elevated/system-pool seams live behind the audited allowlist in
      // tools/system-pool-boundary.json — user-facing modules may not reference them.
      "rhema/no-system-pool-in-user-route": "error",
      // REQ-GROWTH-16: <RunButton> requires an `estimate` prop (a run is never launched without a shown estimate).
      "rhema/require-estimate-prop": "error",
      // REQ-KIT-5 / ADR-129 (R7KIT.2): the component stack is per-package Radix (`@radix-ui/react-*`,
      // the wrapper per primitive) — the `radix-ui` meta/barrel package is banned so leaf chunking
      // survives; `lucide-react` is named-icon-imports only (deep `dist/` paths defeat tree-shaking);
      // `@radix-ui/react-icons` is a different icon set — Lucide is the one set.
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "radix-ui",
              message:
                "ADR-129: no Radix meta-package — import the per-package primitive (@radix-ui/react-<primitive>) so leaf chunking holds (REQ-KIT-5).",
            },
            {
              name: "@radix-ui",
              message:
                "ADR-129: no @radix-ui barrel — import the per-package primitive (@radix-ui/react-<primitive>).",
            },
            {
              name: "@radix-ui/react-icons",
              message:
                "ADR-129: the icon set is lucide-react — named imports from 'lucide-react' only.",
            },
          ],
          patterns: [
            {
              group: ["radix-ui/*"],
              message:
                "ADR-129: no Radix meta-package subpaths — per-package @radix-ui/react-<primitive> imports only.",
            },
            {
              group: ["lucide-react/*", "lucide-react/dist/*"],
              message:
                "REQ-KIT-5: named imports from 'lucide-react' only — deep icon paths defeat tree-shaking.",
            },
          ],
        },
      ],
      // Underscore-prefixed args/vars are intentional placeholders (skeleton stubs, unimplemented seams).
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
    },
  },
  {
    // @rhema/findings-core is the framework-free logic web + 1.x mobile share verbatim (§10.2 REQ-MOBILE-4):
    // it must NEVER import React/React-DOM. The presentational surfaces live in @rhema/ui (PRB.04 AC1).
    files: ["packages/findings-core/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        { paths: [
          { name: "react", message: "findings-core is framework-free (REQ-MOBILE-4): no React. Put presentation in @rhema/ui." },
          { name: "react-dom", message: "findings-core is framework-free (REQ-MOBILE-4): no React. Put presentation in @rhema/ui." },
        ] },
      ],
    },
  },
  {
    // R7DEM.4 (REQ-DWEB-3) — `demoDataSource`'s runtime graph: no api-client/db/live-clients
    // (the api stays unreachable on the demo path — DTO types only), and no demo-corpus code
    // (snapshot JSON is read from disk, never imported into a bundle). The twin forward in
    // demo.ts owns the ApiError adaptation at the seam.
    files: ["apps/web/src/demo-data.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@rhema/api-client",
              allowTypeImports: true,
              message: "REQ-DWEB-3: no runtime api-client import — types only.",
            },
            { name: "@rhema/db", message: "REQ-DWEB-3: demoDataSource never touches the DB." },
            {
              name: "@rhema/live-clients",
              message: "REQ-DWEB-3: no live service adapters on the demo path.",
            },
            {
              name: "@rhema/demo-corpus",
              allowTypeImports: true,
              message: "REQ-DWEB-3: snapshot JSON is read from disk, never imported.",
            },
          ],
        },
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
  {
    // The web client bundle sources (PRB.07 editor + P1.01 ide) and the SPA sources (SPA.1,
    // apps/web/src/spa — the Vite graph) run in the browser — DOM globals, not Node's.
    files: ["apps/web/src/client/**/*.ts", "apps/web/src/spa/**/*.ts", "apps/web/src/spa/**/*.tsx"],
    languageOptions: {
      globals: {
        document: "readonly",
        window: "readonly",
        navigator: "readonly",
        location: "readonly",
        history: "readonly",
        localStorage: "readonly",
        matchMedia: "readonly",
        HTMLElement: "readonly",
        HTMLTextAreaElement: "readonly",
        HTMLButtonElement: "readonly",
        PointerEvent: "readonly",
        MediaQueryListEvent: "readonly",
        Blob: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        requestAnimationFrame: "readonly",
        fetch: "readonly",
      },
    },
  },
  {
    // REQ-SAFE-8/REQ-SAFE-9 (SPA.8; design/28): client-bundle sources must never import the private
    // protocol/eval packages — that is the IP-leak vector the public-safe marker+provenance job scans
    // the emitted graph for; the lint catches it at author time. `@rhema/api-client` stays legal only
    // as `import type` — DTOs are compile-time shapes; runtime data rides the boot JSON + BFF fetches.
    // Env is the second tripwire: client code never reads `process.env` and reads `import.meta.env`
    // only inside the single `src/spa/env.ts` reader (runtime config is server-rendered boot JSON).
    files: [
      "apps/web/src/spa/**/*.ts",
      "apps/web/src/spa/**/*.tsx",
      "apps/web/src/client/**/*.ts",
      "apps/web/src/client/**/*.tsx",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@rhema/protocols",
              message:
                "private protocol IP must never enter a client bundle (REQ-ARCH-33 / REQ-SAFE-9).",
            },
            {
              name: "@rhema/evals",
              message: "private eval IP must never enter a client bundle (REQ-ARCH-33 / REQ-SAFE-9).",
            },
            {
              name: "radix-ui",
              message:
                "ADR-129: no Radix meta-package — per-package @radix-ui/react-<primitive> imports only (REQ-KIT-5).",
            },
            {
              name: "@radix-ui",
              message:
                "ADR-129: no @radix-ui barrel — per-package @radix-ui/react-<primitive> imports only.",
            },
            {
              name: "@radix-ui/react-icons",
              message:
                "ADR-129: the icon set is lucide-react — named imports from 'lucide-react' only.",
            },
          ],
          patterns: [
            {
              group: ["@rhema/protocols/*", "@rhema/evals/*"],
              message:
                "private protocol/eval subpaths must never enter a client bundle (REQ-SAFE-9).",
            },
            {
              group: ["@rhema/api-client", "@rhema/api-client/*"],
              allowTypeImports: true,
              message:
                "@rhema/api-client is type-only in client bundles — runtime data rides the boot JSON / BFF fetches.",
            },
            {
              group: ["radix-ui/*"],
              message:
                "ADR-129: no Radix meta-package subpaths — per-package @radix-ui/react-<primitive> imports only.",
            },
            {
              group: ["lucide-react/*", "lucide-react/dist/*"],
              message:
                "REQ-KIT-5: named imports from 'lucide-react' only — deep icon paths defeat tree-shaking.",
            },
          ],
        },
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "MemberExpression[object.type='MetaProperty'][object.meta.name='import'][property.name='env']",
          message:
            "import.meta.env is banned in client sources outside apps/web/src/spa/env.ts (REQ-SAFE-8) — runtime config rides the server-rendered boot JSON.",
        },
        {
          selector: "MemberExpression[object.name='process'][property.name='env']",
          message:
            "process.env does not exist in the browser bundle — a read here is a leak vector (REQ-SAFE-8).",
        },
      ],
    },
  },
  {
    // `src/spa/env.ts` is the single sanctioned import.meta.env reader (REQ-SAFE-8); process.env
    // stays banned there too.
    files: ["apps/web/src/spa/env.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "MemberExpression[object.name='process'][property.name='env']",
          message:
            "process.env does not exist in the browser bundle — even the env reader uses import.meta.env only.",
        },
      ],
    },
  },
);
