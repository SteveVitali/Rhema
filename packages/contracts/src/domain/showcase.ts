// P1.17 (§15.4; REQ-POS-3) — the Showcase fixture contract. The seeded Showcase dossier is a
// deterministic fixture (the real walkthrough essay is an H5 decision, deferred D-P1.17-1); whatever
// content the seed carries MUST satisfy the dossier's self-proving shape — at least one contradicted
// tier-1 claim backed by a fetched source URL — or the seed throws at write time.

/** The showcase project's fixed slug base + title (one per workspace, seeded at provisioning). */
export const SHOWCASE_SLUG = "showcase";
export const SHOWCASE_TITLE = "Showcase — a worked example";

export interface ShowcaseFixtureClaim {
  readonly tier: number;
  readonly verdict: string;
  readonly sources?: readonly { url: string }[];
}

/**
 * REQ-POS-3 — a showcase dossier must contain at least one TIER-1 claim whose verdict is
 * 'contradicted' AND which carries a fetched source URL (the cited⇒fetched audit). Throws on
 * violation — the fixture is validated before it is seeded and again by the contract test.
 */
export function assertShowcaseFixture(
  dossier: { readonly claims: readonly ShowcaseFixtureClaim[] },
  label = "Showcase fixture",
): void {
  const ok = dossier.claims.some(
    (c) =>
      c.tier === 1 &&
      c.verdict === "contradicted" &&
      (c.sources ?? []).some((s) => typeof s.url === "string" && s.url.length > 0),
  );
  if (!ok) {
    throw new Error(
      `${label}: REQ-POS-3 — a showcase dossier requires at least one contradicted tier-1 claim with a fetched source URL`,
    );
  }
}
