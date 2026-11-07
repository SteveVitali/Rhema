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
      className="ui-c2-g2 ui-t-p1014 ui-t-r2 ui-d-rc ui-t-fg ui-d-fd ui-t-lh5"
      style={{ display: "flex", alignItems: "center", border: "1px solid var(--state-ready)" }}
    >
      <span aria-hidden="true" className="ui-set-t--ok" style={{ flexShrink: 0 }}>
        ✓
      </span>
      <span>{chip.text}</span>
    </div>
  );
}

/** Obligation states (§11.7). `mooted` renders as discharged-pending until confirmed at the next triage. */
export type ObligationStateKind =
  "open" | "addressed" | "discharged" | "rebutted" | "deferred" | "mooted" | "reopened";

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
export function ObligationChip({
  state,
  label,
}: {
  state: ObligationStateKind;
  label: string;
}): ReactNode {
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
      <span
        aria-hidden="true"
        className="ui-t-s7 ui-t-rp ui-d-sev"
        style={{ "--d-sev": OBLIGATION_COLOR[state] } as CSSProperties}
      />
      {label}
    </span>
  );
}

/**
 * The §14.5 level-0 balance chip (PRB.12): spendable credits in the shell header; the held figure rides on
 * the tooltip (`title`) — "held on hover" is the whole level-0 contract. Text comes in as props so copy stays
 * in the app's vocab-linted layer.
 */
export function BalanceChip({
  spendableCredits,
  heldCredits,
  label,
  heldTitle,
}: {
  readonly spendableCredits: number;
  readonly heldCredits?: number;
  /** e.g. "1,240 cr" — composed by the app (vocab lint covers it). */
  readonly label: string;
  /** the hover line, e.g. "300 cr held against running jobs" — shown when heldCredits > 0. */
  readonly heldTitle?: string;
}): ReactNode {
  return (
    <a
      href="/usage"
      data-balance-chip="true"
      data-spendable={spendableCredits}
      data-held={heldCredits ?? 0}
      title={heldCredits != null && heldCredits > 0 ? heldTitle : undefined}
      className="ui-c2-g1 ui-t-p210 ui-t-rp ui-rs-box ui-t-fg ui-d-fs"
      style={{
        display: "inline-flex",
        alignItems: "baseline",
        border: "1px solid var(--shell-border)",
        fontVariantNumeric: "tabular-nums",
        textDecoration: "none",
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </a>
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
      className="ui-t-g5 ui-t-p210 ui-t-rp ui-rs-box ui-t-fg ui-d-fs"
      style={{
        display: "inline-flex",
        alignItems: "center",
        border: "1px solid var(--shell-border)",
        fontVariantNumeric: "tabular-nums",
      }}
    >
      {label}
    </span>
  );
}
