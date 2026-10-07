import type { ReactNode } from "react";
import type {
  RunCardView,
  PhaseProgress,
  PhaseStatus,
  FeedDensity,
  RunCardAction,
  GateDecisionView,
} from "@rhema/findings-core";

// The run card + live feed (§5.5; REQ-IDE-11/12/14; P1.05 §6.5 steering). The card renders ONLY the
// orchestrator-derived `RunCardView` (built by findings-core from whitelisted events) — it invents no
// progress text, so no element can derive from agent-authored text. Opt-out phases render greyed "off"
// (REQ-IDE-12). Steering affordances are plain form POSTs (no-JS-safe); the note field's TEXT is the only
// user input and never renders back onto the card. Text-agnostic.

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
  // ---- P1.05 (§5.5 state cards; §6.5 steering) — all optional; absent ⇒ the block hides. ----
  /** a queued run's position line, e.g. (pos) => "2nd in line — starts when the run ahead finishes". */
  readonly queueLabel?: (position: number) => string;
  /** the completed card's actual-vs-estimate line, e.g. "412 cr spent · est. 1,240". */
  readonly estimateLabel?: (actual: number, estimate: number) => string;
  /** the steering-park line, e.g. (done, total) => "Paused after phase 3 of 7". */
  readonly pausedLabel?: (done: number, total: number) => string;
  /** the partials line on a completed_partial/failed/cancelled card, e.g. "partial (3/6 phases)". */
  readonly partialLabel?: (done: number, total: number) => string;
  /** the approval wait line, e.g. (kind) => "Waiting on you — Approve triage" (+ deadline when set). */
  readonly waitingGateLabel?: (kind: string, deadlineAt: string | null) => string;
  /** the "1 note queued" line on a running card. */
  readonly queuedNotesLabel?: (n: number) => string;
  /** resolve a deliverable chip key ("letter", "findings", "claims", …) to its label. */
  readonly deliverableLabel?: (key: string, count?: number) => string;
  /** resolve a RunCardAction to its button/link label. */
  readonly actionLabel?: (action: RunCardAction) => string;
  /** the note-for-next-phase field's placeholder + submit label (§6.5). */
  readonly notePlaceholder?: string;
  /** the walkthrough block's heading (§5.5 D20). */
  readonly walkthroughHeading?: string;
  /** shown while the walkthrough's one call is in flight. */
  readonly walkthroughPendingLabel?: string;
  /** shown when the walkthrough's call failed (Retry renders beside it). */
  readonly walkthroughFailedLabel?: string;
  /** the run report link label (§14.5). */
  readonly reportLabel?: string;
  /**
   * P1.09 (§6.4 item 8; REQ-RUN-5/6) — the permanent approval-decision line ("approved by you at
   * 14:32 · with 3 changes" / "auto-continued at the deadline" / "skipped by your Run-to-completion
   *  policy"). One per recorded decision on the run.
   */
  readonly decisionLabel?: (decision: GateDecisionView) => string;
  /**
   * RES.2 — the run-level delivery-label line, rendered ABOVE the state/verdict when the persisted
   * label is set (e.g. (label) => "Unverified — research could not check the claims; research credits
   *  were refunded"). Absent ⇒ the slot hides.
   */
  readonly deliveryLabel?: (label: string) => string;
}

