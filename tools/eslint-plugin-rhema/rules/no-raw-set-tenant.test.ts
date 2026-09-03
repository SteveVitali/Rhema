import { RuleTester } from "eslint";
import { describe, it } from "vitest";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const rule = require("./no-raw-set-tenant.js");

// REQ-DATA-4: a raw `SET app.tenant_id` is forbidden; the wrapper's set_config form is allowed.

const ruleTester = new RuleTester({
  languageOptions: { ecmaVersion: 2022, sourceType: "module" },
});

describe("no-raw-set-tenant", () => {
  it("flags raw SET app.tenant_id and allows set_config", () => {
    ruleTester.run("no-raw-set-tenant", rule, {
      valid: [
        { code: `db.query("select set_config('app.tenant_id', $1, true)", [t]);` },
        { code: "const s = `select set_config('app.tenant_id', ${'$1'}, true)`;" },
        { code: `const s = "select * from projects";` },
      ],
      invalid: [
        {
          code: `db.query("SET app.tenant_id = '" + t + "'");`,
          errors: [{ messageId: "rawSetTenant" }],
        },
        {
          code: "const s = `SET LOCAL app.tenant_id = '${t}'`;",
          errors: [{ messageId: "rawSetTenant" }],
        },
        {
          code: `db.query("set app.tenant_id = 'x'");`,
          errors: [{ messageId: "rawSetTenant" }],
        },
      ],
    });
  });
});
