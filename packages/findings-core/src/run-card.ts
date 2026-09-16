import type { RunState } from "@rhema/contracts";

// The run card + its state (§5.5; REQ-IDE-11/12). The card renders ORCHESTRATOR-EMITTED state, counters,
// elapsed, credits-vs-cap and an ETA band — and NOTHING derived from agent-authored text. This builder reads
// only whitelisted, structured orchestrator facts; the event-derived path (`deriveRunCardInput`) consumes only
// the §12.5 orchestrator event types and copies only their numeric/enum fields, so a stream that also carries
// `agent.note`, `finding.emitted` bodies or `artifact.written.summary` prose contributes NOTHING to the card
// (REQ-IDE-11: "no progress element derives from agent-authored text"). Framework-free.

/** A phase's status glyph: ✓ done, ◐ running, ○ pending, off (opt-out disabled by rigor — REQ-IDE-12). */
export type PhaseStatus = "done" | "running" | "pending" | "skipped" | "off";

/** A single counter on a running phase (e.g. claims 23/56) — numbers only, never prose. */
export interface PhaseCounter {
  readonly key: string;
  readonly value: number;
  readonly of?: number;
}

/** A phase row on the card. `key` is a controlled workflow-phase id (§6.2) the UI resolves to a label. */
export interface PhaseProgress {
  readonly key: string;
  readonly ordinal: number;
  readonly status: PhaseStatus;
  readonly counters?: readonly PhaseCounter[];
  readonly credits?: number;
  readonly durationMs?: number;
}

/** The structured orchestrator facts a run card is built from — NO free-text field exists on this type. */
export interface RunCardInput {
  readonly runId: string;
  readonly state: RunState;
  readonly phases: readonly PhaseProgress[];
  readonly spentCredits: number;
  readonly capCredits: number;
  /** PRB.08 — credits refunded back to available (a failed/refused/cancelled run or a reconciliation
   *  silent-refund); the card renders "refunded N credits; partial results kept". */
  readonly refundedCredits?: number;
  readonly elapsedMs?: number;
  readonly etaBand?: { readonly lowMin: number; readonly highMin: number };
}

export interface RunCardView {
  readonly runId: string;
  readonly state: RunState;
  readonly phases: readonly PhaseProgress[];
  readonly spentCredits: number;
  readonly capCredits: number;
  /** spent/cap as a 0..1 fraction (clamped), for a meter — never a percentage of agent text. */
  readonly creditFraction: number;
  /** total credits refunded (the `cost.refunded` Σ) — 0 when nothing was returned. */
  readonly refundedCredits: number;
  readonly elapsedMs: number | null;
  readonly etaBand: { readonly lowMin: number; readonly highMin: number } | null;
  readonly done: number;
  readonly running: number;
  readonly total: number;
}

/** Build the run card view from structured orchestrator facts (§5.5). Pure; no agent text can enter. */
export function buildRunCardView(input: RunCardInput): RunCardView {
  const total = input.phases.length;
  const done = input.phases.filter((p) => p.status === "done").length;
  const running = input.phases.filter((p) => p.status === "running").length;
  const creditFraction = input.capCredits > 0 ? Math.min(1, Math.max(0, input.spentCredits / input.capCredits)) : 0;
  return {
    runId: input.runId,
    state: input.state,
    phases: input.phases,
    spentCredits: input.spentCredits,
    capCredits: input.capCredits,
    creditFraction,
    refundedCredits: input.refundedCredits ?? 0,
    elapsedMs: input.elapsedMs ?? null,
    etaBand: input.etaBand ?? null,
    done,
    running,
    total,
  };
}

// ---------------------------------------------------------------- event → card input (REQ-IDE-11)

/** The minimal shape of a §12.5 run event this module reads (type + payload). */
export interface RunEventLike {
  readonly type: string;
  readonly payload: unknown;
}

/**
 * The ONLY event types that feed the run card. Deliberately excludes every event that could carry
 * agent-authored text — `agent.note`, `finding.emitted`, `artifact.written`, `source.read`, `search.performed`,
 * `section.drafted` — so no progress element can derive from agent text (REQ-IDE-11).
 */
export const CARD_EVENT_TYPES: readonly string[] = [
  "run.state_changed",
  "step.started",
  "step.finished",
  "phase.skipped",
  "claim.progress",
  "usage.tick",
  "cost.final",
  "cost.refunded",
];

interface DeriveOptions {
  /** the full ordered phase list for the run's workflow (§6.2), so pending/off phases show before they start. */
  readonly phaseKeys?: readonly string[];
  /** phases the rigor notch turned off (REQ-IDE-12), rendered greyed "off". */
  readonly offPhases?: readonly string[];
  readonly capCredits?: number;
  readonly elapsedMs?: number;
  readonly etaBand?: { readonly lowMin: number; readonly highMin: number };
}

