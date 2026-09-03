import type { BenchmarkArm, BenchmarkDeps, SqlExecutor } from "./types.js";
import { canonicalHash } from "./hash.js";
import { loadArmConfigs } from "./arms.js";
import { waveManifest } from "@rhema/benchmark";

// Pre-registration (REQ-EVAL-10). Before a SCORED wave, the arms + exact configs + corpus manifest + metric
// definitions + matching/exclusion rules + statistical analysis + lift criterion are FROZEN and hash-committed; the
// dev set (pilot) is EXEMPT. Deviations from the frozen configuration are logged and surfaced in the wave report.
// AC4: a scored-wave report REFUSES to render without a matching hash-commit; post-freeze config drift is logged as
// a deviation. The freeze is an accountability record, not a lock — it makes "did the run match what was
// pre-registered?" a mechanically checkable question (`detectDrift`).

/** The pre-registrable RULES a wave freezes (the parts not derivable from the DB state at freeze time). */
export interface PreregisteredRules {
  readonly metricDefinitions: Readonly<Record<string, string>>;
  readonly matchingRules: string;
  readonly exclusionRules: string; // incl. the memorization-probe exclusion (REQ-EVAL-2)
  readonly analysis: string; // the statistical analysis (paired per-draft, power — REQ-EVAL-5)
  readonly criterion: Readonly<Record<string, unknown>>; // the LIFT criterion (REQ-EVAL-15)
  readonly publicRegistrationRef?: string; // public registration pointer (waves intended for publication)
}

/** The full frozen bundle the hash commits over (DB-derived arm configs + manifest, plus the supplied rules). */
export interface PreregistrationBundle extends PreregisteredRules {
  readonly arms: readonly BenchmarkArm[];
  readonly armConfigHashes: Readonly<Record<string, string>>;
  readonly corpusManifest: readonly string[];
}

/** Assemble the freeze bundle from the wave's current DB state (arm configs + admitted manifest) + the rules. */
export async function buildPreregistrationBundle(
  exec: SqlExecutor,
  waveId: string,
  rules: PreregisteredRules,
): Promise<PreregistrationBundle> {
  const configs = await loadArmConfigs(exec, waveId);
  const manifest = await waveManifest(exec, waveId);
  const armConfigHashes: Record<string, string> = {};
  for (const c of configs) armConfigHashes[c.arm] = c.configHash;
  return {
    arms: configs.map((c) => c.arm),
    armConfigHashes,
    corpusManifest: manifest,
    metricDefinitions: rules.metricDefinitions,
    matchingRules: rules.matchingRules,
    exclusionRules: rules.exclusionRules,
    analysis: rules.analysis,
    criterion: rules.criterion,
    publicRegistrationRef: rules.publicRegistrationRef,
  };
}

/**
 * Freeze + hash-commit a wave's pre-registration (REQ-EVAL-10). Persists the bundle + its canonical hash and mirrors
 * the hash onto `benchmark_waves.preregistration_hash` (the field P0.13 left for this ticket). Returns the hash.
 * Idempotent per wave: re-freezing overwrites (freeze once before the scored run; a later config change is a
 * deviation, detected by `detectDrift`, not a re-freeze).
 */
export async function freezePreregistration(
  exec: SqlExecutor,
  deps: BenchmarkDeps,
  input: { waveId: string; bundle: PreregistrationBundle },
): Promise<string> {
  const hash = canonicalHash(input.bundle);
  const frozenAt = deps.clock.now();
  await exec.query(
    `insert into benchmark_preregistrations (wave_id, hash, bundle, public_registration_ref, frozen_at)
     values ($1,$2,$3,$4,$5)
     on conflict (wave_id) do update set
       hash = excluded.hash, bundle = excluded.bundle, public_registration_ref = excluded.public_registration_ref,
       frozen_at = excluded.frozen_at`,
    [input.waveId, hash, JSON.stringify(input.bundle), input.bundle.publicRegistrationRef ?? null, frozenAt],
  );
  await exec.query(`update benchmark_waves set preregistration_hash = $2 where id = $1`, [input.waveId, hash]);
  return hash;
}

export interface Preregistration {
  readonly hash: string;
  readonly bundle: PreregistrationBundle;
}

export async function loadPreregistration(exec: SqlExecutor, waveId: string): Promise<Preregistration | null> {
  const rows = (
    await exec.query(`select hash, bundle from benchmark_preregistrations where wave_id = $1`, [waveId])
  ).rows as { hash: string; bundle: PreregistrationBundle }[];
  const row = rows[0];
  return row ? { hash: row.hash, bundle: row.bundle } : null;
}

/** Raised when a scored-wave report is requested without a matching pre-registration hash-commit (AC4). */
export class NotPreregisteredError extends Error {
  constructor(public readonly waveId: string) {
    super(
      `benchmark-runner: scored wave ${waveId} has no pre-registration hash-commit — a scored-wave report cannot ` +
        `be produced until the arms/configs/corpus/metrics/rules/analysis/criterion are frozen (REQ-EVAL-10; AC4)`,
    );
    this.name = "NotPreregisteredError";
  }
}

