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
 * A numeric count param — the import-count flash (`?p=`,`?v=`,`?f=`). The router's JSON-shaped
 * parse turns `?p=2` into the NUMBER 2 (and the mutation envelope's redirect emits the bare
 * digits), so the narrowing accepts a finite number or a numeric string and answers the number;
 * anything else drops the key.
 */
export const numParam: SearchNarrow = (v) => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return undefined;
};

/**
 * The `?saved=1`-style flag — the canonical answer is the STRING "1" (the `=== "1"` check every
 * leaf and the document's `c.req.query("saved") === "1"` both key on). `?saved=1` reaches the
 * router parsed as the number 1, so the narrowing normalizes `1 | "1"` → "1"; any other value
 * stays out of the strict set and the component's `=== "1"` correctly refuses to flash.
 */
export const flagParam: SearchNarrow = (v) => (v === "1" || v === 1 ? "1" : undefined);

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
