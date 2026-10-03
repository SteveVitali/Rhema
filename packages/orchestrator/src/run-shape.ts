// Deriving a run's seat and the phase classes it will execute, from the workflow + its manifest. Used by run
// creation (capability validation input) and provisioning (the credential's role). Keeps the api route thin.

import type { WorkflowKey } from "@rhema/contracts";
import { WORKFLOW_MANIFESTS } from "@rhema/protocols";
import type { PhaseClass } from "./capabilities.js";

/** The authoring/reading seat each workflow runs as (agent_types.key). */
export const SEAT_BY_WORKFLOW: Partial<Record<WorkflowKey, string>> = {
  review: "editor",
  fact_check: "editor",
  draft: "author",
  revise: "author",
  cut_to_length: "author",
  line_edit: "author",
  profile_voice: "persona_builder",
  refresh_voice: "persona_builder",
  compose_voice: "persona_builder",
  calibrate_voice: "persona_builder",
  reseed_charter: "persona_builder",
  outline: "assistant",
  research_burst: "assistant",
  chat_turn: "assistant",
  // P1.13 — §6.2 Figure row: the visualize run rides the Drafter seat (the asset's spec/data/
  // provenance commit under `assets/figures/<fig>/` via the declared-output conduit; the
  // Assistant's `visualize` tool only prepares the run SHEET — it never authors the figure).
  figure: "author",
};

export function seatForWorkflow(workflow: WorkflowKey): string {
  return SEAT_BY_WORKFLOW[workflow] ?? "editor";
}

/**
 * The distinct phase classes a run will execute — the input to model-profile capability validation
 * (REQ-ARCH-9). Derived from the workflow's manifest; a workflow without a manifest (MVP subset) falls back to
 * the four classes so an over-broad profile can't slip through unvalidated.
 */
export function phaseClassesForWorkflow(workflow: WorkflowKey): PhaseClass[] {
  const manifest = WORKFLOW_MANIFESTS[workflow];
  if (!manifest) return ["research", "judge", "generate", "package"];
  const classes = new Set<PhaseClass>();
  for (const phase of manifest.phases) classes.add(phase.phaseClass as PhaseClass);
  return [...classes];
}

/**
 * The workflow's phase list for the run card / run report (P1.05; §5.5): manifest order, each phase's seat,
 * and whether the run's FROZEN inputs opt it out (the same `optOutFlag`/`optional` rule `buildHarnessRunSpec`
 * applies — duplicated nowhere else; the card's "off" rows come from THIS, REQ-IDE-12).
 */
export function phaseShapeForWorkflow(
  workflow: WorkflowKey,
  inputs: Record<string, unknown>,
): readonly { key: string; seat: string | null; off: boolean }[] {
  const manifest = WORKFLOW_MANIFESTS[workflow];
  if (!manifest) return [];
  return manifest.phases.map((p) => ({
    key: p.key,
    seat: p.seat,
    off:
      (p.optOutFlag != null && inputs[p.optOutFlag] === false) ||
      (p.optional != null && inputs["tier"] === p.optional),
  }));
}
