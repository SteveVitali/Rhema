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
import { draft } from "../manifests/draft.js";
import { researchBurst } from "../manifests/research_burst.js";
import { chatTurn } from "../manifests/chat_turn.js";
import { outline } from "../manifests/outline.js";
import { figure } from "../manifests/figure.js";
import { reseedCharter } from "../manifests/reseed_charter.js";

export * from "./manifest-types.js";
export * from "./estimator.js";
export * from "./protocols.js";
export * from "./path-kind.js";
export * from "./input-sources.js";
export * from "./version.js";
export * from "../parsers/index.js";
export * from "../serializers/index.js";

export { review, revise, factCheck, profileVoice, refreshVoice, calibrateVoice, draft, researchBurst, chatTurn, outline, figure, reseedCharter };

/** Every workflow manifest this phase ships, keyed by WorkflowKey (§12.2; adding a workflow is a manifest — REQ-ARCH-6). */
export const WORKFLOW_MANIFESTS: Partial<Record<WorkflowKey, WorkflowManifest>> = {
  review,
  draft,
  revise,
  fact_check: factCheck,
  profile_voice: profileVoice,
  refresh_voice: refreshVoice,
  calibrate_voice: calibrateVoice,
  // P1.11 — the Assistant seat's Rhema-owned workflows (authored here, no upstream pin).
  research_burst: researchBurst,
  chat_turn: chatTurn,
  // P1.12 — the Outline promotion run (Rhema-owned like its P1.11 siblings; §7.3, §12.2 row).
  outline,
  // P1.13 — the Figure run (Rhema-owned; §7.5, §6.2 Figure row). Drafter seat; the render phase's
  // deterministic output is the figure.render worker job, never the pod's.
  figure,
  // P1.14 — the adopt hatch's optional reseed run (§9.6): one bounded rewrite of the project's
  // voice-charter seeded block (guidance lines verbatim — the kind's editMode is guidance_only).
  reseed_charter: reseedCharter,
};
