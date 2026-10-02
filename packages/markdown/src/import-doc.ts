import { visit } from "unist-util-visit";
import { toString } from "mdast-util-to-string";
import type { Image, Definition } from "mdast";
import { parseCanonical, stringifyCanonical } from "./profile.js";

// ONB.1 — the two import-time document fixups the converter applies before the canonical normalize
// pass (REQ-GROWTH-1 amended; REQ-INGEST-7; spec §9.5):
//
//   1. `extractLeadingTitle` — a document whose FIRST content block is an H1 has its title written
//      in the wrong place (§9.5: the title lives in front-matter, never a body heading). The H1's
//      text comes out as `title`; the node is REMOVED so the normalizer's demote-pass cannot turn
//      it into a body-level H2 duplicate. Only a leading H1 qualifies — an H1 after prose is a
//      section heading and keeps the demote treatment.
//   2. `inertUnresolvedImages` — an image target that is not `https?://` or `data:` cannot be
//      resolved by anything downstream (the upload carries no sibling files, and the Page must
//      never emit a live `<img src>` that 404s). The target is rewritten to the empty URL — the
//      canonical figure form that renders the inert `.rm-figure-placeholder` — with the basename
//      folded into the alt when the alt is empty, so the placeholder names what was missing.
//      Reference-style `![alt][id]` targets are inerted through their `definition` blocks.
//
// Both helpers are pure (parse → mutate → canonical stringify) and idempotent: a second pass sees
// an already-titleless body / already-empty URLs and returns byte-identical markdown.

/** `https?://` and `data:` are the only image targets the Page could ever resolve. */
const RESOLVABLE_IMAGE_URL = /^(https?:|data:)/i;

/**
 * Remove a document-leading H1 and return its text as the document title. `title` is undefined
 * when the first content block is anything else (prose, a lower heading, front-matter only). A
 * `yaml` front-matter block is skipped over but preserved — a doc that already carries front
 * matter still yields its leading H1.
 */
export function extractLeadingTitle(markdown: string): { readonly title?: string; readonly markdown: string } {
  const tree = parseCanonical(markdown);
  const first = tree.children.find((c) => c.type !== "yaml");
  if (!first || first.type !== "heading" || first.depth !== 1) return { markdown };
  const title = toString(first).replace(/\s+/g, " ").trim().slice(0, 120);
  tree.children.splice(tree.children.indexOf(first), 1);
  return title ? { title, markdown: stringifyCanonical(tree) } : { markdown };
}

export interface UnresolvedImageRef {
  /** The original target, verbatim (e.g. `figure_1_five_questions.png`). */
  readonly path: string;
  /** The basename the placeholder labels itself with. */
  readonly name: string;
}

function basename(p: string): string {
  const seg = p.split(/[\\/]/).filter(Boolean).pop() ?? p;
  const clean = seg.split(/[?#]/)[0] || seg;
  try {
    return decodeURIComponent(clean);
  } catch {
    return clean;
  }
}

/**
 * Rewrite every unresolvable image target to the inert empty-URL form and report each one.
 * `![alt](figure_1.png)` → `![figure_1.png]()` (alt empty ⇒ basename folded in); an image whose
 * URL is already `""` is already inert and is NOT reported (idempotent re-runs produce no new
 * warnings). `![alt][id]` is inerted through its `definition` — a definition an image reference
 * uses loses its target; one only a plain link uses keeps it.
 */
export function inertUnresolvedImages(markdown: string): {
  readonly markdown: string;
  readonly unresolved: readonly UnresolvedImageRef[];
} {
  const tree = parseCanonical(markdown);
  const unresolved: UnresolvedImageRef[] = [];

  // The identifiers image references use — only those definitions are inerted.
  const imageRefIds = new Set<string>();
  visit(tree, "imageReference", (n) => {
    imageRefIds.add(n.identifier.toLowerCase());
  });

  visit(tree, "image", (img: Image) => {
    const url = img.url;
    if (!url || RESOLVABLE_IMAGE_URL.test(url)) return;
    const name = basename(url);
    unresolved.push({ path: url, name });
    img.url = "";
    img.title = null;
    if (!img.alt) img.alt = name;
  });

  visit(tree, "definition", (def: Definition) => {
    if (!imageRefIds.has(def.identifier.toLowerCase())) return;
    const url = def.url;
    if (!url || RESOLVABLE_IMAGE_URL.test(url)) return;
    unresolved.push({ path: url, name: basename(url) });
    def.url = "";
  });

  if (unresolved.length === 0) return { markdown, unresolved };
  return { markdown: stringifyCanonical(tree), unresolved };
}

/** Collapse repeated unresolved reports of the same path into one (order-preserving). */
export function uniqueUnresolved(list: readonly UnresolvedImageRef[]): readonly UnresolvedImageRef[] {
  const seen = new Set<string>();
  return list.filter((u) => {
    if (seen.has(u.path)) return false;
    seen.add(u.path);
    return true;
  });
}
