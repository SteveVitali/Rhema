import type { CSSProperties, ReactNode } from "react";
import { MarkdownProse } from "./markdown-prose.js";
import type {
  DiffHunk,
  MoveCardView,
  ObligationLineInput,
  RebuttedCardView,
  RubricDeltaView,
  WhatChangedView as WhatChangedViewModel,
} from "@rhema/findings-core";

// The What-changed surface (§5.8; PRB.06; REQ-IDE-33, REQ-BETA-7/8, REQ-OBJ-6). One layout for the beta —
// Inline: the summary strip, move cards (a ledger move + its answered findings + its obligation discharge
// lines + the changed blocks its evidence joined), the Unlinked group, and rebutted findings (rationale,
// no hunk). Server-rendered and read-only apart from the hunk comment forms, which are plain no-JS <form>
// POSTs that become `Guidance` rows for the next Revise (§6.5). Text-agnostic like every @rhema/ui surface —
// all copy arrives via `labels` so the vocabulary lint covers the app's copy table. P1.8 re-skins this pair
// inside the pane system.

export interface WhatChangedLabels {
  readonly heading: string;
  /** the version line — e.g. (2, 3) => "v2 → v3". */
  readonly versionLabel: (beforeN: number, afterN: number | null) => string;
  /** the summary strip — e.g. "7 obligations addressed · 1 rebutted · 2 still open". */
  readonly stripLabel: (strip: WhatChangedViewModel["strip"]) => string;
  /** the move-card heading — e.g. (m) => `Move ${m.moveOrdinal} · ${m.title}`. */
  readonly moveHeading: (move: MoveCardView) => string;
  /** one answered-finding line on a move card — e.g. "F-07 · accept". */
  readonly findingLine: (f: MoveCardView["findings"][number]) => string;
  /** an obligation discharge line — e.g. "discharges OBL-3 (F-07, carried from v2) — verified by gap check". */
  readonly dischargeLine: (line: ObligationLineInput) => string;
  /** the hunk-kind chip — "edited" | "added" | "removed" | "mixed". */
  readonly hunkKindLabel: (kind: DiffHunk["kind"]) => string;
  readonly unlinkedHeading: string;
  readonly rebuttedHeading: string;
  /** the rebutted card's label — e.g. "Rebutted". */
  readonly rebutLabel: string;
  /** the hunk comment form (a Guidance row for the next Revise). */
  readonly commentLabel: string;
  readonly commentPlaceholder: string;
  readonly commentSubmit: string;
}

export interface WhatChangedProps {
  readonly view: WhatChangedViewModel;
  /** the diffed versions — the header's "vN → v(N+1)". */
  readonly beforeN: number;
  readonly afterN: number | null;
  /** when set, each hunk renders a comment form POSTing to `commentFormAction(hunkId)`. */
  readonly commentFormAction?: (hunkId: string) => string;
  readonly labels: WhatChangedLabels;
}

const muted: CSSProperties = { color: "var(--paper-fg-muted)" };

function BlockText({ text, side }: { text: string; side: "before" | "after" }): ReactNode {
  return (
    <div
      data-diff-side={side}
      style={{
        margin: 0,
        padding: "8px 10px",
        fontSize: "12.5px",
        lineHeight: 1.5,
        background: side === "before" ? "var(--paper-diff-del)" : "var(--paper-diff-add)",
        borderLeft: `2px solid ${side === "before" ? "var(--sev-major, #b33)" : "var(--accent, #3a7)"}`,
      }}
    >
      <MarkdownProse text={text} />
    </div>
  );
}

