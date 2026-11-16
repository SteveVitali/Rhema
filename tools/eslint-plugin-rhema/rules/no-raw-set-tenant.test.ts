import { RuleTester } from "eslint";
import { describe, it } from "vitest";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const rule = require("./no-raw-set-tenant.js");

// REQ-DATA-4: a raw `SET app.tenant_id` is forbidden; the wrapper's set_config form is allowed.

const ruleTester = new RuleTester({
  languageOptions: { ecmaVersion: 2022, sourceType: "module" },
});

describe("no-raw-set-tenant", () => {
  it("flags raw SET app.tenant_id everywhere", () => {
    ruleTester.run("no-raw-set-tenant", rule, {
      valid: [
        // BL-118: set_config is allowed ONLY inside the wrapper itself (filename-scoped).
        {
          code: `db.query("select set_config('app.tenant_id', $1, true)", [t]);`,
          filename: "packages/db/src/rls.ts",
        },
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

  it("flags set_config('app.tenant_id', …) outside the wrapper — the BL-118/RH-A1-9 gap", () => {
    ruleTester.run("no-raw-set-tenant", rule, {
      valid: [
        {
          code: `await client.query("select set_config('app.tenant_id', $1, true)", [t]);`,
          filename: "/repo/packages/db/src/rls.ts",
        },
        { code: `await client.query("select set_config('role', $1, true)", [t]);` }, // other GUCs untouched
        { code: `await withTenant(client, t, fn);` },
      ],
      invalid: [
        // The journeys-substrate hand-roll this ticket removes.
        {
          code: `await c.query("select set_config('app.tenant_id', $1, true)", [tenantId]);`,
          filename: "packages/journeys/src/stb5a.ts",
          errors: [{ messageId: "setConfigTenant" }],
        },
        {
          code: "await c.query(`select set_config('app.tenant_id', $1, true)`, [t]);",
          errors: [{ messageId: "setConfigTenant" }],
        },
        {
          code: `await c.query("select set_config(\\"app.tenant_id\\", $1, true)", [t]);`,
          errors: [{ messageId: "setConfigTenant" }],
        },
      ],
    });
  });
});
