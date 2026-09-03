import type { Finding, GoldFinding, MatchRecord } from "../types.js";

// Second-read marginal-contribution scorer (REQ-EVAL-13, deterministic). "The second read's marginal contribution
// is measured as gold-set hits unique to `origin=second_read` findings kept at reconciliation." A finding rejected
// at reconciliation (reconciliation === 'rejected') never counts. A gold hit is UNIQUE to the second read when its
// only kept matching finding(s) carry origin `second_read` — an `editor` or `both` (corroborated) match means the
// first pass would have caught it anyway. This supersedes §16.3 #13's in-product measurement; no upgrade copy may
// quote a second-read number from any other source.

export interface SecondReadContribution {
  /** distinct gold findings hit by at least one KEPT arm finding. */
  readonly goldHits: number;
  /** gold hits whose kept matches are ALL origin=second_read — lost without the second read. */
  readonly secondReadUniqueHits: number;
  /** secondReadUniqueHits ÷ goldHits (0 when there are no gold hits). */
  readonly marginalContribution: number;
}

function isKept(f: Finding): boolean {
  return f.reconciliation !== "rejected";
}

export function secondReadContribution(
  armFindings: readonly Finding[],
  _goldFindings: readonly GoldFinding[],
  matches: readonly MatchRecord[],
): SecondReadContribution {
  const armById = new Map(armFindings.map((f) => [f.id, f] as const));
  // gold finding id → the set of origins of the KEPT arm findings that matched it.
  const originsByGold = new Map<string, Set<string>>();
  for (const m of matches) {
    if (m.verdict !== "matched" || !m.goldFindingId) continue;
    const arm = armById.get(m.armFindingId);
    if (!arm || !isKept(arm)) continue;
    const set = originsByGold.get(m.goldFindingId) ?? new Set<string>();
    set.add(arm.origin);
    originsByGold.set(m.goldFindingId, set);
  }
  let goldHits = 0;
  let unique = 0;
  for (const origins of originsByGold.values()) {
    goldHits += 1;
    if (origins.size === 1 && origins.has("second_read")) unique += 1;
  }
  return {
    goldHits,
    secondReadUniqueHits: unique,
    marginalContribution: goldHits === 0 ? 0 : unique / goldHits,
  };
}
