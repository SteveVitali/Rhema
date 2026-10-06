import { RuleTester } from "eslint";
import { describe, it } from "vitest";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const rule = require("./no-system-pool-in-user-route.js");

// SEC.1 (REQ-SPEC-30): a user-facing module may not reference the elevated seams (systemExec,
// systemTxRunner, systemPool, systemDatabaseUrl, SYSTEM_DATABASE_URL); the audited set lives in
// tools/system-pool-boundary.json. RuleTester runs against REAL filenames so the allowlist itself
// is exercised (billing-routes is allowlisted; voice-routes is not).

const ruleTester = new RuleTester({
  languageOptions: { ecmaVersion: 2022, sourceType: "module" },
});

const USER_ROUTE = "apps/api/src/voice-routes.ts"; // a user-facing route module — NOT allowlisted
const SYSTEM_PATH = "apps/api/src/billing-routes.ts"; // allowlisted (stripe_events intake)
const TEST_FILE = "apps/api/src/voice-routes.test.ts"; // tests are exempt (fake seams)

describe("no-system-pool-in-user-route (SEC.1)", () => {
  it("flags the system seams in a user-route module; allows audited paths", () => {
    ruleTester.run("no-system-pool-in-user-route", rule, {
      valid: [
        // audited system paths may use the seam
        { filename: SYSTEM_PATH, code: `await deps.systemExec.query("select 1");` },
        { filename: SYSTEM_PATH, code: `await deps.systemTxRunner.run("ws", fn);` },
        // a user route that never touches the seam is fine
        { filename: USER_ROUTE, code: `await deps.txRunner.run(principal.workspaceId, fn);` },
        { filename: USER_ROUTE, code: `const pool = new pg.Pool({ connectionString: env.databaseUrl });` },
        // test files are exempt (they construct fake seams)
        { filename: TEST_FILE, code: `const deps = { systemExec: client, systemTxRunner: r };` },
      ],
      invalid: [
        {
          filename: USER_ROUTE,
          code: `const res = await deps.systemExec.query("select * from proxy_credentials");`,
          errors: [{ messageId: "systemPool" }],
        },
        {
          filename: USER_ROUTE,
          code: `await deps.systemTxRunner.run(ws, fn);`,
          errors: [{ messageId: "systemPool" }],
        },
        {
          filename: USER_ROUTE,
          code: `const url = process.env.SYSTEM_DATABASE_URL;`,
          errors: [{ messageId: "systemPool" }],
        },
        {
          filename: USER_ROUTE,
          code: `const p = new pg.Pool({ connectionString: env.systemDatabaseUrl });`,
          errors: [{ messageId: "systemPool" }],
        },
        {
          filename: "apps/web/src/server.ts",
          code: `const elevated = { query: systemExec.query };`,
          errors: [{ messageId: "systemPool" }],
        },
      ],
    });
  });
});
