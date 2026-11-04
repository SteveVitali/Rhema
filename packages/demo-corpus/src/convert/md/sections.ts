// Shared markdown readers for the corpus→sidecar converter (R2 §5; REQ-CONV-1). Pure line-based
// functions over sanitized corpus markdown — no I/O, no clock, no randomness, deterministic output.
// The hard invariant they carry: an H3 claim/section body STOPS at any H1/H2 heading, so a trailing
// `## Reuse confirmations` / `## References checked` / `## Summary` appendix never glues onto the
// last entry (R2 §1 "H2 appendices would glue onto the last H3").

/** A heading-delimited section: heading text plus the raw body up to the closing heading. */
export interface HeadingSection {
  /** The heading text after the `##`/`###` marker, trimmed. */
  readonly heading: string;
  /** The raw body (verbatim lines, trailing newline) up to the next heading at level ≤ this one. */
  readonly body: string;
  /** 1-based line number of the heading in the source markdown. */
  readonly line: number;
}

/**
 * Split a document into sections at `level`, where a section body ends at ANY heading of level
 * `<= level` — so `headingSections(md, 3)` stops an H3 body at H1, H2 and the next H3 alike, and
 * `headingSections(md, 2)` lets H3s live inside an H2 body. Text before the first matching heading
 * is not captured here (see `preamble`).
 */
export function headingSections(markdown: string, level: 1 | 2 | 3): HeadingSection[] {
  const start = new RegExp(`^#{${level}} (?!#)`);
  const stop = new RegExp(`^#{1,${level}} (?!#)`);
  const out: { heading: string; body: string[]; line: number }[] = [];
  let cur: { heading: string; body: string[]; line: number } | null = null;
  markdown.split("\n").forEach((line, i) => {
    if (start.test(line)) {
      cur = { heading: line.replace(/^#+\s*/, "").trim(), body: [], line: i + 1 };
      out.push(cur);
    } else if (stop.test(line)) {
      cur = null;
    } else if (cur) {
      cur.body.push(line);
    }
  });
  return out.map((s) => ({ heading: s.heading, body: s.body.join("\n") + (s.body.length ? "\n" : ""), line: s.line }));
}

/** The raw text before the first heading at `level` (the document's preamble/header block). */
export function preamble(markdown: string, level: 1 | 2 | 3): string {
  const idx = markdown.search(new RegExp(`^#{${level}} (?!#)`, "m"));
  return idx < 0 ? markdown : markdown.slice(0, idx);
}

/** One `- ` list item, with an optional `**Label:**`/`Label:`/`**Label**` lead split off. */
export interface BulletItem {
  /** The lead label (e.g. `Source`, `Fix`, `C2 · Tier 1`), or null for an unlabelled item. */
  readonly label: string | null;
  /** The item text after the label (continuations folded in verbatim, single-spaced). */
  readonly text: string;
  /** 1-based line number of the `- ` marker inside the body. */
  readonly line: number;
}

const BOLD_LABEL_RE = /^-\s+\*\*(.+?)\*\*\s*:?\s*(.*)$/;
const PLAIN_LABEL_RE = /^-\s+([A-Z][A-Za-z ()/-]{0,40}?):\s*(.*)$/;

/**
 * `- **Label:** text` bullets with continuation lines (indented non-marker lines fold into the
 * previous bullet's text). The R2 bold form. Also absorbs `- **Label** — text` (label without a
 * colon) since the fixture's `- **C2 · Tier 1** — …` reuse bullets take it.
 */
export function boldBullets(body: string): BulletItem[] {
  return bulletItems(body, (line) => {
    const m = BOLD_LABEL_RE.exec(line);
    return m ? { label: (m[1] ?? "").replace(/:$/, "").trim(), text: (m[2] ?? "").trim() } : null;
  });
}

/**
 * The union reader for claim-ledger entry bodies: `- **Label:** text` (real-corpus form) or the
 * fixture's `- Label: text` plain form (`- Source: <url>`, `- Fix: …`). A `- ` line whose head is
 * neither form is still returned, with `label: null`, so callers never lose text.
 */
export function labelBullets(body: string): BulletItem[] {
  return bulletItems(body, (line) => {
    const bold = BOLD_LABEL_RE.exec(line);
    if (bold) return { label: (bold[1] ?? "").replace(/:$/, "").trim(), text: (bold[2] ?? "").trim() };
    const plain = PLAIN_LABEL_RE.exec(line);
    if (plain) return { label: plain[1] ?? null, text: (plain[2] ?? "").trim() };
    const item = /^-\s+(.*)$/.exec(line);
    return item ? { label: null, text: (item[1] ?? "").trim() } : null;
  });
}

function bulletItems(
  body: string,
  start: (line: string) => { label: string | null; text: string } | null,
): BulletItem[] {
  const out: BulletItem[] = [];
  let cur: { label: string | null; text: string; line: number } | null = null;
  body.split("\n").forEach((line, i) => {
    const m = /^-\s+/.test(line) ? start(line) : null;
    if (m) {
      cur = { label: m.label, text: m.text, line: i + 1 };
      out.push(cur);
    } else if (cur && /^\s+\S/.test(line)) {
      cur.text += " " + line.trim();
    } else if (line.trim() === "" || /^(- |#|>)/.test(line)) {
      cur = null;
    }
  });
  return out;
}

/** Ordered list items — `- ` and `1. ` markers (the letters mix the two, R2 §1 "Lists mix"). */
export function listItems(body: string): { text: string; ordered: boolean; line: number }[] {
  const out: { text: string; ordered: boolean; line: number }[] = [];
  body.split("\n").forEach((line, i) => {
    const m = /^\s*(?:-|(\d+)\.)\s+(.*)$/.exec(line);
    if (m) out.push({ text: (m[2] ?? "").trim(), ordered: m[1] !== undefined, line: i + 1 });
  });
  return out;
}

/** Markdown tables in a body → cell matrices (header + rows; rule lines skipped; `\|` unescaped). */
export function tables(body: string): string[][][] {
  const out: string[][][] = [];
  let cur: string[][] | null = null;
  for (const line of body.split("\n")) {
    const t = line.trim();
    if (t.startsWith("|")) {
      if (!cur) {
        cur = [];
        out.push(cur);
      }
      if (/^\|[\s:|-]+\|$/.test(t)) continue;
      cur.push(splitTableRow(t));
    } else {
      cur = null;
    }
  }
  return out;
}

/** One `| a | b |` row → cells, splitting on unescaped pipes only. */
export function splitTableRow(row: string): string[] {
  const cells: string[] = [];
  let buf = "";
  for (let i = 1; i < row.length; i++) {
    const c = row[i];
    if (c === "\\" && row[i + 1] === "|") {
      buf += "|";
      i++;
    } else if (c === "|") {
      cells.push(buf.trim());
      buf = "";
    } else {
      buf += c;
    }
  }
  return cells;
}

/** A hyperlink found in text: `[label](url)` or a bare `https?://` token. */
export interface TextLink {
  readonly label: string | null;
  readonly url: string;
}

/** All links in a text: markdown links first, then bare URLs not already captured. */
export function links(text: string): TextLink[] {
  const out: TextLink[] = [];
  const re = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) out.push({ label: m[1] ?? null, url: m[2] ?? "" });
  const bare = /(?<![([])\bhttps?:\/\/[^\s)\]>,;]+/g;
  while ((m = bare.exec(text))) {
    const u = (m[0] ?? "").replace(/[.)]+$/, "");
    if (!out.some((l) => l.url === u)) out.push({ label: null, url: u });
  }
  return out;
}
