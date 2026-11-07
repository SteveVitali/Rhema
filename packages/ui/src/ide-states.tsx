// The §5.9 state catalogue (REQ-IDE-41): every state the IDE can land in has a DESIGNED rendering — not an
// ad-hoc empty div. These render inside the IDE's named regions; they never render a spinner inside the
// paper (loading = shell skeleton rows) and the ONLY blocking modal in the product is CancelRunModal —
// everything else is a banner, a swap, or a pane state. Text-agnostic: all copy arrives via labels.

import type { CSSProperties, ReactNode } from "react";
import { Button } from "./primitives/button.js";
import { TextField } from "./primitives/fields.js";

/** Empty project (§5.9): the Page carries three entry cards + a quiet serif title field. */
export function EmptyProject({
  labels,
  paths,
}: {
  labels: { titlePlaceholder: string; cards: readonly { title: string; body: string }[] };
  paths: readonly string[]; // one href per card
}): ReactNode {
  return (
    <div data-ide-state="empty-project">
      <TextField
        type="text"
        className="ide-title-field ui-vc-w ui-fcard--p ui-t-f2e ui-d-b ui-d-inh"
        placeholder={labels.titlePlaceholder}
        aria-label={labels.titlePlaceholder}
        readOnly
        style={{ border: "none", font: "inherit", outline: "none" }}
      />
      <div
        className="ui-c2-g3 ui-set-sec"
        style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}
      >
        {labels.cards.map((card, i) => (
          <a
            key={card.title}
            href={paths[i] ?? "#"}
            className="ide-state ui-t-pf"
            style={{ display: "block", textDecoration: "none" }}
          >
            <div className="ui-d-b ui-t-mb4">{card.title}</div>
            <div className="ui-t-f85 ui-t-pm">{card.body}</div>
          </a>
        ))}
      </div>
    </div>
  );
}

/** Empty findings (§5.9): the Margin/Desk findings surfaces when a run returned clean. */
export function EmptyFindings({ label }: { label: string }): ReactNode {
  return (
    <div data-ide-state="empty-findings" className="ui-t-mut ui-d-fd">
      {label}
    </div>
  );
}

/** Shell loading (§5.9): skeleton rows in the shell regions — NEVER a spinner inside the paper. */
export function ShellSkeleton({ rows = 4 }: { rows?: number }): ReactNode {
  return (
    <div data-ide-state="loading" aria-hidden="true">
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={i}
          className="ide-sk-row ui-t-wf"
          style={{ "--d-w2": `${88 - i * 14}%` } as CSSProperties}
        />
      ))}
    </div>
  );
}

/** Streaming (§5.9): the paper's streaming blocks fade in + the caret pulses; the counter is live. */
export function StreamingBlock({ text, isLast }: { text: string; isLast?: boolean }): ReactNode {
  return (
    <p className="ide-stream-block">
      {text}
      {isLast ? <span className="ide-caret" aria-hidden="true" /> : null}
    </p>
  );
}

/** The §5.9 "syncing" pill — polite live region (the run counter line uses it too). */
export function SyncPill2({
  label,
  state,
}: {
  label: string;
  state: "synced" | "syncing" | "queued";
}): ReactNode {
  return (
    <span className="ide-pill ide-sync" data-state={state} role="status" aria-live="polite">
      {label}
    </span>
  );
}

/** Run failed (§5.9): phase + reason + partial output kept + refund line + Resume + the Inbox pointer. */
export function RunFailed({
  labels,
  phase,
  reason,
  resumeHref,
}: {
  labels: {
    heading: string;
    refund: string;
    resume: string;
    inboxNote: string;
    phaseLabel: string;
  };
  phase: string;
  reason: string;
  resumeHref: string;
}): ReactNode {
  return (
    <div className="ide-state" data-ide-state="run-failed" data-tone="failed" role="status">
      <div className="ui-d-b ui-t-mb4">{labels.heading}</div>
      <div className="ui-d-fd ui-t-mut">
        {labels.phaseLabel} {phase} — {reason}
      </div>
      <div className="ui-d-fs ui-t-fnt ui-os-mr">{labels.refund}</div>
      <div className="ui-c2-mt ui-c2-g3" style={{ display: "flex", alignItems: "center" }}>
        <a href={resumeHref}>{labels.resume}</a>
        <span className="ui-d-fs ui-t-fnt">{labels.inboxNote}</span>
      </div>
    </div>
  );
}

/** Conflict (§5.9): an inline banner — never a modal. */
export function ConflictBanner({ label }: { label: string }): ReactNode {
  return (
    <div
      className="ide-banner"
      data-tone="conflict"
      data-ide-state="conflict"
      role="status"
      aria-live="polite"
    >
      {label}
    </div>
  );
}

/** Sync offline (§5.9): the queued-change indicator — a state, not an error. */
export function OfflineQueued({ label }: { label: string }): ReactNode {
  return (
    <span className="ide-pill ide-sync" data-state="queued" role="status" aria-live="polite">
      {label}
    </span>
  );
}

/** Insufficient balance (§5.9): a BUTTON SWAP — the action is replaced by the top-up affordance. */
export function InsufficientBalanceSwap({
  label,
  topUpHref,
}: {
  label: string;
  topUpHref: string;
}): ReactNode {
  // role="alert" — the spend gate is the catalogue's assertive surface (§5.9 a11y).
  return (
    <a
      href={topUpHref}
      className="ide-banner ui-t-fg"
      data-ide-state="insufficient-balance"
      role="alert"
      style={{ display: "inline-flex", textDecoration: "none" }}
    >
      {label}
    </a>
  );
}

/** Frozen version (§5.9): a lock banner on the read-only document. */
export function FrozenBanner({ label }: { label: string }): ReactNode {
  return (
    <div className="ide-banner" data-tone="locked" data-ide-state="frozen" role="status">
      {label}
    </div>
  );
}

/**
 * THE blocking modal in the product (§5.9): the Cancel-run confirmation. Everything else the IDE
 * communicates is a banner/swap/pane — this is the only role="alertdialog" + aria-modal surface.
 */
export function CancelRunModal({
  labels,
  open,
}: {
  labels: { heading: string; body: string; confirm: string; keep: string };
  open: boolean;
}): ReactNode {
  if (!open) return null;
  return (
    <div className="ide-modal-backdrop" data-ide-modal="cancel-run">
      <div className="ide-modal" role="alertdialog" aria-modal="true" aria-label={labels.heading}>
        <div className="ui-d-b ui-t-mb6">{labels.heading}</div>
        <p className="ui-t-m03 ui-d-fd ui-t-mut">{labels.body}</p>
        <div className="ui-c2-g2" style={{ display: "flex", justifyContent: "flex-end" }}>
          <Button type="button" variant="ghost" data-modal-cancel>
            {labels.keep}
          </Button>
          <Button type="button" variant="ghost" data-modal-confirm className="ui-t-blk">
            {labels.confirm}
          </Button>
        </div>
      </div>
    </div>
  );
}
