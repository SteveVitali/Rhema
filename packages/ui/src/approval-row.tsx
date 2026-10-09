// P1.09 — the approval row (§5.11 Needs-you / Inbox contract). One row per open approval: kind label,
// artifact, the deadline or "waiting for you" line, the do-nothing sentence, and an inline Approve
// affordance that opens the artifact + the FULL §6.4 card in a side sheet — the user reads before
// approving. SSR/no-JS: the row is a <details> whose summary is the row and whose body mounts the
// same GateCard every other surface renders (the "identical card" contract). Ordering is the app's
// (`needsYouOrder` in findings-core): blocked-on-you first by soonest deadline.
//
// Text-agnostic like every surface component — all strings arrive via labels.

import type { CSSProperties, ReactNode, Ref } from "react";
import type { GateKind } from "@rhema/contracts";
import type { DoNothingOutcome, GateCardModel } from "@rhema/findings-core";

export interface ApprovalRowLabels {
  /** the kind's display label ("Approve plan", "Confirm cost", …). */
  readonly kindLabel: (kind: GateKind) => string;
  /** the deadline line (absolute + remaining) — same formatter as the card's. */
  readonly deadlineLine: (absolute: string, remainingLabel: string) => string;
  /** "Waiting for you — no deadline." */
  readonly waitingLine: string;
  /** the do-nothing sentence per outcome. */
  readonly doNothingLine: (outcome: DoNothingOutcome) => string;
  /** the row's read-before-approve affordance ("Review & approve ▸"). */
  readonly openLabel: string;
  /** the expanded sheet's artifact link label ("Read the artifact"). */
  readonly artifactLabel?: string;
}

export interface ApprovalRowProps {
  /** the gate's id (data attribute + key). */
  readonly gateId: string;
  /** the card model (buildGateCard) — the row reads kind/deadline/do-nothing from it. */
  readonly model: GateCardModel;
  /** the artifact title + href the row names (the sheet's read target). */
  readonly artifact?: { readonly title: string; readonly href?: string };
  /** the full §6.4 card the expanded sheet mounts (the app renders `<GateCard …>`). */
  readonly card: ReactNode;
  /** render the row open (e.g. deep-linked `?gate=`). */
  readonly defaultOpen?: boolean;
  /**
   * SPA.23 — a ref onto the row's `<details>`: React renderers mount `useGatePresence` on it
   * (an innerHTML presence `<script>` never executes under React). SSR callers omit it.
   */
  readonly rowRef?: Ref<HTMLDetailsElement>;
  readonly labels: ApprovalRowLabels;
}

const summaryStyle: CSSProperties = {
  display: "flex",
  alignItems: "baseline",
  gap: "10px",
  flexWrap: "wrap",
  padding: "10px 12px",
  cursor: "pointer",
  listStyle: "none",
};

/** The §5.11 approval row + read-before-approve sheet. */
export function ApprovalRow({ gateId, model, artifact, card, defaultOpen, rowRef, labels }: ApprovalRowProps): ReactNode {
  return (
    <details
      {...(rowRef != null ? { ref: rowRef } : {})}
      data-approval-row={gateId}
      data-kind={model.kind}
      data-blocking={model.blocking ? "true" : "false"}
      {...(defaultOpen ? { open: true } : {})}
      style={{
        border: "1px solid var(--shell-border)",
        borderLeft: `3px solid ${model.blocking ? "var(--sev-major)" : "var(--shell-border)"}`,
        borderRadius: "10px",
        marginBottom: "10px",
        background: "var(--shell-raised)",
      }}
    >
      <summary style={summaryStyle}>
        <strong style={{ fontSize: "13px", color: "var(--shell-fg)" }}>{labels.kindLabel(model.kind)}</strong>
        {artifact ? (
          <span data-row-artifact="true" style={{ fontSize: "12px", color: "var(--shell-fg-muted)" }}>
            {artifact.title}
          </span>
        ) : null}
        <span data-row-deadline="true" style={{ fontSize: "12px", color: "var(--shell-fg-faint)" }}>
          {model.held
            ? labels.waitingLine
            : model.deadline.deadlineAt == null
              ? labels.waitingLine
              : labels.deadlineLine(model.deadline.deadlineAt, "")}
        </span>
        <span data-row-do-nothing="true" style={{ fontSize: "12px", color: "var(--shell-fg-faint)" }}>
          {labels.doNothingLine(model.doNothing)}
        </span>
        <span data-row-open="true" style={{ marginLeft: "auto", fontSize: "12px", color: "var(--accent)" }}>
          {labels.openLabel}
        </span>
      </summary>
      {/* the side sheet — read the artifact, then the identical approve-with-deadline card. */}
      <div data-approval-sheet="true" style={{ padding: "0 12px 12px" }}>
        {artifact?.href && labels.artifactLabel ? (
          <p style={{ margin: "4px 0 8px", fontSize: "12px" }}>
            <a href={artifact.href} data-gate-artifact="true" style={{ color: "var(--accent)" }}>
              {labels.artifactLabel}
            </a>
          </p>
        ) : null}
        {card}
      </div>
    </details>
  );
}