/**
 * Assert a wave is pre-registered before a report renders (AC4). A dev-set (pilot) wave is EXEMPT (REQ-EVAL-10) —
 * it returns null without error. A scored wave with no pre-registration throws `NotPreregisteredError`. Returns the
 * pre-registration (or null for an exempt dev-set wave) so the caller can surface the hash in the report.
 */
export async function assertPreregistered(exec: SqlExecutor, waveId: string): Promise<Preregistration | null> {
  const wave = (
    await exec.query(`select is_dev_set, kind from benchmark_waves where id = $1`, [waveId])
  ).rows[0] as { is_dev_set: boolean; kind: string } | undefined;
  if (!wave) throw new NotPreregisteredError(waveId);
  if (wave.is_dev_set || wave.kind === "pilot") return null; // dev set / pilot is exempt (REQ-EVAL-10)
  const prereg = await loadPreregistration(exec, waveId);
  if (!prereg) throw new NotPreregisteredError(waveId);
  return prereg;
}

export interface Deviation {
  readonly kind: string;
  readonly detail: string;
}

/** Log a deviation from the frozen pre-registration (REQ-EVAL-10) — surfaced in the wave report. */
export async function recordDeviation(
  exec: SqlExecutor,
  deps: BenchmarkDeps,
  input: { waveId: string; kind: string; detail: string },
): Promise<string> {
  const id = deps.ids("bmdev");
  await exec.query(
    `insert into benchmark_deviations (id, wave_id, kind, detail, logged_at) values ($1,$2,$3,$4,$5)`,
    [id, input.waveId, input.kind, input.detail, deps.clock.now()],
  );
  return id;
}

export async function loadDeviations(exec: SqlExecutor, waveId: string): Promise<Deviation[]> {
  const rows = (
    await exec.query(`select kind, detail from benchmark_deviations where wave_id = $1 order by logged_at, id`, [waveId])
  ).rows as { kind: string; detail: string }[];
  return rows.map((r) => ({ kind: r.kind, detail: r.detail }));
}

/**
 * Detect + LOG post-freeze configuration drift (REQ-EVAL-10; AC4). Compares the wave's CURRENT arm-config hashes +
 * admitted manifest against the frozen bundle; every mismatch is recorded as a `config_drift` (or `manifest_drift`)
 * deviation. Returns the deviations logged this call (empty ⇒ the run still matches its pre-registration). A wave
 * with no pre-registration (dev-set/pilot, or not yet frozen) is a no-op — there is nothing to have drifted from.
 */
export async function detectDrift(exec: SqlExecutor, deps: BenchmarkDeps, waveId: string): Promise<Deviation[]> {
  const prereg = await loadPreregistration(exec, waveId);
  if (!prereg) return [];
  const logged: Deviation[] = [];
  const currentConfigs = await loadArmConfigs(exec, waveId);
  const currentHashes: Record<string, string> = {};
  for (const c of currentConfigs) currentHashes[c.arm] = c.configHash;

  // an arm whose config hash changed, was added, or was removed since the freeze
  const arms = new Set<string>([...Object.keys(prereg.bundle.armConfigHashes), ...Object.keys(currentHashes)]);
  for (const arm of [...arms].sort()) {
    const frozen = prereg.bundle.armConfigHashes[arm];
    const now = currentHashes[arm];
    if (frozen !== now) {
      const detail =
        frozen === undefined
          ? `arm ${arm} was added after freeze`
          : now === undefined
            ? `arm ${arm} was removed after freeze`
            : `arm ${arm} config changed after freeze (${frozen.slice(0, 12)}… → ${now.slice(0, 12)}…)`;
      logged.push({ kind: "config_drift", detail });
      await recordDeviation(exec, deps, { waveId, kind: "config_drift", detail });
    }
  }

  // manifest drift (a draft added/removed vs the frozen corpus manifest)
  const currentManifest = await waveManifest(exec, waveId);
  const frozenSet = new Set(prereg.bundle.corpusManifest);
  const currentSet = new Set(currentManifest);
  for (const d of currentManifest) if (!frozenSet.has(d)) {
    const detail = `draft ${d} admitted after freeze`;
    logged.push({ kind: "manifest_drift", detail });
    await recordDeviation(exec, deps, { waveId, kind: "manifest_drift", detail });
  }
  for (const d of prereg.bundle.corpusManifest) if (!currentSet.has(d)) {
    const detail = `draft ${d} dropped from the manifest after freeze`;
    logged.push({ kind: "manifest_drift", detail });
    await recordDeviation(exec, deps, { waveId, kind: "manifest_drift", detail });
  }
  return logged;
}
