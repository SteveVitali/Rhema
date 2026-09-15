import type { Actor, ObligationState } from "@rhema/contracts";
import type { DeferHorizon, DischargedBy, ObligationDeps, SqlExecutor } from "./types.js";
import { loadObligation } from "./queries.js";

// The closed-world obligation state machine (REQ-OBJ-3). Every state change rides an append-only
// obligation_transitions row (the DB trigger caches it onto the row; a direct `set state` raises — 0003). This
// module is the ONLY writer of that table. "Closed-world" means: an obligation reaches a CLOSING state
// (discharged / rebutted / mooted — the trigger stamps `closed_at` for exactly these) only through a named
// cause below; there is no bulk close and no silent close. `rebut` and `defer` REQUIRE a rationale — enforced
// here for a clear error AND by the DDL check `state not in ('rebutted','deferred') or rationale is not null`.

/** The transition causes (the "how it moved"), each a named path in §11.7. */
export type ObligationCause =
  | "spawn" //      null → open: blocking/major at delivery, or minor on accept/adapt, or a user/agenda row
  | "address" //    a frozen response ledger recorded an accept/adapt move (status done/verified)
  | "rebut" //      a rebut disposition — rationale REQUIRED, copied onto the row (closed with an argument on file)
  | "defer" //      a defer disposition — rationale + horizon REQUIRED; the horizon's arrival returns it to open
  | "gap_check" //  a Full-board gap check verified the move (dischargedBy.verifiedBy = 'gap_check')
  | "no_match" //   the next covering Review matched no new finding onto the lineage (REQ-WF-7's "closed" set)
  | "user" //       a by-hand discharge with a required note ("discharged (unverified)"), or a manual un-defer
  | "moot" //       REQ-DATA-26's auto-disposition (mooted), confirmed at the next triage
  | "regression" // a delivered review matched a new finding onto an addressed/discharged lineage → reopened
  | "horizon"; //   a deferred obligation's horizon arrived → open
// NB: an `escalate` disposition is NOT a state transition — it keeps the obligation open and links a
// decision_request (decision_requests.obligation_id; §5.11). Recording a self-edge would reset `state_since`,
// which the stall/age surfaces read, so escalation writes no transition row.

/** The closing states (the trigger stamps `closed_at` for exactly these). */
export const CLOSING_STATES: ReadonlySet<ObligationState> = new Set(["discharged", "rebutted", "mooted"]);

interface Edge {
  readonly from: ObligationState | null;
  readonly to: ObligationState;
  readonly cause: ObligationCause;
  readonly rationaleRequired?: boolean;
}

// `open` and `reopened` are the two "actively open" states and share almost every outgoing edge (reopened is
// open-again after a regression). Build them from one list.
const OPEN_LIKE: ObligationState[] = ["open", "reopened"];
function fromOpenLike(to: ObligationState, cause: ObligationCause, rationaleRequired?: boolean): Edge[] {
  return OPEN_LIKE.map((from) => ({ from, to, cause, ...(rationaleRequired ? { rationaleRequired } : {}) }));
}

/** The complete edge set — the closed world. Anything not here is rejected by `assertValidTransition`. */
export const OBLIGATION_EDGES: readonly Edge[] = [
  { from: null, to: "open", cause: "spawn" },
  // routing from an actively-open obligation
  ...fromOpenLike("addressed", "address"),
  ...fromOpenLike("rebutted", "rebut", true),
  ...fromOpenLike("deferred", "defer", true),
  ...fromOpenLike("discharged", "gap_check"),
  ...fromOpenLike("discharged", "no_match"),
  ...fromOpenLike("discharged", "user"),
  ...fromOpenLike("mooted", "moot"),
  // an addressed move is verified/closed at the covering review, or regresses
  { from: "addressed", to: "discharged", cause: "gap_check" },
  { from: "addressed", to: "discharged", cause: "no_match" },
  { from: "addressed", to: "discharged", cause: "user" },
  { from: "addressed", to: "reopened", cause: "regression" },
  // REQ-DATA-26 mooting (a quote no longer resolves after a human revision) applies to any LIVE obligation.
  { from: "addressed", to: "mooted", cause: "moot" },
  { from: "deferred", to: "mooted", cause: "moot" },
  // a closed obligation regresses when a new finding matches its lineage (REQ-OBJ-4)
  { from: "discharged", to: "reopened", cause: "regression" },
  { from: "mooted", to: "reopened", cause: "regression" },
  // a deferral is a snooze: the horizon (or a manual pick-up) returns it to open
  { from: "deferred", to: "open", cause: "horizon" },
  { from: "deferred", to: "open", cause: "user" },
  // a moot the next triage did not confirm returns to open
  { from: "mooted", to: "open", cause: "user" },
];

const EDGE_KEYS = new Set(OBLIGATION_EDGES.map((e) => `${e.from ?? "∅"}>${e.to}:${e.cause}`));
const RATIONALE_EDGES = new Set(
  OBLIGATION_EDGES.filter((e) => e.rationaleRequired).map((e) => `${e.from ?? "∅"}>${e.to}:${e.cause}`),
);

