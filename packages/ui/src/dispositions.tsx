import type { CSSProperties, ReactNode } from "react";
import { Button } from "./primitives/button.js";
import { TextField, TextArea } from "./primitives/fields.js";
import { REASON_CODES, type DispositionKind, type ReasonCode } from "@rhema/contracts";
import { DEFER_DEFAULT_RATIONALE, DISPOSITION_VERBS } from "@rhema/findings-core";

// The §5.7 disposition controls (PRB.05; REQ-IDE-15/27, REQ-MOBILE-11 amended, REQ-BETA-6). Five verbs on
// every finalized finding, the rationale rules, the optional reason chips — one component, two densities:
// `compact` is the §10.1 phone-width input set (the same five verbs + a note; REQ-SPEC-20). No-JS: the
// whole control is a plain <form>; every verb button submits it (the fieldset explains the note rule, so a
// rebut without a note round-trips a 422 and re-renders with the error under the card).

export interface DispositionControlsLabels {
  /** display for each verb (Accept · Adapt · Rebut · Defer · Escalate). */
  readonly verbLabel: (verb: DispositionKind) => string;
  /** the note field's label — must carry the "required for Rebut and Escalate" hint. */
  readonly noteLabel: string;
  /** placeholder — the defer default ("Not this round"). */
  readonly notePlaceholder: string;
  /** the reason-code chip group's legend ("Why? (optional)"). */
  readonly reasonLegend: string;
  /** display for each reason chip. */
  readonly reasonLabel: (code: ReasonCode) => string;
  /** the adapt suggestion textarea's label ("Proposed edit"). */
  readonly adaptLabel: string;
  /** the accept/adapt footnote ("applies at revision time"). */
  readonly appliedNote: string;
}

export interface DispositionControlsProps {
  /** the form action — `POST /p/:slug/review/:runId/findings/:fid/disposition` (or the project-scoped path). */
  readonly formAction: string;
  /** optional redirect target the server returns to after the write (e.g. `/p/:slug` on a gate card row). */
  readonly next?: string;
  /** the finding's current disposition (reversible until freeze — the row is re-editable). */
  readonly current?: {
    readonly kind: DispositionKind;
    readonly rationale?: string;
    readonly adaptedText?: string;
    readonly reasonCode?: ReasonCode;
  };
  /** the finding's suggested replacement text — adapt pre-fills the editable suggestion (§5.7). */
  readonly suggestion?: string | null;
  /** a validation error from the last submit (e.g. a rebut with no rationale). */
  readonly error?: string;
  /** §10.1 phone-width variant — the same five verbs + a note, stacked; never a bulk action. */
  readonly compact?: boolean;
  readonly labels: DispositionControlsLabels;
}

/** The no-JS post's hidden id carriers (RV-36 — prior batches' named-exemption shape). */
function HiddenField({ name, value }: { name: string; value: string }): ReactNode {
  return <input type="hidden" name={name} value={value} />;
}

/** The reason chip radios post `reason_code` through the native no-JS form (RV-36 — a Radix
 *  carrier would need client JS; the chip styling lives on the wrapping label). */
function ReasonRadio(props: React.InputHTMLAttributes<HTMLInputElement>): ReactNode {
  return <input {...props} />;
}

const chipLabel: CSSProperties = {
  display: "inline-flex",
  gap: "5px",
  alignItems: "center",
  fontSize: "12px",
  color: "var(--shell-fg-muted)",
  padding: "3px 8px",
  borderRadius: "999px",
  border: "1px solid var(--shell-border)",
  cursor: "pointer",
};

/** The five-verb disposition control (§5.7). One form: verb buttons + note + reason chips + adapt text. */
export function DispositionControls({
  formAction,
  next,
  current,
  suggestion,
  error,
  compact,
  labels,
}: DispositionControlsProps): ReactNode {
  const showAdapt = suggestion != null || current?.adaptedText != null;
  return (
    <form
      method="post"
      action={formAction}
      data-disposition-form="true"
      data-compact={compact ? "true" : "false"}
      className="ui-c2-g2"
      style={{ display: "flex", flexDirection: "column" }}
    >
      {next != null ? <HiddenField name="next" value={next} /> : null}
      <div
        data-verbs="true"
        className="ui-d-g6"
        style={{ display: "flex", flexDirection: compact ? "column" : "row", flexWrap: "wrap" }}
      >
        {DISPOSITION_VERBS.map((verb) => (
          <Button
            key={verb}
            type="submit"
            name="verb"
            value={verb}
            data-verb={verb}
            data-selected={current?.kind === verb ? "true" : "false"}
            className="ui-t-bcd ui-t-wd"
            style={
              {
                "--d-sev": current?.kind === verb ? "var(--accent)" : "var(--shell-border)",
                "--d-w": current?.kind === verb ? 600 : 500,
              } as CSSProperties
            }
          >
            {labels.verbLabel(verb)}
          </Button>
        ))}
      </div>

      <label className="ui-d-fs ui-t-mut" style={{ display: "block" }}>
        {labels.noteLabel}
        <TextField
          type="text"
          name="note"
          data-note="true"
          defaultValue={current?.rationale ?? ""}
          placeholder={labels.notePlaceholder}
          className="ui-vc-w ui-t-mt3 ui-t-p710 ui-t-r7 ui-d-eb ui-t-fg ui-d-fd"
          style={{
            display: "block",
            boxSizing: "border-box",
            border: "1px solid var(--shell-border)",
          }}
        />
      </label>

      {showAdapt ? (
        <label className="ui-d-fs ui-t-mut" style={{ display: "block" }}>
          {labels.adaptLabel}
          <TextArea
            name="adapted_text"
            data-adapted-text="true"
            defaultValue={current?.adaptedText ?? suggestion ?? ""}
            rows={3}
            className="ui-vc-w ui-t-mt3 ui-t-p710 ui-t-r7 ui-d-eb ui-t-fg ui-d-fd"
            style={{
              display: "block",
              boxSizing: "border-box",
              border: "1px solid var(--shell-border)",
            }}
          />
          <span data-applied-note="true" className="ui-d-s ui-t-fnt">
            {labels.appliedNote}
          </span>
        </label>
      ) : null}

      <fieldset
        data-reason-chips="true"
        className="ui-d-p0 ui-c2-m0 ui-d-g6"
        style={{ border: "none", display: "flex", flexWrap: "wrap" }}
      >
        <legend className="ui-d-s ui-t-fnt ui-d-p0">{labels.reasonLegend}</legend>
        {REASON_CODES.map((code) => (
          <label key={code} style={chipLabel} data-reason-chip={code}>
            <ReasonRadio
              type="radio"
              name="reason_code"
              value={code}
              defaultChecked={current?.reasonCode === code}
            />
            {labels.reasonLabel(code)}
          </label>
        ))}
      </fieldset>

      {error ? (
        <div role="alert" data-disposition-error="true" className="ui-d-fs ui-set-t--warn">
          {error}
        </div>
      ) : null}
    </form>
  );
}

/** The defer prefill (§5.7) — exported so the web layer hints it on an untouched control. */
export const DEFER_PREFILL = DEFER_DEFAULT_RATIONALE;
