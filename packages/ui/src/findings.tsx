import type { ReactNode } from "react";
import type { FindingView } from "@rhema/contracts";
import { canDispose, type FindingGroup, type ReconciliationConflict } from "@rhema/findings-core";
import { severityColor } from "./primitives/chips.js";
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
  /** P1.07 — the evidence block's labels (§5.7): the verdict chip + per-URL "fetched ✓". */
  readonly fetchedLabel?: string;
  /** CITE.1 — the per-URL label when only search-hit rows cover it ("Search result", no ✓). */
  readonly searchResultLabel?: string;
  readonly accessedLabel?: (accessed: string) => string;
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
  /**
   * P1.07 — the claim-finding evidence block (§5.7): the verdict chip + every `sources[]` URL with its
   * "fetched ✓" mark (the caller stamps `fetched` from the run's proxy fetch log — REQ-IDE-25).
   */
  readonly evidence?: {
    readonly verdictLabel?: string;
    readonly urls: readonly {
      readonly url: string;
      readonly fetched: boolean;
      readonly accessedAt?: string;
      /** CITE.1 — `"search"` when only search-hit rows cover the url (the "Search result" chip). */
      readonly retrievedBy?: "fetch" | "search";
    }[];
  };
}

/** A single read-only finding card (§5.7). */
export function FindingCard({
  view,
  labels,
  obligation,
  controls,
  evidence,
}: FindingCardProps): ReactNode {
  const provisional = view.provisional;
  const showControls =
    controls != null &&
    canDispose({ provisional: view.provisional, disposition: view.disposition ?? null });
  return (
    <article
      data-finding={view.id}
      data-severity={view.severity}
      data-kind={view.kind}
      data-provisional={provisional ? "true" : "false"}
      data-can-dispose={
        canDispose({ provisional: view.provisional, disposition: view.disposition ?? null })
          ? "true"
          : "false"
      }
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
      <div
        style={{
          display: "flex",
          gap: "8px",
          alignItems: "center",
          flexWrap: "wrap",
          marginBottom: "4px",
        }}
      >
        <span style={{ fontSize: "11px", fontWeight: 600, color: severityColor(view.severity) }}>
          {labels.severityLabel(view.severity)}
        </span>
        <span style={{ fontSize: "11px", color: "var(--paper-fg-muted)" }}>
          · {labels.kindLabel(view.kind)}
        </span>
        {view.origin === "both" ? (
          <span
            data-corroborated="true"
            title="corroborated by the second read"
            style={{ fontSize: "11px", color: "var(--state-ready)" }}
          >
            ✓✓
          </span>
        ) : null}
        {provisional ? (
          <span
            data-provisional-label
            style={{ fontSize: "11px", color: "var(--shell-fg-muted)", fontStyle: "italic" }}
          >
            {labels.provisionalLabel}
          </span>
        ) : null}
        {obligation ? <ObligationChip state={obligation.state} label={obligation.label} /> : null}
      </div>
      <div style={{ fontWeight: 600, fontSize: "14px", color: "var(--paper-fg)" }}>
        {view.title}
      </div>
      <div style={{ color: "var(--paper-fg-muted)", fontSize: "13px", marginTop: "2px" }}>
        {view.body}
      </div>
      {evidence ? (
        <div data-finding-evidence="true" style={{ marginTop: "6px", fontSize: "12px" }}>
          {evidence.verdictLabel != null ? (
            <span
              data-evidence-verdict="true"
              style={{ fontWeight: 600, color: "var(--paper-fg)", marginRight: "6px" }}
            >
              {evidence.verdictLabel}
            </span>
          ) : null}
          <ul style={{ listStyle: "none", padding: 0, margin: "4px 0 0" }}>
            {evidence.urls.map((u) => (
              <li key={u.url} style={{ color: "var(--paper-fg-muted)", padding: "1px 0" }}>
                <a href={u.url} style={{ color: "var(--accent)" }}>
                  {u.url}
                </a>
                {u.accessedAt != null && labels.accessedLabel ? (
                  <> · {labels.accessedLabel(u.accessedAt)}</>
                ) : null}
                {u.fetched && labels.fetchedLabel ? (
                  u.retrievedBy === "search" ? (
                    <>
                      {" "}
                      <span
                        data-fetched-chip="search"
                        style={{ fontSize: "11px", color: "var(--paper-fg-muted)" }}
                      >
                        {labels.searchResultLabel ?? labels.fetchedLabel}
                      </span>
                    </>
                  ) : (
                    <>
                      {" "}
                      <span
                        data-fetched-chip="true"
                        style={{ fontSize: "11px", color: "var(--state-ready)" }}
                      >
                        {labels.fetchedLabel} ✓
                      </span>
                    </>
                  )
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {view.disposition && labels.dispositionLabel ? (
        <div
          data-disposition={view.disposition.kind}
          style={{ marginTop: "6px", fontSize: "12px", color: "var(--shell-fg-muted)" }}
        >
          {labels.dispositionLabel(view.disposition.kind, view.disposition.applied)}
        </div>
      ) : null}
      {showControls ? (
        <div data-disposition-controls="true" style={{ marginTop: "8px" }}>
          {controls}
        </div>
      ) : null}
    </article>
  );
}

export interface ConflictRowLabels {
  /** e.g. (verb) => "You accepted this; the Editor withdrew it — keep your disposition?" */
  readonly conflictLine: (userDisposition: string) => string;
}

/** A reconciliation conflict row (REQ-IDE-15 amended): pre-triaged then reconciliation-rejected. */
export function ConflictRow({
  conflict,
  labels,
}: {
  conflict: ReconciliationConflict;
  labels: ConflictRowLabels;
}): ReactNode {
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
      <div style={{ color: "var(--shell-fg-muted)", marginTop: "2px" }}>
        {labels.conflictLine(conflict.userDisposition)}
      </div>
    </div>
  );
}

export interface FindingsListLabels extends FindingCardLabels, ConflictRowLabels {
  readonly conflictsHeading?: string;
  readonly rejectedHeading?: string;
  /** the promote affordance on a collapsed rejected finding. */
  readonly promoteLabel?: string;
}

export interface FindingsListProps {
  readonly groups: readonly FindingGroup[];
  readonly conflicts?: readonly ReconciliationConflict[];
  /** rejected findings with no user disposition (collapsed, promotable — §5.7). */
  readonly collapsedRejected?: readonly FindingView[];
  readonly labels: FindingsListLabels;
  readonly obligationFor?: (
    view: FindingView,
  ) => { state: ObligationStateKind; label: string } | undefined;
  /**
   * PRB.05 — the disposition verb controls for a finding (Accept/Adapt/Rebut/Defer/Escalate + note +
   * reason chips). Rendered only when `canDispose` permits (never on provisional or frozen cards).
   */
  readonly controlsFor?: (view: FindingView) => ReactNode;
  /**
   * P1.07 — the promote affordance's POST action for a rejected row ("I want to address this anyway" →
   * a user-origin ledger row; REQ-IDE-26). Absent ⇒ the label renders without the form (read-only).
   */
  readonly promoteActionFor?: (view: FindingView) => string;
  /** P1.07 — the claim-finding evidence block per card (verdict chip + fetched-stamped URLs). */
  readonly evidenceFor?: (view: FindingView) => FindingCardProps["evidence"];
}

/** The list-first findings surface: grouped cards (Whole piece heads the list), conflict rows, rejected group. */
export function FindingsList({
  groups,
  conflicts,
  collapsedRejected,
  labels,
  obligationFor,
  controlsFor,
  promoteActionFor,
  evidenceFor,
}: FindingsListProps): ReactNode {
  return (
    <div data-findings-list="true">
      {conflicts && conflicts.length > 0 ? (
        <section data-conflicts="true" style={{ marginBottom: "16px" }}>
          {labels.conflictsHeading ? (
            <h3
              style={{
                fontSize: "13px",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                color: "var(--sev-major)",
              }}
            >
              {labels.conflictsHeading}
            </h3>
          ) : null}
          {conflicts.map((c) => (
            <ConflictRow key={c.findingId} conflict={c} labels={labels} />
          ))}
        </section>
      ) : null}

      {groups.map((g) => (
        <section key={g.key} data-group={g.key} style={{ marginBottom: "16px" }}>
          <h3
            style={{
              fontSize: "13px",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              color: "var(--paper-fg-muted)",
            }}
          >
            {g.label}
          </h3>
          {g.findings.map((v) => (
            <FindingCard
              key={v.id}
              view={v}
              labels={labels}
              obligation={obligationFor?.(v)}
              controls={controlsFor?.(v)}
              {...(evidenceFor ? { evidence: evidenceFor(v) } : {})}
            />
          ))}
        </section>
      ))}

      {collapsedRejected && collapsedRejected.length > 0 ? (
        <section data-rejected-group="true" style={{ marginBottom: "16px" }}>
          {labels.rejectedHeading ? (
            <h3
              style={{
                fontSize: "13px",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                color: "var(--shell-fg-muted)",
              }}
            >
              {labels.rejectedHeading}
            </h3>
          ) : null}
          {collapsedRejected.map((v) => (
            <div
              key={v.id}
              data-rejected={v.id}
              style={{ padding: "8px 0", borderBottom: "1px solid var(--paper-rule)" }}
            >
              <div style={{ fontSize: "13px", color: "var(--paper-fg)" }}>{v.title}</div>
              {v.reconciliation === "rejected" ? (
                <div style={{ fontSize: "12px", color: "var(--shell-fg-muted)", marginTop: "2px" }}>
                  {v.body}
                </div>
              ) : null}
              {labels.promoteLabel ? (
                promoteActionFor ? (
                  <form method="post" action={promoteActionFor(v)} style={{ display: "inline" }}>
                    <button
                      type="submit"
                      data-promotable="true"
                      style={{
                        fontSize: "12px",
                        color: "var(--accent)",
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        padding: 0,
                        textDecoration: "underline",
                      }}
                    >
                      {labels.promoteLabel}
                    </button>
                  </form>
                ) : (
                  <span data-promotable="true" style={{ fontSize: "12px", color: "var(--accent)" }}>
                    {labels.promoteLabel}
                  </span>
                )
              ) : null}
            </div>
          ))}
        </section>
      ) : null}
    </div>
  );
}
