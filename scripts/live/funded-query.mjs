#!/usr/bin/env node
// Funded-window helper — run a read-only SQL query against prod over the IAP tunnel.
//   DATABASE_URL=<system dsn> node scripts/live/funded-query.mjs "select …" '["$1",…]'
// Prints rows as JSON. Read-only enforced: the statement runs inside BEGIN … ROLLBACK.
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
const require = createRequire(
  resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "integration", "package.json"),
);
const pg = require("pg");

const sql = process.argv[2];
const params = process.argv[3] ? JSON.parse(process.argv[3]) : [];
if (!sql) {
  console.error("usage: funded-query.mjs \"<sql>\" [params-json]");
  process.exit(2);
}
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
try {
  const c = await pool.connect();
  try {
    await c.query("begin read only");
    const r = await c.query(sql, params);
    console.log(JSON.stringify(r.rows, null, 1));
  } finally {
    await c.query("rollback").catch(() => undefined);
    c.release();
  }
} finally {
  await pool.end();
}
