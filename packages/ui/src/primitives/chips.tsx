// The moved `primitives.tsx` exports (R7KIT.2): Pill, Chip, FetchedUrlChip, ActionLink +
// severityColor/Tone/Severity — relocated into the `primitives/` directory with their rendered
// behaviour UNCHANGED: every inline declaration moved verbatim into the `.ui-*` rules in
// `../ui-css.ts` (the moved-values legs in `ui-css.test.ts`/`chips.dom.test.tsx` pin the
// equivalence). Every user-facing string is still a prop — no copy lives here (REQ-UX-12).
// 225a_R7KIT.2b turns `Chip` into the two-variant Chip.

import type { CSSProperties, ReactNode } from "react";

/** Semantic tone → a §5.9 state/severity colour (the `.ui-pill--*` modifiers in uiCss). */
export type Tone = "running" | "needs_you" | "ready" | "attention" | "neutral";

const TONE_MODIFIER: Record<Tone, string> = {
  running: "ui-pill--running",
  needs_you: "ui-pill--needs-you",
  ready: "ui-pill--ready",
  attention: "ui-pill--attention",
  neutral: "",
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
  return (
    <span className={["ui-pill", TONE_MODIFIER[tone]].filter(Boolean).join(" ")}>
      <span aria-hidden="true" className="ui-pill-dot" />
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
  const style = { "--ui-chip-fg": color } as CSSProperties;
  if (href) {
    return (
      <a href={href} title={title ?? href} style={style} className="ui-chip" rel="noreferrer">
        {label}
      </a>
    );
  }
  return (
    <span title={title} style={style} className="ui-chip">
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
  retrievedBy = "fetch",
}: {
  url: string;
  host: string;
  fetchedLabel: string;
  /** CITE.1 — `"search"` renders the "Search result" variant (a search-hit chip, not a page fetch). */
  retrievedBy?: "fetch" | "search";
}): ReactNode {
  const searchHit = retrievedBy === "search";
  return (
    <a
      href={url}
      rel="noreferrer"
      title={url}
      data-fetched={searchHit ? "search" : "true"}
      className="ui-fetch-chip"
    >
      {searchHit ? null : (
        <span aria-hidden="true" className="ui-fetch-chip-mark">
          ✓
        </span>
      )}
      <span className="ui-fetch-chip-label">{fetchedLabel}</span>
      <span>{host}</span>
    </a>
  );
}

/** A primary action rendered as a link (the flat shell navigates full-page; no client JS). */
export function ActionLink({ label, href }: { label: string; href: string }): ReactNode {
  return (
    <a href={href} className="ui-action-link">
      {label}
    </a>
  );
}
