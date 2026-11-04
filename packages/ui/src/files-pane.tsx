import type { CSSProperties, ReactNode } from "react";

// The §5.13 artifact Browser (P1.08; REQ-IDE-35/36/37, REQ-VIS-3): typed sections, never a
// filesystem tree. Every row carries the provenance badge (linked to run + phase — ledger D21), a
// lock-state icon (✎ editable · 🔒 immutable · 👁 inspect-only), and the freshness note when a
// describing artifact's subject has moved on. The DTO already enforces visibility: `rows` hold
// SE/SR only, `advancedRows` hold I kinds (rendered inside `data-tier="advanced"` wrappers — the
// pane's Advanced disclosure, REQ-IDE-10), and H kinds arrive as `sealedCount` ("⛔ N sealed"),
// never a row and never a route. Text-agnostic — all copy via `labels`.

export interface FileRowView {
  readonly artifactId: string;
  readonly kind: string;
  readonly label: string;
  readonly level: "SE" | "SR" | "I";
  readonly editMode: string;
  readonly lock: "editable" | "immutable" | "inspect";
  readonly readOnly: boolean;
  readonly words: number | null;
  readonly createdAt: string | null;
  readonly provenance: {
    readonly actor: "you" | "system" | "agent";
    readonly userId?: string;
    readonly seat?: string;
    readonly runId?: string;
    readonly workflow?: string;
    readonly phase?: string;
  };
  readonly draftRef?: { readonly n: number; readonly state: string };
  /** R7DEM.5 — a figure row's figure-card id (demo: a binary asset has no artifact page). */
  readonly figureId?: string;
  readonly freshness?: { readonly subjectDraftN: number; readonly stale: boolean };
}

export interface FileSectionView {
  readonly key: string;
  readonly rows: readonly FileRowView[];
  readonly advancedRows: readonly FileRowView[];
  readonly sealedCount: number;
}

export interface FilesPaneLabels {
  readonly sectionLabel: (key: string) => string;
  /** the provenance badge text — e.g. "Drafter · Draft run · Writing" / "You" / "Imported". */
  readonly provenanceLabel: (p: FileRowView["provenance"]) => string;
  readonly lockTitle: (lock: FileRowView["lock"]) => string;
  readonly lockIcon: (lock: FileRowView["lock"]) => string;
  /** "describes v{n} — since edited" when stale; "describes v{n}" otherwise. */
  readonly freshnessLabel: (subjectDraftN: number, stale: boolean) => string;
  readonly sealedFmt: (n: number) => string;
  readonly advancedDisclosure: string;
  readonly empty: string;
  readonly wordsFmt: (n: number) => string;
  readonly readOnlyNote: string;
}

export interface FilesPaneProps {
  readonly sections: readonly FileSectionView[];
  readonly hrefs: {
    readonly artifact: (artifactId: string) => string;
    readonly draft: (n: number) => string;
    readonly run: (runId: string) => string;
    /** R7DEM.5 — a figure row's card link (absent ⇒ figure rows fall back to `artifact`). */
    readonly figure?: (figureId: string) => string;
  };
  readonly labels: FilesPaneLabels;
}

const muted: CSSProperties = { color: "var(--shell-fg-muted, #9aa3ad)" };

