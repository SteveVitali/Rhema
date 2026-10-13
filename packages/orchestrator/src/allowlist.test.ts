import { describe, it, expect } from "vitest";
import { MODEL_TIERS, isModelPriceable, CURRENT_RATE_TABLE_VERSION, type ModelTier } from "@rhema/contracts";
import { rosterModelIds, mainModelForTier, routeModelForPhaseClass } from "@rhema/engine";
import { MODELS_BY_TIER, authorRunAllowlist, authorWebToolPolicy, authorAssistantWebToolPolicy, authorResearchFloor, authorResearchPreflight, urlPolicyFromInputs, FETCH_MAX_CONTENT_TOKENS, CITE_BACKFILL_FETCH_ALLOWANCE, ANTHROPIC_ENDPOINT, ANTHROPIC_PROBE_ENDPOINT, RESEARCH_BURST_MAX_SOURCES, RESEARCH_FLOOR_SHARE, RESEARCH_PARALLELISM } from "./allowlist.js";

// F4 — the model-allowlist trap. The proxy admits a request only when `body.model` is EXACTLY on the run's
// allowlist (`MODELS_BY_TIER`, an exact-match includes) AND priceable in the rate table; otherwise it 403s the
// very first inference. So every model id the engine can ask for — the explicit main-context model AND every
// roster subagent model — MUST be on its tier's allowlist and priceable. A dated id (`claude-haiku-4-5-20251001`)
// on the bare-id allowlist was the confirmed pre-P0.15g bug; this test is the standing guard against re-drift.
describe("roster ↔ proxy allowlist ↔ rate table alignment (F4)", () => {
  for (const tier of MODEL_TIERS as readonly ModelTier[]) {
    const allow = new Set(MODELS_BY_TIER[tier]);
    const ids = [mainModelForTier(tier), ...rosterModelIds(tier)];
    for (const id of [...new Set(ids)]) {
      it(`${tier}: '${id}' is on the tier allowlist AND priceable`, () => {
        expect(allow.has(id)).toBe(true);
        expect(isModelPriceable(CURRENT_RATE_TABLE_VERSION, id)).toBe(true);
      });
    }
    // ECON.2 L3 — the per-phaseClass route resolves only inside the tier's own allowlist (the §12.3
    // table is a refinement OF the tier roster, never a wider set — F4 guard extended per-class).
    for (const cls of ["research", "judge", "generate", "package"] as const) {
      const id = routeModelForPhaseClass(tier, cls);
      it(`${tier}/${cls}: '${id}' is allowlisted AND priceable`, () => {
        expect(allow.has(id!)).toBe(true);
        expect(isModelPriceable(CURRENT_RATE_TABLE_VERSION, id!)).toBe(true);
      });
    }
  }
});

describe("authorRunAllowlist", () => {
  it("always includes the Anthropic endpoint and the tier's model set", () => {
    const a = authorRunAllowlist({ modelTier: "balanced" });
    expect(a.endpoints).toContainEqual(ANTHROPIC_ENDPOINT);
    expect(a.models).toEqual(MODELS_BY_TIER.balanced);
  });

  // DEF.3 (F7 / STB.3) — the vendored SDK fires a connectivity preconnect (`HEAD
  // api.anthropic.com/api/hello`) at CLI init, before the first inference call. It is provider
  // traffic on the one host the run's credential already reaches, so the authored allowlist must
  // admit it — a deny row per run was counting healthy traffic toward `egress_denied_10m`.
  it("includes the SDK connectivity probe endpoint on every tier", () => {
    for (const tier of MODEL_TIERS as readonly ModelTier[]) {
      const a = authorRunAllowlist({ modelTier: tier });
      expect(a.endpoints).toContainEqual(ANTHROPIC_PROBE_ENDPOINT);
    }
    expect(ANTHROPIC_PROBE_ENDPOINT).toEqual({ host: "api.anthropic.com", pathPrefix: "/api/hello" });
    // …but no wider: the only admitted paths on the provider host are the /v1/ API and the probe.
    const a = authorRunAllowlist({ modelTier: "base" });
    expect(a.endpoints.filter((e) => e.host === "api.anthropic.com")).toHaveLength(2);
  });
});

