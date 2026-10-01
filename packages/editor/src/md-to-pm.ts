import type { Node as PMNode, Mark } from "prosemirror-model";
import { Fragment, Slice } from "prosemirror-model";
import { parseCanonical } from "@rhema/markdown";
import type { Md, MdRoot } from "./mdast-types.js";
import { pageSchema as schema } from "./schema.js";
import { findCiteSpans } from "./cite.js";

// canonical markdown → PM doc (md→PM half of REQ-DATA-9). The mdast comes from @rhema/markdown's
// canonical processor (GFM + math + front-matter); cite-shaped text spans lift into `cite` atoms.
// Every mdast construct the profile can emit maps to a schema node — unknown constructs degrade to a
// paragraph of their serialized source rather than failing (a load never bricks).

type Marks = readonly string[];

function markSet(names: Marks): Mark[] {
  return names.map((n) => schema.marks[n]!.create());
}

/** Push a PM node only when non-null; empty text nodes are dropped (PM forbids them). */
function push(out: PMNode[], node: PMNode | null | undefined): void {
  if (node) out.push(node);
}

/** Split a text value into text/cite inline nodes at `[@key]` spans. */
function textWithCites(value: string, marks: Marks, out: PMNode[]): void {
  const spans = findCiteSpans(value);
  if (spans.length === 0) {
    if (value !== "") out.push(schema.text(value, markSet(marks)));
    return;
  }
  let cursor = 0;
  for (const s of spans) {
    if (s.start > cursor) out.push(schema.text(value.slice(cursor, s.start), markSet(marks)));
    push(out, schema.nodes.cite!.create({ keys: s.keys }, undefined, markSet(marks)));
    cursor = s.end;
  }
  if (cursor < value.length) out.push(schema.text(value.slice(cursor), markSet(marks)));
}

function plainText(node: Md): string {
  if (typeof node.value === "string") return node.value;
  return (node.children ?? []).map(plainText).join("");
}

/** Convert phrasing children to PM inline nodes, carrying the active mark-name set. */
function inlineContent(children: readonly Md[], marks: Marks, out: PMNode[]): void {
  for (const c of children) {
    switch (c.type) {
      case "text":
        textWithCites(c.value ?? "", marks, out);
        break;
      case "emphasis":
        inlineContent(c.children ?? [], [...marks, "em"], out);
        break;
      case "strong":
        inlineContent(c.children ?? [], [...marks, "strong"], out);
        break;
      case "delete":
        inlineContent(c.children ?? [], [...marks, "strike"], out);
        break;
      case "link": {
        // link is a mark carrying attrs — convert children, then add the mark to each produced node.
        const inner = inlines(c.children ?? [], marks);
        const linkMark = schema.marks.link!.create({ href: c.url ?? "", title: c.title ?? "" });
        for (const n of inner) out.push(n.mark([...n.marks, linkMark]));
        break;
      }
      case "inlineCode":
        if (c.value) out.push(schema.text(c.value, [...markSet(marks), schema.marks.code!.create()]));
        break;
      case "break":
        push(out, schema.nodes.hard_break!.create());
        break;
      case "image":
        push(out, schema.nodes.image!.create({ src: c.url ?? "", alt: c.alt ?? "", title: c.title ?? "" }, undefined, markSet(marks)));
        break;
      case "imageReference":
        // `![alt][ref]` — the link_definition block carries the target; the atom keeps the ref attrs.
        push(out, schema.nodes.image!.create(
          { src: "", alt: c.alt ?? "", title: "", identifier: c.identifier ?? "", refType: c.referenceType ?? "full" },
          undefined, markSet(marks),
        ));
        break;
      case "inlineMath":
        push(out, schema.nodes.math_inline!.create({ value: c.value ?? "" }));
        break;
      case "footnoteReference":
        push(out, schema.nodes.footnote_ref!.create({ identifier: c.identifier ?? "", label: c.label ?? c.identifier ?? "" }));
        break;
      case "linkReference": {
        // `[text][id]` / `[text][]` / `[text]` — a link MARK with ref attrs; the definition block holds
        // the target. Round-trips through pm→md as the same reference form (never literal text).
        const inner = inlines(c.children ?? [], marks);
        const refMark = schema.marks.link!.create({
          href: "", title: "", identifier: c.identifier ?? "", refType: c.referenceType ?? "full",
        });
        for (const n of inner) out.push(n.mark([...n.marks, refMark]));
        break;
      }
      case "html":
        push(out, schema.nodes.inline_html!.create({ value: c.value ?? "" }));
        break;
      default: {
        // unknown inline construct → its literal text (never drops content, never throws).
        const v = plainText(c);
        if (v) textWithCites(v, marks, out);
      }
    }
  }
}

