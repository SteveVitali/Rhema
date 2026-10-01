import type { Node as PMNode, Mark } from "prosemirror-model";
import { stringifyCanonical } from "@rhema/markdown";
import type { Md } from "./mdast-types.js";
import { citeRawText } from "./cite.js";

// PM doc → canonical markdown (PM→md half of REQ-DATA-9). Converts the doc to an mdast tree and runs it
// through @rhema/markdown's canonical stringifier — the SAME options the normalizer uses, so
// serialize(parse(canonical)) === canonical byte-for-byte.
//
// Mark handling: inline children are grouped into maximal runs of identical mark sets and each run is
// wrapped once — a cite atom inside `_…` stays inside the ONE emphasis node, never splits it (that
// would serialize `_a _\[@k]_ b_`, breaking byte-stability). Nesting order is the schema's mark order
// (em, strong, code, strike, link) outermost-first — the canonical nesting the normalizer enforces.


/** Marks sorted by canonical rank (schema order); code is exclusive and handled first. */
function markRank(m: Mark): number {
  switch (m.type.name) {
    case "em": return 1;
    case "strong": return 2;
    case "strike": return 3;
    case "link": return 4;
    default: return 9;
  }
}
function sortedMarks(marks: readonly Mark[]): Mark[] {
  return [...marks].sort((a, b) => markRank(a) - markRank(b));
}
function sameMarks(a: readonly Mark[], b: readonly Mark[]): boolean {
  if (a.length !== b.length) return false;
  const sa = sortedMarks(a).map(markKey);
  const sb = sortedMarks(b).map(markKey);
  return sa.every((k, i) => k === sb[i]);
}
function markKey(m: Mark): string {
  return m.type.name === "link"
    ? `link:${String(m.attrs.href)}|${String(m.attrs.title ?? "")}|${String(m.attrs.identifier ?? "")}|${String(m.attrs.refType ?? "")}`
    : m.type.name;
}

/** One inline PM node (no marks applied yet) → mdast phrasing node(s). */
function inlineAtom(n: PMNode): Md[] {
  switch (n.type.name) {
    case "text":
      return n.text ? [{ type: "text", value: n.text }] : [];
    case "hard_break":
      return [{ type: "break" }];
    case "image":
      return n.attrs.identifier
        ? [{ type: "imageReference", identifier: String(n.attrs.identifier), referenceType: String(n.attrs.refType || "full"), alt: String(n.attrs.alt ?? "") }]
        : [{ type: "image", url: String(n.attrs.src), title: n.attrs.title ? String(n.attrs.title) : null, alt: String(n.attrs.alt ?? "") }];
    case "math_inline":
      return [{ type: "inlineMath", value: String(n.attrs.value) }];
    case "footnote_ref":
      return [{ type: "footnoteReference", identifier: String(n.attrs.identifier), label: String(n.attrs.label || n.attrs.identifier) }];
    case "cite":
      // cites serialize as TEXT `[@k1; @k2]` — the canonical stringifier escapes the `[` itself.
      return [{ type: "text", value: citeRawText(n.attrs.keys as string[]) }];
    case "inline_html":
      return [{ type: "html", value: String(n.attrs.value) }];
    default:
      return n.text ? [{ type: "text", value: n.text }] : [];
  }
}

/** Wrap `children` in the run's marks, outermost-first by canonical rank. */
function wrapMarks(children: Md[], marks: readonly Mark[]): Md[] {
  let out = children;
  for (const m of sortedMarks(marks)) {
    switch (m.type.name) {
      case "em":
        out = [{ type: "emphasis", children: out }];
        break;
      case "strong":
        out = [{ type: "strong", children: out }];
        break;
      case "strike":
        out = [{ type: "delete", children: out }];
        break;
      case "link":
        out = m.attrs.identifier
          ? [{ type: "linkReference", identifier: String(m.attrs.identifier), referenceType: String(m.attrs.refType || "full"), children: out }]
          : [{ type: "link", url: String(m.attrs.href), title: m.attrs.title ? String(m.attrs.title) : null, children: out }];
        break;
      default:
        break; // code handled in inlineOf (exclusive mark → inlineCode)
    }
  }
  return out;
}

