// editors-letter.md + 05-second-read.md → findings/rubric (prototype).
import { sections, sections3, boldBullets, links } from "./lib.mjs";

export const DIM = {
  "thesis & contribution": "thesis_contribution", "argument rigor": "argument_rigor",
  "evidence & accuracy": "evidence_accuracy", "originality & situatedness": "originality_situatedness",
  structure: "structure", prose: "prose", "voice & audience fit": "voice_audience_fit",
  "intellectual honesty": "intellectual_honesty",
};
// rubric dim → finding kind (declared rule; dims are the letter's own cross-reference)
const DIM_KIND = { thesis_contribution: "argument", argument_rigor: "argument", evidence_accuracy: "claim",
  originality_situatedness: "discourse", structure: "structure", prose: "craft", voice_audience_fit: "voice",
  intellectual_honesty: "argument" };

const strip = (s) => s.replace(/\s+/g, " ").trim();

function topBullets(body) {
  // "- " items (top-level), with continuation lines; returns raw text
  const out = [];
  let cur = null;
  for (const line of body.split("\n")) {
    const lm = /^(?:- |\d+\. )(.*)$/.exec(line);
    if (lm) { cur = { text: lm[1] }; out.push(cur); }
    else if (cur && /^\s+\S/.test(line)) cur.text += "\n" + line;
    else if (line.trim() === "") cur = null;
  }
  return out.map((b) => b.text);
}
function boldLead(t) {
  const m = /^\*\*(.+?)\*\*[:.]?\s*([\s\S]*)$/.exec(t.trim());
  return m ? { title: m[1].replace(/[:.]$/, ""), rest: m[2] } : { title: null, rest: t };
}

export function parseLetter(md) {
  const h2 = sections(md, 2);
  const get = (re) => h2.find((s) => re.test(s.heading));
  const fails = [];
  const verdictSec = get(/^Verdict/i);
  const verdictWord = verdictSec ? (/^\*\*(.+?)\*\*/m.exec(verdictSec.body)?.[1] ?? null) : null;
  const oneThing = verdictSec ? (/\*\*The one thing:?\*\*:?\s*([\s\S]*?)(?:\n\n|$)/i.exec(verdictSec.body)?.[1] ?? null) : null;
  if (!oneThing) fails.push("no_one_thing");
  const strengths = (get(/^Strengths/i) ? topBullets(get(/^Strengths/i).body) : []).map(boldLead);
  const majorsSec = get(/^Major issues/i);
  const majors = [];
  if (majorsSec) {
    for (const s of sections3("### x\n" + majorsSec.body).slice(1)) {
      const m = /^(\d+)\.\s+(.+)$/.exec(s.heading);
      if (!m) { fails.push(`major_heading:${s.heading}`); continue; }
      const bl = boldBullets(s.body);
      const pick = (re) => bl.filter((b) => re.test(b.label)).map((b) => b.text.trim()).join("\n\n");
      const where = pick(/^Where/i), problem = pick(/^(?!Where|Why it matters|Direction)/i), why = pick(/^Why it matters/i), direction = pick(/^Direction/i);
      const missing = ["where", "problem", "why", "direction"].filter((k, i) => ![where, problem, why, direction][i]);
      if (missing.length) fails.push(`major_${m[1]}_missing:${missing.join(",")}`);
      const labels = bl.map((b) => b.label);
      majors.push({ n: Number(m[1]), title: m[2].trim(), where, problem, why, direction, labels });
    }
  } else fails.push("no_major_section");
  const minors = (get(/^Minor issues/i) ? topBullets(get(/^Minor issues/i).body) : []).map(boldLead);
  const lineNotes = (get(/^Line notes/i) ? topBullets(get(/^Line notes/i).body) : []).map(boldLead);
  const considered = [];
  { const sec = get(/^Considered and rejected/i); let mode = null;
    if (sec) for (const para of sec.body.split(/\n(?=- |\d+\. )|\n\n/)) {
      const t = para.trim(); if (!t) continue;
      if (!/^(- |\d+\. )/.test(t)) { if (/second read/i.test(t)) mode = "second_read"; else if (/own deliberation|not raised as a finding/i.test(t)) mode = "editor"; continue; }
      const b = boldLead(t.replace(/^(- |\d+\. )/, "")); b.from = /^\W*second read/i.test(b.title ?? "") ? "second_read" : mode; considered.push(b); } }
  const roadmapSec = get(/^Revision roadmap/i);
  const roadmapItems = roadmapSec ? (roadmapSec.body.match(/^\d+\.\s+\*\*/gm) ?? []).length : 0;
  // scorecard
  const sc = get(/^Scorecard/i);
  const dims = [];
  if (sc) {
    for (const line of sc.body.split("\n")) {
      const m = /^\|\s*([^|]+?)\s*\|\s*(\d)\s*\|\s*(.+?)\s*\|\s*$/.exec(line);
      if (!m) continue;
      const dim = DIM[m[1].toLowerCase()];
      if (!dim) { fails.push(`dim_unmapped:${m[1]}`); continue; }
      const basis = m[3];
      const capped = /\bcap(?:ped)?\b|by rule|rubric cap/i.test(basis);
      const cites = [...basis.matchAll(/(?:Major issues?|MI)\s*((?:\d+[a-z]?(?:\s*(?:,|and|&)\s*)?)+)/gi)]
        .flatMap((x) => x[1].split(/\s*(?:,|and|&)\s*/).map((n) => parseInt(n, 10)).filter(Number.isFinite));
      dims.push({ dimension: dim, score: Number(m[2]), basis, capped, cites: [...new Set(cites)] });
    }
  } else fails.push("no_scorecard");
  const fc = get(/^Fact-check summary/i);
  return { verdictWord, oneThing, strengths, majors, minors, lineNotes, considered, roadmapItems, dims, fails,
    hasFactCheck: !!fc, h2: h2.map((s) => s.heading) };
}