/** Convert phrasing children to a PM inline-node list. */
function inlines(children: readonly Md[], marks: Marks = []): PMNode[] {
  const out: PMNode[] = [];
  inlineContent(children, marks, out);
  return out;
}

/** mdast block → PM block node. */
function block(node: Md): PMNode {
  switch (node.type) {
    case "yaml":
      return schema.nodes.front_matter!.create({ value: node.value ?? "" });
    case "heading":
      return schema.nodes.heading!.create({ level: node.depth ?? 2 }, inlines(node.children ?? []));
    case "paragraph": {
      // A paragraph whose only content is a single image is the canonical FIGURE block.
      const real = (node.children ?? []).filter((c) => !(c.type === "text" && (c.value ?? "").trim() === ""));
      if (real.length === 1 && real[0]!.type === "image") {
        const img = real[0]!;
        return schema.nodes.figure!.create({ src: img.url ?? "", alt: img.alt ?? "", title: img.title ?? "" });
      }
      return schema.nodes.paragraph!.create(null, inlines(node.children ?? []));
    }
    case "blockquote":
      return schema.nodes.blockquote!.create(null, blocksOf(node.children ?? []));
    case "code":
      return schema.nodes.code_block!.create(
        { lang: node.lang ?? "", meta: node.meta ?? "" },
        node.value ? schema.text(node.value) : null,
      );
    case "math":
      return schema.nodes.math_block!.create({ value: node.value ?? "" });
    case "table":
      return schema.nodes.table!.create(
        { align: node.align ?? [] },
        (node.children ?? []).map((row) =>
          schema.nodes.table_row!.create(
            null,
            (row.children ?? []).map((cell) => schema.nodes.table_cell!.create(null, inlines(cell.children ?? []))),
          ),
        ),
      );
    case "list":
      return schema.nodes.list!.create(
        { ordered: !!node.ordered, start: node.start ?? 1 },
        (node.children ?? []).map((item) =>
          schema.nodes.list_item!.create({ checked: item.checked ?? null }, blocksOf(item.children ?? [])),
        ),
      );
    case "thematicBreak":
      return schema.nodes.thematic_break!.create();
    case "footnoteDefinition":
      return schema.nodes.footnote_definition!.create(
        { identifier: node.identifier ?? "", label: node.label ?? node.identifier ?? "" },
        blocksOf(node.children ?? []),
      );
    case "definition":
      return schema.nodes.link_definition!.create({
        identifier: node.identifier ?? "",
        label: node.label ?? node.identifier ?? "",
        url: node.url ?? "",
        title: node.title ?? "",
      });
    case "html":
      return schema.nodes.html_block!.create({ value: node.value ?? "" });
    default: {
      // unknown top-level construct → a paragraph of its literal text (content is never dropped).
      const v = typeof node.value === "string" ? node.value : "";
      return schema.nodes.paragraph!.create(null, v ? schema.text(v) : null);
    }
  }
}

function blocksOf(children: readonly Md[]): PMNode[] {
  const out = children.map(block);
  // a block context must never be empty (PM enforces `block+`).
  if (out.length === 0) out.push(schema.nodes.paragraph!.create());
  return out;
}

/** canonical markdown → PM doc node (the Page's document model). */
export function markdownToDoc(markdown: string): PMNode {
  const tree = parseCanonical(markdown) as MdRoot;
  const children = tree.children.map(block);
  if (children.length === 0) children.push(schema.nodes.paragraph!.create());
  return schema.nodes.doc!.create(null, Fragment.from(children));
}

/** A markdown FRAGMENT (proposal replacements, paste payloads) → a Slice of top-level blocks. */
export function markdownToSlice(markdown: string): Slice {
  const doc = markdownToDoc(markdown);
  return new Slice(doc.content, 0, 0);
}
