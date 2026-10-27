import { describe, expect, it } from "vitest";
import {
  createFactsEvaluator,
  evaluateOracle,
  type OracleInput,
  type PredicateFacts,
} from "./completion-oracle.js";
import type { CompletionPredicate } from "@rhema/protocols";

// AC8 + REQ-SPEC-13: the three-leg completion oracle.

const claimPredicate: CompletionPredicate = { kind: "claim_rows_gte_inventory", artifact: "01-claim-ledger.md" };
const closurePredicate: CompletionPredicate = { kind: "claim_ledger_closed", artifact: "01-claim-ledger.md" };

function input(over: Partial<OracleInput>): OracleInput {
  return { sdkSubtype: "success", phaseResult: { status: "done" }, predicates: [claimPredicate], ...over };
}

describe("completion oracle (REQ-SPEC-13)", () => {
  it("complete: success + done + all predicates pass", () => {
    const facts: PredicateFacts = { claimRowCount: 21, inventoryCount: 21 };
    const v = evaluateOracle(input({}), createFactsEvaluator(facts));
    expect(v.outcome).toBe("complete");
  });

  it("leg (a): a non-success subtype is incomplete regardless of files (budget → budget class)", () => {
    const facts: PredicateFacts = { claimRowCount: 99, inventoryCount: 1 }; // predicates would pass…
    const v = evaluateOracle(input({ sdkSubtype: "budget" }), createFactsEvaluator(facts));
    expect(v).toMatchObject({ outcome: "incomplete", errorClass: "budget", failedLeg: "sdk_result" });
  });

  it("leg (a): maxTurns → artifact_missing (a plausible partial is not done)", () => {
    const v = evaluateOracle(input({ sdkSubtype: "error_max_turns" }), createFactsEvaluator({}));
    expect(v).toMatchObject({ outcome: "incomplete", errorClass: "artifact_missing", failedLeg: "sdk_result" });
  });

  it("leg (b): phase-result blocked → blocked; replan → replan; missing → incomplete", () => {
    expect(evaluateOracle(input({ phaseResult: { status: "blocked" } }), createFactsEvaluator({})).outcome).toBe(
      "blocked",
    );
    expect(evaluateOracle(input({ phaseResult: { status: "replan" } }), createFactsEvaluator({})).outcome).toBe(
      "replan",
    );
    const missing = evaluateOracle(input({ phaseResult: null }), createFactsEvaluator({}));
    expect(missing).toMatchObject({ outcome: "incomplete", errorClass: "artifact_missing", failedLeg: "phase_result" });
  });

  it("leg (c) — AC8: success + done but a failing predicate → artifact_missing", () => {
    const facts: PredicateFacts = { claimRowCount: 3, inventoryCount: 21 }; // rows < inventory → predicate fails
    const v = evaluateOracle(input({}), createFactsEvaluator(facts));
    expect(v).toMatchObject({ outcome: "incomplete", errorClass: "artifact_missing", failedLeg: "predicate" });
    if (v.outcome === "incomplete") {
      expect(v.failedPredicates).toHaveLength(1);
      expect(v.failedPredicates[0].predicate.kind).toBe("claim_rows_gte_inventory");
    }
  });

  it("a predicate whose fact is absent fails (completion must be proven, not assumed)", () => {
    const v = evaluateOracle(input({}), createFactsEvaluator({})); // no claimRowCount supplied
    expect(v.outcome).toBe("incomplete");
  });

  it("evaluates every predicate kind over facts", () => {
    const preds: CompletionPredicate[] = [
      { kind: "thesis_and_inventory_present", artifact: "00-piece-brief.md" },
      { kind: "rubric_dimensions_complete", artifact: "rubric.json", count: 8 },
      { kind: "spine_min", artifact: "structure-plan.json", min: 3 },
      { kind: "draft_sections_eq_plan", artifact: "vN.md" },
      { kind: "second_read_producer_checked", artifact: "05-second-read.md" },
      { kind: "sidecar_validates", sidecar: "findings.json" },
    ];
    const facts: PredicateFacts = {
      thesisPresent: true,
      inventoryPresent: true,
      rubricDimensionCount: 8,
      spineCount: 4,
      draftSectionCount: 5,
      planSectionCount: 5,
      secondReadProducerQueryId: "q_scoped",
      expectedProducerQueryId: "q_scoped",
      sidecarValidates: { "findings.json": true },
    };
    const v = evaluateOracle(input({ predicates: preds }), createFactsEvaluator(facts));
    expect(v.outcome).toBe("complete");
  });

  it("ECON.1 §6.5 — claim_cap: a Quick review completes once its five load-bearing claims are checked", () => {
    // 23 claims inventoried, 5 checked: without the cap the predicate fails; with claimCap=5 it passes.
    const facts: PredicateFacts = { claimRowCount: 5, inventoryCount: 23, claimCap: 5 };
    const v = evaluateOracle(input({}), createFactsEvaluator(facts));
    expect(v.outcome).toBe("complete");
  });

  it("ECON.1 §6.5 — claim_cap: below the capped floor still fails, and detail shows the cap", () => {
    const facts: PredicateFacts = { claimRowCount: 4, inventoryCount: 23, claimCap: 5 };
    const v = evaluateOracle(input({}), createFactsEvaluator(facts));
    expect(v).toMatchObject({ outcome: "incomplete", failedLeg: "predicate" });
    const ev = createFactsEvaluator(facts)(claimPredicate);
    expect(ev.detail).toContain("capped");
  });

  it("ECON.1 §6.5 — no claim_cap keeps the uncapped semantic (standard/full board: cover the inventory)", () => {
    const facts: PredicateFacts = { claimRowCount: 5, inventoryCount: 23 };
    expect(evaluateOracle(input({}), createFactsEvaluator(facts)).outcome).toBe("incomplete");
  });

  it("second_read producer mismatch fails (the parent Editor cannot forge the second read)", () => {
    const pred: CompletionPredicate = { kind: "second_read_producer_checked", artifact: "05-second-read.md" };
    const facts: PredicateFacts = { secondReadProducerQueryId: "q_parent", expectedProducerQueryId: "q_scoped" };
    const v = evaluateOracle(input({ predicates: [pred] }), createFactsEvaluator(facts));
    expect(v.outcome).toBe("incomplete");
  });
});

