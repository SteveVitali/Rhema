import { sha256Hex } from "@rhema/contracts";

// The voice status pill — ONE function over the snapshot facts, rendered byte-identically on every surface
// (§9.3; REQ-PERSONA-13/14). Staleness is computed at READ time from the stored snapshot + the current facts;
// no "stale" flag is ever persisted. The eight-state precedence table is implemented whole — P1.14 made the
// full surface live (`aged` and `badly_off` are reachable states, not latent rows; `VOICE_STATES` is the
// complete ordering).
//
// Framework-free + DOM-free like the rest of this package; hashing uses @rhema/contracts' isomorphic
// sha256 (the seed hash is a server-side fact — the mobile client consumes the derived status, never
// re-hashes — but this module also ships in the Page's browser bundle, so no node:crypto).

/** sha256 of some utf8 text, lower-case hex — same primitive the content store uses. */
function sha256Text(text: string): string {
  return sha256Hex(text);
}

/**
 * The §9.3 seed hash (ledger J9): `sha256(NFC(trim(description)) ‖ byline ‖ registers)`. It covers exactly
 * the description, the byline and the registers — Mode, the corpus pointer and the agent-authored build note
 * are deliberately OUTSIDE the hash (changing them must not flip the pill). Field separators are control
 * characters so field boundaries can never collide ("ab"+"c" ≠ "a"+"bc").
 */
export function computeSeedHash(args: {
  readonly description?: string | null;
  readonly byline?: string | null;
  readonly registers?: readonly string[] | null;
}): string {
  const description = (args.description ?? "").normalize("NFC").trim();
  const byline = (args.byline ?? "").normalize("NFC").trim();
  const registers = (args.registers ?? []).map((r) => r.normalize("NFC").trim()).filter((r) => r !== "");
  return sha256Text([description, byline, registers.join("")].join(""));
}

/**
 * The sample-set hash over `{sampleId → contentSha256}` — the snapshot's frozen corpus map and the current
 * included-corpus map share this shape, so a re-comparison is a map diff, not a hash of unordered rows.
 */
export function sampleSetHash(sampleSet: Readonly<Record<string, string>>): string {
  const keys = Object.keys(sampleSet).sort();
  return sha256Text(keys.map((k) => `${k}=${sampleSet[k]}`).join(""));
}

/** The §9.3 eight states (first match wins — `deriveVoiceStatus` checks in this order). */
export type VoiceState =
  | "never_built"
  | "building"
  | "seed_changed"
  | "samples_changed"
  | "aged"
  | "unfalsified"
  | "badly_off"
  | "fresh";

/** The full §9.3 state set, in precedence order (P1.14 — the beta subset is gone; every state is live). */
export const VOICE_STATES: readonly VoiceState[] = [
  "never_built",
  "building",
  "seed_changed",
  "samples_changed",
  "aged",
  "unfalsified",
  "badly_off",
  "fresh",
] as const;

/** Every surface the pill renders on (REQ-PERSONA-14) — the property test's surface axis. */
export const VOICE_SURFACES = ["library", "detail", "project_chip", "run_sheet"] as const;
export type VoiceSurface = (typeof VOICE_SURFACES)[number];

/** The pill tone — structurally the @rhema/ui `Tone` (kept a string union to avoid a UI dep). */
export type VoicePillTone = "running" | "needs_you" | "ready" | "attention" | "neutral";

/** The §9.3 "primary action (user-facing)" column — surfaces map it to a link; `none` renders no action. */
export type VoicePillAction = "build" | "open_run" | "update_voice" | "test" | "rebuild" | "none";

/** A stored profile snapshot's facts (persona_profiles row; §9.3 "stored facts"). */
export interface VoiceSnapshotFacts {
  readonly builtAt: string | Date;
  readonly seedSha256: string | null;
  /** `{sampleId → content_sha256}` — the corpus as built. */
  readonly sampleSet: Readonly<Record<string, string>>;
  readonly corpusWordsAtBuild: number | null;
  /** 'tested' | 'untested' | 'tested-badly-off' (a Quick Voice snapshot is 'untested'). */
  readonly calibrationStatus: string | null;
  readonly tier: string | null;
}

/** The voice's current facts (persona row + live sample set; §9.3 "current facts"). */
export interface VoiceCurrentFacts {
  readonly seedSha256: string | null;
  /** `{sampleId → content_sha256}` — the included corpus right now. */
  readonly samples: Readonly<Record<string, string>>;
  readonly corpusWords: number;
}

/** A voice build/refresh run in flight (the `building` state). */
export interface VoiceRunInProgress {
  /** the next phase the run will execute (1-based display position in the ACTIVE phase set). */
  readonly ordinal: number;
  /** the number of phases the run will execute (Quick Voice: 4; Full Profile: 6). */
  readonly of: number;
}

/** The delta the samples-changed detail line + the diff panel read (plain counts, never hashes). */
export interface VoiceSamplesDelta {
  readonly added: number;
  readonly removed: number;
  readonly changed: number;
}

export interface VoiceStatus {
  readonly state: VoiceState;
  readonly pill: { readonly label: string; readonly tone: VoicePillTone };
  /** the one user-facing action the pill offers (§9.3 column 5). */
  readonly action: VoicePillAction;
  /** the concrete deltas the popover/detail line renders in plain words (§9.3; review 12 #18). */
  readonly detail: {
    readonly seedChanged: boolean;
    readonly samples: VoiceSamplesDelta;
    /** corpus growth vs the build (drives `aged` at >25%). */
    readonly growthRatio: number | null;
    /** days since the snapshot was built (drives `aged` at >180). */
    readonly ageDays: number | null;
  };
}

