import type { WorkflowManifest } from "../src/manifest-types.js";

// Research burst (§6.2 Research row; §12.2; P1.11) — the Assistant seat's Rhema-owned background
// research run. plan (judge — decomposes the question into ≤N fetches) → fetch (research — ≤N sources,
// N from the plan card, bounded fan-out) → distill (generate — ONE distilled research note + the
// source cards + the research-result.json sidecar). NO gate: the chat plan card IS the consent
// (§6.2), and every output lands under agents/assistant/research/ — the two-conduit rule (REQ-SPEC-15)
// forbids an outline/thesis/originality artifact, asserted by the conduit contract test.
// `<run>` in the artifact paths resolves to the run's burst directory (`burst-<runId>`), substituted
// into `phase_output` at runspec build and matched by the oracle's template cascade.

export const researchBurst: WorkflowManifest = {
  workflow: "research_burst",
  skill: "research-burst",
  // `sidecar: true` (PRB.16b F15): the distill phase's oracle requires the `.rhema/` twin.
  defaultInputs: { sidecar: true },
  phases: [
    {
      key: "plan",
      index: 0,
      label: "Planning the research",
      skillPhase: "0",
      seat: "assistant",
      artifacts: ["agents/assistant/research/burst-<run>/00-plan.md"],
      predicates: ["fetch plan decomposed (≤N sources)"],
      sidecars: [],
      phaseClass: "judge",
      budgetShare: 0.15,
      allowsSubagents: false,
      completionPredicates: [
        { kind: "artifact_nonempty", artifact: "agents/assistant/research/burst-<run>/00-plan.md" },
      ],
    },
    {
      key: "fetch",
      index: 1,
      label: "Fetching sources",
      skillPhase: "1",
      seat: "assistant",
      // the fetch ledger; the per-source notes land at agents/assistant/research/sources/<slug>.md.
      artifacts: ["agents/assistant/research/burst-<run>/01-sources.md"],
      predicates: ["≤N source cards; failures marked [unverified], never retried"],
      sidecars: [],
      phaseClass: "research",
      budgetShare: 0.55,
      allowsSubagents: true, // PRB.24: bounded researcher fan-out (≤5 per batch), compact verdicts back.
      completionPredicates: [
        { kind: "artifact_nonempty", artifact: "agents/assistant/research/burst-<run>/01-sources.md" },
      ],
    },
    {
      key: "distill",
      index: 2,
      label: "Distilling the note",
      skillPhase: "2",
      seat: "assistant",
      artifacts: ["agents/assistant/research/burst-<run>/note.md"],
      predicates: ["one distilled research note", "sidecar validates"],
      sidecars: ["research-result.json"],
      phaseClass: "generate",
      budgetShare: 0.3,
      allowsSubagents: false,
      completionPredicates: [
        { kind: "artifact_nonempty", artifact: "agents/assistant/research/burst-<run>/note.md" },
        { kind: "sidecar_validates", sidecar: "research-result.json" },
      ],
    },
  ],
};
