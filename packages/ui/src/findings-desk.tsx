import { Fragment, type ReactNode } from "react";
import type { FindingView } from "@rhema/contracts";
import { canDispose, type FindingGroup, type TriageQueueView } from "@rhema/findings-core";
import { severityColor } from "./primitives.js";
import { ObligationChip, type ObligationStateKind } from "./chips.js";

// The Desk's Findings tab (§5.7; REQ-IDE-23/24): the screen-reader landmark — a REAL <table> — fed by the
// SAME FindingView[] as the Margin and the triage queue. The shared filter bar is a GET form (no-JS);
// triage mode renders the sectioned queue + the progress pill; the three bulk actions post through the
// one consolidated preview. Everything renders what findings-core derived — no rules here.

export interface FindingsDeskLabels {
  readonly table: { finding: string; severity: string; kind: string; status: string; actions: string };
  readonly empty: string;
  /** the filter bar's control labels (GET form). */
  readonly filters: {
    readonly severity: string;
    readonly kind: string;
    readonly status: string;
    readonly apply: string;
    readonly clear: string;
    readonly allLabel: string;
  };
  readonly severityLabel: (severity: string) => string;
  readonly kindLabel: (kind: string) => string;
  readonly statusLabel: (view: FindingView) => string;
  /** the triage progress pill — (decided, total) => "14 of 32 decided". */
  readonly progressFmt: (decided: number, total: number) => string;
  readonly triageExit: string;
  readonly sectionLabels?: Readonly<Record<string, string>>;
}

export interface FindingsDeskProps {
  /** the grouped rows (groupFindingsForList) — Whole piece heads, severity-sorted within. */
  readonly groups: readonly FindingGroup[];
  readonly labels: FindingsDeskLabels;
  /** the active filter params the bar renders as selected (echo of the URL's GET params). */
  readonly filters?: { severity?: string; kind?: string; status?: string };
  /** the filter bar's GET action (the dossier URL). Absent ⇒ no bar. */
  readonly filterAction?: string;
  readonly severityOptions?: readonly { value: string; label: string }[];
  readonly kindOptions?: readonly { value: string; label: string }[];
  readonly statusOptions?: readonly { value: string; label: string }[];
  readonly obligationFor?: (view: FindingView) => { state: ObligationStateKind; label: string } | undefined;
  /** per-row action slot (a disposition form mini / Apply button — caller-owned). */
  readonly actionsFor?: (view: FindingView) => ReactNode;
  /** linked selection: the focused finding id (the island syncs Margin ↔ Desk ↔ passage). */
  readonly selectedId?: string;
  /**
   * triage mode (⌘⇧T): the sectioned queue renders instead of the plain groups — escalations pinned,
   * blocking → note within each section, the progress pill up top (§5.7; decisions persist per-verb).
   */
  readonly triage?: TriageQueueView;
  /** the bulk actions' slot (the preview forms — POSTs one consolidated preview, then dispatches). */
  readonly bulkActions?: ReactNode;
}

function DeskRow({
  view,
  labels,
  obligationFor,
  actionsFor,
  selectedId,
}: {
  readonly view: FindingView;
  readonly labels: FindingsDeskLabels;
  readonly obligationFor?: FindingsDeskProps["obligationFor"];
  readonly actionsFor?: FindingsDeskProps["actionsFor"];
  readonly selectedId?: string;
}): ReactNode {
  const obligation = obligationFor?.(view);
  return (
    <tr
      id={`desk-finding-${view.id}`}
      data-desk-row={view.id}
      data-severity={view.severity}
      data-kind={view.kind}
      {...(view.reconciliation === "rejected" ? { "data-rejected": "true" } : {})}
      {...(selectedId === view.id ? { "data-selected": "true" } : {})}
      tabIndex={0}
      style={{ scrollMarginTop: "24px" }}
    >
      <td>
        <a href={`#finding-${view.id}`} data-finding-link={view.id} style={{ color: "inherit" }}>
          {view.title}
        </a>
      </td>
      <td style={{ color: severityColor(view.severity) }}>{labels.severityLabel(view.severity)}</td>
      <td>{labels.kindLabel(view.kind)}</td>
      <td>
        {labels.statusLabel(view)}
        {obligation ? <> <ObligationChip state={obligation.state} label={obligation.label} /></> : null}
      </td>
      {/* the action cell obeys the same disposal gate as the card — provisional/frozen rows show none. */}
      <td>{canDispose({ provisional: view.provisional, disposition: view.disposition ?? null }) ? actionsFor?.(view) : null}</td>
    </tr>
  );
}

