// ACT.1 — the trial claim render model (REQ-SPEC-32(b) claims half; REQ-SPEC-8 amended; ADR-014/042).
// Every user-visible trial claim is a typed function of the entitlement config — the landing hero,
// the pricing Free column + trial rule + eligibility line, `includedNote`, the FAQ answer, the
// billing trial card, the sheet's Included line. Copy and mechanics are the same sentence: a surface
// never hand-types a cap, pocket, or ceiling figure, and a claim renders only while its source is
// live for the page's audience (`trial.audience` in pricing.json — off / test_tenants / everyone).
//
// `deriveTrialWordCap` is the pure derivation the published `trial.entitlement.wordCap` must equal:
// the largest candidate whose card's high-percentile (p90/p95 — measured or derived) metered list
// COGS stays under the provisional absorbed ceiling. Under the 1,500-word floor the derivation
// returns a named `below_floor` result — the operator sets the ceiling, never a silent clamp.

import { PRICING, planOf } from "./pricing.js";
import type { TrialSpec } from "./pricing.js";
import { PUBLIC_CLAIMS, type PublicClaimsConfig } from "./public-claims.js";
import { TRIAL_AUDIENCES, type TrialAudience } from "./trial.js";

// ---------------------------------------------------------------- audiences

export { TRIAL_AUDIENCES };
export type { TrialAudience };

/** Does the trial's go-live audience cover this viewer? `test_tenants` = JOURNEY.1's flagged
 *  `is_test` workspaces only (operator-set, never user-settable); the everyone-flip is the
 *  operator's pause. */
export function trialAudienceAllows(audience: TrialAudience | undefined, isTest: boolean): boolean {
  if (audience === "everyone") return true;
  if (audience === "test_tenants") return isTest;
  return false;
}

/**
 * Fold the trial audience into a public-claims config: `trial.firstReviewIncluded` is effectively
 * enabled iff the shipped flag is ON *and* this viewer is inside `trial.audience`. Every surface
 * resolves claims through here (anonymous ⇒ `isTest: false`); a claim the audience excludes can
 * never leak onto the page.
 */
export function claimsForAudience(
  cfg: PublicClaimsConfig = PUBLIC_CLAIMS,
  isTest: boolean,
  trial: Pick<TrialSpec, "audience"> = PRICING.trial,
): PublicClaimsConfig {
  return {
    enabled: {
      ...cfg.enabled,
      "trial.firstReviewIncluded":
        cfg.enabled["trial.firstReviewIncluded"] === true &&
        trialAudienceAllows(trial.audience, isTest),
    },
  };
}

// ---------------------------------------------------------------- generated note lines

const num = (n: number) => n.toLocaleString("en-US");

function fmt(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{(\w+)\}/g, (m, k: string) => vars[k] ?? m);
}

/** pricing.json carries the note as a `{cap}`/`{pocket}` template — the figures are generated
 *  here from the typed config, so no surface can drift from the entitlement's real terms. */
export function trialIncludedNote(t: TrialSpec = PRICING.trial): string {
  return fmt(t.includedNoteFmt, { cap: num(t.entitlement.wordCap), pocket: num(t.pocketCredits) });
}

/** The Free column's post-window honesty line — `{chatCredits}` resolves to the Free plan's
 *  daily chat allowance. */
export function trialPostTrialNote(t: TrialSpec = PRICING.trial): string {
  return fmt(t.postTrialNoteFmt, { chatCredits: num(planOf("free").dailyChatCredits ?? 0) });
}

/**
 * The sheet's Included-box detail line (REQ-BILL-4 — no dollars, no cap arithmetic): `coveredAll`
 * picks the "up to N words" or the over-cap "the first N words" phrasing; the word count is the
 * CONFIG cap (`wordCap` is only an override for tests).
 */
export function sheetEntitlementLine(args: { coveredAll: boolean; wordCap?: number }): string {
  const cap = num(args.wordCap ?? PRICING.trial.entitlement.wordCap);
  return args.coveredAll
    ? `Included — your trial run covers up to ${cap} words`
    : `Included — your trial run covers the first ${cap} words`;
}

/** The over-cap upgrade affordance — "review the first N words, or upgrade" (§14.3). */
export const TRIAL_UPGRADE_LINE = "Upgrade to review it all.";

// ---------------------------------------------------------------- the derived word cap

/** One evaluated cost point for the cap derivation: the high-percentile (p90+) metered list COGS
 *  in USD of the trial shape (Review · Standard · Base) at `words` — a measured `cost_card_cells`
 *  figure when one exists for the band, else the shared estimator's derived figure. */
export interface TrialCostPoint {
  readonly words: number;
  readonly p90Usd: number;
}

export type TrialCapDerivation =
  | {
      readonly status: "ok";
      /** the largest candidate under the ceiling — the published word cap. */
      readonly wordCap: number;
      readonly atUsd: number;
    }
  | {
      /** under the 1,500-word floor the operator sets the ceiling — a named result, never a clamp. */
      readonly status: "below_floor";
      readonly largestFit: number | null;
    };

export const TRIAL_CAP_FLOOR_WORDS = 1500;

/**
 * `deriveTrialWordCap(costCards, ceilingUsd)` — scan the evaluated candidates and take the largest
 * `words` whose p90 fits the ceiling. `points` are the caller's evaluated curve (one point per
 * candidate word count); the function carries no pricing knowledge so fixture cards exercise the
 * whole decision. `maxWords` bounds the search to the original §14.3 terms — the interim cap never
 * WIDENS the published promise without ECON.2's restore.
 */
export function deriveTrialWordCap(
  points: readonly TrialCostPoint[],
  ceilingUsd: number,
  opts?: { floorWords?: number; maxWords?: number },
): TrialCapDerivation {
  const floor = opts?.floorWords ?? TRIAL_CAP_FLOOR_WORDS;
  let best: TrialCostPoint | null = null;
  for (const p of points) {
    if (opts?.maxWords != null && p.words > opts.maxWords) continue;
    if (Number.isFinite(p.p90Usd) && p.p90Usd <= ceilingUsd && (best == null || p.words > best.words)) {
      best = p;
    }
  }
  if (best == null || best.words < floor) {
    return { status: "below_floor", largestFit: best?.words ?? null };
  }
  return { status: "ok", wordCap: best.words, atUsd: best.p90Usd };
}
