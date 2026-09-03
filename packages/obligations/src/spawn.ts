import type { Actor, FindingKind, Severity } from "@rhema/contracts";
import type { ObligationDeps, SqlExecutor } from "./types.js";
import { insertLineageEdge, loadObligation, loadObligationByRootFinding } from "./queries.js";
import { writeTransition } from "./state-machine.js";

// Spawn (REQ-OBJ-2). Blocking/major findings spawn one obligation at delivery (actor `system`), unique per root
// finding (the DB `one_obligation_per_root_finding` index). Minor findings spawn only when the author accepts
// or adapts them (routing.ts calls `spawnObligationFromFinding` then transitions to addressed); `note` never.
// User rows come from "Add to obligations" / the palette, and a reconciliation-rejected second-read finding
// spawns nothing unless promoted (REQ-IDE-26). The debt is created OPEN — the disposition then routes it.

const SEVERITY_RANK: Record<Severity, number> = { blocking: 3, major: 2, minor: 1, note: 0 };

/** The higher-priority of two severities (an obligation's severity is the max over its lineage set — §11.3). */
export function maxSeverity(a: Severity, b: Severity): Severity {
  return SEVERITY_RANK[a] >= SEVERITY_RANK[b] ? a : b;
}

/** True for the severities that spawn an obligation at delivery without any disposition (REQ-OBJ-2). */
export function spawnsAtDelivery(severity: Severity): boolean {
  return severity === "blocking" || severity === "major";
}

export interface SpawnFromFindingArgs {
  readonly projectId: string;
  readonly findingId: string;
  readonly severity: Severity;
  readonly kind: FindingKind | string;
  readonly title: string;
  readonly correspondenceId: string;
  readonly draftId: string;
  readonly runId?: string | null;
  readonly at?: Date;
  /** the spawning actor — `system` at delivery (REQ-OBJ-2); a user for an accept/adapt-driven minor spawn. */
  readonly byActor?: Actor;
}

/**
 * Spawn (or return the existing) obligation for a finding. Inserts the row OPEN (rounds_open = 1: the spawning
 * review is its first covering round), appends the `spawn` transition (null → open) and the `root` lineage
 * edge. Idempotent: a second call for the same root finding returns the existing obligation (retry-safe under
 * the unique index).
 */
export async function spawnObligationFromFinding(
  exec: SqlExecutor,
  deps: ObligationDeps,
  args: SpawnFromFindingArgs,
): Promise<string> {
  const existing = await loadObligationByRootFinding(exec, args.findingId);
  if (existing) return existing.id;

  const id = deps.ids("obl");
  const at = args.at ?? deps.clock.now();
  const actor: Actor = args.byActor ?? { kind: "system" };
  await exec.query(
    `insert into revision_obligations(id, project_id, source, finding_id, severity, kind, title, state,
       state_since, opened_on_draft_id, rounds_open, created_by, created_at)
     values ($1,$2,'finding',$3,$4,$5,$6,'open',$7,$8,1,$9,$7)`,
    [id, args.projectId, args.findingId, args.severity, args.kind, args.title, at, args.draftId, JSON.stringify(actor)],
  );
  await writeTransition(exec, deps, {
    obligationId: id,
    from: null,
    to: "open",
    cause: "spawn",
    byActor: actor,
    findingId: args.findingId,
    runId: args.runId ?? null,
    at,
  });
  await insertLineageEdge(exec, {
    obligationId: id,
    findingId: args.findingId,
    correspondenceId: args.correspondenceId,
    relation: "root",
  });
  return id;
}

export interface AddUserObligationArgs {
  readonly projectId: string;
  readonly draftId: string;
  readonly title: string;
  readonly severity: Severity;
  readonly kind?: FindingKind | string | null;
  readonly byActor: Actor;
  /** a promoted reconciliation-rejected finding links its finding id + a `root` lineage edge (REQ-IDE-26). */
  readonly findingId?: string | null;
  readonly correspondenceId?: string | null;
  readonly runId?: string | null;
  readonly at?: Date;
}

/**
 * A user-created obligation: "Add to obligations" on any finding, the palette's free-form obligation, or a
 * promoted reconciliation-rejected finding (REQ-IDE-26 — which otherwise spawns nothing). `source: 'user'`.
 */
export async function addToObligations(
  exec: SqlExecutor,
  deps: ObligationDeps,
  args: AddUserObligationArgs,
): Promise<string> {
  // a promotion of a real finding is still unique per root finding — return the existing obligation if any.
  if (args.findingId) {
    const existing = await loadObligationByRootFinding(exec, args.findingId);
    if (existing) return existing.id;
  }
  const id = deps.ids("obl");
  const at = args.at ?? deps.clock.now();
  await exec.query(
    `insert into revision_obligations(id, project_id, source, finding_id, severity, kind, title, state,
       state_since, opened_on_draft_id, rounds_open, created_by, created_at)
     values ($1,$2,'user',$3,$4,$5,$6,'open',$7,$8,1,$9,$7)`,
    [id, args.projectId, args.findingId ?? null, args.severity, args.kind ?? null, args.title, at, args.draftId, JSON.stringify(args.byActor)],
  );
  await writeTransition(exec, deps, {
    obligationId: id,
    from: null,
    to: "open",
    cause: "spawn",
    byActor: args.byActor,
    ...(args.findingId ? { findingId: args.findingId } : {}),
    runId: args.runId ?? null,
    at,
  });
  if (args.findingId && args.correspondenceId) {
    await insertLineageEdge(exec, {
      obligationId: id,
      findingId: args.findingId,
      correspondenceId: args.correspondenceId,
      relation: "root",
    });
  }
  return id;
}

/** Bump an obligation's cached severity to the max over its lineage (a direct column update — never `state`). */
export async function bumpSeverity(exec: SqlExecutor, obligationId: string, severity: Severity): Promise<void> {
  const current = await loadObligation(exec, obligationId);
  if (!current) return;
  const next = maxSeverity(current.severity, severity);
  if (next !== current.severity) {
    await exec.query(`update revision_obligations set severity = $1 where id = $2`, [next, obligationId]);
  }
}

/** Increment `rounds_open` (a direct column update; not `state`, so the forbid-direct-state trigger is silent). */
export async function incrementRoundsOpen(exec: SqlExecutor, obligationId: string): Promise<void> {
  await exec.query(`update revision_obligations set rounds_open = rounds_open + 1 where id = $1`, [obligationId]);
}
