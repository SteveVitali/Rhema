import { Schema, type NodeSpec, type MarkSpec, type Node as PMNode, type DOMOutputSpec } from "prosemirror-model";

// The Rhema Markdown profile as a ProseMirror schema (P1.02; §5.4, REQ-SPEC-19, REQ-DATA-9 amended).
// SCHEMA-FIRST: this is the document model of record; canonical markdown is its serialization — the
// stored artifact bytes are markdown, never PM JSON. Every node/mark here maps 1:1 to an mdast
// construct the canonical pipeline (@rhema/markdown's profile.ts) parses and serializes.
//
// Coverage: CommonMark + GFM (tables, task lists, strikethrough, autolinks-as-links) + footnotes
// (`[^n]` ref + definition blocks) + inline/block math + `[@key]` cite atoms + figure blocks +
// front-matter + raw HTML passthrough. No marks exist for findings/provenance — those are sidecar
// DECORATIONS, never document content (REQ-DATA-28/29 amended).

const p = (spec: unknown): DOMOutputSpec => spec as DOMOutputSpec;

// ---------------------------------------------------------------------------------------------------------------------
// blocks
// ---------------------------------------------------------------------------------------------------------------------

const nodes: Record<string, NodeSpec> = {
  doc: { content: "block+" },

  /** YAML front-matter — an opaque atom; the title's canonical home is here, not a body H1. */
  front_matter: {
    group: "block",
    atom: true,
    selectable: false,
    attrs: { value: { default: "" } },
    toDOM: (n) => p(["pre", { class: "rm-frontmatter", "data-fm": "1" }, `---\n${n.attrs.value as string}\n---`]),
  },

  paragraph: {
    group: "block",
    content: "inline*",
    toDOM: () => p(["p", 0]),
    parseDOM: [{ tag: "p" }],
  },

  heading: {
    group: "block",
    content: "inline*",
    attrs: { level: { default: 2, validate: (v: number) => v >= 1 && v <= 6 } },
    toDOM: (n) => p([`h${n.attrs.level as number}`, 0]),
    defining: true,
  },

  blockquote: {
    group: "block",
    content: "block+",
    toDOM: () => p(["blockquote", 0]),
    defining: true,
  },

  code_block: {
    group: "block",
    content: "text*",
    marks: "",
    attrs: { lang: { default: "" }, meta: { default: "" } },
    code: true,
    defining: true,
    toDOM: (n) =>
      p([
        "pre",
        n.attrs.lang ? { "data-lang": String(n.attrs.lang) } : {},
        ["code", 0],
      ]),
  },

  /** Display math (`$$\n…\n$$`) — an atom; the value is the TeX source. */
  math_block: {
    group: "block",
    atom: true,
    attrs: { value: { default: "" } },
    toDOM: (n) => p(["div", { class: "rm-math-block", "data-tex": String(n.attrs.value) }, `$$ ${n.attrs.value as string} $$`]),
  },

  /** GFM table — first row is the header row; `align` carries mdast's per-column alignment. */
  table: {
    group: "block",
    content: "table_row+",
    attrs: { align: { default: [] as (string | null)[] } },
    toDOM: () => p(["table", ["tbody", 0]]),
  },
  table_row: {
    content: "table_cell+",
    toDOM: () => p(["tr", 0]),
  },
  table_cell: {
    content: "inline*",
    toDOM: () => p(["td", 0]),
  },

  list: {
    group: "block",
    content: "list_item+",
    attrs: { ordered: { default: false }, start: { default: 1 } },
    toDOM: (n) =>
      n.attrs.ordered
        ? (p(["ol", n.attrs.start !== 1 ? { start: n.attrs.start } : {}, 0]))
        : (p(["ul", 0])),
    defining: true,
  },
  list_item: {
    content: "block+",
    /** `checked`: null = plain item, true/false = GFM task item. */
    attrs: { checked: { default: null as boolean | null } },
    toDOM: (n) =>
      n.attrs.checked == null
        ? (p(["li", 0]))
        : (p([
            "li",
            { "data-task": n.attrs.checked ? "done" : "todo" },
            ["input", { type: "checkbox", disabled: "true", ...(n.attrs.checked ? { checked: "checked" } : {}) }],
            0,
          ])),
  },

  thematic_break: {
    group: "block",
    atom: true,
    selectable: true,
    toDOM: () => p(["hr"]),
  },

  /** Footnote definition `[^n]: …` — a top-level block with block content (flow children). */
  footnote_definition: {
    group: "block",
    content: "block+",
    attrs: { identifier: { default: "" }, label: { default: "" } },
    toDOM: (n) =>
      p(["aside", { class: "rm-footnote-def", "data-fn": String(n.attrs.label || n.attrs.identifier) }, 0]),
  },

  /** The §7.5 figure block — payload (generated SVG etc.) lands in P1.13; at MVP it renders the
   *  image target or a placeholder. Canonical form: a paragraph containing a lone image. */
  figure: {
    group: "block",
    atom: true,
    attrs: { src: { default: "" }, alt: { default: "" }, title: { default: "" } },
    toDOM: (n) =>
      p([
        "figure",
        { class: "rm-figure" },
        n.attrs.src
          ? ["img", { src: String(n.attrs.src), alt: String(n.attrs.alt ?? ""), ...(n.attrs.title ? { title: String(n.attrs.title) } : {}) }]
          : ["span", { class: "rm-figure-placeholder" }, String(n.attrs.alt ?? "")],
      ]),
  },

  /** Link reference definition `[label]: url "title"` — a top-level atom (canonical footnote-style
   *  link targets survive round-trips). */
  link_definition: {
    group: "block",
    atom: true,
    selectable: false,
    attrs: { identifier: { default: "" }, label: { default: "" }, url: { default: "" }, title: { default: "" } },
    toDOM: (n) =>
      p(["pre", { class: "rm-link-def" }, `[${n.attrs.label as string}]: ${n.attrs.url as string}${n.attrs.title ? ` "${n.attrs.title as string}"` : ""}`]),
  },

  /** Raw HTML block passthrough (canonical markdown may carry `<div>` etc. verbatim). */
  html_block: {
    group: "block",
    atom: true,
    attrs: { value: { default: "" } },
    toDOM: (n) => p(["pre", { class: "rm-html-block" }, String(n.attrs.value)]),
  },

  // ---- inline nodes ----

  text: { group: "inline", inline: true },

  hard_break: {
    inline: true,
    group: "inline",
    atom: true,
    selectable: false,
    toDOM: () => p(["br"]),
  },

  /** Inline image (a lone-image paragraph parses as `figure`, not this). `identifier`/`refType` set ⇒
   *  an image REFERENCE (`![alt][id]`) whose target is a `link_definition` block. */
  image: {
    inline: true,
    group: "inline",
    atom: true,
    attrs: {
      src: { default: "" },
      alt: { default: "" },
      title: { default: "" },
      identifier: { default: "" },
      refType: { default: "" as "" | "full" | "collapsed" | "shortcut" },
    },
    toDOM: (n) =>
      // ONB.1 — an empty src is the import path's INERT placeholder form (an unresolved relative
      // figure rewritten to `![alt]()`): render the same placeholder span the figure block uses,
      // never a live `<img src="">` (which some browsers resolve to the page URL — a request either
      // way it must not make).
      n.attrs.src
        ? p(["img", { src: String(n.attrs.src), alt: String(n.attrs.alt ?? ""), ...(n.attrs.title ? { title: String(n.attrs.title) } : {}), ...(n.attrs.identifier ? { "data-ref": String(n.attrs.identifier) } : {}) }])
        : p(["span", { class: "rm-figure-placeholder" }, String(n.attrs.alt ?? "")]),
  },

  /** Inline math `$…$` — atom carrying TeX source. */
  math_inline: {
    inline: true,
    group: "inline",
    atom: true,
    attrs: { value: { default: "" } },
    toDOM: (n) => p(["span", { class: "rm-math-inline", "data-tex": String(n.attrs.value) }, `$${n.attrs.value as string}$`]),
  },

  /** Footnote reference `[^n]` — atom carrying the definition identifier + display label. */
  footnote_ref: {
    inline: true,
    group: "inline",
    atom: true,
    attrs: { identifier: { default: "" }, label: { default: "" } },
    toDOM: (n) =>
      p(["sup", { class: "rm-footnote-ref" }, String(n.attrs.label || n.attrs.identifier)]),
  },

  /** Structured citation `[@key]` (canonical escaped form `\[@key]`). Multi-cite `[@a; @b]` is ONE
   *  node with `keys`. Unresolvable keys render visibly — never dropped (matrix row 37). */
  cite: {
    inline: true,
    group: "inline",
    atom: true,
    attrs: { keys: { default: [] as string[] } },
    toDOM: (n) =>
      p(["span", { class: "rm-cite", "data-cite-keys": (n.attrs.keys as string[]).join(" ") }, `[${(n.attrs.keys as string[]).map((k) => `@${k}`).join("; ")}]`]),
  },

  /** Inline raw HTML passthrough (`<sup>`, `<kbd>`…). */
  inline_html: {
    inline: true,
    group: "inline",
    atom: true,
    attrs: { value: { default: "" } },
    toDOM: (n) => p(["code", { class: "rm-html-inline" }, String(n.attrs.value)]),
  },
};

