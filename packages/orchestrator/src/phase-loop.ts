// The phase loop (§12.4 step 6; REQ-SPEC-13; REQ-ARCH-32 reaction). For a phase the orchestrator drives
// `Engine.startPhase`, posts the mapped events, persists each token-usage marker as a provisional
// `usage_records{source:'sdk_stream'}` row (so Σ includes the running phase — review 13 F4), and evaluates the
// three-leg completion oracle on the result. An incomplete result in a re-runnable class (artifact_missing /
// infra / provider_transient) gets ONE guided retry with the phase report, then the caller gates/fails per the
// error class. Cost MATH is the proxy's/ledger's (§12.7); credit rendering is an injected seam (default 0)
// until the versioned rate table is shared — see DEFERRALS D-P0.08-2.

import type { Engine, EngineEvent, PhaseRequest, ResultSubtype, UsageSnapshot } from "@rhema/engine";
import { emptyUsage } from "@rhema/engine";
import type { PhaseManifest } from "@rhema/protocols";
import type { OrchestratorDeps } from "./internal-api.js";
import { postEvents } from "./internal-api.js";
import {
  createFactsEvaluator,
  evaluateOracle,
  type PhaseResultFile,
  type PredicateFacts,
} from "./completion-oracle.js";
import { retryPolicyFor, type ErrorClass } from "./error-class.js";

/** Renders provisional credits from an SDK usage snapshot (needs the versioned rate table; injected seam). */
export type CreditRenderer = (usage: UsageSnapshot, modelTier: string, rateTableVersion: number) => number;

const ZERO_CREDITS: CreditRenderer = () => 0;

/** The oracle inputs read from the phase's committed artifacts (file IO in prod; injected for tests). */
export interface OracleInputs {
  readonly phaseResult: PhaseResultFile | null;
  readonly facts: PredicateFacts;
}

export interface RunPhaseArgs {
  readonly runId: string;
  readonly attempt: number;
  readonly workspaceId: string;
  readonly modelTier: string;
  readonly rateTableVersion: number;
  readonly ordinal: number;
  readonly of: number;
  readonly phase: PhaseManifest;
  /** the PhaseRequest to drive the engine with; a guided retry re-runs it with `inputs.guidance` added. */
  readonly request: PhaseRequest;
  /** reads the committed `.rhema/phase-result.json` + artifact facts for a given attempt index (0-based). */
  readOracleInputs(retryIndex: number): Promise<OracleInputs>;
}

export type PhaseOutcome =
  | { readonly kind: "complete"; readonly usage: UsageSnapshot; readonly retries: number }
  | { readonly kind: "blocked"; readonly retries: number } //  phase-result blocked → escalation card
  | { readonly kind: "replan"; readonly retries: number } //   back-edge → re-plan
  | { readonly kind: "aborted"; readonly retries: number } //  abort() was called (cancel / cap) — caller knows why
  | {
      readonly kind: "incomplete";
      readonly errorClass: ErrorClass;
      readonly retries: number;
      readonly reason: string;
    };

export interface PhaseLoopDeps extends OrchestratorDeps {
  readonly renderCredits?: CreditRenderer;
}

/** Error classes whose remedy is re-running the same phase (with guidance for artifact_missing). */
const RERUN_CLASSES: ReadonlySet<ErrorClass> = new Set(["artifact_missing", "infra", "provider_transient"]);

interface DriveResult {
  readonly events: EngineEvent[];
  readonly subtype: ResultSubtype;
  readonly usage: UsageSnapshot;
}

/** Drive one `Engine.startPhase` to its terminal result, collecting mapped events and the final usage. */
async function drivePhase(engine: Engine, req: PhaseRequest): Promise<DriveResult> {
  const events: EngineEvent[] = [];
  let usage: UsageSnapshot = emptyUsage();
  let subtype: ResultSubtype = "error_during_execution";
  for await (const ev of engine.startPhase(req)) {
    if (ev.kind === "event") events.push(ev);
    else if (ev.kind === "usage") usage = ev.snapshot;
    else if (ev.kind === "result") {
      subtype = ev.subtype;
      usage = ev.usage;
    }
  }
  return { events, subtype, usage };
}

/**
 * Run one phase to a verdict. Posts the phase's events, records the provisional usage, evaluates the oracle,
 * and re-runs once (guided) on a re-runnable incomplete class. Returns the verdict; the caller (run-task loop)
 * maps it to commitStep (complete), a gate (blocked/refusal/budget), a back-edge (replan) or failStep.
 */
