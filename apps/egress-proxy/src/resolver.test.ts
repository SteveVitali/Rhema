import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { createDbRunContextResolver } from "./resolver.js";
import type { SqlExecutor } from "./sinks.js";

const sha = (s: string) => createHash("sha256").update(s).digest("hex");

function fakeDb(rows: unknown[], capture?: (sql: string, params?: unknown[]) => void): SqlExecutor {
  return {
    query: (sql: string, params?: unknown[]) => {
      capture?.(sql, params);
      return Promise.resolve({ rows });
    },
  };
}

const joinRow = {
  context: {
    runId: "run_1",
    attempt: 2,
    agentId: "editor",
    role: "editor",
    workspaceId: "ws_1",
    billingAccountId: "ba_1",
    provider: "anthropic",
    modelTier: "balanced",
    rateTableVersion: 3,
    capCredits: 800,
  },
  endpoints: [{ host: "api.anthropic.com", pathPrefix: "/v1/messages" }],
  models: ["claude-opus-5"],
  url_policy: { blockedDomains: ["paywall.example"], knownDomains: ["a.test"], novelDomainCap: 5 },
};

describe("createDbRunContextResolver (proxy-local)", () => {
  it("hashes the credential and assembles the RunContext from the join row", async () => {
    let seenParams: unknown[] | undefined;
    const db = fakeDb([joinRow], (_sql, params) => (seenParams = params));
    const ctx = await createDbRunContextResolver(db, { now: () => new Date("2026-09-03T00:00:00Z") }).resolve("run_1.2.sec");
    expect(seenParams?.[0]).toBe(sha("run_1.2.sec")); // looked up by hash, not the raw secret
    expect(ctx).toMatchObject({
      runId: "run_1",
      attempt: 2,
      capCredits: 800,
      allowlist: { endpoints: [{ host: "api.anthropic.com", pathPrefix: "/v1/messages" }], models: ["claude-opus-5"] },
      urlPolicy: { blockedDomains: ["paywall.example"] },
      knownDomains: ["a.test"],
      novelDomainCap: 5,
    });
  });

  it("parses jsonb columns delivered as strings", async () => {
    const db = fakeDb([{ ...joinRow, context: JSON.stringify(joinRow.context), endpoints: JSON.stringify(joinRow.endpoints), url_policy: JSON.stringify(joinRow.url_policy) }]);
    const ctx = await createDbRunContextResolver(db).resolve("x");
    expect(ctx?.runId).toBe("run_1");
    expect(ctx?.allowlist.endpoints[0]?.host).toBe("api.anthropic.com");
  });

  it("returns null for an unknown/revoked/expired credential (no row)", async () => {
    expect(await createDbRunContextResolver(fakeDb([])).resolve("nope")).toBeNull();
  });
});
