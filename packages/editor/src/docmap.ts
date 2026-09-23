import type { Node as PMNode } from "prosemirror-model";
import { parseCanonical } from "@rhema/markdown";
import { splitMarkdownBlocks } from "@rhema/findings-core";
import type { Md, MdRoot } from "./mdast-types.js";
import { findCiteSpans } from "./cite.js";

// The docmap: blockId ↔ PM-position mapping for a loaded document (P1.02; §5.4). Canonical markdown
// serializes each top-level PM node as its own blank-line-separated block — EXCEPT consecutive link
// definitions, which `tightDefinitions` joins on a single newline (one md block ↔ several nodes). The
// map therefore assigns each top-level node to the markdown block containing its mdast position, and a
// block may own a run of nodes. When the alignment can't be proven (a node set that doesn't map
// cleanly), `ok` is false and every lookup falls back to the whole document — decorations degrade to
// block scope, never to a wrong span.
//
// Inline mapping uses mdast `position` offsets: each PM inline leaf is paired with the mdast child it
// came from, so a markdown offset inside the block text lands on an exact PM position. Escaped text
// (`\[@key]`) is walked escape-aware — an md offset counts the `\` the pm text doesn't.

/** Escapable punctuation per CommonMark (`\X` → literal X). */
const ESCAPABLE = /[!-/:-@[-`{-~]/;

/** value-index → raw-md-index map for a text node's raw slice (handles `\X` escapes). */
function valueToRawOffsets(raw: string): number[] {
  // valueToRaw[i] = raw index where value char i starts; one extra trailing entry = end offset.
  const map: number[] = [];
  let i = 0;
  while (i < raw.length) {
    if (raw[i] === "\\" && i + 1 < raw.length && ESCAPABLE.test(raw[i + 1]!)) {
      map.push(i);
      i += 2;
    } else {
      map.push(i);
      i += 1;
    }
  }
  map.push(raw.length); // end sentinel
  return map;
}

/** One PM inline leaf ↔ its mdast source span (absolute offsets in the canonical markdown). */
export interface InlineLeaf {
  readonly pmFrom: number;
  readonly pmTo: number;
  readonly mdStart: number;
  readonly mdEnd: number;
  readonly kind: "text" | "atom";
  readonly node: PMNode;
}

/** One markdown block ↔ the PM top-level node(s) serializing to it. */
export interface BlockEntry {
  readonly blockId: string;
  readonly index: number;
  /** trimmed-text span in the canonical markdown (what anchors' offsets count into). */
  readonly mdStart: number;
  readonly mdEnd: number;
  /** PM position just before the first owned node / just after the last. */
  readonly pmFrom: number;
  readonly pmTo: number;
  readonly nodes: readonly { pos: number; node: PMNode; mdast: Md }[];
}

export interface DocMap {
  readonly markdown: string;
  /** false ⇒ coarse fallback (single whole-document entry); lookups still answer. */
  readonly ok: boolean;
  readonly entries: readonly BlockEntry[];
  /** blockId → entry. */
  readonly byBlockId: ReadonlyMap<string, BlockEntry>;
  /** PM position → the owning block entry (top-level granularity). */
  blockForPos(pos: number): BlockEntry | null;
  /** blockId → {from,to} PM range covering the block's nodes. */
  rangeForBlock(blockId: string): { from: number; to: number } | null;
  /** md offset inside a block's trimmed text → a PM position (exact for text, boundary for atoms). */
  pmPosForOffset(blockId: string, mdOffset: number): number | null;
}

/** Align mdast inline children to PM inline leaves; returns the leaf table (best-effort, order-exact). */
function alignInline(mdastChildren: readonly Md[], pmNodes: readonly { pos: number; node: PMNode }[], markdown: string): InlineLeaf[] {
  const leaves: InlineLeaf[] = [];
  let j = 0; // pm leaf cursor

  const take = (mdStart: number, mdEnd: number, kind: "text" | "atom"): void => {
    const leaf = pmNodes[j];
    if (!leaf) return;
    leaves.push({ pmFrom: leaf.pos, pmTo: leaf.pos + leaf.node.nodeSize, mdStart, mdEnd, kind, node: leaf.node });
    j += 1;
  };

  const walk = (children: readonly Md[]): void => {
    for (const c of children) {
      const pos = c.position;
      const mdStart = pos?.start.offset ?? -1;
      const mdEnd = pos?.end.offset ?? -1;
      switch (c.type) {
        case "emphasis":
        case "strong":
        case "delete":
        case "link":
          walk(c.children ?? []);
          break;
        case "text": {
          // cite-splitting expands one mdast text into up to k cites + k+1 texts; recompute the pieces
          // and map each through the escape-aware value→raw table.
          const raw = mdStart >= 0 ? markdown.slice(mdStart, mdEnd) : "";
          const value = c.value ?? "";
          const v2r = valueToRawOffsets(raw);
          const spans = findCiteSpans(value);
          let cursor = 0;
          const piece = (vs: number, ve: number, kind: "text" | "atom") => {
            if (ve <= vs) return;
            const rs = v2r[vs] ?? raw.length;
            const re = ve >= value.length ? raw.length : (v2r[ve] ?? raw.length);
            take(mdStart + rs, mdStart + re, kind);
          };
          for (const s of spans) {
            piece(cursor, s.start, "text");
            piece(s.start, s.end, "atom");
            cursor = s.end;
          }
          piece(cursor, value.length, "text");
          break;
        }
        case "inlineCode":
        case "break":
        case "image":
        case "imageReference":
        case "inlineMath":
        case "footnoteReference":
        case "linkReference":
        case "html":
          // a leaf whose md span includes delimiter syntax (`code`, `[^n]`, `$x$`) maps atomically —
          // offsets inside it land on the node's start boundary.
          take(mdStart, mdEnd, "atom");
          break;
        default:
          take(mdStart, mdEnd, "atom");
      }
    }
  };

  walk(mdastChildren);
  // Any unconsumed pm leaves get a zero-width map at the end of the block — never lose one.
  while (j < pmNodes.length) {
    const leaf = pmNodes[j]!;
    leaves.push({ pmFrom: leaf.pos, pmTo: leaf.pos + leaf.node.nodeSize, mdStart: -1, mdEnd: -1, kind: "atom", node: leaf.node });
    j += 1;
  }
  return leaves;
}

/** The inline leaves of a block's owned nodes (paragraph/heading inline content, table cells, nested). */
function inlineLeaves(entry: BlockEntry, markdown: string): InlineLeaf[] {
  const leaves: InlineLeaf[] = [];
  for (const { pos, node, mdast } of entry.nodes) {
    // Top-level inline containers (paragraph, heading) map directly; nested structures map
    // coarse (a table cell's span → the cell's content). Footnote defs recurse into blocks.
    collectInline(node, pos, mdast, markdown, leaves);
  }
  return leaves;
}

function collectInline(pmNode: PMNode, pmPos: number, md: Md | undefined, markdown: string, leaves: InlineLeaf[]): void {
  if (pmNode.isLeaf || pmNode.type.name === "code_block" || pmNode.type.name === "front_matter") return;
  if (pmNode.inlineContent) {
    const pmLeaves: { pos: number; node: PMNode }[] = [];
    pmNode.forEach((child, childOff) => {
      pmLeaves.push({ pos: pmPos + 1 + childOff, node: child });
    });
    for (const l of alignInline(md?.children ?? [], pmLeaves, markdown)) leaves.push(l);
    return;
  }
  // non-inline container: recurse children — mdast children pair by index where possible.
  let idx = 0;
  pmNode.forEach((child, childOff) => {
    const childMd = md?.children?.[idx];
    collectInline(child, pmPos + 1 + childOff, childMd, markdown, leaves);
    idx += 1;
  });
}

/** Build the block↔PM map for a document + its canonical serialization. */
export function buildDocMap(doc: PMNode, markdown: string): DocMap {
  const blocks = splitMarkdownBlocks(markdown);
  const mdast = parseCanonical(markdown) as MdRoot;

  const pmNodes: { pos: number; node: PMNode }[] = [];
  doc.forEach((node, offset) => pmNodes.push({ pos: offset, node }));

  // Pair pm node i with mdast child i (the converters preserve order/count for every profile node).
  const paired = mdast.children.length === pmNodes.length;
  const leafCache = new Map<string, InlineLeaf[]>();

  const entries: BlockEntry[] = [];
  if (paired) {
    for (const b of blocks) {
      // All top-level nodes whose mdast span starts inside this block's span belong to it
      // (the multi-link-definition case); exactly one for every other construct.
      const owned: { pos: number; node: PMNode; mdast: Md }[] = [];
      for (let i = 0; i < pmNodes.length; i++) {
        const md = mdast.children[i]!;
        const start = md.position?.start.offset ?? -1;
        if (start >= b.startOffset && start < b.endOffset) owned.push({ ...pmNodes[i]!, mdast: md });
      }
      if (owned.length === 0) continue;
      entries.push({
        blockId: b.blockId,
        index: b.index,
        mdStart: b.startOffset,
        mdEnd: b.endOffset,
        pmFrom: owned[0]!.pos,
        pmTo: owned[owned.length - 1]!.pos + owned[owned.length - 1]!.node.nodeSize,
        nodes: owned,
      });
    }
  }

  const byBlockId = new Map(entries.map((e) => [e.blockId, e]));

  const map: DocMap = {
    markdown,
    ok: paired && entries.length === blocks.length && entries.every((e) => e.nodes.length > 0),
    entries,
    byBlockId,
    blockForPos(pos) {
      for (const e of entries) if (pos >= e.pmFrom && pos < e.pmTo) return e;
      return null;
    },
    rangeForBlock(blockId) {
      const e = byBlockId.get(blockId);
      return e ? { from: e.pmFrom, to: e.pmTo } : null;
    },
    pmPosForOffset(blockId, mdOffset) {
      const e = byBlockId.get(blockId);
      if (!e) return null;
      const abs = e.mdStart + mdOffset;
      let leaves = leafCache.get(blockId);
      if (!leaves) {
        leaves = inlineLeaves(e, markdown);
        leafCache.set(blockId, leaves);
      }
      const leaf = leaves.find((l) => l.mdStart >= 0 && abs >= l.mdStart && abs < l.mdEnd)
        ?? leaves.find((l) => l.mdStart >= 0 && abs <= l.mdStart)
        ?? null;
      if (!leaf) return e.pmFrom + 1;
      if (leaf.kind === "atom") return leaf.pmFrom;
      // text leaf: count text chars in the raw prefix [leaf.mdStart, abs) escape-aware.
      const raw = markdown.slice(leaf.mdStart, leaf.mdEnd);
      let idx = 0;
      let i = 0;
      while (i < raw.length && leaf.mdStart + i < abs) {
        if (raw[i] === "\\" && i + 1 < raw.length && ESCAPABLE.test(raw[i + 1]!)) i += 2;
        else i += 1;
        idx += 1;
      }
      return Math.min(leaf.pmFrom + idx, leaf.pmTo - 1);
    },
  };
  return map;
}
