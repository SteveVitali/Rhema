import { describe, it, expect } from "vitest";
import { handleProjectPurge, handleAccountHardDelete } from "./jobs.js";

const day = (n: number) => new Date(Date.UTC(2026, 0, 1 + n));

describe("handleProjectPurge (project.purge consumer)", () => {
  it("does not purge before 30 days", async () => {
    const r = await handleProjectPurge(
      { tenantId: "t", projectId: "p", tombstonedAt: day(0).toISOString() },
      day(29),
    );
    expect(r).toEqual({ projectId: "p", purged: false });
  });
  it("purges at the 30-day mark", async () => {
    const r = await handleProjectPurge(
      { tenantId: "t", projectId: "p", tombstonedAt: day(0).toISOString() },
      day(30),
    );
    expect(r.purged).toBe(true);
  });
});

describe("handleAccountHardDelete (account.hard-delete consumer)", () => {
  it("stays in grace before 14 days", async () => {
    const r = await handleAccountHardDelete(
      { tenantId: "t", userId: "u", deletionRequestedAt: day(0).toISOString() },
      day(10),
    );
    expect(r.phase).toBe("grace");
    expect(r.userId).toBe("u");
  });
  it("hard-deletes at 14 days, retaining tax-required data", async () => {
    const r = await handleAccountHardDelete(
      { tenantId: "t", userId: "u", deletionRequestedAt: day(0).toISOString() },
      day(14),
    );
    expect(r.phase).toBe("hard-delete");
    expect(r.retain).toContain("anonymized-ledger-rows");
    expect(r.retain).toContain("stripe-customer");
  });
});
