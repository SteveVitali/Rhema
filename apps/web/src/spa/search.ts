// SPA.4 (REQ-NAV-3; design/25 §search-param schema) — `validateSearch` plumbing. The grammar is
// forward-compatible BY CONTRACT: unknown keys pass through untouched (today's handlers ignore
// unrecognized params), while the pinned known keys get their documented narrowing (literal
// enums like `?sort=title` validate against their closed set; a bogus value drops the key rather
// than smuggling garbage into the typed search object).

/** A narrowing for one known search key — returns the value or `undefined` (drop the key). */
export type SearchNarrow = (value: unknown) => unknown;

/** Any string value passes (opaque flash/notice keys — `?saved`, `?notice`, `?disposed`, …). */
export const strParam: SearchNarrow = (v) => (typeof v === "string" ? v : undefined);

/** A closed literal set — `one("title")`, `one("side","inline","moves")`, `one("1")`. */
export function oneParam(...allowed: readonly string[]): SearchNarrow {
  return (v) => (typeof v === "string" && allowed.includes(v) ? v : undefined);
}

/**
 * Build a route's `validateSearch`: copy every key through (forward-compatible), apply each known
 * key's narrowing, and drop a known key whose value fails its narrowing.
 */
export function validateSearchParams(
  known: Record<string, SearchNarrow>,
): (search: Record<string, unknown>) => Record<string, unknown> {
  return (search) => {
    const out: Record<string, unknown> = { ...search };
    for (const key of Object.keys(known)) {
      const v = known[key]!(search[key]);
      if (v === undefined) delete out[key];
      else out[key] = v;
    }
    return out;
  };
}
