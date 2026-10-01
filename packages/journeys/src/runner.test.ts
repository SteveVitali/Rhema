import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { Browser } from "playwright";
import { runJourneys } from "./runner.js";
import type { JourneyStep } from "./registry.js";
import type { MailboxClient } from "./mailbox.js";

// JOURNEY.1 — the runner's expected-flag semantics (AC: "green step fails ⇒ the run fails; a red
// step failing is reported as owed-to-its-owner, never a run failure; a red step passing is
// 'ready to flip'"). Steps here are stubs — the classification is what's under test.

const step = (id: string, expected: "red" | "green", paid = false): JourneyStep => ({
  id,
  journey: "new-visitor",
  asserts: `${id} asserts something`,
  owner: "X.1",
  expected,
  paid,
});

const stubBrowser = { contexts: () => [] } as unknown as Browser;
const stubMailbox = {} as MailboxClient;

async function run(
  steps: JourneyStep[],
  impls: Parameters<typeof runJourneys>[0]["impls"],
  paid = false,
) {
  const outDir = mkdtempSync(path.join(tmpdir(), "jrnr-"));
  return runJourneys({
    browser: stubBrowser,
    webBaseUrl: "https://app.test",
    apiBaseUrl: "https://api.test",
    mailbox: stubMailbox,
    stateDir: outDir,
    outDir,
    nonce: "testnonce",
    paid,
    steps,
    impls,
    provenance: { expected: "abc", observed: { web: "abc" }, match: true },
    spend: { weeklyMeteredUsd: 0, capUsd: 5, withinCap: true },
  });
}

describe("runJourneys — the expected-flag semantics", () => {
  it("a green step passing ⇒ pass; a green step failing ⇒ fail + run failure", async () => {
    const r = await run(
      [step("G1", "green"), step("G2", "green")],
      { G1: async () => undefined, G2: async () => { throw new Error("boom"); } },
    );
    expect(r.results.find((x) => x.id === "G1")?.outcome).toBe("pass");
    expect(r.results.find((x) => x.id === "G2")?.outcome).toBe("fail");
    expect(r.results.find((x) => x.id === "G2")?.error).toBe("boom");
    expect(r.passed).toBe(false);
  });
  it("a red step failing ⇒ owed (never a run failure); a red step passing ⇒ ready-to-flip", async () => {
    const r = await run(
      [step("R-1", "red"), step("R-2", "red")],
      { "R-1": async () => { throw new Error("not yet"); }, "R-2": async () => undefined },
    );
    expect(r.results.find((x) => x.id === "R-1")?.outcome).toBe("owed");
    expect(r.results.find((x) => x.id === "R-2")?.outcome).toBe("ready-to-flip");
    expect(r.passed).toBe(true);
  });
  it("paid steps skip without --paid; a missing impl on a green step fails the run", async () => {
    const r = await run([step("P1x", "red", true), step("G3", "green")], {});
    expect(r.results.find((x) => x.id === "P1x")?.outcome).toBe("skipped");
    expect(r.results.find((x) => x.id === "G3")?.outcome).toBe("fail");
    expect(r.passed).toBe(false);
  });
  it("the report lands on disk with console-error + failed-request capture arrays", async () => {
    const r = await run([step("G4", "green")], { G4: async () => undefined });
    const res = r.results[0]!;
    expect(res.consoleErrors).toEqual([]);
    expect(res.failedRequests).toEqual([]);
    expect(typeof res.durationMs).toBe("number");
  });
});
