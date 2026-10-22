// R6OPS.1 (REQ-DEP-2(a)) — the restore-drill driver's guard + evidence contract, pinned by
// source scan. The driver executes at import time (it IS the prod-mutation shell), so the
// arms are asserted on the file text — each fails if its check is removed.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SRC = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "restore-drill.mjs"),
  "utf8",
);

describe("restore-drill — fail-closed arms (GD-PREAUTH-ACTS.R6 scope: ONE scratch instance)", () => {
  it("dry-run is the default; --execute is required to touch anything", () => {
    expect(SRC).toContain('const dryRun = !args.includes("--execute")');
    expect(SRC).toMatch(/if \(dryRun\)[\s\S]*?process\.exit\(0\)/);
  });
  it("--execute refuses without the operator ack AND the system DSN", () => {
    expect(SRC).toMatch(/process\.env\.RESTORE_DRILL_ACK !== "yes"[\s\S]*?process\.exit\(3\)/);
    expect(SRC).toMatch(/!process\.env\.DATABASE_URL[\s\S]*?process\.exit\(3\)/);
  });
  it("the only Cloud SQL mutations are clone into the SCRATCH name + delete the SCRATCH name", () => {
    expect(SRC).toMatch(/"sql", "instances", "clone", SOURCE, SCRATCH/);
    expect(SRC).toMatch(/"sql", "instances", "delete", SCRATCH/);
    // the live instance is never a mutation target — describe/list are the only reads of SOURCE
    expect(SRC).not.toMatch(/"delete", SOURCE|"patch", SOURCE|"instances", "restart"/);
  });
});

describe("restore-drill — PITR + verify shape", () => {
  it("pre-state capture precedes the clone and carries T0 + counts + a tenant read", () => {
    expect(SRC.indexOf("evidence.pre_state")).toBeLessThan(SRC.indexOf("instances\", \"clone"));
    expect(SRC).toMatch(/not is_test order by created_at desc limit 1/);
  });
  it("the restore point is the captured T0 unless --point-in-time overrides", () => {
    expect(SRC).toContain("const pitrPoint = PIT_FLAG ?? evidence.pre_state.t0");
  });
  it("RTO is measured clone-start → first verified read", () => {
    expect(SRC).toContain("cloneStart");
    expect(SRC).toMatch(/rto_seconds: Math\.round\(\(verifiedAt\.getTime\(\) - cloneStart\)/);
  });
  it("verify asserts scratch counts == T0 counts and the tenant row reads back", () => {
    expect(SRC).toMatch(/counts_match: mismatches\.length === 0/);
    expect(SRC).toContain("tenant_read: tenantOk");
  });
});

describe("restore-drill — destroy is unconditional and verified", () => {
  it("destroy runs in finally even on a failed verify, and absence is asserted", () => {
    expect(SRC).toMatch(/finally[\s\S]*?instances", "delete", SCRATCH/);
    expect(SRC).toContain("verified_absent");
  });
  it("deletion-protection on the scratch is cleared before delete when set", () => {
    expect(SRC).toContain("--no-deletion-protection");
  });
});
