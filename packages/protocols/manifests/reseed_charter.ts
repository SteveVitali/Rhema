import type { WorkflowManifest } from "../src/manifest-types.js";

// Reseed charter (`bootstrap-persona`, Persona builder seat) — §9.6 / REQ-WF-11's persona half. The
// adopt hatch's optional run: rewrite the project's `agents/author/voice-charter.md` seeded block
// from the adopted profile while the `## Guidance` section carries verbatim (the artifact kind's
// editMode is guidance_only — guidance lines are never in the run's output scope). One phase.

export const reseedCharter: WorkflowManifest = {
  workflow: "reseed_charter",
  skill: "bootstrap-persona",
  defaultInputs: { mode: "reseed" },
  phases: [
    {
      key: "reseed",
      index: 0,
      label: "Reseeding the charter",
      // Rhema-owned phase (added at port): `phase=reseed` runs the charter-rewrite step the
      // bootstrap-persona harness inputs document — not one of the upstream six.
      skillPhase: "reseed",
      seat: "persona_builder",
      artifacts: ["agents/author/voice-charter.md"],
      predicates: ["voice-derived lines rewritten; guidance lines untouched"],
      sidecars: [],
      phaseClass: "generate",
      budgetShare: 1,
      allowsSubagents: false,
      completionPredicates: [{ kind: "artifact_nonempty", artifact: "agents/author/voice-charter.md" }],
    },
  ],
};
