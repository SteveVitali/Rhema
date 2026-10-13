import { execSync } from "node:child_process";
import pg from "pg";
const raw = execSync("gcloud secrets versions access latest --secret=rhema-prod-app-database-url --project=rhema-507501", { encoding: "utf8" }).trim();
const u = new URL(raw);
u.hostname = "127.0.0.1"; u.port = "15433";
// keep user/pass; alloydb ssl may need disable locally
u.searchParams.set("sslmode", "disable");
const pool = new pg.Pool({ connectionString: u.toString() });
const sql = process.argv[2];
const params = process.argv[3] ? JSON.parse(process.argv[3]) : [];
try {
  const r = await pool.query(sql, params);
  console.log(JSON.stringify(r.rows, null, 1).slice(0, 12000));
} finally { await pool.end(); }