describe("authorWebToolPolicy (PRB.22 — the per-run research bound)", () => {
  it("scales the fetch/search budgets with the claim count and pins page truncation", () => {
    const p = authorWebToolPolicy({ claims: 20 });
    expect(p.search).toBe(true);
    expect(p.fetch).toBe(true);
    // 12 + 4×20 = 92 → clamped at the 80 ceiling; searches 8 + 20 = 28.
    expect(p.fetchBudget).toBe(80);
    expect(p.searchBudget).toBe(28);
    expect(p.fetchMaxContentTokens).toBe(FETCH_MAX_CONTENT_TOKENS);
  });

  it("floors the budgets for a claim-less snapshot — a missing count never means unbounded", () => {
    const p = authorWebToolPolicy({});
    expect(p.fetchBudget).toBe(16); // RESEARCH_FETCH_MIN — the floor still allows baseline reading
    expect(p.searchBudget).toBe(8); // RESEARCH_SEARCH_BASE
  });

  it("a small doc gets a small-but-real budget (701 words ≈ 3 claims)", () => {
    const p = authorWebToolPolicy({ claims: 3 });
    expect(p.fetchBudget).toBe(24); // 12 + 4×3
    expect(p.searchBudget).toBe(11); // 8 + 3
  });

  it("RES.1 — per-call grants cap at budget ÷ wave width so parallel researchers can't starve", () => {
    const p = authorWebToolPolicy({ claims: 9 });
    // 17 searches / 48 fetches → each request reserves ≤4 / ≤12, so a 4-subagent wave never
    // hands the whole remainder to its first request (the starved-sibling failure the first
    // live probe hit — probe 01M3VT9R…). `max_uses` is per-call: more turns just keep working.
    expect(p.searchMaxUses).toBe(4);
    expect(p.fetchMaxUses).toBe(12);
    // the wave invariant: RESEARCH_PARALLELISM concurrent full grants never oversubscribe the bound.
    expect(p.searchMaxUses! * RESEARCH_PARALLELISM).toBeLessThanOrEqual(p.searchBudget!);
    expect(p.fetchMaxUses! * RESEARCH_PARALLELISM).toBeLessThanOrEqual(p.fetchBudget!);
    const small = authorWebToolPolicy({});
    expect(small.searchMaxUses).toBe(2); // floor(8/4)
    expect(small.fetchMaxUses).toBe(4); // floor(16/4)
    // a claim-less bound still grants at least one invocation per call — never a zeroed tool.
    expect(small.searchMaxUses!).toBeGreaterThanOrEqual(1);
  });

  it("RES.1 — floors half the authored bound to research-class phases (the verification reserve)", () => {
    const p = authorWebToolPolicy({ claims: 20 });
    // 28 searches / 80 fetches → 14 / 40 reserved for phaseClass=research traffic only.
    expect(p.searchFloor).toBe(14);
    expect(p.fetchFloor).toBe(40);
    const small = authorWebToolPolicy({});
    expect(small.searchFloor).toBe(4); // 8 / 2
    expect(small.fetchFloor).toBe(8); // 16 / 2
    // the floor is a share of the budget — it can never exceed it.
    expect(small.searchFloor!).toBeLessThanOrEqual(small.searchBudget!);
    expect(small.fetchFloor!).toBeLessThanOrEqual(small.fetchBudget!);
  });

  // RES.1 (REQ-SPEC-31(2)) — THE GUARD: this test fails if the floor share or the sizing function's
  // output is lowered. ECON.2 may cut research spend only ABOVE the floor; a lower floor must be an
  // ADR-visible decision, never a silent constant edit.
  it("GUARD — the research floor never drops below half the run's bounded search/fetch budgets", () => {
    expect(RESEARCH_FLOOR_SHARE).toBeGreaterThanOrEqual(0.5);
    // claim-scaled bound at the incident's own numbers (claimCount=4 → 12 searches / 28 fetches).
    const p = authorWebToolPolicy({ claims: 4 });
    expect(p.searchFloor).toBe(6);
    expect(p.fetchFloor).toBe(14);
    // the pure function pins the same share on arbitrary budgets, claims and rigor carried.
    expect(authorResearchFloor({ claims: 4, rigor: "quick", searchBudget: 12, fetchBudget: 28 })).toEqual({
      searchFloor: 6,
      fetchFloor: 14,
    });
  });

  // ECON.2 L5 (REQ-SPEC-31(2) preserved; ADR-087) — the tuned envelope touches ONLY the headroom
  // above the RES.1 floor: floors are computed on the UNTUNED budgets and freeze absolute; the
  // non-reserved share halves; the per-page cap drops 8 000 → 4 000; CITE.1's backfill allowance
  // stays sized on the untuned budget. A removal of the flag must fall back to the untuned shape.
  describe("L5 — the above-floor tuned envelope (l5ResearchEnvelope)", () => {
    const off = authorWebToolPolicy({ claims: 20 });
    const on = authorWebToolPolicy({ claims: 20, l5ResearchEnvelope: true });

    it("floors are IDENTICAL to the untuned policy — the RES.1 guarantee is absolute-preserved", () => {
      expect(on.searchFloor).toBe(off.searchFloor);
      expect(on.fetchFloor).toBe(off.fetchFloor);
      // …and still half the UNTUNED bound (14/40 at claims=20), not half the tuned one.
      expect(on.searchFloor).toBe(14);
      expect(on.fetchFloor).toBe(40);
      // research-class traffic keeps a real ceiling: floor ≤ tuned budget always.
      expect(on.searchFloor!).toBeLessThanOrEqual(on.searchBudget!);
      expect(on.fetchFloor!).toBeLessThanOrEqual(on.fetchBudget!);
    });

    it("halves only the above-floor headroom (budget = floor + ⌈headroom × 0.5⌉)", () => {
      expect(on.searchBudget).toBe(off.searchFloor! + Math.ceil((off.searchBudget! - off.searchFloor!) * 0.5));
      expect(on.fetchBudget).toBe(off.fetchFloor! + Math.ceil((off.fetchBudget! - off.fetchFloor!) * 0.5));
      expect(on.searchBudget).toBe(21); // 14 + ⌈14×0.5⌉
      expect(on.fetchBudget).toBe(60); // 40 + ⌈40×0.5⌉
      // non-research traffic's share (budget − floor) is what actually halved.
      expect(on.searchBudget! - on.searchFloor!).toBeLessThan(off.searchBudget! - off.searchFloor!);
    });

    it("drops the per-page context cap to 4 000 tokens and shrinks the wave's maxUses", () => {
      expect(on.fetchMaxContentTokens).toBe(4_000);
      expect(off.fetchMaxContentTokens).toBe(FETCH_MAX_CONTENT_TOKENS);
      expect(on.fetchMaxUses!).toBe(Math.floor(60 / RESEARCH_PARALLELISM));
      expect(on.searchMaxUses!).toBe(Math.floor(21 / RESEARCH_PARALLELISM));
    });

    it("keeps CITE.1's backfill allowance sized on the UNTUNED budget (the citation mechanism is not an L5 casualty)", () => {
      expect(on.backfillFetchBudget).toBe(Math.min(off.fetchBudget!, CITE_BACKFILL_FETCH_ALLOWANCE));
      expect(on.backfillFetchBudget).toBe(off.backfillFetchBudget);
    });

    it("a claim-less tuned bound still floors absolutely and stays tool-bearing", () => {
      const small = authorWebToolPolicy({ l5ResearchEnvelope: true });
      expect(small.searchFloor).toBe(4);
      expect(small.fetchFloor).toBe(8);
      expect(small.searchBudget).toBe(4 + Math.ceil((8 - 4) * 0.5)); // 6
      expect(small.fetchBudget).toBe(8 + Math.ceil((16 - 8) * 0.5)); // 12
      expect(small.searchMaxUses!).toBeGreaterThanOrEqual(1);
      expect(small.fetchMaxUses!).toBeGreaterThanOrEqual(1);
    });
  });
});

