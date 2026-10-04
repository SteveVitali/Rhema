// Canonical URL normalization for cited⇒fetched matching (REQ-VIS-9 / REQ-OBJ-18; CITE.1 / ADR-083).
//
// THIS IS THE ONE DEFINITION every cited⇒fetched participant shares: the delivery guard
// (`@rhema/mirror` `validateCitedFetched`), the findings-core ledger chip matcher (`fetchLogFromRows`),
// the benchmark scorer (`citationFetchCompliance`), the egress-proxy fetch-log normalizer, and every
// scan/probe that measures citation completeness. Until CITE.1 each layer carried its own copy that
// disagreed on query strings and trailing slashes — a cited `…/a/` stored as `…/a/` in the proxy log
// normalized to `…/a` in the claim ledger, so real retrievals read as misses and Path B stripped
// fetched citations (REQ-OBJ-18 violations).
//
// Semantics (the guard's, unchanged): lowercase scheme+host (the path stays case-sensitive — URL
// semantics); drop query, fragment, and trailing slashes; an unparseable string folds to its trimmed
// lowercase form. Dropping the query is the anti-exfil identity the hooks' path-ignoring-query rule
// already enforces — two URLs that differ only in the query are the same citation identity.

/** Normalize a URL for cited⇒fetched matching (the guard's canonical identity function). */
export function normalizeUrl(raw: string): string {
  try {
    const u = new URL(raw);
    const path = u.pathname.replace(/\/+$/, "") || "/";
    return `${u.protocol.toLowerCase()}//${u.host.toLowerCase()}${path}`;
  } catch {
    return raw.trim().toLowerCase();
  }
}
