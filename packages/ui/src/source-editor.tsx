import type { CSSProperties, ReactNode } from "react";

// The source editor surface (PRB.07; §5.4/§6.3; REQ-BETA-21 stopgap #1 — it survives as 1.x Source mode).
// Server-rendered like every beta page: the markdown arrives in a read-only <textarea> and the client bundle
// (/assets/editor.js) upgrades the host to CodeMirror + the debounced autosave — there is deliberately no
// Save button and no unsaved-changes dialog (the debounce window is the only exposure, REQ-IDE-43's spirit
// at beta fidelity). Without JS the page is a read-only view plus the working note/cancel/revise <form>
// POSTs. Text-agnostic: every user-facing string arrives via `labels` so the vocabulary lint covers the
// app's copy table. The findings rail renders the PROJECTED rows the api computed (each with its
// "from Review of vN" source label and the lost-anchor "passage changed — still applies?" notice); the
// client never re-anchors — projection is findings-core's job, server-side.

/** The §6.3 run lock the banner renders. `kind` picks the banner copy (writer vs frozen-head reader). */
export interface EditorLockView {
  readonly runId: string;
  readonly kind: "writer" | "reader";
  readonly workflow: string;
}

/** One projected finding row on the rail (the api's EditorFindingDto, pre-shaped). */
export interface EditorFindingView {
  readonly findingId: string;
  readonly title: string;
  readonly severity: string;
  /** e.g. "from Review of v2". */
  readonly sourceLabel: string;
  /** the projected quote; null/empty + unanchored ⇒ the Whole-piece row. */
  readonly quote: string | null;
  /** true ⇒ the passage changed; the card renders the lost-anchor note. */
  readonly lost: boolean;
}

export interface SyncPillLabels {
  readonly synced: string;
  readonly syncing: string;
  readonly queued: string;
  /** while a §6.3 run lock holds the draft. */
  readonly locked: string;
}

export interface SourceEditorLabels {
  /** e.g. (n) => "v3" or (n, baseN) => "v3 — your revision of v2". */
  readonly versionLabel: (draftN: number, baseDraftN: number | null) => string;
  /** banner copy while a WRITER run holds the draft ("…is writing…"). */
  readonly writerLockText: (workflow: string) => string;
  /** banner copy while a READER run holds the frozen head. */
  readonly readerLockText: (workflow: string) => string;
  readonly cancelRun: string;
  readonly sync: SyncPillLabels;
  readonly findingsHeading: string;
  /** the Whole-piece label an unanchored/lost anchor falls back to (§5.4). */
  readonly wholePiece: string;
  /** the lost-anchor notice — "passage changed — still applies?" */
  readonly lostNote: string;
  readonly noteLabel: string;
  readonly notePlaceholder: string;
  readonly noteSubmit: string;
  readonly noteSaved: string;
  /** "Revise using your edits" — rendered only when the head is a working human_revision. */
  readonly revise: string;
}

export interface SourceEditorProps {
  readonly markdown: string;
  /** The bound draft — the client rebases its save/doc URLs when an autosave forks a new head. */
  readonly draftId: string;
  readonly draftN: number;
  readonly baseDraftN: number | null;
  /** "human_revision" shows the Revise-using-your-edits action. */
  readonly origin: string;
  readonly lock: EditorLockView | null;
  readonly findings: readonly EditorFindingView[];
  /** POST — the debounced autosave endpoint (JSON; text/plain for the pagehide beacon). */
  readonly saveUrl: string;
  /** GET — the doc read the client polls for lock changes. */
  readonly docUrl: string;
  /** POST — the note field's <form> action (a Guidance row). */
  readonly noteUrl: string;
  /** POST — the banner's Cancel-run <form> action. */
  readonly cancelUrl: string;
  /** POST — "Revise using your edits" <form> action. */
  readonly reviseUrl: string;
  /** set after a note POST redirect — renders the saved marker. */
  readonly noteSaved?: boolean;
  readonly labels: SourceEditorLabels;
}

const muted: CSSProperties = { color: "var(--shell-fg-muted)" };

/** The autosave state pill (synced / syncing / offline-queued). The client bundle rewrites its text via the
 *  `data-label-*` attributes so the copy stays in the app's table. */
