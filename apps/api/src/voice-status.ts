// The voice status assembler (PRB.10; REQ-PERSONA-13/14/17; §9.3). Loads a persona's snapshot facts from
// the `persona_profiles` / `discovered_items` / `sample_versions` / `runs` rows and calls the ONE shared
// `deriveVoiceStatus` — no surface computes status independently. The voice page, the run sheet's voice
// line, the project chip, and the picker option all render what this returns.
//
// The §9.3 model maps onto the real schema like this:
//   snapshot facts   ← persona_profiles{ built_at, tier, seed_sha256, sample_set {item→sha},
//                                        sample_set_hash, corpus_size_at_build, calibration_status }
//   current facts    ← personas.seed_sha256 (maintained on every seed save) + the included
//                      discovered_items joined to their head sample_versions ({item→sha}, Σwords)
//   run in progress  ← runs{workflow:'profile_voice'|'refresh_voice'|'calibrate_voice', persona_id,
//                        state ∈ pre-terminal} + the committed-step count for "phase N of M"

import {
  deriveVoiceStatus,
  type VoiceCurrentFacts,
  type VoiceRunInProgress,
  type VoiceSnapshotFacts,
  type VoiceStatus,
} from "@rhema/findings-core";
import type { SqlExecutor } from "@rhema/mirror";

export interface PersonaRow {
  id: string;
  display_name: string | null;
  slug: string | null;
  byline: string | null;
  mode: string;
  registers: string[] | null;
  seed_artifact_id: string | null;
  seed_sha256: string | null;
  /** 'user' | 'persona_builder' — agent-drafted until the first user seed edit (REQ-PERSONA-4). */
  seed_authored_by: string | null;
  seed_updated_at: Date | string | null;
  current_profile_id: string | null;
  active_run_id: string | null;
}

interface ProfileDb {
  id: string;
  built_at: Date | string;
  tier: string | null;
  seed_sha256: string | null;
  sample_set_hash: string | null;
  sample_set: unknown;
  corpus_size_at_build: number | null;
  calibration_status: string | null;
  built_by_run_id: string | null;
}
interface ItemDb {
  id: string;
  content_sha256: string;
  word_count: number | null;
}
interface BuildRunDb {
  id: string;
  state: string;
  tier: string | null;
  committed: number;
}

const PRETERMINAL = [
  "created",
  "awaiting_consent",
  "queued",
  "provisioning",
  "running",
  "waiting_gate",
  "cancelling",
  "finalizing",
];

/** Parse the persona_profiles.sample_set jsonb ({itemId → content_sha256}) tolerantly. */
export function parseSampleSet(v: unknown): Record<string, string> {
  const raw = typeof v === "string" ? (JSON.parse(v) as unknown) : v;
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, string> = {};
  for (const [k, val] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof val === "string") out[k] = val;
    else if (val && typeof val === "object") {
      const h = (val as Record<string, unknown>).content_sha256 ?? (val as Record<string, unknown>).contentSha256;
      if (typeof h === "string") out[k] = h;
    }
  }
  return out;
}

/** The active phase count a persona build runs — Quick Voice omits substance + calibration (§9.2). */
export function personaPhaseCount(tier: string | null | undefined): number {
  return tier === "quick" ? 4 : 6;
}

/** Load the persona row (tenant-scoped by the caller's tx). */
export async function loadPersona(tx: SqlExecutor, personaId: string): Promise<PersonaRow | null> {
  const res = await tx.query(
    `select id, display_name, slug, byline, mode, registers, seed_artifact_id, seed_sha256,
            seed_authored_by, seed_updated_at, current_profile_id, active_run_id
       from personas where id = $1`,
    [personaId],
  );
  return (res.rows[0] as PersonaRow | undefined) ?? null;
}

/**
 * Assemble one persona's status (§9.3): latest profile snapshot + the current included-corpus map +
 * any in-flight build run → `deriveVoiceStatus`. Read-time only — nothing here persists a flag.
 */
export async function loadVoiceStatus(
  tx: SqlExecutor,
  args: { personaId: string; now?: Date },
): Promise<{ persona: PersonaRow; status: VoiceStatus; snapshot: VoiceSnapshotFacts | null } | null> {
  const persona = await loadPersona(tx, args.personaId);
  if (!persona) return null;

  // Latest snapshot = the persona's current_profile_id when set, else the newest persona_profiles row.
  const profRes = await tx.query(
    `select id, built_at, tier, seed_sha256, sample_set_hash, sample_set, corpus_size_at_build,
            calibration_status, built_by_run_id
       from persona_profiles
      where persona_id = $1
      order by (id = $2) desc, built_at desc, id desc
      limit 1`,
    [args.personaId, persona.current_profile_id ?? ""],
  );
  const profile = profRes.rows[0] as ProfileDb | undefined;
  const snapshot: VoiceSnapshotFacts | null = profile
    ? {
        builtAt: profile.built_at,
        seedSha256: profile.seed_sha256,
        sampleSet: parseSampleSet(profile.sample_set),
        corpusWordsAtBuild: profile.corpus_size_at_build,
        calibrationStatus: profile.calibration_status,
        tier: profile.tier,
      }
    : null;

  // The current included corpus: discovered_items.state='included' joined to the head sample version
  // (current_sample_id). The map key is the ITEM id — the same key space the snapshot froze.
  const itemRes = await tx.query(
    `select di.id, sv.content_sha256, sv.word_count
       from discovered_items di
       join connections cn on cn.id = di.connection_id
       join sample_versions sv on sv.id = di.current_sample_id
      where cn.persona_id = $1 and di.state = 'included'`,
    [args.personaId],
  );
  const samples: Record<string, string> = {};
  let corpusWords = 0;
  for (const r of itemRes.rows as ItemDb[]) {
    samples[r.id] = r.content_sha256;
    corpusWords += r.word_count ?? 0;
  }
  const current: VoiceCurrentFacts = {
    seedSha256: persona.seed_sha256,
    samples,
    corpusWords,
  };

  // An in-flight build/refresh/calibrate run → "Building · phase N of M" (committed steps + 1 of the
  // tier's active phase count; a Quick Voice runs 4 phases).
  const runRes = await tx.query(
    `select r.id, r.state, r.inputs->>'tier' as tier,
            (select count(*) from steps s where s.run_id = r.id and s.state = 'done') as committed
       from runs r
      where r.persona_id = $1 and r.workflow in ('profile_voice','refresh_voice','calibrate_voice')
        and r.state = any($2)
      order by r.created_at desc limit 1`,
    [args.personaId, PRETERMINAL],
  );
  const buildRun = runRes.rows[0] as BuildRunDb | undefined;
  const runInProgress: VoiceRunInProgress | null = buildRun
    ? {
        ordinal: Math.min(Number(buildRun.committed) + 1, personaPhaseCount(buildRun.tier)),
        of: personaPhaseCount(buildRun.tier),
      }
    : null;

  const status = deriveVoiceStatus({
    snapshot,
    current,
    runInProgress,
    ...(args.now ? { now: args.now } : {}),
  });
  return { persona, status, snapshot };
}
