import type { ServerFile } from "@rhema/mirror";
import type { SqlExecutor } from "./types.js";
import { liveObligations } from "./reads.js";

// The re-review `obligations.json` mount (REQ-OBJ-4/8). A re-review's mirror gains a READ-ONLY `obligations.json`
// in the LETTER-WRITING context ONLY — never the second read, never the fidelity/gap independence contexts, and
// never first reviews. It is a SERVER-GENERATED file (a projection of the live obligation rows), so
// `materializeScoped` — which hands input-scoped subagents only their explicit files — never surfaces it, and
// the mount manifest attests it like every §12.6 mount. The Editor declares `carriesObligationId` against the
// ids in this file (lineage matcher 2). This module builds the bytes; the orchestrator hydration adds the file
// to the Editor manifest of a re-review (a run whose inputs carry a `priorReviewId`).

export interface ObligationsJsonEntry {
  readonly id: string;
  readonly severity: string;
  readonly kind: string | null;
  readonly title: string;
  readonly state: string;
  readonly roundsOpen: number;
  readonly findingId: string | null;
  readonly openedOnDraftId: string | null;
}
export interface ObligationsJson {
  readonly version: 1;
  readonly obligations: readonly ObligationsJsonEntry[];
}

/** Build the `obligations.json` payload for a project's LIVE (not-closed) obligations, or null when there are none. */
export async function buildObligationsJson(exec: SqlExecutor, projectId: string): Promise<ObligationsJson | null> {
  const live = await liveObligations(exec, projectId);
  if (live.length === 0) return null;
  return {
    version: 1,
    obligations: live.map((o) => ({
      id: o.id,
      severity: o.severity,
      kind: o.kind,
      title: o.title,
      state: o.state,
      roundsOpen: o.roundsOpen,
      findingId: o.findingId,
      openedOnDraftId: o.openedOnDraftId,
    })),
  };
}

/**
 * The `obligations.json` server-generated mount file for a re-review's letter-writing context, or null when the
 * project has no live obligations (a first review). The caller (orchestrator hydration) adds it to the EDITOR
 * seat manifest only — never to an independence-context/scoped subagent (`materializeScoped` excludes derived
 * files by construction; REQ-OBJ-8).
 */
export async function buildObligationsMountFile(exec: SqlExecutor, projectId: string): Promise<ServerFile | null> {
  const json = await buildObligationsJson(exec, projectId);
  if (!json) return null;
  return {
    path: "obligations.json",
    root: "project",
    bytes: Buffer.from(JSON.stringify(json, null, 2), "utf8"),
    kind: null, // a derived server file, not an ArtifactKind (REQ-OBJ-7: obligations add no kind)
    namespace: "shared",
  };
}

/**
 * The orchestrator's `ObligationMountProvider` seam (REQ-OBJ-8). Applies ONLY to the Editor seat of a REVIEW
 * that is a RE-review (its inputs carry a `priorReviewId`) — never a first review, never an independence
 * context. This is where the letter-writing-context-only rule is enforced at hydration; the input-scoped
 * second read / fidelity / gap subagents get `materializeScoped`, which excludes every derived server file.
 */
export function createObligationMountProvider(): {
  forHydration(
    exec: SqlExecutor,
    args: { runId: string; projectId: string | null; seat: string; workflow: string; inputs: Record<string, unknown> },
  ): Promise<ServerFile | null>;
} {
  return {
    async forHydration(exec, args) {
      if (!args.projectId) return null;
      if (args.seat !== "editor") return null; // the letter-writing context is the Editor seat (REQ-OBJ-8)
      if (args.workflow !== "review") return null; // reviews only
      if (!args.inputs || !args.inputs.priorReviewId) return null; // a RE-review — never first reviews
      return buildObligationsMountFile(exec, args.projectId);
    },
  };
}
