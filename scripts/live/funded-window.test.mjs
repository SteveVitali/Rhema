// R5ECON.1 (REQ-ECON-6/7/8/9; O2-F11) — the funded-window driver's guard contract, pinned by
// source scan. The driver executes at import time (it IS the paid-dispatch shell), so the
// guard arms are asserted on the file text — each leg fails if its check is removed.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SRC = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "funded-window.mjs"),
  "utf8",
);

describe("funded-window — REQ-ECON-6 the guard scope", () => {
  it("EVERY spend query consumes the shared FLAGGED_PROXY_SPEND_SCOPE (weekly AND cumulative)", () => {
    // both guard reads must go through the one fragment — a hand-rolled predicate here is
    // exactly how the unfiltered cumulative shipped (O2-F11 summed ALL prod usage_records).
    expect(SRC.match(/from usage_records u join workspaces w on w\.id = u\.workspace_id/g)).toHaveLength(2);
    expect(SRC.match(/where \$\{FLAGGED_PROXY_SPEND_SCOPE\}/g)).toHaveLength(2);
  });
  it("no unscoped usage_records sum survives — the O2-F11 defect arm", () => {
    // the defect's exact shape: a cumulative sum with no workspaces join / no flag+source pin.
    expect(SRC).not.toMatch(/from\s+usage_records\s+where\s+ts\s*>=/);
    expect(SRC).not.toMatch(/from\s+usage_records\s+(?!u\b)/); // never read the table unaliased
  });
  it("the scope constant is imported from the journeys dist — one source for all three guards", () => {
    expect(SRC).toContain("FLAGGED_PROXY_SPEND_SCOPE,");
    // and the shared fragment itself carries the seed-marker exclusion (pinned in
    // packages/journeys/src/spend-guard.test.ts).
  });
});

describe("funded-window — REQ-ECON-9 headroom + REQ-ECON-8 DSN + REQ-ECON-7 pause", () => {
  it("--headroom is REQUIRED on every dispatch: missing ⇒ exit 3, malformed ⇒ exit 2", () => {
    expect(SRC).toContain("requires --headroom <legCapUsd>");
    expect(SRC).toMatch(/headroomRaw === undefined[\s\S]*?process\.exit\(3\)/);
    expect(SRC).toMatch(/!Number\.isFinite\(headroom\).*?process\.exit\(2\)/s);
    // and it actually pre-flights: cumulative + leg cap crossing the round bound refuses.
    expect(SRC).toMatch(/cumUsd\s*\+\s*headroom\s*>\s*ROUND3_CAP[\s\S]*?process\.exit\(3\)/);
  });
  it("still fails closed without the system-role DSN (REQ-ECON-8)", () => {
    expect(SRC).toMatch(/!dsn[\s\S]*?requires JOURNEY_DATABASE_URL \(system-role[\s\S]*?process\.exit\(3\)/);
    expect(SRC).toContain("rolsuper or r.rolbypassrls");
  });
  it("the cap_overrun pause sentinel refuses later dispatches until the operator re-opens (REQ-ECON-7)", () => {
    expect(SRC).toContain('resolve(stateDir, "funded-pause.json")');
    expect(SRC).toMatch(/existsSync\(pauseFile\)[\s\S]*?process\.exit\(3\)/);
    expect(SRC).toMatch(/outcome === "cap_overrun"/);
    expect(SRC).toMatch(/writeFileSync\(\s*pauseFile/);
    expect(SRC).toContain("FUNDED WINDOW PAUSED");
  });
});
