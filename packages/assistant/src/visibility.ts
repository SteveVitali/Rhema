import type { AgentTypeKey } from "@rhema/contracts";

// REQ-CHAT-20 — the live-run read filter. A side question asked WHILE A RUN IS LIVE sees only
// committed artifacts + the feed — never the run's uncommitted/intermediate state (the pod's working
// files are invisible until committed). This predicate is the checkable form: an artifact is visible
// to the assistant mid-run iff it is COMMITTED (delivered/frozen) or is a feed-visible event row.

/** How a project artifact reached the tree (the registry's per-row fact). */
export type ArtifactCommitState = "committed" | "uncommitted" | "run_projected";

/** True when the assistant may read this artifact during a live run. */
export function assistantMayReadDuringRun(state: ArtifactCommitState): boolean {
  return state === "committed";
}

/**
 * Filter an artifact list to the assistant's live-run read set (REQ-CHAT-20). During NO live run
 * everything mounts normally; during a live run only `committed` rows pass.
 */
export function committedReadFilter<T extends { state: ArtifactCommitState }>(
  rows: readonly T[],
  liveRun: boolean,
): T[] {
  if (!liveRun) return [...rows];
  return rows.filter((r) => assistantMayReadDuringRun(r.state));
}

/**
 * The assistant's seat-policy check restated as a predicate (REQ-OBJ-10's Assistant clause +
 * the mount isolation): `preferences.md` reads; `agents/assistant/**` reads AND writes; frozen
 * author ledgers read; everything else in `agents/` denies. `compileSeatPolicy` is the enforcement;
 * this is the domain-level statement the api + tests assert the SAME way.
 */
export function assistantPathAccess(path: string): "readwrite" | "read" | "deny" {
  const p = path.replace(/^\.\//, "").replace(/^\/+/, "");
  if (p.startsWith("agents/assistant/") || p === "agents/assistant") return "readwrite";
  if (p === "agents/author/ledgers" || p.startsWith("agents/author/ledgers/")) return "read";
  if (p.startsWith("agents/") || p.startsWith("HOLDOUT-")) return "deny";
  if (
    p === "preferences.md" ||
    p === "manifest.md" ||
    p.startsWith("drafts/") ||
    p.startsWith("assets/") ||
    p.startsWith("correspondence/")
  )
    return "read";
  return "deny";
}

/** The seat key this package serves (one import site). */
export const ASSISTANT_SEAT: AgentTypeKey = "assistant";
