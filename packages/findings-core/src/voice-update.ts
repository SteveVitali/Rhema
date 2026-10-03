// The Update-voice scope router + the diff-of-inputs panel (P1.14; §9.3; REQ-PERSONA-15/16,
// REQ-SPEC-27). One verb — "Update voice" — routed to the cheapest sufficient scope:
//
//   description changed        → refresh_voice{scope:'synth'}  (phases 2–5 over existing notes)
//   samples changed / aged     → refresh_voice{scope:'delta'}  (census delta + close-read new pieces)
//   untested ("Test this voice")→ calibrate_voice              (phase 4 alone)
//   badly off ("Rebuild")      → profile_voice                 (all six phases, nothing reused)
//   quick → full upgrade       → refresh_voice{scope:'full_from_quick'}
//
// The scope names live in Advanced/telemetry/the Runs tab — the pill and popover show ONE verb with
// one sentence saying what it will do. Both functions are pure over the same facts the pill derives,
// so the sheet's route can never disagree with the pill the user just read.

import type { VoiceSnapshotFacts, VoiceStatus, VoiceSamplesDelta } from "./voice-status.js";

/** The REQ-SPEC-27 scope vocabulary (`refresh_voice`'s frozen `inputs.scope` values + the two
 *  whole-run shapes). `build`/`none` are not scopes — they mean "no snapshot yet" / "nothing to do". */
export type VoiceUpdateScope = "synth" | "delta" | "calibrate" | "full" | "full_from_quick";
export const VOICE_UPDATE_SCOPES: readonly VoiceUpdateScope[] = [
  "synth",
  "delta",
  "calibrate",
  "full",
  "full_from_quick",
] as const;

/** The workflow a scope maps to (§9.3's REQ-SPEC-27 table, verbatim). */
export const VOICE_SCOPE_WORKFLOW: Record<VoiceUpdateScope, "profile_voice" | "refresh_voice" | "calibrate_voice"> = {
  synth: "refresh_voice",
  delta: "refresh_voice",
  calibrate: "calibrate_voice",
  full: "profile_voice",
  full_from_quick: "refresh_voice",
};

export interface VoiceUpdateRoute {
  /** the chosen scope, or `build` (no profile yet) / `none` (nothing to do). */
  readonly scope: VoiceUpdateScope | "build" | "none";
  readonly workflow: "profile_voice" | "refresh_voice" | "calibrate_voice" | null;
  /** the frozen run inputs the scope sets (`refresh_voice` carries `scope`; `full` carries `tier`). */
  readonly inputs: Record<string, string>;
  /** the one sentence the verb carries — what it will do, in plain words (§9.3). */
  readonly sentence: string;
}

const plural = (n: number, one: string, many?: string): string =>
  n === 1 ? `1 ${one}` : `${n} ${many ?? one + "s"}`;

/**
 * Route the pill's one verb to the cheapest sufficient scope (REQ-SPEC-27). The router's precedence is
 * NOT the pill's — the pill ranks states for display (a seed change outranks a calibration failure in
 * the table), but the route must cover every changed input:
 *
 *   1. badly-off calibration ⇒ a full rebuild — nothing the profile produced is trustworthy, whatever
 *      else drifted (the pill may be displaying `seed_changed`; the popover's facts still show why).
 *   2. a samples delta or `aged` ⇒ delta — it re-runs phases 2–5, which re-render the prose AND
 *      re-test, so it subsumes a seed change and an untested resting state whenever they co-occur.
 *   3. a seed-only change ⇒ synth — the corpus notes are reused verbatim.
 *   4. untested with nothing else drifted ⇒ calibrate_voice — phase 4 alone ("Test this voice").
 */
