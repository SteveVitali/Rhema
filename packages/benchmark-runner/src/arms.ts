import type { ArmConfig, BenchmarkArm, BenchmarkDeps, ModelFamily, SqlExecutor } from "./types.js";
import { canonicalHash } from "./hash.js";

// The six arms as runnable configurations (REQ-EVAL-6), frozen + hashed per wave. This module owns (a) the
// per-arm `config_hash` computation (REQ-EVAL-20), (b) persisting the frozen arm configs a wave runs, and (c) the
// A1 re-steelman bookkeeping (a fresh steelman owner + prompt every wave — REQ-EVAL-6). The arms:
//   A1 steelmanned one-shot frontier · A2 iterative generic recipe · A3 Grammarly-class (craft only) ·
//   A4 Rhema Standard · A5 Rhema Full board · A6 human editors (intake, not executed).
// Rhema arms (A4/A5) pin the production engine build + protocol@version and run with NO eval-only tuning
// (REQ-EVAL-6) — that invariant is asserted below (a Rhema arm config MUST name an engine build + protocol version).

/** The six arms (re-exported from the P0.13 data layer's canonical list). */
export { BENCHMARK_ARMS } from "@rhema/benchmark";

/** The Rhema arms — they carry a run_id → run-ledger metering, and pin engine build + protocol@version. */
export const RHEMA_ARMS: readonly BenchmarkArm[] = ["A4", "A5"];

/** The offline arms — no model family, no live run (A3 Grammarly craft-only; A6 human-editor intake). */
export const OFFLINE_ARMS: readonly BenchmarkArm[] = ["A3", "A6"];

export function isRhemaArm(arm: BenchmarkArm): boolean {
  return RHEMA_ARMS.includes(arm);
}

/** Raised when an arm configuration violates REQ-EVAL-6 (a Rhema arm must pin its production engine + protocol). */
export class ArmConfigError extends Error {
  constructor(
    public readonly arm: BenchmarkArm,
    detail: string,
  ) {
    super(`benchmark-runner: arm ${arm} misconfigured — ${detail}`);
    this.name = "ArmConfigError";
  }
}

/**
 * Compute the deterministic `config_hash` for one arm config (REQ-EVAL-20). The hash is over the whole config
 * (model, family, settings, prompt, engine build, protocol version, steelman owner, published flag) so any change
 * to what the arm actually ran changes the hash — a scored wave's exact configuration is reconstructable from it.
 */
export function armConfigHash(config: ArmConfig): string {
  return canonicalHash({
    arm: config.arm,
    model: config.model ?? null,
    modelFamily: config.modelFamily ?? null,
    provider: config.provider ?? null,
    settings: config.settings ?? {},
    prompt: config.prompt ?? null,
    engineBuild: config.engineBuild ?? null,
    protocolVersion: config.protocolVersion ?? null,
    steelmanOwner: config.steelmanOwner ?? null,
    published: config.published ?? false,
  });
}

/**
 * Validate an arm config against REQ-EVAL-6. Rhema arms (A4/A5) MUST pin an engine build + protocol version — that
 * is what "run the production engine + protocol package as they will ship, no eval-only tuning or forks" means at
 * the config layer. A1 SHOULD name a steelman owner (re-steelmanned every wave); its absence is not fatal here but
 * is surfaced by the pre-registration completeness check.
 */
export function assertArmConfigValid(config: ArmConfig): void {
  if (isRhemaArm(config.arm)) {
    if (!config.engineBuild) throw new ArmConfigError(config.arm, "a Rhema arm must pin its production engine build (REQ-EVAL-6/20)");
    if (!config.protocolVersion) throw new ArmConfigError(config.arm, "a Rhema arm must pin its protocol@version (REQ-EVAL-6/20)");
    if (!config.modelFamily) throw new ArmConfigError(config.arm, "a Rhema arm must declare its model family (cross-family judge gate — C-d)");
  }
}

export interface FreezeArmInput {
  readonly waveId: string;
  readonly config: ArmConfig;
}

/**
 * Freeze one arm's configuration for a wave (REQ-EVAL-6/10): validate it, compute its `config_hash`, and persist it.
 * Returns the config hash. Idempotent per (wave, arm): re-freezing overwrites (the pre-registration is the lock, not
 * this write). The offline arms (A3/A6) are frozen too — their config records the craft-metric scope / intake terms.
 */
export async function freezeArmConfig(
  exec: SqlExecutor,
  deps: BenchmarkDeps,
  input: FreezeArmInput,
): Promise<string> {
  const { config } = input;
  assertArmConfigValid(config);
  const hash = armConfigHash(config);
  await exec.query(
    `insert into benchmark_arm_configs
       (wave_id, arm, config, config_hash, model_family, engine_build, protocol_version, steelman_owner, published, created_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     on conflict (wave_id, arm) do update set
       config = excluded.config, config_hash = excluded.config_hash, model_family = excluded.model_family,
       engine_build = excluded.engine_build, protocol_version = excluded.protocol_version,
       steelman_owner = excluded.steelman_owner, published = excluded.published`,
    [
      input.waveId,
      config.arm,
      JSON.stringify(config),
      hash,
      config.modelFamily ?? null,
      config.engineBuild ?? null,
      config.protocolVersion ?? null,
      config.steelmanOwner ?? null,
      config.published ?? false,
      deps.clock.now(),
    ],
  );
  return hash;
}

export interface FrozenArmConfig {
  readonly arm: BenchmarkArm;
  readonly config: ArmConfig;
  readonly configHash: string;
  readonly modelFamily: ModelFamily | null;
}

/** Load the frozen arm configs for a wave (in arm order) — the C-d cross-family gate + the report read them. */
export async function loadArmConfigs(exec: SqlExecutor, waveId: string): Promise<FrozenArmConfig[]> {
  const rows = (
    await exec.query(
      `select arm, config, config_hash, model_family from benchmark_arm_configs where wave_id = $1 order by arm`,
      [waveId],
    )
  ).rows as { arm: BenchmarkArm; config: ArmConfig; config_hash: string; model_family: ModelFamily | null }[];
  return rows.map((r) => ({
    arm: r.arm,
    config: r.config,
    configHash: r.config_hash,
    modelFamily: r.model_family,
  }));
}

/**
 * Re-steelman A1 for a wave (REQ-EVAL-6): the A1 prompt is adversarially re-tuned on the dev set by an owner
 * incentivized to maximize its score, EVERY wave. This records the fresh owner + prompt and re-freezes A1's config
 * (a new config hash). The tuning itself is a human act (the steelman owner does the work); this is the bookkeeping
 * that makes "re-steelmanned every wave, prompt published with results" an auditable fact.
 */
export async function reSteelmanA1(
  exec: SqlExecutor,
  deps: BenchmarkDeps,
  input: { waveId: string; owner: string; prompt: string; model: string; modelFamily: ModelFamily; settings?: Readonly<Record<string, unknown>> },
): Promise<string> {
  const config: ArmConfig = {
    arm: "A1",
    model: input.model,
    modelFamily: input.modelFamily,
    settings: input.settings ?? { bestOfTwo: true, nativeSearch: true, maxReasoning: true },
    prompt: input.prompt,
    steelmanOwner: input.owner,
    published: true, // the A1 prompt is published with results (REQ-EVAL-18)
  };
  return freezeArmConfig(exec, deps, { waveId: input.waveId, config });
}
