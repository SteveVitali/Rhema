import type { WorkflowManifest } from "../src/manifest-types.js";

// Review (`editorial-review`, Editor seat) — §12.2. `index` is execution order and equals the skill's
// OWN FALLBACK ORDER 0,4,1,2,5,3,6 = intake, craft, verification, discourse, second read, argument,
// letter (review 13 F17; AC2); `skillPhase` records the skill's native phase number. Judge-class phases
// declare `allowsSubagents: false` — the hook rejects `Agent` in them, so the parent Editor can never
// spawn its own second read (§12.2; AC3). MVP fan-out is intra-query, so the step graph stays linear
// (no `parallelGroup`). `optional` marks a phase omitted at or below that rigor notch (provisional
// rigor→flag mapping; owned by P0.06/§6.5).

export const review: WorkflowManifest = {
  workflow: "review",
  skill: "editorial-review",
  // Harness inputs (REQ-ARCH-5, added at port): pin the dossier to the Editor's WRITABLE seat namespace
  // (`agents/editor/**` — §12.6) instead of the skill's default `correspondence/…` dossier, which is a READ-only
  // mount for the seat (the SERVER delivers to correspondence via the delivery tx, not the agent). `sidecar: true`
  // makes the skill emit the §11.1 structured twins + write `.rhema/phase-result.json {status}` at each phase end
  // (the completion oracle's leg b). Diagnosed live: without these the agent wrote 00-piece-brief.md into the
  // read-only correspondence mount and never emitted phase-result.json, so no phase could commit (D-P0.06-1/K5).
  defaultInputs: { output_dir: "agents/editor", sidecar: true },
  phases: [
    {
      key: "intake",
      index: 0,
      label: "Reading the piece",
      skillPhase: "0",
      seat: "editor",
      artifacts: ["00-piece-brief.md"],
      predicates: ["thesis + inventory present"],
      sidecars: [],
      gateAfter: "approve_scope",
      phaseClass: "judge",
      budgetShare: 0.1,
      allowsSubagents: false,
      completionPredicates: [{ kind: "thesis_and_inventory_present", artifact: "00-piece-brief.md" }],
    },
    {
      key: "craft",
      index: 1,
      label: "Reading the prose",
      skillPhase: "4",
      seat: "editor",
      artifacts: ["04-craft-notes.md"],
      predicates: ["craft notes present"],
      sidecars: [],
      phaseClass: "judge",
      budgetShare: 0.12,
      allowsSubagents: false,
      completionPredicates: [{ kind: "artifact_nonempty", artifact: "04-craft-notes.md" }],
    },
    {
      key: "verification",
      index: 2,
      label: "Checking claims",
      skillPhase: "1",
      seat: "editor",
      artifacts: ["01-claim-ledger.md"],
      predicates: ["claim rows ≥ inventory", "every claim closed", "sidecar validates"],
      sidecars: ["01-claim-ledger.json"],
      optOutFlag: "verification",
      phaseClass: "research",
      budgetShare: 0.24,
      allowsSubagents: true,
      completionPredicates: [
        { kind: "claim_rows_gte_inventory", artifact: "01-claim-ledger.md" },
        // F-R6CNT.3-1 / R6FIX.4 — row count is not closure: schema-valid placeholder rows
        // (bare `unverifiable`, no evidence) must not carry the phase to `done`.
        { kind: "claim_ledger_closed", artifact: "01-claim-ledger.md" },
        { kind: "sidecar_validates", sidecar: "01-claim-ledger.json" },
      ],
    },
    {
      key: "discourse",
      index: 3,
      label: "Mapping the field",
      skillPhase: "2",
      seat: "editor",
      artifacts: ["02-discourse-report.md"],
      predicates: ["discourse report present"],
      sidecars: [],
      optional: "quick",
      optOutFlag: "discourse",
      phaseClass: "research",
      budgetShare: 0.18,
      allowsSubagents: true,
      completionPredicates: [{ kind: "artifact_nonempty", artifact: "02-discourse-report.md" }],
    },
    {
      key: "second_read",
      index: 4,
      label: "Second read",
      skillPhase: "5",
      seat: "editor",
      artifacts: ["05-second-read.md"],
      predicates: ["produced by the input-scoped query"],
      sidecars: [],
      optional: "quick",
      optOutFlag: "second_read",
      phaseClass: "judge",
      budgetShare: 0.12,
      allowsSubagents: false,
      completionPredicates: [{ kind: "second_read_producer_checked", artifact: "05-second-read.md" }],
    },
    {
      key: "argument",
      index: 5,
      label: "Weighing the argument",
      skillPhase: "3",
      seat: "editor",
      artifacts: ["03-argument-notes.md"],
      predicates: ["argument notes present"],
      sidecars: [],
      phaseClass: "judge",
      budgetShare: 0.12,
      allowsSubagents: false,
      completionPredicates: [{ kind: "artifact_nonempty", artifact: "03-argument-notes.md" }],
    },
    {
      key: "letter",
      index: 6,
      label: "Writing the letter",
      skillPhase: "6",
      seat: "editor",
      artifacts: ["editors-letter.md"],
      predicates: ["all letter sections", "rubric 8 dims", "sidecars validate"],
      sidecars: ["findings.json", "rubric.json"],
      phaseClass: "generate",
      budgetShare: 0.12,
      allowsSubagents: false,
      completionPredicates: [
        { kind: "letter_sections_complete", artifact: "editors-letter.md" },
        { kind: "rubric_dimensions_complete", artifact: "rubric.json", count: 8 },
        { kind: "sidecar_validates", sidecar: "findings.json" },
        { kind: "sidecar_validates", sidecar: "rubric.json" },
      ],
    },
  ],
};
