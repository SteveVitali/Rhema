# ADR-083: Canonical URL identity — one `normalizeUrl` in @rhema/contracts, applied on both sides, and url-bearing `search` rows count as retrieval evidence

- **Status:** Proposed
- **Date:** 2026-10-04
- **Ticket:** CITE.1
- **Requirement ids:** REQ-VIS-9, REQ-IDE-25, REQ-OBJ-18
- **Spec:** §8.4 (REQ-VIS-9), §12.8(c), §5.7 (REQ-IDE-25), §18.3; ADR-006 (Path B)

## Context

The Path-B strip ("a cited URL that was never fetched is removed at delivery") silently over-fired
because the two sides of the cited⇒fetched join normalized differently:

- The delivery guard (`@rhema/mirror` `normalizeUrl`) drops the query + fragment, lowercases
  scheme/host, and strips trailing slashes.
- The proxy wrote `fetch_log.normalized_url` with its own normalizer that KEPT the query string and
  the path as stored. `https://x.test/a/?id=7` fetched vs `https://x.test/a` cited missed byte-for-byte
  and the citation was stripped as "unfetched" — a parity defect, not a model failure.
- The dossier's "fetched ✓" chip joined only `kind='fetch'` rows while the guard accepted
  `kind='search'` URL rows, so a search-retrieved citation passed the guard yet rendered chip-less.
- The benchmark scorer carried a THIRD normalization — a drift-prone duplicate.

Meanwhile `web_search` result URLs were logged as `kind='fetch'` rows, conflating "the fetch tool
downloaded the page" with "a search hit surfaced the URL" — two different evidence strengths the
ledger could not tell apart.

## Decision

1. **One canonical function.** `normalizeUrl(raw)` lives in `packages/contracts/src/url-normalize.ts`
   and is re-exported by `@rhema/mirror` so every existing import resolves the identical function.
   Semantics (the pre-existing guard definition): parse with `URL`; lowercase scheme + host; preserve
   path case; drop query + fragment; strip trailing slashes except a bare `/`; unparseable input falls
   back to trimmed lowercase text.
2. **Canonical-on-read, both sides.** The fetched side re-canonicalizes the stored
   `normalized_url`/`url` at join time (guard, dossier query, `/internal` retrieved-urls endpoint,
   findings-core `fetchLogFromRows`, benchmark scorer, citation scan). No migration rewrites stored
   rows — the stored richer form is preserved and normalized at the seam.
3. **The retrieved set is fetch ∪ url-bearing search rows.** A `web_search` result URL lands on a
   `kind='search'` row carrying `url`/`normalized_url` (no longer masquerading as a `fetch` row).
   Guard, chip, and scan all join the union — a citation the run's searches surfaced is retrieval
   evidence, but it is not a page fetch.
4. **Search-only coverage is labeled, not hidden.** The dossier response carries `searchResultLog`
   (the search-only subset); findings-core `claimUrlViews`/`evidenceUrlViews` stamp
   `retrievedBy: 'search'` and the UI renders a "Search result" chip/label instead of "Fetched ✓".
   A never-retrieved URL still gets no chip.
5. **`validateCitedFetched` signature and semantics are unchanged** — Path B still strips a citation
   with no retrieved row; its 12 pre-existing tests stay green.

## Consequences

- False strips from normalization drift are eliminated by construction (one function, both sides,
  parity tests over trailing-slash/query/case/fragment/search-row cases).
- Search-result citations are now honest in the ledger and the UI — the chip distinguishes "fetched
  page" from "search hit" instead of pretending parity or showing nothing.
- The scorer can no longer drift from the guard it scores.
- Stored `fetch_log.normalized_url` keeps the proxy's richer form; readers must canonicalize (the
  parity tests pin this at every read seam).

## Alternatives considered

- **Migrate stored `normalized_url` to the canonical form** — rejected: a rewrite of the append-only
  log of record for a defect the read seam can fix; it also destroys information the proxy
  legitimately records (the query is useful for forensics even though identity ignores it).
- **Keep search hits out of the retrieved set** — rejected: it re-creates the guard↔chip divergence
  in the opposite direction and strips citations the run demonstrably retrieved.
- **Leave the scorer's own normalizer** — rejected: it was the third definition and the exact class
  of drift this ticket exists to remove.

## Revisit trigger

Reopen if a cited URL class needs query-sensitive identity (e.g., `?p=`-addressed pages on hosts where
the path is constant), or if `fetch_log` gains a distinct `kind` for search hits that changes what
"retrieved" means under §12.8(c)'s verdict-source check.
