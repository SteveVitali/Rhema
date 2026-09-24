// The Full Profile surfaces' shared, deterministic logic (P1.14; §9.2/9.4/9.5):
//
//   • the fixed §9.4 artifact order the Profile tab renders;
//   • the Approve-sample gate card's fact set (census counts, exclusions, the hold-out line,
//     estimate/cap, knobs) — computed from the run's frozen inputs so the card can't drift
//     from what the census actually found;
//   • the hold-out reveal predicate every surface uses — identity only after calibration;
//   • the build gates (Quick ≥1 sample or description; Full ≥4 samples AND ≥2 readable ≥10w).

import type { HoldoutSpec } from "./holdout.js";

// ----------------------------------------------------------------------------- fixed section order

/** The Profile tab's fixed §9.4 section order — "chosen for trust": the calibration report FIRST,
 *  then exemplars/positions/continuity, the collapsed sections, the (Advanced) deterministic voice
 *  measures, and the lexicon last. `path` is the persona mirror path the artifact list keys on;
 *  `path: null` marks the Voice-measures section — it renders from `@rhema/measure` over the corpus,
 *  not from a derived artifact (the Method column stays hidden per §9.4). Derived artifacts always
 *  carry `editMode: "none"` — the affordance copy ("correct this in your description") is per-section. */
export interface ProfileSection {
  readonly key: string;
  /** the derived artifact this section renders (null ⇒ computed — voice-measures). */
  readonly path: string | null;
  /** §9.4's collapsed sections render folded by default. */
  readonly collapsed: boolean;
  /** §9.4's (Advanced) section renders only under the Advanced disclosure. */
  readonly advanced: boolean;
}

export const PROFILE_SECTION_ORDER: readonly ProfileSection[] = [
  { key: "calibration-report", path: "profile/calibration.md", collapsed: false, advanced: false },
  { key: "exemplars", path: "profile/exemplars.md", collapsed: false, advanced: false },
  { key: "positions", path: "profile/positions.md", collapsed: false, advanced: false },
  { key: "continuity", path: "profile/continuity.md", collapsed: false, advanced: false },
  { key: "structure", path: "profile/structure-repertoire.md", collapsed: true, advanced: false },
  { key: "audience-venue", path: "profile/audience-and-venue.md", collapsed: true, advanced: false },
  { key: "voice-measures", path: null, collapsed: false, advanced: true },
  { key: "lexicon", path: "profile/lexicon.md", collapsed: false, advanced: false },
] as const;

// ----------------------------------------------------------------------------- approve-sample card

/** The sample-census facts the approve_sample gate card must show (§9.2 step 1). `exclusions`
 *  carry a reason in plain words ("couldn't fetch the file") — never a code. */
export interface CensusFacts {
  readonly total: number;
  readonly included: number;
  readonly excluded: readonly { readonly title: string; readonly reason: string }[];
}

export interface ApproveSampleCard {
  /** "N of M pieces" — the card's head count line. */
  readonly includedLine: string;
  readonly exclusions: readonly { readonly title: string; readonly reason: string }[];
  /** the hold-out sentence — identity NEVER named pre-calibration (§9.4). */
  readonly holdoutLine: string | null;
  /** the estimate + hard cap, in credits (§9.2's knobs: the estimate is a fact, the cap a bound). */
  readonly estimate: { readonly credits: number | null; readonly capCredits: number | null };
  readonly knobs: {
    readonly sampleCap: number;
    readonly calibration: boolean;
    readonly modelTier: "base" | "deep";
  };
  /** the calibration-off warning (§9.2's copy rule: the knob is allowed but named). */
  readonly calibrationWarning: string | null;
  /** true ⇒ the decision UI is a resume-availability wait (§9.2: "Available after <time>"). */
  readonly waitingUntil: string | null;
}

/** The §9.2 hold-out line — "one of your pieces is held back to test the profile — you won't see
 *  which until after calibration" — emitted only when a hold-out exists and calibration is on. */
export const HOLDOUT_LINE =
  "one of your pieces is held back to test the profile — you won't see which until after calibration";

