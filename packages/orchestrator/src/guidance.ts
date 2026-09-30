// Guidance capture + delivery (§6.5; REQ-GATE-9/10/11; REQ-RUN-7/18). Guidance is the only human input the
// skills accept after launch. Standing guidance is project-scope + retirable (never deleted); run-scope
// guidance (a queued note, a gate note/edit) is delivered at the NEXT phase boundary and marked consumed.
// Guidance is rendered into the skill's `guidance` input as a dated, sourced list; the UI links each record to
// the phase that consumed it (`consumed_by`). It is NEVER delivered into an independence context (second read,
// fidelity audit, gap check, hold-out calibration — REQ-RUN-18) and never edits `agents/**` (REQ-GATE-11).

import type { GuidanceSource } from "@rhema/contracts";
import type { OrchestratorDeps } from "./internal-api.js";
import type { SqlClient } from "./tx.js";

/**
 * The independence contexts guidance is never delivered into (REQ-RUN-18; §12.6). These are the orchestrator's
 * input-scoped subagent roles (engine `ScopedRole`) plus the "second read" phase; a scoped `query()` for any of
 * them gets no `guidance` input, enforced here rather than by convention.
 */
export const INDEPENDENCE_CONTEXTS: readonly string[] = [
  "second-reader",
  "fidelity-auditor",
  "gap-analyst",
  "holdout-calibrator",
  "second_read",
  "fidelity_audit",
  "gap_check",
];

export function isIndependenceContext(context: string | undefined): boolean {
  return context != null && INDEPENDENCE_CONTEXTS.includes(context);
}

export interface CaptureGuidanceArgs {
  readonly workspaceId: string;
  readonly projectId: string;
  readonly userId: string;
  readonly source: GuidanceSource;
  readonly text: string;
  /** 'project' = standing guidance (retirable, never deleted); 'run' = bound to this run, one-shot delivery. */
  readonly scope: "run" | "project";
  /** run-scope guidance carries the run id; standing guidance has none. */
  readonly runId?: string;
  /** narrows which workflows the guidance applies to; omitted = all workflows. */
  readonly workflows?: readonly string[];
  readonly anchors?: unknown;
}

type CaptureDeps = Pick<OrchestratorDeps, "ids" | "clock" | "eventWriter">;

/**
 * Capture a `Guidance` row inside an existing transaction (so a gate resolution captures guidance atomically
 * with the decision). Emits `guidance.captured`. `standing = scope==='project'`. Returns the new id.
 */
export async function captureGuidanceTx(tx: SqlClient, deps: CaptureDeps, args: CaptureGuidanceArgs): Promise<string> {
  const guidanceId = deps.ids("gdn");
  const now = deps.clock.now();
  await tx.query(
    `insert into guidance(id, project_id, run_id, source, anchors, body, standing, workflows, consumed_by,
       active, created_by, created_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,'[]'::jsonb,true,$9,$10)`,
    [
      guidanceId,
      args.projectId,
      args.scope === "run" ? (args.runId ?? null) : null,
      args.source,
      args.anchors != null ? JSON.stringify(args.anchors) : null,
      args.text,
      args.scope === "project",
      args.workflows ? (args.workflows as string[]) : null,
      JSON.stringify(args.userId),
      now,
    ],
  );
  // The `guidance.captured` event lives on the RUN stream (run_event_seq.run_id → runs.id): it exists to
  // fan out to a live run's SSE, so it can only be emitted when a real run id is present. A project-scope
  // (standing) guidance has no run — the Guidance row itself is the durable record, and keying the stream
  // by projectId violates the FK on real Postgres (PRB.16 LIVE FINDING: the note path 500'd on prod;
  // dev tests never saw it because InMemoryEventWriter bypasses run_event_seq).
  if (args.runId != null) {
    await deps.eventWriter.append(tx, { runId: args.runId, type: "guidance.captured", payload: { guidanceId }, at: now });
  }
  return guidanceId;
}

/**
 * Capture a `Guidance` row (§6.5) in its own tenant transaction. Emits `guidance.captured`.
 */
export async function captureGuidance(deps: OrchestratorDeps, args: CaptureGuidanceArgs): Promise<{ guidanceId: string }> {
  const guidanceId = await deps.txRunner.run(args.workspaceId, (tx) => captureGuidanceTx(tx, deps, args));
  return { guidanceId };
}

