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
import { Chip } from "./primitives/chips.js";
import { IconButton } from "./primitives/button.js";

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
    /** EST.1 — the shared duration band the chip renders next to the estimate (calibrated cell,
     *  else the per-phase prior — identical to the run sheet's figure). */
    readonly duration?: { readonly lowMinutes: number; readonly highMinutes: number } | null;
    readonly headDraftN: number | null;
    /**
     * R7HOME.2b (REQ-HOME-2) — the card is dismissible per user per project: `true` ⇒ the card
     *  stays hidden; `dismissAction` is the dismiss form's POST target (server-authored).
     */
    readonly dismissed?: boolean;
    readonly dismissAction?: string;
    /** the dismiss control's accessible label + tooltip (app copy, never a literal here). */
    readonly dismissLabel?: string;
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
  readonly steeringHref?: (
    runId: string,
    action: "pause" | "stop" | "resume" | "note" | "cancel",
  ) => string;
  /** a waiting_gate run's gate-card href. */
  readonly gateHref?: (runId: string) => string;
  /** R7COPY.0 (REQ-COPY-4) — resolve a delivered link key (dossier | letter | ledger) per run. */
  readonly deliveredLinkHref?: (runId: string, key: string) => string;
  /** a `vN` chip's page href. */
  readonly versionHref?: (n: number) => string;
  /** the run-sheet href for one of the three verbs (§5.5 "each opens the run sheet"). */
  readonly verbHref?: (verb: "draft" | "review" | "revise") => string;
}

function VersionChip({
  n,
  labels,
  hrefs,
}: {
  n: number;
  labels: TimelineLabels;
  hrefs?: TimelineHrefs;
}): ReactNode {
  const text = labels.versionLabel(n);
  const href = hrefs?.versionHref?.(n);
  return (
    <span data-version-chip={n} className="ui-d-l" style={{ fontVariantNumeric: "tabular-nums" }}>
      {href ? (
        <a href={href} className="ui-d-inh">
          {text}
        </a>
      ) : (
        text
      )}
    </span>
  );
}

