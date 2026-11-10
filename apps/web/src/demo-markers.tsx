// R7DEM.5 (REQ-CONV-14, REQ-TOUR-6, REQ-TOUR-7; S-9/S-10) — the demo record markers: what the
// delivered agent-discourse record does and does not hold, rendered honestly next to the doc.
//
//   • `DemoDocMarkers` — the `data-demo-markers` block a Page/artifact doc mounts when its
//     `EditorDocDto.demo` markers arrive: REQ-CONV-14 import-rule labels, REQ-TOUR-6 excluded
//     references as "not published" non-link labels, the Files fragments note.
//   • `stripNotPublishedLinks` — the docJson transform the SPA leaf runs after `markdownToDoc`:
//     a `link` mark whose href names an excluded artifact is dropped and the text gains
//     " (not published)", so the ref renders as a non-link LABELLED not published (REQ-TOUR-6).
//   • `DemoLedgerDecisions` + `parseLedgerEscalations` — REQ-TOUR-7: on a response-ledger
//     artifact page the escalation rows render as Decisions (verbatim cells, never re-worded).
//
// Shared SSR-safe composition (page-chrome.tsx precedent): no DOM lib usage, so the same module
// renders inside the SPA leaf AND stays importable by the document path without a guard.

import type { ReactNode } from "react";
import type { DemoMarkersDto } from "@rhema/api-client";
import { COPY } from "./copy.js";

// ---------------------------------------------------------------------------
// The markers block — import-rule labels, "not published" refs, the fragments note.
// ---------------------------------------------------------------------------

export function DemoDocMarkers({ demo }: { readonly demo: DemoMarkersDto }): ReactNode {
  const importRules = Object.entries(demo.importRule ?? {});
  const refs = demo.notPublishedRefs ?? [];
  if (importRules.length === 0 && refs.length === 0 && demo.fragmentsNote == null) return null;
  return (
    <section
      data-demo-markers="true"
      className="ui-t-r10 ui-t-p1014 ui-t-m30 ui-rs-box ui-d-fs ui-t-mut"
      style={{ border: "1px solid var(--shell-border)" }}
    >
      {importRules.length > 0 ? (
        <ul className="ui-c2-m0 ui-d-p0" style={{ listStyle: "none" }}>
          {importRules.map(([field, note]) => (
            <li key={field} data-import-rule={field} className="ui-t-p10">
              {field} — {note}
            </li>
          ))}
        </ul>
      ) : null}
      {refs.map((r) => (
        <p key={`${r.line}:${r.path}`} data-not-published={r.path} className="ui-t-m10">
          {r.path} — {COPY.demo.notPublishedLabel}
        </p>
      ))}
      {demo.fragmentsNote != null ? (
        <p data-fragments-note="true" className="ui-t-m10">
          {demo.fragmentsNote}
        </p>
      ) : null}
    </section>
  );
}

// ---------------------------------------------------------------------------
// REQ-TOUR-6 — strip link marks that target excluded (never-exported) artifacts.
// ---------------------------------------------------------------------------

/** PM doc-JSON node, structural (the marks array carries `{type:"link", attrs:{href}}`). */
type DocJsonNode = {
  type?: string;
  text?: string;
  marks?: { type: string; attrs?: { href?: string } }[];
  content?: DocJsonNode[];
};

/** True when `href` names the corpus path — a full match, a path-tail match, or a relative
 *  link whose suffix completes the corpus path (`figures/x.png` inside `drafts/` resolves to
 *  `drafts/figures/x.png` — `path.endsWith("/" + href)` catches it). */
function targetsCorpusPath(href: string, path: string): boolean {
  if (href === path) return true;
  return (
    href.endsWith(`/${path}`) ||
    path.endsWith(`/${href}`) ||
    href.endsWith(path.split("/").pop() ?? path)
  );
}

/**
 * Post-process `markdownToDoc(...).toJSON()` for a demo doc (REQ-TOUR-6 + REQ-DWEB-17):
 *   • a `link` mark whose href resolves to an EXCLUDED artifact loses the mark (a NON-LINK)
 *     and gains the " (not published)" suffix — labelled exactly where the markdown put it;
 *   • a link mark OR `image` node whose href/src resolves to a published artifact on the
 *     `assetRefs` allowlist is rewritten to the demo asset route (`/bff/demo/asset/…`) — the
 *     corpus-relative ref never resolves under the document URL into a 404.
 * Pure: returns the input unchanged when nothing matches.
 */
