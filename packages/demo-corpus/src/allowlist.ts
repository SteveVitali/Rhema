/**
 * REQ-CORPUS-1 / REQ-CORPUS-11 — allowlist-only ingest. Every file under a source project dir is
 * classified against the R1 §1 globs plus the spec §4.1 file-ruling table (RV-37). Anything not
 * explicitly kept or excluded is UNRULED and fails the export (fail closed).
 *
 * Evaluation order: exclusions first (they carve specific files out of broad keep globs — e.g.
 * `drafts/figures/values-table*.png`, the GM `01-claim-ledger-{A,B}.md` parts, the working
 * fragments), then keeps, then `unruled`.
 */

export type Ruling = "keep" | "exclude" | "unruled";

export interface FileRuling {
  readonly ruling: Ruling;
  /** The rule id that decided it; recorded in PROVENANCE for both keeps and exclusions. */
  readonly ruleId: string;
  readonly reason: string;
}

interface Rule {
  readonly id: string;
  readonly re: RegExp;
  readonly ruling: "keep" | "exclude";
  readonly reason: string;
}

/**
 * Exclusions evaluated before keeps (R1 §1 excluded set + ambiguous-file rulings + GD-DEMO-REDACT.R7).
 * `reason` is the PROVENANCE text; it never carries file content.
 */
const EXCLUDE: readonly Rule[] = [
  {
    id: "x-outline",
    re: /^agents\/[^/]+\/outline\//,
    ruling: "exclude",
    reason: "deep-research outline (GD-DEMO-REDACT.R7)",
  },
  {
    id: "x-manifest",
    re: /^manifest\.md$/,
    ruling: "exclude",
    reason: "round log carrying writer-edit notes (GD-DEMO-REDACT.R7)",
  },
  {
    id: "x-editor-notes",
    re: /^agents\/editor\/notes\.md$/,
    ruling: "exclude",
    reason: "editor's private notes (GD-DEMO-REDACT.R7)",
  },
  {
    id: "x-voice-charter",
    re: /^agents\/author\/voice-charter\.md$/,
    ruling: "exclude",
    reason: "persona internals (REQ-CORPUS-11 ruling; GD-DEMO-PROCESS.R7)",
  },
  {
    id: "x-short-v1",
    re: /^drafts\/short-v1\.md$/,
    ruling: "exclude",
    reason: "a different piece, not a version (REQ-CORPUS-11 ruling)",
  },
  {
    id: "x-values-table",
    re: /^drafts\/figures\/values-table[^/]*\.png$/,
    ruling: "exclude",
    reason: "unreferenced screenshots (REQ-CORPUS-11 ruling)",
  },
  {
    id: "x-draft-part",
    re: /^agents\/author\/drafting\/v1\/draft-part[^/]*\.md$/,
    ruling: "exclude",
    reason: "working fragment; the merged draft is canonical",
  },
  {
    id: "x-ledger-slice",
    re: /^agents\/author\/drafting\/v1\/ledger-slice[^/]*\.md$/,
    ruling: "exclude",
    reason: "working fragment; the merged ledger is canonical",
  },
  {
    id: "x-index-slice",
    re: /^agents\/[^/]+\/research\/index-slice[^/]*\.md$/,
    ruling: "exclude",
    reason: "working fragment; the merged index is canonical",
  },
  {
    id: "x-ledger-part",
    re: /^correspondence\/v2-review\/01-claim-ledger-[A-Z]\.md$/,
    ruling: "exclude",
    reason: "part file; the merged ledger is canonical (R2)",
  },
  { id: "x-dotfile", re: /(^|\/)\.[^/]/, ruling: "exclude", reason: "dotfile (OS junk)" },
];

/** Keeps — the R1 §1 allowlist globs plus the REQ-CORPUS-11 inclusions and `published.md`. */
const KEEP: readonly Rule[] = [
  { id: "k-draft", re: /^drafts\/v[0-9][^/]*\.md$/, ruling: "keep", reason: "essay version" },
  {
    id: "k-figure",
    re: /^drafts\/figures\/[^/]+\.png$/,
    ruling: "keep",
    reason: "referenced figure image",
  },
  {
    id: "k-taxonomy",
    re: /^drafts\/taxonomy_reference_sheet\.md$/,
    ruling: "keep",
    reason: "companion artifact cited by the draft (§VII; REQ-CORPUS-11 ruling)",
  },
  {
    id: "k-correspondence",
    re: /^correspondence\/[^/].*\.md$/,
    ruling: "keep",
    reason: "review/response correspondence",
  },
  {
    id: "k-author-ledger",
    re: /^agents\/author\/ledgers\/[^/]+\.md$/,
    ruling: "keep",
    reason: "response ledger",
  },
  {
    id: "k-drafting",
    re: /^agents\/author\/drafting\/v1\/[^/]+\.md$/,
    ruling: "keep",
    reason: "drafting dossier",
  },
  {
    id: "k-research-index",
    re: /^agents\/[^/]+\/research\/index[^/]*\.md$/,
    ruling: "keep",
    reason: "research index",
  },
  {
    id: "k-source-note",
    re: /^agents\/[^/]+\/research\/sources\/[^/]+\.md$/,
    ruling: "keep",
    reason: "source note",
  },
  {
    id: "k-published",
    re: /^published\.md$/,
    ruling: "keep",
    reason: "Published post (REQ-CORPUS-12)",
  },
];

export function classifyFile(relPath: string): FileRuling {
  for (const rule of EXCLUDE) {
    if (rule.re.test(relPath)) {
      return { ruling: "exclude", ruleId: rule.id, reason: rule.reason };
    }
  }
  for (const rule of KEEP) {
    if (rule.re.test(relPath)) {
      return { ruling: "keep", ruleId: rule.id, reason: rule.reason };
    }
  }
  return {
    ruling: "unruled",
    ruleId: "unruled",
    reason: "no ruling; allowlist-only ingest fails closed",
  };
}

/** The allowlist with counts, for PROVENANCE.md — every keep rule and the files it admitted. */
export interface AllowlistCounts {
  readonly ruleId: string;
  readonly reason: string;
  readonly count: number;
}

export function allowlistCounts(
  kept: readonly { relPath: string; ruling: FileRuling }[],
): AllowlistCounts[] {
  return KEEP.map((rule) => ({
    ruleId: rule.id,
    reason: rule.reason,
    count: kept.filter((k) => k.ruling.ruleId === rule.id).length,
  })).filter((row) => row.count > 0);
}
