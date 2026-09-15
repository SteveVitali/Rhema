import type { ReactNode } from "react";
import type { FindingView } from "@rhema/contracts";
import { canDispose, type FindingGroup, type ReconciliationConflict } from "@rhema/findings-core";
import { severityColor } from "./primitives.js";
import { ObligationChip, type ObligationStateKind } from "./chips.js";

// The findings list (§5.7 "three surfaces, one list", beta = the Desk list; REQ-IDE-23/24). Reading surface:
// cards are read-only. Provisional cards expose NO disposition controls (REQ-IDE-15); the actual verb controls
// are PRB.05 (passed as the `controls` slot, and rendered only when `canDispose`). Text-agnostic.

export interface FindingCardLabels {
  readonly kindLabel: (kind: string) => string;
  readonly severityLabel: (severity: string) => string;
  readonly originLabel?: (origin: string) => string;
  /** shown on a streaming provisional card (REQ-IDE-15). */
  readonly provisionalLabel: string;
  /** shown on a disposed card (read-only), e.g. (kind) => "You accepted this". */
  readonly dispositionLabel?: (kind: string, applied?: boolean) => string;
}

export interface FindingCardProps {
  readonly view: FindingView;
  readonly labels: FindingCardLabels;
  /** the obligation-state chip for a blocking/major finding (REQ-OBJ-6). */
  readonly obligation?: { readonly state: ObligationStateKind; readonly label: string };
  /**
   * PRB.05's disposition verb controls. Rendered ONLY when the finding is disposable (not provisional, not
   * frozen). PRB.04 (reading surfaces) never passes this — so a provisional card shows no controls, always.
   */
  readonly controls?: ReactNode;
}

/** A single read-only finding card (§5.7). */
export function FindingCard({ view, labels, obligation, controls }: FindingCardProps): ReactNode {
  const provisional = view.provisional;
  const showControls = controls != null && canDispose({ provisional: view.provisional, disposition: view.disposition ?? null });
  return (
    <article
      data-finding={view.id}
      data-severity={view.severity}
      data-kind={view.kind}
      data-provisional={provisional ? "true" : "false"}
      data-can-dispose={canDispose({ provisional: view.provisional, disposition: view.disposition ?? null }) ? "true" : "false"}
      style={{
        borderLeft: `3px solid ${severityColor(view.severity)}`,
        border: "1px solid var(--paper-rule)",
        borderLeftWidth: "3px",
        borderRadius: "8px",
        padding: "12px 14px",
        marginBottom: "10px",
        background: provisional ? "transparent" : "var(--paper-bg)",
        borderStyle: provisional ? "dashed" : "solid",
        opacity: provisional ? 0.85 : 1,
      }}
    >
      <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap", marginBottom: "4px" }}>
        <span style={{ fontSize: "11px", fontWeight: 600, color: severityColor(view.severity) }}>{labels.severityLabel(view.severity)}</span>
        <span style={{ fontSize: "11px", color: "var(--paper-fg-muted)" }}>· {labels.kindLabel(view.kind)}</span>
        {view.origin === "both" ? (
          <span data-corroborated="true" title="corroborated by the second read" style={{ fontSize: "11px", color: "var(--state-ready)" }}>
            ✓✓
          </span>
        ) : null}
        {provisional ? (
          <span data-provisional-label style={{ fontSize: "11px", color: "var(--shell-fg-muted)", fontStyle: "italic" }}>
            {labels.provisionalLabel}
          </span>
        ) : null}
        {obligation ? <ObligationChip state={obligation.state} label={obligation.label} /> : null}
      </div>
      <div style={{ fontWeight: 600, fontSize: "14px", color: "var(--paper-fg)" }}>{view.title}</div>
      <div style={{ color: "var(--paper-fg-muted)", fontSize: "13px", marginTop: "2px" }}>{view.body}</div>
      {view.disposition && labels.dispositionLabel ? (
        <div data-disposition={view.disposition.kind} style={{ marginTop: "6px", fontSize: "12px", color: "var(--shell-fg-muted)" }}>
          {labels.dispositionLabel(view.disposition.kind, view.disposition.applied)}
        </div>
      ) : null}
      {showControls ? <div data-disposition-controls="true" style={{ marginTop: "8px" }}>{controls}</div> : null}
    </article>
  );
}