export function rewriteDemoDocLinks(
  docJson: unknown,
  demo: DemoMarkersDto | undefined,
  inDemo = false,
): unknown {
  const refs = demo?.notPublishedRefs ?? [];
  const assets = demo?.assetRefs ?? [];
  if (docJson == null) return docJson;
  // REQ-DWEB-7 — in a demo mount the external-src sweep runs even when the doc carries no
  // markers at all: ANY `https?://` image src is a third-party fetch a read-only public page
  // must never issue (the real corpus' essays carry Substack-hosted image URLs).
  if (!inDemo && refs.length === 0 && assets.length === 0) return docJson;
  const rewrite = (href: string): { dropLink: boolean; href?: string } => {
    if (refs.some((r) => targetsCorpusPath(href, r.path))) return { dropLink: true };
    const asset = assets.find((a) => targetsCorpusPath(href, a.path));
    if (asset) return { dropLink: false, href: asset.uri };
    return { dropLink: false };
  };
  const walk = (node: DocJsonNode & { attrs?: { href?: string; src?: string } }): void => {
    if (node.marks != null && node.text != null) {
      const link = node.marks.find((m) => m.type === "link" && typeof m.attrs?.href === "string");
      if (link != null) {
        const r = rewrite(link.attrs!.href!);
        if (r.dropLink) {
          node.marks = node.marks!.filter((m) => m !== link);
          if (node.marks!.length === 0) delete node.marks;
          node.text = `${node.text} (${COPY.demo.notPublishedLabel})`;
        } else if (r.href != null) {
          link.attrs!.href = r.href;
        }
      }
    }
    // an `image` node's `src` resolves through the same mapping (an inline figure reference).
    if (typeof node.attrs?.src === "string") {
      const src = node.attrs.src;
      if (/^https?:\/\//.test(src)) {
        // REQ-DWEB-7 — a read-only public demo page issues NO third-party request: an external
        // image URL either names a corpus asset copy (→ the demo asset route) or renders as
        // the honest "not published" label, never a hot-linked fetch (the real corpus' essays
        // carry Substack-hosted image URLs).
        const basename = src.split("?")[0]!.split("/").pop() ?? "";
        const asset = assets.find((a) => a.path.split("/").pop() === basename);
        if (asset != null) {
          node.attrs.src = asset.uri;
        } else {
          delete node.attrs;
          delete node.marks;
          (node as { type?: string }).type = "text";
          node.text = ` (${COPY.demo.notPublishedLabel})`;
        }
      } else {
        const r = rewrite(src);
        if (r.dropLink) delete node.attrs.src;
        else if (r.href != null) node.attrs.src = r.href;
      }
    }
    if (node.content) for (const child of node.content) walk(child);
  };
  walk(docJson as DocJsonNode & { attrs?: { href?: string; src?: string } });
  return docJson;
}

/** Back-compat alias for the not-published arm alone. */
export function stripNotPublishedLinks(
  docJson: unknown,
  refs: readonly { readonly line: number; readonly path: string }[],
): unknown {
  return rewriteDemoDocLinks(docJson, refs.length > 0 ? { notPublishedRefs: refs } : undefined);
}

// ---------------------------------------------------------------------------
// REQ-TOUR-7 — escalation rows on a response-ledger artifact render as Decisions.
// ---------------------------------------------------------------------------

/** One response-ledger table row's escalation fact — verbatim cells, never re-worded. */
export interface LedgerEscalation {
  readonly row: string;
  readonly source: string;
  readonly status: string;
  readonly note: string;
}

/**
 * Parse the response-ledger's disposition table for escalate rows (`| F6 | OQ 1 | escalate |
 * escalated | … |`). The corpus table format is committed (five-cell rows); anything outside
 * that shape is ignored — an unparseable row is a miss, never a mislabel.
 */
export function parseLedgerEscalations(markdown: string): readonly LedgerEscalation[] {
  const out: LedgerEscalation[] = [];
  for (const line of markdown.split("\n")) {
    if (!line.startsWith("|")) continue;
    const cells = line
      .split("|")
      .slice(1, -1)
      .map((c) => c.trim());
    if (cells.length < 5) continue;
    const [row = "", source = "", disposition = "", status = "", note = ""] = cells;
    if (!/^(?:\*\*)?escalat/i.test(disposition) && !/escalat/i.test(disposition)) continue;
    if (/^row$/i.test(row) || /^-+$/.test(row) || /^-+$/.test(source)) continue; // header/separator
    out.push({ row, source, status, note });
  }
  return out;
}

/**
 * The response-ledger artifact page's Decisions block (REQ-TOUR-7): each escalation the ledger
 * records renders through the Decisions presentation — the finding, its status, and the note —
 * because an escalation IS a decision only the writer may make (the S-10 vocabulary names the
 * decider "the writer", never "author").
 */
export function DemoLedgerDecisions({ markdown }: { readonly markdown: string }): ReactNode {
  const rows = parseLedgerEscalations(markdown);
  if (rows.length === 0) return null;
  return (
    <section
      data-demo-decisions="true"
      className="ui-t-r10 ui-t-p1014 ui-t-m30 ui-d-rc"
      style={{ border: "1px solid var(--shell-border)" }}
    >
      <h2 className="ui-d-fd ui-d-b ui-t-fg ui-t-m06">{COPY.demo.decisionsHeading}</h2>
      <ul className="ui-c2-m0 ui-d-p0" style={{ listStyle: "none" }}>
        {rows.map((r) => (
          <li key={r.row} data-demo-escalation={r.row} className="ui-t-p30 ui-d-fd ui-t-fg">
            <strong>{r.row}</strong>
            {r.source !== "" ? ` · ${r.source}` : ""}
            {r.status !== "" ? ` · ${r.status}` : ""}
            {r.note !== "" ? ` — ${r.note}` : ""}
          </li>
        ))}
      </ul>
    </section>
  );
}
