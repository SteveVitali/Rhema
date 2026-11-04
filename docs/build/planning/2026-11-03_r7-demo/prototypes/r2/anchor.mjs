// Quote → Anchor prototype over splitMarkdownBlocks blocks (block-relative offsets, so the render ladder's
// rung 1 `block.text.slice(start,end) === quote` holds for exact/normalized hits).
import { wc } from "./lib.mjs";

/** Normalize with an index map back to raw offsets: smart quotes/dashes, md emphasis, footnote refs, ws. */
function normMap(raw) {
  let out = "";
  const map = [];
  let prevSpace = false;
  for (let i = 0; i < raw.length; i++) {
    let c = raw[i];
    // drop footnote markers [^12] / [12] / [12][13]
    if (c === "[") {
      const m = /^\[\^?\d+(?:[–-]\d+)?\]/.exec(raw.slice(i));
      if (m) { i += m[0].length - 1; continue; }
    }
    if (c === "*" || c === "_" || c === "`") continue;
    if (/[‘’‛′]/.test(c)) c = "'";
    else if (/[“”‟″]/.test(c)) c = '"';
    else if (/[–—−]/.test(c)) c = "-";
    else if (c === "…") { // … → ...
      for (const d of "...") { out += d; map.push(i); }
      prevSpace = false;
      continue;
    }
    if (/\s/.test(c)) {
      if (prevSpace) continue;
      c = " ";
      prevSpace = true;
    } else prevSpace = false;
    out += c;
    map.push(i);
  }
  return { out, map };
}
const norm = (s) => normMap(s).out.trim();
const words = (s) => norm(s).toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);

/** Candidate verbatim fragments from a quote/where string: quoted spans, split on ellipses. */
export function fragments(text) {
  const t = text.replace(/\s+/g, " ").trim();
  const quoted = [];
  const re = /[“"]([^”"]{8,}?)[”"]/g;
  let m;
  while ((m = re.exec(t))) quoted.push(m[1]);
  const base = quoted.length ? quoted : [t.replace(/\s*\([^()]*\)\s*$/, "")];
  const out = [];
  for (const q of base)
    for (const piece of q.split(/\s*(?:…|\.\.\.|\[…\]|\[\.\.\.\]|\[(?![\^\d])[^\]]*\])\s*/))
      if (words(piece).length >= 3) out.push(piece.trim().replace(/^[,;:.\s]+|[,;:\s]+$/g, ""));
  return out;
}

/** Map draft line numbers (1-based) to blocks. */
export function lineToBlock(md, blocks) {
  const lineStarts = [0];
  for (let i = 0; i < md.length; i++) if (md[i] === "\n") lineStarts.push(i + 1);
  return (line) => {
    const off = lineStarts[line - 1];
    if (off == null) return null;
    return blocks.find((b) => off >= b.startOffset - 1 && off <= b.endOffset) ?? null;
  };
}

/**
 * Resolve one fragment: exact (unique) → exact (multi) → normalized → fuzzy (word coverage ≥ 0.5).
 * Returns {method, anchor|null}.
 */
export function matchFragment(frag, blocks) {
  const hits = blocks.filter((b) => b.text.includes(frag));
  if (hits.length) {
    const b = hits[0];
    const s = b.text.indexOf(frag);
    return { method: hits.length === 1 ? "exact" : "exact_multi", len: frag.length,
      anchor: { blockId: b.blockId, quote: frag, startOffset: s, endOffset: s + frag.length, confidence: hits.length === 1 ? 1 : 0.85 } };
  }
  const nf = norm(frag);
  if (nf.length >= 12) {
    for (const b of blocks) {
      const { out, map } = normMap(b.text);
      const idx = out.indexOf(nf);
      if (idx >= 0) {
        const s = map[idx];
        const e = map[idx + nf.length - 1] + 1;
        return { method: "normalized", len: frag.length,
          anchor: { blockId: b.blockId, quote: b.text.slice(s, e), startOffset: s, endOffset: e, confidence: 0.9 } };
      }
    }
  }
  const q = words(frag);
  if (q.length >= 4) {
    let best = null;
    for (const b of blocks) {
      const bw = new Set(words(b.text));
      const cov = q.filter((w) => bw.has(w)).length / q.length;
      if (!best || cov > best.cov) best = { b, cov };
    }
    if (best && best.cov >= 0.6) {
      return { method: "fuzzy", len: frag.length, cov: best.cov,
        anchor: { blockId: best.b.blockId, quote: best.b.text.slice(0, Math.min(best.b.text.length, 200)), startOffset: 0,
          endOffset: Math.min(best.b.text.length, 200), confidence: Number(Math.min(0.8, best.cov * 0.8).toFixed(2)) } };
    }
  }
  return { method: "none", anchor: null };
}

const RANK = { exact: 4, exact_multi: 3, normalized: 3, fuzzy: 1, line: 0.5, none: 0 };
/** Best anchor over all fragments; optional line hint (governable-mind `l.N`). */
/** Body blocks only: drop everything from a References/Notes heading on (those blocks repeat quoted text). */
export function bodyBlocks(blocks) {
  const i = blocks.findIndex((b) => /^#{1,3}\s*(References|Notes|Endnotes|Bibliography|Sources)\b/i.test(b.text));
  return i < 0 ? blocks : blocks.slice(0, i);
}
export function anchorFor(text, allBlocks, { lineHint, md } = {}) {
  const blocks = bodyBlocks(allBlocks);
  const frs = fragments(text);
  let best = { method: "none", anchor: null, fragCount: frs.length };
  if (lineHint && md) {
    const hb = lineToBlock(md, allBlocks)(lineHint);
    if (hb) for (const f of frs) {
      const r = matchFragment(f, [hb]);
      if ((r.method === "exact" || r.method === "normalized") && (r.len ?? 0) > (best.len ?? 0)) best = { ...r, method: r.method, fragCount: frs.length };
    }
    if (best.anchor) return best;
  }
  for (const f of frs) {
    const r = matchFragment(f, blocks);
    if (RANK[r.method] > RANK[best.method] || (RANK[r.method] === RANK[best.method] && (r.len ?? 0) > (best.len ?? 0)))
      best = { ...r, fragCount: frs.length };
  }
  if ((best.method === "none" || best.method === "fuzzy") && lineHint && md) {
    const b = lineToBlock(md, blocks)(lineHint);
    if (b && best.method === "none")
      best = { method: "line", fragCount: frs.length,
        anchor: { blockId: b.blockId, quote: b.text.slice(0, Math.min(200, b.text.length)), startOffset: 0, endOffset: Math.min(200, b.text.length), confidence: 0.5 } };
    else if (b && best.anchor && best.anchor.blockId === b.blockId) best.anchor.confidence = Math.max(best.anchor.confidence, 0.75);
  }
  return best;
}

export const blocksOf = (md) => wc.splitMarkdownBlocks(md);
