import type { SqlExecutor } from "@rhema/mirror";

// REQ-VIS-10 fact collection (§8.4): the statement is generated from RUN ROWS ONLY — the runs table
// (workflows, model tiers, dates), steps (phase names), gates/decisions (approvals), and drafts
// (human-revision versions). No model prose, no heuristics, no "detection" — the statement lists what the
// record shows, so every sentence is inspectable back to a row.

/** One run's contribution to the statement. */
export interface RunFact {
  readonly id: string;
  /** the workflow key verbatim from the row (review / revise / fact_check / …). */
  readonly workflow: string;
  /** the model tier verbatim from the row (base / balanced / frontier). */
  readonly modelTier: string;
  readonly rigor: string;
  readonly state: string;
  readonly createdAt: Date;
}

/** One recorded decision at a named approval (§6.4). */
export interface ApprovalFact {
  readonly gateId: string;
  readonly runId: string;
  /** the decision action verbatim (approve / edit / stop / …). */
  readonly action: string;
  /** the decision's actor kind (user / agent / system). */
  readonly byKind: string;
  readonly at: Date;
}

/** Everything the general template needs, loaded from the project's rows. */
export interface StatementFacts {
  readonly projectId: string;
  /** projects.protocol_id — selects the template ('essay'/null → general; 'academic' lands at P1.21). */
  readonly protocolId: string | null;
  readonly venue: string | null;
  readonly runs: readonly RunFact[];
  /** distinct step phase names across the project's runs, in first-seen order. */
  readonly phases: readonly string[];
  /** every recorded gate decision, oldest first. */
  readonly approvals: readonly ApprovalFact[];
  /** the `n` of every human_revision draft head — versions the author revised directly (§5.4). */
  readonly humanRevisionNs: readonly number[];
}

interface RunRow {
  id: string;
  workflow: string;
  model_tier: string;
  rigor: string;
  state: string;
  created_at: string;
}
interface PhaseRow {
  phase: string;
}
interface ApprovalRow {
  gate_id: string;
  run_id: string;
  action: string;
  by_actor: { kind?: string } | string;
  at: string;
}
interface DraftRow {
  n: number;
}
interface ProjectRow {
  protocol_id: string | null;
  venue: string | null;
}

/**
 * Load the statement's facts for a project. Runs/steps/decisions/drafts are tenant-keyed or
 * project-scoped; the caller runs inside the workspace transaction (RLS is the backstop).
 */
export async function collectStatementFacts(
  exec: SqlExecutor,
  projectId: string,
): Promise<StatementFacts | null> {
  const project = (
    await exec.query(`select protocol_id, venue from projects where id = $1`, [projectId])
  ).rows[0] as ProjectRow | undefined;
  if (!project) return null;

  const runs = (
    await exec.query(
      `select id, workflow, model_tier, rigor, state, created_at
         from runs where project_id = $1 order by created_at, id`,
      [projectId],
    )
  ).rows as RunRow[];

  // Phase names in first-seen order across the project's runs (a stable, human-readable list).
  const phaseRows = (
    await exec.query(
      `select s.phase, min(s.ordinal) as first_ord, min(s.id) as first_id
         from steps s join runs r on r.id = s.run_id
        where r.project_id = $1
        group by s.phase order by min(r.created_at), first_ord, first_id`,
      [projectId],
    )
  ).rows as PhaseRow[];

  const approvals = (
    await exec.query(
      `select d.gate_id, g.run_id, d.action, d.by_actor, d.at
         from decisions d
         join gates g on g.id = d.gate_id
         join runs r on r.id = g.run_id
        where r.project_id = $1 order by d.at, d.gate_id`,
      [projectId],
    )
  ).rows as ApprovalRow[];

  const humanRevisions = (
    await exec.query(
      `select n from drafts where project_id = $1 and origin = 'human_revision' order by n`,
      [projectId],
    )
  ).rows as DraftRow[];

  return {
    projectId,
    protocolId: project.protocol_id,
    venue: project.venue,
    runs: runs.map((r) => ({
      id: r.id,
      workflow: r.workflow,
      modelTier: r.model_tier,
      rigor: r.rigor,
      state: r.state,
      createdAt: new Date(r.created_at),
    })),
    phases: phaseRows.map((r) => r.phase),
    approvals: approvals.map((a) => ({
      gateId: a.gate_id,
      runId: a.run_id,
      action: a.action,
      byKind:
        typeof a.by_actor === "string"
          ? ((JSON.parse(a.by_actor) as { kind?: string }).kind ?? "unknown")
          : (a.by_actor?.kind ?? "unknown"),
      at: new Date(a.at),
    })),
    humanRevisionNs: humanRevisions.map((d) => d.n),
  };
}
