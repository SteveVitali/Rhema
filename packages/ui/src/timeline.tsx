// The Timeline pane's round log (§5.5; P1.05): the next-step card on top, then round cards newest-first —
// `vN` anchor → that round's run cards → the `v(N+1)` it produced — with the collapsed one-line summary
// per round and the Outline/"Imported draft" chip below the oldest round. Run cards render through the
// shared RunCard; every verb/chip label comes from the app's copy table (canonical vocabulary, REQ-SPEC-2).

import type { ReactNode } from "react";
import type {
  TimelineRun,
  TimelineDraft,
  RoundSummaryPart,
  NextStepVerb,
  RunCardView,
} from "@rhema/findings-core";
import { RunCard, type RunCardLabels, type RunCardHrefs } from "./run-card.js";

/** A round as the wire sends it (the api's TimelineDto shape — parts precomputed by findings-core). */
export interface TimelineRoundWire {
  readonly n: number;
  readonly anchor: TimelineDraft | null;
  readonly producedN: number | null;
  readonly parts: readonly RoundSummaryPart[];
  readonly runs: readonly TimelineRun[];
}

export interface TimelineViewWire {
  readonly nextStep: {
    readonly verb: string;
    readonly label: string | null;
    readonly estimateCredits: number | null;
    readonly headDraftN: number | null;
  };
  readonly rounds: readonly TimelineRoundWire[];
  readonly ungrouped: readonly TimelineRun[];
  readonly originChip: { readonly kind: "outline" | "imported_draft" } | null;
}

export interface TimelineLabels {
  /** the next-step card's verbs ("Review v3", "Revise", "Draft v1", "Make an outline", …). */
  readonly nextStepLabel: (verb: NextStepVerb | string, headDraftN: number | null) => string;
  /** the estimate suffix, e.g. (credits) => "est. 1,240 cr". */
  readonly estimateLabel?: (credits: number) => string;
  /** the version chip, e.g. (n) => "v2". */
  readonly versionLabel: (n: number) => string;
  /** the workflow label inside a collapsed summary, e.g. (workflow, count?) => "review (49 findings)". */
  readonly workflowLabel: (workflow: string, count?: number) => string;
  /** the collapsed-summary arrow (§5.5 uses "→"). */
  readonly arrow: string;
  /** the origin chip below the oldest round ("Outline" / "Imported draft"). */
  readonly originChipLabel: (kind: "outline" | "imported_draft") => string;
  /** a run row's workflow + date line, e.g. (workflow, iso) => "Review · Sep 14". */
  readonly runLineLabel?: (workflow: string, createdAt: string) => string;
  /** where the next-step card navigates (the run sheet / live surface). */
  readonly emptyText: string;
  /** the three verbs' labels — canonical vocabulary verbatim ("Draft" / "Review" / "Revise"). */
  readonly verbLabel?: (verb: "draft" | "review" | "revise") => string;
}

export interface TimelineHrefs {
  /** the next-step card's target (the run sheet, the dossier, the live run's anchor). */
  readonly nextStep?: string;
  /** resolve a run id → its report href (the card's Run report link). */
  readonly reportHref?: (runId: string) => string;
  /** resolve a run id → its delivered-dossier href (open_deliverable). */
  readonly deliverableHref?: (runId: string) => string;
  /** resolve a run id → each steering POST target. */
  readonly steeringHref?: (runId: string, action: "pause" | "stop" | "resume" | "note" | "cancel" | "walkthrough") => string;
  /** a waiting_gate run's gate-card href. */
  readonly gateHref?: (runId: string) => string;
  /** a `vN` chip's page href. */
  readonly versionHref?: (n: number) => string;
  /** the run-sheet href for one of the three verbs (§5.5 "each opens the run sheet"). */
  readonly verbHref?: (verb: "draft" | "review" | "revise") => string;
}

function VersionChip({ n, labels, hrefs }: { n: number; labels: TimelineLabels; hrefs?: TimelineHrefs }): ReactNode {
  const text = labels.versionLabel(n);
  const style = { fontSize: "12px", color: "var(--shell-fg-muted)", fontVariantNumeric: "tabular-nums" } as const;
  const href = hrefs?.versionHref?.(n);
  return (
    <span data-version-chip={n} style={style}>
      {href ? <a href={href} style={{ color: "inherit" }}>{text}</a> : text}
    </span>
  );
}

function CollapsedSummary({ parts, labels }: { parts: readonly RoundSummaryPart[]; labels: TimelineLabels }): ReactNode {
  return (
    <p data-round-summary style={{ margin: 0, fontSize: "12px", color: "var(--shell-fg-muted)" }}>
      {parts.map((p, i) => (
        <span key={i}>
          {i > 0 ? ` ${labels.arrow} ` : ""}
          {p.kind === "version" ? labels.versionLabel(p.n) : labels.workflowLabel(p.workflow, p.count)}
        </span>
      ))}
    </p>
  );
}

