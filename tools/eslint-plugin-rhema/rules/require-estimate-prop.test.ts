import { RuleTester } from "eslint";
import { describe, it } from "vitest";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const rule = require("./require-estimate-prop.js");

// REQ-GROWTH-16: <RunButton> must carry an `estimate` prop; <AskButton> is exempt.

const ruleTester = new RuleTester({
  languageOptions: { ecmaVersion: 2022, sourceType: "module", parserOptions: { ecmaFeatures: { jsx: true } } },
});

describe("require-estimate-prop", () => {
  it("requires an estimate prop on RunButton", () => {
    ruleTester.run("require-estimate-prop", rule, {
      valid: [
        { code: `const x = <RunButton estimate={e} label="Run" />;` },
        { code: `const x = <RunButton {...props} label="Run" />;` }, // spread may carry it — accepted
        { code: `const x = <AskButton label="Ask" />;` }, // not a run trigger
        { code: `const x = <button>Run</button>;` },
      ],
      invalid: [
        { code: `const x = <RunButton label="Run" />;`, errors: [{ messageId: "missingEstimate" }] },
        { code: `const x = <RunButton />;`, errors: [{ messageId: "missingEstimate" }] },
      ],
    });
  });
});