// RES.1 (REQ-SPEC-31(3)) — the preflight manifest: every model the tier's roster admits × every server
// tool the run's webTools policy enables. The probe set must equal the model-allowlist × enabled-kind
// product on EVERY tier — a narrower set probes less than the run may exercise; a wider one wastes burn.
describe("authorResearchPreflight (RES.1 — REQ-SPEC-31(3) pair matrix)", () => {
  it("every tier: pairs = the full roster × both enabled tools, canonical type variants pinned", () => {
    for (const tier of MODEL_TIERS as readonly ModelTier[]) {
      const spec = authorResearchPreflight({ modelTier: tier, webTools: null });
      expect(spec.models).toEqual([...MODELS_BY_TIER[tier]]);
      expect(spec.tools).toEqual(["web_search", "web_fetch"]);
      expect(spec.toolTypes).toEqual({ web_search: "web_search_20250305", web_fetch: "web_fetch_20250910" });
      // the pair set is exactly the matrix product — roster models × enabled tools, no more, no fewer.
      expect(spec.pairs).toEqual(
        MODELS_BY_TIER[tier].flatMap((model) => [
          { model, tool: "web_search" },
          { model, tool: "web_fetch" },
        ]),
      );
    }
  });

  it("a disabled tool drops out of the pair set (probing it would prove nothing — the proxy strips it)", () => {
    const spec = authorResearchPreflight({ modelTier: "base", webTools: { search: true, fetch: false } });
    expect(spec.tools).toEqual(["web_search"]);
    expect(spec.pairs.every((p) => p.tool === "web_search")).toBe(true);
    const both = authorResearchPreflight({ modelTier: "base", webTools: { search: false, fetch: false } });
    expect(both.pairs).toEqual([]);
  });
});

