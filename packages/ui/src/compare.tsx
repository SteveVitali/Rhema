import type { CSSProperties, ReactNode } from "react";
import type { BlockDiff, DiffBlock, DiffHunk } from "@rhema/findings-core";
import type { WhatChangedView as WhatChangedViewModel } from "@rhema/findings-core";
import { WhatChangedView, type WhatChangedLabels } from "./what-changed.js";

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

const muted: CSSProperties = { color: "var(--paper-fg-muted, var(--shell-fg-muted))" };

function BlockCell({ block, side }: { block: DiffBlock | null; side: "before" | "after" }): ReactNode {
  return (
    <div
      data-diff-block={block?.blockId ?? "empty"}
      data-diff-side={side}
      style={{
        flex: 1,
        minWidth: 0,
        padding: "6px 9px",
        fontSize: "12.5px",
        lineHeight: 1.5,
        whiteSpace: "pre-wrap",
        background: !block
          ? "transparent"
          : side === "before"
            ? "var(--paper-diff-del)"
            : "var(--paper-diff-add)",
        borderLeft: block
          ? `2px solid ${side === "before" ? "var(--sev-major, #b33)" : "var(--accent, #3a7)"}`
          : "2px solid transparent",
      }}
    >
      {block?.text ?? ""}
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
          <div key={h.id} data-hunk={h.id} data-hunk-kind={h.kind} style={{ margin: "8px 0" }}>
            <div style={{ fontSize: "10.5px", textTransform: "uppercase", letterSpacing: "0.05em", ...muted }}>
              {labels.hunkKindLabel(h.kind)}
            </div>
            {Array.from({ length: rows }, (_, i) => (
              <div key={i} style={{ display: "flex", gap: "8px" }}>
                <BlockCell block={h.before[i] ?? null} side="before" />
                <BlockCell block={h.after[i] ?? null} side="after" />
              </div>
            ))}
            {commentFormAction ? (
              <form method="post" action={commentFormAction(h.id)} data-hunk-comment={h.id} style={{ marginTop: "6px", display: "flex", gap: "6px" }}>
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
      })}
      {diff.hunks.length === 0 ? <p style={muted}>{labels.noChanges}</p> : null}
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
        <div key={h.id} data-hunk={h.id} data-hunk-kind={h.kind} style={{ margin: "10px 0" }}>
          <div style={{ fontSize: "10.5px", textTransform: "uppercase", letterSpacing: "0.05em", ...muted }}>
            {labels.hunkKindLabel(h.kind)}
          </div>
          {h.before.map((b) => (
            <BlockCell key={`b-${b.blockId}`} block={b} side="before" />
          ))}
          {h.after.map((b) => (
            <BlockCell key={`a-${b.blockId}`} block={b} side="after" />
          ))}
          {commentFormAction ? (
            <form method="post" action={commentFormAction(h.id)} data-hunk-comment={h.id} style={{ marginTop: "6px", display: "flex", gap: "6px" }}>
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
      ))}
      {diff.hunks.length === 0 ? <p style={muted}>{labels.noChanges}</p> : null}
    </div>
  );
}

export function CompareView(props: CompareProps): ReactNode {
  const L = props.labels;
  return (
    <section data-compare data-layout={props.layout} aria-label={L.heading}>
      <header style={{ display: "flex", alignItems: "baseline", gap: "12px", flexWrap: "wrap" }}>
        <h3 style={{ margin: 0, fontSize: "15px" }}>{L.heading}</h3>
        <span data-version-line style={{ fontSize: "12.5px", ...muted }}>
          {L.versionLabel(props.beforeN, props.afterN)}
        </span>
        <nav aria-label={L.heading} style={{ display: "inline-flex", gap: "6px", fontSize: "12px" }}>
          {(["side", "inline", "moves"] as const).map((l) => (
            <a
              key={l}
              href={props.layoutHref(l)}
              data-layout-link={l}
              aria-current={props.layout === l ? "true" : undefined}
              style={{
                padding: "2px 8px",
                borderRadius: "999px",
                border: `1px solid ${props.layout === l ? "var(--accent)" : "var(--paper-rule)"}`,
                textDecoration: "none",
                color: "inherit",
              }}
            >
              {L.layouts[l]}
            </a>
          ))}
        </nav>
        <span style={{ fontSize: "11.5px", ...muted }}>{L.unchangedFmt(props.diff.unchanged)}</span>
      </header>

      {props.layout === "side" ? (
        <SideBySide diff={props.diff} commentFormAction={props.commentFormAction} labels={L} />
      ) : null}
      {props.layout === "inline" ? (
        <InlineDiff diff={props.diff} commentFormAction={props.commentFormAction} labels={L} />
      ) : null}
      {props.layout === "moves" ? (
        <>
          {!props.linked ? <p data-unlinked-note style={{ fontSize: "12px", ...muted }}>{L.unlinkedNote}</p> : null}
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
