import type { BenchmarkArm, BenchmarkDeps, SqlExecutor } from "./types.js";

// The run-ledger join (REQ-EVAL-20, REQ-EVAL-14): one arm's run on one draft in a wave. A Rhema arm (A4/A5) carries
// a run_id that joins `runs` / `usage_records` for the §12.7 proxy-metered cost + wall-clock; offline arms (A3
// Grammarly, A6 human editors) carry no run_id. `config_hash` is recorded per run so a wave's exact configuration is
// reconstructable (REQ-EVAL-20; the pre-registration HASH itself is P0.14).

export interface RecordArmRunInput {
  readonly waveId: string;
  readonly draftId: string;
  readonly arm: BenchmarkArm;
  readonly configHash: string;
  readonly runId?: string;
  readonly model?: string;
  readonly latencyMs?: number;
  readonly id?: string;
}

export async function recordArmRun(
  exec: SqlExecutor,
  deps: BenchmarkDeps,
  input: RecordArmRunInput,
): Promise<string> {
  const id = input.id ?? deps.ids("bmarm");
  await exec.query(
    `insert into benchmark_arm_runs
       (id, wave_id, draft_id, arm, run_id, config_hash, model, latency_ms, created_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [
      id,
      input.waveId,
      input.draftId,
      input.arm,
      input.runId ?? null,
      input.configHash,
      input.model ?? null,
      input.latencyMs ?? null,
      deps.clock.now(),
    ],
  );
  return id;
}
