// R6OPS.1 (REQ-DEP-2(c)) — the egress-drill driver's guard + playbook contract, pinned by
// source scan. The driver executes at import time (it IS the prod-write shell), so the
// arms are asserted on the file text — each fails if its check is removed.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SRC = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "egress-drill.mjs"),
  "utf8",
);

describe("egress-drill — fail-closed arms (the one authorized canary write)", () => {
  it("dry-run is the default; --execute is required to touch prod", () => {
    expect(SRC).toContain('const dryRun = !args.includes("--execute")');
    expect(SRC).toMatch(/if \(dryRun\)[\s\S]*?process\.exit\(0\)/);
  });
  it("--execute refuses without the operator ack AND the system DSN", () => {
    expect(SRC).toMatch(/process\.env\.EGRESS_DRILL_ACK !== "yes"[\s\S]*?process\.exit\(3\)/);
    expect(SRC).toMatch(/!process\.env\.DATABASE_URL[\s\S]*?process\.exit\(3\)/);
  });
  it("the canary never lands on a real tenant — non-is_test workspace refuses", () => {
    expect(SRC).toMatch(/!ws\.is_test[\s\S]*?canaries never touch real tenants/);
  });
});

describe("egress-drill — the planted spike is cost- and human-inert", () => {
  it("inserts state='running' with requested_by NULL and zero credits (canary-pause shape)", () => {
    expect(SRC).toMatch(/insert into runs[\s\S]*?'running'[\s\S]*?0,0,1,null,now\(\)/);
  });
  it("plants a fetch_log deny spike + one egress_denied_spike pause_signals row", () => {
    expect(SRC).toMatch(/insert into fetch_log[\s\S]*?'deny', 'domain_blocklist'/);
    expect(SRC).toContain("insert into pause_signals (run_id, workspace_id, reason, detail)");
    expect(SRC).toContain("'egress_denied_spike'");
  });
});

describe("egress-drill — the playbook legs are executed, not claimed", () => {
  it("detect waits for processed_at + waiting_gate + the refusal gate shape", () => {
    expect(SRC).toContain('snap.run_state === "waiting_gate"');
    expect(SRC).toMatch(/g\.kind === "refusal" && g\.blocking && g\.on_expiry === "cancel"/);
  });
  it("diagnose runs the playbook's verbatim deny_reason distribution query", () => {
    expect(SRC).toContain("select run_id, status, deny_reason, count(*)");
  });
  it("the negative control reads the egress_denied_10m probe with NOT_FROM_TEST_RUN verbatim", () => {
    expect(SRC).toContain("not exists (select 1 from runs r join workspaces w on w.id = r.workspace_id");
    expect(SRC).toContain("decision = 'deny'");
    expect(SRC).toContain("interval '10 minutes'");
    expect(SRC).toContain("excluded: probeAfter === evidence.pre_state.egress_probe");
  });
  it("rollback is unconditional (finally) and asserts zero residue incl. fetch_log", () => {
    expect(SRC).toMatch(/finally[\s\S]*?delete from pause_signals where id = \$1/);
    expect(SRC).toMatch(/delete from fetch_log where run_id = \$1/);
    expect(SRC).toMatch(/delete from runs where id = \$1/);
    expect(SRC).toMatch(/fetch_log:[\s\S]*?from fetch_log where run_id/);
  });
  it("records the timeline legs the report cites", () => {
    for (const leg of ["pre_state", "planted", "detected", "diagnosed", "contained_verified", "rolled_back"])
      expect(SRC).toContain(`"${leg}"`);
  });
});
