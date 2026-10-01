import { Plugin, PluginKey, type EditorState, type Transaction } from "prosemirror-state";
import type { StepMap } from "prosemirror-transform";
import type { Node as PMNode } from "prosemirror-model";
import type { ProvenanceSource } from "@rhema/contracts";

// Block-level provenance capture (P1.02; §5.4, REQ-DATA-29 amended, REQ-POS-8/9). Transaction origins
// — carried on `tr.setMeta("rhema:origin", …)` — stamp every touched top-level block; the save path
// emits the block-level span map (`{blockId → source}`) into `provenance_maps`. Agent-origin
// transactions additionally record their touched SPAN SET at capture (write-only — REQ-POS-9); a
// human/pasted edit inside a recorded span degrades that block to `mixed` (the contracts kind added
// in this PR). No span rebasing; span RENDERING is 1.x (REQ-POS-10).
//
// Origins (transaction meta values):
//   "human" | "human-mobile" | "pasted" | "assistant" | "suggestion-applied" | "agent:<seat>:<run>"
// `drafter:run` from §5.4 lands as `agent:author:<runId>` — the seat literal.

export type EditOrigin =
  | "human"
  | "human-mobile"
  | "pasted"
  | "assistant"
  | "suggestion-applied"
  | `agent:${string}`;

export const ORIGIN_META = "rhema:origin";

/** The provenance kind an origin stamps on touched blocks. */
export function originToSource(origin: EditOrigin, ctx: { runId?: string; draftN?: number; threadId?: string } = {}): ProvenanceSource | { kind: "mixed" } {
  if (origin.startsWith("agent:")) {
    return { kind: "agent", runId: ctx.runId ?? "run_unknown", draftN: ctx.draftN ?? 0 } as ProvenanceSource;
  }
  switch (origin) {
    case "human": return { kind: "human" };
    case "human-mobile": return { kind: "human_mobile" };
    case "pasted": return { kind: "pasted" };
    case "assistant": return { kind: "chat", threadId: ctx.threadId ?? "chat" } as ProvenanceSource;
    case "suggestion-applied": return { kind: "suggestion_applied", runId: ctx.runId ?? "run_unknown", findingId: "fnd_unknown" } as ProvenanceSource;
    default: return { kind: "human" };
  }
}

export function isAgentOrigin(origin: string | null | undefined): boolean {
  return !!origin && (origin.startsWith("agent:") || origin === "assistant" || origin === "suggestion-applied");
}

export function isHumanOrigin(origin: string | null | undefined): boolean {
  return !!origin && (origin === "human" || origin === "human-mobile" || origin === "pasted");
}

export type BlockSource = ProvenanceSource | { kind: "mixed" };

/** One span captured at an agent-origin transaction — write-only (REQ-POS-9). */
export interface CapturedSpan {
  readonly from: number;
  readonly to: number;
}

export interface ProvenancePluginState {
  /** positional blockId ("b<ordinal>") → the source that last wrote the block. */
  readonly sources: ReadonlyMap<string, BlockSource>;
  /** live-mapped captured agent spans (mapped forward through every transaction). */
  readonly agentSpans: readonly CapturedSpan[];
}

export const provenanceKey = new PluginKey<ProvenancePluginState>("rhema-provenance");

/** The positional block ids of the top-level nodes intersecting [from,to) in `doc`. */
export function touchedBlockIds(doc: PMNode, from: number, to: number): string[] {
  const ids: string[] = [];
  let i = 0;
  doc.forEach((node, offset) => {
    i += 1;
    const end = offset + node.nodeSize;
    if (end >= from && offset <= to) ids.push(`b${i}`);
  });
  return ids;
}

/** Every top-level block's {from,to,blockId} — the overlay + emission pass' geometry. */
export function topBlocks(doc: PMNode): { from: number; to: number; blockId: string }[] {
  const out: { from: number; to: number; blockId: string }[] = [];
  let i = 0;
  doc.forEach((node, offset) => {
    i += 1;
    out.push({ from: offset, to: offset + node.nodeSize, blockId: `b${i}` });
  });
  return out;
}