export function SyncPill({ labels }: { labels: SyncPillLabels }): ReactNode {
  return (
    <span
      data-sync-pill="true"
      data-sync-state="synced"
      data-label-synced={labels.synced}
      data-label-syncing={labels.syncing}
      data-label-queued={labels.queued}
      data-label-locked={labels.locked}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "6px",
        padding: "2px 10px",
        borderRadius: "999px",
        border: "1px solid var(--shell-border)",
        background: "var(--shell-raised)",
        fontSize: "12px",
        color: "var(--shell-fg-muted)",
        whiteSpace: "nowrap",
      }}
    >
      {labels.synced}
    </span>
  );
}

/** The read-only banner while a run holds the draft (§6.3): the lock line + the Cancel-run release. */
export function EditorLockBanner({
  lock,
  cancelUrl,
  labels,
}: {
  lock: EditorLockView | null;
  cancelUrl: string;
  labels: SourceEditorLabels;
}): ReactNode {
  return (
    <div
      data-editor-banner="true"
      // the client bundle re-fills the banner when a poll sees a lock appear — the copy stays in the app's
      // table; the templates carry a {workflow} placeholder the bundle substitutes.
      data-writer-text={labels.writerLockText("{workflow}")}
      data-reader-text={labels.readerLockText("{workflow}")}
      hidden={lock == null}
      style={{
        // inline `display` beats the UA `[hidden]` rule — set it explicitly so an unlocked page truly hides
        // the banner; the client bundle manages `style.display` in both directions when a poll flips it.
        display: lock == null ? "none" : "flex",
        alignItems: "center",
        gap: "12px",
        flexWrap: "wrap",
        padding: "10px 12px",
        marginBottom: "12px",
        border: "1px solid var(--sev-major)",
        borderRadius: "8px",
        background: "var(--shell-raised)",
        fontSize: "13px",
      }}
    >
      <span data-editor-banner-text="true" style={{ flex: 1, minWidth: "200px" }}>
        {lock
          ? lock.kind === "writer"
            ? labels.writerLockText(lock.workflow)
            : labels.readerLockText(lock.workflow)
          : ""}
      </span>
      <form method="post" action={cancelUrl} style={{ margin: 0 }}>
        <button
          type="submit"
          style={{
            padding: "6px 12px",
            borderRadius: "6px",
            border: "1px solid var(--shell-border)",
            background: "var(--shell-surface)",
            color: "var(--shell-fg)",
            fontSize: "13px",
            cursor: "pointer",
          }}
        >
          {labels.cancelRun}
        </button>
      </form>
    </div>
  );
}

function FindingRow({ finding, labels }: { finding: EditorFindingView; labels: SourceEditorLabels }): ReactNode {
  return (
    <li
      data-finding-id={finding.findingId}
      data-lost={finding.lost ? "true" : undefined}
      style={{
        padding: "10px 0",
        borderBottom: "1px solid var(--shell-border)",
        listStyle: "none",
      }}
    >
      <div style={{ display: "flex", gap: "8px", alignItems: "baseline", flexWrap: "wrap" }}>
        <span style={{ fontSize: "13px", fontWeight: 500 }}>{finding.title}</span>
        <span style={{ fontSize: "11px", ...muted }}>{finding.severity}</span>
      </div>
      <div style={{ fontSize: "12px", marginTop: "4px", ...muted }}>{finding.sourceLabel}</div>
      {finding.quote ? (
        <blockquote
          style={{
            margin: "6px 0 0",
            padding: "4px 10px",
            borderLeft: "2px solid var(--shell-border)",
            fontSize: "12px",
            ...muted,
          }}
        >
          {finding.quote}
        </blockquote>
      ) : (
        <div style={{ fontSize: "12px", marginTop: "4px", ...muted }}>{labels.wholePiece}</div>
      )}
      {finding.lost ? (
        <div data-lost-note="true" style={{ fontSize: "12px", marginTop: "4px", color: "var(--sev-major)" }}>
          {labels.lostNote}
        </div>
      ) : null}
    </li>
  );
}

/** The projected-findings rail (§5.4): each card is a PROJECTION labeled with its source review. */
export function EditorFindingsRail({
  findings,
  labels,
}: {
  findings: readonly EditorFindingView[];
  labels: SourceEditorLabels;
}): ReactNode {
  if (findings.length === 0) return null;
  return (
    // data-lost-note-text carries the copy for the client bundle's in-session re-projection pass: when a
    // doc poll reports a finding's anchor newly lost, the row gains the notice without a reload.
    <aside data-findings-rail="true" data-lost-note-text={labels.lostNote} style={{ marginTop: "20px" }}>
      <h2 style={{ fontSize: "14px", fontWeight: 600, marginBottom: "4px" }}>{labels.findingsHeading}</h2>
      <ul style={{ margin: 0, padding: 0 }}>
        {findings.map((f) => (
          <FindingRow key={f.findingId} finding={f} labels={labels} />
        ))}
      </ul>
    </aside>
  );
}

