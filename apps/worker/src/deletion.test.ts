import { describe, it, expect } from "vitest";
import {
  shouldPurgeProject,
  accountDeletionPlan,
  daysBetween,
  PROJECT_PURGE_AFTER_DAYS,
  ACCOUNT_GRACE_DAYS,
} from "./deletion.js";

const day = (n: number) => new Date(Date.UTC(2026, 0, 1 + n));

describe("shouldPurgeProject (REQ-ARCH-28)", () => {
  const tombstoned = day(0);
  it("keeps a project before the 30-day mark", () => {
    expect(shouldPurgeProject(tombstoned, day(29))).toBe(false);
  });
  it("purges a project at the 30-day mark (clock-advanced fixture, AC7)", () => {
    expect(shouldPurgeProject(tombstoned, day(PROJECT_PURGE_AFTER_DAYS))).toBe(true);
  });
  it("purges well past the mark", () => {
    expect(shouldPurgeProject(tombstoned, day(90))).toBe(true);
  });
});

describe("accountDeletionPlan (REQ-ACCT-4)", () => {
  const requested = day(0);
  it("is in grace before 14 days", () => {
    expect(accountDeletionPlan(requested, day(13)).phase).toBe("grace");
  });
  it("hard-deletes at 14 days, retaining anonymized ledger + Stripe customer", () => {
    const plan = accountDeletionPlan(requested, day(ACCOUNT_GRACE_DAYS));
    expect(plan.phase).toBe("hard-delete");
    expect(plan.retain).toContain("anonymized-ledger-rows");
    expect(plan.retain).toContain("stripe-customer");
  });
});

describe("daysBetween", () => {
  it("never goes negative", () => {
    expect(daysBetween(day(5), day(0))).toBe(0);
  });
});
