// R7COPY.1b (REQ-COPY-3; REQ-TALK-2's rendered-markdown clause; C8/D2/G2/I3) — the ONE sanitized
// markdown renderer: a `@rhema/ui` component over the canonical profile (`parseCanonical` from
// `@rhema/markdown`). It walks the mdast into React nodes — a second parser is never introduced
// and raw HTML never reaches the DOM (no `dangerouslySetInnerHTML`; `html` nodes render as
// escaped code text). Links keep safe protocols only (http/https/mailto/relative/anchor);
// `javascript:`/`data:`/`vbscript:`/`file:` hrefs render their text without an anchor. External
// links open in a new context with `rel="noopener noreferrer"`; images never auto-load (a
// safe-src image renders as a labelled link — no third-party fetches). Long bare URLs wrap
// (`overflow-wrap: anywhere` in uiCss) and truncate past {@link BARE_URL_DISPLAY_MAX} with the
// full URL in `title`. A parse failure degrades to escaped plain paragraphs — never nothing.
//
// Loading strategy (REQ-KIT-5): every consumer is a leaf-chunk surface (chat panel, dossier,
// findings, letter, what-changed, proposals, inbox, voices, figures, conversion preview) — the
// unified/remark stack lands in the leaves' shared async chunk, and `check-spa-entry-graph`
// denies it in the shell entry graph.

import type { ReactNode } from "react";
import { parseCanonical } from "@rhema/markdown";

// ---------------------------------------------------------------------------
// Sanitization helpers
// ---------------------------------------------------------------------------

/** Href protocols the renderer will emit. Everything else renders link text without an anchor. */
const SAFE_PROTOCOLS = new Set(["http", "https", "mailto"]);

/**
 * Null ⇒ the URL is not anchor-safe. Scheme checks run on a whitespace/control-stripped copy so
 * `"java\tscript:"` and friends can't smuggle a scheme past the check; everything scheme-less
 * (`/path`, `#frag`, `page.md`, `//host/x`) is a relative link.
 */
export function safeHref(url: string): string | null {
  const u = url.trim();
  if (u === "") return null;
  // strip every char ≤ U+0020 (spaces + control chars) without a control-char regex literal —
  // "java\tscript:" and friends can't smuggle a scheme past the check.
  const compact = [...u].filter((c) => c > " ").join("");
  const m = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(compact);
  if (m == null) return u;
  return SAFE_PROTOCOLS.has(m[1]!.toLowerCase()) ? u : null;
}

/** True for absolute http(s) links — externals open in a new context, never `_top`-navigated. */
function isExternal(href: string): boolean {
  return /^https?:\/\//i.test(href);
}

/** Bare-URL link text truncates past this length (the full URL rides `title`). */
export const BARE_URL_DISPLAY_MAX = 48;

function truncateUrl(u: string): string {
  return u.length > BARE_URL_DISPLAY_MAX ? `${u.slice(0, BARE_URL_DISPLAY_MAX - 1)}…` : u;
}

/** The finding-card evidence rows' URL anchor — same safe/truncated anchor the renderer emits. */
export function SafeUrlLink({
  url,
  className,
}: {
  readonly url: string;
  readonly className?: string;
}): ReactNode {
  const href = safeHref(url);
  if (href == null) return <>{truncateUrl(url)}</>;
  return (
    <a
      href={href}
      title={href}
      className={className ? `ui-md-url ${className}` : "ui-md-url"}
      {...(isExternal(href) ? { target: "_blank", rel: "noopener noreferrer" } : {})}
    >
      {truncateUrl(href)}
    </a>
  );
}

// ---------------------------------------------------------------------------
// The mdast walk — a narrow structural node (only the fields the renderer reads)
// ---------------------------------------------------------------------------

interface MdNode {
  readonly type?: string;
  readonly value?: string;
  readonly alt?: string | null;
  readonly title?: string | null;
  readonly url?: string;
  readonly lang?: string | null;
  readonly ordered?: boolean;
  readonly checked?: boolean | null;
  readonly depth?: number;
  readonly identifier?: string;
  readonly children?: readonly MdNode[];
}

type Defs = ReadonlyMap<string, { readonly url: string; readonly title: string | null }>;

function collectDefs(nodes: readonly MdNode[]): Defs {
  const defs = new Map<string, { url: string; title: string | null }>();
  for (const n of nodes) {
    if (n.type === "definition" && n.identifier != null && n.url != null) {
      defs.set(n.identifier.toLowerCase(), { url: n.url, title: n.title ?? null });
    }
  }
  return defs;
}

