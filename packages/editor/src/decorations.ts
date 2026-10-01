import { Decoration, DecorationSet, type EditorView } from "prosemirror-view";
import { Plugin, PluginKey, type EditorState } from "prosemirror-state";
import type { Node as PMNode } from "prosemirror-model";
import type { Anchor } from "@rhema/contracts";
import { resolveAnchor, type AnchorMethod, type PassageBlock } from "@rhema/findings-core";
import type { DocMap } from "./docmap.js";
import { docToMarkdown } from "./pm-to-md.js";
import { buildDocMap } from "./docmap.js";

// Findings as sidecar decorations — never marks, never document content (§5.4; REQ-DATA-28 amended).
// A finding's anchor resolves on the anchor ladder (exact → normalized → fuzzy) against the CURRENT
// blocks, then lands as an inline/node Decoration over the mapped PM range. The serialized markdown is
// untouched — a finding cannot alter the bytes. Unanchored/lost findings get a block-level marker at
// the document head (the "Whole piece" affordance; the card list itself renders outside the doc).

export interface FindingForDecoration {
  readonly findingId: string;
  readonly anchor: Anchor | null;
  readonly severity: string;
  /** a projection that already cleared no rung — renders the lost note on the card, no span. */
  readonly lost?: boolean;
}

export interface ResolvedFinding {
  readonly findingId: string;
  readonly severity: string;
  readonly method: AnchorMethod;
  /** PM range the decoration covers — null for unanchored/unresolved (Whole piece). */
  readonly from: number | null;
  readonly to: number | null;
  readonly blockId: string | null;
  readonly lost: boolean;
}

/** The current doc's blocks in ladder shape (positional ids — what anchor rows carry). */
export function docBlocks(doc: PMNode, markdown?: string): { blocks: PassageBlock[]; markdown: string; map: DocMap } {
  const md = markdown ?? docToMarkdown(doc);
  const map = buildDocMap(doc, md);
  return {
    markdown: md,
    map,
    blocks: map.entries.map((e) => ({ blockId: e.blockId, text: md.slice(e.mdStart, e.mdEnd) })),
  };
}

/** Resolve every finding onto the live doc → decoration ranges. Never throws; unresolved → Whole piece. */
export function resolveFindings(
  doc: PMNode,
  findings: readonly FindingForDecoration[],
  markdown?: string,
): ResolvedFinding[] {
  const { blocks, map, markdown: md } = docBlocks(doc, markdown);
  return findings.map((f) => {
    if (f.lost) {
      return { findingId: f.findingId, severity: f.severity, method: "unresolved" as const, from: null, to: null, blockId: f.anchor?.blockId ?? null, lost: true };
    }
    const res = resolveAnchor(f.anchor, blocks);
    if (res.method === "unanchored" || res.method === "unresolved" || res.blockId == null) {
      return {
        findingId: f.findingId,
        severity: f.severity,
        method: res.method,
        from: null,
        to: null,
        blockId: res.blockId,
        lost: res.method === "unresolved",
      };
    }
    const entry = map.byBlockId.get(res.blockId);
    if (!entry) return { findingId: f.findingId, severity: f.severity, method: res.method, from: null, to: null, blockId: res.blockId, lost: false };
    if (res.startOffset == null || res.endOffset == null) {
      // fuzzy resolved to a BLOCK — decorate the whole block.
      return { findingId: f.findingId, severity: f.severity, method: res.method, from: entry.pmFrom, to: entry.pmTo, blockId: res.blockId, lost: false };
    }
    const from = map.pmPosForOffset(res.blockId, res.startOffset);
    const to = map.pmPosForOffset(res.blockId, res.endOffset);
    if (from == null || to == null || to <= from) {
      return { findingId: f.findingId, severity: f.severity, method: res.method, from: entry.pmFrom, to: entry.pmTo, blockId: res.blockId, lost: false };
    }
    void md;
    return { findingId: f.findingId, severity: f.severity, method: res.method, from, to, blockId: res.blockId, lost: false };
  });
}

/** Findings → a DecorationSet: inline span decorations, block decorations for fuzzy-resolved
 *  anchors. Unanchored/unresolved findings produce NO doc decoration — the "Whole piece" card
 *  renders outside the document (this package is DOM-free; widget factories live in the client). */
