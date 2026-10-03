// The completion oracle (REQ-RUN-1 amended / REQ-SPEC-13; §12.2 review 13 F2).
//
// "Artifact exists, parses, is non-empty" is NOT a completion test — a phase that hit maxTurns, a budget stop,
// a provider 529 or auto-compaction leaves a plausible partial file. A phase is complete iff ALL THREE legs
// hold:
//   (a) the SDK `result` subtype is `success` — any other subtype is incomplete regardless of files;
//   (b) `.rhema/phase-result.json` says `{status:'done'}` (`blocked` → escalation; `replan` → back-edge);
//   (c) every declared artifact exists and passes its per-artifact completion predicate from the manifest.
// Otherwise the step is `artifact_missing` / incomplete, retried once with the phase report as guidance, then
// `failed` for that step with partials kept. This module is the pure verdict; the phase loop applies retries.

import type { ResultSubtype, PhaseResultStatus } from "@rhema/engine";
import type { CompletionPredicate } from "@rhema/protocols";
import { subtypeToErrorClass, type ErrorClass } from "./error-class.js";

/** The parsed `.rhema/phase-result.json` a skill writes at the end of a phase. */
export interface PhaseResultFile {
  readonly status: PhaseResultStatus; // "done" | "blocked" | "replan"
}

export interface EvaluatedPredicate {
  readonly predicate: CompletionPredicate;
  readonly passed: boolean;
  readonly detail?: string;
}

/** Evaluates one machine predicate against committed-artifact facts. Supplied by the caller (commit/harvest). */
export type PredicateEvaluator = (predicate: CompletionPredicate) => EvaluatedPredicate;

export type OracleVerdict =
  | { readonly outcome: "complete"; readonly predicates: EvaluatedPredicate[] }
  | { readonly outcome: "blocked" } //  phase-result {status:'blocked'} → escalation card
  | { readonly outcome: "replan" } //   phase-result {status:'replan'} → back-edge
  | {
      readonly outcome: "incomplete";
      readonly errorClass: ErrorClass;
      readonly failedLeg: "sdk_result" | "phase_result" | "predicate";
      readonly failedPredicates: EvaluatedPredicate[];
      readonly reason: string;
    };

export interface OracleInput {
  readonly sdkSubtype: ResultSubtype;
  /** null when the file is missing or unparseable — treated as incomplete (leg b). */
  readonly phaseResult: PhaseResultFile | null;
  readonly predicates: readonly CompletionPredicate[];
}

/**
 * Evaluate the three-leg oracle. Legs are checked in order (a) → (b) → (c) so the reported failure names the
 * FIRST unmet leg — an incomplete SDK result short-circuits before predicates are even considered (a partial
 * file must never read as done).
 */
export function evaluateOracle(input: OracleInput, evaluator: PredicateEvaluator): OracleVerdict {
  // Leg (a): the SDK result subtype. Only `success` continues; anything else is incomplete.
  if (input.sdkSubtype !== "success") {
    const cls = subtypeToErrorClass(input.sdkSubtype) ?? "infra";
    return {
      outcome: "incomplete",
      errorClass: cls,
      failedLeg: "sdk_result",
      failedPredicates: [],
      reason: `SDK result subtype ${input.sdkSubtype} (not success)`,
    };
  }

  // Leg (b): the phase-result file. blocked/replan are their own outcomes; missing/other is incomplete.
  if (input.phaseResult == null) {
    return {
      outcome: "incomplete",
      errorClass: "artifact_missing",
      failedLeg: "phase_result",
      failedPredicates: [],
      reason: "missing or unparseable .rhema/phase-result.json",
    };
  }
  if (input.phaseResult.status === "blocked") return { outcome: "blocked" };
  if (input.phaseResult.status === "replan") return { outcome: "replan" };
  // status must be "done" here (the union is done|blocked|replan and the two others returned).

  // Leg (c): every declared completion predicate.
  const evaluated = input.predicates.map((p) => evaluator(p));
  const failed = evaluated.filter((e) => !e.passed);
  if (failed.length > 0) {
    return {
      outcome: "incomplete",
      errorClass: "artifact_missing",
      failedLeg: "predicate",
      failedPredicates: failed,
      reason: `${failed.length} completion predicate(s) failed: ${failed
        .map((e) => e.predicate.kind)
        .join(", ")}`,
    };
  }

  return { outcome: "complete", predicates: evaluated };
}

