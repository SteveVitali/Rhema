import type { PhaseManifest, WorkflowManifest } from "../src/manifest-types.js";
import { personaPhases } from "./profile_voice.js";

// Calibrate voice (`bootstrap-persona`, calibration-only) — §12.2. A phase-subset run that re-runs the
// calibration (input-scoped hold-out) and re-packages the profile's calibration verdict, reusing the
// same skill. `index` is re-based to execution order within this workflow (0,1); `skillPhase` keeps the
// skill's native phase numbers (4, 5), so the subset stays in the skill's own fallback order (AC2).

const byKey = (k: string): PhaseManifest => personaPhases.find((p) => p.key === k)!;

export const calibrateVoice: WorkflowManifest = {
  workflow: "calibrate_voice",
  skill: "bootstrap-persona",
  defaultInputs: { mode: "bootstrap", calibration: true },
  phases: [
    // calibration IS this workflow's purpose here, not an opt-out phase — drop the flag it inherits.
    { ...byKey("calibration"), index: 0, budgetShare: 0.8, optional: undefined },
    { ...byKey("package"), index: 1, budgetShare: 0.2 },
  ],
};
