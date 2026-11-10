import type { CSSProperties, ReactNode } from "react";
import { Button } from "./primitives/button.js";
import { TextField } from "./primitives/fields.js";
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

function BlockText({ text, side }: { text: string; side: "before" | "after" }): ReactNode {
  return (
    <div
      data-diff-side={side}
      className="ui-c2-m0 ui-t-p810 ui-d-fs ui-t-lh5 ui-d-sev"
      style={
        {
          "--d-sev": side === "before" ? "var(--paper-diff-del)" : "var(--paper-diff-add)",
          borderLeft: `2px solid ${side === "before" ? "var(--sev-major, #b33)" : "var(--accent, #3a7)"}`,
        } as CSSProperties
      }
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
    <div data-hunk={hunk.id} data-hunk-kind={hunk.kind} className="ui-t-ma0">
      <div className="ui-d-s ui-t-ls5 ui-t-pm" style={{ textTransform: "uppercase" }}>
        {labels.hunkKindLabel(hunk.kind)}
      </div>
      {hunk.before.map((b) => (
        <BlockText key={`b-${b.blockId}`} text={b.text} side="before" />
      ))}
      {hunk.after.map((b) => (
        <BlockText key={`a-${b.blockId}`} text={b.text} side="after" />
      ))}
      {commentFormAction ? (
        <form
          method="post"
          action={commentFormAction(hunk.id)}
          data-hunk-comment={hunk.id}
          className="ui-d-mt6 ui-d-g6"
          style={{ display: "flex" }}
        >
          <TextField
            type="text"
            name="text"
            required
            placeholder={labels.commentPlaceholder}
            aria-label={labels.commentLabel}
            className="ui-t-p58 ui-d-fs ui-t-r1 ui-fcard--p"
            style={{ flex: 1, border: "1px solid var(--paper-rule)" }}
          />
          <Button type="submit" className="ui-t-p510 ui-d-fs">
            {labels.commentSubmit}
          </Button>
        </form>
      ) : null}
    </div>
  );
}

