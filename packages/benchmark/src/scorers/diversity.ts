import { jaccard } from "../stats.js";

// Inter-arm finding-diversity scorer (REQ-EVAL-9 C-f; deterministic): "inter-arm finding diversity is a first-class
// metric (the second read's value proposition and the anti-hivemind check)." Given each arm's set of gold-issue
// ids it covered (or any shared finding-cluster ids), measure how much UNIQUE ground each arm covers and how similar
// the arms are to one another. High pairwise similarity across arms is the hivemind signal; a high unique-coverage
// arm is one that sees what the others miss.

export interface ArmCoverage {
  readonly arm: string;
  /** the ids (gold issues, or finding clusters) this arm covered. */
  readonly ids: ReadonlySet<string>;
}

export interface DiversityResult {
  /** the union of all arms' covered ids — total distinct ground covered. */
  readonly unionCoverage: number;
  /** per arm: how many ids it covered that NO other arm did. */
  readonly perArmUnique: Readonly<Record<string, number>>;
  /** per unordered arm pair: Jaccard similarity of their covered sets. */
  readonly pairwiseJaccard: ReadonlyArray<{ a: string; b: string; jaccard: number }>;
  /** mean pairwise Jaccard — a HIGH value is the hivemind signal (arms finding the same things). */
  readonly meanPairwiseJaccard: number;
}

export function findingDiversity(coverages: readonly ArmCoverage[]): DiversityResult {
  const union = new Set<string>();
  for (const c of coverages) for (const id of c.ids) union.add(id);

  // count how many arms cover each id, to attribute uniqueness.
  const coverCount = new Map<string, number>();
  for (const c of coverages) for (const id of c.ids) coverCount.set(id, (coverCount.get(id) ?? 0) + 1);

  const perArmUnique: Record<string, number> = {};
  for (const c of coverages) {
    let unique = 0;
    for (const id of c.ids) if (coverCount.get(id) === 1) unique += 1;
    perArmUnique[c.arm] = unique;
  }

  const pairwise: { a: string; b: string; jaccard: number }[] = [];
  for (let i = 0; i < coverages.length; i++) {
    for (let j = i + 1; j < coverages.length; j++) {
      pairwise.push({
        a: coverages[i]!.arm,
        b: coverages[j]!.arm,
        jaccard: jaccard(coverages[i]!.ids, coverages[j]!.ids),
      });
    }
  }
  const meanPairwiseJaccard =
    pairwise.length === 0 ? 0 : pairwise.reduce((s, p) => s + p.jaccard, 0) / pairwise.length;

  return { unionCoverage: union.size, perArmUnique, pairwiseJaccard: pairwise, meanPairwiseJaccard };
}
