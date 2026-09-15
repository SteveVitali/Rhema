import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createBenchmarkTestDb, testDeps } from "./testing/harness.js";
import type { BenchmarkTestDb } from "./testing/harness.js";
import {
  recordProviderVerification,
  revokeProviderVerification,
  providerTransmissible,
  assertProviderTransmissible,
  ProviderNotVerifiedError,
} from "./provider-verification.js";
import type { BenchmarkDeps } from "./types.js";

// REQ-EVAL-3 machinery: nothing is transmitted to a provider until its no-training/retention terms are verified in
// writing. This gate is what the P0.14 transmission path consults.

describe("provider no-training verification gate — REQ-EVAL-3", () => {
  let db: BenchmarkTestDb;
  let deps: BenchmarkDeps;
  const now = new Date("2026-09-03T00:00:00Z");
  beforeEach(async () => {
    db = await createBenchmarkTestDb();
    deps = testDeps(0);
  });
  afterEach(async () => {
    await db.close();
  });

  it("a provider with NO verification is not transmissible (the default — nothing transmitted)", async () => {
    expect(await providerTransmissible(db.exec, "anthropic", now)).toBe(false);
    await expect(assertProviderTransmissible(db.exec, "anthropic", now)).rejects.toBeInstanceOf(
      ProviderNotVerifiedError,
    );
  });

  it("a recorded, current verification makes the provider transmissible", async () => {
    await recordProviderVerification(db.exec, deps, {
      provider: "anthropic",
      termsRef: "dpa-2026-signed",
      verifiedAt: new Date("2026-08-01T00:00:00Z"),
    });
    expect(await providerTransmissible(db.exec, "anthropic", now)).toBe(true);
    await expect(assertProviderTransmissible(db.exec, "anthropic", now)).resolves.toBeUndefined();
    // a DIFFERENT provider is still barred
    expect(await providerTransmissible(db.exec, "openai", now)).toBe(false);
  });

  it("an expired verification is not transmissible", async () => {
    await recordProviderVerification(db.exec, deps, {
      provider: "google",
      termsRef: "terms",
      verifiedAt: new Date("2026-01-01T00:00:00Z"),
      expiresAt: new Date("2026-06-01T00:00:00Z"), // lapsed before `now`
    });
    expect(await providerTransmissible(db.exec, "google", now)).toBe(false);
  });

  it("a not-yet-effective verification is not transmissible until its verified_at", async () => {
    await recordProviderVerification(db.exec, deps, {
      provider: "anthropic",
      termsRef: "future",
      verifiedAt: new Date("2026-12-01T00:00:00Z"),
    });
    expect(await providerTransmissible(db.exec, "anthropic", now)).toBe(false);
  });

  it("a revoked verification makes the provider non-transmissible again", async () => {
    const id = await recordProviderVerification(db.exec, deps, {
      provider: "anthropic",
      termsRef: "terms",
      verifiedAt: new Date("2026-08-01T00:00:00Z"),
    });
    expect(await providerTransmissible(db.exec, "anthropic", now)).toBe(true);
    await revokeProviderVerification(db.exec, id, new Date("2026-09-01T00:00:00Z"));
    expect(await providerTransmissible(db.exec, "anthropic", now)).toBe(false);
  });
});
