// Markdown twins for the three write-back structured artifacts (REQ-SPEC-9). The serializer renders a
// human-readable markdown scaffold from the typed rows; the parser reads the SAME scaffold back. Both
// the serializer and the parser import these render/parse pairs, so the round-trip
// `parse(serialize(rows)) ≡ rows` is an inverse by construction (§11.5). The markdown is a genuine
// structural rendering (headings + per-row sections + labelled field lines), never an embedded copy of
// the sidecar JSON — leaf values are JSON-encoded on their field line only so any string/number/boolean
// round-trips losslessly. Validation is the parser's job (via the P0.02 zod schemas); these functions
// deal in plain objects.

/** A labelled leaf line: `- **label:** <json-encoded value>`. */
function fieldLine(label: string, value: unknown): string {
  return `- **${label}:** ${JSON.stringify(value)}`;
}

/** Collect `- **label:** value` lines in a block into a label→parsed-value map (last wins). */
function readFields(block: string): Map<string, unknown> {
  const out = new Map<string, unknown>();
  for (const raw of block.split("\n")) {
    const m = /^- \*\*(.+?):\*\* (.*)$/.exec(raw.trim());
    if (!m) continue;
    out.set(m[1]!, JSON.parse(m[2]!));
  }
  return out;
}

/** Read a JSON-encoded string item list (`1. "x"` or `- "x"`) from a block, in document order. */
function readItems(block: string): string[] {
  const out: string[] = [];
  for (const raw of block.split("\n")) {
    const m = /^(?:\d+\.|-)\s+(.*)$/.exec(raw.trim());
    if (!m) continue;
    out.push(JSON.parse(m[1]!) as string);
  }
  return out;
}

/** Split a document into (heading, body) sections keyed by a heading matcher; text before the first
 *  matched heading is returned under the empty key. */
function splitSections(md: string, level: 2 | 3): { heading: string; body: string }[] {
  const marker = "#".repeat(level) + " ";
  const lines = md.split("\n");
  const sections: { heading: string; body: string }[] = [];
  let cur: { heading: string; body: string } | null = null;
  for (const line of lines) {
    if (line.startsWith(marker) && !line.startsWith(marker + "#")) {
      cur = { heading: line.slice(marker.length).trim(), body: "" };
      sections.push(cur);
    } else if (cur) {
      cur.body += line + "\n";
    }
  }
  return sections;
}

/** Assert the doc carries the expected `<!-- rhema:<kind> v1 -->` marker (a cheap dispatch/sanity guard). */
function requireMarker(md: string, kind: string): void {
  if (!md.includes(`<!-- rhema:${kind} v1 -->`)) {
    throw new Error(`markdown twin missing marker for kind "${kind}"`);
  }
}

function omitUndefined<T extends Record<string, unknown>>(obj: T): T {
  for (const k of Object.keys(obj)) if (obj[k] === undefined) delete obj[k];
  return obj;
}

// ---------------- response-ledger ----------------

export function renderResponseLedgerMd(v: {
  version: number;
  entries: {
    findingOrdinal: number;
    disposition: {
      kind: string;
      status: string;
      rationale?: string;
      adaptedText?: string;
      moveOrdinal?: number;
      applied?: boolean;
      /** PRB.05 — user-authored rows carry `actor: "user"` (REQ-SPEC-9). */
      actor?: string;
    };
    anchor?: unknown;
  }[];
  /** PRB.06 — the revision plan's moves (the What-changed move cards' titles/types). */
  moves?: {
    ordinal: number;
    title: string;
    type?: string;
    status?: string;
    discharges?: number[];
    moots?: number[];
  }[];
}): string {
  const out: string[] = ["# Response ledger", "", `<!-- rhema:response_ledger v1 -->`, ""];
  for (const e of v.entries) {
    out.push(`## Finding ${e.findingOrdinal}`);
    out.push(fieldLine("findingOrdinal", e.findingOrdinal));
    out.push(fieldLine("disposition.kind", e.disposition.kind));
    out.push(fieldLine("disposition.status", e.disposition.status));
    if (e.disposition.moveOrdinal !== undefined) out.push(fieldLine("disposition.moveOrdinal", e.disposition.moveOrdinal));
    if (e.disposition.applied !== undefined) out.push(fieldLine("disposition.applied", e.disposition.applied));
    if (e.disposition.rationale !== undefined) out.push(fieldLine("disposition.rationale", e.disposition.rationale));
    if (e.disposition.adaptedText !== undefined) out.push(fieldLine("disposition.adaptedText", e.disposition.adaptedText));
    if (e.disposition.actor !== undefined) out.push(fieldLine("disposition.actor", e.disposition.actor));
    if (e.anchor !== undefined) out.push(fieldLine("anchor", e.anchor));
    out.push("");
  }
  if (v.moves && v.moves.length > 0) {
    out.push("## Moves", "");
    for (const mv of v.moves) {
      out.push(`### Move ${mv.ordinal}`);
      out.push(fieldLine("ordinal", mv.ordinal));
      out.push(fieldLine("title", mv.title));
      if (mv.type !== undefined) out.push(fieldLine("type", mv.type));
      if (mv.status !== undefined) out.push(fieldLine("status", mv.status));
      if (mv.discharges !== undefined) out.push(fieldLine("discharges", mv.discharges));
      if (mv.moots !== undefined) out.push(fieldLine("moots", mv.moots));
      out.push("");
    }
  }
  return out.join("\n");
}

