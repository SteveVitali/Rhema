import type { WorkflowManifest } from "../src/manifest-types.js";

// Fact-check (`fact-check-only`) — a PHASE-SUBSET run of Review reusing editorial-review's
// implementations and artifact types (REQ-WF-13), realized purely at the manifest level: the same skill
// with `scope` narrowing to the claim inventory + verification phases. `index` order equals the skill's
// own fallback order for this subset (inventory → verification; AC2). The inventory only spends the cap
// on checkable claim kinds — factual / statistical / quotation (REQ-OBJ-19; CHECKABLE_CLAIM_KINDS in
// @rhema/contracts); unchanged claims are not re-verified.

export const factCheck: WorkflowManifest = {
  workflow: "fact_check",
  skill: "editorial-review",
  // `sidecar: true` (PRB.16b F15): a phase below declares `sidecars: ["01-claim-ledger.json"]` whose
  // oracle requires the `.rhema/` twin — the ported skill only emits it under this input.
  defaultInputs: { scope: "claims", verification: true, discourse: false, second_read: false, sidecar: true },
  phases: [
    {
      key: "inventory",
      index: 0,
      label: "Inventorying claims",
      skillPhase: "0",
      seat: "editor",
      artifacts: ["00-claim-inventory.md"],
      predicates: ["claim inventory built (checkable kinds only)"],
      sidecars: [],
      phaseClass: "judge",
      budgetShare: 0.3,
      allowsSubagents: false,
      completionPredicates: [{ kind: "artifact_nonempty", artifact: "00-claim-inventory.md" }],
    },
    {
      key: "verification",
      index: 1,
      label: "Checking claims",
      skillPhase: "1",
      seat: "editor",
      artifacts: ["01-claim-ledger.md"],
      predicates: ["claim rows ≥ inventory", "every claim closed", "sidecar validates"],
      sidecars: ["01-claim-ledger.json"],
      phaseClass: "research",
      budgetShare: 0.7,
      allowsSubagents: true,
      completionPredicates: [
        { kind: "claim_rows_gte_inventory", artifact: "01-claim-ledger.md" },
        // F-R6CNT.3-1 / R6FIX.4 — same closure gate as Review: placeholder rows are not done.
        { kind: "claim_ledger_closed", artifact: "01-claim-ledger.md" },
        { kind: "sidecar_validates", sidecar: "01-claim-ledger.json" },
      ],
    },
  ],
};
