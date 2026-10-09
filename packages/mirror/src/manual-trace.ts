// The manual-revision move trace (REQ-BETA-7's second half; the PRB.06 seam PRB.07's editor save calls).
// A human edit has no response ledger, so the server diff vN→v(N+1) emits one `revision.move_traced` row
// carrying the whole change as Unlinked (moveId absent) — the event stream accounts for every changed hunk
// whether or not a move explains it. The same diff feeds `changed_since`'s `humanAdded`/`unverifiable`
// claim placeholders at the next Review (REQ-DATA-25 — the placeholders are built by
// findings-core's `buildChangedSince` at run creation, not persisted as claim rows: claims are
// correspondence-scoped, and a human revision has none until the review that re-checks it).

import { diffMarkdown, traceRevisionMoves, type MoveTrace } from "@rhema/findings-core";
import { HUMAN_EDITABLE_DRAFT_ORIGINS, parseRunEvent } from "@rhema/contracts";
import type { ContentStore } from "./content-store.js";
import type { DeliveryEventAppender } from "./delivery.js";
import type { SqlExecutor } from "./sql.js";

export interface ManualTraceDeps {
  readonly store: ContentStore;
  readonly eventWriter: DeliveryEventAppender;
}

export interface ManualTraceArgs {
  /** the human-editable working draft (human_revision/human_upload/duplicate) whose version landed. */
  readonly draftId: string;
  /** the artifact_version id the draft just promoted to (the edited markdown). */
  readonly newVersionId: string;
  /** the run to attribute the event to when the save happened inside one (usually absent — a human save). */
  readonly runId?: string;
  readonly at: Date;
}

/**
 * Diff a human-edited draft's new promoted version against its base's frozen head and emit
 * `revision.move_traced` (unlinked — a human edit carries no ledger move). Any human-editable
 * working origin traces the same way (`duplicate` heads carry a base too — a copy's lineage links
 * survive the copy). Returns the traces emitted; empty when either side's bytes are missing (the
 * seam is honest rather than noisy).
 */
export async function traceManualRevision(
  exec: SqlExecutor,
  deps: ManualTraceDeps,
  args: ManualTraceArgs,
): Promise<readonly MoveTrace[]> {
  const rows = await exec.query(
    `select base.promoted_version_id as base_version,
            (select content_sha256 from artifact_versions where id = base.promoted_version_id) as base_sha,
            (select content_sha256 from artifact_versions where id = $2) as new_sha
       from drafts cur join drafts base on base.id = cur.base_draft_id
      where cur.id = $1 and cur.origin = any($3::text[])`,
    [args.draftId, args.newVersionId, [...HUMAN_EDITABLE_DRAFT_ORIGINS]],
  );
  const row = rows.rows[0] as { base_sha: string | null; new_sha: string | null } | undefined;
  if (!row?.base_sha || !row.new_sha) return [];
  const [beforeBytes, afterBytes] = await Promise.all([deps.store.get(row.base_sha), deps.store.get(row.new_sha)]);
  if (!beforeBytes || !afterBytes) return [];
  const diff = diffMarkdown(
    Buffer.from(beforeBytes).toString("utf8"),
    Buffer.from(afterBytes).toString("utf8"),
  );
  const traces = traceRevisionMoves(diff, { entries: [], moves: [] });
  for (const t of traces) {
    const ev = parseRunEvent("revision.move_traced", {
      draftId: args.draftId,
      hunkCount: t.hunkCount,
      charsChanged: t.charsChanged,
    });
    await deps.eventWriter.append(exec, {
      runId: args.runId ?? args.draftId,
      type: ev.type,
      payload: ev.payload,
      at: args.at,
    });
  }
  return traces;
}
