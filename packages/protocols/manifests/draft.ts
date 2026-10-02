import type { WorkflowManifest } from "../src/manifest-types.js";

// Draft (`draft-from-outline`, Drafter seat) — §12.2. Linear phase order (the skill's fallback is
// 0..7, so `index` === `skillPhase`). The declared back-edge is `grounding → plan` (REQ-WF-5): a
// grounding phase that cannot verify the claims the plan depends on reports `replan`, and the
// harness re-runs the structure plan with the failure as input (capped at two re-plans — the third
// failure opens a refusal Approval). The plan phase gates on `approve_plan` — P1.09's card edits the
// real `02-structure-plan` via the `structure_plan` write-back overlay. The audit is input-scoped
// with the ≤3 iteration cap (§12.6). Drafting is serial (REQ-WF-4): the draft phase never fans out
// (`allowsSubagents: false` — "the Drafter has no drafting subagent", §12.6).
//
// Version placeholders: `v(N+1)` resolves to the NEXT draft ordinal (the new `drafts/vN.md` this run
// produces — there is no base draft); the whole drafting dossier lives under
// `agents/author/drafting/v(N+1)/` per the skill's workspace convention.

export const draft: WorkflowManifest = {
  workflow: "draft",
  skill: "draft-from-outline",
  // `sidecar: true` gates `.rhema/structure-plan.json` + `.rhema/03-claim-ledger.json` + the
  // phase-result emission in the ported skill (same convention as revise — PRB.16b F15).
  defaultInputs: { sidecar: true },
  phases: [
    {
      key: "intake",
      index: 0,
      label: "Reading the outline",
      skillPhase: "0",
      seat: "author",
      artifacts: ["agents/author/drafting/v(N+1)/00-commissioning-brief.md"],
      predicates: ["thesis + claim inventory present"],
      sidecars: [],
      phaseClass: "judge",
      budgetShare: 0.08,
      allowsSubagents: false,
      completionPredicates: [
        { kind: "artifact_nonempty", artifact: "agents/author/drafting/v(N+1)/00-commissioning-brief.md" },
      ],
    },
    {
      key: "voice",
      index: 1,
      label: "Binding voice",
      skillPhase: "1",
      seat: "author",
      artifacts: ["agents/author/drafting/v(N+1)/01-voice-brief.md"],
      predicates: ["voice brief present"],
      sidecars: [],
      phaseClass: "judge",
      budgetShare: 0.05,
      allowsSubagents: false,
      completionPredicates: [
        { kind: "artifact_nonempty", artifact: "agents/author/drafting/v(N+1)/01-voice-brief.md" },
      ],
    },
    {
      key: "plan",
      index: 2,
      label: "Planning the structure",
      skillPhase: "2",
      seat: "author",
      artifacts: ["agents/author/drafting/v(N+1)/02-structure-plan.md"],
      predicates: ["spine ≥3 claims", "sidecar validates"],
      sidecars: ["structure-plan.json"],
      gateAfter: "approve_plan",
      // the Approve-plan card binds + edits the real plan artifact (REQ-GATE-5/6; P1.09's
      // structured fields + `structure_plan` write-back overlay).
      gateArtifact: "agents/author/drafting/v(N+1)/02-structure-plan.md",
      phaseClass: "generate",
      budgetShare: 0.12,
      allowsSubagents: false,
      completionPredicates: [
        { kind: "artifact_nonempty", artifact: "agents/author/drafting/v(N+1)/02-structure-plan.md" },
        { kind: "spine_min", artifact: "agents/author/drafting/v(N+1)/02-structure-plan.md", min: 3 },
        { kind: "sidecar_validates", sidecar: "structure-plan.json" },
      ],
    },
    {
      key: "grounding",
      index: 3,
      label: "Verifying sources",
      skillPhase: "3",
      seat: "author",
      artifacts: ["agents/author/drafting/v(N+1)/03-claim-ledger.md"],
      predicates: ["claim ledger present", "sidecar validates"],
      sidecars: ["03-claim-ledger.json"],
      optional: "quick",
      optOutFlag: "grounding",
      backEdges: ["plan"],
      phaseClass: "research",
      budgetShare: 0.25,
      allowsSubagents: true,
      completionPredicates: [
        { kind: "artifact_nonempty", artifact: "agents/author/drafting/v(N+1)/03-claim-ledger.md" },
        { kind: "sidecar_validates", sidecar: "03-claim-ledger.json" },
      ],
    },
    {
      key: "draft",
      index: 4,
      label: "Writing",
      skillPhase: "4",
      seat: "author",
      artifacts: ["drafts/v(N+1).md", "agents/author/drafting/v(N+1)/04-draft-ledger.md"],
      predicates: ["draft sections = plan sections"],
      sidecars: [],
      phaseClass: "generate",
      budgetShare: 0.3,
      // REQ-WF-4 / §12.6: drafting is never delegated — no parallel sections, no drafting subagent.
      allowsSubagents: false,
      completionPredicates: [
        { kind: "artifact_nonempty", artifact: "drafts/v(N+1).md" },
        { kind: "draft_sections_eq_plan", artifact: "drafts/v(N+1).md" },
      ],
    },
    {
      key: "consolidation",
      index: 5,
      label: "Tightening",
      skillPhase: "5",
      seat: "author",
      artifacts: ["agents/author/drafting/v(N+1)/05-consolidation-notes.md"],
      predicates: ["consolidation notes present"],
      sidecars: [],
      phaseClass: "generate",
      budgetShare: 0.08,
      allowsSubagents: false,
      completionPredicates: [
        { kind: "artifact_nonempty", artifact: "agents/author/drafting/v(N+1)/05-consolidation-notes.md" },
      ],
    },
    {
      key: "audit",
      index: 6,
      label: "Independent audit",
      skillPhase: "6",
      seat: "author",
      artifacts: ["agents/author/drafting/v(N+1)/06-fidelity-audit.md"],
      predicates: ["audit present"],
      sidecars: [],
      optional: "quick",
      optOutFlag: "audit",
      phaseClass: "judge",
      // input-scoped fresh-context audit, ≤3 close-and-reverify iterations (§12.2/§12.6).
      maxIterations: 3,
      budgetShare: 0.07,
      allowsSubagents: false,
      completionPredicates: [
        { kind: "artifact_nonempty", artifact: "agents/author/drafting/v(N+1)/06-fidelity-audit.md" },
      ],
    },
    {
      key: "delivery",
      index: 7,
      label: "Delivered",
      skillPhase: "7",
      seat: "author",
      artifacts: ["correspondence/v(N+1)-drafting-note.md"],
      predicates: ["drafting note present"],
      // the delivery dossier folds the grounding ledger into `claims` rows on the item — the
      // sidecar is declared here so `dossierForPhase` ships it (same pattern as revise's
      // response-ledger twin on its `deliver` phase, PRB.19 F26).
      sidecars: ["03-claim-ledger.json"],
      phaseClass: "package",
      budgetShare: 0.05,
      allowsSubagents: false,
      completionPredicates: [
        { kind: "artifact_nonempty", artifact: "correspondence/v(N+1)-drafting-note.md" },
      ],
    },
  ],
};
