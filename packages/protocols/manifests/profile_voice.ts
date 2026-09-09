import type { PhaseManifest, WorkflowManifest } from "../src/manifest-types.js";

// Profile voice / Update voice (`bootstrap-persona`, Persona builder seat) — §12.2. The six persona
// phases: census → close reading (fan-out per piece; skips pieces with a persisted note) → voice →
// substance → calibration (input-scoped; hold-out only after the prediction file exists) → package.
// Census gates on Approve sample. `optional: "quick"` marks the phases the Quick Voice tier omits
// (substance + calibration) — Quick Voice = census + close reading + voice + package, which "must work
// end-to-end" (ticket); Full Profile runs all six. Shared by profile_voice / refresh_voice /
// calibrate_voice (the WorkflowKey selects mode; the phases are the same skill).

export const personaPhases: PhaseManifest[] = [
  {
    key: "census",
    index: 0,
    label: "Counting the corpus",
    skillPhase: "0",
    seat: "persona_builder",
    artifacts: ["profile/provenance.md", "profile/index.md"],
    predicates: ["census + sample + hold-out recorded"],
    sidecars: [],
    gateAfter: "approve_sample",
    phaseClass: "package",
    budgetShare: 0.1,
    allowsSubagents: false,
    completionPredicates: [{ kind: "artifact_present", artifact: "profile/provenance.md" }],
  },
  {
    key: "close_reading",
    index: 1,
    label: "Close reading",
    skillPhase: "1",
    seat: "persona_builder",
    artifacts: ["profile/corpus/index.md"],
    predicates: ["per-piece notes (skips persisted)"],
    sidecars: [],
    phaseClass: "research",
    budgetShare: 0.4,
    allowsSubagents: true,
    completionPredicates: [{ kind: "artifact_present", artifact: "profile/corpus/index.md" }],
  },
  {
    key: "voice",
    index: 2,
    label: "Measuring voice",
    skillPhase: "2",
    seat: "persona_builder",
    artifacts: ["profile/voice-print.md", "profile/structure-repertoire.md", "profile/lexicon.md", "profile/exemplars.md"],
    predicates: ["voice print measured"],
    sidecars: [],
    phaseClass: "judge",
    budgetShare: 0.18,
    allowsSubagents: false,
    completionPredicates: [{ kind: "artifact_nonempty", artifact: "profile/voice-print.md" }],
  },
  {
    key: "substance",
    index: 3,
    label: "Recording positions",
    skillPhase: "3",
    seat: "persona_builder",
    artifacts: ["profile/positions.md", "profile/continuity.md", "profile/audience-and-venue.md"],
    predicates: ["positions / continuity / venue"],
    sidecars: [],
    optional: "quick",
    phaseClass: "judge",
    budgetShare: 0.12,
    allowsSubagents: false,
    completionPredicates: [{ kind: "artifact_present", artifact: "profile/positions.md" }],
  },
  {
    key: "calibration",
    index: 4,
    label: "Calibration",
    skillPhase: "4",
    seat: "persona_builder",
    artifacts: ["profile/calibration.md"],
    predicates: ["hold-out predicted before read; produced by the input-scoped query"],
    sidecars: [],
    optional: "quick",
    phaseClass: "judge",
    maxIterations: 3,
    budgetShare: 0.12,
    allowsSubagents: false,
    completionPredicates: [{ kind: "artifact_nonempty", artifact: "profile/calibration.md" }],
  },
  {
    key: "package",
    index: 5,
    label: "Packaged",
    skillPhase: "5",
    seat: "persona_builder",
    artifacts: ["profile/index.md"],
    predicates: ["hub packaged with staleness verdict"],
    sidecars: [],
    phaseClass: "package",
    budgetShare: 0.08,
    allowsSubagents: false,
    completionPredicates: [{ kind: "artifact_nonempty", artifact: "profile/index.md" }],
  },
];

export const profileVoice: WorkflowManifest = {
  workflow: "profile_voice",
  skill: "bootstrap-persona",
  defaultInputs: { mode: "bootstrap" },
  phases: personaPhases,
};
