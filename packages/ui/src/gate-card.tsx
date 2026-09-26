import type { CSSProperties, ReactNode } from "react";
import type { GateKind } from "@rhema/contracts";
import {
  presenceCountdown,
  remainingParts,
  type DoNothingOutcome,
  type GateCardAction,
  type GateCardModel,
} from "@rhema/findings-core";

// The §6.4 gate card — ONE generic component for every beta gate kind (REQ-BETA-1). Cards, never modals:
// each card is a plain <form> whose action buttons POST the decision; the model comes from
// `buildGateCard` (@rhema/findings-core), so the web and the 1.x mobile card share every rule
// (REQ-SPEC-20). `compact` is the §10.1 phone-width input set (Approve / Wait for me / Stop).
// Text-agnostic: every string arrives via `labels` from the app's lint-checked copy.

export interface GateCardLabels {
  /** the card's title ("Approve triage", "Confirm cost", "Refusal", …). */
  readonly kindLabel: (kind: GateKind) => string;
  /** the primary Approve label — "Approve proposals" for approve_triage, "Approve" elsewhere. */
  readonly approveLabel: (kind: GateKind) => string;
  readonly approveAutonomousLabel: string;
  readonly keepPlanningLabel: string;
  readonly waitLabel: string;
  readonly stopLabel: string;
  /** shown instead of a countdown when the gate has no deadline ("Waiting for you — no deadline."). */
  readonly waitingLine: string;
  /** the deadline line; parts = {absolute, remaining} the app formats ("due Fri 14:02 · ~3 h 12 min"). */
  readonly deadlineLine: (absolute: string, remainingLabel: string) => string;
  /** the expired-deadline line ("overdue — resolves on the next sweep"). */
  readonly expiredLine: string;
  /** "If you do nothing: …" — one sentence per outcome key. */
  readonly doNothingLine: (outcome: DoNothingOutcome) => string;
  /** "Spent 320 credits · cap 500 · ~180 left on the estimate." */
  readonly spendLine: (spent: number, cap: number, remaining: number | null) => string;
  /** the presence countdown ("Proposed to proceed in 9:41 unless you say otherwise."). */
  readonly presenceLine: (countdown: string) => string;
  /** "Paused while you read." */
  readonly pausedNote: string;
  /** the held line after "Wait for me" ("Waiting for you — the deadline is cleared."). */
  readonly heldLine: string;
  /** the guidance input label ("Add guidance for the run"). */
  readonly guidanceLabel: string;
  /** the standing-rule checkbox label ("…and remember this for this project"). */
  readonly standingLabel: string;
  /** the informational approve_scope note ("Informational — the run continues while you read."). */
  readonly informationalNote: string;
  /** the escalation flag on approve_triage ("This ledger has escalations — they are decided only by you."). */
  readonly escalationNote: string;
}

const actionButton: CSSProperties = {
  padding: "8px 14px",
  borderRadius: "8px",
  border: "1px solid var(--shell-border)",
  background: "var(--shell-raised)",
  color: "var(--shell-fg)",
  fontSize: "13px",
  fontWeight: 500,
  cursor: "pointer",
};

const ACTION_ORDER: Record<GateCardAction, number> = {
  approve: 0,
  approve_autonomous: 1,
  keep_planning: 2,
  wait: 3,
  stop: 4,
};

export interface GateCardProps {
  readonly model: GateCardModel;
  /** the artifact the gate presents ("Response ledger", "Estimated cost") — a link when readable. */
  readonly artifact?: { readonly title: string; readonly href?: string };
  /** the form action the decision buttons POST to (`/p/:slug/gates/:gateId`). */
  readonly formAction: string;
  /**
   * Where the presence script POSTs activity pings (`/p/:slug/gates/:gateId/activity`). Rendered only
   * when the model says the gate auto-proceeds — wait-default cards emit no script and can never arm
   * the timer (REQ-SPEC-18). Omit to disable pings (e.g. server-rendered docs, tests).
   */
  readonly activityUrl?: string;
  /** §10.1 phone-width input set: Approve / Wait for me / Stop only. */
  readonly compact?: boolean;
  /** true when the approve_triage ledger contains an escalation (the "only you" flag). */
  readonly hasEscalations?: boolean;
  readonly labels: GateCardLabels;
  /** the artifact slot — the Approve-triage card mounts its ledger rows here. */
  readonly children?: ReactNode;
}

function actionLabel(action: GateCardAction, kind: GateKind, labels: GateCardLabels): string {
  switch (action) {
    case "approve":
      return labels.approveLabel(kind);
    case "approve_autonomous":
      return labels.approveAutonomousLabel;
    case "keep_planning":
      return labels.keepPlanningLabel;
    case "wait":
      return labels.waitLabel;
    case "stop":
      return labels.stopLabel;
  }
}

/** Format a remaining duration for the deadline line ("~3 h 12 min", "~8 min", "under a minute"). */
export function remainingLabel(remainingMs: number | null): string {
  const p = remainingParts(remainingMs);
  if (p.underAMinute) return "under a minute";
  if (p.hours > 0) return `~${p.hours} h ${p.minutes} min`;
  return `~${p.minutes} min`;
}