export function findingDecorationSet(doc: PMNode, findings: readonly FindingForDecoration[], markdown?: string): DecorationSet {
  const resolved = resolveFindings(doc, findings, markdown);
  const decos: Decoration[] = [];
  for (const r of resolved) {
    if (r.from == null || r.to == null) continue;
    decos.push(
      Decoration.inline(r.from, r.to, {
        class: `rm-finding rm-finding-${r.severity}`,
        "data-finding-id": r.findingId,
        "data-anchor-method": r.method,
      }),
    );
  }
  return DecorationSet.create(doc, decos);
}

// ---------------------------------------------------------------------------------------------------------------------
// the decorations plugin — findings set + Authorship overlay + proposal target marks, remapped on edits
// ---------------------------------------------------------------------------------------------------------------------

export interface DecorationInputs {
  readonly findings: readonly FindingForDecoration[];
  /** blockId → css-class suffix for the Authorship overlay (e.g. "agent", "human", "mixed"). */
  readonly authorship: ReadonlyMap<string, string> | null;
  /** proposal targets: blockId → proposal id (the anchored block gets the target mark). */
  readonly proposals: ReadonlyMap<string, string> | null;
}

export const decorationInputsKey = new PluginKey<DecorationInputs>("rhema-page-inputs");

interface DecoState {
  inputs: DecorationInputs;
  set: DecorationSet;
}

export const pageDecorationsKey = new PluginKey<DecoState>("rhema-page-decorations");

function buildSet(state: EditorState, inputs: DecorationInputs): DecorationSet {
  const decos: Decoration[] = [];
  const doc = state.doc;
  const md = docToMarkdown(doc);
  const map = buildDocMap(doc, md);
  const blocks: PassageBlock[] = map.entries.map((e) => ({ blockId: e.blockId, text: md.slice(e.mdStart, e.mdEnd) }));

  for (const f of inputs.findings) {
    if (f.lost) continue;
    const res = resolveAnchor(f.anchor, blocks);
    if (res.blockId == null) continue;
    const entry = map.byBlockId.get(res.blockId);
    if (!entry) continue;
    if (res.startOffset != null && res.endOffset != null) {
      const from = map.pmPosForOffset(res.blockId, res.startOffset);
      const to = map.pmPosForOffset(res.blockId, res.endOffset);
      if (from != null && to != null && to > from) {
        decos.push(Decoration.inline(from, to, {
          class: `rm-finding rm-finding-${f.severity}`,
          "data-finding-id": f.findingId,
          "data-anchor-method": res.method,
        }));
        continue;
      }
    }
    decos.push(Decoration.node(entry.pmFrom, entry.pmTo, {
      class: `rm-finding-block rm-finding-${f.severity}`,
      "data-finding-id": f.findingId,
      "data-anchor-method": res.method,
    }));
  }

  if (inputs.authorship) {
    for (const e of map.entries) {
      const cls = inputs.authorship.get(e.blockId);
      if (cls) {
        decos.push(Decoration.node(e.pmFrom, e.pmTo, {
          class: `rm-author-${cls}`,
          "data-author": cls,
        }));
      }
    }
  }

  if (inputs.proposals) {
    for (const e of map.entries) {
      const pid = inputs.proposals.get(e.blockId);
      if (pid) decos.push(Decoration.node(e.pmFrom, e.pmTo, { class: "rm-proposal-target", "data-proposal-id": pid }));
    }
  }

  return DecorationSet.create(doc, decos);
}

/**
 * The decorations plugin. Sidecar inputs arrive via `tr.setMeta(decorationInputsKey, partial)`; on
 * ordinary edits the existing set maps through the transaction (PM's content-aware remapping), and the
 * caller refreshes inputs at load/save/poll cadence.
 */
export function decorationsPlugin(): Plugin {
  return new Plugin<DecoState>({
    key: pageDecorationsKey,
    state: {
      init: (_, _state) => {
        const inputs: DecorationInputs = { findings: [], authorship: null, proposals: null };
        return { inputs, set: DecorationSet.empty };
      },
      apply(tr, prev, _old, state) {
        const meta = tr.getMeta(decorationInputsKey) as Partial<DecorationInputs> | undefined;
        if (meta) {
          const inputs: DecorationInputs = { ...prev.inputs, ...meta };
          return { inputs, set: buildSet(state, inputs) };
        }
        return { inputs: prev.inputs, set: prev.set.map(tr.mapping, tr.doc) };
      },
    },
    props: {
      decorations(state) {
        return pageDecorationsKey.getState(state)?.set;
      },
    },
  });
}

/** Convenience: set the plugin's inputs from the client (used by the Page island). */
export function setDecorationInputs(view: EditorView, inputs: Partial<DecorationInputs>): void {
  view.dispatch(view.state.tr.setMeta(decorationInputsKey, inputs));
}
