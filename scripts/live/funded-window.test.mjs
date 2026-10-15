// R5ECON.1/3 (REQ-ECON-6/7/8/9; REQ-FND-6/8; O2-F11; ratified Q-ECON.f) — the funded-window
// driver's guard + checklist contract, pinned by source scan. The driver executes at import
// time (it IS the paid-dispatch shell), so the arms are asserted on the file text — each leg
// fails if its check is removed.

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
    // and the checklist's exclusions row verifies the marker is live in the compiled scope.
    expect(SRC).toContain('FLAGGED_PROXY_SPEND_SCOPE.includes("req_jrn_")');
  });
});

describe("funded-window — REQ-ECON-9 headroom + REQ-ECON-8 DSN + REQ-ECON-7 pause", () => {
  it("--headroom is REQUIRED on every dispatch: missing ⇒ exit 3, malformed ⇒ exit 2", () => {
    expect(SRC).toContain("requires --headroom <legCapUsd>");
    expect(SRC).toMatch(/else if \(!dryRun\)[\s\S]*?process\.exit\(3\)/);
    expect(SRC).toMatch(/!Number\.isFinite\(headroom\).*?process\.exit\(2\)/s);
    // and it actually pre-flights: cumulative + declared headroom crossing the round bound refuses.
    expect(SRC).toMatch(/cumUsd\s*\+\s*headroom\s*>\s*ROUND_CAP[\s\S]*?process\.exit\(3\)/);
  });
  it("the declared headroom must cover the selected legs' summed caps (cap presence + coverage)", () => {
    expect(SRC).toMatch(/plan\.missingCaps\.length > 0[\s\S]*?process\.exit\(3\)/);
    expect(SRC).toMatch(/headroom < plan\.requiredHeadroomUsd[\s\S]*?process\.exit\(3\)/);
  });
  it("still fails closed without the system-role DSN (REQ-ECON-8)", () => {
    expect(SRC).toMatch(/!dsn && !dryRun[\s\S]*?requires JOURNEY_DATABASE_URL \(system-role[\s\S]*?process\.exit\(3\)/);
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

describe("funded-window — R5ECON.3 the window regime (REQ-FND-6/8 + ratified Q-ECON.f)", () => {
  it("the re-authorized ~$60 envelope replaces the stale round-3 $150 bound", () => {
    expect(SRC).toContain("FUNDED_WINDOW_CAP_USD");
    expect(SRC).not.toMatch(/ROUND3_CAP = Number\(process\.env\.FUNDED_ROUND3_CAP_USD \?\? 150\)/);
    expect(SRC).not.toContain("?? 150");
  });
  it("--dry-run exists and prints the §5.5 checklist rows before exiting without dispatch", () => {
    expect(SRC).toContain('process.argv.includes("--dry-run")');
    expect(SRC).toContain("windowChecklist({");
    expect(SRC).toMatch(/funded-checklist\] §5\.5 window-opening checklist/);
    // the dry run exits on the checklist verdict — it never reaches the browser/dispatch block.
    expect(SRC).toMatch(/if \(dryRun\)[\s\S]*?process\.exit\(failed\.length === 0 \? 0 : 3\)/);
  });
  it("the dispatch plan orders T9 → launchers → riders → B19C and is imported from window-plan", () => {
    expect(SRC).toContain("planWindowDispatch");
    expect(SRC).toMatch(/const plan = planWindowDispatch\(selected\)/);
    expect(SRC).toMatch(/const steps = plan\.ordered/);
  });
  it("the funded stable tenant probe reads is_test + the purge-freshness age", () => {
    expect(SRC).toContain("JOURNEY_FUNDED_STABLE_TAG");
    expect(SRC).toContain("stableIdentity(stableTag)");
    expect(SRC).toMatch(/extract\(epoch from \(now\(\) - w\.created_at\)\) \/ 3600 as age_hours/);
    expect(SRC).toContain("TEST_TENANT_PURGE_HOURS");
  });
  it("the leg-close cap enforcement is proven live on the synthetic CapOverrunError probe", () => {
    expect(SRC).toContain("assertLegCapUsd");
    expect(SRC).toContain("CapOverrunError");
    expect(SRC).toContain("capEnforcementLive");
  });
  it("the REQ-ECON-11 opt-out row is evaluated (B19C/N6/R4 pin testCheapRoute:false)", () => {
    expect(SRC).toContain("optOutPinsHonored");
  });
});
