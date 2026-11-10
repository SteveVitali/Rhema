import type { CSSProperties, ReactNode } from "react";
import type { FindingView } from "@rhema/contracts";
import { canDispose, type FindingGroup, type ReconciliationConflict } from "@rhema/findings-core";
import { severityColor } from "./primitives/chips.js";
import { Button } from "./primitives/button.js";
import { ObligationChip, type ObligationStateKind } from "./chips.js";

// The findings list (§5.7 "three surfaces, one list", beta = the Desk list; REQ-IDE-23/24). Reading surface:
// cards are read-only. Provisional cards expose NO disposition controls (REQ-IDE-15); the actual verb controls
// are PRB.05 (passed as the `controls` slot, and rendered only when `canDispose`). Text-agnostic.
//
// 243a_R7KIT.3e: migrated onto the 225/225a primitives + `uiCss()` classes (GUARD-1 on). The
// promote affordance is a Button primitive (it still submits its no-JS form); chips/severity keep
// the C6 static-vs-action semantics — severity/kind text is never a control.

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
  /** CITE.1 — the per-URL label when only search-hit rows cover the url ("Search result", no ✓). */
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
export function FindingCard({ view, labels, obligation, controls, evidence }: FindingCardProps): ReactNode {
  const provisional = view.provisional;
  const showControls = controls != null && canDispose({ provisional: view.provisional, disposition: view.disposition ?? null });
  return (
    <article
      data-finding={view.id}
      data-severity={view.severity}
      data-kind={view.kind}
      data-provisional={provisional ? "true" : "false"}
      data-can-dispose={canDispose({ provisional: view.provisional, disposition: view.disposition ?? null }) ? "true" : "false"}
      className={`ui-fcard${provisional ? " ui-fcard--p" : ""}`}
      style={
        {
          "--d-sev": severityColor(view.severity),
          border: "1px solid var(--paper-rule)",
          borderLeft: "3px solid var(--d-sev, var(--shell-border))",
          ...(provisional ? { borderStyle: "dashed", opacity: 0.85 } : {}),
        } as CSSProperties
      }
    >
      <div className="ui-d-acts ui-d-mb10" style={{ flexWrap: "wrap" }}>
        <span className="ui-d-fs ui-d-b ui-d-sc">{labels.severityLabel(view.severity)}</span>
        <span className="ui-d-fs ui-d-cm">· {labels.kindLabel(view.kind)}</span>
        {view.origin === "both" ? (
          <span data-corroborated="true" title="corroborated by the second read" className="ui-d-fs ui-d-ok">
            ✓✓
          </span>
        ) : null}
        {provisional ? (
          <span data-provisional-label className="ui-d-fs ui-d-t ui-d-it">
            {labels.provisionalLabel}
          </span>
        ) : null}
        {obligation ? <ObligationChip state={obligation.state} label={obligation.label} /> : null}
      </div>
      <div className="ui-d-fd ui-d-b">{view.title}</div>
      <div className="ui-d-fd ui-d-cm ui-d-mt6">{view.body}</div>
      {evidence ? (
        <div data-finding-evidence="true" className="ui-d-s ui-d-mt6">
          {evidence.verdictLabel != null ? (
            <span data-evidence-verdict="true" className="ui-d-b">
              {evidence.verdictLabel}{" "}
            </span>
          ) : null}
          <ul className="ui-d-p0 ui-d-mt6" style={{ listStyle: "none" }}>
            {evidence.urls.map((u) => (
              <li key={u.url} className="ui-d-cm ui-d-p2">
                <a href={u.url} className="ui-vc-acc">{u.url}</a>
                {u.accessedAt != null && labels.accessedLabel ? <> · {labels.accessedLabel(u.accessedAt)}</> : null}
                {u.fetched && labels.fetchedLabel ? (
                  u.retrievedBy === "search" ? (
                    <> <span data-fetched-chip="search" className="ui-d-fs ui-d-cm">{labels.searchResultLabel ?? labels.fetchedLabel}</span></>
                  ) : (
                    <> <span data-fetched-chip="true" className="ui-d-fs ui-d-ok">{labels.fetchedLabel} ✓</span></>
                  )
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {view.disposition && labels.dispositionLabel ? (
        <div data-disposition={view.disposition.kind} className="ui-d-s ui-d-t ui-d-mt6">
          {labels.dispositionLabel(view.disposition.kind, view.disposition.applied)}
        </div>
      ) : null}
      {showControls ? <div data-disposition-controls="true" className="ui-d-mt6">{controls}</div> : null}
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
      className="ui-fconflict ui-d-fd"
      style={{ border: "1px solid var(--sev-major)" }}
    >
      <div className="ui-d-b">{conflict.title}</div>
      <div className="ui-d-t ui-d-mt6">{labels.conflictLine(conflict.userDisposition)}</div>
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
  readonly obligationFor?: (view: FindingView) => { state: ObligationStateKind; label: string } | undefined;
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
export function FindingsList({ groups, conflicts, collapsedRejected, labels, obligationFor, controlsFor, promoteActionFor, evidenceFor }: FindingsListProps): ReactNode {
  return (
    <div data-findings-list="true">
      {conflicts && conflicts.length > 0 ? (
        <section data-conflicts="true" className="ui-d-mb16">
          {labels.conflictsHeading ? (
            <h3 className="ui-d-cap ui-d-s ui-d-w">{labels.conflictsHeading}</h3>
          ) : null}
          {conflicts.map((c) => (
            <ConflictRow key={c.findingId} conflict={c} labels={labels} />
          ))}
        </section>
      ) : null}

      {groups.map((g) => (
        <section key={g.key} data-group={g.key} className="ui-d-mb16">
          <h3 className="ui-d-cap ui-d-s ui-d-cm">{g.label}</h3>
          {g.findings.map((v) => (
            <FindingCard key={v.id} view={v} labels={labels} obligation={obligationFor?.(v)} controls={controlsFor?.(v)} {...(evidenceFor ? { evidence: evidenceFor(v) } : {})} />
          ))}
        </section>
      ))}

      {collapsedRejected && collapsedRejected.length > 0 ? (
        <section data-rejected-group="true" className="ui-d-mb16">
          {labels.rejectedHeading ? (
            <h3 className="ui-d-cap ui-d-s ui-d-t">{labels.rejectedHeading}</h3>
          ) : null}
          {collapsedRejected.map((v) => (
            <div key={v.id} data-rejected={v.id} className="ui-d-acts ui-d-row">
              <div>
                <div className="ui-d-fd">{v.title}</div>
                {v.reconciliation === "rejected" ? (
                  <div className="ui-d-s ui-d-t ui-d-mt6">{v.body}</div>
                ) : null}
                {labels.promoteLabel ? (
                  promoteActionFor ? (
                    <form method="post" action={promoteActionFor(v)} style={{ display: "inline" }}>
                      <Button type="submit" variant="ghost" size="sm" data-promotable="true" className="ui-vc-acc">
                        {labels.promoteLabel}
                      </Button>
                    </form>
                  ) : (
                    <span data-promotable="true" className="ui-d-s ui-vc-acc">{labels.promoteLabel}</span>
                  )
                ) : null}
              </div>
            </div>
          ))}
        </section>
      ) : null}
    </div>
  );
}
