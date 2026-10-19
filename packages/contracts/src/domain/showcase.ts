// P1.17 (§15.4; REQ-POS-3) — the Showcase fixture contract. The seeded Showcase dossier is a
// deterministic fixture (the real walkthrough essay is an H5 decision, deferred D-P1.17-1); whatever
// content the seed carries MUST satisfy the dossier's self-proving shape — at least one contradicted
// tier-1 claim backed by a fetched source URL — or the seed throws at write time.

import { anchorSchema } from "./anchor.js";

/** The showcase project's fixed slug base + title (one per workspace, seeded at provisioning). */
export const SHOWCASE_SLUG = "showcase";
export const SHOWCASE_TITLE = "Showcase — a worked example";

export interface ShowcaseFixtureClaim {
  readonly tier: number;
  readonly verdict: string;
  readonly sources?: readonly { url: string }[];
}

/** The fixture-finding shape the Apply pin reads (FIX.1 / REQ-FIX-T13F). */
export interface ShowcaseFixtureFinding {
  readonly suggestion?: { readonly replacement?: unknown };
  readonly anchor?: unknown;
}

/**
 * REQ-POS-3 — a showcase dossier must contain at least one TIER-1 claim whose verdict is
 * 'contradicted' AND which carries a fetched source URL (the cited⇒fetched audit). Throws on
 * violation — the fixture is validated before it is seeded and again by the contract test.
 *
 * FIX.1 (REQ-FIX-T13F) — when `findings` is supplied, the dossier's Apply substrate is pinned the
 * same way: at least one finding carries a `{replacement}` suggestion AND a schema-valid anchor
 * (the route splices `replacement` at the anchor's resolved span; a shape-level pin — the live
 * resolution against the working head is the seed test's job).
 */
export function assertShowcaseFixture(
  dossier: {
    readonly claims: readonly ShowcaseFixtureClaim[];
    /** loose on purpose — fixture rows carry many other fields; the pin narrows inside. */
    readonly findings?: readonly unknown[];
  },
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
  if (dossier.findings != null) {
    const findings = dossier.findings as readonly ShowcaseFixtureFinding[];
    const applyable = findings.some(
      (f) =>
        f.suggestion != null &&
        typeof f.suggestion.replacement === "string" &&
        f.suggestion.replacement.length > 0 &&
        anchorSchema.safeParse(f.anchor).success,
    );
    if (!applyable) {
      throw new Error(
        `${label}: REQ-FIX-T13F — a showcase dossier requires at least one finding carrying a ` +
          `{replacement} suggestion and a schema-valid anchor (the Apply substrate)`,
      );
    }
  }
}