export function parseSecondRead(md) {
  const h2 = sections(md, 2);
  const obj = h2.find((s) => /objection/i.test(s.heading));
  const str = h2.find((s) => /strongest/i.test(s.heading));
  const ver = h2.find((s) => /verdict/i.test(s.heading));
  const items = (sec) => (sec ? sections3("### x\n" + sec.body).slice(1).map((s) => {
    const m = /^(?:Objection\s+(\d+)|Strength\s+(\d+)|\(([ivx]+|[a-z])\)|(\d+\.\d+))[:.]?\s*(.*)$/i.exec(s.heading);
    return { label: m ? (m[1] ?? m[2] ?? m[3] ?? m[4]) : null, title: m ? m[5] : s.heading, body: strip(s.body) };
  }) : []);
  const objections = items(obj), strengths = items(str);
  return { objections, strengths, verdict: ver ? (/\*\*(.+?)\*\*/.exec(ver.body)?.[1] ?? ver.heading.replace(/^\d+\.\s*Verdict:?\s*/i, "")) : null,
    unlabeled: [...objections, ...strengths].filter((o) => !o.label).length };
}

const STOP = new Set("the a an and or of to in is it its that this as on for with by be are was not no but from at which what essay piece draft section own one their they its has have".split(" "));
const toks = (s) => new Set(s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter((w) => w.length > 3 && !STOP.has(w)));
export function overlap(a, b) {
  const A = toks(a), B = toks(b);
  let i = 0;
  for (const w of A) if (B.has(w)) i++;
  return i / Math.max(1, Math.min(A.size, B.size));
}

/** Second-read reconciliation (declared rule): an objection whose text overlaps a major ≥ T is `both`. */
export function reconcile(letter, sr, T = 0.3) {
  return sr.objections.map((o) => {
    const lab = o.label.replace(".", "\\.");
    const explicit = letter.majors.find((m) => new RegExp(`second read(?:er)?(?:'s)?(?: objection)?\\s*\\(?${lab}\\)?(?![\\d.])`, "i").test(m.labels.join(" ") + " " + m.where + " " + m.problem));
    const scores = letter.majors.map((m) => ({ n: m.n, s: overlap(o.title + " " + o.body.slice(0, 900), m.title + " " + m.problem.slice(0, 900)) }));
    scores.sort((x, y) => y.s - x.s);
    const best = scores[0];
    const rej = letter.considered.find((c) => (c.from === "second_read" || /second read|second reader/i.test((c.title ?? "") + c.rest)) &&
      (new RegExp(`(?:objection|obj\\.?)\\s*\\(?${o.label}\\)?\\b`, "i").test(c.title + " " + c.rest) || overlap(o.title, c.title + " " + c.rest.slice(0, 300)) >= 0.35));
    return { label: o.label, title: o.title.slice(0, 90), best: best?.n, score: best ? Number(best.s.toFixed(2)) : 0, second: scores[1] ? Number(scores[1].s.toFixed(2)) : 0,
      explicit: explicit?.n ?? null,
      merged: !!explicit || (!!best && best.s >= 0.15 && best.s >= 2 * (scores[1]?.s ?? 0)), rejectedIn: rej ? rej.title.slice(0, 70) : null };
  });
}

export function majorKind(major, dims) {
  const ds = dims.filter((d) => d.cites.includes(major.n)).map((d) => d.dimension);
  if (ds.length) return { kind: DIM_KIND[ds[0]], rubricDims: [...new Set(ds)], via: "scorecard" };
  const t = (major.title + " " + major.problem).toLowerCase();
  const kw = [["claim", /contradicted|misleading|ledger [a-z]*\d|wrong at|count of what/], ["discourse", /conversation|predecessor|uncited|situat|field it does not know|cit(e|ation)/],
    ["structure", /too long|proportion|length|genre|manual|structure|front-loaded/], ["craft", /aphorism|cadence|prose/], ["argument", /./]];
  return { kind: kw.find(([, re]) => re.test(t))[0], rubricDims: [], via: "keyword" };
}
export { links };
