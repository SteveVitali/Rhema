import type { Actor, FindingKind, ObligationState, ObligationSource, Severity } from "@rhema/contracts";
import { normalizeUrl } from "@rhema/mirror";
import type { DeferHorizon, DischargedBy, ObligationRelation, ObligationRow, SqlExecutor } from "./types.js";

// Shared row readers. Everything is scoped by project_id (the obligation tables are reached via the project,
// which is RLS-forced — the tables themselves are not RLS, like findings/dispositions). Row → camelCase here so
// the rest of the package never touches snake_case or re-parses jsonb.

interface RawObligation {
  id: string;
  project_id: string;
  source: string;
  finding_id: string | null;
  severity: string;
  kind: string | null;
  title: string;
  state: string;
  state_since: string | Date;
  opened_on_draft_id: string | null;
  rationale: string | null;
  defer_horizon: unknown;
  rounds_open: number;
  discharged_by: unknown;
  created_by: unknown;
  created_at: string | Date;
  closed_at: string | Date | null;
}

function asDate(v: string | Date): Date {
  return v instanceof Date ? v : new Date(v);
}
function asJson<T>(v: unknown): T | null {
  if (v === null || v === undefined) return null;
  return (typeof v === "string" ? JSON.parse(v) : v) as T;
}

function rowToObligation(r: RawObligation): ObligationRow {
  return {
    id: r.id,
    projectId: r.project_id,
    source: r.source as ObligationSource,
    findingId: r.finding_id,
    severity: r.severity as Severity,
    kind: (r.kind as FindingKind | null) ?? null,
    title: r.title,
    state: r.state as ObligationState,
    stateSince: asDate(r.state_since),
    openedOnDraftId: r.opened_on_draft_id,
    rationale: r.rationale,
    deferHorizon: asJson<DeferHorizon>(r.defer_horizon),
    roundsOpen: Number(r.rounds_open),
    dischargedBy: asJson<DischargedBy>(r.discharged_by),
    createdBy: asJson<Actor>(r.created_by) as Actor,
    createdAt: asDate(r.created_at),
    closedAt: r.closed_at ? asDate(r.closed_at) : null,
  };
}

const OBLIGATION_COLUMNS =
  "id, project_id, source, finding_id, severity, kind, title, state, state_since, opened_on_draft_id, rationale, defer_horizon, rounds_open, discharged_by, created_by, created_at, closed_at";

/** Load one obligation by id (null when absent). */
export async function loadObligation(exec: SqlExecutor, obligationId: string): Promise<ObligationRow | null> {
  const res = await exec.query(`select ${OBLIGATION_COLUMNS} from revision_obligations where id = $1`, [obligationId]);
  const row = res.rows[0] as RawObligation | undefined;
  return row ? rowToObligation(row) : null;
}

/** All obligations for a project (any state), oldest first — the read-API + counts base set. */
export async function loadProjectObligations(exec: SqlExecutor, projectId: string): Promise<ObligationRow[]> {
  const res = await exec.query(
    `select ${OBLIGATION_COLUMNS} from revision_obligations where project_id = $1 order by created_at, id`,
    [projectId],
  );
  return (res.rows as RawObligation[]).map(rowToObligation);
}

/** The obligation for a root finding, if one was spawned (the `one_obligation_per_root_finding` unique index). */
export async function loadObligationByRootFinding(exec: SqlExecutor, findingId: string): Promise<ObligationRow | null> {
  const res = await exec.query(`select ${OBLIGATION_COLUMNS} from revision_obligations where finding_id = $1`, [findingId]);
  const row = res.rows[0] as RawObligation | undefined;
  return row ? rowToObligation(row) : null;
}

/**
 * The obligation a finding belongs to — as the obligation's root finding OR via a lineage edge (a finding
 * carried into a later round shares the obligation it matched; PRB.06's response-ledger routing resolves a
 * disposition's finding through either link).
 */
export async function loadObligationByFinding(
  exec: SqlExecutor,
  projectId: string,
  findingId: string,
): Promise<ObligationRow | null> {
  const res = await exec.query(
    `select ${OBLIGATION_COLUMNS} from revision_obligations
      where project_id = $2 and (finding_id = $1
        or id in (select obligation_id from obligation_findings where finding_id = $1))
      order by created_at limit 1`,
    [findingId, projectId],
  );
  const row = res.rows[0] as RawObligation | undefined;
  return row ? rowToObligation(row) : null;
}

/** A lineage edge as stored (obligation_findings). */
export interface LineageEdge {
  readonly obligationId: string;
  readonly findingId: string;
  readonly correspondenceId: string;
  readonly relation: ObligationRelation;
}

/** All lineage edges for a project's obligations, plus the joined finding's anchor/kind/url for the matchers. */
export interface LineageFinding {
  readonly obligationId: string;
  readonly findingId: string;
  readonly relation: ObligationRelation;
  readonly kind: string | null;
  readonly anchor: { blockId?: string; quote?: string } | null;
  readonly normalizedUrl: string | null;
}

/**
 * The lineage of every obligation on a project, with each edge's finding resolved to its `kind`, `anchor`
 * (quote) and the first evidence url — the shape the three lineage matchers consume (REQ-OBJ-4). Claims joined
 * via `findings.evidence->claimId` give matcher 1 its `normalized_url`; a claim id stored on the finding's
 * evidence resolves to `claims.normalized_url`.
 */
export async function loadLineageFindings(exec: SqlExecutor, projectId: string): Promise<LineageFinding[]> {
  const res = await exec.query(
    `select of.obligation_id, of.finding_id, of.relation, f.kind, f.anchor,
            coalesce(c.normalized_url, f.evidence->'urls'->0->>'url') as normalized_url
       from obligation_findings of
       join revision_obligations o on o.id = of.obligation_id
       join findings f on f.id = of.finding_id
       left join claims c on c.id = (f.evidence->>'claimId')
      where o.project_id = $1`,
    [projectId],
  );
  return (res.rows as Array<{
    obligation_id: string;
    finding_id: string;
    relation: string;
    kind: string | null;
    anchor: unknown;
    normalized_url: string | null;
  }>).map((r) => ({
    obligationId: r.obligation_id,
    findingId: r.finding_id,
    relation: r.relation as ObligationRelation,
    kind: r.kind,
    anchor: asJson<{ blockId?: string; quote?: string }>(r.anchor),
    // normalize symmetrically with the candidate side (delivery.ts normalizes the finding's evidence url), so
    // matcher 1's exact-equality compare does not spuriously miss a claim whose stored url was un-normalized.
    normalizedUrl: r.normalized_url ? normalizeUrl(r.normalized_url) : null,
  }));
}

/** Insert a lineage edge (obligation_findings). Idempotent on the (obligation, finding) primary key. */
export async function insertLineageEdge(
  exec: SqlExecutor,
  edge: { obligationId: string; findingId: string; correspondenceId: string; relation: ObligationRelation },
): Promise<void> {
  await exec.query(
    `insert into obligation_findings(obligation_id, finding_id, correspondence_id, relation)
     values ($1,$2,$3,$4) on conflict (obligation_id, finding_id) do nothing`,
    [edge.obligationId, edge.findingId, edge.correspondenceId, edge.relation],
  );
}

export { rowToObligation };