/** A rejected transition — an edge outside the closed world, or a missing required rationale. */
export class ObligationTransitionError extends Error {
  constructor(readonly reason: string) {
    super(reason);
    this.name = "ObligationTransitionError";
  }
}

/** True iff `(from → to)` under `cause` is a permitted edge. */
export function isValidTransition(from: ObligationState | null, to: ObligationState, cause: ObligationCause): boolean {
  return EDGE_KEYS.has(`${from ?? "∅"}>${to}:${cause}`);
}

/** True iff the edge requires a rationale (rebut / defer). */
export function transitionRequiresRationale(
  from: ObligationState | null,
  to: ObligationState,
  cause: ObligationCause,
): boolean {
  return RATIONALE_EDGES.has(`${from ?? "∅"}>${to}:${cause}`);
}

function assertValidTransition(
  from: ObligationState | null,
  to: ObligationState,
  cause: ObligationCause,
  rationale: string | null | undefined,
): void {
  if (!isValidTransition(from, to, cause)) {
    throw new ObligationTransitionError(`no obligation transition ${from ?? "∅"} → ${to} via '${cause}' (closed-world; REQ-OBJ-3)`);
  }
  if (transitionRequiresRationale(from, to, cause) && !(rationale && rationale.trim())) {
    throw new ObligationTransitionError(`a '${cause}' transition (${from} → ${to}) requires a rationale (§11.7; DB-checked)`);
  }
}

export interface TransitionArgs {
  readonly obligationId: string;
  readonly to: ObligationState;
  readonly cause: ObligationCause;
  readonly byActor: Actor;
  /** the expected current state; when omitted it is read under the caller's tx. */
  readonly from?: ObligationState;
  readonly runId?: string | null;
  readonly dispositionId?: string | null;
  readonly findingId?: string | null;
  readonly rationale?: string | null;
  readonly deferHorizon?: DeferHorizon | null;
  readonly dischargedBy?: DischargedBy | null;
  readonly at?: Date;
}

/**
 * Apply a state transition to an EXISTING obligation. Reads its current state, validates the edge against the
 * closed world, sets any rationale / defer_horizon / discharged_by columns BEFORE the transition (so the DDL
 * `state not in ('rebutted','deferred') or rationale is not null` check sees the rationale when the trigger
 * flips the state), then inserts the obligation_transitions row (the trigger caches the new state).
 */
export async function applyObligationTransition(
  exec: SqlExecutor,
  deps: ObligationDeps,
  args: TransitionArgs,
): Promise<void> {
  const current = await loadObligation(exec, args.obligationId);
  if (!current) throw new ObligationTransitionError(`obligation ${args.obligationId} not found`);
  const from = args.from ?? current.state;
  if (args.from && current.state !== args.from) {
    throw new ObligationTransitionError(`obligation ${args.obligationId} is ${current.state}, not the expected ${args.from}`);
  }
  assertValidTransition(from, args.to, args.cause, args.rationale ?? current.rationale);
  await writeTransition(exec, deps, { ...args, from });
}

/**
 * The transition primitive shared by `applyObligationTransition` and `spawn` (null → open). Sets the
 * rationale/horizon/discharged_by columns (never `state`) then appends the transition row. Assumes the edge is
 * already validated by the caller.
 */
export async function writeTransition(
  exec: SqlExecutor,
  deps: ObligationDeps,
  args: Omit<TransitionArgs, "from"> & { readonly from: ObligationState | null },
): Promise<void> {
  const at = args.at ?? deps.clock.now();
  // 1. set the columns that must be present when the trigger flips the state (rationale for rebut/defer), plus
  //    the horizon and discharge evidence. These are NOT `state`, so the forbid-direct-state trigger is silent.
  const sets: string[] = [];
  const params: unknown[] = [];
  let i = 1;
  if (args.rationale !== undefined) { sets.push(`rationale = $${i++}`); params.push(args.rationale); }
  if (args.deferHorizon !== undefined) { sets.push(`defer_horizon = $${i++}`); params.push(args.deferHorizon ? JSON.stringify(args.deferHorizon) : null); }
  if (args.dischargedBy !== undefined) { sets.push(`discharged_by = $${i++}`); params.push(args.dischargedBy ? JSON.stringify(args.dischargedBy) : null); }
  if (sets.length > 0) {
    params.push(args.obligationId);
    await exec.query(`update revision_obligations set ${sets.join(", ")} where id = $${i}`, params);
  }
  // 2. append the transition — the DB trigger updates state / state_since / closed_at from it.
  await exec.query(
    `insert into obligation_transitions(id, obligation_id, from_state, to_state, cause, by_actor, run_id, disposition_id, finding_id, at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [
      deps.ids("otr"),
      args.obligationId,
      args.from,
      args.to,
      args.cause,
      JSON.stringify(args.byActor),
      args.runId ?? null,
      args.dispositionId ?? null,
      args.findingId ?? null,
      at,
    ],
  );
}
