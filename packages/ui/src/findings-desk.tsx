import { Fragment, type CSSProperties, type ReactNode } from "react";
import type { FindingView } from "@rhema/contracts";
import { canDispose, type FindingGroup, type TriageQueueView } from "@rhema/findings-core";
import { severityColor } from "./primitives/chips.js";
import { ObligationChip, type ObligationStateKind } from "./chips.js";
import { Button } from "./primitives/button.js";

// 243_R7KIT.3d — the filter bar's selects stay the KIT-1-styled native control inside `FilterSelect`
// (a named GUARD-1 exemption): the bar is a GET form whose SSR document filters server-side with
// zero client JS, where a Radix Select is inert (RV-36). Everything else is kit chrome.

/** A no-JS filter select — a native `<select>` the GET form posts without client JS. */
function FilterSelect({ name, defaultValue, allLabel, options }: { name: string; defaultValue: string; allLabel: string; options: readonly { value: string; label: string }[] }): ReactNode {
  return (
    <select name={name} defaultValue={defaultValue}>
      <option value="">{allLabel}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

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
        <a href={`#finding-${view.id}`} data-finding-link={view.id} className="ui-d-inh">
          {view.title}
        </a>
      </td>
      <td className="ui-d-sc" style={{ "--d-sev": severityColor(view.severity) } as CSSProperties}>{labels.severityLabel(view.severity)}</td>
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
              className="ui-c2-g2 ui-d-mb10"
              style={{ display: "flex", flexWrap: "wrap", alignItems: "center" }}>
          <label className="ui-d-l">
            {L.filters.severity}{" "}
            <FilterSelect name="sev" defaultValue={props.filters?.severity ?? ""} allLabel={L.filters.allLabel} options={props.severityOptions ?? []} />
          </label>
          <label className="ui-d-l">
            {L.filters.kind}{" "}
            <FilterSelect name="kind" defaultValue={props.filters?.kind ?? ""} allLabel={L.filters.allLabel} options={props.kindOptions ?? []} />
          </label>
          <label className="ui-d-l">
            {L.filters.status}{" "}
            <FilterSelect name="disp" defaultValue={props.filters?.status ?? ""} allLabel={L.filters.allLabel} options={props.statusOptions ?? []} />
          </label>
          <Button type="submit" size="sm">{L.filters.apply}</Button>
          <a href={props.filterAction} className="ui-d-l">{L.filters.clear}</a>
        </form>
      ) : null}

      {props.triage ? (
        <div data-triage-mode="true">
          <p data-triage-progress="true" role="status" className="ui-d-l">
            {L.progressFmt(props.triage.decided, props.triage.total)}
            {" · "}
            <a href="?">{L.triageExit}</a>
          </p>
          {props.triage.sections.map((s) => (
            <section key={s.key} data-triage-section={s.key} className="ui-d-mb16">
              <h4 className="ui-d-cap ui-d-l ui-c2-mt ui-c2-mb">
                {L.sectionLabels?.[s.key] ?? s.label}
              </h4>
              <table className="ui-vc-w ui-d-fd" style={{ borderCollapse: "collapse" }}>
                <thead>
                  <tr className="ui-d-t" style={{ textAlign: "left" }}>
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
        <p data-findings-empty="true" className="ui-d-t">{L.empty}</p>
      ) : (
        <table className="ui-vc-w ui-d-fd" style={{ borderCollapse: "collapse" }}>
          <thead>
            <tr className="ui-d-t" style={{ textAlign: "left" }}>
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
                    <td colSpan={5} className="ui-d-pt ui-d-cap ui-d-l">
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

      {props.bulkActions ? <div data-bulk-actions="true" className="ui-d-mt10">{props.bulkActions}</div> : null}
    </div>
  );
}