/** Facts about the committed artifacts a phase produced, enough to evaluate every predicate kind. */
export interface PredicateFacts {
  /** artifact filename → exists. */
  readonly present?: Readonly<Record<string, boolean>>;
  /** artifact filename → non-empty (bytes/words > 0). */
  readonly nonempty?: Readonly<Record<string, boolean>>;
  readonly claimRowCount?: number;
  readonly inventoryCount?: number;
  readonly letterSectionsComplete?: boolean;
  readonly rubricDimensionCount?: number;
  /** the second read's producer query id, and the orchestrator-launched scoped query id it must equal. */
  readonly secondReadProducerQueryId?: string | null;
  readonly expectedProducerQueryId?: string | null;
  readonly responseLedgerRowPerFinding?: boolean;
  readonly draftSectionCount?: number;
  readonly planSectionCount?: number;
  readonly spineCount?: number;
  /** P1.12 — the outline sidecar's spine (claim-id) count for `outline_spine_bound`. */
  readonly outlineSpineCount?: number;
  readonly thesisPresent?: boolean;
  readonly inventoryPresent?: boolean;
  /** sidecar filename → validates against its P0.02 zod schema. */
  readonly sidecarValidates?: Readonly<Record<string, boolean>>;
  /**
   * sidecar filename → WHY validation failed (a compact issue summary, e.g.
   * `entries: expected array, received undefined` or `missing or unparseable JSON`). Surfaces as the
   * `sidecar_validates` predicate's detail → the failStep reason AND the guided-retry text, so the next
   * attempt sees the exact contract violation instead of a bare `false` (PRB.16b F15 — a live run
   * guessed `rows` for the required `entries` array and burned three triage attempts re-guessing).
   */
  readonly sidecarIssues?: Readonly<Record<string, string>>;
}

function pass(predicate: CompletionPredicate, ok: boolean, detail?: string): EvaluatedPredicate {
  return { predicate, passed: ok, detail };
}

/**
 * A predicate evaluator over a precomputed `PredicateFacts` bundle. A predicate whose fact is absent fails
 * (completion must be PROVEN, never assumed) with a "fact not supplied" detail.
 */
export function createFactsEvaluator(facts: PredicateFacts): PredicateEvaluator {
  return (p: CompletionPredicate): EvaluatedPredicate => {
    switch (p.kind) {
      case "artifact_present":
        return pass(p, facts.present?.[p.artifact] === true, "present");
      case "artifact_nonempty":
        return pass(p, facts.nonempty?.[p.artifact] === true, "nonempty");
      case "any_artifact_nonempty": {
        // P1.13 — passes when ANY listed artifact is non-empty; the detail names which (or none).
        const hit = p.artifacts.find((a) => facts.nonempty?.[a] === true);
        return pass(p, hit != null, hit != null ? `nonempty: ${hit}` : "none of the declared paths non-empty");
      }
      case "claim_rows_gte_inventory":
        return pass(
          p,
          facts.claimRowCount != null &&
            facts.inventoryCount != null &&
            facts.claimRowCount >= facts.inventoryCount,
          `${facts.claimRowCount} ≥ ${facts.inventoryCount}`,
        );
      case "letter_sections_complete":
        return pass(p, facts.letterSectionsComplete === true);
      case "rubric_dimensions_complete":
        return pass(p, facts.rubricDimensionCount === p.count, `${facts.rubricDimensionCount}/${p.count}`);
      case "second_read_producer_checked":
        return pass(
          p,
          facts.secondReadProducerQueryId != null &&
            facts.secondReadProducerQueryId === facts.expectedProducerQueryId,
          "producerQueryId matches the orchestrator-launched scoped query",
        );
      case "response_ledger_one_row_per_finding":
        return pass(p, facts.responseLedgerRowPerFinding === true);
      case "draft_sections_eq_plan":
        return pass(
          p,
          facts.draftSectionCount != null &&
            facts.planSectionCount != null &&
            facts.draftSectionCount === facts.planSectionCount,
          `${facts.draftSectionCount} = ${facts.planSectionCount}`,
        );
      case "spine_min":
        return pass(p, facts.spineCount != null && facts.spineCount >= p.min, `${facts.spineCount} ≥ ${p.min}`);
      case "outline_spine_bound":
        return pass(
          p,
          facts.outlineSpineCount != null && facts.outlineSpineCount >= p.min && facts.outlineSpineCount <= p.max,
          `${facts.outlineSpineCount} in [${p.min}, ${p.max}]`,
        );
      case "thesis_and_inventory_present":
        return pass(p, facts.thesisPresent === true && facts.inventoryPresent === true);
      case "sidecar_validates":
        return pass(p, facts.sidecarValidates?.[p.sidecar] === true, facts.sidecarIssues?.[p.sidecar]);
      default: {
        const _exhaustive: never = p;
        return pass(_exhaustive as CompletionPredicate, false, "unknown predicate kind");
      }
    }
  };
}
