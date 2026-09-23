import { unified, type Processor } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkFrontmatter from "remark-frontmatter";
import remarkStringify from "remark-stringify";
import type { Root } from "mdast";

// The Rhema Markdown profile's canonical parse/stringify pipeline (REQ-DATA-9; §5.4). One shared
// configuration: `normalizeMarkdown` runs it plus its import transforms (heading demote, footnote
// renumber); `@rhema/editor` runs it bare for the md→PM / PM→md canonical conversions, so the editor's
// serialization is byte-identical to the normalizer's output on already-canonical text.
//
// remark-math is part of the PROFILE (added P1.02): canonical math is inline `$…$` / block `$$\n…\n$$`;
// a single-line `$$x$$` normalizes to `$x$` (remark-math parses it as inline math). Pandoc's dollar
// rules keep prose like "$5 and $10" as literal text. Structured citations `[@key]` stay TEXT here —
// the canonical escaped form `\[@key]` — the editor's md→PM pass lifts them into cite nodes (P1.02).

/** The remark-stringify settings the canonical profile is defined by (the normalizer's options). */
export const CANONICAL_STRINGIFY_OPTIONS = {
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
} as const;

/**
 * The profile's parse+stringify processor, WITHOUT the import transforms. `use()` extra transforms after
 * this (the normalizer does). `parse`/`runSync`/`stringify` are the supported calls.
 */
export function canonicalProcessor(): Processor<Root, undefined, undefined, Root, string> {
  return unified()
    .use(remarkParse)
    .use(remarkFrontmatter, ["yaml"])
    .use(remarkGfm)
    .use(remarkMath)
    .use(remarkStringify, { ...CANONICAL_STRINGIFY_OPTIONS });
}

/** Parse canonical markdown to an mdast root with the full profile extension set (GFM + math + front-matter). */
export function parseCanonical(markdown: string): Root {
  const p = canonicalProcessor();
  const tree = p.parse(markdown.normalize("NFC")) as Root;
  p.runSync(tree);
  return tree;
}

/** Serialize an mdast root with the canonical stringify settings. */
export function stringifyCanonical(tree: Root): string {
  const out = String(canonicalProcessor().stringify(tree));
  return out.endsWith("\n") ? out : out + "\n";
}
