// The LIVE `InstrumentedFolder` binding (P0.15k / D-P0.15-2). For one instrumented cost run on `dev`, it reads
// the run's MEASURED proxy cost (the meter of record — §12.7) + the run's estimator inputs from the DB, converts
// the proxy list dollars to platform credits (§14.1), and folds the measurement into the estimator registry via
// `recordInstrumentedFold` — so after one metered run per ported workflow, `estimatorsAreProvisional()` is false
// (§16.3 #1). It returns the folded spec (the driver emits it as the measured constants to persist durably), or
// `null` when the run has no proxy cost yet (never a fabricated fold).
//
// The pure mapping (`buildInstrumentedMeasurement`) is unit-tested; the DB reads (proxy total + the run's draft
// word count / claim / finding counts) are the live half, exercised in Stage B like the other live-* bindings.

import { platformCredits, type ModelTier } from "@rhema/contracts";
import { proxyVsSdkCrossCheck, type SqlClient } from "@rhema/orchestrator";
import {
  recordInstrumentedFold,
  type EstimatorInputs,
  type EstimatorSpec,
  type InstrumentedMeasurement,
} from "@rhema/protocols";
import type { InstrumentedFolder, InstrumentedRunRef } from "./live-exit-driver.js";

/** The DB facts one instrumented run contributes to its measured estimator anchor. */
export interface InstrumentedRunFacts {
  /** the run's tier (the tier multiplier the modeled prediction is de-scaled against). */
  readonly tier: ModelTier;
  /** measured platform credits for the run (proxy list dollars × §14.1, already converted). */
  readonly measuredCredits: number;
  /** the reviewed draft's word count (0 if unknown). */
  readonly words: number;
  /** the run's claim count (0 if none). */
  readonly claims: number;
  /** the run's finding count (0 if none). */
  readonly findings: number;
  /** when the run was metered. */
  readonly measuredAt: Date | string;
}

/** profile_voice has no base form — pick its named variant. The instrumented sweep runs it at standard + full
 *  rigor; map standard→Quick Voice, full→Full Profile (§9.2). Other ported workflows use their base form. */
function variantFor(workflow: InstrumentedRunRef["workflow"], rigor: InstrumentedRunRef["rigor"]): string | undefined {
  if (workflow === "profile_voice") return rigor === "full" ? "full" : "quick";
  return undefined;
}

/**
 * Build the `InstrumentedMeasurement` for one run from its DB facts (pure). The inputs superset is passed as-is;
 * each estimator spec's parametric form reads only the terms it declares, so extra inputs are ignored. A voice
 * profile reads the reviewed word count as `wordsRead`; the other workflows read `words`/`claims`/`findings`.
 */
export function buildInstrumentedMeasurement(run: InstrumentedRunRef, facts: InstrumentedRunFacts): InstrumentedMeasurement {
  const variant = variantFor(run.workflow, run.rigor);
  const inputs: EstimatorInputs =
    run.workflow === "profile_voice"
      ? { wordsRead: facts.words, piecesRead: 1, holdouts: variant === "full" ? 1 : 0 }
      : { words: facts.words, claims: facts.claims, findings: facts.findings };
  return {
    runId: run.runId,
    tier: facts.tier,
    // the estimator rigor enum is quick|standard|full_board; the driver's "full" is full_board.
    rigor: run.rigor === "full" ? "full_board" : "standard",
    variant,
    inputs,
    measuredCredits: facts.measuredCredits,
    measuredAt: facts.measuredAt,
  };
}

interface InputRow {
  model_tier: ModelTier;
  words: string | number | null;
  claims: string | number | null;
  findings: string | number | null;
}

function toNum(v: string | number | null): number {
  return v == null ? 0 : typeof v === "number" ? v : Number(v);
}

/**
 * Read one instrumented run's measured proxy cost + estimator inputs from `dev` and fold it into the estimator
 * registry. `exec` must be tenant-scoped (or a BYPASSRLS client, as the live-exit driver uses). Returns the
 * folded spec, or `null` when the run has no proxy cost to measure yet.
 */
export function createDbInstrumentedFolder(now: () => Date = () => new Date()): InstrumentedFolder {
  return async (exec: SqlClient, run: InstrumentedRunRef): Promise<EstimatorSpec | null> => {
    const cross = await proxyVsSdkCrossCheck(exec, run.runId);
    if (cross.proxyListUsd <= 0) return null; // nothing metered — honest no-fold, not a fabricated 0.

    const res = await exec.query(
      `select r.model_tier,
              (select av.word_count
                 from drafts d join artifact_versions av on av.id = d.promoted_version_id
                where d.id = (r.inputs->>'draftId')) as words,
              (select count(*) from claims c where c.draft_id = (r.inputs->>'draftId')) as claims,
              (select count(*) from findings f where f.draft_id = (r.inputs->>'draftId')) as findings
         from runs r where r.id = $1`,
      [run.runId],
    );
    const row = res.rows[0] as InputRow | undefined;
    const facts: InstrumentedRunFacts = {
      tier: row?.model_tier ?? "base",
      measuredCredits: platformCredits(cross.proxyListUsd),
      words: toNum(row?.words ?? null),
      claims: toNum(row?.claims ?? null),
      findings: toNum(row?.findings ?? null),
      measuredAt: now(),
    };
    const m = buildInstrumentedMeasurement(run, facts);
    return recordInstrumentedFold(run.workflow, m);
  };
}
