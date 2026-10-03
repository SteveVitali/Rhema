// Freeze semantics (REQ-DATA-21/24; REQ-VIS-4). A draft freezes on the FIRST of: a run whose lock set contains
// `draft:read:<id>` starts, a correspondence item referencing the draft is delivered, the user clicks Promote,
// or an export is requested. Freeze is ONE-WAY. Opening a frozen head for editing creates `v(N+1)` with
// `origin='human_revision'` (API-level here; the editor UI lands later). This module owns the freeze/revision
// writes; the delivery transaction calls `freezeDraft` (the dossier-reference trigger) inside its atomic tx.

import type { SqlExecutor } from "./sql.js";

export type FreezeCause = "run_read" | "dossier_ref" | "promote" | "export";

export interface FreezeArgs {
  readonly draftId: string;
  /** the version that becomes the frozen head (the DB check requires a promoted version on a frozen draft). */
  readonly promotedVersionId: string;
  readonly cause: FreezeCause;
  readonly frozenBy?: unknown;
  readonly at: Date;
}

/** Whether a draft is currently a working head. */
export async function isWorking(exec: SqlExecutor, draftId: string): Promise<boolean> {
  const res = await exec.query("select state from drafts where id = $1", [draftId]);
  return (res.rows[0] as { state: string } | undefined)?.state === "working";
}

/**
 * Freeze a draft (one-way). Guarded on `state='working'` so a second freeze is a no-op (freeze is idempotent
 * and monotone). Returns true when this call performed the freeze, false when it was already frozen.
 */
export async function freezeDraft(exec: SqlExecutor, args: FreezeArgs): Promise<boolean> {
  const res = await exec.query(
    `update drafts set state = 'frozen', frozen_at = $2, frozen_by = $3, promoted_version_id = $4
       where id = $1 and state = 'working' returning id`,
    [args.draftId, args.at, JSON.stringify(args.frozenBy ?? { cause: args.cause }), args.promotedVersionId],
  );
  return (res.rows as unknown[]).length === 1;
}

export interface HumanRevisionArgs {
  readonly projectId: string;
  readonly frozenDraftId: string;
  readonly newDraftId: string;
  readonly at: Date;
}

/**
 * Open a frozen head for editing: create `v(N+1)` with `origin='human_revision'` (REQ-DATA-24). The base must
 * already be frozen (the `one_working_head_per_project` partial unique index forbids two working heads). Returns
 * the new draft's version number.
 */
export async function openHumanRevision(exec: SqlExecutor, args: HumanRevisionArgs): Promise<number> {
  const baseRes = await exec.query("select n, state from drafts where id = $1", [args.frozenDraftId]);
  const base = baseRes.rows[0] as { n: number; state: string } | undefined;
  if (!base) throw new Error(`draft ${args.frozenDraftId} not found`);
  if (base.state !== "frozen") throw new Error(`draft ${args.frozenDraftId} must be frozen before a human revision`);
  // v(N+1) = the next version NUMBER, not base.n+1 — a stale mid-lineage base (an earlier frozen vK
  // typed on while later frozen drafts stand and no working head does) would otherwise collide on
  // (project_id, n). The child still records THIS draft as its base — the rail's lineage stays honest.
  const n = (
    (await exec.query("select coalesce(max(n), 0) + 1 as n from drafts where project_id = $1", [
      args.projectId,
    ])).rows[0] as { n: number }
  ).n;
  await exec.query(
    `insert into drafts(id, project_id, n, origin, state, base_draft_id, created_at)
     values ($1,$2,$3,'human_revision','working',$4,$5)`,
    [args.newDraftId, args.projectId, n, args.frozenDraftId, args.at],
  );
  return n;
}
