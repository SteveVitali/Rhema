// Bibliography model + importers (P1.02; §5.4, matrix row 37). Project bibliography = a set of
// CSL-JSON items keyed by cite key (the `[@key]` in text). Importers: BibTeX (.bib), CSL-JSON (the
// array Zotero's "CSL JSON" export emits), and Zotero's item dump shape (`items` array or the
// `zotero`-flavoured fields). Unresolvable keys render visibly — cite resolution is a pure lookup.

export interface CslName {
  readonly family?: string;
  readonly given?: string;
  readonly literal?: string;
}

export interface CslDate {
  readonly "date-parts"?: readonly (readonly number[])[];
  readonly literal?: string;
}

/** The CSL-JSON item subset the profile uses (extra fields pass through on `item`). */
export interface CslItem {
  readonly id: string;
  readonly type: string;
  readonly title?: string;
  readonly author?: readonly CslName[];
  readonly editor?: readonly CslName[];
  readonly issued?: CslDate;
  readonly "container-title"?: string;
  readonly DOI?: string;
  readonly URL?: string;
  readonly volume?: string;
  readonly issue?: string;
  readonly page?: string;
  readonly publisher?: string;
  readonly [key: string]: unknown;
}

export type BibliographyFormat = "bibtex" | "csl-json" | "zotero";

// ---------------------------------------------------------------------------------------------------------------------
// BibTeX
// ---------------------------------------------------------------------------------------------------------------------

const BIBTEX_TYPE_MAP: Record<string, string> = {
  article: "article-journal",
  inproceedings: "paper-conference",
  conference: "paper-conference",
  incollection: "chapter",
  inbook: "chapter",
  book: "book",
  booklet: "book",
  phdthesis: "thesis",
  mastersthesis: "thesis",
  techreport: "report",
  manual: "document",
  online: "webpage",
  misc: "manuscript",
  unpublished: "manuscript",
};

interface BibEntry {
  type: string;
  key: string;
  fields: Record<string, string>;
}

/** Tokenize a .bib file into entries — brace-aware (nested {} and "…" values both handled). */
function parseBibtexEntries(src: string): BibEntry[] {
  const out: BibEntry[] = [];
  let i = 0;
  while (i < src.length) {
    if (src[i] !== "@") { i++; continue; }
    const m = /^@([a-zA-Z]+)\s*[({]/.exec(src.slice(i));
    if (!m) { i++; continue; }
    const type = m[1]!.toLowerCase();
    let j = i + m[0].length;
    // entry key
    const keyM = /^\s*([^,\s})]+)\s*,/.exec(src.slice(j));
    if (!keyM) { i = j; continue; }
    const key = keyM[1]!.trim();
    j += keyM[0].length;
    // fields until balanced close
    const fields: Record<string, string> = {};
    while (j < src.length) {
      if (src[j] === "}" || src[j] === ")") { j++; break; }
      const fm = /^\s*([a-zA-Z_]+)\s*=\s*/.exec(src.slice(j));
      if (!fm) { j++; continue; }
      const name = fm[1]!.toLowerCase();
      j += fm[0].length;
      // value: {…} | "…" | bare number/atom
      let value = "";
      if (src[j] === "{") {
        let depth = 0;
        const start = j;
        while (j < src.length) {
          if (src[j] === "{") depth++;
          else if (src[j] === "}") { depth--; if (depth === 0) { j++; break; } }
          j++;
        }
        value = src.slice(start + 1, j - 1);
      } else if (src[j] === '"') {
        j++;
        const start = j;
        while (j < src.length && src[j] !== '"') {
          if (src[j] === "{" ) { // allow {…} groups inside quotes
            let depth = 0;
            while (j < src.length) { if (src[j]==="{")depth++; else if(src[j]==="}"){depth--; if(depth===0){j++;break;}} j++; }
            continue;
          }
          j++;
        }
        value = src.slice(start, j);
        j++;
      } else {
        const vm = /^[^,\s})]+/.exec(src.slice(j));
        value = vm ? vm[0] : "";
        j += value.length;
      }
      fields[name] = value.replace(/\s+/g, " ").trim();
      // consume trailing comma/whitespace
      const tail = /^\s*,?/.exec(src.slice(j));
      j += tail ? tail[0].length : 0;
    }
    if (type !== "string" && type !== "preamble" && type !== "comment") out.push({ type, key, fields });
    i = j;
  }
  return out;
}

function bibName(raw: string): CslName {
  const t = raw.trim().replace(/[{}]/g, "");
  if (!t) return { literal: "" };
  if (t.includes(",")) {
    const [family, given] = t.split(",", 2);
    return { family: (family ?? "").trim(), given: (given ?? "").trim() };
  }
  const parts = t.split(/\s+/);
  if (parts.length === 1) return { literal: parts[0]! };
  return { family: parts[parts.length - 1]!, given: parts.slice(0, -1).join(" ") };
}

function bibNames(raw: string | undefined): CslName[] | undefined {
  if (!raw) return undefined;
  const names = raw.split(/\s+and\s+/).map(bibName).filter((n) => n.family || n.literal || n.given);
  return names.length ? names : undefined;
}

function bibDate(fields: Record<string, string>): CslDate | undefined {
  const y = fields.year ?? fields.date?.slice(0, 4);
  if (!y || !/^\d{4}/.test(y)) return undefined;
  const mo = fields.month ? /^\d{1,2}$/.exec(fields.month)?.[0] : undefined;
  return { "date-parts": [[Number(y), ...(mo ? [Number(mo)] : [])]] };
}

