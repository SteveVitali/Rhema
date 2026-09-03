import type { Actor, ObligationState, ObligationSource, Severity, FindingKind } from "@rhema/contracts";
import type { SqlExecutor } from "@rhema/mirror";

// Shared types for @rhema/obligations. The obligation row's `state` is a cache of the last append-only
// obligation_transition (a DB trigger keeps them equal — §11.7); this package is the ONLY writer of
// obligation state, and it changes it ONLY by inserting a transition row (never a direct `set state`).

export type { SqlExecutor };

/** Injected id factory + clock (deterministic in tests), like every DI'd package on the chain. */
export interface ObligationDeps {
  readonly ids: (prefix: string) => string;
  readonly clock: { now(): Date };
}

/** A defer horizon (§11.7): a round count and/or a named boundary; the horizon's arrival returns it to `open`. */
export interface DeferHorizon {
  readonly rounds?: number;
  readonly until?: "next_review" | "pre_export";
}

/** What discharged it (§11.3 `dischargedBy`) — `verifiedBy` distinguishes verified vs by-hand "unverified". */
export interface DischargedBy {
  readonly dispositionId?: string;
  readonly moveOrdinal?: number;
  readonly draftId: string;
  readonly verifiedBy: "gap_check" | "re_review" | "user";
}

/** A revision obligation row, loaded and camelCased (§11.3 RevisionObligation). */
export interface ObligationRow {
  readonly id: string;
  readonly projectId: string;
  readonly source: ObligationSource;
  readonly findingId: string | null;
  readonly severity: Severity;
  readonly kind: FindingKind | null;
  readonly title: string;
  readonly state: ObligationState;
  readonly stateSince: Date;
  readonly openedOnDraftId: string | null;
  readonly rationale: string | null;
  readonly deferHorizon: DeferHorizon | null;
  readonly roundsOpen: number;
  readonly dischargedBy: DischargedBy | null;
  readonly createdBy: Actor;
  readonly createdAt: Date;
  readonly closedAt: Date | null;
}

/** A finding's lineage edge (which findings, across rounds, are the same debt — REQ-OBJ-4). */
export type ObligationRelation = "root" | "carried" | "regression";
