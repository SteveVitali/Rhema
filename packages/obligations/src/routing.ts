import type { Actor, DispositionKind, DispositionStatus } from "@rhema/contracts";
import type { DeferHorizon, ObligationDeps, SqlExecutor } from "./types.js";
import { loadObligation } from "./queries.js";
import { applyObligationTransition, ObligationTransitionError } from "./state-machine.js";
import { spawnObligationFromFinding } from "./spawn.js";

// Routing (REQ-OBJ-3). A disposition ROUTES an already-open obligation — the debt exists at delivery, the
// disposition decides its fate: rebut closes it (with the rationale on file), defer parks it (with a horizon),
// accept/adapt with a completed move addresses it, escalate keeps it open and links a decision_request. This is
// the ONLY thing (besides the delivery hook's spawn/lineage/discharge) that transitions an obligation — the
// Revise skill's triage rows and the Findings-UI verbs both route through here (ticket Notes).

export interface RouteDispositionArgs {
  readonly obligationId: string;
  readonly kind: DispositionKind;
  /** accept/adapt address the obligation only once the move is made (status done/verified); else it's a no-op. */
  readonly status?: DispositionStatus;
  readonly dispositionId?: string;
  readonly findingId?: string;
  readonly rationale?: string; // required for rebut (and defer)
  readonly moveOrdinal?: number;
  readonly draftId: string;
  readonly runId?: string | null;
  readonly byActor: Actor;
  /** defer horizon (default `next_review`); rounds 1–3 or `pre_export` (§11.7). */
  readonly deferHorizon?: DeferHorizon;
  /** escalate: the Decisions-inbox request text + options (defaults provided). */
  readonly decisionText?: string;
  readonly decisionOptions?: readonly string[];
  readonly at?: Date;
}

export interface RouteResult {
  readonly transitioned: boolean;
  readonly to?: "addressed" | "rebutted" | "deferred";
  /** set when an escalate created (or re-used) a Decisions-inbox request. */
  readonly decisionRequestId?: string;
}

/**
 * Route a disposition to its obligation transition (REQ-OBJ-3). Returns what it did (a pre-triage accept whose
 * move is not yet made is a deliberate no-op — the debt stays open until the move lands).
 */
export async function routeDisposition(
  exec: SqlExecutor,
  deps: ObligationDeps,
  args: RouteDispositionArgs,
): Promise<RouteResult> {
  const at = args.at ?? deps.clock.now();
  // PRB.19 (live F33) — SAME-TARGET routing is idempotent: a disposition whose terminal state the obligation
  // already carries (e.g. a pretriage `rebut`/`defer` routed at record-time by the Findings-UI verb, then
  // re-routed when the frozen response ledger folds at delivery) is a no-op, NOT a closed-world error — the
  // second route re-states the same decision, and aborting the whole delivery tx on `rebutted → rebutted`
  // wedged prod run 01M2VDHN… in `finalizing`. A DIFFERENT target still validates against the closed world.
  const sameTargetNoop = async (target: "addressed" | "rebutted" | "deferred"): Promise<boolean> => {
    const current = await loadObligation(exec, args.obligationId);
    return current?.state === target;
  };
  switch (args.kind) {
    case "accept":
    case "adapt": {
      // addressed only once the move is recorded done/verified (a frozen response-ledger move — REQ-OBJ-3).
      if (args.status !== "done" && args.status !== "verified") return { transitioned: false };
      if (await sameTargetNoop("addressed")) return { transitioned: false, to: "addressed" };
      await applyObligationTransition(exec, deps, {
        obligationId: args.obligationId,
        to: "addressed",
        cause: "address",
        byActor: args.byActor,
        runId: args.runId ?? null,
        dispositionId: args.dispositionId ?? null,
        findingId: args.findingId ?? null,
        at,
      });
      return { transitioned: true, to: "addressed" };
    }
    case "rebut": {
      if (!(args.rationale && args.rationale.trim())) {
        throw new ObligationTransitionError("a rebut disposition requires a rationale (§11.7; DB-checked)");
      }
      if (await sameTargetNoop("rebutted")) return { transitioned: false, to: "rebutted" };
      await applyObligationTransition(exec, deps, {
        obligationId: args.obligationId,
        to: "rebutted",
        cause: "rebut",
        byActor: args.byActor,
        rationale: args.rationale,
        runId: args.runId ?? null,
        dispositionId: args.dispositionId ?? null,
        findingId: args.findingId ?? null,
        at,
      });
      return { transitioned: true, to: "rebutted" };
    }
    case "defer": {
      const horizon: DeferHorizon = args.deferHorizon ?? { until: "next_review" };
      // the DDL check requires a non-null rationale for deferred; default the §5.7 "Not this round" copy.
      const rationale = args.rationale && args.rationale.trim() ? args.rationale : "Not this round";
      if (await sameTargetNoop("deferred")) return { transitioned: false, to: "deferred" };
      await applyObligationTransition(exec, deps, {
        obligationId: args.obligationId,
        to: "deferred",
        cause: "defer",
        byActor: args.byActor,
        rationale,
        deferHorizon: horizon,
        runId: args.runId ?? null,
        dispositionId: args.dispositionId ?? null,
        findingId: args.findingId ?? null,
        at,
      });
      return { transitioned: true, to: "deferred" };
    }
    case "escalate": {
      // escalate keeps the obligation OPEN (no transition — a self-edge would reset state_since, which the
      // stall/age surfaces read) and LINKS a decision_request via decision_requests.obligation_id (§5.11).
      const decisionRequestId = await createDecisionRequest(exec, deps, {
        obligationId: args.obligationId,
        runId: args.runId ?? null,
        text: args.decisionText,
        options: args.decisionOptions,
      });
      return { transitioned: false, decisionRequestId };
    }
  }
}

