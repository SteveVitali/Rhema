import { Fragment, type ReactNode } from "react";
import type { BlockDiff, DiffBlock, DiffHunk, WordRun } from "@rhema/findings-core";
import { diffWords, wordPairable } from "@rhema/findings-core";
import type { WhatChangedView as WhatChangedViewModel } from "@rhema/findings-core";
import { WhatChangedView, type WhatChangedLabels } from "./what-changed.js";
import { Button } from "./primitives/button.js";
import { TextField } from "./primitives/fields.js";

// The §5.8 compare page (P1.08; REQ-IDE-33): three read-only layouts over the ONE server-projected
// diff — `side` (before/after block columns), `inline` (the hunk list), `moves` ("What changed and
// why" — the ledger-joined WhatChangedView). No editing affordances ever render here; the hunk
// comment form is the only interactive element (a plain POST → Guidance for the next Revise).
// Text-agnostic — all copy via `labels`.

export type CompareLayout = "side" | "inline" | "moves";

export interface CompareLabels {
  readonly heading: string;
  readonly versionLabel: (beforeN: number, afterN: number | null) => string;
  readonly layouts: Record<CompareLayout, string>;
  readonly beforeCol: string;
  readonly afterCol: string;
  readonly unchangedFmt: (n: number) => string;
  readonly hunkKindLabel: (kind: DiffHunk["kind"]) => string;
  /** the unledgered caption — "edits not tied to a finding (coherence read)". */
  readonly unlinkedNote: string;
  readonly noChanges: string;
  readonly commentLabel: string;
  readonly commentPlaceholder: string;
  readonly commentSubmit: string;
  readonly moves: WhatChangedLabels;
}

export interface CompareProps {
  readonly beforeN: number;
  readonly afterN: number | null;
  readonly layout: CompareLayout;
  readonly diff: BlockDiff;
  readonly view: WhatChangedViewModel;
  /** true ⇒ a response ledger joined the hunks (the moves layout's source); false ⇒ coherence read. */
  readonly linked: boolean;
  readonly layoutHref: (layout: CompareLayout) => string;
  readonly commentFormAction?: (hunkId: string) => string;
  readonly labels: CompareLabels;
}

/** The paired word marks for one before/after block row (333_R7UX.10, BL-88): the run set is the
 *  prosemirror-changeset 1.x `Change` shape, shared between the row's two cells — the before cell
 *  strikes `deleted`/`edited` A-spans, the after cell underlines `inserted`/`edited` B-spans. */
interface WordMarks {
  readonly beforeText: string;
  readonly afterText: string;
  readonly runs: readonly WordRun[];
}

/** Word marks only where the pair is a real edit (the hunk's own coverage floor) — below it the
 *  paragraphs are a remove+add and per-word marks would only restate the block tint. */
function wordMarks(beforeText: string, afterText: string): WordMarks | undefined {
  if (!wordPairable(beforeText, afterText)) return undefined;
  const runs = diffWords(beforeText, afterText);
  return runs.some((r) => r.kind !== "same") ? { beforeText, afterText, runs } : undefined;
}

function MarkedCellText({ marks, side }: { marks: WordMarks; side: "before" | "after" }): ReactNode {
  const src = side === "before" ? marks.beforeText : marks.afterText;
  return marks.runs.map((r, i) => {
    const text = src.slice(side === "before" ? r.fromA : r.fromB, side === "before" ? r.toA : r.toB);
    if (text === "") return null;
    if (r.kind === "same") return <Fragment key={i}>{text}</Fragment>;
    return side === "before" ? (
      <del
        key={i}
        data-diff-word="deleted"
        style={{ textDecoration: "line-through", textDecorationColor: "var(--sev-major)", textDecorationThickness: "1.5px" }}
      >
        {text}
      </del>
    ) : (
      <ins
        key={i}
        data-diff-word="inserted"
        style={{ textDecoration: "underline", textDecorationColor: "var(--accent)", textDecorationThickness: "1.5px", textUnderlineOffset: "2px" }}
      >
        {text}
      </ins>
    );
  });
}

function BlockCell({
  block,
  side,
  marks,
}: {
  block: DiffBlock | null;
  side: "before" | "after";
  marks?: WordMarks;
}): ReactNode {
  return (
    <div
      data-diff-block={block?.blockId ?? "empty"}
      data-diff-side={side}
      className={`ui-d-cell ui-vc-grow${block ? (side === "before" ? " ui-d-cell--del" : " ui-d-cell--add") : ""}`}
      style={{
        whiteSpace: "pre-wrap",
        borderLeft: block
          ? `2px solid ${side === "before" ? "var(--sev-major, #b33)" : "var(--accent, #3a7)"}`
          : "2px solid transparent",
      }}
    >
      {marks != null && block != null ? <MarkedCellText marks={marks} side={side} /> : (block?.text ?? "")}
    </div>
  );
}

/** Side-by-side: one row per hunk — its before blocks left, its after blocks right, padded to equal
 *  height pairs. Unchanged context collapses to a single count line between rows. The comment form
 *  rides each hunk here too ("inline comments on ANY hunk" — §5.8, P1.08). */
