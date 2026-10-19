// deferral-status.mjs — the shared DEFERRALS status-cell parse (HYGIENE.1, REQ-MEM-2/3).
//
// The cell contract (docs/tickets/DEFERRALS.md rules): "a row's status is the first of these
// keywords that appears in its status cell" — OPEN · PARTIAL · DONE · WONTFIX ·
// ACCEPTED-SKELETON — read from the LAST `|`-separated cell (the Status column). Positional
// first-canonical-token semantics is the ratified reading: hyphenated compounds tokenize as
// one word ("**DONE-code**" → "DONE-CODE", never a status) and trailing canonical words in
// the dated tail never re-open a row.
//
// `positionalStatus` reproduces check-backlog.sh's awk parse and (post-HYGIENE.1)
// check-build-memory.sh's; `priorityStatus` reproduces the pre-fix priority scan
// (OPEN > PARTIAL > DONE > WONTFIX > ACCEPTED-SKELETON, first hit anywhere wins) so the
// census can name every row the two parsers ever disagreed on.

export const CANONICAL = ["OPEN", "PARTIAL", "DONE", "WONTFIX", "ACCEPTED-SKELETON"];

// Status-shaped words that are NOT canonical — they must never sit in the leading position
// (they read as nothing) and are reported as "non-canonical trailing tokens" by the census.
export const STATUS_LIKE = [
  "DROPPED", "DROP", "CLOSED", "DISCHARGED", "DISCHARGE", "RESOLVED", "RESOLVE",
  "SUPERSEDED", "SUPERSEDES", "MOOTED", "MOOT", "DEFERRED", "RE-DEFERRED", "DEFER",
  "VERIFIED", "VERIFY", "COMPLETED", "COMPLETE", "SKIPPED", "SKIP", "WITHDRAWN",
  "CANCELLED", "CANCELED", "BLOCKED", "STALE", "ZOMBIE", "OWED", "PENDING", "LANDED",
  "MERGED", "DEPLOYED", "FIXED", "REOPENED", "RE-OPENED", "IN-PROGRESS", "PROGRESS",
  "CONFIRMED", "UNCONFIRMED", "UNBLOCKED", "DONE-CODE", "NOT-NEEDED", "NO-OP",
  "ACCEPTED", "SKELETON", "WONT", "RETRACTED", "OBSOLETE", "DISCHARGES", "LIVE",
  "PROVEN", "SHIPPED", "ABSOLVED", "SATISFIED",
];
const STATUS_LIKE_SET = new Set(STATUS_LIKE);
const CANONICAL_SET = new Set(CANONICAL);

// The last non-empty `|`-delimited cell of a markdown table row. Both checkers read exactly
// this cell (check-backlog: last non-empty field; check-build-memory: $NF after the trailing
// `|` is stripped).
export function lastCell(row) {
  const parts = row.replace(/\|\s*$/, "").split("|");
  for (let i = parts.length - 1; i >= 0; i--) {
    if (parts[i].trim() !== "") return parts[i];
  }
  return "";
}

// Both checkers' tokenization: uppercase, every [^A-Z-]+ run collapses to a separator
// (markdown emphasis, punctuation and digits are dropped; hyphens survive, so "DONE-code"
// is one token and never matches).
export function statusTokens(cell) {
  return cell
    .toUpperCase()
    .replace(/[^A-Z-]+/g, " ")
    .split(" ")
    .filter((t) => t !== "");
}

// Positional semantics (check-backlog.sh; check-build-memory.sh post-HYGIENE.1): the first
// token that is exactly a canonical word decides; "" when none appears.
export function positionalStatus(cell) {
  for (const t of statusTokens(cell)) {
    if (CANONICAL_SET.has(t)) return t;
  }
  return "";
}

// Legacy check-build-memory.sh semantics (pre-HYGIENE.1): candidate-ordered — OPEN wins
// anywhere in the cell, then PARTIAL, then DONE, … Kept so the census can reproduce every
// historical disagreement on the drifted corpus.
export function priorityStatus(cell) {
  const toks = new Set(statusTokens(cell));
  for (const c of CANONICAL) {
    if (toks.has(c)) return c;
  }
  return "";
}

// Every DEFERRALS row's parse record.
export function censusRow(row) {
  const m = row.match(/^\|\s*(D-[A-Za-z0-9.-]+)\s*\|/);
  const id = m ? m[1] : "";
  const cell = lastCell(row);
  const toks = statusTokens(cell);
  const positional = positionalStatus(cell);
  const priority = priorityStatus(cell);
  // Canonical tokens seen after the first — the trailing drift that a priority scan misreads.
  let firstIdx = -1;
  for (let i = 0; i < toks.length; i++) {
    if (CANONICAL_SET.has(toks[i])) { firstIdx = i; break; }
  }
  const trailingCanonical = firstIdx < 0 ? [] : toks.slice(firstIdx + 1).filter((t) => CANONICAL_SET.has(t));
  // Status-shaped but non-canonical tokens anywhere after the first canonical token — the
  // words a human reads as status ("DROPPED", "RE-DEFERRED", "DONE-code") that the parsers
  // correctly ignore. Compound tokens containing a canonical word (e.g. DONE-CODE) surface
  // here too.
  const trailingNonCanonical = toks
    .slice(Math.max(firstIdx, 0) + 1)
    .filter((t) => !CANONICAL_SET.has(t) && (STATUS_LIKE_SET.has(t) || CANONICAL.some((c) => t.includes(c))));
  return { id, positional, priority, trailingCanonical, trailingNonCanonical, tokens: toks };
}

export function isDeferralRow(line) {
  return /^\|\s*D-/.test(line);
}

export function censusFile(text) {
  return text.split("\n").filter(isDeferralRow).map(censusRow);
}
