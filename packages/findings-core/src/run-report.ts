// The run report read model (§5.5 D20; §14.5 Level 3–4; REQ-IDE-19). Level 3 answers "what did this round
// do, and what drove the cost": estimate-vs-actual, phase bars, seat split, subagent labels, server-side
// flags, claims-verified × cost-per-claim, and suggested guidance for the next round. Level 4 — lazily
// loaded behind the Advanced disclosure — is the phase × seat × model-tier drill-down with tokens and
// provider usage ids. BOTH levels are derived from server-side rows (steps, usage_records, credit_ledger);
// NOTHING here carries prompts, private memory, transcripts, or source-note bodies — the input types have
// no field that could hold one.

import type { RunState } from "@rhema/contracts";
import type { PhaseStatus } from "./run-card.js";

/** A committed/failed step row as the report reads it (server facts only). */
export interface ReportStepRow {
  readonly phase: string;
  readonly ordinal: number;
  readonly state: string; // 'done' | 'failed' | 'skipped' | …
  readonly credits: number;
  readonly durationMs: number | null;
  readonly attempt: number;
}

/** A usage_records aggregate for one (step × seat × modelTier × model) bucket (Level 4 rows). */
export interface ReportUsageRow {
  readonly phase: string | null; // resolved from step_id → steps.phase; null = unattributed
  readonly seat: string; // usage_records.role (the agent seat)
  readonly subagentLabel: string | null;
  readonly model: string;
  readonly modelTier: string;
  readonly credits: number;
  readonly durationMs: number | null;
  readonly searches: number;
  readonly fetches: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cacheReadTokens: number;
  readonly cacheWriteTokens: number;
  readonly providerRequestIds: readonly string[];
}

export interface ReportPhase {
  readonly key: string;
  readonly ordinal: number;
  readonly status: PhaseStatus;
  readonly seat: string | null;
  readonly credits: number;
  readonly durationMs: number | null;
  readonly searches: number;
  readonly fetches: number;
  readonly subagentLabels: readonly string[];
}

/** The report's controlled flag keys (§14.5's examples; the UI/copy renders each into a sentence). */
export type ReportFlagKey =
  | "fact_check_dominated"
  | "long_draft"
  | "discourse_map"
  | "second_read_model"
  | "over_estimate"
  | "under_estimate"
  | "retries";

/** The Level-3 report head — what the §5.5 "Run report" link opens. */
export interface RunReportView {
  readonly runId: string;
  readonly workflow: string;
  readonly state: RunState;
  readonly estimateCredits: number;
  readonly spentCredits: number;
  readonly capCredits: number;
  readonly refundedCredits: number;
  /** estimate→actual as a fraction (>1 overran); null when no estimate exists. */
  readonly estimateRatio: number | null;
  readonly phases: readonly ReportPhase[];
  /** credits by seat (the seat split), largest first. */
  readonly seatSplit: readonly { seat: string; credits: number; share: number }[];
  readonly flags: readonly ReportFlagKey[];
  /** claims checked × verified and the run's cost-per-verified-claim (null when the run checked none). */
  readonly claims: { readonly checked: number; readonly verified: number; readonly creditsPerVerified: number | null } | null;
  /** "What drove it" — the top cost drivers as controlled keys + a numeric detail. */
  readonly drivers: readonly { key: ReportFlagKey | "phase_share" | "within_estimate"; phase?: string; share?: number }[];
  /** Suggested guidance for the next round — controlled keys the UI renders into sentences. */
  readonly suggestedGuidance: readonly string[];
}

/** A Level-4 drill-down row — phase × seat × model tier (Advanced only; tokens live ONLY here). */
export interface RunReportAdvancedRow {
  readonly phase: string | null;
  readonly seat: string;
  readonly subagentLabel: string | null;
  readonly model: string;
  readonly modelTier: string;
  readonly credits: number;
  readonly durationMs: number | null;
  readonly searches: number;
  readonly fetches: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cacheReadTokens: number;
  readonly cacheWriteTokens: number;
  readonly providerRequestIds: readonly string[];
}

export interface RunReportAdvancedView {
  readonly runId: string;
  readonly rows: readonly RunReportAdvancedRow[];
}

