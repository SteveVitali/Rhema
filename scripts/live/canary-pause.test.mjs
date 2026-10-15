// R5OPS.1 (REQ-OPS-1) — the canary pause driver's guard + evidence contract, pinned by source
// scan. The driver executes at import time (it IS the prod-write shell), so the arms are
// asserted on the file text — each fails if its check is removed.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SRC = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "canary-pause.mjs"),
  "utf8",
);

describe("canary-pause — fail-closed arms (the authorized prod write)", () => {
  it("dry-run is the default; --execute is required to touch prod", () => {
    expect(SRC).toContain('const dryRun = !args.includes("--execute")');
    expect(SRC).toMatch(/if \(dryRun\)[\s\S]*?process\.exit\(0\)/);
  });
  it("--execute refuses without the operator ack AND the system DSN", () => {
    expect(SRC).toMatch(/process\.env\.CANARY_ACK !== "yes"[\s\S]*?process\.exit\(3\)/);
    expect(SRC).toMatch(/!process\.env\.DATABASE_URL[\s\S]*?process\.exit\(3\)/);
  });
  it("the reason is constrained to the CHECK-constraint vocabulary", () => {
    expect(SRC).toContain('"suspicious_query", "egress_denied_spike", "user_source_fetch"');
    expect(SRC).toMatch(/!VALID_REASONS\.includes\(REASON\)[\s\S]*?process\.exit\(2\)/);
  });
  it("the canary never lands on a real tenant — non-is_test workspace refuses", () => {
    expect(SRC).toMatch(/!ws\.is_test[\s\S]*?canaries never touch real tenants/);
  });
});

describe("canary-pause — the synthetic run is cost- and human-inert", () => {
  it("inserts state='running' with requested_by NULL and zero credits", () => {
    expect(SRC).toMatch(/insert into runs[\s\S]*?'running'[\s\S]*?0,0,1,null,now\(\)/);
  });
  it("inserts exactly one pause_signals row carrying the canary marker", () => {
    expect(SRC).toMatch(/insert into pause_signals \(run_id, workspace_id, reason, detail\)/);
    expect(SRC).toContain('"R5OPS.1"');
  });
});

describe("canary-pause — observation + rollback", () => {
  it("waits for processed_at + waiting_gate then asserts the refusal gate shape", () => {
    expect(SRC).toContain('snap.run_state === "waiting_gate"');
    expect(SRC).toMatch(/g\.kind === "refusal" && g\.blocking && g\.on_expiry === "cancel"/);
    expect(SRC).toContain('"run.state_changed"');
    expect(SRC).toContain('"gate.opened"');
  });
  it("rollback is unconditional (finally): deletes the signal + the run (cascade) and verifies zero residue", () => {
    expect(SRC).toMatch(/finally[\s\S]*?delete from pause_signals where id = \$1/);
    expect(SRC).toMatch(/delete from runs where id = \$1/);
    expect(SRC).toMatch(/residue[\s\S]*?from gates where run_id/);
    expect(SRC).toMatch(/from run_events where run_id/);
  });
  it("pre-state capture precedes the write and the verdict is honest about partial observations", () => {
    expect(SRC.indexOf("evidence.pre_state")).toBeLessThan(SRC.indexOf("insert into runs"));
    expect(SRC).toContain("INCOMPLETE — drain observation did not reach waiting_gate+refusal");
  });
});
