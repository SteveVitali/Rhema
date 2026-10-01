#!/usr/bin/env node
// HOT.1 — the additive-migration lint (ADR-013's standing authorization presupposes it; ADR-018 §8
// defines "role change"). Only migrations NEWER than a base may ship through the pre-authorized
// deploy lane — the base is the prod `_migrations` max or a git ref:
//
//   node scripts/check-additive-migrations.mjs --since-git origin/main   # files added since a ref
//   node scripts/check-additive-migrations.mjs --newer-than 0045          # numeric prefix > base
//   node scripts/check-additive-migrations.mjs --files a.sql b.sql        # explicit files
//
// A migration is NON-additive when it contains any of:
//   - DROP (table/column/role/policy/index/… — any DROP is a destroy)
//   - RENAME (ALTER … RENAME breaks the running code's old name)
//   - ALTER COLUMN … TYPE / SET DATA TYPE (a column rewrite)
//   - a table rewrite: ALTER COLUMN … SET NOT NULL without a `CHECK (col IS NOT NULL)` constraint in
//     the same file (PG14's CHECK-based path), or ADD COLUMN … DEFAULT <volatile fn>
//     (nextval/random/gen_random_uuid/clock_timestamp/…)
//   - a role change per ADR-018 §8: ALTER ROLE/USER, DROP ROLE/USER, ALTER DEFAULT PRIVILEGES,
//     GRANT <role> TO <role> or REVOKE <role> FROM <role> on a role not created in the same file,
//     or CREATE ROLE without NOLOGIN. (CREATE ROLE … NOLOGIN + table GRANT/REVOKE … ON is additive.)
//
// Exit 1 with one line per violation; exit 0 otherwise. The `contracts` CI job runs it against the
// PR base; the prod migrate runbook (scripts/live/prod-migrate-seed.mjs → integration's
// live-prod-bringup) runs it against the prod `_migrations` max before applying anything.

import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const MIGRATIONS_DIR = "packages/db/migrations";

const VOLATILE_DEFAULT =
  /\b(nextval|setval|random|gen_random_uuid|uuid_generate_v\d+|clock_timestamp|transaction_timestamp|statement_timestamp|txid_current|pg_postmaster_start_time)\b/i;

/** Strip `--` line comments, `/* *\/` blocks and dollar-quoted-string-safe… — comment removal only;
 *  the patterns below never legitimately appear inside a string literal in a migration. */
function stripComments(sql) {
  return sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");
}

