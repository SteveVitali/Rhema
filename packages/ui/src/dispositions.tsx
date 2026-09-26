import type { CSSProperties, ReactNode } from "react";
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

const verbButton: CSSProperties = {
  padding: "7px 12px",
  borderRadius: "7px",
  border: "1px solid var(--shell-border)",
  background: "var(--shell-raised)",
  color: "var(--shell-fg)",
  fontSize: "13px",
  fontWeight: 500,
  cursor: "pointer",
};

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
      style={{ display: "flex", flexDirection: "column", gap: "8px" }}
    >
      {next != null ? <input type="hidden" name="next" value={next} /> : null}
      <div
        data-verbs="true"
        style={{
          display: "flex",
          flexDirection: compact ? "column" : "row",
          gap: "6px",
          flexWrap: "wrap",
        }}
      >
        {DISPOSITION_VERBS.map((verb) => (
          <button
            key={verb}
            type="submit"
            name="verb"
            value={verb}
            data-verb={verb}
            data-selected={current?.kind === verb ? "true" : "false"}
            style={{
              ...verbButton,
              borderColor: current?.kind === verb ? "var(--accent)" : "var(--shell-border)",
              fontWeight: current?.kind === verb ? 600 : 500,
            }}
          >
            {labels.verbLabel(verb)}
          </button>
        ))}
      </div>

      <label style={{ display: "block", fontSize: "12px", color: "var(--shell-fg-muted)" }}>
        {labels.noteLabel}
        <input
          type="text"
          name="note"
          data-note="true"
          defaultValue={current?.rationale ?? ""}
          placeholder={labels.notePlaceholder}
          style={{
            display: "block",
            width: "100%",
            boxSizing: "border-box",
            marginTop: "3px",
            padding: "7px 10px",
            borderRadius: "7px",
            border: "1px solid var(--shell-border)",
            background: "var(--shell-bg)",
            color: "var(--shell-fg)",
            fontSize: "13px",
          }}
        />
      </label>

      {showAdapt ? (
        <label style={{ display: "block", fontSize: "12px", color: "var(--shell-fg-muted)" }}>
          {labels.adaptLabel}
          <textarea
            name="adapted_text"
            data-adapted-text="true"
            defaultValue={current?.adaptedText ?? suggestion ?? ""}
            rows={3}
            style={{
              display: "block",
              width: "100%",
              boxSizing: "border-box",
              marginTop: "3px",
              padding: "7px 10px",
              borderRadius: "7px",
              border: "1px solid var(--shell-border)",
              background: "var(--shell-bg)",
              color: "var(--shell-fg)",
              fontSize: "13px",
            }}
          />
          <span data-applied-note="true" style={{ fontSize: "11px", color: "var(--shell-fg-faint)" }}>
            {labels.appliedNote}
          </span>
        </label>
      ) : null}

      <fieldset
        data-reason-chips="true"
        style={{ border: "none", padding: 0, margin: 0, display: "flex", gap: "6px", flexWrap: "wrap" }}
      >
        <legend style={{ fontSize: "11px", color: "var(--shell-fg-faint)", padding: 0 }}>
          {labels.reasonLegend}
        </legend>
        {REASON_CODES.map((code) => (
          <label key={code} style={chipLabel} data-reason-chip={code}>
            <input
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
        <div role="alert" data-disposition-error="true" style={{ fontSize: "12px", color: "var(--sev-major)" }}>
          {error}
        </div>
      ) : null}
    </form>
  );
}

/** The defer prefill (§5.7) — exported so the web layer hints it on an untouched control. */
export const DEFER_PREFILL = DEFER_DEFAULT_RATIONALE;