function SideBySide({
  diff,
  commentFormAction,
  labels,
}: {
  diff: BlockDiff;
  commentFormAction?: (hunkId: string) => string;
  labels: CompareLabels;
}): ReactNode {
  return (
    <div data-compare-layout="side">
      {diff.hunks.map((h) => {
        const rows = Math.max(h.before.length, h.after.length);
        return (
          <div key={h.id} data-hunk={h.id} data-hunk-kind={h.kind} className="ui-c2-mt ui-c2-mb">
            <div className="ui-d-cap ui-d-cm ui-d-s">
              {labels.hunkKindLabel(h.kind)}
            </div>
            {Array.from({ length: rows }, (_, i) => {
              const b = h.before[i] ?? null;
              const a = h.after[i] ?? null;
              const marks = b != null && a != null ? wordMarks(b.text, a.text) : undefined;
              return (
                <div key={i} className="ui-d-acts" style={{ display: "flex" }}>
                  <BlockCell block={b} side="before" {...(marks ? { marks } : {})} />
                  <BlockCell block={a} side="after" {...(marks ? { marks } : {})} />
                </div>
              );
            })}
            {commentFormAction ? (
              <form method="post" action={commentFormAction(h.id)} data-hunk-comment={h.id} className="ui-d-mt6 ui-d-g6" style={{ display: "flex" }}>
                <TextField
                  type="text"
                  name="text"
                  required
                  placeholder={labels.commentPlaceholder}
                  aria-label={labels.commentLabel}
                  style={{ flex: 1 }}
                />
                <Button type="submit" size="sm">
                  {labels.commentSubmit}
                </Button>
              </form>
            ) : null}
          </div>
        );
      })}
      {diff.hunks.length === 0 ? <p className="ui-d-cm">{labels.noChanges}</p> : null}
    </div>
  );
}

/** Inline: the sequential hunk list — before blocks then after blocks per hunk, commentable. */
function InlineDiff({
  diff,
  commentFormAction,
  labels,
}: {
  diff: BlockDiff;
  commentFormAction?: (hunkId: string) => string;
  labels: CompareLabels;
}): ReactNode {
  return (
    <div data-compare-layout="inline">
      {diff.hunks.map((h) => (
        <div key={h.id} data-hunk={h.id} data-hunk-kind={h.kind} className="ui-c2-mt ui-c2-mb">
          <div className="ui-d-cap ui-d-cm ui-d-s">
            {labels.hunkKindLabel(h.kind)}
          </div>
          {(() => {
            // positional pairing inside the hunk (the same seam the side-layout rows use) — word
            // marks render only where `wordMarks` clears the pairing floor.
            const pairCount = Math.min(h.before.length, h.after.length);
            const marks = Array.from({ length: pairCount }, (_, i) =>
              wordMarks(h.before[i]!.text, h.after[i]!.text),
            );
            return (
              <>
                {h.before.map((b, i) => (
                  <BlockCell
                    key={`b-${b.blockId}`}
                    block={b}
                    side="before"
                    {...(i < pairCount && marks[i] ? { marks: marks[i]! } : {})}
                  />
                ))}
                {h.after.map((b, i) => (
                  <BlockCell
                    key={`a-${b.blockId}`}
                    block={b}
                    side="after"
                    {...(i < pairCount && marks[i] ? { marks: marks[i]! } : {})}
                  />
                ))}
              </>
            );
          })()}
          {commentFormAction ? (
            <form method="post" action={commentFormAction(h.id)} data-hunk-comment={h.id} className="ui-d-mt6 ui-d-g6" style={{ display: "flex" }}>
              <TextField
                type="text"
                name="text"
                required
                placeholder={labels.commentPlaceholder}
                aria-label={labels.commentLabel}
                style={{ flex: 1 }}
              />
              <Button type="submit" size="sm">
                {labels.commentSubmit}
              </Button>
            </form>
          ) : null}
        </div>
      ))}
      {diff.hunks.length === 0 ? <p className="ui-d-cm">{labels.noChanges}</p> : null}
    </div>
  );
}

export function CompareView(props: CompareProps): ReactNode {
  const L = props.labels;
  return (
    <section data-compare data-layout={props.layout} aria-label={L.heading}>
      <header className="ui-c2-g3" style={{ display: "flex", alignItems: "baseline", flexWrap: "wrap" }}>
        <h3 className="ui-c2-m0 ui-d-h">{L.heading}</h3>
        <span data-version-line className="ui-d-cm ui-d-fs">
          {L.versionLabel(props.beforeN, props.afterN)}
        </span>
        <nav aria-label={L.heading} className="ui-d-g6 ui-d-fs" style={{ display: "inline-flex" }}>
          {(["side", "inline", "moves"] as const).map((l) => (
            <a
              key={l}
              href={props.layoutHref(l)}
              data-layout-link={l}
              aria-current={props.layout === l ? "true" : undefined}
              className="ui-d-tab ui-d-inh"
              style={{
                border: `1px solid ${props.layout === l ? "var(--accent)" : "var(--paper-rule)"}`,
                textDecoration: "none",
              }}
            >
              {L.layouts[l]}
            </a>
          ))}
        </nav>
        <span className="ui-d-cm ui-d-s">{L.unchangedFmt(props.diff.unchanged)}</span>
      </header>

      {props.layout === "side" ? (
        <SideBySide diff={props.diff} commentFormAction={props.commentFormAction} labels={L} />
      ) : null}
      {props.layout === "inline" ? (
        <InlineDiff diff={props.diff} commentFormAction={props.commentFormAction} labels={L} />
      ) : null}
      {props.layout === "moves" ? (
        <>
          {!props.linked ? <p data-unlinked-note className="ui-d-cm ui-d-fs">{L.unlinkedNote}</p> : null}
          <WhatChangedView
            view={props.view}
            beforeN={props.beforeN}
            afterN={props.afterN}
            {...(props.commentFormAction ? { commentFormAction: props.commentFormAction } : {})}
            labels={L.moves}
          />
        </>
      ) : null}
    </section>
  );
}
