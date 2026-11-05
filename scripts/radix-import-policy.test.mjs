import { describe, it, expect } from "vitest";
import { ESLint } from "eslint";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// REQ-KIT-5 / ADR-129 (225_R7KIT.2) — the per-package import policy is lint-enforced: a planted
// `radix-ui` barrel/meta import or a deep `lucide-react/*` path MUST error; per-package
// `@radix-ui/react-<primitive>` imports and named `lucide-react` imports stay legal. The legs run
// the real flat config through the ESLint API (no fixture files — lintText + filePath applies the
// matching overrides exactly as a real file would see them).

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const eslint = new ESLint({ cwd: root });

async function restrictedImportErrors(code, filePath) {
  const [result] = await eslint.lintText(code, { filePath: resolve(root, filePath) });
  return (result?.messages ?? []).filter((m) => m.ruleId === "no-restricted-imports");
}

describe("radix/lucide import policy (REQ-KIT-5, ADR-129)", () => {
  it("a planted `radix-ui` meta/barrel import FAILS", async () => {
    const errs = await restrictedImportErrors(
      'import { Dialog } from "radix-ui";\nexport const x = Dialog;',
      "packages/ui/src/planted.ts",
    );
    expect(errs.length).toBeGreaterThan(0);
    expect(errs[0].message).toMatch(/meta-package/);
  });

  it("a planted `@radix-ui` barrel and `radix-ui/*` subpath FAIL", async () => {
    for (const spec of ["@radix-ui", "radix-ui/react-dialog"]) {
      const errs = await restrictedImportErrors(
        `import * as X from "${spec}";\nexport const x = X;`,
        "packages/ui/src/planted.ts",
      );
      expect(errs.length, spec).toBeGreaterThan(0);
    }
  });

  it("per-package `@radix-ui/react-<primitive>` imports stay legal", async () => {
    for (const spec of [
      "@radix-ui/react-dialog",
      "@radix-ui/react-tooltip",
      "@radix-ui/react-select",
    ]) {
      const errs = await restrictedImportErrors(
        `import * as X from "${spec}";\nexport const x = X;`,
        "packages/ui/src/planted.ts",
      );
      expect(errs, spec).toEqual([]);
    }
  });

  it("a deep `lucide-react/*` path FAILS; named imports from `lucide-react` stay legal", async () => {
    const deep = await restrictedImportErrors(
      'import Check from "lucide-react/dist/esm/icons/check";\nexport const x = Check;',
      "packages/ui/src/planted.ts",
    );
    expect(deep.length).toBeGreaterThan(0);
    const named = await restrictedImportErrors(
      'import { Check, X } from "lucide-react";\nexport const a = [Check, X];',
      "packages/ui/src/planted.ts",
    );
    expect(named).toEqual([]);
  });

  it("`@radix-ui/react-icons` FAILS — the icon set is Lucide", async () => {
    const errs = await restrictedImportErrors(
      'import { CheckIcon } from "@radix-ui/react-icons";\nexport const x = CheckIcon;',
      "packages/ui/src/planted.ts",
    );
    expect(errs.length).toBeGreaterThan(0);
  });

  it("the policy also binds client-bundle sources (the scoped block keeps it)", async () => {
    const errs = await restrictedImportErrors(
      'import { Dialog } from "radix-ui";\nexport const x = Dialog;',
      "apps/web/src/spa/planted.ts",
    );
    expect(errs.length).toBeGreaterThan(0);
    const deep = await restrictedImportErrors(
      'import Check from "lucide-react/dist/esm/icons/check";\nexport const x = Check;',
      "apps/web/src/spa/planted.ts",
    );
    expect(deep.length).toBeGreaterThan(0);
  });
});
