// The Substack export-zip provider (§9.5 matrix row 2) — the only lossless path for paid posts.
// A Substack "export" zip carries `posts.csv` (the index) + `posts/<id>.<slug>.html` (the bodies).
// Discovery parses the CSV + file list (LOCAL bytes — never the network); fetch reads the post file
// from the same zip. The connection's `handle` carries the quarantine key (`quarantine/<ws>/<id>`);
// bytes arrive through the injected BlobPort. Change key = file hash (the zip is immutable).

import JSZip from "jszip";
import { sha256Hex } from "@rhema/contracts";
import { rewriteFootnotes } from "./substack.js";
import type {
  ConnectionRef,
  DiscoveredDraft,
  FetchOutcome,
  Provider,
  ProviderDeps,
  ProviderError,
} from "../types.js";

function err(message: string, remedy: string): ProviderError {
  return { message, remedy };
}

const EXPORT_ERR = "Import the zip you get from Substack → Settings → Export";

/** Minimal RFC-4180 CSV row parser (quoted fields, escaped quotes, CRLF). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else field += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i += 1;
      row.push(field);
      field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.length > 1 || row[0] !== "") rows.push(row);
  return rows;
}

interface ExportEntry {
  readonly name: string;
  readonly bytes: Uint8Array;
}

interface ParsedExport {
  readonly rows: Record<string, string>[];
  readonly posts: Map<string, ExportEntry>; // keyed by `<id>.<slug>` stem
}

async function readExport(bytes: Uint8Array): Promise<ParsedExport> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(bytes);
  } catch (e) {
    throw err(`zip unreadable: ${String((e as Error)?.message ?? e).slice(0, 80)}`, EXPORT_ERR);
  }
  const csvFile = zip.file(/(^|\/)posts\.csv$/i)[0];
  const postFiles = zip.file(/(^|\/)posts\/[^/]+\.html$/i);
  if (!csvFile) throw err("posts.csv missing", EXPORT_ERR);
  const csvText = await csvFile.async("string");
  const grid = parseCsv(csvText);
  const header = (grid[0] ?? []).map((h) => h.trim().toLowerCase());
  const rows = grid.slice(1).map((r) => {
    const rec: Record<string, string> = {};
    header.forEach((h, i) => {
      rec[h] = r[i] ?? "";
    });
    return rec;
  });
  const posts = new Map<string, ExportEntry>();
  for (const f of postFiles) {
    posts.set(f.name.replace(/^.*\//, "").replace(/\.html$/i, ""), {
      name: f.name,
      bytes: new Uint8Array(await f.async("uint8array")),
    });
  }
  return { rows, posts };
}

/** The `<id>.<slug>` stem a posts/ file is keyed by (Substack names them `<post_id>.<slug>.html`). */
function stemFor(row: Record<string, string>): string | null {
  const id = row.post_id ?? row.id ?? "";
  const slug = row.slug ?? "";
  if (!id && !slug) return null;
  return slug ? `${id}.${slug}` : id;
}

function wordCountOf(html: string): number {
  return html.replace(/<[^>]+>/g, " ").trim().split(/\s+/).filter(Boolean).length;
}

export function createSubstackExportProvider(): Provider {
  return {
    id: "substack_export",
    hasDiscovery: true,

    async discover(conn: ConnectionRef, deps: ProviderDeps): Promise<DiscoveredDraft[]> {
      if (!conn.handle || !deps.blobs) {
        throw err("export zip not attached", "Upload the export zip — Settings → Export on your Substack");
      }
      const bytes = await deps.blobs.read(conn.handle);
      if (!bytes) throw err("export zip not found in quarantine", "Upload the export zip again");
      const parsed = await readExport(bytes);
      const out: DiscoveredDraft[] = [];
      for (const row of parsed.rows) {
        const stem = stemFor(row);
        if (!stem) continue;
        const file = parsed.posts.get(stem) ?? [...parsed.posts.entries()].find(([k]) => k.startsWith(`${row.post_id}.`))?.[1];
        const id = row.post_id || stem;
        out.push({
          externalId: id,
          title: row.title || stem,
          url: row.canonical_url || null,
          date: (row.post_date ?? "").slice(0, 10) || null,
          wordCount: file ? wordCountOf(new TextDecoder().decode(file.bytes)) : null,
          // The export is the user's own archive — paid posts included via export are first-class
          // (the ONLY lossless path for paid; §9.5). A row with no post file can't be fetched.
          access: file ? "free" : "unknown",
          remoteChangeKey: file ? `sha256:${sha256Hex(file.bytes)}` : null,
        });
      }
      return out;
    },

    async fetch(item: DiscoveredDraft, conn: ConnectionRef, deps: ProviderDeps): Promise<FetchOutcome> {
      if (!conn.handle || !deps.blobs) {
        return { ok: false, error: err("export zip not attached", "Upload the export zip again") };
      }
      const bytes = await deps.blobs.read(conn.handle);
      if (!bytes) return { ok: false, error: err("export zip not found", "Upload the export zip again") };
      const parsed = await readExport(bytes);
      const entry =
        [...parsed.posts.entries()].find(([k]) => k === item.externalId || k.startsWith(`${item.externalId}.`))?.[1] ??
        null;
      if (!entry) {
        return {
          ok: false,
          error: err(`post file for ${item.externalId} missing from the zip`, "Re-export from Substack and upload again"),
        };
      }
      return {
        ok: true,
        body: {
          bytes: rewriteFootnotesBytes(entry.bytes),
          contentType: "text/html",
          meta: { title: item.title, date: item.date, url: item.url },
        },
      };
    },

    changeKey(draft: DiscoveredDraft): string | null {
      return draft.remoteChangeKey;
    },
  };
}

function rewriteFootnotesBytes(bytes: Uint8Array): Uint8Array {
  const html = new TextDecoder().decode(bytes);
  const out = rewriteFootnotes(html);
  return new TextEncoder().encode(out);
}
