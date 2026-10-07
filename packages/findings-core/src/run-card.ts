import {
  DURATION_PRIOR_HIGH_FRACTION,
  DURATION_PRIOR_LOW_FRACTION,
  PHASE_DURATION_PRIOR_MINUTES,
  type RunState,
} from "@rhema/contracts";
import type { GateDecisionView } from "./gate-card.js";

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

/**
 * A deliverable chip on a terminal run card (§5.5: "Letter · 41 findings · Claims 56 · Second read ·
 * Rubric"). `key` is a controlled chip id the UI resolves to a label + href; `count` is numeric-only.
 */
export interface DeliverableChip {
  readonly key: string;
  readonly count?: number;
}

/**
 * The walkthrough's stored state (§5.5 D20; REQ-IDE-19 amended). The TEXT is model-written content rendered
 * as a discrete block — it is NOT a progress element, so its presence here does not violate REQ-IDE-11 (the
 * rule covers progress: glyphs/counters/credits/ETA — never the walkthrough's prose).
 */
export interface WalkthroughState {
  readonly status: "pending" | "ready" | "failed";
  /** ≤200 words, present only when ready. */
  readonly text?: string;
}

/** The state-driven actions a card offers (§5.5's primary-action column; §6.5 steering). */
export type RunCardAction =
  | "cancel" //            queued/created — stop before compute exists
  | "pause" //             running — "Pause after this phase" (REQ-GATE-12 amended)
  | "stop" //              running/paused — Stop, keep partials (REQ-GATE-13)
  | "note" //              running — a note for the next phase → Guidance{queued_message}
  | "resume" //            paused / terminal-partial — Resume (gate-resume or a successor run)
  | "live_feed" //         running — open the Desk feed
  | "open_deliverable" //  completed — the letter/response/draft
  | "report" //            terminal — the Level-3 run report link
  | "retry_walkthrough"; // walkthrough.status === 'failed' — lazy re-run of the one call

/**
 * The structured orchestrator facts a run card is built from — NO free-text field exists on this type
 * beyond the walkthrough's stored body (content, not progress).
 */
export interface RunCardInput {
  readonly runId: string;
  readonly state: RunState;
  readonly phases: readonly PhaseProgress[];
  readonly spentCredits: number;
  readonly capCredits: number;
  /**
   * RPT.1 (REQ-SPEC-32(a) display half; §5.5) — the meter figure is a mid-phase PROVISIONAL reading
   * (Σ proxy-metered usage ahead of the committed step figure). The card labels it so (≈ prefix);
   * absent/false ⇒ a committed/final figure.
   */
  readonly provisional?: boolean;
  /** PRB.08 — credits refunded back to available (a failed/refused/cancelled run or a reconciliation
   *  silent-refund); the card renders "refunded N credits; partial results kept". */
  readonly refundedCredits?: number;
  readonly elapsedMs?: number;
  readonly etaBand?: { readonly lowMin: number; readonly highMin: number };
  /** P1.05 — the run's estimate (a completed card shows actual vs estimate). */
  readonly estimateCredits?: number;
  /** P1.05 — a queued run's position ("2nd in line"); null when unknown/not queued. */
  readonly queuePosition?: number | null;
  /**
   * P1.05 — a `waiting_gate` run parked by the user's *Pause after this phase* (no gate row; `steer.paused`
   * was emitted). The card shows *Paused after <phase> (n of m)* + Resume/Resume-with-note/Stop instead of
   * an approval card (§6.5).
   */
  readonly paused?: boolean;
  /** P1.05 — the unresolved gate the run waits on (kind + deadline; ids/enums/dates only). */
  readonly waitingGate?: { readonly kind: string; readonly deadlineAt?: string | null } | null;
  /** P1.05 — delivered/committed artifact chips on terminal cards. */
  readonly deliverables?: readonly DeliverableChip[];
  /** P1.05 — the stored walkthrough (lazily generated; the card may render pending/failed + Retry). */
  readonly walkthrough?: WalkthroughState;
  /** P1.05 — the run's `failure.code` (a server-authored code, never the agent's message). */
  readonly failureCode?: string | null;
  /** P1.05 — a terminal partial/failed/cancelled run with ≥1 committed step can be resumed (a successor run
   *  continuing from the same inputs — REQ-GATE-13 keeps the partials on this card). */
  readonly resumable?: boolean;
  /** P1.05 — the count of undelivered queued notes on this run (the "1 note queued" line). */
  readonly queuedNotes?: number;
  /**
   * P1.09 (§6.4 item 8; REQ-RUN-5/6) — the run's PERMANENT approval-decision records (every resolved
   * gate: user-approved with its edits count, auto-continued on the deadline, expired, or
   * policy-skipped). SQL-side rows — the card renders one line each, never agent text.
   */
  readonly decisions?: readonly GateDecisionView[];
  /**
   * RES.2 (REQ-SPEC-31(3)) — the persisted run-level delivery label (`runs.delivery.label`, write-once).
   * "unverified" is the only value today: the run completed but its research checked nothing, so the
   * label renders ABOVE the verdict/state on the card — and is never recomputed from claim text.
   */
  readonly deliveryLabel?: "unverified" | null;
}

