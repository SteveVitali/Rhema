// Delivery-time validation (REQ-DATA-7 amended; REQ-VIS-9; §12.8(c)). The final harvest of a delivering step
// must pass, at commit:
//   • SIDECAR validation — every sidecar parses against its P0.02 schema (parsers own this); a failure is
//     `failed(validation)`, never a silent partial.
//   • CITED ⇒ FETCHED (REQ-VIS-9 amended) — every `claim.url` AND every `claim.sources[].url` must appear in
//     the run's PROXY fetch log (the log the sandbox cannot write); a missing url fails delivery.
//   • the MODEL-INDEPENDENT VERDICT SOURCE CHECK (§12.8(c); REQ-SPEC-25(c)) — a `verified`/`contradicted`
//     Tier-1 verdict must cite a URL whose registrable domain matches the claim's own citation, is on the
//     curated reputable-source list, or was reached from a SEARCH result (never only from a link inside a
//     fetched page); otherwise the verdict is DOWNGRADED to `unverifiable` with `sourceCheck:'suspicious_source'`.
//   • the PRODUCER check — the second read's `producerQueryId` must be an orchestrator-launched scoped query.

import type { ClaimVerdict, ClaimSourceCheck, SidecarFilename } from "@rhema/contracts";
import { parseSidecar, verdictDeterminingSource } from "@rhema/protocols";
import type { ClaimLedgerSidecar } from "@rhema/contracts";
import type { SqlExecutor } from "./sql.js";

type ClaimRow = ClaimLedgerSidecar["claims"][number];

// ---------------------------------------------------------------- url normalization + registrable domain

/** Normalize a URL for cited⇒fetched matching: lower-case scheme+host + path, drop query/fragment (anti-exfil,
 *  matching @rhema/hooks' path-ignoring-query rule and the proxy's normalized_url). */
export function normalizeUrl(raw: string): string {
  try {
    const u = new URL(raw);
    const path = u.pathname.replace(/\/+$/, "") || "/";
    return `${u.protocol.toLowerCase()}//${u.host.toLowerCase()}${path}`;
  } catch {
    return raw.trim().toLowerCase();
  }
}

/** A small public-suffix set so `registrableDomain` returns eTLD+1 for the common multi-part TLDs. */
const MULTI_PART_TLDS = new Set([
  "co.uk", "org.uk", "ac.uk", "gov.uk", "co.jp", "com.au", "org.au", "co.nz", "co.in", "com.br",
]);

/** The registrable domain (eTLD+1) of a URL's host, lower-cased — the unit §12.8(c) compares. */
export function registrableDomain(raw: string): string {
  let host: string;
  try {
    host = new URL(raw).host.toLowerCase().replace(/:\d+$/, "");
  } catch {
    host = raw.toLowerCase();
  }
  const labels = host.split(".").filter(Boolean);
  if (labels.length <= 2) return labels.join(".");
  const lastTwo = labels.slice(-2).join(".");
  if (MULTI_PART_TLDS.has(lastTwo)) return labels.slice(-3).join(".");
  return lastTwo;
}

// ---------------------------------------------------------------- sidecar validation

export interface SidecarInput {
  readonly filename: SidecarFilename;
  readonly json: unknown;
  readonly markdown?: string;
}
export interface SidecarValidation {
  readonly ok: boolean;
  readonly failures: ReadonlyArray<{ filename: SidecarFilename; errors: string[] }>;
}

/** Validate every delivered sidecar against its schema (+ markdown twin cross-check where applicable). */
export function validateSidecars(sidecars: readonly SidecarInput[]): SidecarValidation {
  const failures: { filename: SidecarFilename; errors: string[] }[] = [];
  for (const s of sidecars) {
    const r = parseSidecar(s.filename, { json: s.json, ...(s.markdown !== undefined ? { markdown: s.markdown } : {}) });
    if (r.parseStatus === "failed") failures.push({ filename: s.filename, errors: r.errors });
  }
  return { ok: failures.length === 0, failures };
}

// ---------------------------------------------------------------- cited ⇒ fetched (REQ-VIS-9)

export interface CitedFetchedMiss {
  readonly claimOrdinal: number;
  readonly url: string;
  readonly which: "claim" | "source";
}
export interface CitedFetchedResult {
  readonly ok: boolean;
  readonly misses: readonly CitedFetchedMiss[];
}

/**
 * Every cited url — `claim.url` and every `claim.sources[].url` — must appear in the proxy fetch log
 * (REQ-VIS-9 amended / REQ-OBJ-18). `fetchedNormalizedUrls` is the set of normalized urls the proxy actually
 * fetched (decision=allow); a claim url absent from it fails delivery.
 */
export function validateCitedFetched(
  claims: readonly ClaimRow[],
  fetchedNormalizedUrls: ReadonlySet<string>,
): CitedFetchedResult {
  const misses: CitedFetchedMiss[] = [];
  const seen = (url: string): boolean => fetchedNormalizedUrls.has(normalizeUrl(url));
  for (const c of claims) {
    if (c.url && !seen(c.url)) misses.push({ claimOrdinal: c.ordinal, url: c.url, which: "claim" });
    for (const s of c.sources ?? []) {
      if (!seen(s.url)) misses.push({ claimOrdinal: c.ordinal, url: s.url, which: "source" });
    }
  }
  return { ok: misses.length === 0, misses };
}

