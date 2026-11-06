import type { ReactNode } from "react";
import type { ClaimUrlView } from "@rhema/findings-core";
import { Chip, FetchedUrlChip } from "./primitives/chips.js";

// The claim ledger table (§5.7; REQ-IDE-25, REQ-OBJ-18/19). Tier, the ClaimVerdict chip, URL + accessed date,
// a per-URL "fetched ✓" chip from the proxy fetch log, and multi-source stance rows. A non-checkable
// `claim.kind` (interpretive/normative/predictive) renders "not a matter of verification" (REQ-OBJ-19).
// Text-agnostic: verdict/kind/stance labels come in as props.

export interface ClaimTableRow {
  readonly ordinal: number;
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
  /** the badge for a contradicted Tier-1 claim (the integrity proof). */
  readonly contradictedTierOneLabel?: string;
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
    <span data-claim-url={view.normalizedUrl} data-stance={view.stance ?? undefined} data-url-in-log={view.fetched ? "true" : "false"} style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}>
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
      {stance ? <span style={{ fontSize: "11px", color: "var(--paper-fg-muted)" }}>{stance}</span> : null}
      {view.accessedAt && labels.accessedLabel ? (
        <span style={{ fontSize: "11px", color: "var(--paper-fg-faint)" }}>{labels.accessedLabel(view.accessedAt)}</span>
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
      style={{
        listStyle: "none",
        padding: "12px 14px",
        borderBottom: "1px solid var(--paper-rule)",
        borderLeft: contradicted ? "3px solid var(--sev-blocking)" : "3px solid transparent",
      }}
    >
      <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap", marginBottom: "4px" }}>
        <span style={{ color: "var(--paper-fg-muted)", fontVariantNumeric: "tabular-nums", fontSize: "12px" }}>[{row.ordinal}]</span>
        <span style={{ fontSize: "11px", padding: "1px 6px", borderRadius: "4px", background: "var(--shell-raised)", color: "var(--shell-fg-muted)" }}>
          {labels.tierLabel(row.tier)}
        </span>
        {nonCheckable ? (
          <span data-not-checkable="true" style={{ fontSize: "12px", color: "var(--paper-fg-muted)", fontStyle: "italic" }}>
            {labels.notCheckableLabel ? labels.notCheckableLabel(row.kind) : row.kind}
          </span>
        ) : (
          <span style={{ fontSize: "12px", fontWeight: contradicted ? 600 : 400, color: contradicted ? "var(--sev-blocking)" : "var(--paper-fg-muted)" }}>
            {row.verdictLabel}
          </span>
        )}
        {contradicted && labels.contradictedTierOneLabel ? (
          <span style={{ fontSize: "11px", fontWeight: 600, padding: "1px 6px", borderRadius: "4px", background: "var(--sev-blocking)", color: "var(--shell-bg)" }}>
            {labels.contradictedTierOneLabel}
          </span>
        ) : null}
        {row.figureHref && row.figureLabel ? (
          <a
            data-figure-claim="true"
            href={row.figureHref}
            style={{ fontSize: "11px", padding: "1px 6px", borderRadius: "4px", background: "var(--shell-raised)", color: "var(--accent)", textDecoration: "none" }}
          >
            {row.figureLabel}
          </a>
        ) : null}
      </div>
      <div style={{ color: "var(--paper-fg)", fontSize: "14px", lineHeight: 1.5 }}>{row.text}</div>
      {row.note ? <div style={{ color: "var(--paper-fg-muted)", fontSize: "12px", marginTop: "4px" }}>{row.note}</div> : null}
      {row.urls.length > 0 ? (
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "8px" }}>
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
      <h3 style={{ fontSize: "13px", textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--paper-fg-muted)" }}>{labels.heading}</h3>
      <ul style={{ margin: "8px 0 0", padding: 0, border: "1px solid var(--paper-rule)", borderRadius: "8px", overflow: "hidden" }}>
        {rows.map((r) => (
          <ClaimRow key={r.ordinal} row={r} labels={labels} />
        ))}
      </ul>
    </section>
  );
}
