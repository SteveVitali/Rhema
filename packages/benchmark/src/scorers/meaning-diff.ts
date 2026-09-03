// Claim-inventory meaning-diff scorer (REQ-EVAL-12, C-e; deterministic). "A claim-inventory meaning diff in which
// every dropped/negated/weakened Tier-1 claim must trace to a disposed finding (the eval-side twin of §11.7's
// obligation lineage)." AC5: a "laundered" (surface-polished, substance-unchanged) fixture does not move the meaning
// diff — because its claim inventory is IDENTICAL to the pre-revision inventory (same claims, polarity, strength),
// only the prose changed; and every dropped Tier-1 claim either TRACES to a disposed finding or is a VIOLATION.
//
// A change to a Tier-1 (load-bearing) claim is legitimate only if a finding's disposition licensed touching it — so
// the caller supplies the set of claim ids a disposition licensed changing (the response-ledger join is P0.14; the
// scorer consumes the licensed set). An untraced Tier-1 change is a violation: the revision quietly altered a
// load-bearing claim the review never asked it to.

/** One claim in a draft's inventory. `tier` 1 = load-bearing (Tier-1); `polarity` + `strength` capture substance. */
export interface InventoryClaim {
  readonly claimId: string;
  readonly tier: number;
  readonly polarity: "assert" | "negate";
  /** claim strength/assertiveness in [0,1] — a reduction is a "weakening". */
  readonly strength: number;
  readonly text?: string;
}

export type MeaningChangeKind = "dropped" | "negated" | "weakened";

export interface MeaningChange {
  readonly claimId: string;
  readonly tier: number;
  readonly kind: MeaningChangeKind;
  /** true when a disposed finding licensed this change (it traces); false ⇒ a violation for a Tier-1 claim. */
  readonly traced: boolean;
}

export interface MeaningDiff {
  readonly changes: MeaningChange[];
  /** Tier-1 meaning changes — the ones that "move" the diff. */
  readonly tier1Changes: number;
  /** Tier-1 changes that do NOT trace to a disposed finding — the violations. */
  readonly tier1Violations: MeaningChange[];
  /** true when any Tier-1 claim was dropped/negated/weakened (a laundered fixture leaves this false). */
  readonly moved: boolean;
}

const STRENGTH_EPSILON = 1e-9;

/**
 * Diff a pre-revision claim inventory against a post-revision one.
 * @param pre  the claim inventory of the draft that was reviewed.
 * @param post the claim inventory of the arm-revised draft.
 * @param licensedClaimIds claim ids a disposed finding licensed changing (the obligation-lineage twin).
 */
export function meaningDiff(
  pre: readonly InventoryClaim[],
  post: readonly InventoryClaim[],
  licensedClaimIds: Iterable<string> = [],
): MeaningDiff {
  const licensed = new Set(licensedClaimIds);
  const postById = new Map(post.map((c) => [c.claimId, c] as const));
  const changes: MeaningChange[] = [];
  for (const p of pre) {
    const q = postById.get(p.claimId);
    let kind: MeaningChangeKind | null = null;
    if (!q) {
      kind = "dropped";
    } else if (q.polarity !== p.polarity) {
      kind = "negated";
    } else if (q.strength < p.strength - STRENGTH_EPSILON) {
      kind = "weakened";
    }
    if (kind) changes.push({ claimId: p.claimId, tier: p.tier, kind, traced: licensed.has(p.claimId) });
  }
  const tier1 = changes.filter((c) => c.tier === 1);
  const tier1Violations = tier1.filter((c) => !c.traced);
  return {
    changes,
    tier1Changes: tier1.length,
    tier1Violations,
    moved: tier1.length > 0,
  };
}
