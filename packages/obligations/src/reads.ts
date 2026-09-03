import type { ObligationState, Severity } from "@rhema/contracts";
import type { ObligationRow, SqlExecutor } from "./types.js";
import { loadObligation, loadProjectObligations } from "./queries.js";

// Read APIs for the beta obligation surfaces (REQ-OBJ-6, DATA/API half — the UI is PRB.04/05/06, P1.08/P1.19).
// Everything is a pure projection of obligation rows; the surfaces (version-rail chip, per-finding state chip,
// run-sheet scope lines, export-dialog counts, inbox rows) compose these.

/** The not-fully-closed states (an obligation still "live" on the project). */
export const LIVE_STATES: ReadonlySet<ObligationState> = new Set(["open", "reopened", "addressed", "deferred"]);
const SEVERITY_RANK: Record<Severity, number> = { blocking: 3, major: 2, minor: 1, note: 0 };

/**
 * The display state for a finding/version chip (§5.7): `mooted` renders as discharged-pending until confirmed
 * at the next triage; a by-hand discharge renders "discharged (unverified)" (verifiedBy 'user').
 */
export function renderObligationState(ob: Pick<ObligationRow, "state" | "dischargedBy">): string {
  if (ob.state === "mooted") return "discharged_pending";
  if (ob.state === "discharged" && ob.dischargedBy?.verifiedBy === "user") return "discharged_unverified";
  return ob.state;
}

export interface ObligationSummary {
  readonly byState: Record<ObligationState, number>;
  readonly open: number; // open + reopened (actively demanding attention)
  readonly addressed: number;
  readonly blockingOpen: number; // blocking, open|reopened
  readonly blockingMajorOpen: number; // the version-rail chip counts these (§5.8)
  readonly blockingMajorAddressed: number;
}

const ZERO_BY_STATE: () => Record<ObligationState, number> = () => ({
  open: 0, addressed: 0, discharged: 0, rebutted: 0, deferred: 0, mooted: 0, reopened: 0,
});

/** Project-level obligation summary — feeds the version-rail chip (`⚑ 3 open · 2 addressed`, blocking/major
 * only) and the project-card blocking pill (§5.8; REQ-OBJ-6). */
export async function obligationSummary(exec: SqlExecutor, projectId: string): Promise<ObligationSummary> {
  const rows = await loadProjectObligations(exec, projectId);
  const byState = ZERO_BY_STATE();
  let open = 0, addressed = 0, blockingOpen = 0, blockingMajorOpen = 0, blockingMajorAddressed = 0;
  for (const o of rows) {
    byState[o.state]++;
    const bm = o.severity === "blocking" || o.severity === "major";
    if (o.state === "open" || o.state === "reopened") {
      open++;
      if (o.severity === "blocking") blockingOpen++;
      if (bm) blockingMajorOpen++;
    } else if (o.state === "addressed") {
      addressed++;
      if (bm) blockingMajorAddressed++;
    }
  }
  return { byState, open, addressed, blockingOpen, blockingMajorOpen, blockingMajorAddressed };
}

export interface FindingObligationState {
  readonly obligationId: string;
  readonly state: ObligationState;
  readonly rendered: string;
  readonly severity: Severity;
  readonly roundsOpen: number;
}

/** The obligation-state chip for one finding (§5.7) — via its lineage edge; null when the finding spawned none. */
export async function findingObligationState(exec: SqlExecutor, findingId: string): Promise<FindingObligationState | null> {
  const res = await exec.query(
    `select o.id from obligation_findings of join revision_obligations o on o.id = of.obligation_id
      where of.finding_id = $1 order by (of.relation = 'root') desc limit 1`,
    [findingId],
  );
  const row = res.rows[0] as { id: string } | undefined;
  if (!row) return null;
  const ob = await loadObligation(exec, row.id);
  if (!ob) return null;
  return { obligationId: ob.id, state: ob.state, rendered: renderObligationState(ob), severity: ob.severity, roundsOpen: ob.roundsOpen };
}

