import { writeFileSync } from "node:fs";
import { read, join, CORPUS, parsers, draftLedger, sections, tables, exists, ls, basename } from "./lib.mjs";

const OUT = new URL("./out/", import.meta.url).pathname;
const res = [];
for (const slug of ["the-politics-of-visibility", "the-governable-mind"]) {
  const d = join(CORPUS, slug, "agents", "author", "drafting", "v1");
  const sp = read(join(d, "02-structure-plan.md"));
  const h2 = sections(sp, 2);
  const spineSec = h2.find((s) => /^The spine/i.test(s.heading));
  const spine = [];
  for (const m of (spineSec?.body ?? "").split(/\n(?=\d+\.\s)/)) {
    const mm = /^(\d+)\.\s+([\s\S]+)$/.exec(m.trim());
    if (mm) spine.push(mm[2].replace(/\s+/g, " ").replace(/\s*\*\([^)]*\)\*\s*$/, "").trim());
  }
  const mapSec = h2.find((s) => /^Section map/i.test(s.heading));
  const [head, ...rows] = tables(mapSec?.body ?? "")[0] ?? [[]];
  const ci = (re) => head.findIndex((h) => re.test(h));
  const iRef = 0, iT = ci(/^(Title|Header)/i), iF = ci(/^Function/i), iB = ci(/^Budget/i);
  const sections_ = rows.filter((r) => (r[iT] ?? "").trim() && !/^\*\*Total/.test(r[iB] ?? "") && !/Total/.test(r.join(""))).map((r, i) => {
    const words = Number(String(r[iB] ?? "").replace(/[^\d]/g, ""));
    return { ref: r[iRef] && r[iRef] !== "—" ? r[iRef] : `S${i}`, title: r[iT].replace(/\*+/g, "").trim(), ...(Number.isFinite(words) && words > 0 ? { targetWords: words } : {}),
      ...(r[iF] ? { purpose: r[iF] } : {}) };
  });
  const plan = { sidecar: "structure_plan", version: 1, spine, sections: sections_ };
  const vp = parsers.parseSidecar("structure-plan.json", { json: plan });
  writeFileSync(join(OUT, `${slug}.structure-plan.json`), JSON.stringify(plan, null, 1));
  const dl = read(join(d, "04-draft-ledger.md"));
  const rhemaRows = draftLedger.parseDraftLedgerSections(dl);
  const mdRows = (tables(sections(dl, 2).find((s) => /^Sections/i.test(s.heading))?.body ?? "")[0] ?? []).slice(1);
  // other drafting artifacts
  const others = ls(d).map((f) => basename(f));
  res.push({ slug, spine: spine.length, sectionRows: rows.length, sections: sections_.length, refs: sections_.map((s) => s.ref).join(","),
    budgetsParsed: sections_.filter((s) => s.targetWords).length, planSchema: vp.parseStatus, planErr: vp.errors?.slice(0, 3),
    draftLedgerRows: mdRows.length, rhemaParserRows: rhemaRows.length, rhemaParserOrdinals: rhemaRows.map((r) => r.ordinal), draftingFiles: others });
}
console.log(JSON.stringify(res, null, 1));
