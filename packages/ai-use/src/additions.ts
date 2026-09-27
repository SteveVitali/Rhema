import type { Actor } from "@rhema/contracts";
import type { SqlExecutor } from "@rhema/mirror";

// The append-only half of the AI-use statement (§8.4 REQ-VIS-10): the author's own sentences, persisted in
// `ai_use_additions` (0023). There is deliberately no update or delete here — the table grants select+insert
// only, and no function mutates a row. An addition survives every regeneration because the generated half is
// never stored: it is recomputed from run rows and the additions are re-read and appended.

/** One user-appended sentence on the project's statement. */
export interface AiUseAddition {
  readonly id: string;
  readonly projectId: string;
  readonly sentence: string;
  readonly byActor: Actor;
  readonly createdAt: Date;
}

interface AdditionRow {
  id: string;
  sentence: string;
  by_actor: Actor | string;
  created_at: string;
}

/** The project's additions, oldest first (append order — the statement renders them in that order). */
export async function listAdditions(exec: SqlExecutor, projectId: string): Promise<AiUseAddition[]> {
  const rows = (
    await exec.query(
      `select id, sentence, by_actor, created_at from ai_use_additions
        where project_id = $1 order by created_at, id`,
      [projectId],
    )
  ).rows as AdditionRow[];
  return rows.map((r) => ({
    id: r.id,
    projectId,
    sentence: r.sentence,
    byActor: typeof r.by_actor === "string" ? (JSON.parse(r.by_actor) as Actor) : r.by_actor,
    createdAt: new Date(r.created_at),
  }));
}

export class AdditionError extends Error {
  constructor(readonly reason: "empty_sentence", message: string) {
    super(message);
    this.name = "AdditionError";
  }
}

/**
 * Append one sentence to the project's statement. The only write the table accepts — an addition is
 * permanent (REQ-VIS-10: the author may append, never remove).
 */
export async function appendAddition(
  exec: SqlExecutor,
  deps: { ids: (prefix: string) => string; clock: { now(): Date } },
  args: { workspaceId: string; projectId: string; sentence: string; byActor: Actor },
): Promise<AiUseAddition> {
  const sentence = args.sentence.trim();
  if (!sentence) throw new AdditionError("empty_sentence", "an addition needs a non-empty sentence");
  const id = deps.ids("aiua");
  const createdAt = deps.clock.now();
  await exec.query(
    `insert into ai_use_additions(id, workspace_id, project_id, sentence, by_actor, created_at)
     values ($1,$2,$3,$4,$5,$6)`,
    [id, args.workspaceId, args.projectId, sentence, JSON.stringify(args.byActor), createdAt],
  );
  return { id, projectId: args.projectId, sentence, byActor: args.byActor, createdAt };
}
