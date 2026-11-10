// The REQ-PROD-6 / REQ-BILL-18 i18n string lint, as a reusable function over the Appendix D.2 bedrock data
// (reserved-strings.ts). This is the "extends P0.02's data for UI strings" wiring PRB.01 (and every later UI
// ticket) uses: feed a copy table in, get back the banned-string violations. It matches whole words / exact
// phrases (case-insensitive) so canonical nouns pass — "Project" is fine even though "Pro" is banned, and
// "authority" is fine even though "author" is reserved for the human.

import { BANNED_INTERNAL_TERMS, BANNED_STRINGS } from "./reserved-strings.js";
import type { BannedInternalTerm, BannedString, InternalTermAllow } from "./reserved-strings.js";

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

// ---------- REQ-COPY-6 / REQ-GUARD-2(a) (R7COPY.1a) — the banned internal-term lint ----------

export interface InternalTermViolation {
  /** The copy-table key that violated. */
  readonly key: string;
  /** The `BANNED_INTERNAL_TERMS.id`. */
  readonly termId: string;
  /** The banned term (verbatim from spec §4.13). */
  readonly term: string;
  /** The offending copy string. */
  readonly value: string;
  /** The plain-language replacement the jargon pass applies. */
  readonly replacement: string;
}

function termMatcher(t: BannedInternalTerm): RegExp {
  return new RegExp(t.pattern, t.flags);
}

function toPairs(
  entries: Readonly<Record<string, string>> | Iterable<readonly [string, string]>,
): [string, string][] {
  return Symbol.iterator in Object(entries)
    ? [...(entries as Iterable<readonly [string, string]>)].map(([k, v]): [string, string] => [k, v])
    : Object.entries(entries as Record<string, string>);
}

/**
 * The REQ-GUARD-2(a) copy lint: no COPY leaf's VALUE may carry a REQ-COPY-6 banned internal term.
 * `allow` entries exempt exactly their (key, termId) pair — they are validated separately by
 * `validateInternalTermAllow`, so a malformed allow never silently exempts: an unvalidated entry
 * is simply ignored here and the violation still reports.
 */
export function lintInternalTerms(
  entries: Readonly<Record<string, string>> | Iterable<readonly [string, string]>,
  opts: { allow?: readonly InternalTermAllow[] } = {},
): InternalTermViolation[] {
  const pairs = toPairs(entries);
  const allowed = new Set(
    (opts.allow ?? [])
      .filter((a) => validateInternalTermAllowEntries([a]).length === 0)
      .map((a) => `${a.key}${a.termId}`),
  );
  const terms = BANNED_INTERNAL_TERMS.map((t) => ({ ...t, re: termMatcher(t) }));
  const violations: InternalTermViolation[] = [];
  for (const [key, value] of pairs) {
    if (typeof value !== "string") continue;
    for (const t of terms) {
      if (t.re.test(value) && !allowed.has(`${key}${t.id}`)) {
        violations.push({ key, termId: t.id, term: t.text, value, replacement: t.replacement });
      }
    }
  }
  return violations;
}

/**
 * Validate the temporary allow list (REQ-COPY-6 + Phase-4 P4-24). Each entry must (1) name a
 * `demo.*` leaf — only H15-signed demo copy may be exempted, (2) reference a real banned-term id,
 * (3) carry a `D-<TICKET>-<n>` deferral key that owns removal, (4) carry a YYYY-MM-DD `added`
 * date, and (5) cover at least one live violation — a stale or seeded allow fails. Call with the
 * raw violations so leg (5) can run:
 *   `validateInternalTermAllow(ALLOW, lintInternalTerms(all, { allow: [] }))`
 */
export function validateInternalTermAllow(
  allow: readonly InternalTermAllow[],
  rawViolations: readonly InternalTermViolation[],
): string[] {
  const errors: string[] = [];
  const raw = new Set(rawViolations.map((v) => `${v.key}${v.termId}`));
  for (const a of allow) {
    errors.push(...validateInternalTermAllowEntries([a]));
    if (a.deferral && /^D-[A-Za-z0-9.]+-\d+$/.test(a.deferral) && a.key.startsWith("demo.")) {
      if (!raw.has(`${a.key}${a.termId}`)) {
        errors.push(
          `allow entry ${a.key}/${a.termId} covers no live violation — remove it (stale entries fail closed)`,
        );
      }
    }
  }
  return errors;
}

/** Structural checks for one allow entry (shape only — live-violation coverage needs the caller's raw list). */
function validateInternalTermAllowEntries(allow: readonly InternalTermAllow[]): string[] {
  const errors: string[] = [];
  const termIds = new Set(BANNED_INTERNAL_TERMS.map((t) => t.id));
  for (const a of allow) {
    if (typeof a.key !== "string" || !a.key.startsWith("demo.")) {
      errors.push(`allow entry key '${a.key}' must be a demo.* leaf — only H15-signed copy is exemptible`);
    }
    if (typeof a.termId !== "string" || !termIds.has(a.termId)) {
      errors.push(`allow entry ${a.key}: unknown term id '${a.termId}'`);
    }
    if (typeof a.deferral !== "string" || !/^D-[A-Za-z0-9.]+-\d+$/.test(a.deferral)) {
      errors.push(`allow entry ${a.key}/${a.termId}: deferral '${a.deferral}' is not a D-row key (D-<TICKET>-<n>)`);
    }
    if (typeof a.added !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(a.added)) {
      errors.push(`allow entry ${a.key}/${a.termId}: added '${a.added}' is not a YYYY-MM-DD date`);
    }
    if (typeof a.note !== "string" || a.note.length === 0) {
      errors.push(`allow entry ${a.key}/${a.termId}: a named reason is required`);
    }
  }
  return errors;
}