/** The full editor region: the CodeMirror mount host (a read-only <textarea> no-JS fallback), the lock
 *  banner, the projected findings rail, the note field, and the Revise-using-your-edits action. The client
 *  bundle is pulled in with `defer`; every data hook it needs is a `data-*` attribute on the root. */
export function SourceEditor(props: SourceEditorProps): ReactNode {
  const { labels } = props;
  const locked = props.lock != null;
  const canRevise = props.origin === "human_revision" && !locked;
  return (
    <section
      data-editor-root="true"
      data-draft-id={props.draftId}
      data-save-url={props.saveUrl}
      data-doc-url={props.docUrl}
      data-locked={locked ? "1" : "0"}
      data-lock-kind={props.lock?.kind ?? ""}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "12px" }}>
        <h1 style={{ fontSize: "18px", fontWeight: 600, margin: 0 }}>
          {labels.versionLabel(props.draftN, props.baseDraftN)}
        </h1>
        <SyncPill labels={labels.sync} />
      </div>

      <EditorLockBanner lock={props.lock} cancelUrl={props.cancelUrl} labels={labels} />

      <div
        data-editor-host="true"
        style={{
          border: "1px solid var(--shell-border)",
          borderRadius: "8px",
          background: "var(--shell-surface)",
          overflow: "hidden",
        }}
      >
        {/* no-JS fallback: the canonical markdown in a read-only textarea (no Save button exists —
            editing requires the client bundle's autosave, which is the only save path). */}
        <textarea
          data-editor-source="true"
          readOnly
          defaultValue={props.markdown}
          aria-label={labels.versionLabel(props.draftN, props.baseDraftN)}
          style={{
            display: "block",
            width: "100%",
            minHeight: "420px",
            padding: "14px",
            border: 0,
            boxSizing: "border-box",
            background: "transparent",
            color: "var(--shell-fg)",
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            fontSize: "13px",
            lineHeight: 1.6,
            resize: "vertical",
          }}
        />
      </div>

      <EditorFindingsRail findings={props.findings} labels={labels} />

      <form method="post" action={props.noteUrl} style={{ marginTop: "20px" }}>
        <label
          htmlFor="editor-note"
          style={{ display: "block", fontSize: "13px", fontWeight: 500, marginBottom: "6px" }}
        >
          {labels.noteLabel}
        </label>
        <textarea
          id="editor-note"
          name="text"
          rows={3}
          placeholder={labels.notePlaceholder}
          style={{
            display: "block",
            width: "100%",
            boxSizing: "border-box",
            padding: "10px 12px",
            borderRadius: "8px",
            border: "1px solid var(--shell-border)",
            background: "var(--shell-surface)",
            color: "var(--shell-fg)",
            fontSize: "13px",
            resize: "vertical",
          }}
        />
        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginTop: "8px" }}>
          <button
            type="submit"
            style={{
              padding: "6px 12px",
              borderRadius: "6px",
              border: "1px solid var(--shell-border)",
              background: "var(--shell-raised)",
              color: "var(--shell-fg)",
              fontSize: "13px",
              cursor: "pointer",
            }}
          >
            {labels.noteSubmit}
          </button>
          {props.noteSaved ? (
            <span data-note-saved="true" style={{ fontSize: "12px", color: "var(--state-ready)" }}>
              {labels.noteSaved}
            </span>
          ) : null}
        </div>
      </form>

      {canRevise ? (
        <form method="post" action={props.reviseUrl} style={{ marginTop: "20px" }}>
          <button
            type="submit"
            data-revise-edits="true"
            style={{
              padding: "8px 16px",
              borderRadius: "6px",
              border: "1px solid var(--state-ready)",
              background: "var(--state-ready)",
              color: "var(--shell-bg, #0b0d10)",
              fontSize: "14px",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {labels.revise}
          </button>
        </form>
      ) : null}

      <script defer src="/assets/editor.js"></script>
    </section>
  );
}
