import { File, FileText, GitCommitHorizontal, Image as ImageIcon, ListTree, Mic, Paperclip } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { Badge } from "./primitives/index.js";

// The §5.13 artifact Browser (P1.08; REQ-IDE-35/36/37, REQ-VIS-3): typed sections, never a
// filesystem tree. Every row carries the provenance badge (linked to run + phase — ledger D21),
// a lock-state Badge (R7SHELL.2 — the B10 glyph icons are gone: "Working"/"Frozen"/"Inspect only"
// badges replace 🔒/✎/👁), and the freshness note when a describing artifact's subject has moved
// on. The DTO already enforces visibility: `rows` hold SE/SR only, `advancedRows` hold I kinds
// (rendered inside `data-tier="advanced"` wrappers — the Advanced disclosure, REQ-IDE-10), and H
// kinds arrive as `sealedCount`, never a row and never a route. Text-agnostic — all copy via
// `labels` (UXC-30: the "Files" label is COPY-owned, never a literal).
//
// R7SHELL.2 (REQ-SHELL-4): the pane region is deleted from the IDE; this content IS the sidebar's
// expanded project tree — `role="tree"`/`treeitem`/`group` with roving tabindex and the ARIA
// treeview arrow-key walk (Up/Down/Home/End; Left/Right collapse and expand a section).

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
  /** the tree's `aria-label` — COPY-owned ("Files"; UXC-30 — never a literal). */
  readonly heading: string;
  readonly sectionLabel: (key: string) => string;
  /** the provenance badge text — e.g. "Drafter · Draft run · Writing" / "You" / "Imported". */
  readonly provenanceLabel: (p: FileRowView["provenance"]) => string;
  readonly lockTitle: (lock: FileRowView["lock"]) => string;
  /** the visible frozen/working Badge text per lock state (B10 — replaces the lock glyph). */
  readonly lockBadge: (lock: FileRowView["lock"]) => string;
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

/** One Lucide icon per artifact kind (B10 — the OS-glyph icons are gone; UXC-26's icon set). */
function KindIcon({ kind }: { kind: string }): ReactNode {
  const size = 14;
  switch (kind) {
    case "draft":
      return <FileText size={size} aria-hidden />;
    case "outline":
      return <ListTree size={size} aria-hidden />;
    case "figure":
      return <ImageIcon size={size} aria-hidden />;
    case "voice":
      return <Mic size={size} aria-hidden />;
    case "research":
      return <Paperclip size={size} aria-hidden />;
    case "round":
    case "run":
      return <GitCommitHorizontal size={size} aria-hidden />;
    default:
      return <File size={size} aria-hidden />;
  }
}

// The ARIA-treeview keyboard walk is DOM work — the mount site owns it (`app-shell.tsx`'s
// `onProjectTreeKeyDown` wraps this markup; packages/ui compiles without the DOM lib).
// The roving tab stop below (first treeitem tabbable) is all the markup needs.

let tabbableSeen = false;

function Row({ row, hrefs, labels }: { row: FileRowView; hrefs: FilesPaneProps["hrefs"]; labels: FilesPaneLabels }): ReactNode {
  const href = row.draftRef
    ? hrefs.draft(row.draftRef.n)
    : row.figureId != null && hrefs.figure != null
      ? hrefs.figure(row.figureId)
      : hrefs.artifact(row.artifactId);
  // Roving tabindex: the FIRST treeitem carries the group's tab stop; the arrows move within.
  const tabbable = !tabbableSeen;
  tabbableSeen = true;
  return (
    <li
      role="none"
      data-file-row={row.artifactId}
      data-kind={row.kind}
      data-level={row.level}
      data-lock={row.lock}
      {...(row.readOnly ? { "data-readonly": "1" } : {})}
      style={{ padding: "2px 0", fontSize: "12.5px" }}
    >
      <a href={href} role="treeitem" tabIndex={tabbable ? 0 : -1} data-file-link style={{ color: "inherit", display: "inline-flex", alignItems: "center", gap: "6px" }}>
        <KindIcon kind={row.kind} />
        <span>{row.label}</span>
        {/* B10 — the frozen/working Badge replaces the lock glyph on every row. */}
        <Badge
          tone={row.lock === "editable" ? "ok" : "neutral"}
          data-lock-badge={row.lock}
          title={labels.lockTitle(row.lock)}
          aria-label={labels.lockTitle(row.lock)}
        >
          {labels.lockBadge(row.lock)}
        </Badge>
      </a>
      {row.draftRef ? <span style={muted}> · v{row.draftRef.n}</span> : null}
      {row.words != null ? <span style={muted}> · {labels.wordsFmt(row.words)}</span> : null}
      <span
        data-provenance
        {...(row.provenance.runId ? { "data-run": row.provenance.runId } : {})}
        style={{ display: "block", fontSize: "10.5px", paddingLeft: "20px", ...muted }}
      >
        {row.provenance.runId ? (
          <a href={hrefs.run(row.provenance.runId)} style={{ color: "inherit" }} tabIndex={-1}>
            {labels.provenanceLabel(row.provenance)}
          </a>
        ) : (
          labels.provenanceLabel(row.provenance)
        )}
      </span>
      {row.freshness ? (
        <span data-freshness data-stale={row.freshness.stale ? "1" : "0"} style={{ display: "block", fontSize: "10.5px", paddingLeft: "20px", ...muted }}>
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
  tabbableSeen = false; // reset the roving tab stop each render — first treeitem is tabbable
  return (
    <nav data-files-pane data-project-tree aria-label={labels.heading} style={{ fontSize: "12.5px" }}>
      {!anyRows ? <p style={{ ...muted, fontSize: 12 }}>{labels.empty}</p> : null}
      <div role="tree" aria-label={labels.heading} data-files-tree>
        {sections.map((s) => {
          if (s.rows.length === 0 && s.advancedRows.length === 0 && s.sealedCount === 0) return null;
          const advanced = s.key === "advanced";
          const body = (
            <ul role="group" aria-label={labels.sectionLabel(s.key)} style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {s.rows.map((r) => (
                <Row key={r.artifactId} row={r} hrefs={hrefs} labels={labels} />
              ))}
            </ul>
          );
          const extra = (
            <>
              {s.advancedRows.length > 0 ? (
                // I kinds — links only, behind the section's Advanced disclosure (REQ-VIS-3).
                <div data-tier="advanced" data-files-advanced>
                  <div style={{ fontSize: "10.5px", textTransform: "uppercase", letterSpacing: "0.05em", padding: "4px 0 0", ...muted }}>
                    {labels.advancedDisclosure}
                  </div>
                  <ul role="group" aria-label={labels.advancedDisclosure} style={{ listStyle: "none", margin: 0, padding: 0 }}>
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
                  {extra}
                </details>
              ) : (
                <>
                  <div
                    style={{ fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.06em", padding: "4px 0", ...muted }}
                  >
                    {labels.sectionLabel(s.key)}
                  </div>
                  {body}
                  {extra}
                </>
              )}
            </section>
          );
        })}
      </div>
    </nav>
  );
}