export function routeVoiceUpdate(args: {
  readonly status: VoiceStatus;
  readonly snapshot: VoiceSnapshotFacts | null;
}): VoiceUpdateRoute {
  const { status, snapshot } = args;
  if (!snapshot) {
    return {
      scope: "build",
      workflow: "profile_voice",
      inputs: {},
      sentence: "Build the voice profile from your description and samples",
    };
  }
  if (snapshot.calibrationStatus === "tested-badly-off") {
    return {
      scope: "full",
      workflow: "profile_voice",
      inputs: { tier: snapshot.tier === "quick" ? "quick" : "full" },
      sentence: "Rebuild the profile from scratch — nothing is reused",
    };
  }
  const samples = status.detail.samples;
  const sampleDelta = samples.added + samples.removed + samples.changed;
  const grew = (status.detail.growthRatio ?? 0) > 0;
  if (sampleDelta > 0 || status.state === "aged" || grew) {
    const what =
      sampleDelta > 0
        ? [
            samples.added > 0 ? `${plural(samples.added, "new piece")}` : null,
            samples.changed > 0 ? `${plural(samples.changed, "changed piece")}` : null,
            samples.removed > 0 ? `${plural(samples.removed, "removal")}` : null,
          ]
            .filter(Boolean)
            .join(", ")
        : "the newest samples";
    return {
      scope: "delta",
      workflow: "refresh_voice",
      inputs: { scope: "delta" },
      sentence:
        sampleDelta > 0
          ? `Read ${what} and re-test the profile — unchanged corpus notes are reused`
          : "Read the newest samples and re-test the profile — unchanged corpus notes are reused",
    };
  }
  if (status.detail.seedChanged) {
    return {
      scope: "synth",
      workflow: "refresh_voice",
      inputs: { scope: "synth" },
      sentence: "Re-render the profile prose from your description — the corpus is not re-read",
    };
  }
  if (snapshot.calibrationStatus === "untested" || snapshot.calibrationStatus == null) {
    return {
      scope: "calibrate",
      workflow: "calibrate_voice",
      inputs: {},
      sentence: "Test the profile against writing it has not seen",
    };
  }
  return { scope: "none", workflow: null, inputs: {}, sentence: "" };
}

/** The "Upgrade to Full Profile" route — offered on the detail page when a Quick snapshot exists
 *  (§9.2: upgrade is monotone; Quick Voice's corpus notes are reused). */
export function routeVoiceUpgrade(snapshot: VoiceSnapshotFacts | null): VoiceUpdateRoute | null {
  if (!snapshot || snapshot.tier !== "quick") return null;
  return {
    scope: "full_from_quick",
    workflow: "refresh_voice",
    inputs: { scope: "full_from_quick" },
    sentence: "Upgrade to a Full Profile — census, close reading, and calibration on top of Quick Voice's notes",
  };
}

// --------------------------------------------------------------------------- the diff-of-inputs panel

/** One fact row in the §9.3 popover — a label + a plain-words line (never a hash, never a rule name). */
export interface VoiceFactRow {
  readonly key: "description" | "samples" | "corpus" | "calibration";
  readonly label: string;
  /** the concrete delta in plain words ("+1 added · 1 changed", "unchanged"). */
  readonly line: string;
  /** true when this fact differs from the build (drives the row's emphasis). */
  readonly changed: boolean;
}

export interface VoiceFactsPanel {
  /** the four facts (§9.3: seed vs build, sample set vs build, corpus size vs build, calibration). */
  readonly facts: readonly VoiceFactRow[];
  /** days since the snapshot was built (the panel's Age line; null when never built). */
  readonly ageDays: number | null;
  /** corpus words at build → now (the "Your samples 26,134 → 36,484 words" line). */
  readonly corpusWords: { readonly built: number | null; readonly current: number };
  /** the ONE verb the panel offers — Update voice (or its first-build/test equivalents). */
  readonly verb: "Update voice" | "Build voice" | "Test this voice" | "Rebuild everything" | null;
  /** the routed scope behind the verb (the sheet's pre-computed choice; hidden from the popover copy). */
  readonly route: VoiceUpdateRoute;
}

