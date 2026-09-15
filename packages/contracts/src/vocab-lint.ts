// The REQ-PROD-6 / REQ-BILL-18 i18n string lint, as a reusable function over the Appendix D.2 bedrock data
// (reserved-strings.ts). This is the "extends P0.02's data for UI strings" wiring PRB.01 (and every later UI
// ticket) uses: feed a copy table in, get back the banned-string violations. It matches whole words / exact
// phrases (case-insensitive) so canonical nouns pass — "Project" is fine even though "Pro" is banned, and
// "authority" is fine even though "author" is reserved for the human.

import { BANNED_STRINGS } from "./reserved-strings.js";
import type { BannedString } from "./reserved-strings.js";

export interface CopyViolation {
  /** The copy-table key that violated. */
  readonly key: string;
  /** The banned term found (verbatim from Appendix D.2). */
  readonly term: string;
  /** The offending copy string. */
  readonly value: string;
  /** The Appendix D.2 exception, if this term has a narrow sanctioned use. */
  readonly except?: string;
}

export interface LintCopyOptions {
  /**
   * Also flag banned terms that carry a narrow Appendix D.2 exception (e.g. "Advanced" as the
   * progressive-disclosure label, "tokens" under Advanced). Default true — the strict posture the beta copy
   * table holds itself to; a surface that legitimately needs an excepted term lists it in `allow`.
   */
  readonly includeExcepted?: boolean;
  /** Terms to permit despite being banned (their sanctioned Appendix D.2 exception applies here). */
  readonly allow?: readonly string[];
}

/** Escape a term for use inside a RegExp. */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * A whole-word / exact-phrase matcher for `term`: it matches only when the term is not flanked by another
 * alphanumeric, so "gate" matches in "the gate" but not in "aggregate" or "navigate", and "Pro" does not
 * match inside "Project" or "protocol".
 */
function wordMatcher(term: string): RegExp {
  return new RegExp(`(?<![A-Za-z0-9])${escapeRegExp(term)}(?![A-Za-z0-9])`, "i");
}

/** The banned set the lint checks against, after applying `includeExcepted` / `allow`. */
function activeBanned(opts: LintCopyOptions): BannedString[] {
  const includeExcepted = opts.includeExcepted !== false;
  const allow = new Set((opts.allow ?? []).map((s) => s.toLowerCase()));
  return BANNED_STRINGS.filter((b) => {
    if (allow.has(b.text.toLowerCase())) return false;
    if (b.except && !includeExcepted) return false;
    return true;
  });
}

/**
 * Lint a copy table (a `{ key: string }` map or `[key, string]` pairs) against the Appendix D.2 banned
 * strings. Returns one violation per (key × banned term) hit; an empty array means the copy is clean. This
 * is the deterministic AC4 vehicle: `expect(lintCopy(ALL_COPY)).toEqual([])`.
 */
export function lintCopy(
  entries: Readonly<Record<string, string>> | Iterable<readonly [string, string]>,
  opts: LintCopyOptions = {},
): CopyViolation[] {
  const pairs: [string, string][] = Symbol.iterator in Object(entries)
    ? [...(entries as Iterable<readonly [string, string]>)].map(([k, v]): [string, string] => [k, v])
    : Object.entries(entries as Record<string, string>);

  const banned = activeBanned(opts).map((b) => ({ ...b, re: wordMatcher(b.text) }));
  const violations: CopyViolation[] = [];
  for (const [key, value] of pairs) {
    if (typeof value !== "string") continue;
    for (const b of banned) {
      if (b.re.test(value)) {
        violations.push({ key, term: b.text, value, except: b.except });
      }
    }
  }
  return violations;
}