/** The §6.4 gate card. One component, all beta gate kinds; a card, never a modal. */
/**
 * The presence-ping script (REQ-SPEC-18): `present` while the tab is focused/visible, `blur` when it
 * leaves, `reading` when the reader opens the gate's artifact. Progressive enhancement — with no JS the
 * card simply never arms the presence timer (the gate keeps its long deadline). Numbers only in the
 * payload; JSON.stringify keeps the URL injection-safe.
 */
function presenceScript(url: string): string {
  const U = JSON.stringify(url);
  return `(function(){var U=${U};
function send(k){var b=new FormData();b.set('activity',k);try{if(navigator.sendBeacon&&navigator.sendBeacon(U,b))return;fetch(U,{method:'POST',body:b,credentials:'same-origin'});}catch(e){}}
function vis(){send(document.hidden?'blur':'present');}
document.addEventListener('visibilitychange',vis);window.addEventListener('focus',function(){send('present');});
window.addEventListener('blur',function(){send('blur');});
var s=document.currentScript&&document.currentScript.closest('[data-gate-card]');
var a=s&&s.querySelector('[data-gate-artifact]');if(a)a.addEventListener('click',function(){send('reading');});
vis();})();`;
}

export function GateCard({
  model,
  artifact,
  formAction,
  activityUrl,
  compact,
  hasEscalations,
  labels,
  children,
}: GateCardProps): ReactNode {
  return (
    <section
      data-gate-card={model.kind}
      data-blocking={model.blocking ? "true" : "false"}
      data-held={model.held ? "true" : "false"}
      data-compact={compact ? "true" : "false"}
      role="region"
      aria-label={labels.kindLabel(model.kind)}
      style={{
        border: "1px solid var(--shell-border)",
        borderLeft: `3px solid ${model.blocking ? "var(--sev-major)" : "var(--shell-border)"}`,
        borderRadius: "10px",
        padding: "14px 16px",
        marginBottom: "12px",
        background: "var(--shell-raised)",
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: "8px", flexWrap: "wrap" }}>
        <h3 style={{ margin: 0, fontSize: "15px", fontWeight: 600, color: "var(--shell-fg)" }}>
          {labels.kindLabel(model.kind)}
        </h3>
        {artifact ? (
          artifact.href ? (
            <a href={artifact.href} data-gate-artifact="true" style={{ fontSize: "13px", color: "var(--accent)" }}>
              {artifact.title}
            </a>
          ) : (
            <span data-gate-artifact="true" style={{ fontSize: "13px", color: "var(--shell-fg-muted)" }}>
              {artifact.title}
            </span>
          )
        ) : null}
        {model.informational ? (
          <span data-informational="true" style={{ fontSize: "12px", color: "var(--shell-fg-faint)" }}>
            {labels.informationalNote}
          </span>
        ) : null}
      </div>

      {/* the artifact slot — the approve_triage card mounts its ledger rows here (§6.4 item 1). */}
      {children}

      {/* deadline or "waiting for you" — wait-default gates never carry a countdown. */}
      <p data-deadline-line="true" style={{ fontSize: "13px", color: "var(--shell-fg-muted)", margin: "10px 0 0" }}>
        {model.held
          ? labels.heldLine
          : model.deadline.deadlineAt == null
            ? labels.waitingLine
            : model.deadline.expired
              ? labels.expiredLine
              : labels.deadlineLine(
                  model.deadline.deadlineAt,
                  remainingLabel(model.deadline.remainingMs),
                )}
      </p>

      {/* the do-nothing sentence (§6.4 item 3). */}
      <p data-do-nothing="true" style={{ fontSize: "13px", color: "var(--shell-fg-muted)", margin: "6px 0 0" }}>
        {labels.doNothingLine(model.doNothing)}
      </p>

      {/* cost so far + remaining (§6.4). */}
      <p data-spend-line="true" style={{ fontSize: "12px", color: "var(--shell-fg-faint)", margin: "6px 0 0" }}>
        {labels.spendLine(model.spentCredits, model.capCredits, model.remainingEstimateCredits)}
      </p>

      {/* the presence countdown — only an auto-proceed gate with a server-set presence deadline ever
          shows it (REQ-SPEC-18); wait-default and spend/refusal cards can never reach this branch. */}
      {model.presence.active ? (
        <p
          data-presence-timer="true"
          data-paused={model.presence.paused ? "true" : "false"}
          style={{ fontSize: "13px", color: "var(--sev-major)", margin: "8px 0 0" }}
        >
          {labels.presenceLine(presenceCountdown(model.presence.remainingMs ?? 0))}
          {model.presence.paused ? (
            <span data-paused-note="true" style={{ color: "var(--shell-fg-muted)" }}>
              {" "}
              {labels.pausedNote}
            </span>
          ) : null}
        </p>
      ) : null}

      {hasEscalations ? (
        <p data-escalation-note="true" style={{ fontSize: "12px", color: "var(--sev-major)", margin: "8px 0 0" }}>
          {labels.escalationNote}
        </p>
      ) : null}

      <form method="post" action={formAction} data-gate-form="true" style={{ marginTop: "12px" }}>
        <div
          data-gate-actions="true"
          style={{ display: "flex", flexDirection: compact ? "column" : "row", gap: "8px", flexWrap: "wrap" }}
        >
          {model.actions
            .slice()
            .sort((a, b) => ACTION_ORDER[a] - ACTION_ORDER[b])
            .map((action) => (
              <button
                key={action}
                type="submit"
                name="action"
                value={action}
                data-action={action}
                style={{
                  ...actionButton,
                  background: action === "approve" ? "var(--accent)" : "var(--shell-raised)",
                  color: action === "approve" ? "var(--shell-bg)" : "var(--shell-fg)",
                  border: action === "approve" ? "none" : "1px solid var(--shell-border)",
                }}
              >
                {actionLabel(action, model.kind, labels)}
              </button>
            ))}
        </div>

        {!compact ? (
          <div style={{ marginTop: "10px", display: "flex", flexDirection: "column", gap: "6px" }}>
            <label style={{ fontSize: "12px", color: "var(--shell-fg-muted)" }}>
              {labels.guidanceLabel}
              <input
                type="text"
                name="guidance"
                data-guidance="true"
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
            <label style={{ fontSize: "12px", color: "var(--shell-fg-muted)", display: "inline-flex", gap: "6px" }}>
              <input type="checkbox" name="standing" value="true" data-standing="true" />
              {labels.standingLabel}
            </label>
          </div>
        ) : null}
      </form>

      {/* presence pings — only an auto-proceed card carries them; a wait-default card can never arm the
          timer even if the URL were provided (the server rejects it there too). */}
      {model.autoProceed && activityUrl ? (
        <script dangerouslySetInnerHTML={{ __html: presenceScript(activityUrl) }} />
      ) : null}
    </section>
  );
}