/** The §9.2 warning when the calibration knob is off: the build proceeds but the badge can never
 *  reach "tested" — the card names that consequence rather than forbidding the choice. */
export const CALIBRATION_OFF_WARNING =
  "without calibration the profile can't be tested — the badge stays \u201cuntested\u201d";

export function approveSampleCard(args: {
  readonly census: CensusFacts;
  readonly holdout: boolean;
  readonly calibration: boolean;
  readonly sampleCap: number;
  readonly modelTier: "base" | "deep";
  readonly estimateCredits?: number | null;
  readonly capCredits?: number | null;
  /** set while the gate is inside its 24-hour decision window (§9.2's wait variant). */
  readonly waitingUntil?: string | null;
}): ApproveSampleCard {
  const c = args.census;
  return {
    includedLine: `${c.included} of ${c.total} pieces`,
    exclusions: c.excluded,
    holdoutLine: args.holdout && args.calibration ? HOLDOUT_LINE : null,
    estimate: { credits: args.estimateCredits ?? null, capCredits: args.capCredits ?? null },
    knobs: { sampleCap: args.sampleCap, calibration: args.calibration, modelTier: args.modelTier },
    calibrationWarning: args.calibration ? null : CALIBRATION_OFF_WARNING,
    waitingUntil: args.waitingUntil ?? null,
  };
}

// ----------------------------------------------------------------------------- hold-out reveal

/** The one rule every surface uses (§9.4): pre-calibration, a hold-out sample renders as the
 *  generic line; once `revealedAt` is set (calibration tested), the Samples tab badges it
 *  "★ held out" and the report names it. */
export function holdoutRevealed(spec: HoldoutSpec | null | undefined): spec is HoldoutSpec & { revealedAt: string } {
  return spec != null && spec.revealedAt != null;
}

// ----------------------------------------------------------------------------- build gates

/** The §9.2 build requirements — the API and the creation sheet share these so a blocked build
 *  never differs between the two surfaces. */
export const FULL_PROFILE_MIN_SAMPLES = 4;
export const FULL_PROFILE_MIN_READABLE = 2;
export const FULL_PROFILE_MIN_READABLE_WORDS = 10;

export type VoiceBuildGate =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly reason:
        | "name_required"
        | "needs_description_or_sample"
        | "full_needs_four_samples"
        | "full_needs_two_readable";
      readonly message: string;
    };

/** The full §9.2 gate: name + (description OR ≥1 sample) for either tier; Full additionally needs
 *  ≥4 included samples with ≥2 readable pieces of ≥10 words ("at least two at ≥10"). */
export function checkVoiceBuildGate(args: {
  readonly name: string;
  readonly description: string | null;
  readonly tier: "quick" | "full";
  readonly includedSamples: number;
  /** readable pieces with ≥ FULL_PROFILE_MIN_READABLE_WORDS words. */
  readonly readableSamples: number;
}): VoiceBuildGate {
  if (!args.name.trim()) {
    return { ok: false, reason: "name_required", message: "Name your voice first" };
  }
  const hasDescription = (args.description ?? "").trim().length > 0;
  if (!hasDescription && args.includedSamples === 0) {
    return {
      ok: false,
      reason: "needs_description_or_sample",
      message: "a voice needs a description or at least one sample",
    };
  }
  if (args.tier === "full") {
    if (args.includedSamples < FULL_PROFILE_MIN_SAMPLES) {
      return {
        ok: false,
        reason: "full_needs_four_samples",
        message: `Full Profile needs at least ${FULL_PROFILE_MIN_SAMPLES} samples`,
      };
    }
    if (args.readableSamples < FULL_PROFILE_MIN_READABLE) {
      return {
        ok: false,
        reason: "full_needs_two_readable",
        message: `Full Profile needs at least ${FULL_PROFILE_MIN_READABLE} readable pieces (≥${FULL_PROFILE_MIN_READABLE_WORDS} words)`,
      };
    }
  }
  return { ok: true };
}