function Row({ row, hrefs, labels }: { row: FileRowView; hrefs: FilesPaneProps["hrefs"]; labels: FilesPaneLabels }): ReactNode {
  const href = row.draftRef
    ? hrefs.draft(row.draftRef.n)
    : row.figureId != null && hrefs.figure != null
      ? hrefs.figure(row.figureId)
      : hrefs.artifact(row.artifactId);
  return (
    <li
      data-file-row={row.artifactId}
      data-kind={row.kind}
      data-level={row.level}
      data-lock={row.lock}
      {...(row.readOnly ? { "data-readonly": "1" } : {})}
      style={{ padding: "3px 0", fontSize: "12.5px" }}
    >
      <span data-lock-icon title={labels.lockTitle(row.lock)} aria-label={labels.lockTitle(row.lock)}>
        {labels.lockIcon(row.lock)}{" "}
      </span>
      <a href={href} data-file-link style={{ color: "inherit" }}>
        {row.label}
      </a>
      {row.draftRef ? <span style={muted}> · v{row.draftRef.n}</span> : null}
      {row.words != null ? <span style={muted}> · {labels.wordsFmt(row.words)}</span> : null}
      <span
        data-provenance
        {...(row.provenance.runId ? { "data-run": row.provenance.runId } : {})}
        style={{ display: "block", fontSize: "10.5px", paddingLeft: "18px", ...muted }}
      >
        {row.provenance.runId ? (
          <a href={hrefs.run(row.provenance.runId)} style={{ color: "inherit" }}>
            {labels.provenanceLabel(row.provenance)}
          </a>
        ) : (
          labels.provenanceLabel(row.provenance)
        )}
      </span>
      {row.freshness ? (
        <span data-freshness data-stale={row.freshness.stale ? "1" : "0"} style={{ display: "block", fontSize: "10.5px", paddingLeft: "18px", ...muted }}>
          {labels.freshnessLabel(row.freshness.subjectDraftN, row.freshness.stale)}
        </span>
      ) : null}
      {row.readOnly ? (
        <span data-readonly-note className="sr-only">
          {labels.readOnlyNote}
        </span>
      ) : null}
    </li>
  );
}

export function FilesPane({ sections, hrefs, labels }: FilesPaneProps): ReactNode {
  const anyRows = sections.some((s) => s.rows.length + s.advancedRows.length > 0);
  return (
    <nav data-files-pane aria-label="Files" style={{ fontSize: "12.5px" }}>
      {!anyRows ? <p style={{ ...muted, fontSize: 12 }}>{labels.empty}</p> : null}
      {sections.map((s) => {
        if (s.rows.length === 0 && s.advancedRows.length === 0 && s.sealedCount === 0) return null;
        const advanced = s.key === "advanced";
        const body = (
          <>
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {s.rows.map((r) => (
                <Row key={r.artifactId} row={r} hrefs={hrefs} labels={labels} />
              ))}
            </ul>
            {s.advancedRows.length > 0 ? (
              // I kinds — links only, behind the section's Advanced disclosure (REQ-VIS-3).
              <div data-tier="advanced" data-files-advanced>
                <div style={{ fontSize: "10.5px", textTransform: "uppercase", letterSpacing: "0.05em", padding: "4px 0 0", ...muted }}>
                  {labels.advancedDisclosure}
                </div>
                <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                  {s.advancedRows.map((r) => (
                    <Row key={r.artifactId} row={r} hrefs={hrefs} labels={labels} />
                  ))}
                </ul>
              </div>
            ) : null}
            {s.sealedCount > 0 ? (
              // §5.13's hidden kinds — "sealed as counts" (⛔), never a row or a route.
              <div data-sealed-count={s.sealedCount} style={{ fontSize: "10.5px", padding: "2px 0", ...muted }}>
                ⛔ {labels.sealedFmt(s.sealedCount)}
              </div>
            ) : null}
          </>
        );
        return (
          <section key={s.key} data-files-section={s.key} style={{ marginBottom: "10px" }}>
            {advanced ? (
              // The Advanced section itself is a disclosure control (§5.13: "Advanced (disclosure)").
              <details data-tier="advanced" data-files-advanced-section>
                <summary
                  style={{ cursor: "pointer", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.06em", ...muted }}
                >
                  {labels.sectionLabel(s.key)}
                </summary>
                {body}
              </details>
            ) : (
              <>
                <div
                  style={{ fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.06em", padding: "4px 0", ...muted }}
                >
                  {labels.sectionLabel(s.key)}
                </div>
                {body}
              </>
            )}
          </section>
        );
      })}
    </nav>
  );
}
