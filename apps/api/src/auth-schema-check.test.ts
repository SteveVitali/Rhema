import { describe, expect, it } from "vitest";
import { createTestDb } from "@rhema/db/testing";
import { createAuth } from "./auth.js";

// 301_R6DEP.5 regression — better-auth 1.7.25 runs a runtime schema check (`ctx.checkSchema`,
// @better-auth/kysely-adapter's pg_catalog introspection vs the adapter's expected shape) on EVERY
// auth request, and a mismatch is cached and rethrown: the whole auth surface 500s. 1.7.2's
// `account.issuer` NOT NULL tripped it ("Required columns Better Auth never writes") — reproduced
// live against the preview and the prod schema before 0065 landed. This exercises the real check
// through the real createAuth config against the real migrated schema — PGlite, via the
// pg.Pool-shaped shim the adapter's `"connect" in db` → PostgresDialect detection requires.

const SECRETS = {
  baseURL: "https://app.test",
  betterAuthSecret: "s".repeat(48),
  googleClientId: "client.apps.googleusercontent.com",
  googleClientSecret: "client-secret",
  trustedOrigins: ["https://app.test", "https://api.test"],
};

function poolFor(db: Awaited<ReturnType<typeof createTestDb>>) {
  return {
    connect: async () => ({ query: (sql: string, params?: unknown[]) => db.query(sql, params), release: () => {} }),
    query: (sql: string, params?: unknown[]) => db.query(sql, params),
    end: async () => {},
  } as Parameters<typeof createAuth>[1];
}

describe("better-auth runtime schema check", () => {
  it("passes against the fully migrated schema", async () => {
    const db = await createTestDb();
    try {
      const auth = createAuth(SECRETS, poolFor(db), async () => {});
      const res = await auth.handler(new Request("https://api.test/api/auth/ok"));
      expect(res.status).toBe(200);
    } finally {
      await db.close();
    }
  });

  it("flags the pre-0065 schema (account.issuer NOT NULL)", async () => {
    const db = await createTestDb({ until: "0064_outbox.sql" });
    try {
      const auth = createAuth(SECRETS, poolFor(db), async () => {});
      await expect(auth.handler(new Request("https://api.test/api/auth/ok"))).rejects.toThrow(
        /schema mismatch/i,
      );
    } finally {
      await db.close();
    }
  });
});
