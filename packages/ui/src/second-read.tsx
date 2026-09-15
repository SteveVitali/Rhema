import type { ReactNode } from "react";
import type { FindingView } from "@rhema/contracts";
import type { ReconciliationSummary } from "@rhema/findings-core";

// The second-read reconciliation surface (§5.7; REQ-IDE-26). Corroborated (✓✓), second-read-only kept, and the
// rejected group — collapsed with the Editor's reason, promotable (the promote action itself is PRB.05). The
// conflict rows (pre-triage then rejected) render in the FindingsList. Text-agnostic.

export interface SecondReadLabels {
  readonly heading: string;
  readonly corroboratedLabel: (n: number) => string;
  readonly secondReadOnlyLabel: (n: number) => string;
  readonly rejectedHeading: string;
  /** the promote affordance label (action is PRB.05). */
  readonly promoteLabel?: string;
  readonly emptyRejectedLabel?: string;
}

export interface SecondReadViewProps {
  readonly summary: ReconciliationSummary;
  /** rejected findings with no user disposition — the collapsed, promotable group (§5.7). */
  readonly rejected: readonly FindingView[];
  readonly labels: SecondReadLabels;
}

/** The second-read reconciliation view (§5.7; REQ-IDE-26). */
export function SecondReadView({ summary, rejected, labels }: SecondReadViewProps): ReactNode {
  return (
    <section data-second-read="true" aria-label={labels.heading}>
      <h3 style={{ fontSize: "13px", textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--paper-fg-muted)" }}>{labels.heading}</h3>
      <div style={{ display: "flex", gap: "16px", fontSize: "13px", color: "var(--paper-fg)", marginTop: "8px" }}>
        <span data-corroborated-count={summary.corroborated}>
          <span aria-hidden="true" style={{ color: "var(--state-ready)" }}>✓✓ </span>
          {labels.corroboratedLabel(summary.corroborated)}
        </span>
        <span data-second-read-only-count={summary.secondReadOnly}>{labels.secondReadOnlyLabel(summary.secondReadOnly)}</span>
      </div>

      <div data-rejected-group="true" style={{ marginTop: "12px" }}>
        <h4 style={{ fontSize: "12px", color: "var(--shell-fg-muted)", margin: "0 0 6px" }}>{labels.rejectedHeading}</h4>
        {rejected.length === 0 ? (
          <p style={{ fontSize: "12px", color: "var(--shell-fg-faint)" }}>{labels.emptyRejectedLabel ?? ""}</p>
        ) : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {rejected.map((v) => (
              <li key={v.id} data-rejected={v.id} data-promotable="true" style={{ padding: "8px 0", borderBottom: "1px solid var(--paper-rule)" }}>
                <div style={{ fontSize: "13px", color: "var(--paper-fg)" }}>{v.title}</div>
                <div style={{ fontSize: "12px", color: "var(--shell-fg-muted)", marginTop: "2px" }}>{v.body}</div>
                {labels.promoteLabel ? <span style={{ fontSize: "12px", color: "var(--accent)" }}>{labels.promoteLabel}</span> : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
