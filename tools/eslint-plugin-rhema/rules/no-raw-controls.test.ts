import { ESLint, RuleTester } from "eslint";
import { afterAll, describe, expect, it } from "vitest";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import rule from "./no-raw-controls.js";
import exemptions from "./no-raw-controls-exemptions.js";

// REQ-GUARD-1 (225a_R7KIT.2b; RV-16) — the `rhema/no-raw-controls` rule, enabled globally at
// `error` by 249_R7GUARD.1. These legs fail if the rule is weakened or removed: raw controls,
// inline spacing/type/colour/radius literals, the no-JS/SSR exemption list applying only to
// listed entries, and the global registration in the real `eslint.config.js` (a sample per glob
// proves the scope; primitives/** and `*.test.*` stay out; seeded violations fail).

RuleTester.afterAll = afterAll;
RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const ruleTester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: "module",
    parserOptions: { ecmaFeatures: { jsx: true } },
  },
});

const EXEMPT_FILE = "apps/web/src/pages.tsx";
const SCOPED_FILE = "apps/web/src/spa/surfaces/settings.tsx";

ruleTester.run("no-raw-controls", rule as never, {
  valid: [
    // The primitives are the sanctioned path.
    { code: `export const a = <Button variant="primary">Save</Button>;`, filename: SCOPED_FILE },
    { code: `export const b = <div className="ui-field" />;`, filename: SCOPED_FILE },
    // `style={…}` may carry `--*` custom properties only.
    {
      code: `export const c = <span style={{ "--ui-chip-fg": "var(--accent)" }} />;`,
      filename: SCOPED_FILE,
    },
    // A spread style object is conservatively accepted (require-estimate-prop precedent).
    {
      code: `export const d = <div style={{ ...vars }} />;`,
      filename: SCOPED_FILE,
    },
    // Non-style objects are untouched.
    { code: `const s = { fontSize: 12 };`, filename: SCOPED_FILE },
    // Exemption: the committed no-JS/SSR list exempts the whole file.
    { code: `export const e = <button type="submit">Sign in</button>;`, filename: EXEMPT_FILE },
    {
      code: `export const f = <input name="email" style={{ fontSize: "13px" }} />;`,
      filename: EXEMPT_FILE,
    },
    // Component-scoped exemption: only the named component's JSX is exempt.
    {
      code: `function VoicePicker() { return <select name="personaId" />; }\nexport const g = 1;`,
      filename: "apps/web/src/any-file.tsx",
      options: [
        {
          exemptions: [
            {
              file: "apps/web/src/any-file.tsx",
              component: "VoicePicker",
              reason: "the no-JS voice picker form stays native (KIT-1).",
            },
          ],
        },
      ],
    },
    // A filename that merely shares a directory is NOT exempt.
    {
      code: `export const h = <Button />;`,
      filename: "apps/web/src/pages.test.tsx",
      options: [{ exemptions: [{ file: "apps/web/src/pages.test.tsx", reason: "test fixture" }] }],
    },
  ],
  invalid: [
    {
      code: `export const a = <button onClick={f}>Save</button>;`,
      filename: SCOPED_FILE,
      errors: [{ messageId: "rawControl" }],
    },
    {
      code: `export const a = <input type="hidden" name="id" />;`,
      filename: SCOPED_FILE,
      errors: [{ messageId: "rawControl" }],
    },
    {
      code: `export const a = <select name="v" />;`,
      filename: SCOPED_FILE,
      errors: [{ messageId: "rawControl" }],
    },
    {
      code: `export const a = <textarea rows={3} />;`,
      filename: SCOPED_FILE,
      errors: [{ messageId: "rawControl" }],
    },
    {
      code: `export const a = <div style={{ padding: 8 }} />;`,
      filename: SCOPED_FILE,
      errors: [{ messageId: "styleLiteral" }],
    },
    {
      code: `export const a = <div style={{ color: "red" }} />;`,
      filename: SCOPED_FILE,
      errors: [{ messageId: "styleLiteral" }],
    },
    {
      code: `export const a = <div style={{ borderRadius: 6, fontSize: 13 }} />;`,
      filename: SCOPED_FILE,
      errors: [{ messageId: "styleLiteral" }],
    },
    // An unlisted raw control inside an exempt-LOOKING component still fails: the exemption
    // entry names a different component.
    {
      code: `function Other() { return <button />; }`,
      filename: "apps/web/src/any-file.tsx",
      options: [
        {
          exemptions: [
            {
              file: "apps/web/src/any-file.tsx",
              component: "VoicePicker",
              reason: "the no-JS voice picker stays native (KIT-1).",
            },
          ],
        },
      ],
      errors: [{ messageId: "rawControl" }],
    },
    // A raw control in a file that is merely adjacent to an exempt one fails.
    {
      code: `export const a = <button />;`,
      filename: "apps/web/src/pages-helper.tsx",
      errors: [{ messageId: "rawControl" }],
    },
  ],
});

describe("the committed no-JS/SSR exemption list (data)", () => {
  it("every entry names a file and gives its no-JS reason", () => {
    expect(Array.isArray(exemptions)).toBe(true);
    expect(exemptions.length).toBeGreaterThan(0);
    for (const entry of exemptions) {
      expect(typeof entry.file).toBe("string");
      expect(entry.file.length).toBeGreaterThan(0);
      expect(typeof entry.reason).toBe("string");
      expect(entry.reason.length).toBeGreaterThan(0);
    }
  });
});

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const severityOf = (v: unknown): number | string | undefined =>
  Array.isArray(v) ? (v[0] as number | string) : (v as number | string | undefined);
