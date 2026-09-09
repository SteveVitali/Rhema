import type { WorkflowManifest } from "../src/manifest-types.js";
import { personaPhases } from "./profile_voice.js";

// Update voice (`bootstrap-persona` mode: refresh) — §12.2. Same six persona phases as profile_voice;
// `mode: refresh` reads provenance and ingests only pieces changed since the last accessed date, so
// close reading skips pieces with a persisted note and Refresh costs only the delta (REQ-WF-11).

export const refreshVoice: WorkflowManifest = {
  workflow: "refresh_voice",
  skill: "bootstrap-persona",
  defaultInputs: { mode: "refresh" },
  phases: personaPhases,
};
