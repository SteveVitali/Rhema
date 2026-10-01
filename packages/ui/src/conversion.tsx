import type { ReactNode } from "react";
import { severityColor } from "./primitives.js";

// The §5.3 conversion preview + Conversion-notes card. Source-beside-converted, a count line, an anchored
// warnings list, and the two actions (Create and fix later / Fix now). Text-agnostic — all copy is a prop.

export interface PreviewWarning {
  readonly message: string;
  /** The unconverted block this warning anchors to (if any). */
  readonly blockId?: string | null;
}

export interface ConversionPreviewProps {
  readonly sourceLabel: string; // e.g. "Original.docx"
  readonly sourceText: string;
  readonly convertedMarkdown: string;
  readonly countLine: string;
  readonly warnings: readonly PreviewWarning[];
  readonly actions: {
    readonly formAction: string; // POST target for "Create and fix later"
    readonly createLabel: string;
    readonly fixNowLabel: string;
    /** Hidden inputs the form carries (PRB.20 — the minted quarantine key so create replays it). */
    readonly hiddenFields?: Readonly<Record<string, string>>;
  };
  readonly labels: {
    readonly sourceHeading: string;
    readonly convertedHeading: string;
    readonly warningsHeading: string;
    readonly noWarnings: string;
    readonly fixNowNote: string;
  };
}

const paneStyle = {
  flex: "1 1 320px",
  minWidth: 0,
  border: "1px solid var(--shell-border)",
  borderRadius: "8px",
  background: "var(--shell-surface)",
  padding: "12px",
  maxHeight: "420px",
  overflow: "auto" as const,
};
const preStyle = {
  margin: 0,
  whiteSpace: "pre-wrap" as const,
  wordBreak: "break-word" as const,
  fontFamily: '"JetBrains Mono", ui-monospace, monospace',
  fontSize: "12px",
  color: "var(--shell-fg)",
};

export function ConversionPreview(props: ConversionPreviewProps): ReactNode {
  return (
    <div>
      <p style={{ color: "var(--shell-fg-muted)", fontSize: "13px", fontVariantNumeric: "tabular-nums" }}>
        {props.countLine}
      </p>
      <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
        <section style={paneStyle} aria-label={props.labels.sourceHeading}>
          <h3 style={{ fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--shell-fg-muted)", marginTop: 0 }}>
            {props.labels.sourceHeading} · {props.sourceLabel}
          </h3>
          <pre style={preStyle}>{props.sourceText}</pre>
        </section>
        <section style={paneStyle} aria-label={props.labels.convertedHeading}>
          <h3 style={{ fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--shell-fg-muted)", marginTop: 0 }}>
            {props.labels.convertedHeading}
          </h3>
          <pre style={preStyle}>{props.convertedMarkdown}</pre>
        </section>
      </div>

      <ConversionNotesCard warnings={props.warnings} heading={props.labels.warningsHeading} empty={props.labels.noWarnings} />

      <form method="post" action={props.actions.formAction} style={{ marginTop: "16px", display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "center" }}>
        {Object.entries(props.actions.hiddenFields ?? {}).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}
        <button
          type="submit"
          name="action"
          value="create"
          style={{ padding: "8px 16px", borderRadius: "8px", border: "none", background: "var(--accent)", color: "var(--shell-bg)", fontSize: "14px", fontWeight: 600, cursor: "pointer" }}
        >
          {props.actions.createLabel}
        </button>
        <button
          type="submit"
          name="action"
          value="fix_now"
          style={{ padding: "8px 16px", borderRadius: "8px", border: "1px solid var(--shell-border)", background: "var(--shell-raised)", color: "var(--shell-fg)", fontSize: "14px", cursor: "pointer" }}
        >
          {props.actions.fixNowLabel}
        </button>
        <span style={{ color: "var(--shell-fg-faint)", fontSize: "12px" }}>{props.labels.fixNowNote}</span>
      </form>
    </div>
  );
}

/** The Conversion-notes card: the anchored warnings, shown on the (beta) timeline after Create-and-fix-later. */
export function ConversionNotesCard({
  warnings,
  heading,
  empty,
}: {
  warnings: readonly PreviewWarning[];
  heading: string;
  empty: string;
}): ReactNode {
  return (
    <section
      aria-label={heading}
      style={{ marginTop: "16px", border: "1px solid var(--shell-border)", borderRadius: "8px", padding: "12px", background: "var(--shell-surface)" }}
    >
      <h3 style={{ fontSize: "13px", margin: "0 0 8px", color: "var(--shell-fg)" }}>{heading}</h3>
      {warnings.length === 0 ? (
        <p style={{ color: "var(--state-ready)", fontSize: "13px", margin: 0 }}>{empty}</p>
      ) : (
        <ul style={{ margin: 0, paddingLeft: "18px" }}>
          {warnings.map((w, i) => (
            <li key={i} style={{ fontSize: "13px", color: "var(--shell-fg-muted)", marginBottom: "4px" }}>
              <span aria-hidden="true" style={{ color: severityColor("minor"), marginRight: "6px" }}>
                •
              </span>
              {w.message}
              {w.blockId ? <span style={{ color: "var(--shell-fg-faint)" }}> ({w.blockId})</span> : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
