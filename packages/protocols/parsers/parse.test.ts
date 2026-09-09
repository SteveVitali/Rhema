import { describe, it, expect } from "vitest";
import { SIDECAR_REGISTRY } from "@rhema/contracts";
import { PARSERS, parseSidecar, parseClaimLedger, parseStructurePlan } from "./index.js";
import { projects, loadJson, hasFixture, loadCase } from "../fixtures/load.js";

// Parser coverage + REQ-DATA-7 amended semantics (AC3): parseStatus is ok | failed only, never a partial.

describe("sidecar parsers", () => {
  it("every SIDECAR_REGISTRY filename has a parser (parsers ↔ schema registry in lockstep)", () => {
    expect(Object.keys(PARSERS).sort()).toEqual(Object.keys(SIDECAR_REGISTRY).sort());
  });

  it("parses every real fixture across all three projects to parseStatus: ok", () => {
    for (const project of projects()) {
      for (const file of Object.keys(SIDECAR_REGISTRY) as (keyof typeof SIDECAR_REGISTRY)[]) {
        if (!hasFixture(project, file)) continue;
        const res = parseSidecar(file, { json: loadJson(project, file) });
        expect(res.parseStatus, `${project}/${file}`).toBe("ok");
      }
    }
  });

  describe("AC3 — a schema-invalid sidecar yields parseStatus: failed, never a partial row set", () => {
    it("invalid claim ledger (out-of-enum verdict) fails wholesale", () => {
      const res = parseClaimLedger(loadCase("invalid-claim-ledger.json"));
      expect(res.parseStatus).toBe("failed");
      // no partial rows are returned on failure
      expect(res).not.toHaveProperty("value");
      expect(res).not.toHaveProperty("claimSources");
      if (res.parseStatus === "failed") expect(res.errors.length).toBeGreaterThan(0);
    });

    it("invalid structure plan (section missing title) fails wholesale", () => {
      const res = parseStructurePlan(loadCase("invalid-structure-plan.json"));
      expect(res.parseStatus).toBe("failed");
      expect(res).not.toHaveProperty("value");
    });

    it("only 'ok' and 'failed' are ever returned (no 'partial')", () => {
      const statuses = new Set<string>();
      statuses.add(parseClaimLedger(loadCase("invalid-claim-ledger.json")).parseStatus);
      statuses.add(parseSidecar("cut-list.json", { json: loadJson("the-politics-of-visibility", "cut-list.json") }).parseStatus);
      for (const s of statuses) expect(["ok", "failed"]).toContain(s);
    });
  });
});