// ---------------------------------------------------------------------------------------------------------
// ApproveTriageCard — the Approve-triage card renders the response ledger it is approving (§6.4 item 1):
// the same row list the findings UI writes, escalation-pinned, with per-row override forms. The primary
// action is "Approve proposals" (the app's `approveLabel("approve_triage")`).
// ---------------------------------------------------------------------------------------------------------

/** A row of the ledger under decision (finding + its current/proposed disposition). */
export interface TriageLedgerRow {
  readonly findingId: string;
  readonly ordinal: number;
  readonly title: string;
  readonly severity: string;
  readonly disposition?: {
    readonly kind: string;
    readonly rationale?: string;
    /** "user" marks a row the human wrote (REQ-SPEC-9). */
    readonly actor?: string;
  };
}

export interface TriageLedgerLabels {
  /** display for a row's disposition kind ("Accept", "Rebut", …) or "Undecided". */
  readonly dispositionLabel: (kind: string | undefined) => string;
  /** the "by you" marker on a user-authored row. */
  readonly userActorLabel: string;
  /** the severity display. */
  readonly severityLabel: (severity: string) => string;
}

/** The ledger rows inside an Approve-triage card — already in §5.7 triage order (escalations first). */
export function TriageLedger({
  rows,
  labels,
  children,
}: {
  readonly rows: readonly TriageLedgerRow[];
  readonly labels: TriageLedgerLabels;
  /** per-row override controls (a compact DispositionControls form) — mounted after the row text. */
  readonly children?: (row: TriageLedgerRow) => ReactNode;
}): ReactNode {
  return (
    <ol data-triage-ledger="true" style={{ listStyle: "none", margin: "10px 0 0", padding: 0 }}>
      {rows.map((row) => (
        <li
          key={row.findingId}
          data-triage-row={row.findingId}
          data-ordinal={row.ordinal}
          data-disposition={row.disposition?.kind ?? "undecided"}
          data-actor={row.disposition?.actor ?? "drafter"}
          data-severity={row.severity}
          style={{
            padding: "8px 0",
            borderBottom: "1px solid var(--shell-border)",
            fontSize: "13px",
          }}
        >
          <span style={{ color: "var(--shell-fg-faint)", fontSize: "12px" }}>{row.ordinal}. </span>
          <span style={{ color: "var(--shell-fg)", fontWeight: 500 }}>{row.title}</span>{" "}
          <span style={{ fontSize: "11px", color: "var(--shell-fg-muted)" }}>
            {labels.severityLabel(row.severity)}
          </span>{" "}
          <span data-row-disposition="true" style={{ fontSize: "12px", color: "var(--shell-fg-muted)" }}>
            {labels.dispositionLabel(row.disposition?.kind)}
            {row.disposition?.actor === "user" ? ` · ${labels.userActorLabel}` : ""}
          </span>
          {children ? <div style={{ marginTop: "6px" }}>{children(row)}</div> : null}
        </li>
      ))}
    </ol>
  );
}
