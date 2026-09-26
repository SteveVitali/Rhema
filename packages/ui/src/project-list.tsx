import type { ReactNode } from "react";
import { Pill, ActionLink, type Tone } from "./primitives.js";

// The beta project list (REQ-PROD-9): one row per project — title (link into the flat project view), the §6.3
// pill, and the single primary action. The row holds no stored status; the caller derived `pill`/`action`
// from the state function and mapped them onto this view.

export interface ProjectRowView {
  readonly title: string;
  /** Canonical project URL (`/p/:slug`). */
  readonly href: string;
  readonly pill: { readonly label: string; readonly tone?: Tone };
  /** The one primary action (Suggested next). Absent for terminal/quiet states. */
  readonly action?: { readonly label: string; readonly href: string };
}

export function ProjectRow({ row }: { row: ProjectRowView }): ReactNode {
  return (
    <li
      style={{
        display: "flex",
        alignItems: "center",
        gap: "12px",
        flexWrap: "wrap",
        padding: "14px 16px",
        borderBottom: "1px solid var(--shell-border)",
      }}
    >
      <a
        href={row.href}
        style={{ color: "var(--shell-fg)", textDecoration: "none", fontWeight: 500, fontSize: "15px", flex: "1 1 200px" }}
      >
        {row.title}
      </a>
      <Pill label={row.pill.label} tone={row.pill.tone} />
      {row.action ? <ActionLink label={row.action.label} href={row.action.href} /> : null}
    </li>
  );
}

export function ProjectList({
  rows,
  emptyLabel,
}: {
  rows: readonly ProjectRowView[];
  emptyLabel: string;
}): ReactNode {
  if (rows.length === 0) {
    return <p style={{ color: "var(--shell-fg-muted)", fontSize: "14px" }}>{emptyLabel}</p>;
  }
  return (
    <ul
      style={{
        listStyle: "none",
        margin: 0,
        padding: 0,
        border: "1px solid var(--shell-border)",
        borderRadius: "12px",
        overflow: "hidden",
        background: "var(--shell-surface)",
      }}
    >
      {rows.map((row) => (
        <ProjectRow key={row.href} row={row} />
      ))}
    </ul>
  );
}