export interface BuildReportInput {
  readonly runId: string;
  readonly workflow: string;
  readonly state: RunState;
  readonly estimateCredits: number;
  readonly spentCredits: number;
  readonly capCredits: number;
  readonly refundedCredits: number;
  /** every manifest phase for the workflow — including rigor-disabled ones (they report "off", REQ-IDE-12). */
  readonly phases: readonly { key: string; ordinal: number; status: PhaseStatus; seat?: string | null }[];
  readonly steps: readonly ReportStepRow[];
  readonly usage: readonly ReportUsageRow[];
  /** the claim ledger's counts (checked/verified), when the run produced one. */
  readonly claims?: { checked: number; verified: number } | null;
  /** the run's model tier (for the second-read-model flag). */
  readonly modelTier?: string | null;
}

const round = (n: number) => Math.round(n * 100) / 100;

/** The report's flags — each a deterministic predicate over the rows (§14.5's flag list). */
export function reportFlags(input: BuildReportInput): ReportFlagKey[] {
  const flags: ReportFlagKey[] = [];
  const phaseCredits = new Map<string, number>();
  const phaseSearchFetch = new Map<string, { searches: number; fetches: number }>();
  for (const u of input.usage) {
    if (u.phase != null) phaseCredits.set(u.phase, (phaseCredits.get(u.phase) ?? 0) + u.credits);
    if (u.phase != null) {
      const sf = phaseSearchFetch.get(u.phase) ?? { searches: 0, fetches: 0 };
      sf.searches += u.searches;
      sf.fetches += u.fetches;
      phaseSearchFetch.set(u.phase, sf);
    }
  }
  // fall back to step credits where no usage rows attribute a phase (metered rows are authoritative but a
  // cancelled-before-metering phase still shows its committed figure).
  for (const s of input.steps) {
    if (!phaseCredits.has(s.phase)) phaseCredits.set(s.phase, s.credits);
  }
  const total = Math.max(1, input.spentCredits);

  // fact_check_dominated — verification phases carried the majority of spend.
  const verify = [...phaseCredits.entries()]
    .filter(([k]) => /fact|verify|verification|claim/i.test(k))
    .reduce((a, [, c]) => a + c, 0);
  if (verify / total > 0.5) flags.push("fact_check_dominated");

  // long_draft — the drafting phase took a large share (long piece / heavy synthesis).
  const draftCredits = [...phaseCredits.entries()]
    .filter(([k]) => /draft|writing|write/i.test(k))
    .reduce((a, [, c]) => a + c, 0);
  if (draftCredits / total > 0.4) flags.push("long_draft");

  // discourse_map — the discourse-mapping phase ran (it is off below Standard).
  const discourse = input.steps.find((s) => /discourse|field/i.test(s.phase) && s.state === "done");
  if (discourse) flags.push("discourse_map");

  // second_read_model — the second read ran on a model tier different from the run's default.
  const secondRead = input.steps.find((s) => /second/i.test(s.phase) && s.state === "done");
  if (secondRead && input.modelTier) {
    const tiers = new Set(
      input.usage.filter((u) => u.phase === secondRead.phase).map((u) => u.modelTier),
    );
    if ([...tiers].some((t) => t !== input.modelTier)) flags.push("second_read_model");
  }

  // over_estimate / under_estimate — actual vs the run's estimate (§14.5's estimate-vs-actual flags).
  if (input.estimateCredits > 0) {
    const ratio = input.spentCredits / input.estimateCredits;
    if (ratio <= 0.6) flags.push("over_estimate");
    else if (ratio > 1.1) flags.push("under_estimate");
  }

  // retries — any step needed more than one attempt.
  if (input.steps.some((s) => s.attempt > 1)) flags.push("retries");

  return flags;
}

/**
 * Assemble the Level-3 report (§14.5). Deterministic — flags are the pure predicates above; the phase rows
 * join committed steps with the usage attribution; seats split the spend; "What drove it" lists the largest
 * phase shares + the fired flags; suggested guidance is a controlled key list the UI words.
 */
