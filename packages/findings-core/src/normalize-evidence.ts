import { CLAIM_VERDICTS, type ClaimVerdict, type FindingEvidence } from "@rhema/contracts";

// HOT.1 (ADR-019) — the single evidence-shape read seam. `findings.evidence` is an unconstrained jsonb
// column and shipped shapes drifted: the canonical `{ claimId?, verdict?, urls: [{url, accessed?}] }`,
// the older sidecar carry `{ verdict }` with no `urls`, and the pre-canonical Showcase seed wrote an
// ARRAY of `{ claim, source }`. Reads that assumed `urls` existed 500'd the dossier. `normalizeEvidence`
// maps every observed shape to the canonical contract — `urls` is ALWAYS a (possibly empty) array in the
// output so readers never guard on its presence, only on `evidence` itself.
//
// Policy: normalize at READ, never backfill. The canonical shape lives in
// `@rhema/contracts` (`findingEvidenceSchema`); writers still emit it verbatim — this helper only
// repairs what history actually wrote.

const VERDICTS = new Set<string>(CLAIM_VERDICTS);

/**
 * The canonical post-normalization shape (ADR-019): the row-side `FindingEvidence.urls` stays
 * OPTIONAL so an unguarded `finding.evidence.urls` read fails typecheck; the normalized return
 * guarantees `urls` — `[]` when the stored blob carried none.
 */
export type NormalizedEvidence = Omit<FindingEvidence, "urls"> & {
  urls: { url: string; accessed?: string }[];
};

/** One legacy `{claim, source}` (or stray `{url}`) array item → a canonical url entry, or null. */
function legacyItemToUrl(item: unknown): { url: string; accessed?: string } | null {
  if (item == null || typeof item !== "object") return null;
  const o = item as Record<string, unknown>;
  const url = typeof o.url === "string" && o.url !== "" ? o.url
    : typeof o.source === "string" && o.source !== "" ? o.source
    : null;
  if (url == null) return null;
  // `claim` (the old free-text claim string) has no canonical slot — `claimId` is an id, not prose —
  // so it is intentionally dropped; the finding's title/body already carry the text.
  return typeof o.accessed === "string" && o.accessed !== ""
    ? { url, accessed: o.accessed }
    : { url };
}

/**
 * Lift any stored `evidence` blob to the canonical `{ claimId?, verdict?, urls }` shape.
 * - `null`/`undefined`/non-object (a stray string or number) → `undefined` (no evidence block).
 * - a legacy ARRAY → `{ urls }` from its `{claim, source}` / `{url}` items (empty array ⇒ `urls: []`).
 * - an object → `claimId`/`verdict` kept only when they are well-typed; `urls` filtered to entries with
 *   a real `url` string (missing/non-array `urls` ⇒ `[]`).
 */
export function normalizeEvidence(raw: unknown): NormalizedEvidence | undefined {
  if (raw == null) return undefined;
  if (Array.isArray(raw)) {
    return { urls: raw.flatMap((item) => {
      const u = legacyItemToUrl(item);
      return u == null ? [] : [u];
    }) };
  }
  if (typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;
  const urls = Array.isArray(o.urls)
    ? o.urls.flatMap((u) => {
        const v = legacyItemToUrl(u);
        return v == null ? [] : [v];
      })
    : [];
  const claimId = typeof o.claimId === "string" && o.claimId !== "" ? o.claimId : undefined;
  const verdict: ClaimVerdict | undefined =
    typeof o.verdict === "string" && VERDICTS.has(o.verdict) ? (o.verdict as ClaimVerdict) : undefined;
  return {
    ...(claimId != null ? { claimId } : {}),
    ...(verdict != null ? { verdict } : {}),
    urls,
  };
}
