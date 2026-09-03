import type { BenchmarkArm, BenchmarkDeps, SqlExecutor } from "./types.js";

// Waves + admission + the per-arm memorization-probe exclusion (REQ-EVAL-2, REQ-EVAL-10, REQ-EVAL-17). A wave's
// admitted manifest is the set of drafts scored in it; admission is gated by the DB trigger (a complete
// contamination record is required, and a dev-set draft may only enter a dev-set wave — AC2 / REQ-EVAL-1). Wave
// orchestration + pre-registration hashing themselves are P0.14; this owns the data model and the admission +
// exclusion rules the runner drives.

export interface CreateWaveInput {
  readonly name: string;
  readonly kind?: "pilot" | "scored";
  readonly isDevSet?: boolean;
  /** the pre-registered IAA agreement floor drafts must clear (REQ-EVAL-4). */
  readonly agreementFloor: number;
  readonly id?: string;
}

export async function createWave(
  exec: SqlExecutor,
  deps: BenchmarkDeps,
  input: CreateWaveInput,
): Promise<string> {
  const id = input.id ?? deps.ids("bmwave");
  await exec.query(
    `insert into benchmark_waves (id, name, kind, is_dev_set, agreement_floor, created_at)
     values ($1,$2,$3,$4,$5,$6)`,
    [
      id,
      input.name,
      input.kind ?? "scored",
      input.isDevSet ?? false,
      input.agreementFloor,
      deps.clock.now(),
    ],
  );
  return id;
}

/** Raised when a draft is rejected from a wave manifest (mirrors the DB trigger's check_violation). */
export class WaveAdmissionError extends Error {
  constructor(
    public readonly draftId: string,
    public readonly waveId: string,
    public readonly detail: string,
  ) {
    super(`benchmark: draft ${draftId} cannot be admitted to wave ${waveId} — ${detail}`);
    this.name = "WaveAdmissionError";
  }
}

/**
 * Admit a draft to a wave's manifest (REQ-EVAL-10). The DB trigger enforces the REQ-EVAL-2 contamination gate and
 * the REQ-EVAL-1 dev-set rule; this wraps the trigger's check_violation in a typed `WaveAdmissionError` so a
 * caller can distinguish an admission rejection from any other DB error. AC2: a draft missing any REQ-EVAL-2
 * evidence field cannot be admitted.
 */
export async function admitToWave(
  exec: SqlExecutor,
  waveId: string,
  draftId: string,
): Promise<void> {
  try {
    await exec.query(
      `insert into benchmark_wave_drafts (wave_id, draft_id) values ($1,$2)`,
      [waveId, draftId],
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/benchmark:/.test(message)) throw new WaveAdmissionError(draftId, waveId, message);
    throw err;
  }
}

/** The drafts admitted to a wave, in id order. */
export async function waveManifest(exec: SqlExecutor, waveId: string): Promise<string[]> {
  return (
    (
      await exec.query(
        `select draft_id from benchmark_wave_drafts where wave_id = $1 order by draft_id`,
        [waveId],
      )
    ).rows as { draft_id: string }[]
  ).map((r) => r.draft_id);
}

/** Record a per-wave memorization probe for one draft × arm model (REQ-EVAL-2). */
export async function recordMemorizationProbe(
  exec: SqlExecutor,
  deps: BenchmarkDeps,
  input: { waveId: string; draftId: string; arm: BenchmarkArm; model: string; passed: boolean },
): Promise<void> {
  await exec.query(
    `insert into benchmark_memorization_probes (id, wave_id, draft_id, arm, model, passed, probed_at)
     values ($1,$2,$3,$4,$5,$6,$7)
     on conflict (wave_id, draft_id, arm) do update set
       model = excluded.model, passed = excluded.passed, probed_at = excluded.probed_at`,
    [deps.ids("bmprobe"), input.waveId, input.draftId, input.arm, input.model, input.passed, deps.clock.now()],
  );
}

/**
 * Apply the pre-registered memorization-probe exclusion rule (REQ-EVAL-2): a draft whose probe FAILED for an arm
 * is excluded from that arm. Marks the matching `benchmark_arm_runs` rows `excluded = true`. Returns the number of
 * arm-runs excluded. A draft with no probe row for an arm is NOT excluded (the probe must have been run and
 * failed) — the caller is responsible for ensuring every scored draft×arm has a probe.
 */
export async function applyMemorizationExclusions(
  exec: SqlExecutor,
  waveId: string,
): Promise<number> {
  const res = (await exec.query(
    `update benchmark_arm_runs ar set excluded = true
       from benchmark_memorization_probes p
      where ar.wave_id = p.wave_id and ar.draft_id = p.draft_id and ar.arm = p.arm
        and ar.wave_id = $1 and p.passed = false and ar.excluded = false
      returning ar.id`,
    [waveId],
  )) as { rows: unknown[] };
  return res.rows.length;
}