export function parseResponseLedgerMd(md: string): unknown {
  requireMarker(md, "response_ledger");
  const entries: unknown[] = [];
  for (const sec of splitSections(md, 2)) {
    if (!/^Finding\b/.test(sec.heading)) continue;
    const f = readFields(sec.body);
    const disposition = omitUndefined({
      kind: f.get("disposition.kind"),
      status: f.get("disposition.status"),
      rationale: f.get("disposition.rationale"),
      adaptedText: f.get("disposition.adaptedText"),
      moveOrdinal: f.get("disposition.moveOrdinal"),
      applied: f.get("disposition.applied"),
      actor: f.get("disposition.actor"),
    });
    entries.push(
      omitUndefined({ findingOrdinal: f.get("findingOrdinal"), disposition, anchor: f.get("anchor") }),
    );
  }
  const moves: unknown[] = [];
  for (const sec of splitSections(md, 3)) {
    if (!/^Move\b/.test(sec.heading)) continue;
    const f = readFields(sec.body);
    moves.push(
      omitUndefined({
        ordinal: f.get("ordinal"),
        title: f.get("title"),
        type: f.get("type"),
        status: f.get("status"),
        discharges: f.get("discharges"),
        moots: f.get("moots"),
      }),
    );
  }
  const out: Record<string, unknown> = { sidecar: "response_ledger", version: 1, entries };
  if (moves.length > 0) out.moves = moves;
  return out;
}

// ---------------- structure-plan ----------------

export function renderStructurePlanMd(v: {
  version: number;
  spine: string[];
  sections: { ref: string; title: string; targetWords?: number; purpose?: string; anchor?: unknown }[];
  alternativesConsidered?: string[];
  gaps?: string[];
}): string {
  const out: string[] = ["# Structure plan", "", `<!-- rhema:structure_plan v1 -->`, "", "## Spine", ""];
  v.spine.forEach((claim, i) => out.push(`${i + 1}. ${JSON.stringify(claim)}`));
  out.push("", "## Sections", "");
  for (const s of v.sections) {
    out.push(`### Section ${s.ref}`);
    out.push(fieldLine("ref", s.ref));
    out.push(fieldLine("title", s.title));
    if (s.targetWords !== undefined) out.push(fieldLine("targetWords", s.targetWords));
    if (s.purpose !== undefined) out.push(fieldLine("purpose", s.purpose));
    if (s.anchor !== undefined) out.push(fieldLine("anchor", s.anchor));
    out.push("");
  }
  if (v.alternativesConsidered !== undefined) {
    out.push("## Alternatives considered", "");
    for (const a of v.alternativesConsidered) out.push(`- ${JSON.stringify(a)}`);
    out.push("");
  }
  if (v.gaps !== undefined) {
    out.push("## Gaps", "");
    for (const g of v.gaps) out.push(`- ${JSON.stringify(g)}`);
    out.push("");
  }
  return out.join("\n");
}

export function parseStructurePlanMd(md: string): unknown {
  requireMarker(md, "structure_plan");
  const l2 = splitSections(md, 2);
  const spineSec = l2.find((s) => /^Spine\b/.test(s.heading));
  const altSec = l2.find((s) => /^Alternatives considered\b/.test(s.heading));
  const gapsSec = l2.find((s) => /^Gaps\b/.test(s.heading));

  const sections: unknown[] = [];
  for (const sec of splitSections(md, 3)) {
    if (!/^Section\b/.test(sec.heading)) continue;
    const f = readFields(sec.body);
    sections.push(
      omitUndefined({
        ref: f.get("ref"),
        title: f.get("title"),
        targetWords: f.get("targetWords"),
        purpose: f.get("purpose"),
        anchor: f.get("anchor"),
      }),
    );
  }
  const out: Record<string, unknown> = {
    sidecar: "structure_plan",
    version: 1,
    spine: spineSec ? readItems(spineSec.body) : [],
    sections,
  };
  if (altSec) out.alternativesConsidered = readItems(altSec.body);
  if (gapsSec) out.gaps = readItems(gapsSec.body);
  return out;
}

// ---------------- cut-list ----------------

export function renderCutListMd(v: {
  version: number;
  targetWords?: number;
  cuts: { ordinal: number; anchor: unknown; words: number; reason: string; protect?: boolean }[];
}): string {
  const out: string[] = ["# Cut list", "", `<!-- rhema:cut_list v1 -->`, ""];
  if (v.targetWords !== undefined) out.push(fieldLine("targetWords", v.targetWords), "");
  for (const c of v.cuts) {
    out.push(`## Cut ${c.ordinal}`);
    out.push(fieldLine("ordinal", c.ordinal));
    out.push(fieldLine("anchor", c.anchor));
    out.push(fieldLine("words", c.words));
    out.push(fieldLine("reason", c.reason));
    if (c.protect !== undefined) out.push(fieldLine("protect", c.protect));
    out.push("");
  }
  return out.join("\n");
}

export function parseCutListMd(md: string): unknown {
  requireMarker(md, "cut_list");
  const l2 = splitSections(md, 2);
  // targetWords lives in the preamble (before the first `## Cut`); scan for its field line.
  let targetWords: unknown;
  for (const raw of md.split("\n")) {
    const m = /^- \*\*targetWords:\*\* (.*)$/.exec(raw.trim());
    if (m) {
      targetWords = JSON.parse(m[1]!);
      break;
    }
  }
  const cuts: unknown[] = [];
  for (const sec of l2) {
    if (!/^Cut\b/.test(sec.heading)) continue;
    const f = readFields(sec.body);
    cuts.push(
      omitUndefined({
        ordinal: f.get("ordinal"),
        anchor: f.get("anchor"),
        words: f.get("words"),
        reason: f.get("reason"),
        protect: f.get("protect"),
      }),
    );
  }
  return omitUndefined({ sidecar: "cut_list", version: 1, targetWords, cuts });
}
