// R2 prototype helpers (throwaway). Imports built Rhema workspace dist by absolute path.
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, basename } from "node:path";
import { pathToFileURL } from "node:url";

export const REPO = process.env.RHEMA_REPO ?? new URL("../../../../../..", import.meta.url).pathname;
export const CORPUS = process.env.AGENT_DISCOURSE_PROJECTS ?? `${process.env.HOME}/agent-discourse/agent-scratch/projects`;
const imp = (p) => import(pathToFileURL(join(REPO, p)).href);
export const wc = await imp("packages/findings-core/dist/what-changed.js");
export const anc = await imp("packages/findings-core/dist/anchor.js");
export const parsers = await imp("packages/protocols/dist/parsers/index.js");
export const draftLedger = await imp("packages/protocols/dist/parsers/draft-ledger.js");

export const read = (p) => readFileSync(p, "utf8");
export const exists = existsSync;
export const ls = (d) => (existsSync(d) ? readdirSync(d).filter((f) => f.endsWith(".md")).sort() : []);
export { join, basename };

// Review rounds: which draft each review read, and which draft answered it.
export const ROUNDS = [
  { slug: "the-politics-of-visibility", round: "v1", reviewed: "v1", next: "v2" },
  { slug: "structure-of-political-difference", round: "v1", reviewed: "v1", next: "v2" },
  { slug: "constitution-of-reason", round: "v2", reviewed: "v2", next: "v3" },
  { slug: "the-governable-mind", round: "v1", reviewed: "v1", next: "v2" },
  { slug: "the-governable-mind", round: "v2", reviewed: "v2", next: "v3" },
];

/** Split a doc into heading sections at a given level; returns {heading, body, line}. */
export function sections(md, level) {
  const re = new RegExp(`^#{${level}} (?!#)(.*)$`);
  const out = [];
  let cur = null;
  md.split("\n").forEach((line, i) => {
    const m = re.exec(line);
    if (m) {
      cur = { heading: m[1].trim(), body: "", line: i + 1 };
      out.push(cur);
    } else if (cur) cur.body += line + "\n";
  });
  return out;
}

/** `- **Label:** text` bullets with continuation lines → [{label, text}] in order. */
export function boldBullets(body) {
  const out = [];
  let cur = null;
  for (const line of body.split("\n")) {
    const m = /^- \*\*(.+?)\*\*:?\s*(.*)$/.exec(line);
    if (m) {
      cur = { label: m[1].replace(/:$/, "").trim(), text: m[2] };
      out.push(cur);
    } else if (cur && /^\s+\S/.test(line)) cur.text += " " + line.trim();
    else if (line.trim() === "" || /^(- |#|>)/.test(line)) cur = null;
  }
  return out;
}

export function links(text) {
  const out = [];
  const re = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g;
  let m;
  while ((m = re.exec(text))) out.push({ label: m[1], url: m[2] });
  // bare urls not already captured
  const bare = /(?<![(\[])\bhttps?:\/\/[^\s)\]>,;]+/g;
  while ((m = bare.exec(text))) {
    const u = m[0].replace(/[.)]+$/, "");
    if (!out.some((l) => l.url === u)) out.push({ label: null, url: u });
  }
  return out;
}

export function normalizedUrl(u) {
  try {
    const x = new URL(u);
    return (x.host.replace(/^www\./, "") + x.pathname.replace(/\/$/, "") + (x.search || "")).toLowerCase();
  } catch {
    return u;
  }
}

/** markdown table rows under a heading body → arrays of cells (header + rows), skipping rule lines. */
export function tables(body) {
  const out = [];
  let cur = null;
  for (const line of body.split("\n")) {
    const t = line.trim();
    if (t.startsWith("|")) {
      if (!cur) {
        cur = [];
        out.push(cur);
      }
      if (/^\|[\s:|-]+\|$/.test(t)) continue;
      cur.push(splitRow(t));
    } else cur = null;
  }
  return out;
}
export function splitRow(t) {
  // split on unescaped pipes
  const cells = [];
  let buf = "";
  for (let i = 1; i < t.length; i++) {
    const c = t[i];
    if (c === "\\" && t[i + 1] === "|") {
      buf += "|";
      i++;
    } else if (c === "|") {
      cells.push(buf.trim());
      buf = "";
    } else buf += c;
  }
  return cells;
}

export const pct = (a, b) => (b === 0 ? "n/a" : `${((100 * a) / b).toFixed(0)}%`);

/** H3 sections whose bodies stop at ANY heading (H1/H2 too) — so an H2 appendix doesn't glue onto the last H3. */
export function sections3(md) {
  const out = [];
  let cur = null;
  md.split("\n").forEach((line, i) => {
    const m = /^### (?!#)(.*)$/.exec(line);
    if (m) { cur = { heading: m[1].trim(), body: "", line: i + 1 }; out.push(cur); }
    else if (/^#{1,2} /.test(line)) cur = null;
    else if (cur) cur.body += line + "\n";
  });
  return out;
}
