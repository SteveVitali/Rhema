import type { CSSProperties, ReactNode } from "react";
import { Button } from "./primitives/button.js";
import { severityColor } from "./primitives/chips.js";
import { MarkdownProse } from "./markdown-prose.js";

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
  /** REQ-HOME-5 — the document title a leading H1 supplied (never silently dropped). */
  readonly title?: string | null;
  readonly countLine: string;
  readonly warnings: readonly PreviewWarning[];
  readonly actions: {
    readonly formAction: string; // POST target for "Create and fix later"
    readonly createLabel: string;
    /** REQ-HOME-5 — the single CTA a CLEAN conversion offers (no warnings ⇒ no Fix now). */
    readonly createCleanLabel?: string;
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
// REQ-HOME-5 — the converted pane is TYPESET in the paper face (the source pane stays the mono
// byte view; the converted side reads like the Page the draft becomes).
const convertedStyle = {
  ...preStyle,
  fontFamily: "var(--font-paper, var(--font-shell))",
  fontSize: "15px",
  lineHeight: 1.6,
};

/** The no-JS conversion post's hidden carriers (RV-36 — prior batches' named-exemption shape). */
function HiddenField({ name, value }: { name: string; value: string }): ReactNode {
  return <input type="hidden" name={name} value={value} />;
}

export function ConversionPreview(props: ConversionPreviewProps): ReactNode {
  return (
    <div>
      <p className="ui-t-mut ui-d-fd" style={{ fontVariantNumeric: "tabular-nums" }}>
        {props.countLine}
      </p>
      <div className="ui-t-g16" style={{ display: "flex", flexWrap: "wrap" }}>
        <section style={paneStyle} aria-label={props.labels.sourceHeading}>
          <h2 className="ui-d-fs ui-t-ls6 ui-t-mut ui-t-mt0" style={{ textTransform: "uppercase" }}>
            {props.labels.sourceHeading} · {props.sourceLabel}
          </h2>
          <pre style={preStyle}>{props.sourceText}</pre>
        </section>
        <section style={paneStyle} aria-label={props.labels.convertedHeading}>
          <h2 className="ui-d-fs ui-t-ls6 ui-t-mut ui-t-mt0" style={{ textTransform: "uppercase" }}>
            {props.labels.convertedHeading}
          </h2>
          {props.title ? (
            <p data-conversion-title className="ui-c2-mb ui-t-f16 ui-d-b ui-t-fg ui-t-ffp">
              {props.title}
            </p>
          ) : null}
          <div data-converted-pane style={convertedStyle}>
            <MarkdownProse text={props.convertedMarkdown} />
          </div>
        </section>
      </div>

      {/* SPA.6 — renderer-agnostic hooks (REQ-VFY-4): journeys locate the create surface by
          `data-conversion-form`/`data-conversion-action`, never the POST action string.
          F-R7DEP.2-4 — the Conversion-notes card renders INSIDE the form's hook: the
          `title_extracted` normalization is part of the create surface's text, and the
          journey reads the notes off `[data-conversion-form]` itself. */}
      <form
        method="post"
        action={props.actions.formAction}
        data-conversion-form="true"
        className="ui-c2-mt4 ui-c2-g3"
      >
        <ConversionNotesCard
          warnings={props.warnings}
          heading={props.labels.warningsHeading}
          empty={props.labels.noWarnings}
        />
        <div className="ui-c2-g3" style={{ display: "flex", flexWrap: "wrap", alignItems: "center" }}>
        {Object.entries(props.actions.hiddenFields ?? {}).map(([name, value]) => (
          <HiddenField key={name} name={name} value={value} />
        ))}
        <Button type="submit" name="action" value="create" data-conversion-action="create">
          {props.warnings.length === 0
            ? (props.actions.createCleanLabel ?? props.actions.createLabel)
            : props.actions.createLabel}
        </Button>
        {props.warnings.length > 0 ? (
          <>
            <Button type="submit" name="action" value="fix_now" data-conversion-action="fix_now">
              {props.actions.fixNowLabel}
            </Button>
            <span className="ui-t-fnt ui-d-fs">{props.labels.fixNowNote}</span>
          </>
        ) : null}
        </div>
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
      className="ui-c2-mt4 ui-t-r2 ui-t-p12 ui-d-rc"
      style={{ border: "1px solid var(--shell-border)" }}
    >
      <h3 className="ui-d-fd ui-c2-mb ui-t-fg">{heading}</h3>
      {warnings.length === 0 ? (
        <p className="ui-set-t--ok ui-d-fd ui-c2-m0">{empty}</p>
      ) : (
        <ul className="ui-c2-m0 ui-t-pl18">
          {warnings.map((w, i) => (
            <li key={i} className="ui-d-fd ui-t-mut ui-t-mb4">
              <span
                aria-hidden="true"
                className="ui-d-sc ui-t-mr6"
                style={{ "--d-sev": severityColor("minor") } as CSSProperties}
              >
                •
              </span>
              {w.message}
              {w.blockId ? <span className="ui-t-fnt"> ({w.blockId})</span> : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
