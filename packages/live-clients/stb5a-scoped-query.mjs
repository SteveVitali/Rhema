// Scoped prod read: stb5a-scoped.mjs <workspaceId|-> <sql> [paramsJson]
// With a workspace id: BEGIN + set_config('app.tenant_id') + query + ROLLBACK (read-only).
// With "-": the plain unscoped query (what the anonymous api path sees).
import { execSync } from "node:child_process";
import pg from "pg";
const raw = execSync("gcloud secrets versions access latest --secret=rhema-prod-app-database-url --project=rhema-507501", { encoding: "utf8" }).trim();
const u = new URL(raw); u.hostname = "127.0.0.1"; u.port = "15433"; u.searchParams.set("sslmode", "disable");
const pool = new pg.Pool({ connectionString: u.toString() });
const [ws, sql, paramsJson] = process.argv.slice(2);
const params = paramsJson ? JSON.parse(paramsJson) : [];
const c = await pool.connect();
try {
  if (ws === "-") {
    const r = await c.query(sql, params);
    console.log(JSON.stringify(r.rows, null, 1).slice(0, 16000));
  } else {
    await c.query("begin");
    await c.query("select set_config('app.tenant_id', $1, true)", [ws]);
    const r = await c.query(sql, params);
    console.log(JSON.stringify(r.rows, null, 1).slice(0, 16000));
    await c.query("rollback");
  }
} finally { c.release(); await pool.end(); }
