import { read, join, CORPUS, ls, sections, tables } from "./lib.mjs";

const FIELDS = ["URL", "Accessed", "What it establishes", "Key passages", "Reliability", "Relevance"];
const out = [];
const failSamples = [];
for (const slug of ["the-politics-of-visibility", "structure-of-political-difference", "constitution-of-reason", "the-governable-mind"]) {
  for (const who of ["author", "editor"]) {
    const dir = join(CORPUS, slug, "agents", who, "research", "sources");
    const files = ls(dir);
    if (!files.length) continue;
    const agg = { files: files.length, full: 0, urlAndDate: 0, urlOnly: 0, none: 0, fieldHits: Object.fromEntries(FIELDS.map((f) => [f, 0])),
      utm: 0, jina: 0, multiUrl: 0 };
    for (const f of files) {
      const t = read(join(dir, f));
      const has = (lab) => new RegExp(`\\*\\*${lab}[^*]*:?\\*\\*`, "i").test(t);
      const hits = FIELDS.filter(has);
      for (const h of hits) agg.fieldHits[h]++;
      const url = /\bhttps?:\/\/\S+/.test(t);
      const date = /\b20\d\d-\d\d-\d\d\b/.test(t);
      if (hits.length === FIELDS.length) agg.full++;
      else if (url && date) { agg.urlAndDate++; if (failSamples.length < 6 && who === "editor") failSamples.push(`${slug}/${who}/${f}: ${t.split("\n").slice(0, 3).join(" ⏎ ").slice(0, 160)}`); }
      else if (url) agg.urlOnly++;
      else agg.none++;
      if (/utm_source=chatgpt/.test(t)) agg.utm++;
      if (/r\.jina\.ai/.test(t)) agg.jina++;
      if ((t.match(/https?:\/\//g) ?? []).length > 1) agg.multiUrl++;
    }
    out.push({ slug, who, ...agg });
  }
}
console.log(JSON.stringify(out, null, 1));
console.log(failSamples.join("\n"));
// drafter claim ledgers (03-claim-ledger.md)
for (const slug of ["the-politics-of-visibility", "the-governable-mind"]) {
  const md = read(join(CORPUS, slug, "agents/author/drafting/v1/03-claim-ledger.md"));
  const h3 = sections(md, 3).filter((s) => /^C\d+/.test(s.heading));
  const tb = tables(md).flatMap((t) => t.slice(1)).filter((r) => /^C\d+/.test(r[0] ?? ""));
  const verdictOf = (s) => /\b(Verified|Substantially accurate|Misleading|Unsupported|Contradicted|Unverifiable|Rescoped|Do not use)/i.exec(s)?.[1];
  const v1 = h3.map((s) => verdictOf(/\*\*Verdict:\*\*\s*(.*)/.exec(s.body)?.[1] ?? "")).filter(Boolean).length;
  const v2 = tb.map((r) => verdictOf(r[3] ?? "")).filter(Boolean).length;
  const ids = [...h3.map((s) => /^(C\d+[a-z]?)/.exec(s.heading)[1]), ...tb.map((r) => r[0])];
  console.log(`03-claim-ledger ${slug}: h3=${h3.length} verdict=${v1} | tableRows=${tb.length} verdict=${v2} | uniqueIds=${new Set(ids).size} | linkedUrls=${(md.match(/https?:\/\//g) ?? []).length}`);
}