function HunkView({
  hunk,
  commentFormAction,
  labels,
}: {
  hunk: DiffHunk;
  commentFormAction?: (hunkId: string) => string;
  labels: WhatChangedLabels;
}): ReactNode {
  return (
    <div data-hunk={hunk.id} data-hunk-kind={hunk.kind} style={{ margin: "10px 0" }}>
      <div style={{ fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.05em", ...muted }}>
        {labels.hunkKindLabel(hunk.kind)}
      </div>
      {hunk.before.map((b) => (
        <BlockText key={`b-${b.blockId}`} text={b.text} side="before" />
      ))}
      {hunk.after.map((b) => (
        <BlockText key={`a-${b.blockId}`} text={b.text} side="after" />
      ))}
      {commentFormAction ? (
        <form method="post" action={commentFormAction(hunk.id)} data-hunk-comment={hunk.id} style={{ marginTop: "6px", display: "flex", gap: "6px" }}>
          <input
            type="text"
            name="text"
            required
            placeholder={labels.commentPlaceholder}
            aria-label={labels.commentLabel}
            style={{ flex: 1, padding: "5px 8px", fontSize: "12px", border: "1px solid var(--paper-rule)", borderRadius: "4px", background: "transparent" }}
          />
          <button type="submit" style={{ padding: "5px 10px", fontSize: "12px" }}>
            {labels.commentSubmit}
          </button>
        </form>
      ) : null}
    </div>
  );
}

function MoveCard({ move, commentFormAction, labels }: { move: MoveCardView; commentFormAction?: (hunkId: string) => string; labels: WhatChangedLabels }): ReactNode {
  return (
    <section
      data-move-card={move.moveId}
      data-move-ordinal={move.moveOrdinal}
      style={{ border: "1px solid var(--paper-rule)", borderRadius: "6px", padding: "12px 14px", margin: "12px 0" }}
    >
      <h4 style={{ margin: 0, fontSize: "14px", color: "var(--paper-fg)" }}>
        {labels.moveHeading(move)}
        {move.type ? <span style={{ ...muted, fontWeight: "normal" }}> · {move.type}</span> : null}
      </h4>
      <ul style={{ listStyle: "none", margin: "8px 0 0", padding: 0, fontSize: "12.5px", ...muted }}>
        {move.findings.map((f) => (
          <li key={`f-${f.findingOrdinal}`} data-move-finding={f.findingOrdinal}>
            {labels.findingLine(f)}
          </li>
        ))}
      </ul>
      {move.dischargeLines.length > 0 ? (
        <ul data-discharge-lines style={{ listStyle: "none", margin: "6px 0 0", padding: 0, fontSize: "12.5px" }}>
          {move.dischargeLines.map((l) => (
            <li key={l.obligationId} data-obligation={l.obligationId} data-obligation-state={l.state}>
              {labels.dischargeLine(l)}
            </li>
          ))}
        </ul>
      ) : null}
      {move.hunks.map((h) => (
        <HunkView key={h.id} hunk={h} commentFormAction={commentFormAction} labels={labels} />
      ))}
    </section>
  );
}

function RebuttedCard({ card, labels }: { card: RebuttedCardView; labels: WhatChangedLabels }): ReactNode {
  return (
    <section
      data-rebutted-finding={card.findingOrdinal}
      style={{ border: "1px dashed var(--paper-rule)", borderRadius: "6px", padding: "12px 14px", margin: "12px 0" }}
    >
      <h4 style={{ margin: 0, fontSize: "13.5px", color: "var(--paper-fg)" }}>
        {card.title ?? `F-${String(card.findingOrdinal).padStart(2, "0")}`}
        <span style={{ ...muted, fontWeight: "normal" }}> · {labels.rebutLabel}</span>
      </h4>
      {/* the rationale renders; no hunk — a rebut explains why nothing changed (§5.8). */}
      <p data-rebuttal-rationale style={{ margin: "6px 0 0", fontSize: "12.5px", fontStyle: "italic", color: "var(--paper-fg)" }}>
        {card.rationale}
      </p>
    </section>
  );
}

/** The What-changed view (§5.8): strip + move cards + Unlinked + rebutted. Server-rendered Inline layout. */
export function WhatChangedView({ view, beforeN, afterN, commentFormAction, labels }: WhatChangedProps): ReactNode {
  return (
    <section data-what-changed="true" aria-label={labels.heading}>
      <header style={{ display: "flex", alignItems: "baseline", gap: "12px", flexWrap: "wrap" }}>
        <h3 style={{ margin: 0, fontSize: "15px", color: "var(--paper-fg)" }}>{labels.heading}</h3>
        <span data-version-line style={{ fontSize: "12.5px", ...muted }}>
          {labels.versionLabel(beforeN, afterN)}
        </span>
        <span data-strip style={{ fontSize: "12.5px", ...muted }}>
          {labels.stripLabel(view.strip)}
        </span>
      </header>
      {view.moves.map((m) => (
        <MoveCard key={m.moveId} move={m} commentFormAction={commentFormAction} labels={labels} />
      ))}
      {view.rebutted.length > 0 ? (
        <div data-rebutted-group>
          <h4 style={{ fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.06em", ...muted }}>
            {labels.rebuttedHeading}
          </h4>
          {view.rebutted.map((r) => (
            <RebuttedCard key={r.findingOrdinal} card={r} labels={labels} />
          ))}
        </div>
      ) : null}
      {view.unlinked.hunks.length > 0 || view.unlinked.entries.length > 0 ? (
        <div data-unlinked-group>
          <h4 style={{ fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.06em", ...muted }}>
            {labels.unlinkedHeading}
          </h4>
          {view.unlinked.hunks.map((h) => (
            <HunkView key={h.id} hunk={h} commentFormAction={commentFormAction} labels={labels} />
          ))}
        </div>
      ) : null}
    </section>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// rubric delta (§5.8/§6.6) — per-dimension before/after dots across rounds; NEVER an aggregate (REQ-IDE-30)
// ---------------------------------------------------------------------------------------------------------------------

export interface RubricDeltaLabels {
  readonly heading: string;
  readonly dimensionLabel: (dimension: string) => string;
  /** the before/after captions — e.g. "v2" / "v3". */
  readonly beforeLabel: string;
  readonly afterLabel: string;
}

function DeltaDots({ score }: { score: number | null }): ReactNode {
  const dots = Array.from({ length: 5 }, (_, i) => (score == null ? false : i < score));
  return (
    <span data-dots={score ?? "none"} aria-hidden="true" style={{ display: "inline-flex", gap: "4px" }}>
      {dots.map((filled, i) => (
        <span
          key={i}
          data-dot={filled ? "filled" : "empty"}
          style={{ width: "9px", height: "9px", borderRadius: "999px", background: filled ? "var(--accent)" : "transparent", border: `1px solid ${filled ? "var(--accent)" : "var(--paper-rule)"}` }}
        />
      ))}
    </span>
  );
}

/** The per-dimension rubric delta (§5.8 round summary): before → after dots per row, no total — the DOM
 *  exposes no aggregate to read as a score (REQ-IDE-30). */
export function RubricDelta({ view, labels }: { view: RubricDeltaView; labels: RubricDeltaLabels }): ReactNode {
  return (
    <section data-rubric-delta="true" aria-label={labels.heading}>
      <h3 style={{ fontSize: "13px", textTransform: "uppercase", letterSpacing: "0.06em", ...muted }}>{labels.heading}</h3>
      <ul style={{ listStyle: "none", margin: "8px 0 0", padding: 0 }}>
        {view.rows.map((r) => (
          <li
            key={r.dimension}
            data-rubric-delta-row={r.dimension}
            data-direction={r.direction}
            style={{ display: "flex", alignItems: "center", gap: "10px", padding: "6px 0", borderBottom: "1px solid var(--paper-rule)", fontSize: "12.5px" }}
          >
            <span style={{ minWidth: "160px", color: "var(--paper-fg)" }}>{labels.dimensionLabel(r.dimension)}</span>
            <span data-delta-before><DeltaDots score={r.before} /></span>
            <span aria-hidden="true" style={muted}>→</span>
            <span data-delta-after><DeltaDots score={r.after} /></span>
          </li>
        ))}
      </ul>
    </section>
  );
}