function asRecord(v: unknown): Record<string, unknown> {
  return typeof v === "object" && v !== null ? (v as Record<string, unknown>) : {};
}
function num(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}
function str(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

/**
 * Derive a `RunCardInput` from a run's event stream, reading ONLY the whitelisted orchestrator event types and
 * ONLY their numeric/enum fields (REQ-IDE-11). Any other event type — including one carrying agent prose — is
 * ignored entirely, so the card can never render agent-authored text.
 */
export function deriveRunCardInput(runId: string, events: readonly RunEventLike[], opts: DeriveOptions = {}): RunCardInput {
  const off = new Set(opts.offPhases ?? []);
  const order: string[] = [...(opts.phaseKeys ?? [])];
  const status = new Map<string, PhaseStatus>();
  const ordinalOf = new Map<string, number>();
  const counters = new Map<string, PhaseCounter[]>();
  const creditsOf = new Map<string, number>();
  const durationOf = new Map<string, number>();
  let state: RunState = "created";
  let spent = 0;
  let cap = opts.capCredits ?? 0;
  let refunded = 0;

  const ensure = (phase: string, ordinal?: number): void => {
    if (!order.includes(phase)) order.push(phase);
    if (ordinal != null) ordinalOf.set(phase, ordinal);
    if (off.has(phase)) status.set(phase, "off");
    else if (!status.has(phase)) status.set(phase, "pending");
  };
  for (const key of order) ensure(key);

  for (const ev of events) {
    if (!CARD_EVENT_TYPES.includes(ev.type)) continue; // ignore everything that could carry agent text
    const p = asRecord(ev.payload);
    switch (ev.type) {
      case "run.state_changed": {
        const to = str(p["to"]);
        if (to) state = to as RunState;
        break;
      }
      case "step.started": {
        const phase = str(p["phase"]);
        if (phase) {
          ensure(phase, num(p["ordinal"]));
          if (!off.has(phase)) status.set(phase, "running");
        }
        break;
      }
      case "step.finished": {
        const phase = str(p["phase"]);
        if (phase) {
          ensure(phase, num(p["ordinal"]));
          if (!off.has(phase)) status.set(phase, "done");
          const credits = num(p["credits"]);
          if (credits != null) creditsOf.set(phase, credits);
          const dur = num(p["durationMs"]);
          if (dur != null) durationOf.set(phase, dur);
        }
        break;
      }
      case "phase.skipped": {
        const phase = str(p["phase"]);
        if (phase) {
          ensure(phase, num(p["ordinal"]));
          status.set(phase, off.has(phase) ? "off" : "skipped");
        }
        break;
      }
      case "claim.progress": {
        // the "Checking claims 23/56" counter — pure numbers off the orchestrator's claim tally.
        const checked = num(p["checked"]);
        const of = num(p["of"]);
        if (checked != null) {
          // attach to whichever phase is currently running (claim checking).
          const runningPhase = order.find((k) => status.get(k) === "running");
          if (runningPhase) {
            counters.set(runningPhase, [{ key: "claims", value: checked, ...(of != null ? { of } : {}) }]);
          }
        }
        break;
      }
      case "usage.tick":
      case "cost.final": {
        const s = num(p["spentCredits"]);
        const c = num(p["capCredits"]);
        if (s != null) spent = s;
        if (c != null) cap = c;
        break;
      }
      case "cost.refunded": {
        // PRB.08 — the "refunded N credits" line: sum every refund row's whitelisted credits count.
        const r = num(p["credits"]);
        if (r != null) refunded += r;
        break;
      }
      default:
        break;
    }
  }

  const phases: PhaseProgress[] = order.map((key, i) => ({
    key,
    ordinal: ordinalOf.get(key) ?? i + 1,
    status: status.get(key) ?? (off.has(key) ? "off" : "pending"),
    ...(counters.get(key) ? { counters: counters.get(key) } : {}),
    ...(creditsOf.get(key) != null ? { credits: creditsOf.get(key) } : {}),
    ...(durationOf.get(key) != null ? { durationMs: durationOf.get(key) } : {}),
  }));

  return {
    runId,
    state,
    phases,
    spentCredits: spent,
    capCredits: cap,
    refundedCredits: refunded,
    ...(opts.elapsedMs != null ? { elapsedMs: opts.elapsedMs } : {}),
    ...(opts.etaBand != null ? { etaBand: opts.etaBand } : {}),
  };
}
