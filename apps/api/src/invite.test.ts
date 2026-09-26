import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createOrchestratorTestDb, seedProject, type OrchestratorTestDb } from "@rhema/orchestrator/testing";
import { createInviteGate, type SqlClient } from "./invite.js";

// AC1 (invite gating). The gate refuses signup without a valid invite and accepts with one; a code cannot be
// reused past max_uses. Deterministic on PGlite.

let db: OrchestratorTestDb;
let sql: SqlClient;
let seed: Awaited<ReturnType<typeof seedProject>>;
const NOW = new Date("2026-09-15T00:00:00Z");
const now = () => NOW;

beforeEach(async () => {
  db = await createOrchestratorTestDb();
  sql = { query: (q, p) => db.pg.query(q, p as unknown[]) as Promise<{ rows: unknown[] }> };
  seed = await seedProject(db, { draftN: 1 });
});
afterEach(() => db.close());

async function insertInvite(over: Record<string, unknown> = {}) {
  const row = {
    code: "BETA-123",
    email: null,
    max_uses: 1,
    used_count: 0,
    expires_at: null,
    revoked_at: null,
    ...over,
  };
  await db.pg.query(
    `insert into invites (code, email, max_uses, used_count, expires_at, revoked_at)
       values ($1,$2,$3,$4,$5,$6)`,
    [row.code, row.email, row.max_uses, row.used_count, row.expires_at, row.revoked_at],
  );
}

describe("invite gate — check", () => {
  it("refuses an unknown, empty, revoked, expired or exhausted code", async () => {
    const gate = createInviteGate(sql, { now });
    expect(await gate.check("NOPE")).toEqual({ ok: false, reason: "unknown" });
    expect(await gate.check("")).toEqual({ ok: false, reason: "unknown" });

    await insertInvite({ code: "REV", revoked_at: NOW });
    expect(await gate.check("REV")).toMatchObject({ ok: false, reason: "revoked" });

    await insertInvite({ code: "EXP", expires_at: new Date("2026-09-14T00:00:00Z") });
    expect(await gate.check("EXP")).toMatchObject({ ok: false, reason: "expired" });

    await insertInvite({ code: "USED", max_uses: 1, used_count: 1 });
    expect(await gate.check("USED")).toMatchObject({ ok: false, reason: "exhausted" });
  });

  it("accepts a valid code, case-insensitively", async () => {
    await insertInvite({ code: "BETA-123" });
    const gate = createInviteGate(sql, { now });
    expect(await gate.check("beta-123")).toEqual({ ok: true });
    expect(await gate.check("  BETA-123 ")).toEqual({ ok: true });
  });

  it("enforces an email-bound (allowlist) invite", async () => {
    await insertInvite({ code: "ALLOW", email: "partner@example.com" });
    const gate = createInviteGate(sql, { now });
    expect(await gate.check("ALLOW")).toMatchObject({ ok: false, reason: "email_mismatch" });
    expect(await gate.check("ALLOW", "other@example.com")).toMatchObject({
      ok: false,
      reason: "email_mismatch",
    });
    expect(await gate.check("ALLOW", "Partner@Example.com")).toEqual({ ok: true });
  });
});

describe("invite gate — consume", () => {
  it("claims one use, records a redemption, and refuses reuse past max_uses", async () => {
    await insertInvite({ code: "ONCE", max_uses: 1 });
    const gate = createInviteGate(sql, { now });

    expect(await gate.consume("ONCE", seed.userId)).toEqual({ ok: true });
    const red = await db.pg.query(`select code, user_id from invite_redemptions where lower(code)='once'`);
    expect(red.rows.length).toBe(1);
    const used = await db.pg.query(`select used_count from invites where code='ONCE'`);
    expect((used.rows[0] as { used_count: number }).used_count).toBe(1);

    // a different user cannot take the exhausted seat
    expect(await gate.consume("ONCE", seed.userId + "-other")).toMatchObject({
      ok: false,
      reason: "exhausted",
    });
  });

  it("is idempotent for the same user (no double-claim)", async () => {
    await insertInvite({ code: "MULTI", max_uses: 3 });
    const gate = createInviteGate(sql, { now });
    await gate.consume("MULTI", seed.userId);
    await gate.consume("MULTI", seed.userId);
    const used = await db.pg.query(`select used_count from invites where code='MULTI'`);
    expect((used.rows[0] as { used_count: number }).used_count).toBe(1);
  });

  it("enforces an email-bound invite at consume, and claims exactly one seat", async () => {
    await insertInvite({ code: "BOUND", email: "partner@example.com", max_uses: 1 });
    const gate = createInviteGate(sql, { now });
    // wrong / missing email cannot consume
    expect(await gate.consume("BOUND", seed.userId, "other@example.com")).toMatchObject({
      ok: false,
      reason: "email_mismatch",
    });
    expect(await gate.consume("BOUND", seed.userId)).toMatchObject({ ok: false, reason: "email_mismatch" });
    // the bound email consumes once
    expect(await gate.consume("BOUND", seed.userId, "Partner@Example.com")).toEqual({ ok: true });
    const used = await db.pg.query(`select used_count from invites where code='BOUND'`);
    expect((used.rows[0] as { used_count: number }).used_count).toBe(1);
  });

  it("allows max_uses distinct redemptions then stops", async () => {
    await insertInvite({ code: "COHORT", max_uses: 2 });
    // seed a couple more users for the FK
    await db.pg.query(`insert into "user" (id, email) values ('u2','u2@x.com'),('u3','u3@x.com')`);
    const gate = createInviteGate(sql, { now });
    expect(await gate.consume("COHORT", seed.userId)).toEqual({ ok: true });
    expect(await gate.consume("COHORT", "u2")).toEqual({ ok: true });
    expect(await gate.consume("COHORT", "u3")).toMatchObject({ ok: false, reason: "exhausted" });
  });
});