export interface ConflictRowLabels {
  /** e.g. (verb) => "You accepted this; the Editor withdrew it — keep your disposition?" */
  readonly conflictLine: (userDisposition: string) => string;
}

/** A reconciliation conflict row (REQ-IDE-15 amended): pre-triaged then reconciliation-rejected. */
export function ConflictRow({ conflict, labels }: { conflict: ReconciliationConflict; labels: ConflictRowLabels }): ReactNode {
  return (
    <div
      data-conflict-row={conflict.findingId}
      data-user-disposition={conflict.userDisposition}
      role="note"
      style={{
        border: "1px solid var(--sev-major)",
        borderRadius: "8px",
        padding: "10px 14px",
        marginBottom: "10px",
        background: "var(--shell-surface)",
        color: "var(--shell-fg)",
        fontSize: "13px",
      }}
    >
      <div style={{ fontWeight: 600 }}>{conflict.title}</div>
      <div style={{ color: "var(--shell-fg-muted)", marginTop: "2px" }}>{labels.conflictLine(conflict.userDisposition)}</div>
    </div>
  );
}

export interface FindingsListLabels extends FindingCardLabels, ConflictRowLabels {
  readonly conflictsHeading?: string;
  readonly rejectedHeading?: string;
  /** the promote affordance on a collapsed rejected finding (label only; the action is PRB.05). */
  readonly promoteLabel?: string;
}

export interface FindingsListProps {
  readonly groups: readonly FindingGroup[];
  readonly conflicts?: readonly ReconciliationConflict[];
  /** rejected findings with no user disposition (collapsed, promotable — §5.7). */
  readonly collapsedRejected?: readonly FindingView[];
  readonly labels: FindingsListLabels;
  readonly obligationFor?: (view: FindingView) => { state: ObligationStateKind; label: string } | undefined;
  /**
   * PRB.05 — the disposition verb controls for a finding (Accept/Adapt/Rebut/Defer/Escalate + note +
   * reason chips). Rendered only when `canDispose` permits (never on provisional or frozen cards).
   */
  readonly controlsFor?: (view: FindingView) => ReactNode;
}

/** The list-first findings surface: grouped cards (Whole piece heads the list), conflict rows, rejected group. */
export function FindingsList({ groups, conflicts, collapsedRejected, labels, obligationFor, controlsFor }: FindingsListProps): ReactNode {
  return (
    <div data-findings-list="true">
      {conflicts && conflicts.length > 0 ? (
        <section data-conflicts="true" style={{ marginBottom: "16px" }}>
          {labels.conflictsHeading ? (
            <h3 style={{ fontSize: "13px", textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--sev-major)" }}>{labels.conflictsHeading}</h3>
          ) : null}
          {conflicts.map((c) => (
            <ConflictRow key={c.findingId} conflict={c} labels={labels} />
          ))}
        </section>
      ) : null}

      {groups.map((g) => (
        <section key={g.key} data-group={g.key} style={{ marginBottom: "16px" }}>
          <h3 style={{ fontSize: "13px", textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--paper-fg-muted)" }}>{g.label}</h3>
          {g.findings.map((v) => (
            <FindingCard key={v.id} view={v} labels={labels} obligation={obligationFor?.(v)} controls={controlsFor?.(v)} />
          ))}
        </section>
      ))}

      {collapsedRejected && collapsedRejected.length > 0 ? (
        <section data-rejected-group="true" style={{ marginBottom: "16px" }}>
          {labels.rejectedHeading ? (
            <h3 style={{ fontSize: "13px", textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--shell-fg-muted)" }}>{labels.rejectedHeading}</h3>
          ) : null}
          {collapsedRejected.map((v) => (
            <div key={v.id} data-rejected={v.id} style={{ padding: "8px 0", borderBottom: "1px solid var(--paper-rule)" }}>
              <div style={{ fontSize: "13px", color: "var(--paper-fg)" }}>{v.title}</div>
              {v.reconciliation === "rejected" ? (
                <div style={{ fontSize: "12px", color: "var(--shell-fg-muted)", marginTop: "2px" }}>{v.body}</div>
              ) : null}
              {labels.promoteLabel ? <span data-promotable="true" style={{ fontSize: "12px", color: "var(--accent)" }}>{labels.promoteLabel}</span> : null}
            </div>
          ))}
        </section>
      ) : null}
    </div>
  );
}
