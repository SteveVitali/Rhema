// agents/author/ledgers/*-response-ledger.md → response-ledger rows + moves (prototype).
import { sections, tables } from "./lib.mjs";

const KIND = [
  [/^accept/i, "accept"], [/^adapt/i, "adapt"], [/^rebut/i, "rebut"], [/^defer/i, "defer"], [/^escalate/i, "escalate"],
  [/^decline/i, "rebut"], [/^constraint/i, "accept"], [/^duplicates?/i, "accept"],
];
const SKIP_KIND = /^(mapping only|\(causes\))/i;
const STATUS = [
  [/^\**done/i, "done"], [/^\**verified/i, "verified"], [/^\**deferred/i, "deferred"], [/^\**(escalated|awaiting)/i, "escalated"],
  [/^\**honou?red/i, "honored"], [/^\**partial/i, "open"], [/^\**open/i, "open"], [/^\**resolved/i, "done"], [/^\**mooted/i, "mooted"],
  [/^\**pending/i, "open"],
];
export function mapKind(t) {
  if (SKIP_KIND.test(t.trim())) return { skip: true };
  const k = KIND.find(([re]) => re.test(t.trim()));
  return k ? { kind: k[1], exact: new RegExp(`^${k[1]}$`, "i").test(t.trim()) } : { kind: null };
}
export function mapStatus(t) {
  const s = STATUS.find(([re]) => re.test(t.trim()));
  return s ? { status: s[1], exact: /^(done|verified|deferred|escalated|honored|open|mooted)$/i.test(t.trim()) } : { status: null };
}

/** Classify a Source cell → which letter/second-read object it answers. */
export function resolveSource(src) {
  const s = src.replace(/\*/g, "");
  let m;
  if ((m = /(?:Letter|L)\s*(?:§\s*)?(?:Major|MI)\s*(\d+)/i.exec(s))) return { type: "major", n: Number(m[1]) };
  if (/(?:Letter|L)\s*(?:§\s*)?minor|^Minor\b/i.test(s)) return { type: "minor" };
  if ((m = /(?:second read|2nd read|SR)\s*(?:Obj(?:ection)?\s*)?\(?([ivx]+|\d+(?:\.\d+)?)\)?/i.exec(s))) return { type: "second_read", label: m[1] };
  if (/open q(?:uestion)?\.?|OQ\b|roadmap|RM \d/i.test(s)) return { type: "roadmap" };
  if (/line note|CN\b|craft/i.test(s)) return { type: "line_note" };
  if (/considered and rejected/i.test(s)) return { type: "considered" };
  if (/(?:claim )?ledger|CL\b|\bC\d+\b|ref hygiene/i.test(s)) return { type: "claim_ledger" };
  if (/discourse|DR\b|legal report|policy report/i.test(s)) return { type: "discourse_report" };
  if (/argument notes|AN\b/i.test(s)) return { type: "argument_notes" };
  if (/self|^S$|gap/i.test(s)) return { type: "self" };
  if (/reception|scorecard/i.test(s)) return { type: "other_letter" };
  return { type: "unknown" };
}

export function parseResponseLedger(md) {
  const h2 = sections(md, 2);
  const rows = [];
  const fails = [];
  for (const sec of h2.filter((s) => /^(Findings|Findings added|Self-identified)/i.test(s.heading))) {
    for (const t of tables(sec.body)) {
      const [head, ...body] = t;
      const ci = (re) => head.findIndex((h) => re.test(h));
      const iId = ci(/^ID$/i), iSrc = ci(/^Source/i), iF = ci(/^Finding/i), iD = ci(/^Disposition/i), iS = ci(/^Status/i), iE = ci(/^Evidence/i);
      if (iId < 0 || iD < 0) { fails.push(`table_header:${head.join("|")}`); continue; }
      for (const r of body) {
        if (r.length !== head.length) fails.push(`ragged:${r[0]}`);
        const k = mapKind(r[iD] ?? ""), st = mapStatus(r[iS] ?? "");
        rows.push({ id: r[iId], source: r[iSrc] ?? "", finding: r[iF] ?? "", dispositionRaw: r[iD] ?? "", statusRaw: r[iS] ?? "",
          evidence: iE >= 0 ? r[iE] : undefined, ...k, ...st, src: resolveSource(r[iSrc] ?? ""), cols: head.length, section: sec.heading });
      }
    }
  }
  // discharge evidence lists: "- **F1:** …" / "- **F1 / F73** — …"
  const evid = new Map();
  for (const sec of [...h2, ...sections(md, 3)].filter((s) => /evidence|discharge/i.test(s.heading))) {
    for (const line of sec.body.split("\n")) {
      const m = /^- \*\*([^*]+?)\*\*:?\s*[—:-]?\s*(.*)$/.exec(line);
      if (!m) continue;
      for (const id of m[1].replace(/:$/, "").split(/\s*[/,]\s*/)) evid.set(id.trim(), m[2]);
    }
  }
  // moves
  const moves = [];
  const plan = h2.find((s) => /^Revision plan/i.test(s.heading));
  if (plan) {
    for (const t of tables(plan.body)) {
      const [head, ...body] = t;
      const ci = (re) => head.findIndex((h) => re.test(h));
      const iM = ci(/^Move/i), iT = ci(/^Type/i), iDesc = ci(/^(Description|Notes)/i), iDis = ci(/^Discharges/i), iMo = ci(/^Moots/i), iS = ci(/^Status/i);
      for (const r of body) {
        const mm = /^M(\d+)\s*(.*)$/.exec(r[iM] ?? "");
        if (!mm) continue;
        const ids = (c) => (c ?? "").split(/[,;]\s*/).map((x) => x.trim().replace(/\s*\(.*\)$/, "")).filter((x) => /^[A-Z]/.test(x) && x !== "—");
        moves.push({ ordinal: Number(mm[1]), title: (mm[2] || (r[iDesc] ?? "")).slice(0, 200), ...(iT >= 0 ? { type: r[iT] } : {}),
          ...(iS >= 0 ? { status: r[iS] } : {}), discharges: iDis >= 0 ? ids(r[iDis]) : null, moots: iMo >= 0 ? ids(r[iMo]) : null });
      }
    }
    if (!moves.length) {
      // prose form: "M1–M11 all executed (M1 opening case/signals; M2 …)"
      for (const m of plan.body.matchAll(/\bM(\d+)\s+([^;)]+)/g)) moves.push({ ordinal: Number(m[1]), title: m[2].trim(), discharges: null, prose: true });
    }
  }
  return { rows, evid, moves, fails, hasPlan: !!plan };
}
