import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkFrontmatter from "remark-frontmatter";
import { visit } from "unist-util-visit";
import { toString as mdToString } from "mdast-util-to-string";
import type { Root } from "mdast";
import type { ConversionCounts } from "@rhema/contracts";

// The §5.3 count line, computed deterministically from canonical markdown: words, footnotes, citation-like
// spans, tables, figures. Structural counts come from the mdast; citation-like spans are a heuristic over the
// prose (pandoc `[@key]`, bracketed-numeric `[12]`/`[3, 4]`, and external-URL links) — deliberately NOT the
// footnotes, which are counted separately.

const parser = unified().use(remarkParse).use(remarkFrontmatter, ["yaml"]).use(remarkGfm);

/** Words in the prose body (front-matter excluded). */
export function wordCount(text: string): number {
  const t = text.trim();
  return t === "" ? 0 : t.split(/\s+/u).length;
}

/** Strip fenced code blocks so citation-shaped tokens inside code are not counted. */
function stripCode(md: string): string {
  return md.replace(/```[\s\S]*?```/g, "").replace(/`[^`]*`/g, "");
}

const PANDOC_CITE = /\[@[^\]]+\]/g;
const BRACKET_NUM = /\[\d+(?:\s*[-–,]\s*\d+)*\]/g;

/** Compute the structured count line for a markdown document. */
export function detectCounts(markdown: string): ConversionCounts {
  const tree = parser.parse(markdown) as Root;
  parser.runSync(tree); // apply gfm (footnotes, tables)

  let tables = 0;
  let figures = 0;
  const footnoteIds = new Set<string>();
  let externalLinks = 0;

  visit(tree, (node) => {
    switch (node.type) {
      case "table":
        tables += 1;
        break;
      case "image":
        figures += 1;
        break;
      case "footnoteDefinition":
      case "footnoteReference":
        footnoteIds.add((node as { identifier: string }).identifier);
        break;
      case "link": {
        const url = (node as { url: string }).url ?? "";
        if (/^https?:\/\//i.test(url)) externalLinks += 1;
        break;
      }
      case "yaml":
        break; // front-matter excluded from word count
      default:
        break;
    }
  });

  // Body text for the word count = the whole tree stringified minus the yaml front-matter node.
  const body: Root = { type: "root", children: tree.children.filter((c) => c.type !== "yaml") };
  const words = wordCount(mdToString(body));

  const noCode = stripCode(markdown);
  const pandoc = (noCode.match(PANDOC_CITE) ?? []).length;
  const bracketNum = (noCode.match(BRACKET_NUM) ?? []).length;
  const citationSpans = pandoc + bracketNum + externalLinks;

  return { words, footnotes: footnoteIds.size, citationSpans, tables, figures };
}

/** Render the §5.3 count line ("7,900 words · 41 footnotes · 23 citation-like spans · 2 tables · 1 figure"). */
export function renderCountLine(c: ConversionCounts): string {
  const n = (x: number) => x.toLocaleString("en-US");
  const plural = (x: number, one: string, many = one + "s") => `${n(x)} ${x === 1 ? one : many}`;
  return [
    plural(c.words, "word"),
    plural(c.footnotes, "footnote"),
    `${n(c.citationSpans)} citation-like ${c.citationSpans === 1 ? "span" : "spans"}`,
    plural(c.tables, "table"),
    plural(c.figures, "figure"),
  ].join(" · ");
}