export interface RunCardView {
  readonly runId: string;
  readonly state: RunState;
  readonly phases: readonly PhaseProgress[];
  readonly spentCredits: number;
  readonly capCredits: number;
  /** RPT.1 — the meter figure is a provisional (pre-commit) reading; the label carries the ≈ marker. */
  readonly provisional: boolean;
  /** spent/cap as a 0..1 fraction (clamped), for a meter — never a percentage of agent text. */
  readonly creditFraction: number;
  /** total credits refunded (the `cost.refunded` Σ) — 0 when nothing was returned. */
  readonly refundedCredits: number;
  readonly elapsedMs: number | null;
  readonly etaBand: { readonly lowMin: number; readonly highMin: number } | null;
  readonly done: number;
  readonly running: number;
  readonly total: number;
  // ---- P1.05 additions (§5.5 card table) ----
  readonly estimateCredits: number | null;
  readonly queuePosition: number | null;
  /** user-initiated phase-boundary pause (waiting_gate + no gate) — the paused card variant. */
  readonly paused: boolean;
  readonly waitingGate: { readonly kind: string; readonly deadlineAt: string | null } | null;
  readonly deliverables: readonly DeliverableChip[];
  readonly walkthrough: WalkthroughState | null;
  readonly failureCode: string | null;
  readonly resumable: boolean;
  readonly queuedNotes: number;
  /** P1.09 — the permanent approval-decision lines (§6.4 item 8; REQ-RUN-5). */
  readonly decisions: readonly GateDecisionView[];
  /** the state-specific primary actions (§5.5), derived — the UI renders each as a labelled affordance. */
  readonly actions: readonly RunCardAction[];
  /** RES.2 — the persisted run-level delivery label (null when the run was not labelled). */
  readonly deliveryLabel: "unverified" | null;
}

/**
 * The card's state-specific actions (§5.5's "Primary action" column). Pure: state + paused/resumable flags
 * → the affordance list the UI labels. `waiting_gate` distinguishes the steering park (paused → Resume /
 * Stop) from a real gate (the approval card owns its actions; the card only offers the feed).
 */
export function runCardActions(args: {
  state: RunState;
  paused: boolean;
  resumable: boolean;
  hasDeliverable: boolean;
  walkthroughFailed: boolean;
}): RunCardAction[] {
  const out: RunCardAction[] = [];
  switch (args.state) {
    case "queued":
    case "created":
    case "awaiting_consent":
      out.push("cancel");
      break;
    case "running":
    case "orphaned":
    case "cancelling":
    case "finalizing":
      out.push("pause", "stop", "note", "live_feed");
      break;
    case "waiting_gate":
      if (args.paused) out.push("resume", "stop");
      else out.push("live_feed");
      break;
    case "completed":
      if (args.hasDeliverable) out.push("open_deliverable");
      out.push("report");
      break;
    case "completed_partial":
    case "failed":
    case "cancelled":
      if (args.resumable) out.push("resume");
      out.push("report");
      break;
    default:
      break;
  }
  if (args.walkthroughFailed) out.push("retry_walkthrough");
  return out;
}

