import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkStringify from "remark-stringify";
import remarkFrontmatter from "remark-frontmatter";
import { visit } from "unist-util-visit";
import type { Root, Heading, RootContent } from "mdast";

// The canonical Rhema Markdown normalizer (research/9 §4; REQ-DATA-9d import half). It is the "first pass at
// import" the conversion preview (§5.3) shows, and it is IDEMPOTENT: normalizeMarkdown(normalizeMarkdown(x))
// is byte-for-byte equal to normalizeMarkdown(x). That is what AC6 asserts. Rules encoded here:
//   - no body H1 (title lives in front-matter): demote headings so the first body heading is H2;
//   - footnotes renumbered sequentially in first-reference order and collected at the end;
//   - no hard wraps, one blank line between blocks, UTF-8 NFC, smart quotes preserved as characters.
// Structured citations are NOT parsed at ingest (§4.3); tables/math are retained (GFM + `$…$`).

/** Demote headings so the shallowest becomes H2 (no body H1). Idempotent: after one pass min depth ≥ 2. */
function demoteHeadings() {
  return (tree: Root): void => {
    let min = 7;
    visit(tree, "heading", (n: Heading) => {
      if (n.depth < min) min = n.depth;
    });
    const delta = min < 2 && min < 7 ? 2 - min : 0;
    if (delta > 0) {
      visit(tree, "heading", (n: Heading) => {
        n.depth = Math.min(6, n.depth + delta) as Heading["depth"];
      });
    }
  };
}

/**
 * Renumber footnotes 1..n in first-reference order and move their definitions to the end (in that order).
 * Idempotent: a second pass sees identifiers already sequential and definitions already trailing.
 */
function renumberFootnotes() {
  return (tree: Root): void => {
    const order = new Map<string, number>();
    let n = 0;
    visit(tree, "footnoteReference", (node) => {
      if (!order.has(node.identifier)) order.set(node.identifier, ++n);
    });
    if (order.size === 0) return;
    const rename = (id: string): { identifier: string; label: string } | null => {
      const num = order.get(id);
      return num == null ? null : { identifier: String(num), label: String(num) };
    };
    visit(tree, "footnoteReference", (node) => {
      const r = rename(node.identifier);
      if (r) Object.assign(node, r);
    });
    // Pull top-level definitions out, rename, sort by number, append at end.
    const defs: RootContent[] = [];
    tree.children = tree.children.filter((c) => {
      if (c.type === "footnoteDefinition") {
        const r = rename(c.identifier);
        if (r) Object.assign(c, r);
        defs.push(c);
        return false;
      }
      return true;
    });
    defs.sort((a, b) => {
      const ai = a.type === "footnoteDefinition" ? Number(a.identifier) : 0;
      const bi = b.type === "footnoteDefinition" ? Number(b.identifier) : 0;
      return ai - bi;
    });
    tree.children.push(...defs);
  };
}

const processor = unified()
  .use(remarkParse)
  .use(remarkFrontmatter, ["yaml"])
  .use(remarkGfm)
  .use(demoteHeadings)
  .use(renumberFootnotes)
  .use(remarkStringify, {
    bullet: "-",
    listItemIndent: "one",
    emphasis: "_",
    strong: "*",
    fence: "`",
    fences: true,
    rule: "-",
    ruleRepetition: 3,
    ruleSpaces: false,
    setext: false,
    tightDefinitions: true,
    resourceLink: false,
    // remark-stringify does not hard-wrap by default (one line per block); NFC is applied on input.
  });

/** Normalize markdown to the canonical Rhema Markdown profile. Idempotent (REQ-DATA-9d). */
export function normalizeMarkdown(markdown: string): string {
  const nfc = markdown.normalize("NFC");
  const out = String(processor.processSync(nfc));
  // remark-stringify always ends with a single trailing newline; keep it canonical.
  return out.endsWith("\n") ? out : out + "\n";
}
