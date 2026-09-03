import type { BenchmarkDeps, BenchmarkArm, SqlExecutor } from "./types.js";
import type { MatchVerdict } from "@rhema/benchmark";
import { recordMatchDecision } from "./matching.js";
import { confirmNovelty, recordPairwisePreference, type Presentation, type Preferred } from "./adjudication.js";

// The blind-to-arm match/adjudication WORKSHOP CLI (D-P0.14-2 — a workshop tool, NOT a product surface). It
// wraps the existing matching.ts / adjudication.ts functions so a TRAINED matcher can record decisions against
// a live wave. `runWorkshopCommand` is a pure dispatcher over an injected SqlExecutor, so it is unit-tested on
// PGlite exactly like the rest of the layer; the live `pg.Pool`-backed entrypoint that reads DATABASE_URL rides
// with the orchestrator's live client binding (D-P0.08-1 / Stage B). Nothing here re-implements scoring.
//
// The listing is deliberately BLIND: it shows the arm finding + its suggestion, never which arm produced it
// (REQ-EVAL-7/8) — the matcher decides on the finding's merits, not the arm.

export const WORKSHOP_USAGE = `benchmark workshop — blind match/adjudication tooling (D-P0.14-2)

  list-pending   --wave <id> [--draft <id>]
                 List undecided match tasks (BLIND to arm) with any automated suggestion.
  decide         --arm-finding <id> --verdict <matched|valid_but_missed_by_gold|invalid> [--gold <id>] --by <name>
                 Record a trained matcher's binding decision ('matched' requires --gold).
  confirm-novelty --arm-finding <id> --by <name> [--deny]
                 Senior confirmation that a 'valid_but_missed_by_gold' finding is genuinely novel.
  prefer         --wave <id> --draft <id> --arm-a <A> --arm-b <B> --presentation <ab|ba> --preferred <a|b|tie> --by <name> [--llm]
                 Record a post-revision pairwise preference (both orders resolve ties — C-a).
`;

export class WorkshopCliError extends Error {
  constructor(message: string) {
    super(`benchmark workshop: ${message}`);
    this.name = "WorkshopCliError";
  }
}

/** Parse `--flag value` / `--bool` argv into a flag map. The first token is the subcommand. */
export function parseWorkshopArgs(argv: readonly string[]): { command: string; flags: Record<string, string | true> } {
  const [command, ...rest] = argv;
  const flags: Record<string, string | true> = {};
  for (let i = 0; i < rest.length; i++) {
    const tok = rest[i];
    if (tok === undefined) break;
    if (!tok.startsWith("--")) throw new WorkshopCliError(`unexpected argument '${tok}' (expected --flag)`);
    const key = tok.slice(2);
    const next = rest[i + 1];
    if (next === undefined || next.startsWith("--")) {
      flags[key] = true; // boolean flag
    } else {
      flags[key] = next;
      i++;
    }
  }
  return { command: command ?? "", flags };
}

function req(flags: Record<string, string | true>, key: string): string {
  const v = flags[key];
  if (typeof v !== "string" || v.length === 0) throw new WorkshopCliError(`missing required --${key}`);
  return v;
}

interface PendingRow {
  id: string;
  draft_id: string;
  arm_finding_id: string;
  suggested_verdict: string | null;
  suggested_by: string | null;
}

/** List undecided match tasks for a wave (optionally one draft), BLIND to the arm. */
export async function listPendingTasks(
  exec: SqlExecutor,
  input: { waveId: string; draftId?: string },
): Promise<PendingRow[]> {
  const where = input.draftId ? "wave_id = $1 and draft_id = $2" : "wave_id = $1";
  const params = input.draftId ? [input.waveId, input.draftId] : [input.waveId];
  const rows = (
    await exec.query(
      `select id, draft_id, arm_finding_id, suggested_verdict, suggested_by
         from benchmark_match_records
        where ${where} and verdict is null
        order by draft_id, arm_finding_id`,
      params,
    )
  ).rows as PendingRow[];
  return rows;
}

const VALID_VERDICTS: readonly MatchVerdict[] = ["matched", "valid_but_missed_by_gold", "invalid"];

/**
 * Run one workshop command against an injected executor. Returns a human-readable result line; throws
 * `WorkshopCliError` on bad input. The blind/consistency invariants live in the underlying functions.
 */
export async function runWorkshopCommand(
  exec: SqlExecutor,
  deps: BenchmarkDeps,
  argv: readonly string[],
): Promise<string> {
  const { command, flags } = parseWorkshopArgs(argv);
  switch (command) {
    case "list-pending": {
      const rows = await listPendingTasks(exec, { waveId: req(flags, "wave"), draftId: typeof flags.draft === "string" ? flags.draft : undefined });
      if (rows.length === 0) return "no pending match tasks";
      // BLIND: the arm column is deliberately omitted from the matcher's view.
      const lines = rows.map(
        (r) => `${r.draft_id}  finding=${r.arm_finding_id}  suggested=${r.suggested_verdict ?? "-"}${r.suggested_by ? ` (by ${r.suggested_by})` : ""}`,
      );
      return `${rows.length} pending:\n${lines.join("\n")}`;
    }
    case "decide": {
      const verdict = req(flags, "verdict") as MatchVerdict;
      if (!VALID_VERDICTS.includes(verdict)) throw new WorkshopCliError(`invalid --verdict '${verdict}'`);
      await recordMatchDecision(exec, deps, {
        armFindingId: req(flags, "arm-finding"),
        verdict,
        goldFindingId: typeof flags.gold === "string" ? flags.gold : undefined,
        decidedBy: req(flags, "by"),
      });
      return `recorded ${verdict} on ${req(flags, "arm-finding")}`;
    }
    case "confirm-novelty": {
      const armFindingId = req(flags, "arm-finding");
      const confirmed = flags.deny !== true;
      await confirmNovelty(exec, deps, { armFindingId, adjudicator: req(flags, "by"), confirmed });
      return `${confirmed ? "confirmed" : "denied"} novelty on ${armFindingId}`;
    }
    case "prefer": {
      const presentation = req(flags, "presentation") as Presentation;
      if (presentation !== "ab" && presentation !== "ba") throw new WorkshopCliError("--presentation must be ab|ba");
      const preferred = req(flags, "preferred") as Preferred;
      if (!["a", "b", "tie"].includes(preferred)) throw new WorkshopCliError("--preferred must be a|b|tie");
      const id = await recordPairwisePreference(exec, deps, {
        waveId: req(flags, "wave"),
        draftId: req(flags, "draft"),
        armA: req(flags, "arm-a") as BenchmarkArm,
        armB: req(flags, "arm-b") as BenchmarkArm,
        presentation,
        preferred,
        judgeKind: flags.llm === true ? "llm" : "human",
        judgeId: req(flags, "by"),
      });
      return `recorded preference ${id} (${presentation} → ${preferred})`;
    }
    case "":
    case "help":
    case "--help":
      return WORKSHOP_USAGE;
    default:
      throw new WorkshopCliError(`unknown command '${command}'\n\n${WORKSHOP_USAGE}`);
  }
}