/** Plain-text content of a node subtree — the bare-URL test for autolinked links. */
function textOf(node: MdNode): string {
  let out = node.value ?? "";
  for (const c of node.children ?? []) out += textOf(c);
  return out;
}

function renderInline(node: MdNode, defs: Defs, key: string): ReactNode {
  switch (node.type) {
    case "text":
      return node.value ?? "";
    case "emphasis":
      return <em key={key}>{renderInlines(node.children ?? [], defs, key)}</em>;
    case "strong":
      return <strong key={key}>{renderInlines(node.children ?? [], defs, key)}</strong>;
    case "delete":
      return <del key={key}>{renderInlines(node.children ?? [], defs, key)}</del>;
    case "inlineCode":
      return (
        <code key={key} className="ui-md-code ui-d-mono">
          {node.value ?? ""}
        </code>
      );
    case "break":
      return <br key={key} />;
    case "link":
    case "linkReference": {
      const resolved =
        node.type === "link"
          ? { url: node.url ?? "", title: node.title ?? null }
          : node.identifier != null
            ? (defs.get(node.identifier.toLowerCase()) ?? { url: "", title: null })
            : { url: "", title: null };
      const href = safeHref(resolved.url);
      const label = renderInlines(node.children ?? [], defs, key);
      if (href == null) return label; // unsafe protocol — the text renders, the anchor does not
      // a bare autolinked URL truncates its own display text (full URL in title)
      const plain = textOf(node);
      const body = plain === href && plain.length > BARE_URL_DISPLAY_MAX ? truncateUrl(plain) : label;
      return (
        <a
          key={key}
          href={href}
          title={resolved.title ?? href}
          {...(isExternal(href) ? { target: "_blank", rel: "noopener noreferrer" } : {})}
        >
          {body}
        </a>
      );
    }
    case "image":
    case "imageReference": {
      // images never auto-load inside rendered prose — a safe src renders as a labelled link.
      const src =
        node.type === "image"
          ? { url: node.url ?? "", title: node.title ?? null }
          : node.identifier != null
            ? (defs.get(node.identifier.toLowerCase()) ?? { url: "", title: null })
            : { url: "", title: null };
      const label = node.alt != null && node.alt !== "" ? node.alt : "image";
      const href = safeHref(src.url);
      // a non-anchor-safe src (asset://, data:, …) renders its literal `![alt](src)` form —
      // the reference text (e.g. a figure's asset id) stays visible, never lost.
      if (href == null) return `![${label}](${src.url})`;
      return (
        <a
          key={key}
          href={href}
          title={src.title ?? href}
          className="ui-md-img"
          {...(isExternal(href) ? { target: "_blank", rel: "noopener noreferrer" } : {})}
        >
          {label}
        </a>
      );
    }
    case "html":
      // inline raw HTML is never markup — it renders as escaped source text.
      return (
        <code key={key} className="ui-md-code ui-d-mono">
          {node.value ?? ""}
        </code>
      );
    case "inlineMath":
      return (
        <code key={key} className="ui-md-math ui-d-mono">
          ${node.value ?? ""}$
        </code>
      );
    case "footnoteReference":
      return (
        <sup key={key} className="ui-md-note-ref">
          [{node.identifier ?? ""}]
        </sup>
      );
    default:
      if (node.children != null) return renderInlines(node.children, defs, key);
      return node.value ?? "";
  }
}

function renderInlines(nodes: readonly MdNode[], defs: Defs, keyPrefix: string): ReactNode {
  return nodes.map((n, i) => renderInline(n, defs, `${keyPrefix}-i${i}`));
}

