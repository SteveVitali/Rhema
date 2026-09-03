import { describe, it, expect } from "vitest";
import { RETENTION_SCHEDULE, RETENTION_CLASSES } from "./retention.js";

describe("retention schedule (§13.3; REQ-ARCH-29, AC7)", () => {
  it("has a rule for every §13.3 data class", () => {
    for (const c of RETENTION_CLASSES) {
      expect(RETENTION_SCHEDULE[c]).toBeDefined();
      expect(RETENTION_SCHEDULE[c].class).toBe(c);
    }
  });

  it("encodes the exact §13.3 retentions", () => {
    expect(RETENTION_SCHEDULE["sdk-transcripts"].days).toBe(30);
    expect(RETENTION_SCHEDULE["internal-events"].days).toBe(30);
    expect(RETENTION_SCHEDULE["audit"].days).toBe(90);
    expect(RETENTION_SCHEDULE["usage-and-ledger"].days).toBe(2555); // 7 years
    expect(RETENTION_SCHEDULE["restore-points"].days).toBeNull(); // per plan
  });
});
