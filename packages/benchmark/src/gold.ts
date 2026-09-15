import type { BenchmarkDeps, Finding, GoldFinding, SqlExecutor } from "./types.js";

// Gold-set intake + adjudication (REQ-EVAL-4). Two independent professional editors annotate each draft in the
// §5.7 Finding schema plus a `material` flag; a senior editor adjudicates the annotator rows into the gold set.
// This module records those rows and loads the adjudicated gold. IAA (below-floor → flagged) is `iaa.ts`.

export type AnnotatorRole = "annotator" | "adjudicator";

export interface RecordAnnotationInput {
  readonly draftId: string;
  readonly editorId: string;
  readonly finding: Finding;
  readonly material: boolean;
  readonly id?: string;
}

/** Record one annotator's finding on a draft (role = 'annotator'; not yet gold). */
export async function recordAnnotation(
  exec: SqlExecutor,
  deps: BenchmarkDeps,
  input: RecordAnnotationInput,
): Promise<string> {
  const id = input.id ?? deps.ids("bmann");
  await exec.query(
    `insert into benchmark_gold_annotations
       (id, draft_id, editor_id, role, finding, material, is_gold, adjudicated_from, annotated_at)
     values ($1,$2,$3,'annotator',$4,$5,false,'{}',$6)`,
    [id, input.draftId, input.editorId, JSON.stringify(input.finding), input.material, deps.clock.now()],
  );
  return id;
}

export interface AdjudicateInput {
  readonly draftId: string;
  readonly adjudicatorId: string;
  readonly finding: Finding;
  readonly material: boolean;
  /** the annotator finding ids this gold row reconciles (provenance for the adjudication). */
  readonly adjudicatedFrom: readonly string[];
  readonly id?: string;
}

/** Senior adjudication: write an adjudicated GOLD row (role = 'adjudicator', is_gold = true). */
export async function adjudicateGold(
  exec: SqlExecutor,
  deps: BenchmarkDeps,
  input: AdjudicateInput,
): Promise<string> {
  const id = input.id ?? deps.ids("bmgold");
  await exec.query(
    `insert into benchmark_gold_annotations
       (id, draft_id, editor_id, role, finding, material, is_gold, adjudicated_from, annotated_at)
     values ($1,$2,$3,'adjudicator',$4,$5,true,$6,$7)`,
    [
      id,
      input.draftId,
      input.adjudicatorId,
      JSON.stringify(input.finding),
      input.material,
      [...input.adjudicatedFrom],
      deps.clock.now(),
    ],
  );
  return id;
}

/** Load the adjudicated gold set for a draft (the reference the recall/calibration scorers score against). */
export async function loadGold(exec: SqlExecutor, draftId: string): Promise<GoldFinding[]> {
  const rows = (
    await exec.query(
      `select finding, material from benchmark_gold_annotations
        where draft_id = $1 and role = 'adjudicator' and is_gold = true
        order by id`,
      [draftId],
    )
  ).rows as { finding: Finding; material: boolean }[];
  return rows.map((r) => ({ finding: r.finding, material: r.material }));
}

/** Load one annotator's findings on a draft (for the IAA alignment). */
export async function loadAnnotator(
  exec: SqlExecutor,
  draftId: string,
  editorId: string,
): Promise<GoldFinding[]> {
  const rows = (
    await exec.query(
      `select finding, material from benchmark_gold_annotations
        where draft_id = $1 and role = 'annotator' and editor_id = $2
        order by id`,
      [draftId, editorId],
    )
  ).rows as { finding: Finding; material: boolean }[];
  return rows.map((r) => ({ finding: r.finding, material: r.material }));
}

/** The distinct annotator editor ids on a draft (expected to be exactly two — REQ-EVAL-4). */
export async function annotatorsFor(exec: SqlExecutor, draftId: string): Promise<string[]> {
  return (
    (
      await exec.query(
        `select distinct editor_id from benchmark_gold_annotations
          where draft_id = $1 and role = 'annotator' order by editor_id`,
        [draftId],
      )
    ).rows as { editor_id: string }[]
  ).map((r) => r.editor_id);
}
