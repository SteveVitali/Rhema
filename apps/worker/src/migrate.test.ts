// OPS.1 — the in-VPC migrate entry's pure contract: the preview-safe seed gate (REQ-ARCH-38), the
// generated-role LOGIN plan (REQ-SPEC-30), DSN parsing/quoting, and the maintenance-db bootstrap.

import { describe, it, expect } from "vitest";
import { createOrchestratorTestDb } from "@rhema/orchestrator/testing";
import {
  rolePasswordFromDsn,
  sqlQuotePassword,
  loginStatements,
  seedPlanFor,
  maintenanceDsn,
  seedInvitePlan,
  seedPreviewInviteRow,
  PREVIEW_INVITE_CODE_RE,
  PREVIEW_INVITE_MAX_USES,
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

// MAINT.6 (D-OPS.1-1) — the `--seed-invite` preview invite seam: pr-<n>-only admission, the
// deterministic code shape, and the idempotent upsert the verb relies on.
describe("seedInvitePlan — fail-closed admission for --seed-invite", () => {
  it("admits pr-<n> stages with the deterministic code shape", () => {
    expect(seedInvitePlan("pr-131", "prv-131-test")).toEqual({ ok: true });
    expect(seedInvitePlan("pr-7", "prv-7-test")).toEqual({ ok: true });
  });
  it("refuses dev/prod/anything-else — the verb is preview-only", () => {
    for (const stage of ["dev", "prod", "stage", "", "pr-test", "production"]) {
      const plan = seedInvitePlan(stage, "prv-1-test");
      expect(plan.ok, stage).toBe(false);
      if (!plan.ok) expect(plan.reason).toMatch(/pr-<n> preview/);
    }
  });
  it("refuses malformed/non-deterministic codes even on a pr-<n> stage", () => {
    for (const code of ["", "test", "invite-123", "BETA-123", "prv-x-test", "prv-1", "prv-1-test;drop"]) {
      const plan = seedInvitePlan("pr-1", code);
      expect(plan.ok, code).toBe(false);
    }
  });
});

describe("seedPreviewInviteRow — the idempotent code-bound upsert (PGlite)", () => {
  it("inserts one email-null, high-capacity invite and re-seeding preserves used_count", async () => {
    const db = await createOrchestratorTestDb();
    try {
      const sql = { query: (q: string, p?: unknown[]) => db.pg.query(q, p as unknown[]) as Promise<{ rows: unknown[] }> };
      const first = await seedPreviewInviteRow(sql, "prv-9-test");
      expect(first).toEqual({ code: "prv-9-test", usedCount: 0, maxUses: PREVIEW_INVITE_MAX_USES });
      const row = (
        await sql.query(
          `select email, max_uses, used_count, expires_at, revoked_at from invites where code = $1`,
          ["prv-9-test"],
        )
      ).rows[0] as { email: string | null; max_uses: number; used_count: number; expires_at: unknown; revoked_at: unknown };
      expect(row.email).toBeNull();
      expect(row.max_uses).toBe(PREVIEW_INVITE_MAX_USES);
      expect(row.used_count).toBe(0);
      expect(row.expires_at).toBeNull();
      expect(row.revoked_at).toBeNull();
      // simulate a redemption, then re-seed: the row is refreshed (un-revoked/un-expired) but the
      // count is preserved — the upsert never erases redemptions.
      await sql.query(`update invites set used_count = 3, revoked_at = now() where code = $1`, ["prv-9-test"]);
      const again = await seedPreviewInviteRow(sql, "prv-9-test");
      expect(again.usedCount).toBe(3);
      expect(again.maxUses).toBe(PREVIEW_INVITE_MAX_USES);
      const refreshed = (await sql.query(`select revoked_at, expires_at from invites where code = $1`, ["prv-9-test"]))
        .rows[0] as { revoked_at: unknown; expires_at: unknown };
      expect(refreshed.revoked_at).toBeNull();
      expect(refreshed.expires_at).toBeNull();
      // still exactly one row for the code — never a duplicate.
      const n = (await sql.query(`select count(*)::int n from invites where code = $1`, ["prv-9-test"]))
        .rows[0] as { n: number };
      expect(n.n).toBe(1);
    } finally {
      await db.close();
    }
  });
  it("the code shape the plan admits is exactly what preview-stack.mjs generates", () => {
    expect(PREVIEW_INVITE_CODE_RE.test("prv-131-test")).toBe(true);
    for (const bad of ["prv--test", "prv-1-", "prv-1-", "x-1-test", "PRV-1-TEST"]) {
      expect(PREVIEW_INVITE_CODE_RE.test(bad), bad).toBe(false);
    }
  });
});