/** A title for a changed sample, when the caller can name it (the popover's concrete-delta rows). */
export interface VoiceSampleDeltaTitle {
  readonly added?: readonly string[];
  readonly removed?: readonly string[];
  readonly changed?: readonly string[];
}

function samplesLine(samples: VoiceSamplesDelta, titles?: VoiceSampleDeltaTitle): string {
  const parts: string[] = [];
  if (samples.added > 0) {
    parts.push(`+${samples.added} added${titles?.added?.length ? ` "${titles.added[0]}"${samples.added > 1 ? " …" : ""}` : ""}`);
  }
  if (samples.changed > 0) {
    parts.push(`${samples.changed} changed${titles?.changed?.length ? ` "${titles.changed[0]}"${samples.changed > 1 ? " …" : ""}` : ""}`);
  }
  if (samples.removed > 0) {
    parts.push(`${samples.removed} removed${titles?.removed?.length ? ` "${titles.removed[0]}"${samples.removed > 1 ? " …" : ""}` : ""}`);
  }
  return parts.length ? parts.join("  ") : "unchanged";
}

function calibrationLine(status: string | null | undefined): string {
  switch (status) {
    case "tested":
      return "tested";
    case "tested-badly-off":
      return "tested — badly off";
    case "pending":
      return "calibration pending";
    case "untested":
    default:
      return "untested";
  }
}

/**
 * The popover/diff-of-inputs model (§9.3; REQ-PERSONA-15): the four facts with concrete deltas in
 * plain words, the age, the corpus-size line, and exactly ONE verb routed by `routeVoiceUpdate`.
 * `titles` names the first changed sample per kind when the API can resolve them — the spec's
 * "+1 added "The Constitution of Reason"" rows.
 */
export function voiceFactsPanel(args: {
  readonly status: VoiceStatus;
  readonly snapshot: VoiceSnapshotFacts | null;
  readonly titles?: VoiceSampleDeltaTitle;
  /** words across the current included samples (the line's right side); unknown ⇒ the line omits it. */
  readonly currentCorpusWords?: number;
}): VoiceFactsPanel {
  const { status, snapshot } = args;
  const d = status.detail;
  const currentWords = args.currentCorpusWords;
  const route = routeVoiceUpdate({ status, snapshot });
  const verb: VoiceFactsPanel["verb"] =
    status.action === "build"
      ? "Build voice"
      : status.action === "test"
        ? "Test this voice"
        : status.action === "rebuild"
          ? "Rebuild everything"
          : status.action === "update_voice"
            ? "Update voice"
            : null;
  const facts: VoiceFactRow[] = [
    {
      key: "description",
      label: "Description",
      line: d.seedChanged ? "changed since the build" : "unchanged",
      changed: d.seedChanged,
    },
    {
      key: "samples",
      label: "Samples",
      line: samplesLine(d.samples, args.titles),
      changed: d.samples.added + d.samples.removed + d.samples.changed > 0,
    },
    {
      key: "corpus",
      label: "Your samples",
      line:
        snapshot == null
          ? "no build yet"
          : currentWords != null && snapshot.corpusWordsAtBuild != null
            ? `${snapshot.corpusWordsAtBuild.toLocaleString("en-US")} → ${currentWords.toLocaleString("en-US")} words`
            : `${(snapshot.corpusWordsAtBuild ?? 0).toLocaleString("en-US")} words at build`,
      changed: (d.growthRatio ?? 0) > 0,
    },
    {
      key: "calibration",
      label: "Tested",
      line: calibrationLine(snapshot?.calibrationStatus),
      changed: snapshot?.calibrationStatus === "tested-badly-off",
    },
  ];
  return {
    facts,
    ageDays: d.ageDays,
    corpusWords: { built: snapshot?.corpusWordsAtBuild ?? null, current: currentWords ?? 0 },
    verb,
    route,
  };
}