export function buildRunReport(input: BuildReportInput): RunReportView {
  const usageByPhase = new Map<string, { credits: number; searches: number; fetches: number; durationMs: number; subagents: Set<string>; seats: Map<string, number> }>();
  const seatTotals = new Map<string, number>();
  for (const u of input.usage) {
    const bucket =
      usageByPhase.get(u.phase ?? "") ??
      { credits: 0, searches: 0, fetches: 0, durationMs: 0, subagents: new Set<string>(), seats: new Map<string, number>() };
    bucket.credits += u.credits;
    bucket.searches += u.searches;
    bucket.fetches += u.fetches;
    bucket.durationMs += u.durationMs ?? 0;
    if (u.subagentLabel) bucket.subagents.add(u.subagentLabel);
    bucket.seats.set(u.seat, (bucket.seats.get(u.seat) ?? 0) + u.credits);
    usageByPhase.set(u.phase ?? "", bucket);
    seatTotals.set(u.seat, (seatTotals.get(u.seat) ?? 0) + u.credits);
  }

  const stepByPhase = new Map(input.steps.map((s) => [s.phase, s]));
  const phases: ReportPhase[] = input.phases.map((p) => {
    const step = stepByPhase.get(p.key);
    const usage = usageByPhase.get(p.key);
    const seat =
      p.seat ??
      (usage
        ? [...usage.seats.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
        : null);
    return {
      key: p.key,
      ordinal: p.ordinal,
      status: p.status,
      seat,
      credits: usage?.credits ?? step?.credits ?? 0,
      durationMs: step?.durationMs ?? (usage?.durationMs ? usage.durationMs : null),
      searches: usage?.searches ?? 0,
      fetches: usage?.fetches ?? 0,
      subagentLabels: usage ? [...usage.subagents].sort() : [],
    };
  });

  const totalSeat = Math.max(1, [...seatTotals.values()].reduce((a, b) => a + b, 0));
  const seatSplit = [...seatTotals.entries()]
    .map(([seat, credits]) => ({ seat, credits, share: round(credits / totalSeat) }))
    .sort((a, b) => b.credits - a.credits);

  const flags = reportFlags(input);

  // "What drove it" — the two largest phase shares by name, then the fired flags.
  const drivers: { key: ReportFlagKey | "phase_share" | "within_estimate"; phase?: string; share?: number }[] = phases
    .filter((p) => p.credits > 0 && p.status !== "off")
    .slice()
    .sort((a, b) => b.credits - a.credits)
    .slice(0, 2)
    .map((p) => ({ key: "phase_share" as const, phase: p.key, share: round(p.credits / Math.max(1, input.spentCredits)) }));
  for (const f of flags) drivers.push({ key: f });
  if (drivers.length === 0) drivers.push({ key: "within_estimate" });

  // Suggested guidance — one controlled key per fired flag the copy table words for the next round.
  const suggestedGuidance = flags.map((f) => `guidance.${f}`);

  const claims =
    input.claims != null && input.claims.checked > 0
      ? {
          checked: input.claims.checked,
          verified: input.claims.verified,
          creditsPerVerified:
            input.claims.verified > 0 ? round(input.spentCredits / input.claims.verified) : null,
        }
      : null;

  return {
    runId: input.runId,
    workflow: input.workflow,
    state: input.state,
    estimateCredits: input.estimateCredits,
    spentCredits: input.spentCredits,
    capCredits: input.capCredits,
    refundedCredits: input.refundedCredits,
    estimateRatio: input.estimateCredits > 0 ? round(input.spentCredits / input.estimateCredits) : null,
    phases,
    seatSplit,
    flags,
    claims,
    drivers,
    suggestedGuidance,
  };
}

/** The Level-4 drill-down (Advanced): the phase × seat × model rows, tokens + provider ids included. */
export function buildRunReportAdvanced(runId: string, usage: readonly ReportUsageRow[]): RunReportAdvancedView {
  return {
    runId,
    rows: usage.map((u) => ({
      phase: u.phase,
      seat: u.seat,
      subagentLabel: u.subagentLabel,
      model: u.model,
      modelTier: u.modelTier,
      credits: u.credits,
      durationMs: u.durationMs,
      searches: u.searches,
      fetches: u.fetches,
      inputTokens: u.inputTokens,
      outputTokens: u.outputTokens,
      cacheReadTokens: u.cacheReadTokens,
      cacheWriteTokens: u.cacheWriteTokens,
      providerRequestIds: u.providerRequestIds,
    })),
  };
}