/** Build the run card view from structured orchestrator facts (§5.5). Pure; no agent text can enter. */
export function buildRunCardView(input: RunCardInput): RunCardView {
  const total = input.phases.length;
  const done = input.phases.filter((p) => p.status === "done").length;
  const running = input.phases.filter((p) => p.status === "running").length;
  const creditFraction = input.capCredits > 0 ? Math.min(1, Math.max(0, input.spentCredits / input.capCredits)) : 0;
  const paused = input.paused === true && input.state === "waiting_gate";
  const deliverables = input.deliverables ?? [];
  const walkthrough = input.walkthrough ?? null;
  const resumable = input.resumable === true;
  return {
    runId: input.runId,
    state: input.state,
    phases: input.phases,
    spentCredits: input.spentCredits,
    capCredits: input.capCredits,
    provisional: input.provisional === true,
    creditFraction,
    refundedCredits: input.refundedCredits ?? 0,
    elapsedMs: input.elapsedMs ?? null,
    etaBand: input.etaBand ?? null,
    done,
    running,
    total,
    estimateCredits: input.estimateCredits ?? null,
    queuePosition: input.queuePosition ?? null,
    paused,
    waitingGate: input.waitingGate
      ? { kind: input.waitingGate.kind, deadlineAt: input.waitingGate.deadlineAt ?? null }
      : null,
    deliverables,
    walkthrough,
    failureCode: input.failureCode ?? null,
    resumable,
    queuedNotes: input.queuedNotes ?? 0,
    decisions: input.decisions ?? [],
    deliveryLabel: input.deliveryLabel ?? null,
    actions: runCardActions({
      state: input.state,
      paused,
      resumable,
      hasDeliverable: deliverables.length > 0,
      walkthroughFailed: walkthrough?.status === "failed",
    }),
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
  "run.resumed",
  "step.started",
  "step.finished",
  "phase.skipped",
  "claim.progress",
  "usage.tick",
  "cost.final",
  "cost.refunded",
  // P1.05 — gate kinds/deadlines (ids/enums/dates only) for the waiting_gate card, and the steering
  // markers (`steer.paused` → the paused variant; `steer.queued` → the queued-note count).
  "gate.opened",
  "gate.resolved",
  "gate.expired",
  "steer.paused",
  "steer.queued",
];

interface DeriveOptions {
  /** the full ordered phase list for the run's workflow (§6.2), so pending/off phases show before they start. */
  readonly phaseKeys?: readonly string[];
  /** phases the rigor notch turned off (REQ-IDE-12), rendered greyed "off". */
  readonly offPhases?: readonly string[];
  readonly capCredits?: number;
  readonly elapsedMs?: number;
  readonly etaBand?: { readonly lowMin: number; readonly highMin: number };
  /** P1.05 — SQL-side facts the event stream does not carry (estimate, queue position, deliverables,
   *  walkthrough, failure code, resumability, undelivered queued-note count). */
  readonly estimateCredits?: number;
  readonly queuePosition?: number | null;
  readonly paused?: boolean;
  readonly deliverables?: readonly DeliverableChip[];
  readonly walkthrough?: WalkthroughState;
  readonly failureCode?: string | null;
  readonly resumable?: boolean;
  readonly queuedNotes?: number;
  /** P1.09 — SQL-side decision rows (the event stream carries only gate ids/enums). */
  readonly decisions?: readonly GateDecisionView[];
  /** RES.2 — SQL-side `runs.delivery.label`; the event stream never carries it (write-once, read once). */
  readonly deliveryLabel?: "unverified" | null;
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
  // RPT.1 — a `usage.tick` may carry `provisional:true` (mid-phase proxy-metered reading); the
  // completion tick + `cost.final` are committed figures and clear it.
  let provisional = false;
  // P1.05 — the waiting-gate kind/deadline (the latest UNRESOLVED gate.opened) + the steering markers.
  let waitingGate: { kind: string; deadlineAt: string | null } | null = null;
  let paused = opts.paused === true;

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
      case "usage.tick": {
        const s = num(p["spentCredits"]);
        const c = num(p["capCredits"]);
        if (s != null) spent = s;
        if (c != null) cap = c;
        provisional = p["provisional"] === true;
        break;
      }
      case "cost.final": {
        const s = num(p["spentCredits"]);
        const c = num(p["capCredits"]);
        if (s != null) spent = s;
        if (c != null) cap = c;
        provisional = false; // the final figure is committed, never provisional
        break;
      }
      case "cost.refunded": {
        // PRB.08 — the "refunded N credits" line: sum every refund row's whitelisted credits count.
        const r = num(p["credits"]);
        if (r != null) refunded += r;
        break;
      }
      case "gate.opened": {
        const kind = str(p["kind"]);
        if (kind) waitingGate = { kind, deadlineAt: str(p["deadlineAt"]) ?? null };
        break;
      }
      case "gate.resolved":
      case "gate.expired": {
        waitingGate = null;
        break;
      }
      case "steer.paused": {
        paused = true;
        break;
      }
      case "run.resumed": {
        paused = false;
        break;
      }
      case "steer.queued": {
        // whitelisted so the event is acknowledged, but the queued-note COUNT is SQL-side (`queuedNotes`
        // option) — a delivered note must stop counting, and only the guidance rows know `consumed_by`.
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
    // RPT.1 — always present (a committed/final figure explicitly clears the provisional marker).
    provisional,
    ...(opts.elapsedMs != null ? { elapsedMs: opts.elapsedMs } : {}),
    ...(opts.etaBand != null ? { etaBand: opts.etaBand } : {}),
    ...(opts.estimateCredits != null ? { estimateCredits: opts.estimateCredits } : {}),
    ...(opts.queuePosition !== undefined ? { queuePosition: opts.queuePosition } : {}),
    paused,
    ...(waitingGate ? { waitingGate } : {}),
    ...(opts.deliverables ? { deliverables: opts.deliverables } : {}),
    ...(opts.walkthrough ? { walkthrough: opts.walkthrough } : {}),
    ...(opts.failureCode !== undefined ? { failureCode: opts.failureCode } : {}),
    ...(opts.resumable != null ? { resumable: opts.resumable } : {}),
    queuedNotes: opts.queuedNotes ?? 0,
    ...(opts.decisions ? { decisions: opts.decisions } : {}),
    ...(opts.deliveryLabel != null ? { deliveryLabel: opts.deliveryLabel } : {}),
  };
}

// -------------------------------------------------------------------------------------------------------------------
// P1.05 — the running card's ETA band (ledger K4; §5.5 "starts when …" / "≈ 6–9 min left").

/** A committed step's duration fact for the parametric ETA. */
export interface EtaStepFact {
  readonly durationMs: number | null;
}

/** Flat per-phase duration prior when the run has no committed-step history yet (the parametric model
 *  until cross-run samples exist — ledger K4). EST.1 — the constants live in contracts/durations.ts so
 *  the sheet's, the protocol card's and this card's prior can never drift apart. */
const ETA_PRIOR_MS_PER_PHASE = PHASE_DURATION_PRIOR_MINUTES * 60 * 1000;

/**
 * The running card's ETA band (§5.5; ledger K4): the mean committed-step duration this run × the phases
 * still to run (`pending`/`running`; `off` phases never run). Band = [0.8×, 1.5×] that projection —
 * honest uncertainty, whole minutes (the shared `durationPriorForPhases` fractions). With no committed
 * history the flat prior stands in. Null when the run isn't running or nothing remains.
 */
export function etaBandForPhases(
  phases: readonly PhaseProgress[],
  stepFacts: readonly EtaStepFact[],
): { readonly lowMin: number; readonly highMin: number } | null {
  const remaining = phases.filter((p) => p.status === "pending" || p.status === "running").length;
  if (remaining === 0) return null;
  const durations = stepFacts.map((s) => s.durationMs).filter((d): d is number => d != null && d > 0);
  const meanMs = durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : ETA_PRIOR_MS_PER_PHASE;
  const lowMin = Math.max(1, Math.round((meanMs * remaining * DURATION_PRIOR_LOW_FRACTION) / 60000));
  const highMin = Math.max(lowMin + 1, Math.round((meanMs * remaining * DURATION_PRIOR_HIGH_FRACTION) / 60000));
  return { lowMin, highMin };
}