function CollapsedSummary({
  parts,
  labels,
}: {
  parts: readonly RoundSummaryPart[];
  labels: TimelineLabels;
}): ReactNode {
  return (
    <p data-round-summary className="ui-c2-m0 ui-d-l">
      {parts.map((p, i) => (
        <span key={i}>
          {i > 0 ? ` ${labels.arrow} ` : ""}
          {p.kind === "version"
            ? labels.versionLabel(p.n)
            : labels.workflowLabel(p.workflow, p.count)}
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
    report: hrefs?.reportHref?.(runId),
    deliverable: hrefs?.deliverableHref?.(runId),
    deliveredLink: hrefs?.deliveredLinkHref
      ? (key) => hrefs.deliveredLinkHref!(runId, key)
      : undefined,
    gate: hrefs?.gateHref?.(runId),
  };
}

function RunRow({
  run,
  labels,
  cardLabels,
  hrefs,
  renderGateCard,
}: {
  run: TimelineRun;
  labels: TimelineLabels;
  cardLabels: RunCardLabels;
  hrefs?: TimelineHrefs;
  renderGateCard?: (run: TimelineRun) => ReactNode;
}): ReactNode {
  return (
    <li data-timeline-run={run.runId} className="ui-d-mb10">
      {labels.runLineLabel ? (
        <p className="ui-c2-m0 ui-os-mr ui-d-l">
          {labels.runLineLabel(run.workflow, run.createdAt)}
        </p>
      ) : null}
      <RunCard
        view={run.card as RunCardView}
        labels={cardLabels}
        hrefs={cardHrefs(run.runId, hrefs)}
        {...(renderGateCard && run.gate ? { gateCard: renderGateCard(run) } : {})}
      />
    </li>
  );
}

/** The Timeline pane's body (§5.5). Rounds newest-first; the ungrouped tail lists after the oldest round. */
export function TimelinePane({
  view,
  labels,
  cardLabels,
  hrefs,
  renderGateCard,
}: {
  view: TimelineViewWire;
  labels: TimelineLabels;
  cardLabels: RunCardLabels;
  hrefs?: TimelineHrefs;
  /**
   * P1.09 (§6.4) — renders the waiting run's full approve-with-deadline card (the app builds it from
   * `run.gate`, the same DTO the Needs-you surface consumes). Absent ⇒ waiting runs keep their
   * label + link.
   */
  renderGateCard?: (run: TimelineRun) => ReactNode;
}): ReactNode {
  const next = view.nextStep;
  const nextLabel = labels.nextStepLabel(next.verb, next.headDraftN);
  return (
    <div data-timeline-pane className="ui-d-fd">
      {/* the three verbs (§5.5 header row) — each opens the run sheet for that workflow.
          C6/B8: they were pills on plain links with a false dropdown caret — now the Chip
          action variant (a real link, chip styling, no caret). */}
      {labels.verbLabel && hrefs?.verbHref ? (
        <div data-timeline-verbs className="ui-c2-mb ui-d-acts" style={{ display: "flex" }}>
          {(["draft", "review", "revise"] as const).map((v) => (
            <Chip key={v} variant="action" href={hrefs.verbHref!(v)} data-verb={v} label={labels.verbLabel!(v)} />
          ))}
        </div>
      ) : null}
      {/* the next-step card (§5.5 — above the newest round). R7HOME.2b (REQ-HOME-2): it lives
          here in the Timeline tab and is dismissible per user per project — the dismiss is a
          plain form POST (the delegated submit re-issues it as JSON) to the server-authored
          `dismissAction`; a dismissed card never renders. */}
      {next.verb !== "none" && next.dismissed !== true ? (
        <div data-next-step={next.verb} className="ui-vc-card" style={{ border: "1px solid var(--shell-border)" }}>
          {next.dismissAction ? (
            <form
              method="post"
              action={next.dismissAction}
              data-next-step-dismiss="true"
              className="ui-c2-m0"
              style={{ float: "right" }}
            >
              <IconButton
                type="submit"
                variant="ghost"
                size="sm"
                aria-label={next.dismissLabel ?? "Dismiss"}
                title={next.dismissLabel ?? "Dismiss"}
              >
                ×
              </IconButton>
            </form>
          ) : null}
          {hrefs?.nextStep ? (
            <a href={hrefs.nextStep} className="ui-d-b ui-d-inh">
              {nextLabel}
            </a>
          ) : (
            <span className="ui-d-b">{nextLabel}</span>
          )}
          {next.estimateCredits != null && labels.estimateLabel ? (
            <span className="ui-set-inline ui-d-l" style={{ fontVariantNumeric: "tabular-nums" }}>
              {labels.estimateLabel(next.estimateCredits)}
            </span>
          ) : null}
          {next.duration != null ? (
            <span
              data-next-step-duration
              className="ui-set-inline ui-d-i"
              style={{ fontVariantNumeric: "tabular-nums" }}
            >
              ~{next.duration.lowMinutes}–{next.duration.highMinutes} min
            </span>
          ) : null}
        </div>
      ) : null}

      {view.rounds.length === 0 && view.ungrouped.length === 0 ? (
        <p className="ui-d-l">{labels.emptyText}</p>
      ) : null}

      {view.rounds.map((round) => (
        <section key={round.n} data-round={round.n} className="ui-d-mb16">
          <CollapsedSummary parts={round.parts} labels={labels} />
          <ul className="ui-c2-mt ui-c2-mb ui-d-p0" style={{ listStyle: "none" }}>
            {round.runs.map((run) => (
              <RunRow
                key={run.runId}
                run={run}
                labels={labels}
                cardLabels={cardLabels}
                hrefs={hrefs}
                {...(renderGateCard ? { renderGateCard } : {})}
              />
            ))}
          </ul>
          {round.anchor ? <VersionChip n={round.anchor.n} labels={labels} hrefs={hrefs} /> : null}
          {round.producedN != null ? (
            <span className="ui-d-l">
              {` ${labels.arrow} `}
              <VersionChip n={round.producedN} labels={labels} hrefs={hrefs} />
            </span>
          ) : null}
        </section>
      ))}

      {view.ungrouped.length > 0 ? (
        <ul className="ui-c2-m0 ui-d-p0" style={{ listStyle: "none" }}>
          {view.ungrouped.map((run) => (
            <RunRow
              key={run.runId}
              run={run}
              labels={labels}
              cardLabels={cardLabels}
              hrefs={hrefs}
              {...(renderGateCard ? { renderGateCard } : {})}
            />
          ))}
        </ul>
      ) : null}

      {view.originChip ? (
        <p data-origin-chip={view.originChip.kind} className="ui-c2-mt ui-d-i">
          {labels.originChipLabel(view.originChip.kind)}
        </p>
      ) : null}
    </div>
  );
}