/** Batch: finding id → obligation-state chip for a whole dossier's findings (the Margin/triage read). */
export async function obligationStatesForCorrespondence(
  exec: SqlExecutor,
  correspondenceId: string,
): Promise<Map<string, FindingObligationState>> {
  const res = await exec.query(
    `select of.finding_id, o.id, o.state, o.severity, o.rounds_open, o.discharged_by
       from obligation_findings of join revision_obligations o on o.id = of.obligation_id
      where of.correspondence_id = $1`,
    [correspondenceId],
  );
  const out = new Map<string, FindingObligationState>();
  for (const r of res.rows as Array<{ finding_id: string; id: string; state: string; severity: string; rounds_open: number; discharged_by: unknown }>) {
    const dischargedBy = r.discharged_by ? ((typeof r.discharged_by === "string" ? JSON.parse(r.discharged_by) : r.discharged_by) as { verifiedBy?: string }) : null;
    out.set(r.finding_id, {
      obligationId: r.id,
      state: r.state as ObligationState,
      rendered: renderObligationState({ state: r.state as ObligationState, dischargedBy: dischargedBy as ObligationRow["dischargedBy"] }),
      severity: r.severity as Severity,
      roundsOpen: Number(r.rounds_open),
    });
  }
  return out;
}

/** The live (not-closed) obligations on a project, blocking/major first — the run-sheet + export base list. */
export async function liveObligations(exec: SqlExecutor, projectId: string): Promise<ObligationRow[]> {
  const rows = (await loadProjectObligations(exec, projectId)).filter((o) => LIVE_STATES.has(o.state));
  return rows.sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] || a.createdAt.getTime() - b.createdAt.getTime());
}

export interface RunSheetObligations {
  readonly open: readonly ObligationRow[];
  /** a Review sheet scope line — "N open obligations will be checked" (§5.6). */
  readonly reviewScopeLine: string;
  /** a Revise sheet line — "this run addresses M open obligations" (§5.6). */
  readonly reviseScopeLine: string;
}

/** The run-sheet scope lines (§5.6; REQ-OBJ-6). `open` = open + reopened obligations to be checked/addressed. */
export async function runSheetObligations(exec: SqlExecutor, projectId: string): Promise<RunSheetObligations> {
  const open = (await liveObligations(exec, projectId)).filter((o) => o.state === "open" || o.state === "reopened");
  return {
    open,
    reviewScopeLine: `${open.length} open obligation${open.length === 1 ? "" : "s"} will be checked`,
    reviseScopeLine: `this run addresses ${open.length} open obligation${open.length === 1 ? "" : "s"}`,
  };
}

export interface ExportDialogObligations {
  readonly blockingOpen: number;
  readonly open: number;
  /** the export dialog line (§11.7): "2 blocking obligations open" — export never blocks on it. */
  readonly line: string;
}

/** Export-dialog counts (§11.7; REQ-VIS-10 data). Export never blocks on obligations — this is informational. */
export async function exportDialogObligations(exec: SqlExecutor, projectId: string): Promise<ExportDialogObligations> {
  const s = await obligationSummary(exec, projectId);
  return { blockingOpen: s.blockingOpen, open: s.open, line: `${s.blockingOpen} blocking obligation${s.blockingOpen === 1 ? "" : "s"} open` };
}

/** Open Decisions-inbox requests for a project (escalations + stall + horizon-expired deferrals; §5.11). */
export async function openDecisionRequests(
  exec: SqlExecutor,
  projectId: string,
): Promise<Array<{ id: string; text: string; options: string[]; sourceRunId: string | null }>> {
  const res = await exec.query(
    `select id, text, options, source_run_id from decision_requests where project_id = $1 and state = 'open' order by id`,
    [projectId],
  );
  return (res.rows as Array<{ id: string; text: string; options: string[]; source_run_id: string | null }>).map((r) => ({
    id: r.id,
    text: r.text,
    options: r.options,
    sourceRunId: r.source_run_id,
  }));
}
