import type { CSSProperties, ReactNode } from "react";

// Small presentational primitives for the beta flat shell. Every user-facing string is passed in as a prop —
// the primitives hold no copy, so the i18n vocabulary lint (Appendix D.2) lives over the app's copy table, not
// here. Styling is inline against the §5.9 CSS custom properties (from @rhema/tokens) so a single injected
// stylesheet themes the whole SSR document.

/** Semantic tone → a §5.9 state/severity colour. */
export type Tone = "running" | "needs_you" | "ready" | "attention" | "neutral";

const TONE_COLOR: Record<Tone, string> = {
  running: "var(--state-running)",
  needs_you: "var(--state-needs-you)",
  ready: "var(--state-ready)",
  attention: "var(--sev-major)",
  neutral: "var(--shell-fg-muted)",
};

export type Severity = "blocking" | "major" | "minor" | "note";
const SEVERITY_COLOR: Record<Severity, string> = {
  blocking: "var(--sev-blocking)",
  major: "var(--sev-major)",
  minor: "var(--sev-minor)",
  note: "var(--sev-note)",
};

export function severityColor(sev: string): string {
  return SEVERITY_COLOR[sev as Severity] ?? "var(--sev-note)";
}

/** A small status pill (the project-state pill; §6.3). Colour by tone, with a dot so it is not colour-only. */
export function Pill({ label, tone = "neutral" }: { label: string; tone?: Tone }): ReactNode {
  const color = TONE_COLOR[tone];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "6px",
        padding: "2px 10px",
        borderRadius: "999px",
        border: "1px solid var(--shell-border)",
        background: "var(--shell-raised)",
        color: "var(--shell-fg)",
        fontSize: "12px",
        fontVariantNumeric: "tabular-nums",
        whiteSpace: "nowrap",
      }}
    >
      <span aria-hidden="true" style={{ width: "7px", height: "7px", borderRadius: "999px", background: color }} />
      {label}
    </span>
  );
}

/** A generic chip. `href` makes it a link; otherwise a static tag. */
export function Chip({
  label,
  title,
  href,
  color = "var(--shell-fg-muted)",
}: {
  label: string;
  title?: string;
  href?: string;
  color?: string;
}): ReactNode {
  const style: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: "5px",
    padding: "1px 8px",
    borderRadius: "6px",
    border: `1px solid var(--shell-border)`,
    background: "var(--shell-surface)",
    color,
    fontSize: "12px",
    textDecoration: "none",
    maxWidth: "100%",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  };
  if (href) {
    return (
      <a href={href} title={title ?? href} style={style} rel="noreferrer">
        {label}
      </a>
    );
  }
  return (
    <span title={title} style={style}>
      {label}
    </span>
  );
}

/**
 * The fetched-URL chip (REQ-POS-3 / §12.7): a source the fact-check actually retrieved. It carries a "✓
 * fetched" marker so the reader can see, at a glance, that a citation is fetch-backed and not model memory.
 */
export function FetchedUrlChip({
  url,
  host,
  fetchedLabel,
}: {
  url: string;
  host: string;
  fetchedLabel: string;
}): ReactNode {
  return (
    <a
      href={url}
      rel="noreferrer"
      title={url}
      data-fetched="true"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "5px",
        padding: "1px 8px",
        borderRadius: "6px",
        border: "1px solid var(--state-ready)",
        background: "var(--shell-surface)",
        color: "var(--shell-fg)",
        fontSize: "12px",
        textDecoration: "none",
        fontVariantNumeric: "tabular-nums",
      }}
    >
      <span aria-hidden="true" style={{ color: "var(--state-ready)" }}>
        ✓
      </span>
      <span style={{ color: "var(--shell-fg-muted)" }}>{fetchedLabel}</span>
      <span>{host}</span>
    </a>
  );
}

/** A primary action rendered as a link (the flat shell navigates full-page; no client JS). */
export function ActionLink({ label, href }: { label: string; href: string }): ReactNode {
  return (
    <a
      href={href}
      style={{
        display: "inline-block",
        padding: "6px 14px",
        borderRadius: "8px",
        background: "var(--accent)",
        color: "var(--shell-bg)",
        fontSize: "13px",
        fontWeight: 600,
        textDecoration: "none",
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </a>
  );
}