const isOff = (v: unknown): boolean => severityOf(v) === 0 || severityOf(v) === "off";

describe("registration in the real eslint.config.js (global enablement — 249_R7GUARD.1)", () => {
  it("is `error` over both scope globs, absent for primitives/**, test files and out-of-scope paths", async () => {
    const eslint = new ESLint({ cwd: REPO_ROOT });
    // One sample per glob family — calculateConfigForFile proves the SCOPE, so a narrowed glob
    // or a resurrected per-file list fails here. Exempt files stay `error`-configured: the
    // committed no-JS/SSR list acts inside the rule, never in the config.
    for (const file of [
      "packages/ui/src/chat-panel.tsx",
      "packages/ui/src/shell.tsx",
      "packages/ui/src/dossier.tsx",
      "packages/ui/src/markdown-prose.tsx", // never in a per-batch list — the global block owns it
      "packages/ui/src/ui-css.ts", // the glob covers .ts too (JSX-bearing helpers)
      "apps/web/src/spa/surfaces/settings.tsx",
      "apps/web/src/spa/app-shell.tsx",
      "apps/web/src/demo-page.tsx",
      "apps/web/src/pages.tsx", // whole-file exemption — still `error`-configured
      "apps/web/src/marketing.tsx", // whole-file exemption — still `error`-configured
    ]) {
      const cfg = await eslint.calculateConfigForFile(file);
      const entry = (cfg.rules as Record<string, unknown>)["rhema/no-raw-controls"];
      expect(entry, `rule configured for ${file}`).toBeDefined();
      expect(isOff(entry), `rule error for ${file}`).toBe(false);
      // calculateConfigForFile normalizes to numeric severity — 2 is "error".
      expect(severityOf(entry), `rule error for ${file}`).toBe(2);
    }
    // Test sources are out of scope by the config's `*.test.*` ignore — the suite's fixtures
    // seed raw controls and style literals on purpose and must never trip the guard.
    for (const file of [
      "apps/web/src/server.test.ts",
      "apps/web/src/spa/app-shell.dom.test.tsx",
      "packages/ui/src/ide-shell.test.tsx",
      "apps/web/src/copy.test.ts",
    ]) {
      const cfg = await eslint.calculateConfigForFile(file);
      expect(
        (cfg.rules as Record<string, unknown>)["rhema/no-raw-controls"],
        `rule absent for test file ${file}`,
      ).toBeUndefined();
    }
    // primitives/** is out of scope — the kit itself authors the styled natives.
    const prim = await eslint.calculateConfigForFile("packages/ui/src/primitives/select.tsx");
    expect((prim.rules as Record<string, unknown>)["rhema/no-raw-controls"]).toBeUndefined();
    // Out-of-scope paths carry no rule config.
    const outside = await eslint.calculateConfigForFile("packages/db/src/rls.ts");
    expect((outside.rules as Record<string, unknown>)["rhema/no-raw-controls"]).toBeUndefined();
  });

  it("seeded violations fail under the global block; listed exemptions still win inside the rule", async () => {
    const eslint = new ESLint({ cwd: REPO_ROOT });
    const code = `export const x = <button type="submit">Save</button>;`;
    // A raw <button> fails on sample files across both globs — including files that were never
    // in a per-batch enablement list (the global block owns the whole scope now).
    for (const file of [
      "packages/ui/src/chat-panel.tsx",
      "packages/ui/src/markdown-prose.tsx",
      "apps/web/src/spa/surfaces/settings.tsx",
      "apps/web/src/spa/app-shell.tsx",
      "apps/web/src/spa/read-only.tsx",
    ]) {
      const [res] = await eslint.lintText(code, { filePath: file });
      expect(
        res.messages.some((m) => m.ruleId === "rhema/no-raw-controls"),
        `seeded raw control fails on ${file}`,
      ).toBe(true);
    }
    // An inline style literal fails under the same block.
    const [lit] = await eslint.lintText(`export const y = <div style={{ padding: 8 }} />;`, {
      filePath: "packages/ui/src/chat-panel.tsx",
    });
    expect(lit.messages.some((m) => m.ruleId === "rhema/no-raw-controls")).toBe(true);
    // The committed exemption list acts INSIDE the rule: the same raw control in pages.tsx
    // (a whole-file no-JS/SSR exemption) passes the same `error` config…
    const [exempt] = await eslint.lintText(code, { filePath: "apps/web/src/pages.tsx" });
    expect(exempt.messages.some((m) => m.ruleId === "rhema/no-raw-controls")).toBe(false);
    // …and a component-scoped exemption applies only to its named component.
    const [scoped] = await eslint.lintText(
      `function HiddenField() { return <input type="hidden" name="id" />; }\n` +
        `function Other() { return <button type="submit">Save</button>; }`,
      { filePath: "apps/web/src/spa/surfaces/settings.tsx" },
    );
    expect(scoped.messages.some((m) => m.ruleId === "rhema/no-raw-controls")).toBe(true);
    const [scopedOk] = await eslint.lintText(
      `function HiddenField() { return <input type="hidden" name="id" />; }`,
      { filePath: "apps/web/src/spa/surfaces/settings.tsx" },
    );
    expect(scopedOk.messages.some((m) => m.ruleId === "rhema/no-raw-controls")).toBe(false);
    // An unlisted raw control in an exempt-LOOKING file still fails — residue can never hide
    // behind a neighbouring exemption.
    const [unlisted] = await eslint.lintText(code, { filePath: "apps/web/src/pages-helper.tsx" });
    expect(unlisted.messages.some((m) => m.ruleId === "rhema/no-raw-controls")).toBe(true);
  });
});
