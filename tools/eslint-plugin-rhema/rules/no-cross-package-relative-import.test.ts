import { RuleTester } from "eslint";
import { afterAll, describe, it, expect } from "vitest";
import rule from "./no-cross-package-relative-import.js";

// Bind RuleTester's lifecycle to Vitest.
RuleTester.afterAll = afterAll;
RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const ruleTester = new RuleTester({
  languageOptions: { ecmaVersion: 2022, sourceType: "module" },
});

ruleTester.run("no-cross-package-relative-import", rule as never, {
  valid: [
    // Bare specifiers into the @rhema/* graph are the sanctioned cross-package path.
    { code: `import { x } from "@rhema/contracts";`, filename: "/work/packages/db/src/index.ts" },
    // Node built-ins and third-party deps are fine.
    { code: `import { readFileSync } from "node:fs";`, filename: "/work/packages/db/src/index.ts" },
    // Relative imports that stay INSIDE the package are fine.
    { code: `import { y } from "./schema/auth.js";`, filename: "/work/packages/db/src/index.ts" },
    { code: `import { z } from "../rls.js";`, filename: "/work/packages/db/src/schema/auth.ts" },
  ],
  invalid: [
    {
      // Reaching into a sibling package with a relative path is the violation.
      code: `import { c } from "../../contracts/src/index.js";`,
      filename: "/work/packages/db/src/index.ts",
      errors: [{ messageId: "crossPackage" }],
    },
    {
      code: `export { c } from "../../../packages/contracts/src/index.js";`,
      filename: "/work/apps/api/src/index.ts",
      errors: [{ messageId: "crossPackage" }],
    },
  ],
});

describe("packageRootOf", () => {
  it("finds the deepest workspace-container package root", () => {
    expect((rule as never as { packageRootOf: (p: string) => string | null }).packageRootOf(
      "/work/packages/db/src/schema/auth.ts",
    )).toBe("/work/packages/db");
  });
  it("treats infra as a single-package dir", () => {
    expect((rule as never as { packageRootOf: (p: string) => string | null }).packageRootOf(
      "/work/infra/config/stages.ts",
    )).toBe("/work/infra");
  });
});