export async function runPhase(deps: PhaseLoopDeps, engine: Engine, args: RunPhaseArgs): Promise<PhaseOutcome> {
  const renderCredits = deps.renderCredits ?? ZERO_CREDITS;
  const predicates = args.phase.completionPredicates ?? [];
  let retries = 0;
  let guidance: string | undefined;

  for (;;) {
    const req: PhaseRequest = guidance
      ? { ...args.request, attempt: args.attempt, inputs: { ...args.request.inputs, guidance } }
      : { ...args.request, attempt: args.attempt };

    const driven = await drivePhase(engine, req);

    // post the mapped events (internal + user; the SSE split is P0.08b's) atomically.
    if (driven.events.length > 0) {
      await postEvents(deps, {
        runId: args.runId,
        attempt: args.attempt,
        workspaceId: args.workspaceId,
        events: driven.events.map((e) => ({
          type: (e as Extract<EngineEvent, { kind: "event" }>).type,
          payload: (e as Extract<EngineEvent, { kind: "event" }>).payload,
          agentLabel: (e as Extract<EngineEvent, { kind: "event" }>).agentLabel,
        })),
      });
    }

    // provisional running usage: an sdk_stream row + a usage.tick event (credits via the injected renderer).
    await recordProvisionalUsage(deps, args, driven.usage, renderCredits);

    // an aborted phase is an orchestrator-initiated cancel/cap, not a completion to judge — short-circuit
    // before the oracle so it is never misread as a retryable infra error.
    if (driven.subtype === "aborted") return { kind: "aborted", retries };

    const oracle = await args.readOracleInputs(retries);
    const verdict = evaluateOracle(
      { sdkSubtype: driven.subtype, phaseResult: oracle.phaseResult, predicates },
      createFactsEvaluator(oracle.facts),
    );

    if (verdict.outcome === "complete") return { kind: "complete", usage: driven.usage, retries };
    if (verdict.outcome === "blocked") return { kind: "blocked", retries };
    if (verdict.outcome === "replan") return { kind: "replan", retries };

    // incomplete: re-run once (guided) for a re-runnable class; otherwise return for the caller to gate/fail.
    const policy = retryPolicyFor(verdict.errorClass);
    if (RERUN_CLASSES.has(verdict.errorClass) && retries < policy.maxRetries) {
      retries++;
      guidance = policy.guided ? `Previous attempt incomplete: ${verdict.reason}. Complete every declared artifact.` : undefined;
      continue;
    }
    return { kind: "incomplete", errorClass: verdict.errorClass, retries, reason: verdict.reason };
  }
}

/**
 * Persist a provisional `usage_records{source:'sdk_stream'}` row for the running phase and emit a `usage.tick`
 * so the run card + the orchestrator's Σ include the in-flight phase (§12.4 step 6). Credits come from the
 * injected renderer (0 until the shared rate table lands); the proxy's `{source:'proxy'}` rows are the meter.
 */
async function recordProvisionalUsage(
  deps: PhaseLoopDeps,
  args: RunPhaseArgs,
  usage: UsageSnapshot,
  renderCredits: CreditRenderer,
): Promise<void> {
  // The renderer returns FRACTIONAL credits (the cap accountant rounds once at debit — credit-renderer.ts); this
  // provisional `sdk_stream` row is a transient DISPLAY figure (the running-card total), not the meter of record
  // (the proxy's `{source:'proxy'}` rows are, reconciled at commit), so round it for the integer `credits`
  // column — that never double-rounds the actual charge, which comes from the reconciled commit path.
  const credits = Math.round(renderCredits(usage, args.modelTier, args.rateTableVersion));
  await deps.txRunner.run(args.workspaceId, async (tx) => {
    const spentRow = (await tx.query("select spent_credits, cap_credits from runs where id = $1", [args.runId]))
      .rows[0] as { spent_credits: number; cap_credits: number };
    await tx.query(
      `insert into usage_records(
         id, ts, workspace_id, billing_account_id, run_id, attempt, step_id, role, provider, model,
         model_tier, rate_table_version, input_tokens, cache_write_tokens, cache_read_tokens, output_tokens,
         searches, fetches, list_cost_usd, credits, source)
       select $1,$2,r.workspace_id,w.billing_account_id,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,'sdk_stream'
         from runs r join workspaces w on w.id = r.workspace_id where r.id = $3`,
      [
        deps.ids("usg"),
        deps.clock.now(),
        args.runId,
        args.attempt,
        `step:${args.phase.key}`,
        args.request.seat,
        "anthropic",
        args.modelTier, // provisional: the tier stands in for the exact model id until the proxy meters it
        args.modelTier,
        args.rateTableVersion,
        usage.inputTokens,
        usage.cacheCreationTokens,
        usage.cacheReadTokens,
        usage.outputTokens,
        usage.webSearchRequests,
        usage.webFetchRequests,
        0, // list_cost_usd: the proxy is the meter of record; provisional rows carry token counts only
        credits,
        // source is the literal 'sdk_stream' in the SQL
      ],
    );
    await deps.eventWriter.append(tx, {
      runId: args.runId,
      type: "usage.tick",
      payload: { spentCredits: spentRow.spent_credits + credits, capCredits: spentRow.cap_credits },
      at: deps.clock.now(),
    });
  });
}
