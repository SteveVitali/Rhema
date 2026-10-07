import { describe, expect, it } from "vitest";
import {
  DELIVERY_LABEL_DISPLAY,
  PLATFORM_FAULT_RESEARCH_PREFLIGHT,
  PLATFORM_FAULT_ZERO_COVERAGE,
  deliveryLabelFromRow,
  isCheckableClaimTier,
  isPlatformFaultRefund,
  isSuccessfulDelivery,
  isUnverifiedDelivery,
  runDeliverySchema,
} from "./delivery-label.js";

// RES.2 (REQ-SPEC-31(3)) — the Unverified delivery predicate + the platform-fault refund class.
// The predicate is one sentence: ≥1 checkable Tier-1/2 claim AND zero covered. Partial coverage is NOT
// Unverified; a claim inventory with no Tier-1/2 claim is NOT Unverified.

describe("isUnverifiedDelivery — the zero-coverage predicate", () => {
  it("zero coverage with ≥1 checkable claim → Unverified (the incident fixture)", () => {
    expect(isUnverifiedDelivery({ checkableClaims: 16, coveredClaims: 0 })).toBe(true);
    expect(isUnverifiedDelivery({ checkableClaims: 1, coveredClaims: 0 })).toBe(true);
  });

  it("partial coverage → NOT Unverified (one fetched Tier-1 claim of nine)", () => {
    expect(isUnverifiedDelivery({ checkableClaims: 9, coveredClaims: 1 })).toBe(false);
    expect(isUnverifiedDelivery({ checkableClaims: 9, coveredClaims: 9 })).toBe(false);
  });

  it("no Tier-1/2 claims → NOT Unverified (nothing was checkable)", () => {
    expect(isUnverifiedDelivery({ checkableClaims: 0, coveredClaims: 0 })).toBe(false);
  });
});

describe("isCheckableClaimTier — Tier-1/2 are the checkable inventory", () => {
  it("tiers 1 and 2 checkable; 3/4/missing are not", () => {
    expect(isCheckableClaimTier(1)).toBe(true);
    expect(isCheckableClaimTier(2)).toBe(true);
    expect(isCheckableClaimTier(3)).toBe(false);
    expect(isCheckableClaimTier(4)).toBe(false);
    expect(isCheckableClaimTier(null)).toBe(false);
    expect(isCheckableClaimTier(undefined)).toBe(false);
  });
});

describe("runDeliverySchema + deliveryLabelFromRow — the persisted write-once blob", () => {
  it("parses the delivery row + merged settlement markers", () => {
    const row = {
      label: "unverified",
      checkableClaims: 16,
      coveredClaims: 0,
      refundedCredits: 40,
      platformFaultSettledAt: "2026-10-01T00:00:00.000Z",
      trialRestoredAt: "2026-10-01T00:00:01.000Z",
      alerted: true,
    };
    expect(runDeliverySchema.safeParse(row).success).toBe(true);
    expect(deliveryLabelFromRow(row)).toBe("unverified");
    // a JSON string row (pg can hand jsonb either way) parses the same.
    expect(deliveryLabelFromRow(JSON.stringify(row))).toBe("unverified");
  });

  it("null / malformed / non-unverified rows read no label", () => {
    expect(deliveryLabelFromRow(null)).toBeNull();
    expect(deliveryLabelFromRow(undefined)).toBeNull();
    expect(deliveryLabelFromRow("not json")).toBeNull();
    expect(deliveryLabelFromRow({ label: "unverified" })).toBeNull(); // counts missing → malformed
    expect(deliveryLabelFromRow({ label: "verified", checkableClaims: 1, coveredClaims: 0 })).toBeNull();
    expect(deliveryLabelFromRow({ checkableClaims: 4, coveredClaims: 0 })).toBeNull(); // no label key
  });

  it("the display copy is the reserved D.2 word", () => {
    expect(DELIVERY_LABEL_DISPLAY.unverified).toBe("Unverified");
  });
});

describe("isSuccessfulDelivery — the one success predicate", () => {
  it("an Unverified run completed but is never a success", () => {
    expect(isSuccessfulDelivery({ state: "completed" })).toBe(true);
    expect(isSuccessfulDelivery({ state: "completed", deliveryLabel: null })).toBe(true);
    expect(isSuccessfulDelivery({ state: "completed", deliveryLabel: "unverified" })).toBe(false);
    expect(isSuccessfulDelivery({ state: "failed" })).toBe(false);
    expect(isSuccessfulDelivery({ state: "completed_partial" })).toBe(false);
  });
});

describe("the platform-fault refund class", () => {
  it("`platform_fault:zero_coverage` / `platform_fault:research_preflight_failed` are the class", () => {
    expect(PLATFORM_FAULT_ZERO_COVERAGE).toBe("platform_fault:zero_coverage");
    expect(PLATFORM_FAULT_RESEARCH_PREFLIGHT).toBe("platform_fault:research_preflight_failed");
  });

  it("isPlatformFaultRefund: true for the class, false for ordinary refunds + non-refunds", () => {
    expect(isPlatformFaultRefund({ kind: "refund", reason: PLATFORM_FAULT_ZERO_COVERAGE })).toBe(true);
    expect(isPlatformFaultRefund({ kind: "refund", reason: "platform_fault:research_preflight_failed" })).toBe(true);
    expect(isPlatformFaultRefund({ kind: "refund", reason: null })).toBe(false);
    expect(isPlatformFaultRefund({ kind: "refund", reason: "user stop" })).toBe(false);
    expect(isPlatformFaultRefund({ kind: "refund", reason: "reconcile_drift" })).toBe(false);
    expect(isPlatformFaultRefund({ kind: "debit", reason: PLATFORM_FAULT_ZERO_COVERAGE })).toBe(false);
    expect(isPlatformFaultRefund({ kind: "refund" })).toBe(false);
  });
});
