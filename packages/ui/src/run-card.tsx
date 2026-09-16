import type { ReactNode } from "react";
import type { RunCardView, PhaseProgress, PhaseStatus, FeedDensity } from "@rhema/findings-core";

// The run card + live feed (§5.5; REQ-IDE-11/12/14). The card renders ONLY the orchestrator-derived
// `RunCardView` (built by findings-core from whitelisted events) — it invents no progress text, so no element
// can derive from agent-authored text. Opt-out phases render greyed "off" (REQ-IDE-12). Text-agnostic.

const GLYPH: Record<PhaseStatus, string> = {
  done: "✓",
  running: "◐",
  pending: "○",
  skipped: "○",
  off: "○",
};

export interface RunCardLabels {
  /** resolve a controlled workflow-phase key (§6.2) to its user-facing name. */
  readonly phaseLabel: (key: string) => string;
  /** resolve a canonical run state to its user-facing label. */
  readonly stateLabel: (state: string) => string;
  /** e.g. (spent, cap) => "412 / 1,860 cr". */
  readonly creditsLabel: (spent: number, cap: number) => string;
  /** e.g. (low, high) => "~25–40 min". */
  readonly etaLabel?: (lowMin: number, highMin: number) => string;
  /** the "off" tag for an opt-out phase (REQ-IDE-12). */
  readonly offLabel: string;
  /** e.g. (value, of?) => "23 / 56" for a phase counter. */
  readonly counterLabel?: (key: string, value: number, of?: number) => string;
  /** PRB.08 — e.g. (credits) => "refunded 312 credits; partial results kept" (shown when a run's debits came
   *  back: a failed/refused/cancelled run or a reconciliation silent-refund). */
  readonly refundLabel?: (credits: number) => string;
}

function PhaseRow({ phase, labels }: { phase: PhaseProgress; labels: RunCardLabels }): ReactNode {
  const off = phase.status === "off";
  return (
    <li
      data-phase={phase.key}
      data-phase-status={phase.status}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "8px",
        padding: "3px 0",
        color: off ? "var(--shell-fg-faint)" : "var(--shell-fg)",
        fontSize: "13px",
      }}
    >
      <span aria-hidden="true" style={{ width: "14px", color: phase.status === "running" ? "var(--state-running)" : phase.status === "done" ? "var(--state-ready)" : "var(--shell-fg-faint)" }}>
        {GLYPH[phase.status]}
      </span>
      <span>{labels.phaseLabel(phase.key)}</span>
      {off ? <span style={{ color: "var(--shell-fg-faint)", fontSize: "12px" }}>{labels.offLabel}</span> : null}
      {phase.counters?.map((c) => (
        <span key={c.key} data-counter={c.key} style={{ color: "var(--shell-fg-muted)", fontVariantNumeric: "tabular-nums", fontSize: "12px" }}>
          {labels.counterLabel ? labels.counterLabel(c.key, c.value, c.of) : c.of != null ? `${c.value} / ${c.of}` : String(c.value)}
        </span>
      ))}
    </li>
  );
}

/** The run card (§5.5): phase list ✓/◐/○ with orchestrator counters, credits vs cap, ETA band. */
export function RunCard({ view, labels }: { view: RunCardView; labels: RunCardLabels }): ReactNode {
  return (
    <section
      data-run-card={view.runId}
      data-run-state={view.state}
      style={{
        border: "1px solid var(--shell-border)",
        borderRadius: "12px",
        background: "var(--shell-surface)",
        padding: "16px",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
        <span style={{ fontWeight: 600, fontSize: "14px", color: "var(--shell-fg)" }}>{labels.stateLabel(view.state)}</span>
        <span data-credits style={{ fontSize: "12px", color: "var(--shell-fg-muted)", fontVariantNumeric: "tabular-nums" }}>
          {labels.creditsLabel(view.spentCredits, view.capCredits)}
        </span>
      </div>
      <div aria-hidden="true" style={{ height: "4px", borderRadius: "999px", background: "var(--shell-raised)", overflow: "hidden", marginBottom: "12px" }}>
        <div data-credit-meter style={{ width: `${Math.round(view.creditFraction * 100)}%`, height: "100%", background: "var(--state-running)" }} />
      </div>
      <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {view.phases.map((p) => (
          <PhaseRow key={p.key} phase={p} labels={labels} />
        ))}
      </ul>
      {view.refundedCredits > 0 && labels.refundLabel ? (
        <p data-refund style={{ marginTop: "10px", fontSize: "12px", color: "var(--shell-fg-muted)" }}>
          {labels.refundLabel(view.refundedCredits)}
        </p>
      ) : null}
      {view.etaBand && labels.etaLabel ? (
        <p data-eta style={{ marginTop: "10px", fontSize: "12px", color: "var(--shell-fg-muted)" }}>
          {labels.etaLabel(view.etaBand.lowMin, view.etaBand.highMin)}
        </p>
      ) : null}
    </section>
  );
}

// ---------------------------------------------------------------- live feed (§5.5; REQ-IDE-14)

/** A feed row the app has already resolved to a label + optional numeric detail (no agent prose). */
export interface FeedRow {
  readonly type: string;
  readonly label: string;
  readonly detail?: string;
}

export interface LiveFeedLabels {
  readonly densityLabel: (density: FeedDensity) => string;
  readonly heading: string;
}

/**
 * The live feed (§5.5) at a chosen density. The rows are pre-filtered + pre-labelled by findings-core
 * (`filterFeed`) + the app's copy table — the component renders labels and numeric details only, never raw
 * event free text (REQ-IDE-14).
 */
export function LiveFeed({
  density,
  rows,
  labels,
}: {
  density: FeedDensity;
  rows: readonly FeedRow[];
  labels: LiveFeedLabels;
}): ReactNode {
  return (
    <section data-live-feed="true" data-density={density} aria-label={labels.heading}>
      <h3 style={{ fontSize: "13px", textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--shell-fg-muted)" }}>
        {labels.heading} · {labels.densityLabel(density)}
      </h3>
      <ul style={{ listStyle: "none", margin: "8px 0 0", padding: 0 }}>
        {rows.map((r, i) => (
          <li key={i} data-feed-event={r.type} style={{ display: "flex", gap: "10px", padding: "4px 0", fontSize: "13px", color: "var(--shell-fg)" }}>
            <span>{r.label}</span>
            {r.detail ? <span style={{ color: "var(--shell-fg-muted)", fontVariantNumeric: "tabular-nums" }}>{r.detail}</span> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
