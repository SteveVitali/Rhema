import { writeFileSync } from "node:fs";
import { read, join, CORPUS, ROUNDS, parsers, pct, ls, sections } from "./lib.mjs";
import { blocksOf } from "./anchor.mjs";
import { parseClaimLedger } from "./claims.mjs";

const OUT = new URL("./out/", import.meta.url).pathname;
const report = [];
const files = [];
for (const r of ROUNDS) {
  const dir = join(CORPUS, r.slug, "correspondence", `${r.round}-review`);
  for (const f of ls(dir).filter((f) => f.startsWith("01-claim-ledger"))) files.push({ ...r, f, path: join(dir, f) });
}
const allMethods = {};
for (const x of files) {
  const md = read(x.path);
  const draftMd = read(join(CORPUS, x.slug, "drafts", `${x.reviewed}.md`));
  const blocks = blocksOf(draftMd);
  const res = parseClaimLedger(md, { slug: x.slug, draftMd, blocks });
  const headCount = sections(md, 3).filter((s) => !/^(Skipped|Reference checks)/i.test(s.heading)).length;
  const methods = {};
  for (const e of res.entries) methods[e.meta.anchorMethod] = (methods[e.meta.anchorMethod] ?? 0) + 1;
  const verdicts = {};
  for (const e of res.entries) verdicts[e.row.verdict] = (verdicts[e.row.verdict] ?? 0) + 1;
  const sidecar = { sidecar: "claim_ledger", version: 1, inventoryCount: res.entries.length, claims: res.entries.map((e) => e.row) };
  const v = parsers.parseSidecar("01-claim-ledger.json", { json: sidecar });
  const skippedBullets = (md.match(/^- \*\*[A-Z]+\d+[a-z]? · Tier \d\*\*/gm) ?? []).length;
  const noEv = res.entries.filter((e) => e.meta.evCount === 0).map((e) => e.meta.id);
  const qual = res.entries.filter((e) => e.meta.verdictQualifier).map((e) => `${e.meta.id}: ${e.meta.verdictQualifier}`);
  const other = [...new Set(res.entries.flatMap((e) => e.meta.otherLabels))];
  const ids = res.entries.map((e) => e.meta.id);
  const dupIds = ids.filter((id, i) => ids.indexOf(id) !== i);
  report.push({
    file: `${x.slug}/${x.round}/${x.f}`, headings: headCount, parsed: res.entries.length, rate: pct(res.entries.length, headCount),
    failures: res.failures, verdicts, anchors: methods, noEvidenceUrl: noEv, qualifiers: qual.length, qualSample: qual.slice(0, 4),
    otherBulletLabels: other, skippedBullets, dupIds,
    schema: v.parseStatus, errors: v.parseStatus === "failed" ? v.errors.slice(0, 5) : undefined,
  });
  for (const [k, n] of Object.entries(methods)) allMethods[k] = (allMethods[k] ?? 0) + n;
  writeFileSync(join(OUT, `${x.slug}.${x.round}.${x.f.replace(".md", ".json")}`), JSON.stringify(sidecar, null, 1));
  // keep unmatched samples for the taxonomy
  writeFileSync(join(OUT, `${x.slug}.${x.round}.${x.f.replace(".md", ".unanchored.txt")}`),
    res.entries.filter((e) => e.meta.anchorMethod === "none" || e.meta.anchorMethod === "fuzzy" || e.meta.anchorMethod === "line")
      .map((e) => `${e.meta.id} [${e.meta.anchorMethod}] ${e.row.text.slice(0, 300)}`).join("\n"));
}
console.log(JSON.stringify(report, null, 1));
console.log("ALL", allMethods);
