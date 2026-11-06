import type { CSSProperties, ReactNode } from "react";
import type { ClaimUrlView } from "@rhema/findings-core";
import { Chip, FetchedUrlChip } from "./primitives/chips.js";

// The claim ledger table (§5.7; REQ-IDE-25, REQ-OBJ-18/19). Tier, the ClaimVerdict chip, URL + accessed date,
// a per-URL "fetched ✓" chip from the proxy fetch log, and multi-source stance rows. A non-checkable
// `claim.kind` (interpretive/normative/predictive) renders "not a matter of verification" (REQ-OBJ-19).
// Text-agnostic: verdict/kind/stance labels come in as props.
//
// 243a_R7KIT.3e (REQ-COPY-8; C9): the ordinal renders the source id or 1-based numbering — never
// `[0]` — and each claim's verdict text appears ONCE (the duplicate "Contradicted · Tier 1" badge
// is gone; the `data-contradicted-tier1` attribute keeps the integrity marker machine-readable).
// Chips are the two-variant Chip (C6): tier is `variant="static"`; the host and figure links ride
// the action variant / FetchedUrlChip.

export interface ClaimTableRow {
  readonly ordinal: number;
  /** REQ-COPY-8 — the claim's source id (e.g. "C3") when the ledger carries one; the
   *  ordinal display prefers it over 1-based numbering. */
  readonly sourceId?: string;
  readonly text: string;
  readonly tier: 1 | 2 | 3;
  /** canonical ClaimVerdict machine value (for `data-verdict`) + its display label. */
  readonly verdict: string;
  readonly verdictLabel: string;
  /** canonical ClaimKind machine value, when the ledger carries it. */
  readonly kind?: string;
  /** false for a non-checkable kind (REQ-OBJ-19) — renders the "not a matter of verification" line. */
  readonly checkable?: boolean;
  readonly note?: string;
  /** the per-URL views (from findings-core `claimUrlViews`) — each stamped `fetched` from the proxy log. */
  readonly urls: readonly ClaimUrlView[];
  /** P1.13 — a figure-linked Tier-1 claim (§7.5; REQ-VIZ-13): the figure card href the claim verifies. */
  readonly figureHref?: string;
  /** the figure chip's label (e.g. "Figure 2" — document order, resolved upstream). */
  readonly figureLabel?: string;
}

export interface ClaimsTableLabels {
  readonly heading: string;
  readonly tierLabel: (tier: number) => string;
  readonly fetchedLabel: string;
  /** CITE.1 — the chip label for a url covered only by search-hit rows ("Search result"). */
  readonly searchResultLabel?: string;
  readonly stanceLabel?: (stance: string) => string;
  readonly kindLabel?: (kind: string) => string;
  /** the REQ-OBJ-19 line for a non-checkable claim, e.g. "interpretive — not a matter of verification". */
  readonly notCheckableLabel?: (kind?: string) => string;
  readonly accessedLabel?: (accessedAt: string) => string;
  /** the badge for a contradicted Tier-1 claim (the integrity proof).
   * @deprecated REQ-COPY-8 (243a): a verdict is shown once — the label stays accepted for
   * call-site compat but is no longer rendered as a duplicate badge. */
  readonly contradictedTierOneLabel?: string;
}

/** REQ-COPY-8 — the ordinal display: the source id, else 1-based numbering (never "[0]"). */
export function claimOrdinalLabel(row: { readonly ordinal: number; readonly sourceId?: string }): string {
  return row.sourceId != null && row.sourceId !== "" ? `[${row.sourceId}]` : `[${row.ordinal + 1}]`;
}

function hostOf(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function UrlChip({ view, labels }: { view: ClaimUrlView; labels: ClaimsTableLabels }): ReactNode {
  const host = hostOf(view.url);
  const stance = view.stance && labels.stanceLabel ? labels.stanceLabel(view.stance) : view.stance;
  return (
    <span data-claim-url={view.normalizedUrl} data-stance={view.stance ?? undefined} data-url-in-log={view.fetched ? "true" : "false"} className="ui-d-acts">
      {view.fetched ? (
        <FetchedUrlChip
          url={view.url}
          host={host}
          fetchedLabel={view.retrievedBy === "search" ? (labels.searchResultLabel ?? labels.fetchedLabel) : labels.fetchedLabel}
          retrievedBy={view.retrievedBy}
        />
      ) : (
        <Chip label={host} href={view.url} title={view.url} />
      )}
      {stance ? <span className="ui-d-fs ui-d-cm">{stance}</span> : null}
      {view.accessedAt && labels.accessedLabel ? (
        <span className="ui-d-i">{labels.accessedLabel(view.accessedAt)}</span>
      ) : null}
    </span>
  );
}

function ClaimRow({ row, labels }: { row: ClaimTableRow; labels: ClaimsTableLabels }): ReactNode {
  const contradicted = row.tier === 1 && row.verdict === "contradicted";
  const nonCheckable = row.checkable === false;
  return (
    <li
      data-claim={row.ordinal}
      data-tier={row.tier}
      data-verdict={row.verdict}
      data-claim-kind={row.kind ?? undefined}
      data-contradicted-tier1={contradicted ? "true" : undefined}
      className={`ui-claim${contradicted ? " ui-claim--bad" : ""}`}
      style={{ borderBottom: "1px solid var(--paper-rule)", borderLeft: "3px solid transparent" }}
    >
      <div className="ui-d-acts ui-d-mb10" style={{ flexWrap: "wrap" }}>
        <span data-claim-ordinal={row.sourceId ?? String(row.ordinal + 1)} className="ui-d-s ui-d-cm" style={{ fontVariantNumeric: "tabular-nums" }}>
          {claimOrdinalLabel(row)}
        </span>
        <Chip variant="static" label={labels.tierLabel(row.tier)} />
        {nonCheckable ? (
          <span data-not-checkable="true" className="ui-d-s ui-d-cm ui-d-it">
            {labels.notCheckableLabel ? labels.notCheckableLabel(row.kind) : row.kind}
          </span>
        ) : (
          <span
            className={contradicted ? "ui-d-s ui-d-sc ui-d-b" : "ui-d-s ui-d-cm"}
            style={contradicted ? ({ "--d-sev": "var(--sev-blocking)" } as CSSProperties) : undefined}
          >
            {row.verdictLabel}
          </span>
        )}
        {row.figureHref && row.figureLabel ? (
          <Chip data-figure-claim="true" label={row.figureLabel} href={row.figureHref} />
        ) : null}
      </div>
      <div className="ui-d-fs14">{row.text}</div>
      {row.note ? <div className="ui-d-s ui-d-cm ui-d-mt6">{row.note}</div> : null}
      {row.urls.length > 0 ? (
        <div className="ui-d-acts ui-d-mt6" style={{ flexWrap: "wrap" }}>
          {row.urls.map((u) => (
            <UrlChip key={u.normalizedUrl} view={u} labels={labels} />
          ))}
        </div>
      ) : null}
    </li>
  );
}

/** The claim ledger table (§5.7). */
export function ClaimsTable({ rows, labels }: { rows: readonly ClaimTableRow[]; labels: ClaimsTableLabels }): ReactNode {
  return (
    <section data-claims-table="true" aria-label={labels.heading}>
      <h3 className="ui-d-cap ui-d-s ui-d-cm">{labels.heading}</h3>
      <ul className="ui-claim-list" style={{ border: "1px solid var(--paper-rule)", overflow: "hidden", listStyle: "none" }}>
        {rows.map((r) => (
          <ClaimRow key={r.ordinal} row={r} labels={labels} />
        ))}
      </ul>
    </section>
  );
}