export function violationsInSql(sql, file = "<inline>") {
  const body = stripComments(sql);
  const out = [];
  const hit = (re) => body.match(re);
  const push = (rule, detail) => out.push({ file, rule, detail });

  // --- destroys ---------------------------------------------------------
  if (/\bdrop\s+(role|user)\b/i.test(body))
    push("role_change", "DROP ROLE/USER is a role change (ADR-018 §8)");
  else if (/\bdrop\b/i.test(body)) push("drop", "DROP is destructive — not additive");

  if (/\brename\b/i.test(body)) push("rename", "RENAME breaks the deployed code's old name");

  // --- column/type rewrites ---------------------------------------------
  if (/\bset\s+data\s+type\b/i.test(body)) push("type_change", "SET DATA TYPE rewrites the column");
  const alterType = /\balter\s+(?:table\s+\S+\s+)?alter\s+(?:column\s+)?("?\w+"?)\s+type\b/gi;
  let m;
  while ((m = alterType.exec(body))) push("type_change", `ALTER … ${m[1]} TYPE rewrites the column`);

  // SET NOT NULL is a full-table scan unless a CHECK (… IS NOT NULL) proves the column first (PG14
  // honours a validated NOT NULL check to skip the rewrite).
  const setNotNull = /\balter\s+(?:column\s+)?("?\w+"?)\s+set\s+not\s+null\b/gi;
  while ((m = setNotNull.exec(body))) {
    const col = m[1].replaceAll('"', "");
    const checked = new RegExp(`check\\s*\\([^;]*\\b${col}\\b[^;]*\\bis\\s+not\\s+null`, "i").test(body);
    if (!checked)
      push("table_rewrite", `SET NOT NULL on ${col} without a CHECK (${col} IS NOT NULL) in the same file`);
  }

  // ADD COLUMN with a volatile default forces a rewrite on old PGs and a row-per-statement write on
  // all of them; `ADD COLUMN IF NOT EXISTS` with a constant/default-less column is additive.
  const addColDefault = /\badd\s+column\s+(?:if\s+not\s+exists\s+)?("?\w+"?)\s+[^;]*?\bdefault\s+([^;]+)/gi;
  while ((m = addColDefault.exec(body))) {
    if (VOLATILE_DEFAULT.test(m[2]))
      push("table_rewrite", `ADD COLUMN ${m[1]} DEFAULT ${m[2].trim().slice(0, 60)} is volatile`);
  }

  // --- role changes (ADR-018 §8) -----------------------------------------
  if (/\balter\s+(role|user)\b/i.test(body))
    push("role_change", "ALTER ROLE/USER changes an existing role (operator window)");
  if (/\balter\s+default\s+privileges\b/i.test(body))
    push("role_change", "ALTER DEFAULT PRIVILEGES is a role-surface change");

  const newRoles = new Set();
  for (const m2 of body.matchAll(/\bcreate\s+role\s+("?\w+"?)\s+([^;]*)/gi)) {
    const name = m2[1].replaceAll('"', "");
    if (!/\bnologin\b/i.test(m2[2]))
      push("role_change", `CREATE ROLE ${name} without NOLOGIN — attributes flip in the operator window`);
    newRoles.add(name);
  }
  // GRANT <role> TO <role> / REVOKE <role> FROM <role> — a privilege grant always carries `ON <obj>`;
  // a role-membership change does not.
  for (const m2 of body.matchAll(/\bgrant\s+([^;\n]*?)\s+to\s+("?\w+"?)/gi)) {
    if (!/\bon\b/i.test(m2[1]) && !newRoles.has(m2[2].replaceAll('"', "")))
      push("role_change", `GRANT ${m2[1].trim()} TO ${m2[2]} — role membership change on an existing role`);
  }
  for (const m2 of body.matchAll(/\brevoke\s+([^;\n]*?)\s+from\s+("?\w+"?)/gi)) {
    if (!/\bon\b/i.test(m2[1]) && !newRoles.has(m2[2].replaceAll('"', "")))
      push("role_change", `REVOKE ${m2[1].trim()} FROM ${m2[2]} — role membership change on an existing role`);
  }

  return out;
}

function repoRoot() {
  return resolve(dirname(fileURLToPath(import.meta.url)), "..");
}

/** Resolve which migration files to lint from the CLI args. Returns absolute paths. */
export function collectFiles(args, root = repoRoot()) {
  const dir = join(root, MIGRATIONS_DIR);
  const filesIdx = args.indexOf("--files");
  if (filesIdx !== -1) return args.slice(filesIdx + 1).map((f) => resolve(root, f));

  const ntIdx = args.indexOf("--newer-than");
  if (ntIdx !== -1) {
    const base = args[ntIdx + 1];
    return readdirSync(dir)
      .filter((f) => /^\d+_.*\.sql$/.test(f) && f.slice(0, 4).localeCompare(base.slice(0, 4)) > 0)
      .map((f) => join(MIGRATIONS_DIR, f));
  }

  const sgIdx = args.indexOf("--since-git");
  const ref = sgIdx !== -1 ? args[sgIdx + 1] : process.env.ADDITIVE_MIGRATIONS_BASE || "origin/main";
  const names = execFileSync("git", ["diff", "--name-only", `${ref}...HEAD`, "--", `${MIGRATIONS_DIR}/*.sql`], {
    cwd: root,
    encoding: "utf8",
  })
    .split("\n")
    .filter((f) => f.endsWith(".sql"));
  return names;
}

export function lintFiles(files, root = repoRoot()) {
  const violations = [];
  for (const f of files) violations.push(...violationsInSql(readFileSync(resolve(root, f), "utf8"), f));
  return violations;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const files = collectFiles(process.argv.slice(2));
  if (files.length === 0) {
    console.log("[additive-migrations] no migrations newer than the base — pass");
    process.exit(0);
  }
  const violations = lintFiles(files);
  if (violations.length > 0) {
    console.error(`[additive-migrations] ${violations.length} violation(s) in ${files.length} file(s):`);
    for (const v of violations) console.error(`  ${v.file}: [${v.rule}] ${v.detail}`);
    process.exit(1);
  }
  console.log(`[additive-migrations] ${files.length} migration(s) additive — pass`);
  for (const f of files) console.log(`  ${f}`);
}
