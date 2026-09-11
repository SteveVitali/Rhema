import type { ClaimLedgerSidecar } from "@rhema/contracts";

// Citation-fetch compliance scorer (§18 spirit; P0.15j / closes D-P0.15i-2 — the measurement that turns
// "prompt guessing" into hill-climbing). It quantifies exactly what the delivery guard `validateCitedFetched`
// (@rhema/mirror, REQ-VIS-9 / §12.8(c)) enforces all-or-nothing: of the URLs a fact-check's claim ledger cites
// (`claim.url` + every `claim.sources[].url`), what FRACTION appear in the run's proxy fetch log?
//
// The guard is a binary gate — one un-retrieved citation fails the ENTIRE review — so it tells you nothing about
// HOW CLOSE a fact-check is to compliant, and cannot drive iteration on the editorial-review citation discipline
// (or a model choice). This scorer reports the fraction + the exact per-URL misses, so a run's compliance is
// reportable, a fixture floor catches regressions, and a skill/model change can be scored against dev fixtures
// until it reaches 100% (Path A). It does NOT replace or weaken the guard — the guard stays the delivery
// authority; this is the instrument that measures the same quantity continuously.
//
// PARITY: matching a cited URL to the fetch log must use the SAME normalization the guard uses, or the score
// lies. The default `normalizeCitedUrl` below is a copy of @rhema/mirror `normalizeUrl` (kept here so this
// §18 scoring layer takes no dependency on the run-delivery layer); a live caller that already has mirror
// loaded SHOULD inject `normalize: normalizeUrl` for exact byte-parity. The parity cases are pinned in the test.

type ClaimRow = ClaimLedgerSidecar["claims"][number];

/** A minimal claim shape the scorer needs — a superset of it (the full sidecar row) is accepted. */
export interface CitedClaim {
  readonly ordinal: number;
  readonly url?: string;
  readonly sources?: ReadonlyArray<{ readonly url: string }>;
}

/**
 * Normalize a URL for cited⇒fetched matching — a copy of @rhema/mirror `normalizeUrl` (the guard's own
 * normalization), so the offline score matches the live guard. Lower-case scheme+host+path; drop trailing
 * slashes, query, and fragment. Keep in sync with mirror; the test pins the shared cases.
 */
export function normalizeCitedUrl(raw: string): string {
  try {
    const u = new URL(raw);
    const path = u.pathname.replace(/\/+$/, "") || "/";
    return `${u.protocol.toLowerCase()}//${u.host.toLowerCase()}${path}`;
  } catch {
    return raw.trim().toLowerCase();
  }
}

/** One cited URL that is absent from the fetch log — the same shape the guard reports. */
export interface CitationMiss {
  readonly claimOrdinal: number;
  readonly url: string;
  readonly which: "claim" | "source";
}

export interface CitationCompliance {
  /** distinct cited URLs (normalized) across the whole ledger — the denominator. */
  readonly citedUrls: number;
  /** distinct cited URLs that appear in the run's fetch log. */
  readonly fetchedCited: number;
  /** fetchedCited ÷ citedUrls in [0,1]; 1 when the ledger cites nothing (nothing to miss). */
  readonly compliance: number;
  /** true iff compliance === 1 — the guard would pass cited⇒fetched. */
  readonly compliant: boolean;
  /** every cited URL absent from the fetch log, one row per (claim, url, which). */
  readonly misses: readonly CitationMiss[];
  /** distinct normalized URLs that were missed — the deduplicated view of `misses`. */
  readonly missedUrls: number;
}

/**
 * Score a claim ledger's citation-fetch compliance against the set of URLs the proxy actually fetched.
 *
 * @param claims the fact-check's claim ledger rows (`claim.url` + `claim.sources[].url` are the cited URLs).
 * @param fetchedNormalizedUrls the NORMALIZED urls the proxy fetched this run (fetch_log `normalized_url`,
 *   decision=allow) — exactly the set the guard resolves citations against.
 * @param normalize the URL normalizer; defaults to `normalizeCitedUrl`. Inject @rhema/mirror `normalizeUrl`
 *   at a live call site for exact guard parity.
 *
 * Compliance is computed over DISTINCT normalized cited URLs (a URL cited by many claims counts once toward the
 * fraction), while `misses` lists every (claim, url) occurrence so a report can point at each offending claim.
 */
export function citationFetchCompliance(
  claims: readonly CitedClaim[],
  fetchedNormalizedUrls: ReadonlySet<string>,
  normalize: (u: string) => string = normalizeCitedUrl,
): CitationCompliance {
  const cited = new Set<string>();
  const missedSet = new Set<string>();
  const misses: CitationMiss[] = [];

  const record = (ordinal: number, url: string, which: "claim" | "source"): void => {
    const norm = normalize(url);
    cited.add(norm);
    if (!fetchedNormalizedUrls.has(norm)) {
      misses.push({ claimOrdinal: ordinal, url, which });
      missedSet.add(norm);
    }
  };

  for (const c of claims) {
    if (c.url) record(c.ordinal, c.url, "claim");
    for (const s of c.sources ?? []) record(c.ordinal, s.url, "source");
  }

  const citedUrls = cited.size;
  const fetchedCited = citedUrls - missedSet.size;
  const compliance = citedUrls === 0 ? 1 : fetchedCited / citedUrls;
  return {
    citedUrls,
    fetchedCited,
    compliance,
    compliant: missedSet.size === 0,
    misses,
    missedUrls: missedSet.size,
  };
}

/** Convenience: score a whole `01-claim-ledger.json` sidecar. */
export function claimLedgerCompliance(
  ledger: Pick<ClaimLedgerSidecar, "claims">,
  fetchedNormalizedUrls: ReadonlySet<string>,
  normalize: (u: string) => string = normalizeCitedUrl,
): CitationCompliance {
  return citationFetchCompliance(ledger.claims as readonly ClaimRow[], fetchedNormalizedUrls, normalize);
}

/**
 * Regression floor (fixture-floors spirit): assert a fact-check's citation-fetch compliance is at least `floor`
 * (default 1 — the delivery bar). Throws a descriptive error naming the compliance and the first misses, so a
 * skill/model regression that reintroduces un-retrieved citations turns a fixture red instead of silently
 * shipping. Returns the compliance report on success.
 */
export function assertCitationComplianceFloor(
  result: CitationCompliance,
  floor = 1,
  label = "citation-fetch compliance",
): CitationCompliance {
  if (result.compliance + 1e-9 < floor) {
    const sample = result.misses
      .slice(0, 5)
      .map((m) => `claim ${m.claimOrdinal} ${m.which} ${m.url}`)
      .join("; ");
    throw new Error(
      `${label} ${result.compliance.toFixed(3)} < floor ${floor} — ` +
        `${result.missedUrls}/${result.citedUrls} cited URLs not in the fetch log: ${sample}` +
        (result.misses.length > 5 ? ` (+${result.misses.length - 5} more)` : ""),
    );
  }
  return result;
}
