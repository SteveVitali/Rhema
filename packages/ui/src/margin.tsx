import type { CSSProperties, ReactNode } from "react";
import type { FindingView } from "@rhema/contracts";
import type { MarginItem } from "@rhema/findings-core";
import { severityColor } from "./primitives/chips.js";
import { FindingCard, type FindingCardLabels, type FindingCardProps } from "./findings.js";
import type { ObligationStateKind } from "./chips.js";

// The Margin surface (§5.7; REQ-IDE-23/24): finding cards beside their passages — or one stacked chip
// per crowded paragraph ("N findings · K <severity>", expands on focus). MarginItem[] comes straight from
// findings-core's `marginItems` — this file renders, it does not derive. The linked-selection seam is
// `data-finding-id` + `#finding-<id>` anchors (the island syncs Margin ↔ Desk ↔ the passage marks).

export interface MarginLabels extends FindingCardLabels {
  /** the stacked chip's summary — (counts, topSeverity, topCount) => "3 findings · 1 major"; the
   *  counts come from findings-core's ONE rule (strength-slot rows read as strengths, REQ-SYNC-2). */
  readonly chipLabel: (
    counts: { findings: number; strengths: number },
    topSeverityLabel: string,
    topCount: number,
  ) => string;
  /** the chip group's accessible name. */
  readonly chipAria: (count: number) => string;
}

export interface MarginSurfaceProps {
  readonly items: readonly MarginItem[];
  readonly labels: MarginLabels;
  readonly obligationFor?: (
    view: FindingView,
  ) => { state: ObligationStateKind; label: string } | undefined;
  /** per-card action slot (the disposition form / Apply button — caller-owned, form-POST progressive). */
  readonly controlsFor?: (view: FindingView) => ReactNode;
  /** the claim-finding evidence block per card (verdict chip + fetched-stamped URLs; REQ-IDE-25). */
  readonly evidenceFor?: (view: FindingView) => FindingCardProps["evidence"];
  /** the selected finding's id — linked selection across Margin ↔ Desk ↔ passage (§5.7). */
  readonly selectedId?: string;
}

function MarginCardBody({
  view,
  labels,
  obligationFor,
  controlsFor,
  evidenceFor,
  selectedId,
}: {
  readonly view: FindingView;
  readonly labels: MarginLabels;
  readonly obligationFor?: MarginSurfaceProps["obligationFor"];
  readonly controlsFor?: MarginSurfaceProps["controlsFor"];
  readonly evidenceFor?: MarginSurfaceProps["evidenceFor"];
  readonly selectedId?: string;
}): ReactNode {
  return (
    <div
      id={`finding-${view.id}`}
      data-finding-id={view.id}
      data-margin-card="true"
      data-severity={view.severity}
      data-kind={view.kind}
      {...(view.suggestion ? { "data-suggestion": "1" } : {})}
      {...(selectedId === view.id ? { "data-selected": "true" } : {})}
      tabIndex={0}
      role="link"
      style={{ scrollMarginTop: "24px" }}
    >
      <FindingCard
        view={view}
        labels={labels}
        {...(obligationFor ? { obligation: obligationFor(view) } : {})}
        {...(controlsFor ? { controls: controlsFor(view) } : {})}
        {...(evidenceFor ? { evidence: evidenceFor(view) } : {})}
      />
    </div>
  );
}

/** The Margin's stacked chip — one row covering a crowded paragraph; expands in place (details = no-JS). */
function MarginChip({
  item,
  labels,
  obligationFor,
  controlsFor,
  evidenceFor,
  selectedId,
}: {
  readonly item: Extract<MarginItem, { kind: "chip" }>;
  readonly labels: MarginLabels;
  readonly obligationFor?: MarginSurfaceProps["obligationFor"];
  readonly controlsFor?: MarginSurfaceProps["controlsFor"];
  readonly evidenceFor?: MarginSurfaceProps["evidenceFor"];
  readonly selectedId?: string;
}): ReactNode {
  const topLabel = labels.severityLabel(item.topSeverity);
  return (
    <details
      className="ide-mchip ui-t-r2 ui-d-mb10 ui-t-bp"
      data-margin-chip={item.key}
      data-count={item.count}
      data-severity={item.topSeverity}
      style={{
        borderLeft: `3px solid ${severityColor(item.topSeverity)}`,
        border: "1px solid var(--paper-rule)",
      }}
    >
      <summary
        aria-label={labels.chipAria(item.count)}
        className="ui-t-p812 ui-d-fs ui-t-pf"
        style={{ cursor: "pointer", listStyle: "none" }}
      >
        <span
          className="ui-d-b ui-d-sc"
          style={{ "--d-sev": severityColor(item.topSeverity) } as CSSProperties}
        >
          {labels.chipLabel(item.counts, topLabel, item.topCount)}
        </span>
      </summary>
      <div className="ui-t-p084">
        {item.findings.map((v) => (
          <MarginCardBody
            key={v.id}
            view={v}
            labels={labels}
            {...(obligationFor ? { obligationFor } : {})}
            {...(controlsFor ? { controlsFor } : {})}
            {...(evidenceFor ? { evidenceFor } : {})}
            {...(selectedId ? { selectedId } : {})}
          />
        ))}
      </div>
    </details>
  );
}

/** The Margin — ONE MarginItem[] from `marginItems(views)`: cards beside passages, chips for crowds. */
export function MarginSurface({
  items,
  labels,
  obligationFor,
  controlsFor,
  evidenceFor,
  selectedId,
}: MarginSurfaceProps): ReactNode {
  return (
    <div data-margin-surface="true" role="list" aria-label={labels.chipAria(items.length)}>
      {items.map((item) =>
        item.kind === "card" ? (
          <MarginCardBody
            key={item.finding.id}
            view={item.finding}
            labels={labels}
            {...(obligationFor ? { obligationFor } : {})}
            {...(controlsFor ? { controlsFor } : {})}
            {...(evidenceFor ? { evidenceFor } : {})}
            {...(selectedId ? { selectedId } : {})}
          />
        ) : (
          <MarginChip
            key={item.key}
            item={item}
            labels={labels}
            {...(obligationFor ? { obligationFor } : {})}
            {...(controlsFor ? { controlsFor } : {})}
            {...(evidenceFor ? { evidenceFor } : {})}
            {...(selectedId ? { selectedId } : {})}
          />
        ),
      )}
    </div>
  );
}

/** A Margin tick (the rail's edge markers — the cards' minimized echo; §5.1). */
export function MarginTicks({
  findings,
}: {
  readonly findings: readonly { id: string; severity: string; excerpt: string }[];
}): ReactNode {
  return (
    <>
      {findings.map((f) => (
        <a
          key={f.id}
          className="ide-tick ui-d-sev"
          href={`#finding-${f.id}`}
          aria-label={f.excerpt}
          title={f.excerpt}
          style={{ "--d-sev": `var(--sev-${f.severity})` } as CSSProperties}
        />
      ))}
    </>
  );
}
