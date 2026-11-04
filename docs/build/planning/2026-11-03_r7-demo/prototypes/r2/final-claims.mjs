import { read, join, CORPUS, ROUNDS } from "./lib.mjs";
import { blocksOf } from "./anchor.mjs";
import { parseClaimLedger } from "./claims.mjs";
const norm = (s) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
for (const r of ROUNDS) {
  const md = read(join(CORPUS, r.slug, "correspondence", `${r.round}-review`, "01-claim-ledger.md"));
  const draftMd = read(join(CORPUS, r.slug, "drafts", `${r.reviewed}.md`)); const blocks = blocksOf(draftMd);
  const res = parseClaimLedger(md, { slug: r.slug, draftMd, blocks });
  const m = {}; let fuzzyShingle = 0, fuzzyN = 0; const t1c = [];
  for (const e of res.entries) {
    m[e.meta.anchorMethod] = (m[e.meta.anchorMethod] ?? 0) + 1;
    if (e.meta.anchorMethod === "fuzzy") { fuzzyN++;
      const b = norm(blocks.find((b) => b.blockId === e.row.anchor.blockId).text); const w = norm(e.row.text).split(" ");
      let ok = false; for (let i = 0; i + 5 <= w.length; i++) if (b.includes(w.slice(i, i + 5).join(" "))) { ok = true; break; } if (ok) fuzzyShingle++; }
    if (e.row.tier === 1 && ["contradicted","misleading_in_context"].includes(e.row.verdict)) t1c.push(`${e.meta.id}:${e.row.verdict}`);
  }
  const ev = res.entries.reduce((s, e) => s + e.meta.evCount, 0);
  const viaNote = res.entries.reduce((s, e) => s + e.meta.ev.filter((x) => x.via === "note").length, 0);
  const sources = res.entries.reduce((s, e) => s + (e.row.sources?.length ?? 0), 0);
  console.log(`${r.slug}/${r.round} n=${res.entries.length} date=${res.date}`, JSON.stringify(m), `fuzzy5shingle=${fuzzyShingle}/${fuzzyN}`, `sources=${sources} viaNote=${viaNote}`, `T1 C/M: ${t1c.join(",")}`, `noUrl=${res.entries.filter(e=>!e.row.url).length}`);
}
