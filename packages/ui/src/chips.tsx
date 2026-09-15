import type { CSSProperties, ReactNode } from "react";
import type { TrustChip as TrustChipModel } from "@rhema/findings-core";

// Integrity-as-a-feature chips (§6.6, §11.7; REQ-IDE-31, REQ-PROD-2, REQ-OBJ-6). The trust chip renders the
// runtime boundary attestation (text derived only from `access_report` by findings-core); the obligation chip
// renders a finding's obligation state; the version header carries the open/addressed obligation summary. All
// text-agnostic (copy in as props).

/**
 * The runtime trust chip (REQ-IDE-31; REQ-PROD-2). Renders the `TrustChip` built by findings-core from the
 * `access_report` — the component itself invents no text, so the chip cannot show anything the sandbox authored.
 */
export function TrustChip({ chip }: { chip: TrustChipModel }): ReactNode {
  return (
    <div
      data-trust-chip="true"
      data-fetches={chip.facts.fetches}
      data-denied={chip.facts.deniedAttempts}
      data-second-read-scoped={chip.facts.secondReadScoped ? "true" : "false"}
      role="note"
      style={{
        display: "flex",
        alignItems: "center",
        gap: "8px",
        padding: "10px 14px",
        borderRadius: "8px",
        border: "1px solid var(--state-ready)",
        background: "var(--shell-surface)",
        color: "var(--shell-fg)",
        fontSize: "13px",
        lineHeight: 1.5,
      }}
    >
      <span aria-hidden="true" style={{ color: "var(--state-ready)", flexShrink: 0 }}>
        ✓
      </span>
      <span>{chip.text}</span>
    </div>
  );
}

/** Obligation states (§11.7). `mooted` renders as discharged-pending until confirmed at the next triage. */
export type ObligationStateKind =
  | "open"
  | "addressed"
  | "discharged"
  | "rebutted"
  | "deferred"
  | "mooted"
  | "reopened";

const OBLIGATION_COLOR: Record<ObligationStateKind, string> = {
  open: "var(--state-needs-you)",
  addressed: "var(--state-running)",
  discharged: "var(--state-ready)",
  rebutted: "var(--shell-fg-muted)",
  deferred: "var(--shell-fg-muted)",
  mooted: "var(--state-ready)",
  reopened: "var(--sev-major)",
};

/** A single obligation-state chip on a blocking/major finding card (REQ-OBJ-6). */
export function ObligationChip({ state, label }: { state: ObligationStateKind; label: string }): ReactNode {
  const style: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: "5px",
    padding: "1px 8px",
    borderRadius: "6px",
    border: "1px solid var(--shell-border)",
    background: "var(--shell-surface)",
    color: "var(--shell-fg-muted)",
    fontSize: "12px",
    whiteSpace: "nowrap",
  };
  return (
    <span data-obligation-state={state} style={style}>
      <span aria-hidden="true" style={{ width: "7px", height: "7px", borderRadius: "999px", background: OBLIGATION_COLOR[state] }} />
      {label}
    </span>
  );
}

/** The version header's open-obligations chip `⚑ 3 open · 2 addressed` (REQ-OBJ-6; §5.8). */
export function VersionObligationChip({
  open,
  addressed,
  label,
}: {
  open: number;
  addressed: number;
  /** the composed copy, e.g. "⚑ 3 open · 2 addressed" — built by the app so vocab lint covers it. */
  label: string;
}): ReactNode {
  return (
    <span
      data-version-obligations="true"
      data-open={open}
      data-addressed={addressed}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "5px",
        padding: "2px 10px",
        borderRadius: "999px",
        border: "1px solid var(--shell-border)",
        background: "var(--shell-raised)",
        color: "var(--shell-fg)",
        fontSize: "12px",
        fontVariantNumeric: "tabular-nums",
      }}
    >
      {label}
    </span>
  );
}
