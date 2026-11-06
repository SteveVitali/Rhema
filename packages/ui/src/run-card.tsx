import type { CSSProperties, ReactNode } from "react";
import type {
  RunCardView,
  PhaseProgress,
  PhaseStatus,
  FeedDensity,
  RunCardAction,
  GateDecisionView,
} from "@rhema/findings-core";
import { Button } from "./primitives/button.js";
import { Chip } from "./primitives/chips.js";
import { TextField } from "./primitives/fields.js";

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
  /** RPT.1 — `provisional` marks a mid-phase metered reading (the label renders the ≈ marker). */
  readonly creditsLabel: (spent: number, cap: number, provisional?: boolean) => string;
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
  /**
   * R7COPY.0 (REQ-COPY-4; ADR-130) — the record-composed "What it delivered" block's heading
   * (replaces the retired model-written walkthrough's labels).
   */
  readonly deliveredHeading?: string;
  /** the counts line, e.g. (counts) => "5 findings · 1 strength · 6 claims". */
  readonly deliveredCountsLabel?: (counts: {
    findings: number;
    strengths: number;
    claims: number;
  }) => string;
  /** a delivered link's label, e.g. (key) => "Dossier" / "Letter" / "Claims ledger". */
  readonly deliveredLinkLabel?: (key: string) => string;
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
  // ---- R7DEM.5 (REQ-DWEB-15 render; S-9) — the replayed-run labels. All optional; absent ⇒ the
  // demo label arm hides and the card renders the live-run chrome only. ----
  /** the replayed-run badge, e.g. "Replayed from the agent-discourse record". */
  readonly replayedBadge?: string;
  /** the per-phase provenance label, e.g. "inferred from the delivered files". */
  readonly phaseInferredLabel?: string;
  /** the approvals slot's honest empty, e.g. "approvals not recorded". */
  readonly approvalsNotRecordedLabel?: string;
  /** one "not recorded" field label, e.g. (field) => "time not recorded". */
  readonly notRecordedLabel?: (field: string) => string;
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
  /** R7COPY.0 — resolve a delivered-summary link key ("dossier" | "letter" | "ledger") to its href. */
  readonly deliveredLink?: (key: string) => string;
  readonly gate?: string;
}

