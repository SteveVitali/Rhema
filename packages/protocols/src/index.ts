// @rhema/protocols (PRIVATE) — the product's substance: the ported skills, the phase manifests, the
// estimator constants, the Essay protocol seed, the path→kind map, and the closed input-source schema
// (REQ-ARCH-5/6/8, REQ-SPEC-4/13, REQ-WF-13, REQ-GENRE-1/4, REQ-OBJ-4/11/19). Resolved by path via
// RHEMA_PROTOCOLS_PATH; a public clone builds against packages/protocols-stub instead (REQ-ARCH-37).
// The manifest TYPES here are a superset of the stub's — consumers (engine, run-task) read only the
// shared fields, so the same import works against either resolution.

import type { WorkflowKey } from "@rhema/contracts";
import type { WorkflowManifest } from "./manifest-types.js";
import { review } from "../manifests/review.js";
import { revise } from "../manifests/revise.js";
import { factCheck } from "../manifests/fact_check.js";
import { profileVoice } from "../manifests/profile_voice.js";
import { refreshVoice } from "../manifests/refresh_voice.js";
import { calibrateVoice } from "../manifests/calibrate_voice.js";

export * from "./manifest-types.js";
export * from "./estimator.js";
export * from "./protocols.js";
export * from "./path-kind.js";
export * from "./input-sources.js";
export * from "./version.js";

export { review, revise, factCheck, profileVoice, refreshVoice, calibrateVoice };

/** Every workflow manifest this phase ships, keyed by WorkflowKey (§12.2; adding a workflow is a manifest — REQ-ARCH-6). */
export const WORKFLOW_MANIFESTS: Partial<Record<WorkflowKey, WorkflowManifest>> = {
  review,
  revise,
  fact_check: factCheck,
  profile_voice: profileVoice,
  refresh_voice: refreshVoice,
  calibrate_voice: calibrateVoice,
};
