// Revise delivery-base resolution (PRB.19; F26a). A run's delivery freezes ONE draft (the dossier-reference
// trigger, REQ-DATA-21) and — for a `response` — builds the v(N+1) row + the move trace on it. A Review's base
// is its explicit `inputs.draftId`; a Revise launch instead carries `priorReviewId` + `nextDraftId` (and a
// manual-revision run carries `manualRevision.baseDraftId`) — never `draftId` — so the base must be RESOLVED
// from the frozen inputs + the project's draft rows, server-side, never pod-trusted.
//
// Resolution order (first hit wins):
//   1. `inputs.manualRevision.baseDraftId` — the "Revise using your edits" divergent head (REQ-DATA-26): the
//      run revises the user's saved edits, so delivery freezes THAT head and builds v(N+1) on it.
//   2. `inputs.draftId` — an explicit draft the run was created against (the Review shape; preserved verbatim).
//   3. the project's WORKING head (`one_working_head_per_project` makes it unique) — a sheet Revise launched
//      while a human revision is open must build on (and freeze) that head, else the new v(N+1) row would
//      collide on `drafts(project_id, n)` / the working-head index.
//   4. the reviewed draft — `priorReviewId → correspondence_items.draft_id` (the canonical sheet Revise: the
//      response answers the review OF that draft, so it is the freeze + diff base).
//   5. the newest draft by `n` — the last-resort base so a revise-shaped run still delivers.
//
// `promotedVersionId` is the EFFECTIVE promoted head — the draft's own, else one step up the base chain (a
// never-saved human-revision head promotes nothing of its own; its text IS the base's). A run whose resolved
// base has no promotable version delivers nothing (the `draftPromotedVersionId` gate is unchanged).

import type { SqlClient } from "./tx.js";

export interface DeliveryBaseDraft {
  readonly id: string;
  readonly n: number;
  /** the effective promoted head version (own promoted, else the base chain's one step up). */
  readonly promotedVersionId: string | null;
}

export interface DeliveryBaseResolution {
  /** the draft the delivery freezes + diffs against; null when the project has no draft at all. */
  readonly base: DeliveryBaseDraft | null;
  /** `n` of the draft the `priorReviewId` review was delivered on — the `vN` in `correspondence/vN-response.md`
   *  / `vN-response-ledger.md` naming (independent of the base: a manual-revision run's base is the divergent
   *  head while its correspondence still names the REVIEWED draft's ordinal). */
  readonly reviewedDraftN: number | null;
}

interface DraftRow {
  id: string;
  n: number;
  promoted_version_id: string | null;
  base_draft_id: string | null;
}

async function draftRow(exec: SqlClient, projectId: string, id: string): Promise<DraftRow | undefined> {
  return (
    await exec.query("select id, n, promoted_version_id, base_draft_id from drafts where id = $1 and project_id = $2", [
      id,
      projectId,
    ])
  ).rows[0] as DraftRow | undefined;
}

async function effective(row: DraftRow, exec: SqlClient, projectId: string): Promise<DeliveryBaseDraft> {
  let promoted = row.promoted_version_id;
  if (!promoted && row.base_draft_id) {
    promoted = (await draftRow(exec, projectId, row.base_draft_id))?.promoted_version_id ?? null;
  }
  return { id: row.id, n: row.n, promotedVersionId: promoted };
}

/** Resolve the run's delivery base + the reviewed-draft ordinal (see header). */
export async function resolveDeliveryBase(
  exec: SqlClient,
  args: { projectId: string; workflow: string; inputs: Record<string, unknown> },
): Promise<DeliveryBaseResolution> {
  const { projectId, inputs } = args;

  // the reviewed draft (independent of which base wins — the correspondence `vN` naming keys off it).
  const priorReviewId = typeof inputs.priorReviewId === "string" ? inputs.priorReviewId : null;
  const reviewed = priorReviewId
    ? ((
        await exec.query(
          `select d.id, d.n, d.promoted_version_id, d.base_draft_id
             from correspondence_items ci join drafts d on d.id = ci.draft_id
            where ci.id = $1 and ci.project_id = $2`,
          [priorReviewId, projectId],
        )
      ).rows[0] as DraftRow | undefined)
    : undefined;
  const reviewedDraftN = reviewed?.n ?? null;

  const explicitDraftId = typeof inputs.draftId === "string" ? inputs.draftId : null;
  const manualBaseId =
    typeof (inputs.manualRevision as { baseDraftId?: unknown } | undefined)?.baseDraftId === "string"
      ? ((inputs.manualRevision as { baseDraftId: string }).baseDraftId as string)
      : null;

  if (args.workflow !== "revise") {
    // a non-revise run (Review/fact_check) delivers only on its explicit draft — unchanged behavior.
    const row = explicitDraftId ? await draftRow(exec, projectId, explicitDraftId) : undefined;
    return { base: row ? await effective(row, exec, projectId) : null, reviewedDraftN };
  }

  for (const id of [manualBaseId, explicitDraftId]) {
    if (!id) continue;
    const row = await draftRow(exec, projectId, id);
    if (row) return { base: await effective(row, exec, projectId), reviewedDraftN };
  }

  const workingHead = (
    await exec.query(
      `select id, n, promoted_version_id, base_draft_id from drafts
        where project_id = $1 and state = 'working' order by n desc limit 1`,
      [projectId],
    )
  ).rows[0] as DraftRow | undefined;
  if (workingHead) return { base: await effective(workingHead, exec, projectId), reviewedDraftN };

  if (reviewed) return { base: await effective(reviewed, exec, projectId), reviewedDraftN };

  const newest = (
    await exec.query(
      `select id, n, promoted_version_id, base_draft_id from drafts
        where project_id = $1 order by n desc limit 1`,
      [projectId],
    )
  ).rows[0] as DraftRow | undefined;
  return { base: newest ? await effective(newest, exec, projectId) : null, reviewedDraftN };
}