function renderBlock(node: MdNode, defs: Defs, key: string): ReactNode {
  switch (node.type) {
    case "paragraph":
      return (
        <p key={key} className="ui-md-p">
          {renderInlines(node.children ?? [], defs, key)}
        </p>
      );
    case "heading": {
      // embedded card prose: clamp to h3–h6 so a body-level H1 never outranks its card's head.
      const level = Math.min(Math.max(node.depth ?? 2, 1) + 2, 6);
      const Tag = `h${level}` as "h3" | "h4" | "h5" | "h6";
      return (
        <Tag key={key} className="ui-md-heading">
          {renderInlines(node.children ?? [], defs, key)}
        </Tag>
      );
    }
    case "list":
      return node.ordered === true ? (
        <ol key={key} className="ui-md-ol ui-os-ol">
          {renderBlocks(node.children ?? [], defs, key)}
        </ol>
      ) : (
        <ul key={key} className="ui-md-ul ui-os-ul">
          {renderBlocks(node.children ?? [], defs, key)}
        </ul>
      );
    case "listItem":
      return (
        <li key={key}>
          {node.checked != null ? <span aria-hidden="true">{node.checked ? "☑ " : "☐ "}</span> : null}
          {renderBlocks(node.children ?? [], defs, key)}
        </li>
      );
    case "blockquote":
      return (
        <blockquote key={key} className="ui-md-quote ui-d-q">
          {renderBlocks(node.children ?? [], defs, key)}
        </blockquote>
      );
    case "code":
      return (
        <pre key={key} className="ui-md-pre ui-vc-pre ui-d-mono" {...(node.lang ? { "data-lang": node.lang } : {})}>
          {node.value ?? ""}
        </pre>
      );
    case "thematicBreak":
      return <hr key={key} className="ui-md-hr" />;
    case "table": {
      const rows = node.children ?? [];
      return (
        <table key={key} className="ui-md-table">
          <tbody>
            {rows.map((r, i) => (
              <tr key={`${key}-r${i}`}>
                {(r.children ?? []).map((c, j) =>
                  i === 0 ? (
                    <th key={`${key}-c${j}`}>{renderInlines(c.children ?? [], defs, `${key}-c${j}`)}</th>
                  ) : (
                    <td key={`${key}-c${j}`}>{renderInlines(c.children ?? [], defs, `${key}-c${j}`)}</td>
                  ),
                )}
              </tr>
            ))}
          </tbody>
        </table>
      );
    }
    case "footnoteDefinition":
      return (
        <p key={key} className="ui-md-note">
          <sup>[{node.identifier ?? ""}]</sup> {renderBlocks(node.children ?? [], defs, key)}
        </p>
      );
    case "math":
      return (
        <div key={key} className="ui-md-pre ui-vc-pre ui-d-mono">
          {"$$\n"}
          {node.value ?? ""}
          {"\n$$"}
        </div>
      );
    case "yaml":
    case "toml":
    case "html":
      // front-matter / raw HTML blocks render as escaped source, never markup.
      return (
        <pre key={key} className="ui-md-pre ui-vc-pre ui-d-mono">
          {node.value ?? ""}
        </pre>
      );
    case "definition":
      return null; // link definitions never render
    default:
      if (node.children != null) return renderBlocks(node.children, defs, key);
      return node.value != null ? (
        <p key={key} className="ui-md-p">
          {node.value}
        </p>
      ) : null;
  }
}

function renderBlocks(nodes: readonly MdNode[], defs: Defs, keyPrefix: string): ReactNode {
  return nodes.map((n, i) => renderBlock(n, defs, `${keyPrefix}-b${i}`));
}

/** The fail-safe: escaped plain paragraphs (the pre-renderer seam's exact behaviour). */
function plainParagraphs(text: string, keyPrefix: string): ReactNode {
  const paras = text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p !== "");
  if (paras.length === 0) return null;
  return paras.map((p, i) => (
    <p key={`${keyPrefix}-p${i}`} className="ui-md-p">
      {p}
    </p>
  ));
}

/**
 * Markdown → React nodes, sanitized. Exported for render seams (chat-panel's
 * `renderAssistantText`) that return nodes rather than a wrapped component.
 */
export function markdownToReact(text: string, keyPrefix = "md"): ReactNode {
  if (text.trim() === "") return null;
  try {
    const tree = parseCanonical(text) as MdNode;
    return renderBlocks(tree.children ?? [], collectDefs(tree.children ?? []), keyPrefix);
  } catch {
    return plainParagraphs(text, keyPrefix);
  }
}

export interface MarkdownProseProps {
  readonly text: string;
  readonly className?: string;
}

/** The one sanitized markdown renderer (REQ-COPY-3): `data-md-block` marks the seam for tests. */
export function MarkdownProse({ text, className }: MarkdownProseProps): ReactNode {
  return (
    <div data-md-block className={className ? `ui-md ${className}` : "ui-md"}>
      {markdownToReact(text)}
    </div>
  );
}
