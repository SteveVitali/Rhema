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
      <h3 className="ui-d-fd ui-t-ls6 ui-t-pm" style={{ textTransform: "uppercase" }}>
        {labels.heading}
      </h3>
      <div className="ui-t-g16 ui-d-fd ui-t-pf ui-c2-mt" style={{ display: "flex" }}>
        <span data-corroborated-count={summary.corroborated}>
          <span aria-hidden="true" className="ui-set-t--ok">
            ✓✓{" "}
          </span>
          {labels.corroboratedLabel(summary.corroborated)}
        </span>
        <span data-second-read-only-count={summary.secondReadOnly}>
          {labels.secondReadOnlyLabel(summary.secondReadOnly)}
        </span>
      </div>

      <div data-rejected-group="true" className="ui-d-mt12">
        <h4 className="ui-d-fs ui-t-mut ui-t-m06">{labels.rejectedHeading}</h4>
        {rejected.length === 0 ? (
          <p className="ui-d-i">{labels.emptyRejectedLabel ?? ""}</p>
        ) : (
          <ul className="ui-c2-m0 ui-d-p0" style={{ listStyle: "none" }}>
            {rejected.map((v) => (
              <li
                key={v.id}
                data-rejected={v.id}
                data-promotable="true"
                className="ui-t-p80"
                style={{ borderBottom: "1px solid var(--paper-rule)" }}
              >
                <div className="ui-d-fd ui-t-pf">{v.title}</div>
                <div className="ui-d-fs ui-t-mut ui-t-mt2">{v.body}</div>
                {labels.promoteLabel ? (
                  <span className="ui-d-fs ui-t-acc">{labels.promoteLabel}</span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