describe("F-R6CNT.3-1 / R6FIX.4 — the done-gate requires ledger closure, not row count", () => {
  // The $10.68 Showcase run's defect: a schema-valid ledger whose rows were all `unverifiable`
  // placeholders (no evidence) rode the phase to `done` because coverage was vacuous and no
  // closure check existed.

  it("coverage is never vacuous — absent inventoryCount fails, naming the missing fact", () => {
    // the work-reader no longer defaults inventoryCount to 0; the predicate must fail closed
    // rather than `min(0, cap) = 0 → any row count passes`.
    const ev = createFactsEvaluator({ claimRowCount: 14 })(claimPredicate);
    expect(ev.passed).toBe(false);
    expect(ev.detail).toContain("inventoryCount absent");
  });

  it("claim_ledger_closed: an all-closed ledger passes", () => {
    const facts: PredicateFacts = { unclosedClaimOrdinals: [] };
    const v = evaluateOracle(input({ predicates: [closurePredicate] }), createFactsEvaluator(facts));
    expect(v.outcome).toBe("complete");
  });

  it("claim_ledger_closed: unchecked rows refuse `done` and name their ordinals (the R6CNT.3 shape)", () => {
    // fourteen bare-`unverifiable` placeholder rows — schema-valid, substantively unchecked.
    const facts: PredicateFacts = { unclosedClaimOrdinals: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13] };
    const v = evaluateOracle(input({ predicates: [closurePredicate] }), createFactsEvaluator(facts));
    expect(v).toMatchObject({ outcome: "incomplete", errorClass: "artifact_missing", failedLeg: "predicate" });
    const ev = createFactsEvaluator(facts)(closurePredicate);
    expect(ev.detail).toContain("unchecked");
    expect(ev.detail).toContain("0, 1, 2, 3");
  });

  it("claim_ledger_closed: an absent closure fact fails (proven, never assumed)", () => {
    const v = evaluateOracle(input({ predicates: [closurePredicate] }), createFactsEvaluator({}));
    expect(v).toMatchObject({ outcome: "incomplete", failedLeg: "predicate" });
  });

  it("a partially-unclosed ledger fails even when coverage + schema pass", () => {
    // rows ≥ inventory AND schema-valid, but row 7 is still a placeholder → not done.
    const preds: CompletionPredicate[] = [claimPredicate, closurePredicate];
    const facts: PredicateFacts = {
      claimRowCount: 9,
      inventoryCount: 9,
      unclosedClaimOrdinals: [7],
    };
    const v = evaluateOracle(input({ predicates: preds }), createFactsEvaluator(facts));
    expect(v.outcome).toBe("incomplete");
    if (v.outcome === "incomplete") {
      expect(v.failedPredicates.map((f) => f.predicate.kind)).toEqual(["claim_ledger_closed"]);
    }
  });
});
