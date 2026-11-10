import { ESLint, RuleTester } from "eslint";
import { afterAll, describe, expect, it } from "vitest";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import rule from "./no-raw-controls.js";
import exemptions from "./no-raw-controls-exemptions.js";

// REQ-GUARD-1 (225a_R7KIT.2b; RV-16) — the `rhema/no-raw-controls` rule, authored OFF. These legs
// fail if the rule is weakened or removed: raw controls, inline spacing/type/colour/radius
// literals, the no-JS/SSR exemption list applying only to listed entries, and the per-file
// enablement mechanism in the real `eslint.config.js` (registered off over the scope; a seeded
// enabled entry turns it `error`).

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

describe("registration in the real eslint.config.js (per-file enablement)", () => {
  it("is `off` over both scope globs, absent for primitives/** and out-of-scope files", async () => {
    const eslint = new ESLint({ cwd: REPO_ROOT });
    for (const file of ["apps/web/src/pages.tsx", "apps/web/src/page-chrome.tsx"]) {
      const cfg = await eslint.calculateConfigForFile(file);
      const entry = (cfg.rules as Record<string, unknown>)["rhema/no-raw-controls"];
      expect(entry, `rule configured for ${file}`).toBeDefined();
      expect(isOff(entry), `rule off for ${file}`).toBe(true);
    }
    // R7TALK.1a enabled the first batch-d file — the rule is ON (never off) for it; R7KIT.3a
    // enabled batch a's settings/billing/usage and 240a_R7KIT.3a2 completed batch a with voices.
    // 241_R7KIT.3b enabled batch b's run-sheet / export / onboarding; 242_R7KIT.3c2 enabled
    // batch c2's outline / figures / outline-sections.
    for (const file of [
      "packages/ui/src/chat-panel.tsx",
      "apps/web/src/spa/surfaces/settings.tsx",
      "apps/web/src/spa/surfaces/billing.tsx",
      "apps/web/src/spa/surfaces/usage.tsx",
      "apps/web/src/spa/surfaces/voices.tsx",
      "apps/web/src/spa/surfaces/run-sheet.tsx",
      "apps/web/src/spa/surfaces/export.tsx",
      "apps/web/src/spa/surfaces/onboarding.tsx",
      "apps/web/src/spa/surfaces/outline.tsx",
      "apps/web/src/spa/surfaces/figures.tsx",
      "packages/ui/src/outline-sections.tsx",
      // 243_R7KIT.3d enabled batch d's IDE surfaces (the dossier files stay 243a's — still off).
      "packages/ui/src/gate-card.tsx",
      "packages/ui/src/run-card.tsx",
      "packages/ui/src/timeline.tsx",
      "packages/ui/src/findings-desk.tsx",
      "packages/ui/src/compare.tsx",
      "packages/ui/src/page-editor.tsx",
      "packages/ui/src/ide-shell.tsx",
      "packages/ui/src/run-sheet.tsx",
      "apps/web/src/approval-settings.tsx",
      // 243a_R7KIT.3e enabled the dossier composition: the letter/claims/findings/sample-dossier
      // ui files, the shared dossier-view, and the dossier + obligations-new leaf.
      "packages/ui/src/dossier.tsx",
      "packages/ui/src/letter.tsx",
      "packages/ui/src/claims.tsx",
      "packages/ui/src/findings.tsx",
      "apps/web/src/dossier-view.tsx",
      "apps/web/src/spa/surfaces/dossier.tsx",
      // 248a_R7KIT.3f enabled all 29 migrate-tail census files.
      "packages/ui/src/run-report.tsx",
      "packages/ui/src/what-changed.tsx",
      "packages/ui/src/page-strip.tsx",
      "packages/ui/src/version-rail.tsx",
      "packages/ui/src/ide-states.tsx",
      "packages/ui/src/conversion.tsx",
      "packages/ui/src/dispositions.tsx",
      "packages/ui/src/files-pane.tsx",
      "packages/ui/src/second-read.tsx",
      "packages/ui/src/approval-row.tsx",
      "packages/ui/src/shell.tsx",
      "packages/ui/src/decisions.tsx",
      "packages/ui/src/rubric.tsx",
      "packages/ui/src/chips.tsx",
      "packages/ui/src/margin.tsx",
      "apps/web/src/demo-page.tsx",
      "apps/web/src/demo-markers.tsx",
      "apps/web/src/legal.tsx",
      "apps/web/src/chat-pane.tsx",
      "apps/web/src/gate-card.tsx",
      "apps/web/src/spa/app-shell.tsx",
      "apps/web/src/spa/palette.tsx",
      "apps/web/src/spa/chat-live.tsx",
      "apps/web/src/spa/read-only.tsx",
      "apps/web/src/spa/page-header.tsx",
      "apps/web/src/spa/demo-banner.tsx",
      "apps/web/src/spa/demo-effects.tsx",
      "apps/web/src/spa/surfaces/run-report.tsx",
      "apps/web/src/spa/surfaces/editor.tsx",
    ]) {
      const on = await eslint.calculateConfigForFile(file);
      const onEntry = (on.rules as Record<string, unknown>)["rhema/no-raw-controls"];
      expect(onEntry, `rule configured for ${file}`).toBeDefined();
      expect(isOff(onEntry), `rule on for ${file}`).toBe(false);
    }
    // primitives/** is out of scope — the rule must not apply there at all.
    const prim = await eslint.calculateConfigForFile("packages/ui/src/primitives/select.tsx");
    expect((prim.rules as Record<string, unknown>)["rhema/no-raw-controls"]).toBeUndefined();
    // Out-of-scope paths carry no rule config.
    const outside = await eslint.calculateConfigForFile("packages/db/src/rls.ts");
    expect((outside.rules as Record<string, unknown>)["rhema/no-raw-controls"]).toBeUndefined();
  });

  it("a seeded enablement entry turns the rule `error` on the named file only", async () => {
    const config = (await import("../../../eslint.config.js")).default;
    const eslint = new ESLint({
      cwd: REPO_ROOT,
      overrideConfigFile: true,
      overrideConfig: [
        ...config,
        {
          files: ["apps/web/src/spa/surfaces/settings.tsx"],
          rules: { "rhema/no-raw-controls": "error" },
        },
      ],
    });
    const code = `export const x = <button type="submit">Save</button>;`;
    const [on] = await eslint.lintText(code, {
      filePath: "apps/web/src/spa/surfaces/settings.tsx",
    });
    expect(on.messages.some((m) => m.ruleId === "rhema/no-raw-controls")).toBe(true);
    // 240a_R7KIT.3a2's seeded leg: a raw <button> in voices.tsx now fails the ENABLED rule
    // (batch a's enablement covers the file — no override needed for the violation to land).
    const [voices] = await eslint.lintText(code, {
      filePath: "apps/web/src/spa/surfaces/voices.tsx",
    });
    expect(voices.messages.some((m) => m.ruleId === "rhema/no-raw-controls")).toBe(true);
    // 241_R7KIT.3b's seeded legs: a raw <button> fails the ENABLED rule on every batch-b file.
    for (const file of [
      "apps/web/src/spa/surfaces/run-sheet.tsx",
      "apps/web/src/spa/surfaces/export.tsx",
      "apps/web/src/spa/surfaces/onboarding.tsx",
    ]) {
      const [res] = await eslint.lintText(code, { filePath: file });
      expect(
        res.messages.some((m) => m.ruleId === "rhema/no-raw-controls"),
        `seeded raw control fails on ${file}`,
      ).toBe(true);
    }
    // 242_R7KIT.3c2's seeded legs: a raw <button> fails the ENABLED rule on every batch-c2 file.
    for (const file of [
      "apps/web/src/spa/surfaces/outline.tsx",
      "apps/web/src/spa/surfaces/figures.tsx",
      "packages/ui/src/outline-sections.tsx",
    ]) {
      const [res] = await eslint.lintText(code, { filePath: file });
      expect(
        res.messages.some((m) => m.ruleId === "rhema/no-raw-controls"),
        `seeded raw control fails on ${file}`,
      ).toBe(true);
    }
    // 243_R7KIT.3d's seeded legs: a raw <button> fails the ENABLED rule on every batch-d file
    // (component-scoped exemptions don't rescue a control outside the named component).
    for (const file of [
      "packages/ui/src/gate-card.tsx",
      "packages/ui/src/run-card.tsx",
      "packages/ui/src/timeline.tsx",
      "packages/ui/src/findings-desk.tsx",
      "packages/ui/src/compare.tsx",
      "packages/ui/src/page-editor.tsx",
      "packages/ui/src/ide-shell.tsx",
      "packages/ui/src/run-sheet.tsx",
      "apps/web/src/approval-settings.tsx",
      // 243a_R7KIT.3e's seeded legs: a raw <button> fails the ENABLED rule on every dossier file.
      "packages/ui/src/dossier.tsx",
      "packages/ui/src/letter.tsx",
      "packages/ui/src/claims.tsx",
      "packages/ui/src/findings.tsx",
      "apps/web/src/dossier-view.tsx",
      "apps/web/src/spa/surfaces/dossier.tsx",
      // 248a_R7KIT.3f enabled all 29 migrate-tail census files.
      "packages/ui/src/run-report.tsx",
      "packages/ui/src/what-changed.tsx",
      "packages/ui/src/page-strip.tsx",
      "packages/ui/src/version-rail.tsx",
      "packages/ui/src/ide-states.tsx",
      "packages/ui/src/conversion.tsx",
      "packages/ui/src/dispositions.tsx",
      "packages/ui/src/files-pane.tsx",
      "packages/ui/src/second-read.tsx",
      "packages/ui/src/approval-row.tsx",
      "packages/ui/src/shell.tsx",
      "packages/ui/src/decisions.tsx",
      "packages/ui/src/rubric.tsx",
      "packages/ui/src/chips.tsx",
      "packages/ui/src/margin.tsx",
      "apps/web/src/demo-page.tsx",
      "apps/web/src/demo-markers.tsx",
      "apps/web/src/legal.tsx",
      "apps/web/src/chat-pane.tsx",
      "apps/web/src/gate-card.tsx",
      "apps/web/src/spa/app-shell.tsx",
      "apps/web/src/spa/palette.tsx",
      "apps/web/src/spa/chat-live.tsx",
      "apps/web/src/spa/read-only.tsx",
      "apps/web/src/spa/page-header.tsx",
      "apps/web/src/spa/demo-banner.tsx",
      "apps/web/src/spa/demo-effects.tsx",
      "apps/web/src/spa/surfaces/run-report.tsx",
      "apps/web/src/spa/surfaces/editor.tsx",
    ]) {
      const [res] = await eslint.lintText(`export const x = <button type="submit">Save</button>;`, {
        filePath: file,
      });
      expect(
        res.messages.some((m) => m.ruleId === "rhema/no-raw-controls"),
        `seeded raw control fails on ${file}`,
      ).toBe(true);
    }
    // Same code in a not-yet-migrated file: the rule stays off (enablement is per-file).
    const [off] = await eslint.lintText(code, {
      filePath: "apps/web/src/pages.tsx",
    });
    expect(off.messages.some((m) => m.ruleId === "rhema/no-raw-controls")).toBe(false);
    // Same code in an exempt file: enabled, but the exemption wins.
    const exemptEslint = new ESLint({
      cwd: REPO_ROOT,
      overrideConfigFile: true,
      overrideConfig: [
        ...config,
        {
          files: ["apps/web/src/pages.tsx"],
          rules: { "rhema/no-raw-controls": "error" },
        },
      ],
    });
    const [exempt] = await exemptEslint.lintText(code, {
      filePath: "apps/web/src/pages.tsx",
    });
    expect(exempt.messages.some((m) => m.ruleId === "rhema/no-raw-controls")).toBe(false);
  });
});
