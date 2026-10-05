import { describe, it, expect } from "vitest";
import { buildRunSheetView } from "./view.js";

const BASE = {
  targetVersion: "v2",
  scope: { protocol: "Essay", venue: "LRB", stage: "near-final", voice: "S. J. Sebastian" },
  idempotencyKey: "idem_abc",
} as const;

// AC6 (view) — dollars-first everywhere; credits second line; tokens nowhere. Plus the launcher anatomy.
describe("buildRunSheetView — the launcher shape (§5.6)", () => {
  it("assembles the title line, dollars-first estimate box and collapsed summary", () => {
    const v = buildRunSheetView({
      ...BASE,
      workflow: "review",
      rigor: "standard",
      modelTier: "balanced",
      inputs: { words: 5180 },
      spendableCredits: 100000,
    });
    expect(v.title.verbLabel).toBe("Review");
    expect(v.title.words).toBe(5180);
    expect(v.title.claims).toBe(21); // provisional density
    expect(v.estimate.dollarsLine.startsWith("≈ $")).toBe(true);
    expect(v.estimate.dollarsLine).toContain("never more than");
    expect(v.estimate.creditsLine).toContain("credits");
    expect(v.estimate.creditsLine).toContain("cap");
    expect(v.collapsedSummary).toBe("Essay · LRB · near-final · Balanced · S. J. Sebastian");
    expect(v.estimate.provisional).toBe(true);
  });

  it("no view string exposes 'tokens' (REQ-BILL-1)", () => {
    const v = buildRunSheetView({
      ...BASE,
      workflow: "review",
      rigor: "full_board",
      modelTier: "frontier",
      inputs: { words: 8000, claims: 45 },
      spendableCredits: 100000,
      scopeLine: "4 open obligations will be checked",
    });
    expect(JSON.stringify(v)).not.toMatch(/token/i);
  });

  it("surfaces the obligation scope line (REQ-OBJ-6)", () => {
    const v = buildRunSheetView({
      ...BASE,
      workflow: "review",
      rigor: "standard",
      modelTier: "balanced",
      inputs: { words: 5180 },
      spendableCredits: 100000,
      scopeLine: "4 open obligations will be checked",
    });
    expect(v.scopeLine).toBe("4 open obligations will be checked");
  });

  it("sets consent when the estimate crosses the threshold (§5.6 item 5)", () => {
    const v = buildRunSheetView({
      ...BASE,
      workflow: "review",
      rigor: "full_board",
      modelTier: "frontier",
      inputs: { words: 8000, claims: 45 },
      spendableCredits: 100000,
    });
    expect(v.estimate.estimateCredits).toBeGreaterThan(500);
    expect(v.consent.needsSecondClick).toBe(true);
    expect(v.consent.reason).toBe("absolute");
  });

  it("becomes a resolution panel when the cap exceeds spendable (§5.6 item 6)", () => {
    const v = buildRunSheetView({
      ...BASE,
      workflow: "review",
      rigor: "standard",
      modelTier: "balanced",
      inputs: { words: 5180 },
      spendableCredits: 50, // far below the cap
      insufficientMode: "beta",
    });
    expect(v.insufficient).not.toBeNull();
    expect(v.insufficient!.sentences).toHaveLength(3);
    expect(v.insufficient!.sentences[2]).toBe("Or ask for more credits.");
  });

  it("carries a per-rigor recompute payload for the no-bundle inline enhancement (§5.6 item 2)", () => {
    const v = buildRunSheetView({
      ...BASE,
      workflow: "review",
      rigor: "standard",
      modelTier: "base",
      inputs: { words: 8000, claims: 45 },
      spendableCredits: 12345,
    });
    expect(v.recompute.spendableCredits).toBe(12345);
    expect(Object.keys(v.recompute.byRigor).sort()).toEqual(["full_board", "quick", "standard"]);
    // Quick is cheaper than Full board (the one first-class lever moves the figure).
    expect(v.recompute.byRigor.quick.estimateCredits).toBeLessThan(v.recompute.byRigor.full_board.estimateCredits);
    expect(v.recompute.byRigor.standard.capCredits).toBe(Math.ceil(v.recompute.byRigor.standard.estimateCredits * 1.5));
    // §6.5: model tier is a CONSEQUENCE of rigor — each rigor's payload carries its default tier.
    expect(v.recompute.byRigor.quick.modelTier).toBe("base");
    expect(v.recompute.byRigor.standard.modelTier).toBe("balanced");
    expect(v.recompute.byRigor.full_board.modelTier).toBe("frontier");
    // and Full board's figure reflects its Frontier tier (≈4.5×), not the sheet's current tier.
    const quickBaseVsFullFrontier = v.recompute.byRigor.full_board.estimateCredits / v.recompute.byRigor.quick.estimateCredits;
    expect(quickBaseVsFullFrontier).toBeGreaterThan(3);
  });

  it("carries the sheet-minted idempotency key + a client recompute matrix", () => {
    const v = buildRunSheetView({
      ...BASE,
      workflow: "review",
      rigor: "standard",
      modelTier: "base",
      inputs: { words: 8000, claims: 45 },
      spendableCredits: 100000,
    });
    expect(v.idempotencyKey).toBe("idem_abc");
    expect(Object.keys(v.leverMatrix.states).length).toBeGreaterThan(0);
    expect(v.rigorOptions.find((o) => o.selected)!.rigor).toBe("standard");
    expect(v.whyLine).toContain("claims");
  });

  // P1.20 (§6.7) — a settings-page protocol change marks the next Review's scope card: the marker line
  // renders and the scope gate carries the same blocking consequence as a lever-changed scope.
  it("surfaces the settings-page protocol-change marker as scope-blocking (§6.7)", () => {
    const v = buildRunSheetView({
      ...BASE,
      workflow: "review",
      rigor: "standard",
      modelTier: "balanced",
      inputs: { words: 5180 },
      spendableCredits: 100000,
      protocolChanged: true,
    });
    // P1.21 — the marker names the reviewed version ("protocol changed since vN was reviewed", §6.7).
    expect(v.protocolChangedLine).toBe("Protocol changed since v2 was reviewed.");
    expect(v.scopeApprovalLine).toContain("blocking gate opens at launch");
    // Wait-for-me-at-each already blocks — the marker line still shows but the policy line wins.
    const w = buildRunSheetView({
      ...BASE,
      workflow: "review",
      rigor: "standard",
      modelTier: "balanced",
      inputs: { words: 5180 },
      spendableCredits: 100000,
      protocolChanged: true,
      approvalPolicy: "wait_each",
    });
    expect(w.protocolChangedLine).toBe("Protocol changed since v2 was reviewed.");
    expect(w.scopeApprovalLine).toContain("waits for you");
    // no marker → no line, informational approval.
    const u = buildRunSheetView({
      ...BASE,
      workflow: "review",
      rigor: "standard",
      modelTier: "balanced",
      inputs: { words: 5180 },
      spendableCredits: 100000,
    });
    expect(u.protocolChangedLine).toBeUndefined();
    expect(u.scopeApprovalLine).toContain("informational");
  });
});
