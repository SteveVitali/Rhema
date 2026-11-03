// R7COPY.0 (REQ-COPY-4; ADR-130; REQ-SYNC-2) — the record-composed "What it delivered" summary that
// replaces the generated walkthrough, and the ONE count rule every surface shares. Everything here is
// PURE: the functions take delivered-record facts (letter sections, finding slot values, claim count,
// link keys the caller resolved) and produce the summary — no I/O, no model call, nothing generated.
// REQ-DWEB-15's replay path (218a R7DEM.3b) calls the same composer on snapshot data.
//
// The verdict-line rule (this ticket's decision): the letter's `one_thing` slot — the section whose
// heading matches the SLOT_PATTERNS verdict/one-thing patterns — supplies the quote VERBATIM (its
// first paragraph). A letter with no verdict section yields `verdict: null`: the card shows no line,
// never a paraphrase (cross-cutting invariant 19 — nothing paraphrased, nothing generated).

/** One `## ` heading's parsed section — the shape `parseLetterSections` emits (id = slug, title verbatim). */
export interface LetterSectionLike {
  readonly id: string;
  readonly title: string;
  readonly paragraphs: readonly string[];
  readonly findingRefs?: readonly { readonly findingId: string; readonly label: string }[];
}

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/**
 * The finding rows' `letter_section` slots (the canonical §11.3 enum) → the heading a real letter gives
 * that slot. The letter's headings are free prose, so the join is by ordered pattern, first match wins —
 * a slot whose pattern no heading matches simply gets no refs (nothing is fabricated into a section
 * that doesn't exist). Moved from apps/api/src/dossier-routes.ts verbatim so the composer shares it.
 */
export const SLOT_PATTERNS: Readonly<Record<string, readonly RegExp[]>> = {
  one_thing: [/^verdict\b/i, /one thing/i],
  major: [/major/i],
  strength: [/strength/i],
  roadmap: [/roadmap/i, /revision/i],
  considered_rejected: [/considered/i],
};

/** Split the editors-letter markdown on `## ` headings → letter sections with paragraph bodies. */
export function parseLetterSections(markdown: string): LetterSectionLike[] {
  const lines = markdown.split("\n");
  const sections: { id: string; title: string; paras: string[] }[] = [];
  let cur: { id: string; title: string; paras: string[] } | null = null;
  let buf: string[] = [];
  const flushPara = (): void => {
    const p = buf.join("\n").trim();
    if (cur && p !== "") cur.paras.push(p);
    buf = [];
  };
  for (const line of lines) {
    const h2 = /^##\s+(.+)$/.exec(line);
    const h1 = /^#\s+/.test(line);
    if (h1) continue; // the letter's own H1 is the title, not a section
    if (h2) {
      flushPara();
      if (cur) sections.push(cur);
      const title = h2[1]!.trim();
      cur = { id: slugify(title), title, paras: [] };
      continue;
    }
    if (cur) {
      if (line.trim() === "") flushPara();
      else buf.push(line);
    }
  }
  flushPara();
  if (cur) sections.push(cur);
  return sections.map((s) => ({ id: s.id, title: s.title, paragraphs: s.paras }));
}

// ---------------------------------------------------------------- one count rule (REQ-SYNC-2)

/** The minimal finding fact the count rule reads — the delivered row's §11.3 letter-section slot. */
export interface DeliveredFindingFact {
  readonly letterSection?: string | null;
}

/**
 * The finding/claim counts of a delivered run, by ONE rule (R5 C5; REQ-SYNC-2). A finding filed under
 * the letter's `strength` slot is a strength — it is counted as a strength, never as a finding, so a
 * "5 findings + 1 strength" run shows the same figure on the Timeline chips, the dossier rail and the
 * run card. Everything else on the row is a finding; claims count verbatim.
 */
export interface DeliveredRecordCounts {
  readonly findings: number;
  readonly strengths: number;
  readonly claims: number;
}

export function deliveredRecordCounts(args: {
  readonly findings: readonly DeliveredFindingFact[];
  readonly claims: number;
}): DeliveredRecordCounts {
  const strengths = args.findings.filter((f) => f.letterSection === "strength").length;
  return { findings: args.findings.length - strengths, strengths, claims: args.claims };
}

// ---------------------------------------------------------------- the composed summary (REQ-COPY-4)

/**
 * The link keys a delivered summary may carry — the caller supplies which apply (it knows the
 * artifact's surface); the composer echoes them verbatim. The renderer resolves each key to an href.
 */
export type DeliveredLinkKey = "dossier" | "letter" | "ledger";

/** The run card's "What it delivered" block — composed deterministically from the delivered record. */
export interface DeliveredSummary {
  /** the letter's verdict line, QUOTED VERBATIM (the one_thing slot's first paragraph); null when the
   *  letter has no verdict section — the card shows no line, never a paraphrase. */
  readonly verdict: string | null;
  /** the one-rule finding/claim counts (REQ-SYNC-2). */
  readonly counts: DeliveredRecordCounts;
  /** the link keys the surface resolves to hrefs (dossier · letter · ledger). */
  readonly links: readonly DeliveredLinkKey[];
}

/**
 * Compose "What it delivered" from the delivered record. Pure: takes the letter's parsed sections
 * (or null when no letter could be read — the counts and links still compose), the finding slot
 * facts, the claim count, and the caller's link keys.
 */
export function composeDeliveredSummary(args: {
  readonly letterSections: readonly LetterSectionLike[] | null;
  readonly findings: readonly DeliveredFindingFact[];
  readonly claims: number;
  readonly links?: readonly DeliveredLinkKey[];
}): DeliveredSummary {
  const sections = args.letterSections ?? [];
  const verdictIdx = sections.findIndex((s) =>
    SLOT_PATTERNS.one_thing!.some((p) => p.test(s.title)),
  );
  const verdict = verdictIdx >= 0 ? (sections[verdictIdx]!.paragraphs[0] ?? null) : null;
  return {
    verdict,
    counts: deliveredRecordCounts({ findings: args.findings, claims: args.claims }),
    links: args.links ?? [],
  };
}