/** The ranges a transaction touched in the NEW doc (union of step maps' new sides). */
export function touchedRanges(tr: Transaction): { from: number; to: number }[] {
  const out: { from: number; to: number }[] = [];
  for (const step of tr.steps) {
    const m: StepMap = step.getMap();
    m.forEach((_oS, _oE, nS, nE) => out.push({ from: nS, to: nE }));
  }
  if (out.length === 0 && tr.selectionSet) {
    // selection-only transactions touch nothing
    return out;
  }
  if (out.length === 0 && (tr.docChanged || tr.steps.length === 0)) {
    out.push({ from: tr.selection.from, to: tr.selection.to });
  }
  return out;
}

/** The block-level span map for a save (`provenance_maps.spans` rows; mixed-source blocks included). */
export function provenanceSpans(state: ProvenancePluginState, doc: PMNode): { blockId: string; source: BlockSource }[] {
  return topBlocks(doc).map((b) => ({
    blockId: b.blockId,
    source: state.sources.get(b.blockId) ?? ({ kind: "human" } as const),
  }));
}

/**
 * The provenance plugin. Initial sources come from the version's stored map (`initSources` —
 * `{blockId → source}`); transactions with `ORIGIN_META` stamp touched blocks, agent-origin ones also
 * record their span set, and human-origin steps inside a recorded span degrade those blocks to
 * `mixed` (REQ-POS-9 — no rebasing, write-only).
 */
export function provenancePlugin(initSources?: ReadonlyMap<string, BlockSource>): Plugin {
  return new Plugin<ProvenancePluginState>({
    key: provenanceKey,
    state: {
      init: (_, state) => {
        const sources = new Map<string, BlockSource>(initSources ?? []);
        // cover every block (a version without a stored map attributes to human by default)
        if (sources.size === 0) for (const b of topBlocks(state.doc)) sources.set(b.blockId, { kind: "human" });
        return { sources, agentSpans: [] };
      },
      apply(tr, prev, _old, newState) {
        const origin = tr.getMeta(ORIGIN_META) as EditOrigin | undefined;
        const agentSpans = prev.agentSpans.map((s) => {
          const r = tr.mapping.mapResult(s.from, -1);
          const r2 = tr.mapping.mapResult(s.to, 1);
          return { from: r.pos, to: r2.pos };
        }).filter((s) => s.to > s.from);
        if (!origin || !tr.docChanged) return { sources: prev.sources, agentSpans };

        const sources = new Map(prev.sources);
        const touched = new Set<string>();
        for (const r of touchedRanges(tr)) for (const id of touchedBlockIds(newState.doc, r.from, r.to)) touched.add(id);

        const src = originToSource(origin);
        const agent = isAgentOrigin(origin);

        for (const id of touched) {
          if (agent) {
            sources.set(id, src);
          } else if (isHumanOrigin(origin)) {
            // human edit inside a recorded agent span degrades the block to mixed (REQ-POS-9).
            const blockRange = topBlocks(newState.doc).find((b) => b.blockId === id);
            const inside = blockRange
              ? agentSpans.some((s) => s.from <= blockRange.to && s.to >= blockRange.from)
              : false;
            sources.set(id, inside ? { kind: "mixed" } : src);
          } else {
            sources.set(id, src);
          }
        }

        const spans = agent ? [...agentSpans, ...touchedRanges(tr)] : agentSpans;
        return { sources, agentSpans: spans };
      },
    },
  });
}

/** Read the plugin's span map for the save payload. */
export function provenanceForSave(state: EditorState): { blockId: string; source: BlockSource }[] {
  const p = provenanceKey.getState(state);
  return p ? provenanceSpans(p, state.doc) : topBlocks(state.doc).map((b) => ({ blockId: b.blockId, source: { kind: "human" } }));
}

/** BlockId → css suffix for the Authorship overlay (REQ-POS-8). */
export function authorshipClasses(state: ProvenancePluginState): Map<string, string> {
  const out = new Map<string, string>();
  for (const [id, src] of state.sources) {
    const cls = src.kind === "human" ? "human"
      : src.kind === "human_mobile" ? "human"
      : src.kind === "mixed" ? "mixed"
      : src.kind === "agent" ? "agent"
      : src.kind === "chat" ? "assistant"
      : src.kind === "suggestion_applied" ? "agent"
      : "human";
    out.set(id, cls);
  }
  return out;
}
