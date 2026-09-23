// Per-document runtime state for the collab extension (P1.03). A `draft:<id>` document keeps its
// tenant + binding facts (resolved once at load under the connection's tenant scope), the pending
// update deltas the next restore point flushes, the last snapshot's state vector (each delta is an
// `encodeStateAsUpdate(doc, snapshotSv)` diff — self-sufficient from its snapshot base), the cadence
// timestamps, and the stateless-stashed sidecars (the Page's live provenance capture; the block-patch
// path's `human_mobile` block set).

import type { ProvenanceSpan } from "@rhema/findings-core";

export interface ProvenanceStash {
  readonly spans?: readonly ProvenanceSpan[];
  readonly agentSpans?: readonly { blockId: string; from: number; to: number }[];
}

export interface DocRuntime {
  readonly workspaceId: string;
  readonly projectId: string;
  /** the head this runtime writes to — re-pointed when a connection's auth forked a frozen head. */
  draftId: string;
  liveDocId: string;
  /** the first authenticating connection's user — the materialization's author (single-user MVP). */
  userId: string;
  /** updates applied since the last restore point — the next delta's payload material. */
  pendingDelta: Uint8Array[];
  /** the state vector the last SNAPSHOT was cut at — every delta is encoded relative to it. */
  snapshotSv: Uint8Array | null;
  /** epoch ms of the last restore point of any kind (the 5-minute-activity cadence). */
  lastPointAt: number | null;
  /** epoch ms of the last `kind='snapshot'` point (the daily full-snapshot cadence). */
  lastSnapshotAt: number | null;
  /** the Page's live provenance capture, stashed by a stateless message for the next materialization. */
  provenance: ProvenanceStash | null;
  /** block ids the block-patch path applied — materialization tags them `human_mobile`. */
  mobileBlocks: Set<string>;
}

export function createDocRuntime(init: {
  workspaceId: string;
  projectId: string;
  draftId: string;
  liveDocId: string;
  lastPointAt?: number | null;
  lastSnapshotAt?: number | null;
  snapshotSv?: Uint8Array | null;
  userId?: string;
}): DocRuntime {
  return {
    workspaceId: init.workspaceId,
    projectId: init.projectId,
    draftId: init.draftId,
    liveDocId: init.liveDocId,
    userId: init.userId ?? "",
    pendingDelta: [],
    snapshotSv: init.snapshotSv ?? null,
    lastPointAt: init.lastPointAt ?? null,
    lastSnapshotAt: init.lastSnapshotAt ?? null,
    provenance: null,
    mobileBlocks: new Set(),
  };
}