interface GuidanceRow {
  id: string;
  source: string;
  body: string;
  standing: boolean;
  workflows: string[] | null;
  consumed_by: { runId: string; phase: string }[] | string;
  created_at: Date | string;
}

export interface ConsumeGuidanceArgs {
  readonly runId: string;
  readonly workspaceId: string;
  readonly projectId: string;
  readonly workflow: string;
  readonly phase: string;
  /** the seat / subagent context the guidance would be delivered into; an independence context gets nothing. */
  readonly context?: string;
}

export interface DeliveredGuidance {
  readonly guidanceId: string;
  readonly source: string;
  readonly text: string;
}

export interface ConsumeGuidanceResult {
  /** the dated, sourced list rendered into the skill's `guidance` input ("" when nothing delivered). */
  readonly rendered: string;
  readonly delivered: readonly DeliveredGuidance[];
}

function parseConsumedBy(v: GuidanceRow["consumed_by"]): { runId: string; phase: string }[] {
  if (typeof v === "string") return JSON.parse(v) as { runId: string; phase: string }[];
  return v ?? [];
}

/** Deliver a guidance record only if it hasn't been delivered yet for this phase (standing) / run (run-scope). */
function shouldDeliver(row: GuidanceRow, runId: string, phase: string): boolean {
  const consumed = parseConsumedBy(row.consumed_by);
  if (row.standing) return !consumed.some((c) => c.runId === runId && c.phase === phase); // every applicable phase, once
  return !consumed.some((c) => c.runId === runId); // run-scope (queued note): delivered once, at the next boundary
}

/**
 * Gather + deliver the active guidance for a phase (§6.5). Standing (project-scope) guidance applicable to the
 * workflow is delivered every phase; run-scope guidance (a queued note) is delivered once at the next boundary.
 * Populates `consumed_by`, emits `guidance.delivered` per record, and renders a dated, sourced list. Delivers
 * NOTHING into an independence context (REQ-RUN-18).
 */
export async function consumeGuidance(deps: OrchestratorDeps, args: ConsumeGuidanceArgs): Promise<ConsumeGuidanceResult> {
  if (isIndependenceContext(args.context)) return { rendered: "", delivered: [] };

  return deps.txRunner.run(args.workspaceId, async (tx) => {
    const rows = (
      await tx.query(
        `select id, source, body, standing, workflows, consumed_by, created_at
           from guidance
          where active = true and project_id = $1 and (standing = true or run_id = $2)
            and (workflows is null or $3 = any(workflows))
          order by created_at, id`,
        [args.projectId, args.runId, args.workflow],
      )
    ).rows as GuidanceRow[];

    const delivered: DeliveredGuidance[] = [];
    const now = deps.clock.now();
    for (const row of rows) {
      if (!shouldDeliver(row, args.runId, args.phase)) continue;
      const consumed = parseConsumedBy(row.consumed_by);
      consumed.push({ runId: args.runId, phase: args.phase });
      await tx.query("update guidance set consumed_by = $2 where id = $1", [row.id, JSON.stringify(consumed)]);
      await deps.eventWriter.append(tx, {
        runId: args.runId,
        type: "guidance.delivered",
        payload: { guidanceId: row.id, phase: args.phase },
        at: now,
      });
      delivered.push({ guidanceId: row.id, source: row.source, text: row.body });
    }
    return { rendered: renderGuidance(delivered, now), delivered };
  });
}

/** Retire a standing guidance rule (REQ-GATE-10): `active=false`, never deleted. History stays. */
export async function retireGuidance(
  deps: Pick<OrchestratorDeps, "txRunner">,
  args: { workspaceId: string; guidanceId: string },
): Promise<{ retired: boolean }> {
  return deps.txRunner.run(args.workspaceId, async (tx: SqlClient) => {
    const res = await tx.query(
      "update guidance set active = false where id = $1 and standing = true and active = true returning id",
      [args.guidanceId],
    );
    return { retired: (res.rows as unknown[]).length === 1 };
  });
}

/** Render the delivered guidance as a dated, sourced list — what the skill's `guidance` input receives (§6.5). */
export function renderGuidance(delivered: readonly DeliveredGuidance[], now: Date): string {
  if (delivered.length === 0) return "";
  const date = now.toISOString().slice(0, 10);
  const lines = delivered.map((g) => `- [${date} · ${g.source}] ${g.text}`);
  return `## Guidance (${delivered.length})\n${lines.join("\n")}\n`;
}