/** "Aug 20" — the short month-day the aged pill + detail lines use (en-US, UTC so it is deterministic). */
export function shortVoiceDate(at: string | Date): string {
  const d = typeof at === "string" ? new Date(at) : at;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

const DAY_MS = 24 * 60 * 60 * 1000;
/** §9.3 #5: aged = >180 days since the build, or the included corpus grew >25% against the build. */
const AGED_DAYS = 180;
const AGED_GROWTH = 0.25;

/**
 * THE pill function (REQ-PERSONA-14): snapshot facts + current facts → state, pill, action, deltas.
 * First-match-wins down the §9.3 table. Surface-blind BY CONSTRUCTION — there is no `surface` parameter;
 * every caller renders this same result, which is what the AC-P-A property test proves.
 */
export function deriveVoiceStatus(args: {
  readonly snapshot: VoiceSnapshotFacts | null;
  readonly current: VoiceCurrentFacts;
  readonly runInProgress?: VoiceRunInProgress | null;
  /** read-time `now` for the age leg of `aged`; defaults to Date.now(). */
  readonly now?: Date;
}): VoiceStatus {
  const { snapshot, current } = args;

  // The samples delta (snapshot map vs current included map) — computed once; the samples-changed and
  // aged states and the detail panel all read it.
  const snapSet = snapshot?.sampleSet ?? {};
  const curSet = current.samples;
  let added = 0;
  let removed = 0;
  let changed = 0;
  for (const k of Object.keys(curSet)) {
    if (!(k in snapSet)) added += 1;
    else if (snapSet[k] !== curSet[k]) changed += 1;
  }
  for (const k of Object.keys(snapSet)) {
    if (!(k in curSet)) removed += 1;
  }
  const samples: VoiceSamplesDelta = { added, removed, changed };

  const builtAt = snapshot ? new Date(snapshot.builtAt) : null;
  const ageDays =
    builtAt != null ? Math.floor(((args.now ?? new Date()).getTime() - builtAt.getTime()) / DAY_MS) : null;
  const growthRatio =
    snapshot != null && (snapshot.corpusWordsAtBuild ?? 0) > 0
      ? current.corpusWords / (snapshot.corpusWordsAtBuild as number) - 1
      : null;
  const seedChanged =
    snapshot != null && snapshot.seedSha256 != null && current.seedSha256 != null
      ? snapshot.seedSha256 !== current.seedSha256
      : snapshot != null && snapshot.seedSha256 !== current.seedSha256;

  const detail = { seedChanged, samples, growthRatio, ageDays };

  // A run in flight wins over every fact row — the §9.3 state diagram edges `never_built → building`
  // on the FIRST build (and every *-changed state → building on an update), so "run in progress" is
  // checked before "no snapshot" even though the table numbers never-built first (row 1's "no snapshot"
  // reads as the resting no-profile state — no snapshot AND nothing in flight).
  if (args.runInProgress) {
    return {
      state: "building",
      pill: {
        label: `Building · phase ${args.runInProgress.ordinal} of ${args.runInProgress.of}`,
        tone: "running",
      },
      action: "open_run",
      detail,
    };
  }
  // 1 — no snapshot (and nothing in flight).
  if (snapshot == null) {
    return {
      state: "never_built",
      pill: { label: "No voice profile", tone: "neutral" },
      action: "build",
      detail,
    };
  }
  // 3 — the seed hash differs.
  if (seedChanged) {
    return {
      state: "seed_changed",
      pill: { label: "Description changed", tone: "attention" },
      action: "update_voice",
      detail,
    };
  }
  // 4 — the included sample set differs (added/removed/hash-changed).
  if (added + removed + changed > 0) {
    const n = added + removed + changed;
    return {
      state: "samples_changed",
      pill: { label: `${n} sample${n === 1 ? "" : "s"} changed`, tone: "attention" },
      action: "update_voice",
      detail,
    };
  }
  // 5 — >180 days old, or the corpus grew >25%.
  if ((ageDays != null && ageDays > AGED_DAYS) || (growthRatio != null && growthRatio > AGED_GROWTH)) {
    const grew = growthRatio != null && growthRatio > AGED_GROWTH;
    return {
      state: "aged",
      pill: {
        label: `Profile from ${shortVoiceDate(snapshot.builtAt)}${grew ? " · your samples grew a lot" : ""}`,
        tone: "attention",
      },
      action: "update_voice",
      detail,
    };
  }
  // 6 — built but never tested (the Quick Voice resting state — a fact about the tier, not a nag;
  //     neutral tone, never counted as stale: §9.3 row 6 + review 12 #20).
  if (snapshot.calibrationStatus === "untested" || snapshot.calibrationStatus == null) {
    return {
      state: "unfalsified",
      pill: { label: "Untested voice", tone: "neutral" },
      action: "test",
      detail,
    };
  }
  // 7 — tested and badly off.
  if (snapshot.calibrationStatus === "tested-badly-off") {
    return {
      state: "badly_off",
      pill: { label: "Tested — badly off", tone: "attention" },
      action: "rebuild",
      detail,
    };
  }
  // 8 — none of the above.
  return {
    state: "fresh",
    pill: { label: "Voice profile current", tone: "ready" },
    action: "none",
    detail,
  };
}
