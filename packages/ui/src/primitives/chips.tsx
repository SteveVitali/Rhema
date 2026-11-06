// The moved `primitives.tsx` exports (R7KIT.2): Pill, Chip, FetchedUrlChip, ActionLink +
// severityColor/Tone/Severity — relocated into the `primitives/` directory with their rendered
// behaviour UNCHANGED: every inline declaration moved verbatim into the `.ui-*` rules in
// `../ui-css.ts` (the moved-values legs in `ui-css.test.ts`/`chips.dom.test.tsx` pin the
// equivalence). Every user-facing string is still a prop — no copy lives here (REQ-UX-12).
// 225a_R7KIT.2b turns `Chip` into the two-variant Chip (C6): static never looks clickable —
// the pre-existing call-site markup is byte-identical (the before/after snapshot pins it).

import type { ComponentPropsWithRef, CSSProperties, ReactNode, Ref } from "react";

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

export interface ChipProps extends Omit<
  ComponentPropsWithRef<"span">,
  "children" | "color" | "onSelect" | "ref"
> {
  label: string;
  /**
   * The two variants (C6): `"static"` renders a `<span>` — never an interactive role, tabindex or
   * pointer affordance; `"action"` renders a real control (a link for `href`, a `<button>` for
   * `onSelect`). Inferred from the props when omitted — `href`/`onSelect` ⇒ action.
   */
  variant?: "static" | "action";
  /** Renders the action variant as a link. */
  href?: string;
  /** Renders the action variant as a button. */
  onSelect?: () => void;
  color?: string;
  /** Forwarded to the rendered element (span/a/button — DOM-contract hooks). */
  ref?: Ref<HTMLElement>;
}

/**
 * A generic chip (two variants, C6). `href` renders a link, `onSelect` a button; otherwise a
 * static `<span>` with no interactive affordance. Existing call-site markup is unchanged.
 */
export function Chip({
  label,
  title,
  href,
  onSelect,
  variant,
  color = "var(--shell-fg-muted)",
  className,
  ref,
  ...rest
}: ChipProps): ReactNode {
  const style = { "--ui-chip-fg": color, ...rest.style } as CSSProperties;
  const cls = ["ui-chip", className ?? ""].filter(Boolean).join(" ");
  const kind = variant ?? (href != null || onSelect != null ? "action" : "static");
  if (kind === "action") {
    if (href != null) {
      return (
        <a
          href={href}
          title={title ?? href}
          style={style}
          className={cls}
          rel="noreferrer"
          ref={ref as Ref<HTMLAnchorElement>}
          {...rest}
        >
          {label}
        </a>
      );
    }
    return (
      <button
        type="button"
        title={title}
        style={style}
        className={cls}
        onClick={onSelect}
        ref={ref as Ref<HTMLButtonElement>}
        {...rest}
      >
        {label}
      </button>
    );
  }
  return (
    <span title={title} style={style} className={cls} ref={ref as Ref<HTMLSpanElement>} {...rest}>
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
