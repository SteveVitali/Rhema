import { describe, it, expect } from "vitest";
import {
  evaluateProbeEvidence,
  PLANTED_CLAIM,
  type ProbeEvidence,
} from "./research-probe.js";

// RES.1 — the recorded-response twin (CI, $0). `RECORDED` is the evidence shape a HEALTHY probe run
// produces: metered searches on both tier models, allowed search+fetch rows in fetch_log, the planted
// claim row Contradicted, and its cited source among the fetched urls. It is shape-faithful to the
// real schema (usage_records / fetch_log / claims / claim_sources) — the Stage B leg refreshes it
// with the live capture; the assertions below are what the live leg must satisfy.

const SONNET = "claude-sonnet-5";
const HAIKU = "claude-haiku-4-5";
const SOURCE_URL = "https://www.loc.gov/about/";

const RECORDED: ProbeEvidence = {
  runId: "run_probe_recorded",
  state: "completed",
  usageByModel: [
    { model: HAIKU, searches: 2, fetches: 1, credits: 14 },
    { model: SONNET, searches: 1, fetches: 2, credits: 31 },
  ],
  fetchLog: [
    { kind: "search", decision: "allow", url: null, agentLabel: "main" },
    { kind: "fetch", decision: "allow", url: SOURCE_URL, agentLabel: "research-1" },
  ],
  claims: [
    {
      id: "clm_1",
      ordinal: 1,
      text: "The Library of Congress was founded in 1850.",
      verdict: "contradicted",
      tier: 1,
    },
    {
      id: "clm_2",
      ordinal: 2,
      text: "The Boston Public Library was established in 1848.",
      verdict: "verified",
      tier: 2,
    },
  ],
  claimSources: [{ claimId: "clm_1", url: SOURCE_URL, stance: "contradicts" }],
};

describe("evaluateProbeEvidence — the recorded-response twin (RES.1)", () => {
  it("a healthy recorded run passes: searches on both models, fetched sources, the planted claim Contradicted", () => {
    const out = evaluateProbeEvidence(RECORDED, { expectModels: [SONNET, HAIKU] });
    expect(out).toEqual({
      ok: true,
      failures: [],
      detail: {
        searchesByModel: { [SONNET]: 1, [HAIKU]: 2 },
        fetchesAllowed: 1,
        searchesAllowed: 1,
        plantedVerdict: "contradicted",
        plantedSourcesFetched: 1,
        meteredCredits: 45,
      },
    });
  });

  it("the 2026-09-30 incident shape FAILS: zero searches and an Unverifiable planted claim", () => {
    const incident: ProbeEvidence = {
      ...RECORDED,
      usageByModel: [{ model: SONNET, searches: 0, fetches: 0, credits: 40 }],
      fetchLog: [{ kind: "fetch", decision: "deny", url: null, agentLabel: "main" }],
      claims: [{ ...RECORDED.claims[0]!, verdict: "unverifiable" }],
      claimSources: [],
    };
    const out = evaluateProbeEvidence(incident, { expectModels: [SONNET] });
    expect(out.ok).toBe(false);
    expect(out.failures.join("\n")).toMatch(/zero searches/);
    expect(out.failures.join("\n")).toMatch(/no allowed fetch/);
    expect(out.failures.join("\n")).toMatch(/'unverifiable'/);
  });

  it("a contradicted claim whose source was never fetched fails cited⇒fetched", () => {
    const ev: ProbeEvidence = {
      ...RECORDED,
      claimSources: [{ claimId: "clm_1", url: "https://unfetched.example/", stance: "contradicts" }],
    };
    const out = evaluateProbeEvidence(ev);
    expect(out.ok).toBe(false);
    expect(out.failures.join("\n")).toMatch(/cited≠fetched/);
  });

  it("a run that died before delivery fails on its terminal state", () => {
    const out = evaluateProbeEvidence({ ...RECORDED, state: "failed" });
    expect(out.ok).toBe(false);
    expect(out.failures.join("\n")).toMatch(/'failed', not completed/);
  });

  it("the planted marker names the essay's real error (1850→1800, Library of Congress)", () => {
    expect(PLANTED_CLAIM.marker + PLANTED_CLAIM.wrongValue).toBe("Library of Congress1850");
  });
});