/** The Desk's Findings tab — the findings table IS the screen-reader surface (§5.9 a11y). */
export function FindingsDesk(props: FindingsDeskProps): ReactNode {
  const { labels: L, groups } = props;
  const total = groups.reduce((n, g) => n + g.findings.length, 0);
  return (
    <div data-findings-desk="true">
      {props.filterAction ? (
        <form method="get" action={props.filterAction} data-findings-filters="true"
              style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
          <label style={{ fontSize: 12, color: "var(--shell-fg-muted)" }}>
            {L.filters.severity}{" "}
            <select name="sev" defaultValue={props.filters?.severity ?? ""}>
              <option value="">{L.filters.allLabel}</option>
              {(props.severityOptions ?? []).map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </label>
          <label style={{ fontSize: 12, color: "var(--shell-fg-muted)" }}>
            {L.filters.kind}{" "}
            <select name="kind" defaultValue={props.filters?.kind ?? ""}>
              <option value="">{L.filters.allLabel}</option>
              {(props.kindOptions ?? []).map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </label>
          <label style={{ fontSize: 12, color: "var(--shell-fg-muted)" }}>
            {L.filters.status}{" "}
            <select name="disp" defaultValue={props.filters?.status ?? ""}>
              <option value="">{L.filters.allLabel}</option>
              {(props.statusOptions ?? []).map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </label>
          <button type="submit" style={{ fontSize: 12 }}>{L.filters.apply}</button>
          <a href={props.filterAction} style={{ fontSize: 12 }}>{L.filters.clear}</a>
        </form>
      ) : null}

      {props.triage ? (
        <div data-triage-mode="true">
          <p data-triage-progress="true" role="status" style={{ fontSize: 12, color: "var(--shell-fg-muted)" }}>
            {L.progressFmt(props.triage.decided, props.triage.total)}
            {" · "}
            <a href="?">{L.triageExit}</a>
          </p>
          {props.triage.sections.map((s) => (
            <section key={s.key} data-triage-section={s.key} style={{ marginBottom: 14 }}>
              <h4 style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--shell-fg-muted)", margin: "8px 0 4px" }}>
                {L.sectionLabels?.[s.key] ?? s.label}
              </h4>
              <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 13 }}>
                <thead>
                  <tr style={{ textAlign: "left", color: "var(--shell-fg-muted)" }}>
                    <th scope="col">{L.table.finding}</th>
                    <th scope="col">{L.table.severity}</th>
                    <th scope="col">{L.table.kind}</th>
                    <th scope="col">{L.table.status}</th>
                    <th scope="col">{L.table.actions}</th>
                  </tr>
                </thead>
                <tbody>
                  {s.rows.map((v) => (
                    <DeskRow key={v.id} view={v} labels={L}
                      {...(props.obligationFor ? { obligationFor: props.obligationFor } : {})}
                      {...(props.actionsFor ? { actionsFor: props.actionsFor } : {})}
                      {...(props.selectedId ? { selectedId: props.selectedId } : {})} />
                  ))}
                </tbody>
              </table>
            </section>
          ))}
        </div>
      ) : total === 0 ? (
        <p data-findings-empty="true" style={{ fontSize: 13, color: "var(--shell-fg-muted)" }}>{L.empty}</p>
      ) : (
        <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: "left", color: "var(--shell-fg-muted)" }}>
              <th scope="col">{L.table.finding}</th>
              <th scope="col">{L.table.severity}</th>
              <th scope="col">{L.table.kind}</th>
              <th scope="col">{L.table.status}</th>
              <th scope="col">{L.table.actions}</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <Fragment key={g.key}>
                {groups.length > 1 ? (
                  <tr key={`h-${g.key}`} data-desk-group={g.key}>
                    <td colSpan={5} style={{ paddingTop: 8, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--shell-fg-muted)" }}>
                      {g.label}
                    </td>
                  </tr>
                ) : null}
                {g.findings.map((v) => (
                  <DeskRow key={v.id} view={v} labels={L}
                    {...(props.obligationFor ? { obligationFor: props.obligationFor } : {})}
                    {...(props.actionsFor ? { actionsFor: props.actionsFor } : {})}
                    {...(props.selectedId ? { selectedId: props.selectedId } : {})} />
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      )}

      {props.bulkActions ? <div data-bulk-actions="true" style={{ marginTop: 10 }}>{props.bulkActions}</div> : null}
    </div>
  );
}
