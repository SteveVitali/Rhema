import type { CSSProperties, ReactNode } from "react";
import type { RubricView as RubricViewModel, RubricDotRow } from "@rhema/findings-core";

// The rubric view (§5.7; REQ-IDE-30): eight dimensions, each a FIVE-DOT scale, entailment caps with their
// reason inline, laid out as a list — NEVER an aggregate. The component renders the findings-core `RubricView`
// (which has no total) and adds no sum of its own, so the DOM cannot be read as a score out of 40.

export interface RubricLabels {
  readonly heading: string;
  readonly dimensionLabel: (dimension: string) => string;
  /** e.g. (cap) => "capped at 2 — a contradicted Tier-1 claim". */
  readonly capLabel?: (cap: {
    at: number;
    reason: string;
    entailedByFindingOrdinal?: number;
  }) => string;
}

function Dots({ dots }: { dots: readonly boolean[] }): ReactNode {
  return (
    <span
      data-dots={dots.filter(Boolean).length}
      aria-hidden="true"
      className="ui-c2-g1"
      style={{ display: "inline-flex" }}
    >
      {dots.map((filled, i) => (
        <span
          key={i}
          data-dot={filled ? "filled" : "empty"}
          className="ui-t-s10 ui-t-rp ui-d-sev"
          style={
            {
              "--d-sev": filled ? "var(--accent)" : "transparent",
              border: `1px solid ${filled ? "var(--accent)" : "var(--paper-rule)"}`,
            } as CSSProperties
          }
        />
      ))}
    </span>
  );
}

function Row({ row, labels }: { row: RubricDotRow; labels: RubricLabels }): ReactNode {
  return (
    <li
      data-rubric-row={row.dimension}
      data-score={row.score}
      className="ui-c2-g3 ui-t-p80"
      style={{ display: "flex", alignItems: "center", borderBottom: "1px solid var(--paper-rule)" }}
    >
      <span className="ui-t-mw180 ui-d-fd ui-t-pf">{labels.dimensionLabel(row.dimension)}</span>
      <Dots dots={row.dots} />
      {row.cap ? (
        <span data-cap-at={row.cap.at} className="ui-d-fs ui-set-t--warn">
          {labels.capLabel ? labels.capLabel(row.cap) : row.cap.reason}
        </span>
      ) : null}
    </li>
  );
}

/** The rubric view (§5.7). List of five-dot rows with inline caps; no aggregate (REQ-IDE-30). */
export function RubricView({
  view,
  labels,
}: {
  view: RubricViewModel;
  labels: RubricLabels;
}): ReactNode {
  return (
    <section data-rubric="true" aria-label={labels.heading}>
      <h3 className="ui-d-fd ui-t-ls6 ui-t-pm" style={{ textTransform: "uppercase" }}>
        {labels.heading}
      </h3>
      <ul className="ui-t-m20 ui-d-p0" style={{ listStyle: "none" }}>
        {view.rows.map((r) => (
          <Row key={r.dimension} row={r} labels={labels} />
        ))}
      </ul>
    </section>
  );
}
