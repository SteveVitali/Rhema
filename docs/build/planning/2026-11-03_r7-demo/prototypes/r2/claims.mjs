// Claim-ledger markdown → claimLedgerSidecar rows (prototype).
import { read, join, sections, sections3, boldBullets, links, normalizedUrl, CORPUS, exists } from "./lib.mjs";
import { anchorFor } from "./anchor.mjs";

const VERDICT_RE =
  /^(verified|substantially accurate|misleading(?: in context)?|unsupported|contradicted|unverifiable|skipped|\(not scored[^)]*\))/i;
const CANON = {
  verified: "verified", "substantially accurate": "substantially_accurate", misleading: "misleading_in_context",
  "misleading in context": "misleading_in_context", unsupported: "unsupported", contradicted: "contradicted",
  unverifiable: "unverifiable",
};
const STANCE = { verified: "supports", substantially_accurate: "supports", contradicted: "contradicts",
  misleading_in_context: "contextualizes", unsupported: "contextualizes", unverifiable: "contextualizes" };

// ID grammar: C12, C23a, P4, III16, VII3-scope, XV2; optional trailing parenthetical.
const HEAD_RE = /^([A-Z]+\d+[a-z]?(?:-[a-z]+)?)\s*(\([^)]*\))?\s*·\s*Tier\s+(\d)([^·]*)·\s*(.+)$/;
const HEAD_NOVERDICT_RE = /^([A-Z]+\d+[a-z]?(?:-[a-z]+)?)\s*·\s*Tier\s+(\d)\s*(\([^)]*\))?\s*$/;

export function ledgerDate(md) {
  const m = /(?:Verified|Checked)\s+(\d{4}-\d{2}-\d{2})/.exec(md) ?? /\b(20\d\d-\d\d-\d\d)\b/.exec(md.split("\n").slice(0, 12).join("\n"));
  return m ? m[1] : null;
}

/** Source-note slug → URL lookup across the project's research dirs ("(reused note: slug)"). */
export function noteUrlIndex(slug) {
  const idx = new Map();
  for (const who of ["editor", "author"]) {
    const dir = join(CORPUS, slug, "agents", who, "research", "sources");
    if (!exists(dir)) continue;
    return (s) => {
      for (const w of ["editor", "author"]) {
        const p = join(CORPUS, slug, "agents", w, "research", "sources", s + ".md");
        if (exists(p)) {
          const m = /\bhttps?:\/\/[^\s)·>]+/.exec(read(p));
          if (m) return m[0];
        }
      }
      return null;
    };
  }
  return () => null;
}

export function parseClaimLedger(md, { slug, draftMd, blocks }) {
  const date = ledgerDate(md);
  const accessedAt = date ? `${date}T00:00:00Z` : undefined;
  const noteUrl = noteUrlIndex(slug);
  const entries = [];
  const failures = [];
  const byId = new Map();
  for (const sec of sections3(md)) {
    const h = sec.heading;
    if (/^(Skipped|Reference checks)/i.test(h)) continue;
    let m = HEAD_RE.exec(h);
    let id, paren, tier, tierExtra, verdictText;
    if (m) [, id, paren, tier, tierExtra, verdictText] = m;
    else {
      failures.push({ kind: "heading_unparsed", heading: h });
      continue;
    }
    tier = Number(tier);
    const escal = /escalated to Tier (\d)/i.exec(tierExtra);
    if (escal) tier = Number(escal[1]);
    const vm = VERDICT_RE.exec(verdictText.trim());
    let verdict = vm ? CANON[vm[1].toLowerCase()] : undefined;
    let verdictQualifier = vm ? verdictText.trim().slice(vm[1].length).trim() : verdictText;
    let skipped = false;
    if (vm && (/^skipped/i.test(vm[1]) || /^\(not scored/i.test(vm[1]))) {
      verdict = "unverifiable"; // fixture precedent (constitution-of-reason C37)
      skipped = true;
    }
    if (!verdict) failures.push({ kind: "verdict_unmapped", heading: h });
    const quoteLines = sec.body.split("\n").filter((l) => l.startsWith(">")).map((l) => l.replace(/^>\s?/, ""));
    const quote = quoteLines.join(" ").trim();
    if (!quote) failures.push({ kind: "no_quote", heading: h });
    const bullets = boldBullets(sec.body);
    const get = (re) => bullets.filter((b) => re.test(b.label)).map((b) => b.text).join(" ");
    const finding = get(/^Finding/i), evidence = get(/^Evidence/i), fix = get(/^Fix/i);
    const otherLabels = bullets.map((b) => b.label).filter((l) => !/^(Finding|Evidence|Fix)/i.test(l));
    if (!finding) failures.push({ kind: "no_finding_bullet", heading: h });
    if (!evidence) failures.push({ kind: "no_evidence_bullet", heading: h });
    // evidence urls: explicit links + reused-note slugs + "as in <ID>" back-references
    let ev = links(evidence).map((l) => ({ url: l.url, label: l.label, via: "link" }));
    for (const r of evidence.matchAll(/reused notes?:\s*([a-z0-9\-;,\s]+)/gi))
      for (const s of r[1].split(/[;,]\s*/).map((x) => x.trim()).filter(Boolean)) {
        const u = noteUrl(s);
        ev.push(u ? { url: u, label: s, via: "note" } : { url: null, label: s, via: "note_unresolved" });
      }
    const asIn = /\bas in ([A-Z]+\d+[a-z]?)\b/.exec(evidence);
    if (asIn && byId.has(asIn[1])) ev.push(...byId.get(asIn[1]).ev.map((e) => ({ ...e, via: "as_in" })));
    ev = ev.filter((e, i, a) => e.url && a.findIndex((x) => x.url === e.url) === i);
    const lineHint = (() => { const lm = /\(l\.(\d+)/.exec(quote); return lm ? Number(lm[1]) : undefined; })();
    const anchorRes = quote ? anchorFor(quote, blocks, { lineHint, md: draftMd }) : { method: "none", anchor: null };
    const stance = STANCE[verdict] ?? "contextualizes";
    const sources = accessedAt
      ? ev.map((e) => ({ url: e.url, normalizedUrl: normalizedUrl(e.url), accessedAt, stance }))
      : [];
    const row = {
      ordinal: entries.length,
      text: quote.replace(/\s*\((?:[^()]|\([^()]*\))*\)\s*$/, "").trim() || quote,
      tier,
      verdict,
      ...(sources[0] ? { url: sources[0].url, normalizedUrl: sources[0].normalizedUrl, accessedAt } : {}),
      note: [fix && `Fix: ${fix}`, finding && `Finding: ${finding}`].filter(Boolean).join("\n\n").slice(0, 8000) || undefined,
      ...(sources.length ? { sources } : {}),
      ...(anchorRes.anchor ? { anchor: anchorRes.anchor } : {}),
      humanAdded: false,
    };
    const meta = { id, paren, verdictQualifier, skipped, otherLabels, evCount: ev.length, anchorMethod: anchorRes.method, lineHint, ev };
    byId.set(id, meta);
    entries.push({ row, meta });
  }
  return { date, entries, failures };
}
