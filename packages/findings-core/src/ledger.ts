import type { Claim, ClaimVerdict, DispositionKind, FindingView, Severity } from "@rhema/contracts";

// Ledger + claim-ledger summaries (§5.7; deliverable 1). Pure row math the run card, letter header, and claims
// table read: disposition tallies, claim verdict/tier tallies, and the per-URL fetched-⇒-log join. Framework-free.

export interface LedgerSummary {
  readonly total: number;
  readonly byVerb: Record<DispositionKind, number>;
  readonly bySeverity: Record<Severity, number>;
  /** findings with no disposition yet (the triage backlog). */
  readonly undecided: number;
  /** findings applied via the free Apply verb (REQ-SPEC-6). */
  readonly applied: number;
}

const ZERO_VERBS: Record<DispositionKind, number> = { accept: 0, adapt: 0, rebut: 0, defer: 0, escalate: 0 };
const ZERO_SEV: Record<Severity, number> = { blocking: 0, major: 0, minor: 0, note: 0 };

/** Tally dispositions + severities across the findings (§5.7 "you pre-triaged 14 of 41"). */
export function summarizeLedger(views: readonly FindingView[]): LedgerSummary {
  const byVerb = { ...ZERO_VERBS };
  const bySeverity = { ...ZERO_SEV };
  let undecided = 0;
  let applied = 0;
  for (const v of views) {
    bySeverity[v.severity] += 1;
    if (v.disposition) {
      byVerb[v.disposition.kind] += 1;
      if (v.disposition.applied) applied += 1;
    } else {
      undecided += 1;
    }
  }
  return { total: views.length, byVerb, bySeverity, undecided, applied };
}

/** A normalized proxy fetch-log URL set (the source for cited⇒fetched — §12.7). */
export type FetchLog = ReadonlySet<string>;

/** Build a fetch-log lookup from the proxy's request-log rows (normalized URL is the join key). */
export function fetchLogFromRows(rows: readonly { readonly normalizedUrl: string }[]): FetchLog {
  return new Set(rows.map((r) => r.normalizedUrl));
}

/** A single claim URL + whether the proxy fetch log actually retrieved it (REQ-IDE-25; REQ-VIS-9). */
export interface ClaimUrlView {
  readonly url: string;
  readonly normalizedUrl: string;
  readonly accessedAt?: string;
  readonly stance?: "supports" | "contradicts" | "contextualizes";
  /** true iff this URL is present in the proxy fetch log — the "fetched ✓" chip (REQ-IDE-25). */
  readonly fetched: boolean;
}

function normalizeUrl(url: string, explicit?: string): string {
  if (explicit) return explicit;
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}${u.pathname}`.replace(/\/$/, "");
  } catch {
    return url;
  }
}

/**
 * The per-URL views for a claim (REQ-IDE-25; REQ-OBJ-18): every `sources[]` stance edge plus the singular
 * `url`, each stamped `fetched` iff its normalized URL is in the proxy log. A URL absent from the log gets NO
 * chip — the transparency floor made visible, not asserted.
 */
export function claimUrlViews(claim: Claim, fetchLog: FetchLog): ClaimUrlView[] {
  const out: ClaimUrlView[] = [];
  const seen = new Set<string>();
  const push = (url: string, normalizedUrl: string, accessedAt?: string, stance?: ClaimUrlView["stance"]): void => {
    if (seen.has(normalizedUrl)) return;
    seen.add(normalizedUrl);
    out.push({
      url,
      normalizedUrl,
      ...(accessedAt != null ? { accessedAt } : {}),
      ...(stance != null ? { stance } : {}),
      fetched: fetchLog.has(normalizedUrl),
    });
  };
  for (const s of claim.sources ?? []) {
    push(s.url, s.normalizedUrl, s.accessedAt, s.stance);
  }
  if (claim.url) {
    push(claim.url, normalizeUrl(claim.url, claim.normalizedUrl), claim.accessedAt);
  }
  return out;
}

/**
 * P1.07 — the same cited⇒fetched stamping for a FINDING's `evidence.urls` (§5.7 evidence block;
 * REQ-IDE-25). Each URL gets `fetched` iff its normalized form is in the proxy log.
 */
export function evidenceUrlViews(
  evidence: { readonly urls: readonly { readonly url: string; readonly accessed: string }[] } | undefined,
  fetchLog: FetchLog,
): ClaimUrlView[] {
  if (evidence == null) return [];
  return evidence.urls.map((u) => {
    const normalizedUrl = normalizeUrl(u.url);
    return { url: u.url, normalizedUrl, accessedAt: u.accessed, fetched: fetchLog.has(normalizedUrl) };
  });
}

export interface ClaimSummary {
  readonly total: number;
  readonly byVerdict: Partial<Record<ClaimVerdict, number>>;
  readonly byTier: Record<1 | 2 | 3, number>;
  /** the REQ-POS-3 proof count: Tier-1 claims the fact-check contradicted. */
  readonly contradictedTierOne: number;
  /** distinct URLs the proxy log confirms fetched across the ledger. */
  readonly fetchedUrls: number;
}

/** Tally the claim ledger by verdict/tier + the contradicted-Tier-1 and fetched-URL counts (§5.7). */
export function summarizeClaims(claims: readonly Claim[], fetchLog: FetchLog): ClaimSummary {
  const byVerdict: Partial<Record<ClaimVerdict, number>> = {};
  const byTier: Record<1 | 2 | 3, number> = { 1: 0, 2: 0, 3: 0 };
  let contradictedTierOne = 0;
  const fetched = new Set<string>();
  for (const c of claims) {
    byVerdict[c.verdict] = (byVerdict[c.verdict] ?? 0) + 1;
    byTier[c.tier] += 1;
    if (c.tier === 1 && c.verdict === "contradicted") contradictedTierOne += 1;
    for (const v of claimUrlViews(c, fetchLog)) if (v.fetched) fetched.add(v.normalizedUrl);
  }
  return { total: claims.length, byVerdict, byTier, contradictedTierOne, fetchedUrls: fetched.size };
}
