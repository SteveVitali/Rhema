import type { Severity } from "@rhema/contracts";

// The nightly golden runner's promotion gate (§13.5; REQ-ARCH-36; REQ-EVAL-17). §13.5: "a nightly score below a
// fixture's floor blocks promotion of protocols or engine changes"; REQ-EVAL-17 extends it — "a protocol version that
// regresses benchmark recall does not promote." A fixture pins the deterministic §13.5 scorer floors (`expected`);
// this compares a run's measured scores against them and blocks promotion on any below-floor / out-of-band / failed
// deterministic check. Deterministic — the LLM-judge scores never gate here (they run only after the deterministic
// set is green — C-g).

/** The deterministic §13.5 scorer floors a fixture pins (its `expected` block). Every field is optional — only the
 *  checks a fixture declares are gated. */
export interface FixtureFloors {
  /** material-issue recall (major+blocking) must be ≥ this (REQ-EVAL-17 — a recall regression blocks promotion). */
  readonly materialRecallFloor?: number;
  /** finding counts by severity must fall within [min,max] (§13.5 "finding counts ± tolerance"). */
  readonly findingCountsBySeverity?: Partial<Record<Severity, { min?: number; max?: number }>>;
  /** |post-revision word-budget delta| must be ≤ this (§13.5 "word-budget delta"). */
  readonly wordBudgetDeltaMax?: number;
  /** cited ⇒ fetched must hold (§13.5). */
  readonly citedFetched?: boolean;
  /** boundary attestation violations must be ≤ this (§13.5 "attestation violations = 0"). */
  readonly attestationViolationsMax?: number;
  /** every sidecar validated (§13.5 "schema validity"; REQ-SPEC-12 parseStatus ok). */
  readonly schemaValid?: boolean;
  /** markdown ↔ sidecar round-trip held (§13.5 "markdown round-trip"). */
  readonly markdownRoundTrip?: boolean;
  /** rubric caps consistent with finding counts (§13.5 "rubric-cap consistency"). */
  readonly rubricCapConsistent?: boolean;
  /** measured voice features must fall within the author's bands (§13.5 "voice metrics"). */
  readonly voiceFeatureBands?: Record<string, { min: number; max: number }>;
}

/** A run's measured deterministic scores for one fixture (what the nightly scorers produced). */
export interface FixtureScores {
  readonly materialRecall?: number;
  readonly findingCountsBySeverity?: Partial<Record<Severity, number>>;
  readonly wordBudgetDelta?: number;
  readonly citedFetched?: boolean;
  readonly attestationViolations?: number;
  readonly schemaValid?: boolean;
  readonly markdownRoundTrip?: boolean;
  readonly rubricCapConsistent?: boolean;
  readonly voiceFeatures?: Record<string, number>;
}

export interface FloorFailure {
  readonly metric: string;
  readonly reason: string;
  readonly expected: unknown;
  readonly actual: unknown;
}

export interface FloorGateResult {
  readonly fixtureId: string;
  readonly passed: boolean;
  /** below-floor / out-of-band / failed checks — a non-empty list blocks promotion. */
  readonly failures: readonly FloorFailure[];
  /** how many floor checks the fixture declared (a fixture with no floors gates nothing — reported so). */
  readonly checked: number;
}

/**
 * Gate a fixture's measured scores against its pinned deterministic floors (§13.5; REQ-ARCH-36/REQ-EVAL-17). A
 * required score that is missing from `scores` is itself a failure — an unrun deterministic check never passes. A
 * fixture that declares no floors passes with `checked: 0` (it gates nothing; callers may treat that as a config gap).
 */
