import type { WorkflowManifest } from "../src/manifest-types.js";

// Outline (`outline-from-research`, Assistant seat) — §7.3 / §12.2 Outline row (P1.12). Linear
// phase order: harvest (package — assembles the thread's source notes + research index and
// re-fetches exactly the thread's URL set) → classify (judge — groups claims/sources, carrying
// provenance + [unverified] through verbatim) → spine (generate — the 5–12 claim spine + the
// spine-and-sections map) → gaps (judge — alternatives considered + gaps only the author can fill,
// writing the outline artifact + its structured twin). `approve_outline` gates the gaps phase — a
// WAIT gate, never auto-proceeds (REQ-CHAT-15); the gate binds the produced `.md` version so the
// card + write-back overlay edit the real artifact.
//
// Seat/conduit (REQ-SPEC-15): the run rides the Assistant seat (§7.1's workflow column) — it READS
// `agents/assistant/**` natively at harvest and writes the assistant working files under
// `agents/assistant/research/outline-<run>/`. The product is the only author-namespace write the
// seat can make: the declared `agents/author/outline/<slug>.{md,json}` paths mount read on the
// seat table and upgrade to readwrite through `declaredWritableArtifacts` — the outline artifact
// IS the sanctioned conduit. `<slug>` resolves to the frozen `inputs.outlineSlug` at runspec build
// (a re-outline of the same slug lands as a new VERSION of the same artifact — REQ-WF-11).

export const outline: WorkflowManifest = {
  workflow: "outline",
  skill: "outline-from-research",
  // `sidecar: true` (the editor's row model needs the structured twin — P1.12 deliverable 4).
  defaultInputs: { sidecar: true },
  phases: [
    {
      key: "harvest",
      index: 0,
      label: "Harvesting the chat",
      skillPhase: "0",
      seat: "assistant",
      artifacts: ["agents/assistant/research/outline-<run>/00-harvest.md"],
      predicates: ["thread digest + every thread URL accounted for (fetched or FAILED→[unverified])"],
      sidecars: [],
      phaseClass: "package",
      budgetShare: 0.3,
      allowsSubagents: false,
      completionPredicates: [
        { kind: "artifact_nonempty", artifact: "agents/assistant/research/outline-<run>/00-harvest.md" },
      ],
    },
    {
      key: "classify",
      index: 1,
      label: "Sorting claims",
      skillPhase: "1",
      seat: "assistant",
      artifacts: ["agents/assistant/research/outline-<run>/01-claims.md"],
      predicates: ["every claim classified with its provenance tag carried through"],
      sidecars: [],
      phaseClass: "judge",
      budgetShare: 0.2,
      allowsSubagents: false,
      completionPredicates: [
        { kind: "artifact_nonempty", artifact: "agents/assistant/research/outline-<run>/01-claims.md" },
      ],
    },
    {
      key: "spine",
      index: 2,
      label: "Proposing a spine",
      skillPhase: "2",
      seat: "assistant",
      artifacts: ["agents/assistant/research/outline-<run>/02-spine.md"],
      predicates: ["5–12 claim spine + section map + alternatives considered"],
      sidecars: [],
      phaseClass: "generate",
      budgetShare: 0.25,
      allowsSubagents: false,
      completionPredicates: [
        { kind: "artifact_nonempty", artifact: "agents/assistant/research/outline-<run>/02-spine.md" },
      ],
    },
    {
      key: "gaps",
      index: 3,
      label: "Listing gaps",
      skillPhase: "3",
      seat: "assistant",
      // the artifact + its `.json` twin — both declared so the writable grant covers the pair the
      // Approve-outline card + editor read (the oracle's sidecar twin lives at
      // `agents/assistant/.rhema/outline.json`, the seat's writable dir).
      artifacts: ["agents/author/outline/<slug>.md", "agents/author/outline/<slug>.json"],
      predicates: ["outline artifact written", "sidecar validates", "spine 5–12"],
      sidecars: ["outline.json"],
      gateAfter: "approve_outline",
      gateArtifact: "agents/author/outline/<slug>.md",
      phaseClass: "judge",
      budgetShare: 0.25,
      allowsSubagents: false,
      completionPredicates: [
        { kind: "artifact_nonempty", artifact: "agents/author/outline/<slug>.md" },
        { kind: "sidecar_validates", sidecar: "outline.json" },
        { kind: "outline_spine_bound", artifact: "outline.json", min: 5, max: 12 },
      ],
    },
  ],
};
