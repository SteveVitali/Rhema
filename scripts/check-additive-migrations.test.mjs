import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { lintFiles, violationsInSql, collectFiles } from "./check-additive-migrations.mjs";

// HOT.1 / ADR-013 + ADR-018 §8 — the additive-migration lint's contract: DROP / RENAME / type
// changes / table rewrites / role changes are rejected; SEC.1's new-NOLOGIN-role pattern and
// `ADD COLUMN IF NOT EXISTS` pass. Violations report the file + rule id so the CI log is readable.

const rules = (sql) => violationsInSql(sql).map((v) => v.rule);

describe("rejections — the non-additive shapes", () => {
  it("rejects DROP TABLE / DROP COLUMN / DROP POLICY", () => {
    expect(rules("drop table projects;")).toEqual(["drop"]);
    expect(rules("alter table t drop column c;")).toEqual(["drop"]);
    expect(rules("drop policy if exists p on t;")).toEqual(["drop"]);
  });

  it("rejects RENAME", () => {
    expect(rules("alter table runs rename ended_at to finished_at;")).toEqual(["rename"]);
    expect(rules("alter table t rename column a to b;")).toEqual(["rename"]);
  });

  it("rejects ALTER COLUMN … TYPE and SET DATA TYPE", () => {
    expect(rules("alter table t alter column c type bigint;")).toEqual(["type_change"]);
    expect(rules("alter table t alter c type text;")).toEqual(["type_change"]);
    expect(rules("alter table t alter column c set data type bigint;")).toEqual(["type_change"]);
  });

  it("rejects SET NOT NULL without a CHECK, accepts it with the PG14 check path", () => {
    expect(rules("alter table t alter column c set not null;")).toEqual(["table_rewrite"]);
    expect(
      rules("alter table t add constraint t_c_nn check (c is not null) not valid; alter table t alter column c set not null;"),
    ).toEqual([]);
  });

  it("rejects ADD COLUMN with a volatile default, accepts constant/no-default columns", () => {
    expect(rules("alter table t add column c uuid default gen_random_uuid();")).toEqual(["table_rewrite"]);
    expect(rules("alter table t add column c int default nextval('s');")).toEqual(["table_rewrite"]);
    expect(rules("alter table t add column if not exists c int default 0;")).toEqual([]);
    expect(rules("alter table t add column if not exists c timestamptz;")).toEqual([]);
  });

  it("rejects the ADR-018 role-change shapes", () => {
    expect(rules("alter role rhema_app login;")).toEqual(["role_change"]);
    expect(rules("alter user postgres bypassrls;")).toEqual(["role_change"]);
    expect(rules("drop role rhema_app_login;")).toEqual(["role_change"]);
    expect(rules("alter default privileges grant select on t to rhema_app;")).toEqual(["role_change"]);
    expect(rules("grant rhema_app to postgres;")).toEqual(["role_change"]);
    expect(rules("revoke rhema_app from rhema_app_login;")).toEqual(["role_change"]);
    expect(rules("create role x login password 'p';")).toEqual(["role_change"]);
  });
});

describe("acceptance — the additive shapes", () => {
  it("accepts SEC.1's migration 0045 verbatim (new NOLOGIN role + table grant/revoke)", () => {
    const violations = lintFiles(["packages/db/migrations/0045_user_serving_role.sql"]);
    expect(violations).toEqual([]);
  });

  it("accepts plain DDL: CREATE TABLE, ADD COLUMN IF NOT EXISTS, table grants", () => {
    expect(
      rules(`
        create table if not exists t (id text primary key, n int);
        alter table t add column if not exists extra text;
        create index if not exists t_n on t(n);
        grant select, insert on t to rhema_app;
        revoke delete on t from rhema_app;
      `),
    ).toEqual([]);
  });

  it("a role grant to a role created in the same file is additive; to a foreign role is not", () => {
    expect(
      rules("create role r_new nologin; grant rhema_app to r_new; grant insert on t to r_new;"),
    ).toEqual([]);
    expect(rules("create role r_new nologin; grant r_new to postgres;")).toEqual(["role_change"]);
  });

  it("ignores DROP/ALTER inside comments", () => {
    expect(rules("-- drop table t; /* alter role x login */ create table t2 (id text);")).toEqual([]);
  });
});

describe("collectFiles — the base selection", () => {
  it("--newer-than selects strictly-later numeric prefixes", () => {
    const files = collectFiles(["--newer-than", "0044"]);
    expect(files).toEqual(["packages/db/migrations/0045_user_serving_role.sql"]);
  });

  it("--files passes explicit paths through", () => {
    const files = collectFiles(["--files", "packages/db/migrations/0045_user_serving_role.sql"]);
    expect(files).toHaveLength(1);
  });

  it("lintFiles reports the file name on a fixture violation", () => {
    const dir = mkdtempSync(join(tmpdir(), "addmig-"));
    const f = join(dir, "9999_bad.sql");
    writeFileSync(f, "alter table t rename a to b;");
    const violations = lintFiles([f]);
    expect(violations).toHaveLength(1);
    expect(violations[0].file).toBe(f);
    expect(violations[0].rule).toBe("rename");
  });
});