function PhaseRow({
  phase,
  labels,
  inferredLabel,
}: {
  phase: PhaseProgress;
  labels: RunCardLabels;
  /** R7DEM.5 — set on a replayed card: the row's "inferred from the delivered files" tag. */
  inferredLabel?: string;
}): ReactNode {
  const off = phase.status === "off";
  return (
    <li
      data-phase={phase.key}
      data-phase-status={phase.status}
      className={`ui-d-p2 ui-d-acts ui-d-fd${off ? " ui-d-i" : ""}`}
      style={{ display: "flex", alignItems: "center" }}
    >
      <span
        aria-hidden="true"
        className="ui-d-w14 ui-d-sc"
        style={
          {
            "--d-sev":
              phase.status === "running"
                ? "var(--state-running)"
                : phase.status === "done"
                  ? "var(--state-ready)"
                  : "var(--shell-fg-faint)",
          } as CSSProperties
        }
      >
        {GLYPH[phase.status]}
      </span>
      <span>{labels.phaseLabel(phase.key)}</span>
      {off ? <span className="ui-d-i">{labels.offLabel}</span> : null}
      {inferredLabel != null ? (
        <span data-phase-inferred className="ui-d-i ui-d-it">
          {inferredLabel}
        </span>
      ) : null}
      {phase.counters?.map((c) => (
        <span
          key={c.key}
          data-counter={c.key}
          className="ui-d-l"
          style={{ fontVariantNumeric: "tabular-nums" }}
        >
          {labels.counterLabel
            ? labels.counterLabel(c.key, c.value, c.of)
            : c.of != null
              ? `${c.value} / ${c.of}`
              : String(c.value)}
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
      <a href="#desk" data-ide-open-feed className="ui-d-l">
        {label}
      </a>
    );
  }
  if (action === "report" || action === "open_deliverable") {
    return href ? (
      <a
        href={href}
        data-run-report={action === "report" ? "" : undefined}
        className="ui-d-l"
      >
        {label}
      </a>
    ) : null;
  }
  if (!href) return null;
  return (
    <form method="post" action={href} style={{ display: "inline" }}>
      <Button type="submit" size="sm" data-run-action={action}>
        {label}
      </Button>
    </form>
  );
}

/** The run card (§5.5): phase list ✓/◐/○ with orchestrator counters, credits vs cap, ETA band — plus the
 *  P1.05 state chrome (queue position, paused/waiting lines, deliverables, the delivered block,
 *  steering actions). */
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
      case "pause":
        return hrefs?.pause;
      case "stop":
        return hrefs?.stop;
      case "cancel":
        return hrefs?.cancel;
      case "resume":
        return hrefs?.resume;
      case "report":
        return hrefs?.report;
      case "open_deliverable":
        return hrefs?.deliverable;
      case "note":
        return hrefs?.note;
      case "live_feed":
        return "#desk";
      default:
        return undefined;
    }
  };
  return (
    <section
      data-run-card={view.runId}
      data-run-state={view.state}
      {...(view.paused ? { "data-paused": "1" } : {})}
      className="ui-vc-card ui-d-rc"
      style={{ border: "1px solid var(--shell-border)" }}
    >
      {/* RES.2 — the persisted run-level delivery label leads the card, above the state/verdict
          (the same slot the dossier + email carry). Never recomputed — `view.deliveryLabel` is the
          committed `runs.delivery` fact. */}
      {view.deliveryLabel && labels.deliveryLabel ? (
        <p
          data-delivery-label={view.deliveryLabel}
          className="ui-c2-m0 ui-d-mb10 ui-d-b ui-d-fs ui-d-run"
        >
          {labels.deliveryLabel(view.deliveryLabel)}
        </p>
      ) : null}
      {/* R7DEM.5 (REQ-DWEB-15 render; S-9) — the replayed-run arms. A `ReplayedRunCardView`
          arrives structurally inside `view` (additive fields): the badge names the record, each
          phase row carries the "inferred" label, the approvals slot shows PROVENANCE facts or
          "approvals not recorded", and the fields the record never held read "not recorded". */}
      {"replayed" in view && view.replayed === true && labels.replayedBadge ? (
        <p data-replayed-badge className="ui-c2-m0 ui-d-mb10 ui-d-b ui-d-l">
          {labels.replayedBadge}
        </p>
      ) : null}
      {"approvals" in view && view.approvals === "not_recorded" && labels.approvalsNotRecordedLabel ? (
        <p data-approvals-not-recorded className="ui-c2-m0 ui-d-mb10 ui-d-l">
          {labels.approvalsNotRecordedLabel}
        </p>
      ) : null}
      {"approvals" in view && Array.isArray(view.approvals)
        ? view.approvals.map((a, i) => (
            <p
              key={`approval-${i}`}
              data-replayed-approval
              className="ui-c2-m0 ui-d-mt6 ui-d-l"
            >
              {a.round}: {a.decision}
              {a.note != null ? ` — ${a.note}` : ""}
            </p>
          ))
        : null}
      {"notRecorded" in view && Array.isArray(view.notRecorded) && labels.notRecordedLabel ? (
        <p data-not-recorded className="ui-c2-m0 ui-d-mb10 ui-d-l">
          {(view.notRecorded as readonly string[]).map((f) => labels.notRecordedLabel!(f)).join(" · ")}
        </p>
      ) : null}
      <div
        className="ui-c2-mb"
        style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}
      >
        <span className="ui-d-b ui-d-fs14">{labels.stateLabel(view.state)}</span>
        {/* R7DEM.4b — the demo twin's replayed runs carry null credit fields ("not recorded",
            S-9); a row without a meter reading renders no credit line, never a crash. */}
        {view.spentCredits != null && view.capCredits != null ? (
          <span
            data-credits
            {...(view.provisional ? { "data-provisional": "true" } : {})}
            className="ui-d-l"
            style={{ fontVariantNumeric: "tabular-nums" }}
          >
            {labels.creditsLabel(view.spentCredits, view.capCredits, view.provisional)}
          </span>
        ) : null}
      </div>
      {view.paused && labels.pausedLabel ? (
        <p
          data-paused-line
          className="ui-c2-m0 ui-c2-mb ui-d-fs ui-d-run"
        >
          {labels.pausedLabel(view.done, view.total)}
        </p>
      ) : null}
      {!view.paused && view.waitingGate && labels.waitingGateLabel ? (
        <p
          data-waiting-gate
          className="ui-c2-m0 ui-c2-mb ui-d-fs ui-d-run"
        >
          {hrefs?.gate ? (
            <a href={hrefs.gate}>
              {labels.waitingGateLabel(view.waitingGate.kind, view.waitingGate.deadlineAt)}
            </a>
          ) : (
            labels.waitingGateLabel(view.waitingGate.kind, view.waitingGate.deadlineAt)
          )}
        </p>
      ) : null}
      {(view.state === "completed_partial" ||
        view.state === "failed" ||
        view.state === "cancelled") &&
      labels.partialLabel ? (
        <p data-partial-line className="ui-c2-m0 ui-c2-mb ui-d-l">
          {labels.partialLabel(view.done, view.total)}
        </p>
      ) : null}
      {view.queuePosition != null && labels.queueLabel ? (
        <p data-queue-position className="ui-c2-m0 ui-c2-mb ui-d-l">
          {labels.queueLabel(view.queuePosition)}
        </p>
      ) : null}
      <div aria-hidden="true" className="ui-d-meter">
        <div
          data-credit-meter
          className="ui-d-fill"
          style={{ "--d-fill": `${Math.round(view.creditFraction * 100)}%` } as CSSProperties}
        />
      </div>
      <ul className="ui-c2-m0 ui-d-p0" style={{ listStyle: "none" }}>
        {view.phases.map((p) => (
          <PhaseRow
            key={p.key}
            phase={p}
            labels={labels}
            {...("phaseSource" in view && view.phaseSource != null && labels.phaseInferredLabel != null
              ? { inferredLabel: labels.phaseInferredLabel }
              : {})}
          />
        ))}
      </ul>
      {view.estimateCredits != null && view.spentCredits != null && labels.estimateLabel ? (
        <p
          data-estimate
          className="ui-c2-m0 ui-d-mt10 ui-d-l"
          style={{ fontVariantNumeric: "tabular-nums" }}
        >
          {labels.estimateLabel(view.spentCredits, view.estimateCredits)}
        </p>
      ) : null}
      {view.queuedNotes > 0 && labels.queuedNotesLabel ? (
        <p data-queued-notes className="ui-c2-m0 ui-d-mt6 ui-d-l">
          {labels.queuedNotesLabel(view.queuedNotes)}
        </p>
      ) : null}
      {view.deliverables.length > 0 && labels.deliverableLabel ? (
        <ul
          data-deliverables
          className="ui-d-mt10 ui-d-g6 ui-d-p0"
          style={{ listStyle: "none", display: "flex", flexWrap: "wrap" }}
        >
          {view.deliverables.map((d, i) => (
            // C6 — a static deliverable token: no handler, no pointer, no dropdown affordance.
            <li key={`${d.key}-${i}`} data-deliverable={d.key}>
              <Chip variant="static" label={labels.deliverableLabel!(d.key, d.count)} />
            </li>
          ))}
        </ul>
      ) : null}
      {/* R7COPY.0 (REQ-COPY-4) — the record-composed "What it delivered": the letter's verdict
          line quoted verbatim (never rendered when the record has no verdict section), the
          one-rule counts (REQ-SYNC-2), and the dossier/letter/ledger links. Nothing generated —
          a stored `runs.walkthrough` never renders here (ADR-130). */}
      {view.delivered ? (
        <div data-delivered-summary className="ui-d-mt10 ui-d-fd">
          {labels.deliveredHeading ? (
            <p className="ui-c2-m0 ui-d-mb10 ui-d-cap ui-d-l">{labels.deliveredHeading}</p>
          ) : null}
          {view.delivered.verdict != null ? (
            <p data-delivered-verdict className="ui-c2-m0 ui-d-it">
              “{view.delivered.verdict}”
            </p>
          ) : null}
          {labels.deliveredCountsLabel ? (
            <p
              data-delivered-counts
              className="ui-c2-m0 ui-d-mt6 ui-d-l"
              style={{ fontVariantNumeric: "tabular-nums" }}
            >
              {labels.deliveredCountsLabel(view.delivered.counts)}
            </p>
          ) : null}
          {view.delivered.links.length > 0 && hrefs?.deliveredLink && labels.deliveredLinkLabel ? (
            <p data-delivered-links className="ui-c2-m0 ui-d-mt6 ui-d-fs">
              {view.delivered.links.map((key, i) => (
                <span key={key}>
                  {i > 0 ? " · " : ""}
                  <a data-delivered-link={key} href={hrefs.deliveredLink!(key)}>
                    {labels.deliveredLinkLabel!(key)}
                  </a>
                </span>
              ))}
            </p>
          ) : null}
        </div>
      ) : null}
      {view.refundedCredits > 0 && labels.refundLabel ? (
        <p data-refund className="ui-d-mt10 ui-d-l">
          {labels.refundLabel(view.refundedCredits)}
        </p>
      ) : null}
      {view.etaBand && labels.etaLabel ? (
        <p data-eta className="ui-d-mt10 ui-d-l">
          {labels.etaLabel(view.etaBand.lowMin, view.etaBand.highMin)}
        </p>
      ) : null}
      {view.actions.length > 0 ? (
        <div
          data-run-actions
          className="ui-d-mt12 ui-d-g10"
          style={{ display: "flex", flexWrap: "wrap", alignItems: "center" }}
        >
          {view.actions
            .filter((a) => a !== "note")
            .map((a) => (
              <ActionButton key={a} action={a} href={actionHref(a)} labels={labels} />
            ))}
        </div>
      ) : null}
      {view.actions.includes("note") && hrefs?.note ? (
        <form
          method="post"
          action={hrefs.note}
          data-run-note
          className="ui-d-mt10 ui-d-g6"
          style={{ display: "flex" }}
        >
          <TextField
            type="text"
            name="text"
            placeholder={labels.notePlaceholder ?? ""}
            style={{ flex: 1 }}
          />
          <Button type="submit" size="sm">
            {labels.actionLabel?.("note") ?? "note"}
          </Button>
        </form>
      ) : null}
      {/* P1.09 — the identical §6.4 approval card inline on the waiting run (same fields, same
          anatomy as the Needs-you sheet's card). */}
      {gateCard ?? null}
      {/* P1.09 — the permanent decision record (§6.4 item 8): one line per resolved approval.
          `view` crosses a cast DTO boundary (timeline.tsx) — a pre-P1.09 card may lack `decisions`. */}
      {(view.decisions?.length ?? 0) > 0 && labels.decisionLabel ? (
        <ul
          data-run-decisions
          className="ui-d-sect ui-d-l ui-c2-g1 ui-d-p0"
          style={{ listStyle: "none", display: "flex", flexDirection: "column" }}
        >
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
      <h3 className="ui-d-cap ui-d-t">{labels.heading} · {labels.densityLabel(density)}</h3>
      <div
        role="group"
        aria-label={labels.heading}
        className="ui-d-acts ui-set-note"
        style={{ display: "flex" }}
      >
        {(["summary", "details", "verbose"] as const).map((d) => (
          // Verbose lives behind the Advanced disclosure (§5.5) — data-tier hides it until ⌘⇧M.
          <Button
            key={d}
            type="button"
            variant={d === density ? "secondary" : "ghost"}
            size="sm"
            data-feed-density={d}
            {...(d === "verbose" ? { "data-tier": "advanced" } : {})}
            aria-pressed={d === density}
          >
            {labels.densityLabel(d)}
          </Button>
        ))}
      </div>
      <ul data-feed-rows className="ui-c2-mt ui-d-p0" style={{ listStyle: "none" }}>
        {rows.map((r, i) => (
          <li
            key={i}
            data-feed-event={r.type}
            {...(r.density ? { "data-feed-density-row": r.density } : {})}
            className="ui-d-g10 ui-d-p2 ui-d-fd"
            style={{ display: "flex" }}
          >
            <span>{r.label}</span>
            {r.detail ? (
              <span className="ui-d-l" style={{ fontVariantNumeric: "tabular-nums" }}>
                {r.detail}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