/** `.bib` text → CSL items. Keys map verbatim (`@article{smith2020,…}` → `[@smith2020]`). */
export function parseBibtex(src: string): CslItem[] {
  return parseBibtexEntries(src).map((e) => {
    const f = e.fields;
    const item: CslItem = {
      id: e.key,
      type: BIBTEX_TYPE_MAP[e.type] ?? "document",
      ...(f.title ? { title: f.title.replace(/[{}]/g, "") } : {}),
      ...(bibNames(f.author) ? { author: bibNames(f.author) } : {}),
      ...(bibNames(f.editor) ? { editor: bibNames(f.editor) } : {}),
      ...(bibDate(f) ? { issued: bibDate(f) } : {}),
      ...(f.journal || f.journaltitle || f.booktitle ? { "container-title": f.journal ?? f.journaltitle ?? f.booktitle } : {}),
      ...(f.doi ? { DOI: f.doi } : {}),
      ...(f.url ? { URL: f.url } : {}),
      ...(f.volume ? { volume: f.volume } : {}),
      ...(f.number ? { issue: f.number } : {}),
      ...(f.pages ? { page: f.pages.replace(/--/g, "–") } : {}),
      ...(f.publisher ? { publisher: f.publisher } : {}),
      ...(f.edition ? { edition: f.edition } : {}),
      ...(f.address ? { "publisher-place": f.address } : {}),
      ...(f.note ? { note: f.note } : {}),
    };
    return item;
  });
}

// ---------------------------------------------------------------------------------------------------------------------
// CSL-JSON + Zotero
// ---------------------------------------------------------------------------------------------------------------------

function toCslItem(raw: Record<string, unknown>, fallbackIndex: number): CslItem {
  // Zotero's CSL-JSON export: a string `id` IS the cite key; a NUMERIC `id` is the library item number
  // and the `itemKey`/`key` carries the citeable key instead.
  const id = typeof raw.id === "string" && raw.id !== ""
    ? raw.id
    : String(raw.itemKey ?? raw.key ?? (raw.id != null ? raw.id : `item-${fallbackIndex + 1}`));
  const type = typeof raw.type === "string" ? raw.type : "document";
  return { ...raw, id, type } as CslItem;
}

/** CSL-JSON array (or `{items:[…]}` Zotero dump) → normalized items. */
export function parseCslJson(src: string): CslItem[] {
  const parsed: unknown = JSON.parse(src);
  const arr = Array.isArray(parsed)
    ? parsed
    : (parsed && typeof parsed === "object" && Array.isArray((parsed as { items?: unknown[] }).items)
        ? (parsed as { items: unknown[] }).items
        : null);
  if (!arr) throw new Error("not a CSL-JSON array");
  const out: CslItem[] = [];
  arr.forEach((raw, i) => {
    if (raw && typeof raw === "object") out.push(toCslItem(raw as Record<string, unknown>, i));
  });
  return out;
}

/** Zotero export — CSL-JSON preferred; a `.bib` paste routes through the BibTeX parser. */
export function parseZoteroExport(src: string): CslItem[] {
  const t = src.trim();
  if (t.startsWith("[") || t.startsWith("{")) return parseCslJson(t);
  if (t.startsWith("@")) return parseBibtex(t);
  throw new Error("unrecognized Zotero export (expected CSL-JSON or BibTeX)");
}

/** Dispatch on an explicit format. */
export function importBibliography(format: BibliographyFormat, src: string): CslItem[] {
  switch (format) {
    case "bibtex": return parseBibtex(src);
    case "csl-json": return parseCslJson(src);
    case "zotero": return parseZoteroExport(src);
  }
}

/** Sniff a pasted/uploaded bibliography's format. */
export function detectBibliographyFormat(src: string): BibliographyFormat | null {
  const t = src.trim();
  if (t.startsWith("@")) return "bibtex";
  if (t.startsWith("[") || t.startsWith("{")) {
    try {
      const parsed: unknown = JSON.parse(t);
      const arr = Array.isArray(parsed) ? parsed : (parsed as { items?: unknown[] })?.items;
      if (Array.isArray(arr) && arr.some((x) => x && typeof x === "object" && ("itemKey" in (x as object) || "key" in (x as object)))) return "zotero";
      return "csl-json";
    } catch {
      return null;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------------------------------------------------
// cite resolution
// ---------------------------------------------------------------------------------------------------------------------

/** Every cite key referenced in a doc, in first-reference order (keys may carry locator tails). */
export function citeKeysIn(markdown: string): string[] {
  const seen = new Set<string>();
  const re = /\[@([^\]]+)\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(markdown)) !== null) {
    for (const part of m[1]!.split(";")) {
      const key = part.trim().replace(/^@/, "").split(",")[0]!.trim();
      if (key && !seen.has(key)) { seen.add(key); }
    }
  }
  return [...seen];
}

export interface CiteResolution {
  readonly key: string;
  readonly item: CslItem | null; // null → dangling — renders visibly, never dropped
}

/** Resolve each referenced key against the project's items (id = cite key). */
export function resolveCites(markdown: string, items: readonly CslItem[]): CiteResolution[] {
  const byId = new Map(items.map((i) => [i.id, i]));
  return citeKeysIn(markdown).map((key) => ({ key, item: byId.get(key) ?? null }));
}

/** A one-line item label for the cite chip / bibliography list ("Smith (2020). Title."). */
export function citeLabel(item: CslItem): string {
  const fam = item.author?.[0]?.family ?? item.author?.[0]?.literal ?? item.editor?.[0]?.family ?? "";
  const year = item.issued?.["date-parts"]?.[0]?.[0] ?? "";
  const head = [fam, year ? `(${year})` : ""].filter(Boolean).join(" ") || item.id;
  return item.title ? `${head} — ${item.title}` : head;
}