/** A minor finding spawns its obligation only when the author accepts/adapts it, then it is immediately routed. */
export interface MinorAcceptAdaptArgs {
  readonly projectId: string;
  readonly findingId: string;
  readonly kind: string;
  readonly title: string;
  readonly correspondenceId: string;
  readonly draftId: string;
  readonly disposition: { readonly kind: "accept" | "adapt"; readonly status?: DispositionStatus; readonly id?: string; readonly moveOrdinal?: number };
  readonly byActor: Actor;
  readonly runId?: string | null;
  readonly at?: Date;
}

/**
 * Spawn-then-route a MINOR finding the author accepted/adapted (REQ-OBJ-2: minor spawns only on accept/adapt).
 * Returns the obligation id. The obligation is created `source: 'finding'` (the debt is a real finding) with the
 * user as actor, then addressed if the move is done/verified.
 */
export async function spawnAndRouteMinor(
  exec: SqlExecutor,
  deps: ObligationDeps,
  args: MinorAcceptAdaptArgs,
): Promise<string> {
  const obligationId = await spawnObligationFromFinding(exec, deps, {
    projectId: args.projectId,
    findingId: args.findingId,
    severity: "minor",
    kind: args.kind,
    title: args.title,
    correspondenceId: args.correspondenceId,
    draftId: args.draftId,
    byActor: args.byActor,
    ...(args.runId ? { runId: args.runId } : {}),
    ...(args.at ? { at: args.at } : {}),
  });
  await routeDisposition(exec, deps, {
    obligationId,
    kind: args.disposition.kind,
    ...(args.disposition.status ? { status: args.disposition.status } : {}),
    ...(args.disposition.id ? { dispositionId: args.disposition.id } : {}),
    ...(args.disposition.moveOrdinal !== undefined ? { moveOrdinal: args.disposition.moveOrdinal } : {}),
    findingId: args.findingId,
    draftId: args.draftId,
    byActor: args.byActor,
    ...(args.runId ? { runId: args.runId } : {}),
    ...(args.at ? { at: args.at } : {}),
  });
  return obligationId;
}

/**
 * Create (or reuse) a Decisions-inbox request for an obligation (ledger C18; §5.11). The request LINKS the
 * obligation via `decision_requests.obligation_id` (the spec's "links its decision_request" — REQ-OBJ-3), which
 * also makes it idempotent: an obligation that already carries an OPEN decision_request reuses it rather than
 * spamming the inbox with a duplicate every round. Returns the decision_request id.
 */
export async function createDecisionRequest(
  exec: SqlExecutor,
  deps: ObligationDeps,
  args: { obligationId: string; runId?: string | null; text?: string; options?: readonly string[] },
): Promise<string> {
  const ob = await loadObligation(exec, args.obligationId);
  if (!ob) throw new ObligationTransitionError(`obligation ${args.obligationId} not found`);
  const existing = await exec.query(
    `select id from decision_requests where obligation_id = $1 and state = 'open' order by id limit 1`,
    [args.obligationId],
  );
  const prior = existing.rows[0] as { id: string } | undefined;
  if (prior) return prior.id; // already escalated + open — do not duplicate the inbox row
  const id = deps.ids("dcr");
  const text = args.text ?? `Escalated obligation: ${ob.title}`;
  const options = (args.options ?? ["decide", "dismiss"]) as string[];
  await exec.query(
    `insert into decision_requests(id, project_id, source_run_id, obligation_id, text, options, state)
     values ($1,$2,$3,$4,$5,$6,'open')`,
    [id, ob.projectId, args.runId ?? null, args.obligationId, text, options],
  );
  return id;
}
