import { describe, it, expect } from "vitest";
import { CLAIM_VERDICTS, type ClaimVerdict } from "@rhema/contracts";
import { parseClaimLedger, verdictDeterminingStance, verdictDeterminingSource } from "./index.js";
import { loadCase, loadJson } from "../fixtures/load.js";

// AC4 (REQ-OBJ-18): a two-source claim round-trips into claim_sources rows with stances, and the singular
// `url` equals sources[0] of the verdict-determining stance.

describe("claim_sources stance edges (AC4, REQ-OBJ-18)", () => {
  it("flattens sources[] into claim_sources rows with stances and per-claim ordinals", () => {
    const res = parseClaimLedger(loadCase("two-source-claim.json"));
    expect(res.parseStatus).toBe("ok");
    if (res.parseStatus !== "ok") return;
    expect(res.claimSources).toHaveLength(2);
    expect(res.claimSources.map((s) => s.stance)).toEqual(["contradicts", "supports"]);
    expect(res.claimSources.map((s) => s.ordinal)).toEqual([0, 1]);
    for (const row of res.claimSources) expect(row.claimOrdinal).toBe(51);
  });

  it("the singular url equals sources[0] of the verdict-determining stance (not the global sources[0])", () => {
    const claim = (loadCase("two-source-claim.json") as { claims: { url: string; verdict: ClaimVerdict; sources: unknown }[] })
      .claims[0]!;
    const determining = verdictDeterminingSource(claim as never);
    expect(verdictDeterminingStance(claim.verdict)).toBe("supports");
    expect(determining?.url).toBe("https://clearinghouse.net/case/45979");
    expect(claim.url).toBe(determining?.url); // singular url = the supports edge, which is sources[1] here
  });

  it("rejects a claim whose singular url is not the verdict-determining source (parseStatus: failed)", () => {
    const res = parseClaimLedger(loadCase("two-source-claim-inconsistent.json"));
    expect(res.parseStatus).toBe("failed");
    if (res.parseStatus === "failed") expect(res.errors.join(" ")).toMatch(/REQ-OBJ-18/);
  });

  it("the real politics claim ledger (ordinal 51, two sources) round-trips its stances", () => {
    const res = parseClaimLedger(loadJson("the-politics-of-visibility", "01-claim-ledger.json"));
    expect(res.parseStatus).toBe("ok");
    if (res.parseStatus !== "ok") return;
    const c51 = res.claimSources.filter((s) => s.claimOrdinal === 51);
    expect(c51.map((s) => s.stance).sort()).toEqual(["contradicts", "supports"]);
  });

  it("verdictDeterminingStance is total over the frozen ClaimVerdict enum", () => {
    for (const v of CLAIM_VERDICTS) {
      const stance = verdictDeterminingStance(v);
      expect(stance === null || ["supports", "contradicts", "contextualizes"].includes(stance)).toBe(true);
    }
  });
});
