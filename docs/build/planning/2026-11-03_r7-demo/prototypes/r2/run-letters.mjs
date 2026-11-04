import { writeFileSync } from "node:fs";
import { read, join, CORPUS, ROUNDS, parsers } from "./lib.mjs";
import { blocksOf, anchorFor } from "./anchor.mjs";
import { parseLetter, parseSecondRead, reconcile, majorKind, links } from "./letter.mjs";

const OUT = new URL("./out/", import.meta.url).pathname;
const summary = [];
const anchorAgg = {};
for (const r of ROUNDS) {
  const dir = join(CORPUS, r.slug, "correspondence", `${r.round}-review`);
  const L = parseLetter(read(join(dir, "editors-letter.md")));
  const SR = parseSecondRead(read(join(dir, "05-second-read.md")));
  const draftMd = read(join(CORPUS, r.slug, "drafts", `${r.reviewed}.md`));
  const blocks = blocksOf(draftMd);
  const date = /reviewed (\d{4}-\d{2}-\d{2})|(\d{4}-\d{2}-\d{2})/.exec(read(join(dir, "editors-letter.md")))?.slice(1).find(Boolean);
  const accessed = date ? `${date}T00:00:00Z` : "1970-01-01T00:00:00Z";
  const rec = reconcile(L, SR);
  const findings = [];
  const am = {}; const majAm = {};
  const push = (f, anchorText, lineHint) => {
    let anchor = null, method = "n/a";
    if (anchorText) {
      const a = anchorFor(anchorText, blocks, { lineHint, md: draftMd });
      anchor = a.anchor; method = a.method;
    }
    am[method] = (am[method] ?? 0) + 1;
    if (f.letterSection === "major") { majAm[method] = (majAm[method] ?? 0) + 1; }
    findings.push({ ordinal: findings.length, anchor, ...f });
  };
  // the one thing — severity per proposed rule: blocking
  if (L.oneThing) push({ kind: "argument", severity: "blocking", origin: "editor", title: "The one thing", body: L.oneThing.slice(0, 4096), letterSection: "one_thing" }, L.oneThing);
  const bodyLens = [];
  for (const m of L.majors) {
    const k = majorKind(m, L.dims);
    const merged = rec.filter((x) => x.merged && (x.explicit ?? x.best) === m.n);
    const body = [m.problem && `**The problem:** ${m.problem}`, m.why && `**Why it matters here:** ${m.why}`, m.direction && `**Direction:** ${m.direction}`].filter(Boolean).join("\n\n");
    bodyLens.push(body.length);
    const urls = links(m.problem + " " + m.direction).map((l) => ({ url: l.url, accessed }));
    const lh = /\bl\.(\d+)/.exec(m.where)?.[1];
    push({ kind: k.kind, severity: "major", origin: merged.length ? "both" : "editor", ...(merged.length ? { reconciliation: "kept" } : {}),
      title: m.title, body: body.length > 4096 ? body.slice(0, 4093) + "…" : body, rubricDims: k.rubricDims, letterSection: "major",
      ...(urls.length ? { evidence: { urls } } : {}) }, m.where, lh ? Number(lh) : undefined);
  }
  for (const s of L.strengths) push({ kind: "craft", severity: "note", origin: "editor", title: s.title ?? s.rest.slice(0, 80), body: s.rest.slice(0, 4096), letterSection: "strength" }, s.rest);
  for (const mi of L.minors) {
    const t = (mi.title ?? "") + " " + mi.rest;
    const kind = /ledger c\d|ref \[|\(c\d+\)|quote|citation|cite/i.test(t) ? "claim" : "craft";
    push({ kind, severity: "minor", origin: "editor", title: (mi.title ?? mi.rest.slice(0, 80)).slice(0, 200), body: mi.rest.slice(0, 4096) }, t);
  }
  for (const ln of L.lineNotes) push({ kind: "craft", severity: "note", origin: "editor", title: (ln.title ?? ln.rest.slice(0, 80)), body: ln.rest.slice(0, 4096) }, ln.rest);
  for (const o of SR.objections) {
    const rr = rec.find((x) => x.label === o.label);
    if (rr?.merged) continue; // folded into the major (origin both)
    push({ kind: "argument", severity: rr?.rejectedIn ? "note" : "minor", origin: "second_read", reconciliation: rr?.rejectedIn ? "rejected" : "kept",
      title: o.title.slice(0, 200), body: o.body.slice(0, 4096), ...(rr?.rejectedIn ? { letterSection: "considered_rejected" } : {}) }, o.body);
  }
  for (const c of L.considered) {
    if (c.from === "second_read") continue; // represented via the objection row
    push({ kind: "argument", severity: "note", origin: "editor", title: (c.title ?? c.rest.slice(0, 80)).slice(0, 200), body: c.rest.slice(0, 4096), letterSection: "considered_rejected" }, null);
  }
  const fs = { sidecar: "findings", version: 1, findings };
  const rubric = { sidecar: "rubric", version: 1, dimensions: L.dims.map((d) => ({ dimension: d.dimension, score: d.score,
    ...(d.capped ? { cap: { at: Math.min(4, d.score), reason: d.basis.slice(0, 500), ...(d.cites[0] ? { entailedByFindingOrdinal: findings.find((f) => f.letterSection === "major" && f.title === L.majors.find((m) => m.n === d.cites[0])?.title)?.ordinal } : {}) } } : {}) })) };
  const vf = parsers.parseSidecar("findings.json", { json: fs });
  const vr = parsers.parseSidecar("rubric.json", { json: rubric });
  writeFileSync(join(OUT, `${r.slug}.${r.round}.findings.json`), JSON.stringify(fs, null, 1));
  writeFileSync(join(OUT, `${r.slug}.${r.round}.rubric.json`), JSON.stringify(rubric, null, 1));
  for (const [k, n] of Object.entries(am)) anchorAgg[k] = (anchorAgg[k] ?? 0) + n;
  summary.push({ key: `${r.slug}/${r.round}`, verdict: L.verdictWord, oneThing: !!L.oneThing, majors: L.majors.length,
    majorLabelsSeen: [...new Set(L.majors.flatMap((m) => m.labels))], strengths: L.strengths.length, minors: L.minors.length,
    lineNotes: L.lineNotes.length, considered: L.considered.length, roadmapItems: L.roadmapItems, dims: L.dims.length,
    capped: L.dims.filter((d) => d.capped).map((d) => d.dimension), kinds: L.majors.map((m) => majorKind(m, L.dims)).map((k) => `${k.kind}/${k.via}`),
    majorBodyMax: Math.max(...bodyLens), over4096: bodyLens.filter((n) => n > 4096).length, fails: L.fails, h2: L.h2,
    sr: { objections: SR.objections.length, strengths: SR.strengths.length, unlabeled: SR.unlabeled, verdict: SR.verdict }, rec,
    findings: findings.length, anchors: am, majorAnchors: majAm, findingsSchema: vf.parseStatus, rubricSchema: vr.parseStatus,
    errs: [...(vf.errors ?? []), ...(vr.errors ?? [])].slice(0, 4) });
}
console.log(JSON.stringify(summary, null, 1));
console.log("ANCHORS", anchorAgg);