// ---------------------------------------------------------------- verdict source check (§12.8(c))

/** Verdicts whose Tier-1 form must pass the source check (REQ-SPEC-25(c)). */
const TIER1_ENFORCED_VERDICTS: ReadonlySet<ClaimVerdict> = new Set(["verified", "contradicted"]);

export interface VerdictSourceContext {
  /** registrable domains the claim itself cites (the author's own citation). */
  readonly citationDomains: ReadonlySet<string>;
  /** registrable domains on the curated reputable-source list. */
  readonly reputableDomains: ReadonlySet<string>;
  /** registrable domains reached from a SEARCH result (never only from a link inside a fetched page). */
  readonly searchResultDomains: ReadonlySet<string>;
}

export interface VerdictSourceOutcome {
  readonly verdict: ClaimVerdict;
  readonly sourceCheck?: ClaimSourceCheck;
  readonly downgraded: boolean;
}

/**
 * Apply the model-independent verdict source check to ONE claim (§12.8(c)). A Tier-1 `verified`/`contradicted`
 * verdict whose verdict-determining source's registrable domain is not citation-matching, reputable, or
 * search-reached is downgraded to `unverifiable` + `sourceCheck:'suspicious_source'`. Other claims pass through.
 */
export function verdictSourceCheck(claim: ClaimRow, ctx: VerdictSourceContext): VerdictSourceOutcome {
  if (claim.tier !== 1 || !TIER1_ENFORCED_VERDICTS.has(claim.verdict)) {
    return { verdict: claim.verdict, downgraded: false, ...(claim.sourceCheck ? { sourceCheck: claim.sourceCheck } : {}) };
  }
  const source = verdictDeterminingSource(claim) ?? (claim.url ? { url: claim.url } : null);
  const domain = source ? registrableDomain(source.url) : "";
  if (domain && ctx.citationDomains.has(domain)) return { verdict: claim.verdict, sourceCheck: "matches_citation", downgraded: false };
  if (domain && ctx.reputableDomains.has(domain)) return { verdict: claim.verdict, sourceCheck: "reputable_list", downgraded: false };
  if (domain && ctx.searchResultDomains.has(domain)) return { verdict: claim.verdict, sourceCheck: "from_search", downgraded: false };
  // suspicious: reached only from inside a fetched page (or no source at all) — downgrade at commit.
  return { verdict: "unverifiable", sourceCheck: "suspicious_source", downgraded: true };
}

export interface AppliedClaim {
  readonly claim: ClaimRow;
  readonly verdict: ClaimVerdict;
  readonly sourceCheck?: ClaimSourceCheck;
  readonly downgraded: boolean;
}

/** Apply the verdict source check across a claim ledger, returning each claim's (possibly downgraded) verdict. */
export function applyVerdictSourceChecks(claims: readonly ClaimRow[], ctx: VerdictSourceContext): AppliedClaim[] {
  return claims.map((claim) => {
    const o = verdictSourceCheck(claim, ctx);
    return { claim, verdict: o.verdict, downgraded: o.downgraded, ...(o.sourceCheck ? { sourceCheck: o.sourceCheck } : {}) };
  });
}

/** A small curated reputable-source list (registrable domains). Extended by the caller as the list grows. */
export const DEFAULT_REPUTABLE_DOMAINS: ReadonlySet<string> = new Set([
  "nature.com", "science.org", "nih.gov", "who.int", "reuters.com", "apnews.com", "nytimes.com",
  "washingtonpost.com", "economist.com", "jstor.org", "arxiv.org", "gov.uk",
]);

// ---------------------------------------------------------------- producer check (second read)

export interface ProducerCheckResult {
  readonly ok: boolean;
  readonly reason?: string;
}

/**
 * The second read must be produced by the orchestrator-launched input-scoped query (§12.2 F17): its
 * `producer_query_id` must match a recorded `subagent_launches` row for this run with an `explicit_files`
 * scope. A parent-Editor-spawned second read (no launch record) fails delivery.
 */
export async function checkSecondReadProducer(
  exec: SqlExecutor,
  args: { runId: string; producerQueryId: string | null | undefined },
): Promise<ProducerCheckResult> {
  if (!args.producerQueryId) return { ok: false, reason: "second read has no producerQueryId" };
  const res = await exec.query(
    `select 1 from subagent_launches
      where run_id = $1 and producer_query_id = $2 and label = 'second-reader' and inputs_kind = 'explicit_files'`,
    [args.runId, args.producerQueryId],
  );
  if (res.rows.length === 0) {
    return { ok: false, reason: `second read producerQueryId ${args.producerQueryId} is not an orchestrator-launched scoped query` };
  }
  return { ok: true };
}
