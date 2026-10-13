// Reproduce the /account/import 500: run importAccountZip against prod inside a rolled-back tx.
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import pg from "pg";
const { importAccountZip } = await import("../archive/dist/import.js");
const raw = execSync("gcloud secrets versions access latest --secret=rhema-prod-app-database-url --project=rhema-507501", { encoding: "utf8" }).trim();
const u = new URL(raw); u.hostname = "127.0.0.1"; u.port = "15433"; u.searchParams.set("sslmode", "disable");
const pool = new pg.Pool({ connectionString: u.toString() });
const ws = process.argv[2];       // any test workspace id
const uid = process.argv[3];      // its user id
const zipBytes = new Uint8Array(readFileSync(process.argv[4] ?? "/tmp/stb5a-export.zip"));
const c = await pool.connect();
try {
  await c.query("begin");
  await c.query("select set_config('app.tenant_id', $1, true)", [ws]);
  const exec = { query: (sql, params) => c.query(sql, params) };
  const store = { put: async () => ({ key: "x" }), get: async () => null };
  const res = await importAccountZip({ exec, store, workspaceId: ws, userId: uid, zipBytes });
  console.log("IMPORT RESULT:", JSON.stringify(res));
} catch (e) {
  console.log("IMPORT FAILED:", e?.message, "| code:", e?.code, "| constraint:", e?.constraint, "| detail:", e?.detail, "| table:", e?.table, "| column:", e?.column);
} finally {
  await c.query("rollback").catch(() => {});
  c.release(); await pool.end();
}
