import { RuleTester } from "eslint";
import { afterAll, describe, it } from "vitest";
import rule from "./no-banned-strings.js";

RuleTester.afterAll = afterAll;
RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const ruleTester = new RuleTester({
  languageOptions: { ecmaVersion: 2022, sourceType: "module" },
});

const options = [{ banned: ["Claude Code"] }];

ruleTester.run("no-banned-strings", rule as never, {
  valid: [
    { code: `const brand = "Rhema";`, options },
    { code: `const s = "our own harness";`, options },
    // No options -> rule is inert.
    { code: `const s = "Claude Code";`, options: [] },
  ],
  invalid: [
    {
      code: `const label = "Powered by Claude Code";`,
      options,
      errors: [{ messageId: "banned" }],
    },
    {
      code: "const t = `built on Claude Code today`;",
      options,
      errors: [{ messageId: "banned" }],
    },
  ],
});