function MoveCard({
  move,
  commentFormAction,
  labels,
}: {
  move: MoveCardView;
  commentFormAction?: (hunkId: string) => string;
  labels: WhatChangedLabels;
}): ReactNode {
  return (
    <section
      data-move-card={move.moveId}
      data-move-ordinal={move.moveOrdinal}
      className="ui-t-r6 ui-t-p1214 ui-t-m30"
      style={{ border: "1px solid var(--paper-rule)" }}
    >
      <h4 className="ui-c2-m0 ui-d-fs14 ui-t-pf">
        {labels.moveHeading(move)}
        {move.type ? <span className="ui-t-pm ui-t-w4"> · {move.type}</span> : null}
      </h4>
      <ul className="ui-t-m20 ui-d-p0 ui-d-fs ui-t-pm" style={{ listStyle: "none" }}>
        {move.findings.map((f) => (
          <li key={`f-${f.findingOrdinal}`} data-move-finding={f.findingOrdinal}>
            {labels.findingLine(f)}
          </li>
        ))}
      </ul>
      {move.dischargeLines.length > 0 ? (
        <ul data-discharge-lines className="ui-t-m60 ui-d-p0 ui-d-fs" style={{ listStyle: "none" }}>
          {move.dischargeLines.map((l) => (
            <li
              key={l.obligationId}
              data-obligation={l.obligationId}
              data-obligation-state={l.state}
            >
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

function RebuttedCard({
  card,
  labels,
}: {
  card: RebuttedCardView;
  labels: WhatChangedLabels;
}): ReactNode {
  return (
    <section
      data-rebutted-finding={card.findingOrdinal}
      className="ui-t-r6 ui-t-p1214 ui-t-m30"
      style={{ border: "1px dashed var(--paper-rule)" }}
    >
      <h4 className="ui-c2-m0 ui-d-fd ui-t-pf">
        {card.title ?? `F-${String(card.findingOrdinal).padStart(2, "0")}`}
        <span className="ui-t-pm ui-t-w4"> · {labels.rebutLabel}</span>
      </h4>
      {/* the rationale renders; no hunk — a rebut explains why nothing changed (§5.8). */}
      <p data-rebuttal-rationale className="ui-t-m60 ui-d-fs ui-d-it ui-t-pf">
        {card.rationale}
      </p>
    </section>
  );
}

/** The What-changed view (§5.8): strip + move cards + Unlinked + rebutted. Server-rendered Inline layout. */
export function WhatChangedView({
  view,
  beforeN,
  afterN,
  commentFormAction,
  labels,
}: WhatChangedProps): ReactNode {
  return (
    <section data-what-changed="true" aria-label={labels.heading}>
      <header
        className="ui-c2-g3"
        style={{ display: "flex", alignItems: "baseline", flexWrap: "wrap" }}
      >
        <h3 className="ui-c2-m0 ui-t-f16 ui-t-pf">{labels.heading}</h3>
        <span data-version-line className="ui-d-fs ui-t-pm">
          {labels.versionLabel(beforeN, afterN)}
        </span>
        <span data-strip className="ui-d-fs ui-t-pm">
          {labels.stripLabel(view.strip)}
        </span>
      </header>
      {view.moves.map((m) => (
        <MoveCard key={m.moveId} move={m} commentFormAction={commentFormAction} labels={labels} />
      ))}
      {view.rebutted.length > 0 ? (
        <div data-rebutted-group>
          <h4 className="ui-d-fs ui-t-ls6 ui-t-pm" style={{ textTransform: "uppercase" }}>
            {labels.rebuttedHeading}
          </h4>
          {view.rebutted.map((r) => (
            <RebuttedCard key={r.findingOrdinal} card={r} labels={labels} />
          ))}
        </div>
      ) : null}
      {view.unlinked.hunks.length > 0 || view.unlinked.entries.length > 0 ? (
        <div data-unlinked-group>
          <h4 className="ui-d-fs ui-t-ls6 ui-t-pm" style={{ textTransform: "uppercase" }}>
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
    <span
      data-dots={score ?? "none"}
      aria-hidden="true"
      className="ui-c2-g1"
      style={{ display: "inline-flex" }}
    >
      {dots.map((filled, i) => (
        <span
          key={i}
          data-dot={filled ? "filled" : "empty"}
          className="ui-t-s9 ui-t-rp ui-d-sev"
          style={
            {
              "--d-sev": filled ? "var(--accent)" : "transparent",
              border: `1px solid ${filled ? "var(--accent)" : "var(--paper-rule)"}`,
            } as CSSProperties
          }
        />
      ))}
    </span>
  );
}

/** The per-dimension rubric delta (§5.8 round summary): before → after dots per row, no total — the DOM
 *  exposes no aggregate to read as a score (REQ-IDE-30). */
export function RubricDelta({
  view,
  labels,
}: {
  view: RubricDeltaView;
  labels: RubricDeltaLabels;
}): ReactNode {
  return (
    <section data-rubric-delta="true" aria-label={labels.heading}>
      <h3 className="ui-d-fd ui-t-ls6 ui-t-pm" style={{ textTransform: "uppercase" }}>
        {labels.heading}
      </h3>
      <ul className="ui-t-m20 ui-d-p0" style={{ listStyle: "none" }}>
        {view.rows.map((r) => (
          <li
            key={r.dimension}
            data-rubric-delta-row={r.dimension}
            data-direction={r.direction}
            className="ui-d-g10 ui-t-p60 ui-d-fs"
            style={{
              display: "flex",
              alignItems: "center",
              borderBottom: "1px solid var(--paper-rule)",
            }}
          >
            <span className="ui-t-mw160 ui-t-pf">{labels.dimensionLabel(r.dimension)}</span>
            <span data-delta-before>
              <DeltaDots score={r.before} />
            </span>
            <span aria-hidden="true" className="ui-t-pm">
              →
            </span>
            <span data-delta-after>
              <DeltaDots score={r.after} />
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
