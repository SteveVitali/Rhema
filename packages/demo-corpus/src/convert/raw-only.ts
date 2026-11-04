// The raw-only artifact registry (R2 §6; REQ-CONV-13). Corpus-relative path patterns for every
// artifact that renders ONLY as a raw markdown page — never structured, never paraphrased.
// 218 consumes this to serve those artifacts as raw pages. Artifacts that carry a sidecar
// (claim ledger, letter, second read, response ledger, structure plan, findings/rubric) are
// deliberately absent: they render raw ALONGSIDE their structured twin, not instead of it.

/** `*` = within a path segment; `**` = across segments. */
const compile = (glob: string): RegExp =>
  new RegExp(
    "^" +
      glob
        .split("**")
        .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\\\*/g, "[^/]*"))
        .join(".*") +
      "$",
  );

export const RAW_ONLY: readonly string[] = [
  // Review dossier prose (R2 §6 first bullet).
  "correspondence/*/00-piece-brief.md",
  "correspondence/*/02-discourse-report*.md",
  "correspondence/*/03-argument-notes.md",
  "correspondence/*/04-craft-notes.md",
  // Response letters + the drafting note (letter prose; no sidecar exists).
  "correspondence/*-response.md",
  "correspondence/*-drafting-note.md",
  // GM v2's split claim-ledger subsets — the merged `01-claim-ledger.md` is the one converted.
  "correspondence/*/01-claim-ledger-*.md",
  // Drafting dossier: every part but `02-structure-plan.md` (briefs, fidelity audit, drafter
  // claim ledger, draft ledger — REQ-CONV-17 — draft-part*, ledger-slice*).
  "agents/*/drafting/*/00-*.md",
  "agents/*/drafting/*/01-*.md",
  "agents/*/drafting/*/03-*.md",
  "agents/*/drafting/*/04-*.md",
  "agents/*/drafting/*/05-*.md",
  "agents/*/drafting/*/06-*.md",
  "agents/*/drafting/*/draft-part*.md",
  "agents/*/drafting/*/ledger-slice*.md",
  // Research indices + all source-note bodies (fields are listing-only).
  "agents/*/research/*.md",
  "agents/*/research/**/*.md",
];

const PATTERNS: readonly RegExp[] = RAW_ONLY.map(compile);

/** Is this corpus-relative artifact path served raw-only? */
export function isRawOnly(path: string): boolean {
  return PATTERNS.some((re) => re.test(path));
}