// ---------------------------------------------------------------------------------------------------------------------
// marks (inline formatting only — NO finding/provenance marks ever; those are decorations)
// ---------------------------------------------------------------------------------------------------------------------

const marks: Record<string, MarkSpec> = {
  em: {
    toDOM: () => ["em", 0],
    parseDOM: [{ tag: "em" }, { tag: "i" }],
  },
  strong: {
    toDOM: () => ["strong", 0],
    parseDOM: [{ tag: "strong" }, { tag: "b" }],
  },
  /** Inline code is a MARK on text (pm convention) — mdast's `inlineCode` node. */
  code: {
    code: true,
    toDOM: () => ["code", 0],
    parseDOM: [{ tag: "code" }],
  },
  /** GFM strikethrough (`~~x~~`) — mdast `delete`. */
  strike: {
    toDOM: () => ["del", 0],
    parseDOM: [{ tag: "del" }, { tag: "s" }],
  },
  link: {
    // `identifier`/`refType` set ⇒ a link REFERENCE (`[text][id]`, `[text][]`, `[text]`) — the href is
    // empty and the target lives in the sibling `link_definition` block. Unset ⇒ an inline link `(url)`.
    attrs: {
      href: { default: "" },
      title: { default: "" },
      identifier: { default: "" },
      refType: { default: "" as "" | "full" | "collapsed" | "shortcut" },
    },
    excludes: "_", // links don't nest
    toDOM: (m) =>
      m.attrs.identifier
        ? (p(["span", { class: "rm-link-ref", "data-ref": String(m.attrs.identifier) }, 0]))
        : (["a", { href: String(m.attrs.href), ...(m.attrs.title ? { title: String(m.attrs.title) } : {}) }, 0] as DOMOutputSpec),
    parseDOM: [{ tag: "a[href]" }],
  },
};

/** The Rhema Markdown profile schema — the Page's document model. */
export const pageSchema = new Schema({ nodes, marks });

export type PageNode = PMNode;
export type { PMNode };

/** Node/mark names for type-safe references in converters + tests. */
export const N = {
  frontMatter: "front_matter",
  paragraph: "paragraph",
  heading: "heading",
  blockquote: "blockquote",
  codeBlock: "code_block",
  mathBlock: "math_block",
  table: "table",
  tableRow: "table_row",
  tableCell: "table_cell",
  list: "list",
  listItem: "list_item",
  thematicBreak: "thematic_break",
  footnoteDefinition: "footnote_definition",
  figure: "figure",
  linkDefinition: "link_definition",
  htmlBlock: "html_block",
  hardBreak: "hard_break",
  image: "image",
  mathInline: "math_inline",
  footnoteRef: "footnote_ref",
  cite: "cite",
  inlineHtml: "inline_html",
} as const;
