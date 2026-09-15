import type { LineageFinding } from "./queries.js";

// Lineage matching (REQ-OBJ-4). At review delivery, each new finding is matched to at most one existing
// obligation by three matchers run IN ORDER, first hit wins, all recorded on obligation_findings:
//   1. claim identity — normalized_url + quote resolve to a claim already in an obligation's lineage;
//   2. the Editor's own declaration — the re-review's findings sidecar `carriesObligationId`;
//   3. anchor overlap — same `kind` + quote-resolution overlap above a confidence floor (a false merge is
//      worse than a duplicate the user can merge by hand, so this may ship flag-gated while the floor is tuned
//      on the three real projects — hence `anchorOverlapMatcher` defaults OFF).
// This module is PURE (no DB): the hook loads the project's lineage once and calls `matchFinding` per finding.

/** A newly delivered finding, reduced to what the matchers read. */
export interface CandidateFinding {
  readonly findingId: string;
  readonly kind: string;
  readonly quote: string | null;
  readonly normalizedUrl: string | null;
  readonly carriesObligationId: string | null;
}

export interface LineageMatchOptions {
  /** matcher 3 (anchor overlap) — OFF by default; enable once the floor is tuned (REQ-OBJ-4). */
  readonly anchorOverlapMatcher?: boolean;
  /** the confidence floor for matcher 3 (quote-token Jaccard); default 0.8. */
  readonly anchorOverlapFloor?: number;
}

export interface LineageMatch {
  readonly obligationId: string;
  /** which matcher fired (1 claim identity · 2 declaration · 3 anchor overlap) — recorded for tuning. */
  readonly matcher: 1 | 2 | 3;
}

/** Normalize a quote for identity comparison: trim, collapse internal whitespace, lowercase. */
export function normalizeQuote(quote: string | null | undefined): string | null {
  if (!quote) return null;
  const q = quote.replace(/\s+/g, " ").trim().toLowerCase();
  return q.length > 0 ? q : null;
}

/** Read the quote off a finding/claim anchor jsonb (`{ blockId?, quote? }`). */
export function quoteOf(anchor: { quote?: string } | null | undefined): string | null {
  return normalizeQuote(anchor?.quote ?? null);
}

/** Jaccard overlap of the two quotes' word sets ∈ [0,1]; 0 when either is empty. */
export function quoteOverlap(a: string | null, b: string | null): number {
  if (!a || !b) return 0;
  const sa = new Set(a.split(" ").filter(Boolean));
  const sb = new Set(b.split(" ").filter(Boolean));
  if (sa.size === 0 || sb.size === 0) return 0;
  let inter = 0;
  for (const w of sa) if (sb.has(w)) inter++;
  return inter / (sa.size + sb.size - inter);
}

/**
 * Match a candidate finding to an existing obligation on the project (or null). The three §11.7 matchers run in
 * order; the first hit wins. `lineage` is every obligation_findings edge on the project, each joined to its
 * finding's kind / quote / normalized_url. `obligationIds` bounds which obligations are declarable by matcher 2
 * (must exist on the project). The hook decides carried-vs-regression from the matched obligation's STATE.
 */
export function matchFinding(
  candidate: CandidateFinding,
  lineage: readonly LineageFinding[],
  obligationIds: ReadonlySet<string>,
  options: LineageMatchOptions = {},
): LineageMatch | null {
  // matcher 1 — claim identity: same normalized_url AND same quote as a finding already in a lineage.
  if (candidate.normalizedUrl && candidate.quote) {
    for (const lf of lineage) {
      if (lf.normalizedUrl === candidate.normalizedUrl && quoteOf(lf.anchor) === candidate.quote) {
        return { obligationId: lf.obligationId, matcher: 1 };
      }
    }
  }

  // matcher 2 — the Editor's own declaration (carriesObligationId), when it names an obligation on this project.
  if (candidate.carriesObligationId && obligationIds.has(candidate.carriesObligationId)) {
    return { obligationId: candidate.carriesObligationId, matcher: 2 };
  }

  // matcher 3 — anchor overlap: same kind + quote overlap ≥ floor. Flag-gated (default off).
  if (options.anchorOverlapMatcher && candidate.quote) {
    const floor = options.anchorOverlapFloor ?? 0.8;
    let best: { obligationId: string; score: number } | null = null;
    for (const lf of lineage) {
      if (lf.kind !== candidate.kind) continue;
      const score = quoteOverlap(candidate.quote, quoteOf(lf.anchor));
      if (score >= floor && (!best || score > best.score)) best = { obligationId: lf.obligationId, score };
    }
    if (best) return { obligationId: best.obligationId, matcher: 3 };
  }

  return null;
}
