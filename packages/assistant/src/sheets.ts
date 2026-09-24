import { ASSISTANT_PREPARATORY_TOOLS, type WorkflowKey } from "@rhema/contracts";

// Preparatory tools → run sheets (REQ-CHAT-6). `start_workflow`, `propose_outline`, `visualize`,
// `elicit`, `measure` NEVER create a run — they return the run SHEET payload the Desk renders, and
// the user's Run click (P1.06's sheet) is the only run creator. This module is the tool-result shape:
// a `sheet` payload carries the sheet GET href (+ prefilled levers), so a tool call cannot smuggle a
// run creation past the consent surface.

export type PreparatoryTool = (typeof ASSISTANT_PREPARATORY_TOOLS)[number];

export function isPreparatoryTool(tool: string): tool is PreparatoryTool {
  return (ASSISTANT_PREPARATORY_TOOLS as readonly string[]).includes(tool);
}

/** The run-sheet payload a preparatory tool returns (never a run id — a link + the priced inputs). */
export interface RunSheetResult {
  kind: "run_sheet";
  /** the workflow the sheet prices. */
  workflow: WorkflowKey;
  /** the sheet GET href (`/p/<slug>/sheet?workflow=…&…`) — a GET, never a POST. */
  href: string;
  /** prefilled lever/scope inputs the sheet opens with. */
  inputs: Record<string, string | number | boolean>;
}

/**
 * Build the sheet payload for a preparatory tool call. `start_workflow`/`propose_outline` map to
 * their workflow; `visualize`/`elicit`/`measure` return the sheet for the workflow they feed
 * (visualize → figure sheet; elicit → the interview/chat continuation; measure → no sheet, a metric
 * result — callers type-narrow).
 */
export function runSheetResult(args: {
  projectSlug: string;
  workflow: WorkflowKey;
  inputs?: Record<string, string | number | boolean>;
}): RunSheetResult {
  const params = new URLSearchParams({ workflow: args.workflow });
  for (const [k, v] of Object.entries(args.inputs ?? {})) params.set(k, String(v));
  return {
    kind: "run_sheet",
    workflow: args.workflow,
    href: `/p/${args.projectSlug}/sheet?${params.toString()}`,
    inputs: args.inputs ?? {},
  };
}