function cardHrefs(runId: string, hrefs?: TimelineHrefs): RunCardHrefs {
  return {
    pause: hrefs?.steeringHref?.(runId, "pause"),
    stop: hrefs?.steeringHref?.(runId, "stop"),
    cancel: hrefs?.steeringHref?.(runId, "cancel"),
    resume: hrefs?.steeringHref?.(runId, "resume"),
    note: hrefs?.steeringHref?.(runId, "note"),
    retryWalkthrough: hrefs?.steeringHref?.(runId, "walkthrough"),
    report: hrefs?.reportHref?.(runId),
    deliverable: hrefs?.deliverableHref?.(runId),
    gate: hrefs?.gateHref?.(runId),
  };
}

function RunRow({
  run,
  labels,
  cardLabels,
  hrefs,
}: {
  run: TimelineRun;
  labels: TimelineLabels;
  cardLabels: RunCardLabels;
  hrefs?: TimelineHrefs;
}): ReactNode {
  return (
    <li data-timeline-run={run.runId} style={{ marginBottom: "10px" }}>
      {labels.runLineLabel ? (
        <p style={{ margin: "0 0 4px", fontSize: "12px", color: "var(--shell-fg-muted)" }}>
          {labels.runLineLabel(run.workflow, run.createdAt)}
        </p>
      ) : null}
      <RunCard view={run.card as RunCardView} labels={cardLabels} hrefs={cardHrefs(run.runId, hrefs)} />
    </li>
  );
}

/** The Timeline pane's body (§5.5). Rounds newest-first; the ungrouped tail lists after the oldest round. */
export function TimelinePane({
  view,
  labels,
  cardLabels,
  hrefs,
}: {
  view: TimelineViewWire;
  labels: TimelineLabels;
  cardLabels: RunCardLabels;
  hrefs?: TimelineHrefs;
}): ReactNode {
  const next = view.nextStep;
  const nextLabel = labels.nextStepLabel(next.verb, next.headDraftN);
  return (
    <div data-timeline-pane style={{ fontSize: "13px" }}>
      {/* the three verbs (§5.5 header row) — each opens the run sheet for that workflow */}
      {labels.verbLabel && hrefs?.verbHref ? (
        <div data-timeline-verbs style={{ display: "flex", gap: "8px", marginBottom: "12px" }}>
          {(["draft", "review", "revise"] as const).map((v) => (
            <a
              key={v}
              href={hrefs.verbHref!(v)}
              data-verb={v}
              style={{ fontSize: "12px", padding: "3px 10px", borderRadius: "999px", border: "1px solid var(--shell-border)", color: "var(--shell-fg)", textDecoration: "none" }}
            >
              {labels.verbLabel!(v)} ▾
            </a>
          ))}
        </div>
      ) : null}
      {/* the next-step card (§5.5 — above the newest round) */}
      {next.verb !== "none" ? (
        <div data-next-step={next.verb} style={{ border: "1px solid var(--shell-border)", borderRadius: "12px", padding: "12px 16px", marginBottom: "14px", background: "var(--shell-raised)" }}>
          {hrefs?.nextStep ? (
            <a href={hrefs.nextStep} style={{ fontWeight: 600, color: "var(--shell-fg)" }}>
              {nextLabel}
            </a>
          ) : (
            <span style={{ fontWeight: 600 }}>{nextLabel}</span>
          )}
          {next.estimateCredits != null && labels.estimateLabel ? (
            <span style={{ marginLeft: "8px", fontSize: "12px", color: "var(--shell-fg-muted)", fontVariantNumeric: "tabular-nums" }}>
              {labels.estimateLabel(next.estimateCredits)}
            </span>
          ) : null}
        </div>
      ) : null}

      {view.rounds.length === 0 && view.ungrouped.length === 0 ? (
        <p style={{ color: "var(--shell-fg-muted)" }}>{labels.emptyText}</p>
      ) : null}

      {view.rounds.map((round) => (
        <section key={round.n} data-round={round.n} style={{ marginBottom: "16px" }}>
          <CollapsedSummary parts={round.parts} labels={labels} />
          <ul style={{ listStyle: "none", margin: "8px 0", padding: 0 }}>
            {round.runs.map((run) => (
              <RunRow key={run.runId} run={run} labels={labels} cardLabels={cardLabels} hrefs={hrefs} />
            ))}
          </ul>
          {round.anchor ? <VersionChip n={round.anchor.n} labels={labels} hrefs={hrefs} /> : null}
          {round.producedN != null ? (
            <span style={{ fontSize: "12px", color: "var(--shell-fg-muted)" }}>
              {` ${labels.arrow} `}
              <VersionChip n={round.producedN} labels={labels} hrefs={hrefs} />
            </span>
          ) : null}
        </section>
      ))}

      {view.ungrouped.length > 0 ? (
        <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {view.ungrouped.map((run) => (
            <RunRow key={run.runId} run={run} labels={labels} cardLabels={cardLabels} hrefs={hrefs} />
          ))}
        </ul>
      ) : null}

      {view.originChip ? (
        <p data-origin-chip={view.originChip.kind} style={{ marginTop: "8px", fontSize: "12px", color: "var(--shell-fg-faint)" }}>
          {labels.originChipLabel(view.originChip.kind)}
        </p>
      ) : null}
    </div>
  );
}