export function assertScoreFloors(fixtureId: string, floors: FixtureFloors, scores: FixtureScores): FloorGateResult {
  const failures: FloorFailure[] = [];
  let checked = 0;

  const requireDefined = (metric: string, actual: unknown, expected: unknown): boolean => {
    if (actual === undefined || actual === null) {
      failures.push({ metric, reason: "not measured (an unrun deterministic check never passes)", expected, actual });
      return false;
    }
    return true;
  };

  if (floors.materialRecallFloor !== undefined) {
    checked++;
    if (requireDefined("materialRecall", scores.materialRecall, `≥ ${floors.materialRecallFloor}`)) {
      if (scores.materialRecall! < floors.materialRecallFloor) {
        failures.push({ metric: "materialRecall", reason: "below the recall floor (REQ-EVAL-17 — no promotion on a recall regression)", expected: `≥ ${floors.materialRecallFloor}`, actual: scores.materialRecall });
      }
    }
  }

  if (floors.findingCountsBySeverity) {
    for (const [sev, band] of Object.entries(floors.findingCountsBySeverity) as [Severity, { min?: number; max?: number }][]) {
      checked++;
      const actual = scores.findingCountsBySeverity?.[sev];
      if (requireDefined(`findingCount:${sev}`, actual, band)) {
        if (band.min !== undefined && actual! < band.min) failures.push({ metric: `findingCount:${sev}`, reason: "below the min count", expected: band, actual });
        if (band.max !== undefined && actual! > band.max) failures.push({ metric: `findingCount:${sev}`, reason: "above the max count", expected: band, actual });
      }
    }
  }

  if (floors.wordBudgetDeltaMax !== undefined) {
    checked++;
    if (requireDefined("wordBudgetDelta", scores.wordBudgetDelta, `|Δ| ≤ ${floors.wordBudgetDeltaMax}`)) {
      if (Math.abs(scores.wordBudgetDelta!) > floors.wordBudgetDeltaMax) {
        failures.push({ metric: "wordBudgetDelta", reason: "word-budget delta out of tolerance", expected: `|Δ| ≤ ${floors.wordBudgetDeltaMax}`, actual: scores.wordBudgetDelta });
      }
    }
  }

  const boolGate = (key: keyof FixtureFloors & keyof FixtureScores, metric: string) => {
    if (floors[key] === true) {
      checked++;
      if (requireDefined(metric, scores[key], true)) {
        if (scores[key] !== true) failures.push({ metric, reason: `${metric} did not hold`, expected: true, actual: scores[key] });
      }
    }
  };
  boolGate("citedFetched", "citedFetched");
  boolGate("schemaValid", "schemaValid");
  boolGate("markdownRoundTrip", "markdownRoundTrip");
  boolGate("rubricCapConsistent", "rubricCapConsistent");

  if (floors.attestationViolationsMax !== undefined) {
    checked++;
    if (requireDefined("attestationViolations", scores.attestationViolations, `≤ ${floors.attestationViolationsMax}`)) {
      if (scores.attestationViolations! > floors.attestationViolationsMax) {
        failures.push({ metric: "attestationViolations", reason: "boundary violations exceed the floor", expected: `≤ ${floors.attestationViolationsMax}`, actual: scores.attestationViolations });
      }
    }
  }

  if (floors.voiceFeatureBands) {
    for (const [feature, band] of Object.entries(floors.voiceFeatureBands)) {
      checked++;
      const actual = scores.voiceFeatures?.[feature];
      if (requireDefined(`voice:${feature}`, actual, band)) {
        if (actual! < band.min || actual! > band.max) failures.push({ metric: `voice:${feature}`, reason: "voice feature out of the author's band", expected: band, actual });
      }
    }
  }

  return { fixtureId, passed: failures.length === 0, failures, checked };
}

/**
 * Roll a set of per-fixture gate results into a promotion decision (§13.5 / REQ-ARCH-36): promotion of a protocol or
 * engine change is BLOCKED if any fixture failed its floors.
 */
export function promotionBlocked(results: readonly FloorGateResult[]): { blocked: boolean; failed: readonly FloorGateResult[] } {
  const failed = results.filter((r) => !r.passed);
  return { blocked: failed.length > 0, failed };
}
