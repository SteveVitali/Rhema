// @rhema/egress-proxy — the n-gram exfil check for `search.performed` (§12.8d; REQ-SPEC-25 proxy half).
//
// A prompt-injected Editor can leak an unpublished draft a few dozen words at a time through search queries
// (`web_search("<a sentence of the draft>")`). The proxy diffs every search query against the run's draft
// n-grams; a run of ≥ 12 consecutive words shared between the query and the draft raises `suspicious_query`,
// which pauses the run (REQ-ARCH-32; the pause reaction is P0.08). This is the longest CONTIGUOUS shared
// word-run between the two token sequences — an appended/re-ordered word cannot dodge it.

const SUSPICIOUS_QUERY_MIN_WORDS = 12 as const;

/** Tokenize to a lowercase word sequence (letters/digits), dropping punctuation and whitespace. */
export function words(text: string): string[] {
  return text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
}

/**
 * Length (in words) of the longest run of CONSECUTIVE words shared by `query` and `draft`. Classic
 * longest-common-substring DP over the token sequences, rolling the short (query) dimension so memory is
 * O(query words). Returns 0 when either side is empty.
 */
export function longestConsecutiveWordMatch(query: string, draft: string): number {
  const q = words(query);
  const d = words(draft);
  if (q.length === 0 || d.length === 0) return 0;
  let prev = new Array<number>(q.length + 1).fill(0);
  let best = 0;
  for (let di = 0; di < d.length; di++) {
    const cur = new Array<number>(q.length + 1).fill(0);
    const dw = d[di];
    for (let qi = 1; qi <= q.length; qi++) {
      if (q[qi - 1] === dw) {
        const run = (prev[qi - 1] ?? 0) + 1;
        cur[qi] = run;
        if (run > best) best = run;
      }
    }
    prev = cur;
  }
  return best;
}

/** The default n-gram threshold (§12.8d: a match ≥ 12 words). */
export const SUSPICIOUS_QUERY_THRESHOLD = SUSPICIOUS_QUERY_MIN_WORDS;

/**
 * Diff a search query against the draft. `suspicious` is true when the longest shared consecutive word-run
 * reaches `threshold` (default 12). With no draft to diff against, never suspicious.
 */
export function checkSearchQuery(
  query: string,
  draft: string | undefined,
  threshold: number = SUSPICIOUS_QUERY_MIN_WORDS,
): { suspicious: boolean; matchLength: number } {
  if (!draft) return { suspicious: false, matchLength: 0 };
  const matchLength = longestConsecutiveWordMatch(query, draft);
  return { suspicious: matchLength >= threshold, matchLength };
}
