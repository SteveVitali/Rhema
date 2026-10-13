// OPS.1 — the in-VPC migrate entry's pure contract: the preview-safe seed gate (REQ-ARCH-38), the
// generated-role LOGIN plan (REQ-SPEC-30), DSN parsing/quoting, and the maintenance-db bootstrap.

import { describe, it, expect } from "vitest";
import {
  rolePasswordFromDsn,
  sqlQuotePassword,
  loginStatements,
  seedPlanFor,
  maintenanceDsn,
} from "./migrate.js";

describe("seedPlanFor — REQ-ARCH-38: real-project fixtures only on dev", () => {
  it("dev seeds the three-real-project fixture", () => {
    expect(seedPlanFor("dev").realProjects).toBe(true);
  });
  it("every preview-kind name refuses seedRealProjects", () => {
    for (const stage of ["pr-1", "pr-102", "pr-test", "anything-unknown"]) {
      const plan = seedPlanFor(stage);
      expect(plan.realProjects, stage).toBe(false);
      expect(plan.reason, stage).toMatch(/refused/);
    }
  });
});

describe("rolePasswordFromDsn — the generated role credentials ride inside their DSNs", () => {
  it("parses user + password from a postgres URL", () => {
    expect(rolePasswordFromDsn("postgresql://rhema_app_login:pw123@10.0.0.5:5432/rhema", "APP_DATABASE_URL")).toEqual({
      role: "rhema_app_login",
      password: "pw123",
    });
  });
  it("decodes percent-encoded password material", () => {
    expect(
      rolePasswordFromDsn("postgresql://rhema_collab:a%40b%2Fc@h:5432/rhema", "COLLAB_DATABASE_URL").password,
    ).toBe("a@b/c");
  });
  it("refuses an identifier-unsafe role name", () => {
    expect(() => rolePasswordFromDsn("postgresql://bad-user;pwd:pw@h/rhema", "X")).toThrow(/safe role identifier/);
  });
  it("refuses a DSN with no password", () => {
    expect(() => rolePasswordFromDsn("postgresql://rhema_app_login@h/rhema", "X")).toThrow(/no password/);
  });
  it("refuses an unparseable DSN", () => {
    expect(() => rolePasswordFromDsn("not a url", "X")).toThrow(/parseable/);
  });
});

describe("loginStatements — NOLOGIN→LOGIN for the generated roles (REQ-SPEC-30)", () => {
  it("emits ALTER ROLE … LOGIN PASSWORD for each role", () => {
    const stmts = loginStatements([
      { role: "rhema_app_login", password: "abc123" },
      { role: "rhema_collab", password: "xyz789" },
    ]);
    expect(stmts).toEqual([
      "alter role rhema_app_login login password E'abc123'",
      "alter role rhema_collab login password E'xyz789'",
    ]);
  });
  it("the statements carry NOLOGIN→LOGIN semantics — never SUPERUSER/BYPASSRLS", () => {
    const stmts = loginStatements([{ role: "rhema_collab", password: "p" }]);
    for (const s of stmts) {
      expect(s).not.toMatch(/superuser|bypassrls|createrole|createdb/i);
      expect(s).toMatch(/^alter role \S+ login password E'/);
    }
  });
});

describe("sqlQuotePassword — generated passwords can't break out of the literal", () => {
  it("escapes quotes and backslashes (E'' form)", () => {
    expect(sqlQuotePassword(`a'b\\c`)).toBe(`E'a\\'b\\\\c'`);
  });
  it("alnum passwords pass through unmodified", () => {
    expect(sqlQuotePassword("A1b2C3d4")).toBe("E'A1b2C3d4'");
  });
});

describe("maintenanceDsn — the create-database bootstrap targets the maintenance db", () => {
  it("rewrites /rhema → /postgres preserving credentials", () => {
    expect(maintenanceDsn("postgresql://postgres:pw@10.0.0.9:5432/rhema")).toBe(
      "postgresql://postgres:pw@10.0.0.9:5432/postgres",
    );
  });
});