/** The POST/GET targets a card's actions submit to (web-supplied; absent ⇒ that affordance hides). */
export interface RunCardHrefs {
  readonly pause?: string;
  readonly stop?: string;
  readonly cancel?: string;
  readonly resume?: string;
  readonly note?: string;
  readonly report?: string;
  readonly deliverable?: string;
  readonly retryWalkthrough?: string;
  readonly gate?: string;
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

function ActionButton({
  action,
  href,
  labels,
}: {
  action: RunCardAction;
  href: string | undefined;
  labels: RunCardLabels;
}): ReactNode {
  const label = labels.actionLabel?.(action) ?? action;
  if (action === "live_feed") {
    // opens the Desk's feed tab — the ide island owns the pane state; the href is the no-JS anchor.
    return (
      <a href="#desk" data-ide-open-feed style={{ fontSize: "12px" }}>
        {label}
      </a>
    );
  }
  if (action === "report" || action === "open_deliverable") {
    return href ? (
      <a href={href} data-run-report={action === "report" ? "" : undefined} style={{ fontSize: "12px" }}>
        {label}
      </a>
    ) : null;
  }
  if (!href) return null;
  return (
    <form method="post" action={href} style={{ display: "inline" }}>
      <button type="submit" data-run-action={action} style={{ fontSize: "12px" }}>
        {label}
      </button>
    </form>
  );
}

/** The run card (§5.5): phase list ✓/◐/○ with orchestrator counters, credits vs cap, ETA band — plus the
 *  P1.05 state chrome (queue position, paused/waiting lines, deliverables, walkthrough, steering actions). */
export function RunCard({
  view,
  labels,
  hrefs,
  gateCard,
}: {
  view: RunCardView;
  labels: RunCardLabels;
  hrefs?: RunCardHrefs;
  /**
   * P1.09 (§6.4) — the identical approve-with-deadline card mounted under a `waiting_gate` run card
   * (the Timeline renders the same `GateCard` the Needs-you rows expand to). Absent ⇒ the card keeps
   * its waiting-gate label + link only.
   */
  gateCard?: ReactNode;
}): ReactNode {
  const actionHref = (a: RunCardAction): string | undefined => {
    switch (a) {
      case "pause": return hrefs?.pause;
      case "stop": return hrefs?.stop;
      case "cancel": return hrefs?.cancel;
      case "resume": return hrefs?.resume;
      case "report": return hrefs?.report;
      case "open_deliverable": return hrefs?.deliverable;
      case "retry_walkthrough": return hrefs?.retryWalkthrough;
      case "note": return hrefs?.note;
      case "live_feed": return "#desk";
      default: return undefined;
    }
  };
  return (
    <section
      data-run-card={view.runId}
      data-run-state={view.state}
      {...(view.paused ? { "data-paused": "1" } : {})}
      style={{
        border: "1px solid var(--shell-border)",
        borderRadius: "12px",
        background: "var(--shell-surface)",
        padding: "16px",
      }}
    >
      {/* RES.2 — the persisted run-level delivery label leads the card, above the state/verdict
          (the same slot the dossier + email carry). Never recomputed — `view.deliveryLabel` is the
          committed `runs.delivery` fact. */}
      {view.deliveryLabel && labels.deliveryLabel ? (
        <p
          data-delivery-label={view.deliveryLabel}
          style={{ margin: "0 0 10px", fontSize: "12px", fontWeight: 600, color: "var(--state-running)" }}
        >
          {labels.deliveryLabel(view.deliveryLabel)}
        </p>
      ) : null}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
        <span style={{ fontWeight: 600, fontSize: "14px", color: "var(--shell-fg)" }}>{labels.stateLabel(view.state)}</span>
        <span data-credits style={{ fontSize: "12px", color: "var(--shell-fg-muted)", fontVariantNumeric: "tabular-nums" }}>
          {labels.creditsLabel(view.spentCredits, view.capCredits)}
        </span>
      </div>
      {view.paused && labels.pausedLabel ? (
        <p data-paused-line style={{ margin: "0 0 8px", fontSize: "12px", color: "var(--state-running)" }}>
          {labels.pausedLabel(view.done, view.total)}
        </p>
      ) : null}
      {!view.paused && view.waitingGate && labels.waitingGateLabel ? (
        <p data-waiting-gate style={{ margin: "0 0 8px", fontSize: "12px", color: "var(--state-running)" }}>
          {hrefs?.gate ? (
            <a href={hrefs.gate}>{labels.waitingGateLabel(view.waitingGate.kind, view.waitingGate.deadlineAt)}</a>
          ) : (
            labels.waitingGateLabel(view.waitingGate.kind, view.waitingGate.deadlineAt)
          )}
        </p>
      ) : null}
      {(view.state === "completed_partial" || view.state === "failed" || view.state === "cancelled") &&
      labels.partialLabel ? (
        <p data-partial-line style={{ margin: "0 0 8px", fontSize: "12px", color: "var(--shell-fg-muted)" }}>
          {labels.partialLabel(view.done, view.total)}
        </p>
      ) : null}
      {view.queuePosition != null && labels.queueLabel ? (
        <p data-queue-position style={{ margin: "0 0 8px", fontSize: "12px", color: "var(--shell-fg-muted)" }}>
          {labels.queueLabel(view.queuePosition)}
        </p>
      ) : null}
      <div aria-hidden="true" style={{ height: "4px", borderRadius: "999px", background: "var(--shell-raised)", overflow: "hidden", marginBottom: "12px" }}>
        <div data-credit-meter style={{ width: `${Math.round(view.creditFraction * 100)}%`, height: "100%", background: "var(--state-running)" }} />
      </div>
      <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {view.phases.map((p) => (
          <PhaseRow key={p.key} phase={p} labels={labels} />
        ))}
      </ul>
      {view.estimateCredits != null && labels.estimateLabel ? (
        <p data-estimate style={{ marginTop: "10px", marginBottom: 0, fontSize: "12px", color: "var(--shell-fg-muted)", fontVariantNumeric: "tabular-nums" }}>
          {labels.estimateLabel(view.spentCredits, view.estimateCredits)}
        </p>
      ) : null}
      {view.queuedNotes > 0 && labels.queuedNotesLabel ? (
        <p data-queued-notes style={{ marginTop: "6px", marginBottom: 0, fontSize: "12px", color: "var(--shell-fg-muted)" }}>
          {labels.queuedNotesLabel(view.queuedNotes)}
        </p>
      ) : null}
      {view.deliverables.length > 0 && labels.deliverableLabel ? (
        <ul data-deliverables style={{ listStyle: "none", display: "flex", flexWrap: "wrap", gap: "6px", margin: "10px 0 0", padding: 0 }}>
          {view.deliverables.map((d, i) => (
            <li key={`${d.key}-${i}`} data-deliverable={d.key} style={{ fontSize: "12px", padding: "2px 8px", borderRadius: "999px", border: "1px solid var(--shell-border)", color: "var(--shell-fg-muted)" }}>
              {labels.deliverableLabel!(d.key, d.count)}
            </li>
          ))}
        </ul>
      ) : null}
      {view.walkthrough ? (
        <div data-walkthrough={view.walkthrough.status} style={{ marginTop: "10px", fontSize: "13px" }}>
          {labels.walkthroughHeading ? (
            <p style={{ margin: "0 0 4px", fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--shell-fg-muted)" }}>
              {labels.walkthroughHeading}
            </p>
          ) : null}
          {view.walkthrough.status === "ready" ? (
            <p style={{ margin: 0, color: "var(--shell-fg)" }}>{view.walkthrough.text}</p>
          ) : view.walkthrough.status === "failed" ? (
            <p style={{ margin: 0, color: "var(--shell-fg-muted)", fontSize: "12px" }}>{labels.walkthroughFailedLabel ?? ""}</p>
          ) : (
            <p style={{ margin: 0, color: "var(--shell-fg-muted)", fontSize: "12px" }}>{labels.walkthroughPendingLabel ?? ""}</p>
          )}
        </div>
      ) : null}
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
      {view.actions.length > 0 ? (
        <div data-run-actions style={{ display: "flex", flexWrap: "wrap", gap: "10px", alignItems: "center", marginTop: "12px" }}>
          {view.actions
            .filter((a) => a !== "note")
            .map((a) => (
              <ActionButton key={a} action={a} href={actionHref(a)} labels={labels} />
            ))}
        </div>
      ) : null}
      {view.actions.includes("note") && hrefs?.note ? (
        <form method="post" action={hrefs.note} data-run-note style={{ display: "flex", gap: "6px", marginTop: "10px" }}>
          <input
            type="text"
            name="text"
            placeholder={labels.notePlaceholder ?? ""}
            style={{ flex: 1, fontSize: "12px", padding: "4px 8px", borderRadius: "8px", border: "1px solid var(--shell-border)", background: "var(--shell-raised)", color: "var(--shell-fg)" }}
          />
          <button type="submit" style={{ fontSize: "12px" }}>
            {labels.actionLabel?.("note") ?? "note"}
          </button>
        </form>
      ) : null}
      {/* P1.09 — the identical §6.4 approval card inline on the waiting run (same fields, same
          anatomy as the Needs-you sheet's card). */}
      {gateCard ?? null}
      {/* P1.09 — the permanent decision record (§6.4 item 8): one line per resolved approval.
          `view` crosses a cast DTO boundary (timeline.tsx) — a pre-P1.09 card may lack `decisions`. */}
      {(view.decisions?.length ?? 0) > 0 && labels.decisionLabel ? (
        <ul data-run-decisions style={{ listStyle: "none", margin: "10px 0 0", padding: "8px 0 0", borderTop: "1px solid var(--shell-border)", fontSize: "12px", color: "var(--shell-fg-muted)", display: "flex", flexDirection: "column", gap: "2px" }}>
          {view.decisions.map((d) => (
            <li key={d.id} data-decision={d.id} data-action={d.action} data-by={d.byActor}>
              {labels.decisionLabel!(d)}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

// ---------------------------------------------------------------- live feed (§5.5; REQ-IDE-14)

/** A feed row the app has already resolved to a label + optional numeric detail (no agent prose).
 *  `density` is the CONTRACT density (summary|normal|verbose) — the island uses it for the density
 *  tabs' show/hide; SSR pre-filters with findings-core's `filterFeed`. */
export interface FeedRow {
  readonly type: string;
  readonly label: string;
  readonly detail?: string;
  readonly density?: string;
}

export interface LiveFeedLabels {
  readonly densityLabel: (density: FeedDensity) => string;
  readonly heading: string;
}

/**
 * The live feed (§5.5) at a chosen density. The rows are pre-filtered + pre-labelled by findings-core
 * (`filterFeed`) + the app's copy table — the component renders labels and numeric details only, never raw
 * event free text (REQ-IDE-14). The density tabs carry `data-feed-density` for the island's live re-filter.
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
      <div role="group" aria-label={labels.heading} style={{ display: "flex", gap: "8px", margin: "4px 0" }}>
        {(["summary", "details", "verbose"] as const).map((d) => (
          // Verbose lives behind the Advanced disclosure (§5.5) — data-tier hides it until ⌘⇧M.
          <button key={d} type="button" data-feed-density={d} {...(d === "verbose" ? { "data-tier": "advanced" } : {})} aria-pressed={d === density} style={{ fontSize: "11px" }}>
            {labels.densityLabel(d)}
          </button>
        ))}
      </div>
      <ul data-feed-rows style={{ listStyle: "none", margin: "8px 0 0", padding: 0 }}>
        {rows.map((r, i) => (
          <li key={i} data-feed-event={r.type} {...(r.density ? { "data-feed-density-row": r.density } : {})} style={{ display: "flex", gap: "10px", padding: "4px 0", fontSize: "13px", color: "var(--shell-fg)" }}>
            <span>{r.label}</span>
            {r.detail ? <span style={{ color: "var(--shell-fg-muted)", fontVariantNumeric: "tabular-nums" }}>{r.detail}</span> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
