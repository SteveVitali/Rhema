import type { ReactNode } from "react";
import type { RubricView as RubricViewModel, RubricDotRow } from "@rhema/findings-core";

// The rubric view (§5.7; REQ-IDE-30): eight dimensions, each a FIVE-DOT scale, entailment caps with their
// reason inline, laid out as a list — NEVER an aggregate. The component renders the findings-core `RubricView`
// (which has no total) and adds no sum of its own, so the DOM cannot be read as a score out of 40.

export interface RubricLabels {
  readonly heading: string;
  readonly dimensionLabel: (dimension: string) => string;
  /** e.g. (cap) => "capped at 2 — a contradicted Tier-1 claim". */
  readonly capLabel?: (cap: { at: number; reason: string; entailedByFindingOrdinal?: number }) => string;
}

function Dots({ dots }: { dots: readonly boolean[] }): ReactNode {
  return (
    <span data-dots={dots.filter(Boolean).length} aria-hidden="true" style={{ display: "inline-flex", gap: "4px" }}>
      {dots.map((filled, i) => (
        <span
          key={i}
          data-dot={filled ? "filled" : "empty"}
          style={{ width: "10px", height: "10px", borderRadius: "999px", background: filled ? "var(--accent)" : "transparent", border: `1px solid ${filled ? "var(--accent)" : "var(--paper-rule)"}` }}
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
      style={{ display: "flex", alignItems: "center", gap: "12px", padding: "8px 0", borderBottom: "1px solid var(--paper-rule)" }}
    >
      <span style={{ minWidth: "180px", fontSize: "13px", color: "var(--paper-fg)" }}>{labels.dimensionLabel(row.dimension)}</span>
      <Dots dots={row.dots} />
      {row.cap ? (
        <span data-cap-at={row.cap.at} style={{ fontSize: "12px", color: "var(--sev-major)" }}>
          {labels.capLabel ? labels.capLabel(row.cap) : row.cap.reason}
        </span>
      ) : null}
    </li>
  );
}

/** The rubric view (§5.7). List of five-dot rows with inline caps; no aggregate (REQ-IDE-30). */
export function RubricView({ view, labels }: { view: RubricViewModel; labels: RubricLabels }): ReactNode {
  return (
    <section data-rubric="true" aria-label={labels.heading}>
      <h3 style={{ fontSize: "13px", textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--paper-fg-muted)" }}>{labels.heading}</h3>
      <ul style={{ listStyle: "none", margin: "8px 0 0", padding: 0 }}>
        {view.rows.map((r) => (
          <Row key={r.dimension} row={r} labels={labels} />
        ))}
      </ul>
    </section>
  );
}