// P1.11 — the Assistant seat's web bound (§7.1: ≤5 searches / ≤10 fetches per turn; §12.2 Research row:
// the burst's fetch fan-out is the plan card's ≤N). Enforced at the proxy via webTools budgets.
describe("authorAssistantWebToolPolicy (P1.11 — the §7.1/§12.2 bound)", () => {
  it("chat_turn enforces the §7.1 per-turn caps at the proxy", () => {
    const p = authorAssistantWebToolPolicy({ workflow: "chat_turn" });
    expect(p).not.toBeNull();
    expect(p!.searchBudget).toBe(5);
    expect(p!.fetchBudget).toBe(10);
    expect(p!.fetchMaxContentTokens).toBe(FETCH_MAX_CONTENT_TOKENS);
  });

  it("a consented (edited) plan can only shrink the chat bound — never exceed §7.1", () => {
    const p = authorAssistantWebToolPolicy({
      workflow: "chat_turn",
      inputs: { budget: { searches: 2, fetches: 3 } },
    });
    expect(p!.searchBudget).toBe(2);
    expect(p!.fetchBudget).toBe(3);
    const raised = authorAssistantWebToolPolicy({
      workflow: "chat_turn",
      inputs: { budget: { searches: 99, fetches: 99 } },
    });
    expect(raised!.searchBudget).toBe(5); // clamped to the §7.1 ceiling
    expect(raised!.fetchBudget).toBe(10);
  });

  it("research_burst bounds fetches to the planned source count (≤N, plan-card consented)", () => {
    const p = authorAssistantWebToolPolicy({ workflow: "research_burst", inputs: { sources: 4 } });
    expect(p!.fetchBudget).toBe(4);
    expect(p!.searchBudget).toBe(4);
    // RES.1 — half the source bound floored to the burst's research phase (its triage judge runs first).
    expect(p!.fetchFloor).toBe(2);
    expect(p!.searchFloor).toBe(2);
    const def = authorAssistantWebToolPolicy({ workflow: "research_burst" });
    expect(def!.fetchBudget).toBe(5); // the default source count
    const over = authorAssistantWebToolPolicy({ workflow: "research_burst", inputs: { sources: 999 } });
    expect(over!.fetchBudget).toBe(RESEARCH_BURST_MAX_SOURCES); // hard-clamped
  });

  it("chat_turn/figure carry NO floor — neither manifest has a research-class phase to reserve for (RES.1)", () => {
    const chat = authorAssistantWebToolPolicy({ workflow: "chat_turn" });
    expect(chat!.searchFloor).toBeUndefined();
    expect(chat!.fetchFloor).toBeUndefined();
    const fig = authorAssistantWebToolPolicy({ workflow: "figure" });
    expect(fig!.searchFloor).toBeUndefined();
    expect(fig!.fetchFloor).toBeUndefined();
  });

  it("non-assistant workflows fall back (null) to the claim-scaled bound", () => {
    expect(authorAssistantWebToolPolicy({ workflow: "review" })).toBeNull();
  });
});

describe("urlPolicyFromInputs (P1.11 — the run's frozen URL policy → the proxy allowlist)", () => {
  it("absent inputs yield the empty denylist default", () => {
    expect(urlPolicyFromInputs(null)).toEqual({ blockedDomains: [] });
    expect(urlPolicyFromInputs({})).toEqual({ blockedDomains: [] });
  });

  it("a frozen policy maps blocked/allowed/known domains + the novel-domain cap", () => {
    const p = urlPolicyFromInputs({
      urlPolicy: {
        blockedDomains: ["evil.example"],
        allowedDomains: ["arxiv.org"],
        knownDomains: ["nyt.com"],
        novelDomainCap: 7,
      },
    });
    expect(p.blockedDomains).toEqual(["evil.example"]);
    expect(p.allowedDomains).toEqual(["arxiv.org"]);
    expect(p.knownDomains).toEqual(["nyt.com"]);
    expect(p.novelDomainCap).toBe(7);
    // and it lands on the authored allowlist the proxy persists
    const a = authorRunAllowlist({ modelTier: "base", ...p });
    expect(a.urlPolicy.blockedDomains).toEqual(["evil.example"]);
    expect(a.urlPolicy.allowedDomains).toEqual(["arxiv.org"]);
  });

  it("malformed policy fields sanitize to the deny-all-by-default shape, never throw", () => {
    const p = urlPolicyFromInputs({ urlPolicy: { blockedDomains: "oops", novelDomainCap: "x" } });
    expect(p.blockedDomains).toEqual([]);
    expect(p.novelDomainCap).toBeUndefined();
  });
});