/** PM inline content → mdast phrasing children (mark runs grouped; adjacent texts merged). */
function inlineOf(node: PMNode): Md[] {
  const out: Md[] = [];
  // group maximal runs of identical mark sets
  let i = 0;
  const children = [...node.content.content];
  while (i < children.length) {
    const marks = children[i]!.marks;
    if (children[i]!.type.name === "text" && marks.some((m) => m.type.name === "code")) {
      // inline code is a leaf mdast node (code marks exclude everything else)
      let value = children[i]!.text ?? "";
      let j = i + 1;
      while (j < children.length && children[j]!.type.name === "text" && sameMarks(children[j]!.marks, marks)) {
        value += children[j]!.text ?? "";
        j++;
      }
      out.push({ type: "inlineCode", value });
      i = j;
      continue;
    }
    let j = i + 1;
    while (j < children.length && sameMarks(children[j]!.marks, marks)) j++;
    const runChildren: Md[] = [];
    for (let k = i; k < j; k++) {
      for (const c of inlineAtom(children[k]!)) {
        // merge adjacent text nodes — parse output never has same-mark text twins, keep the shape canonical
        const last = runChildren[runChildren.length - 1];
        if (c.type === "text" && last?.type === "text") last.value = `${last.value as string}${c.value as string}`;
        else runChildren.push(c);
      }
    }
    out.push(...wrapMarks(runChildren, marks));
    i = j;
  }
  return out;
}

function blocksOf(node: PMNode): Md[] {
  const out: Md[] = [];
  node.forEach((child) => out.push(...block(child)));
  return out;
}

/** One PM block node → mdast top-level child(ren). */
function block(n: PMNode): Md[] {
  switch (n.type.name) {
    case "front_matter":
      return [{ type: "yaml", value: String(n.attrs.value) }];
    case "heading":
      return [{ type: "heading", depth: n.attrs.level as number, children: inlineOf(n) }];
    case "paragraph":
      return [{ type: "paragraph", children: inlineOf(n) }];
    case "blockquote":
      return [{ type: "blockquote", children: blocksOf(n) }];
    case "code_block":
      return [{ type: "code", lang: (n.attrs.lang as string) || null, meta: (n.attrs.meta as string) || null, value: n.textContent }];
    case "math_block":
      return [{ type: "math", meta: null, value: String(n.attrs.value) }];
    case "table": {
      const rows: Md[] = [];
      n.forEach((row) => {
        const cells: Md[] = [];
        row.forEach((cell) => cells.push({ type: "tableCell", children: inlineOf(cell) }));
        rows.push({ type: "tableRow", children: cells });
      });
      return [{ type: "table", align: (n.attrs.align as (string | null)[]) ?? [], children: rows }];
    }
    case "list": {
      const items: Md[] = [];
      n.forEach((item) =>
        items.push({
          type: "listItem",
          checked: item.attrs.checked ?? null,
          spread: false,
          children: blocksOf(item),
        }),
      );
      return [{ type: "list", ordered: !!n.attrs.ordered, start: n.attrs.ordered ? (n.attrs.start as number) : null, spread: false, children: items }];
    }
    case "thematic_break":
      return [{ type: "thematicBreak" }];
    case "footnote_definition":
      return [{
        type: "footnoteDefinition",
        identifier: String(n.attrs.identifier),
        label: String(n.attrs.label || n.attrs.identifier),
        children: blocksOf(n),
      }];
    case "figure":
      // canonical figure = a paragraph containing a lone image
      return [{
        type: "paragraph",
        children: [{ type: "image", url: String(n.attrs.src), title: n.attrs.title ? String(n.attrs.title) : null, alt: String(n.attrs.alt ?? "") }],
      }];
    case "link_definition":
      return [{
        type: "definition",
        identifier: String(n.attrs.identifier),
        label: String(n.attrs.label || n.attrs.identifier),
        url: String(n.attrs.url),
        title: n.attrs.title ? String(n.attrs.title) : null,
      }];
    case "html_block":
      return [{ type: "html", value: String(n.attrs.value) }];
    default:
      // unknown block → its literal text as a paragraph (never drop content)
      return [{ type: "paragraph", children: n.textContent ? [{ type: "text", value: n.textContent }] : [] }];
  }
}

/** PM doc → canonical markdown string (ends with a single trailing newline). */
export function docToMarkdown(doc: PMNode): string {
  const root = { type: "root", children: blocksOf(doc) } as { type: "root"; children: Md[] };
  return stringifyCanonical(root as never);
}
