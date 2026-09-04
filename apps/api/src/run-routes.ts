// Run creation + the internal run API (§12.4; §12.1 "api owns … run creation, internal run API"). Thin Hono
// adapters over @rhema/orchestrator: this file maps HTTP ⇆ the orchestrator functions and enforces run-token
// auth on the internal routes. The orchestration LOGIC (state machine, fencing, gates, ledger coupling) lives
// in the package; the live DB/Redis/queue clients behind `deps` are constructed at deploy (deferred).

import { Hono } from "hono";
import type { DecisionAction, WorkflowKey } from "@rhema/contracts";
import {
  createRun,
  heartbeat,
  postEvents,
  commitStep,
  failStep,
  audit,
  hydration,
  deliverRun,
  type DeliverRunDeps,
  resolveGate,
  recordGateActivity,
  holdGate,
  seatForWorkflow,
  phaseClassesForWorkflow,
  RUN_JOBS,
  RevokedTokenError,
  StaleTaskError,
  EventBatchTooLargeError,
  type OrchestratorDeps,
  type RunTokenClaims,
  type CommitNext,
  type GateActivity,
  type GateEdit,
  type ContentStore,
  type ModelProfile,
} from "@rhema/orchestrator";
import type { DeliveryArgs, ObligationHook } from "@rhema/mirror";

/** Auth principal for run creation — the session's user + billing scope (Better Auth wiring is P0.01/PRB). */
export interface Principal {
  readonly userId: string;
  readonly workspaceId: string;
  readonly billingAccountId: string;
}

export interface RunApiDeps extends OrchestratorDeps {
  /** Resolve the authenticated principal from the request (session cookie in prod). */
  principal(c: { req: { header(name: string): string | undefined } }): Principal | null;
  /** content store for serializing gate write-back overlays (REQ-SPEC-9); required to resolve gates with edits. */
  readonly store?: ContentStore;
  /**
   * The obligation spawn/join hook (P0.12; D-P0.12-1) constructed into the delivery transaction. Unset ⇒ the
   * mirror's no-op (the pre-P0.12 shape).
   */
  readonly obligationHook?: ObligationHook;
  /**
   * A per-run, workspace-BOUND content store factory (D-P0.09-1). Delivery reads prior versions, so it needs a
   * store scoped to the run's tenant (a run is single-tenant); the write-only `store` above cannot read. The
   * live deploy binds this to a GCS store bound to the run's workspace.
   */
  contentStoreFor?(workspaceId: string): Promise<ContentStore>;
  /**
   * The platform circuit breaker's new-run cap multiplier (REQ-SPEC-24.5; D-P0.11-1). Injected so run-routes
   * stays decoupled from the ledger; the deploy binds it to `circuitBreakerState` over a system-scoped read.
   * Unset ⇒ 1× (no scaling).
   */
  circuitBreaker?(now: Date): Promise<{ capMultiplier: 1 | 2 }>;
}

type Vars = { Variables: { run: RunTokenClaims } };

/** Map an orchestrator error to an HTTP status; rethrow anything else. */
function statusForError(e: unknown): number | null {
  if (e instanceof StaleTaskError) return 409;
  if (e instanceof RevokedTokenError) return 401;
  if (e instanceof EventBatchTooLargeError) return 413;
  return null;
}

/** The stable error code for a mapped orchestrator error. */
function codeForError(e: unknown): string {
  if (e instanceof StaleTaskError) return "stale_task";
  if (e instanceof EventBatchTooLargeError) return "event_batch_too_large";
  return "revoked";
}

export function createRunRoutes(deps: RunApiDeps): Hono<Vars> {
  const app = new Hono<Vars>();

  // ---- run creation: the sheet's Run click (REQ-CHAT-25 — the only run creator). ----
  app.post("/projects/:id/runs", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    const projectId = c.req.param("id");
    const body = (await c.req.json()) as CreateRunBody;
    if (!body.idempotencyKey || !body.workflow) return c.json({ error: "idempotencyKey and workflow required" }, 400);
    const workflow = body.workflow as WorkflowKey;

    // Circuit breaker (REQ-SPEC-24.5; D-P0.11-1): when absorbed cap-overruns have drifted past threshold in the
    // last 24 h, NEW runs get a 2× cap (widening the safety band while the estimator re-fits). Applied once at
    // creation; a no-op (1×) when the platform has absorbed nothing. Full estimator cap sizing is PRB.3.
    let capCredits = body.capCredits;
    if (deps.circuitBreaker && capCredits != null) {
      const { capMultiplier } = await deps.circuitBreaker(deps.clock.now());
      capCredits = capCredits * capMultiplier;
    }

    const res = await createRun(deps, {
      idempotencyKey: body.idempotencyKey,
      workflow,
      workspaceId: principal.workspaceId,
      billingAccountId: principal.billingAccountId,
      requestedBy: principal.userId,
      projectId,
      personaId: body.personaId,
      seat: seatForWorkflow(workflow),
      modelProfile: body.modelProfile,
      modelTier: body.modelTier,
      rigor: body.rigor,
      estimateCredits: body.estimateCredits,
      capCredits,
      rateTableVersion: body.rateTableVersion,
      phaseClassesUsed: phaseClassesForWorkflow(workflow),
      inputs: body.inputs ?? {},
      inputSnapshot: body.inputSnapshot ?? {},
      sheetLaunched: body.sheetLaunched ?? true,
      entitlementId: body.entitlementId,
      imageDigest: body.imageDigest,
      protocolsVersion: body.protocolsVersion,
      lockSetSpec: {
        projectId,
        personaId: body.personaId,
        draftId: body.draftId,
        nextDraftId: body.nextDraftId,
        corrKind: body.corrKind,
        corrK: body.corrK,
      },
    });

    if (res.ok) {
      // §12.4 step 3: a sheet-launched run lands in `queued`; enqueue the provision job so the worker
      // admits + provisions it (mints the token/credential, launches the run-task Job). pg-boss send is
      // post-commit + singleton-keyed on the runId, so a duplicate/replay is a no-op. A deduped replay
      // already enqueued it; an `awaiting_consent` run enqueues on the later consent transition, not here.
      if (res.state === "queued" && !res.deduped) {
        await deps.queue.send(RUN_JOBS.start, { runId: res.runId, workspaceId: principal.workspaceId }, { singletonKey: res.runId });
      }
      return c.json({ runId: res.runId, state: res.state, deduped: res.deduped }, res.deduped ? 200 : 201);
    }
    if (res.reason === "insufficient_balance") return c.json({ error: res.reason, required: res.required }, 402);
    return c.json({ error: res.reason, detail: res.error.message }, 422);
  });

  // ---- gate resolution: the user's decision (§6.4; §12.4 step 7). Session-authenticated (not a run token) —
  // the human, not the sandbox, resolves a gate. Writes the Decision, serializes any structured edits into
  // write-back overlays (REQ-SPEC-9), and resumes the run. ----
  app.post("/runs/:id/gates/:gid", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    const body = (await c.req.json()) as GateDecisionBody;
    if (!body.action) return c.json({ error: "action required" }, 400);
    const res = await resolveGate(deps, {
      runId: c.req.param("id"),
      gateId: c.req.param("gid"),
      workspaceId: principal.workspaceId,
      userId: principal.userId,
      action: body.action,
      presence: body.presence,
      guidance: body.guidance,
      standingRule: body.standingRule,
      edits: body.edits,
    });
    if (!res.ok) {
      if (res.reason === "insufficient_balance") return c.json({ error: res.reason, required: res.required }, 402);
      return c.json({ error: res.reason }, 404);
    }
    if (!res.resolved) return c.json({ resolved: false, reason: res.reason }, 409);
    return c.json({ resolved: true, state: res.state, overlayVersionIds: res.overlayVersionIds, guidanceId: res.guidanceId });
  });

  // record presence / reading activity on an open gate (§6.4 item 1/2; REQ-SPEC-18) — server-side deadline state.
  app.post("/runs/:id/gates/:gid/activity", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    const body = (await c.req.json()) as { activity: GateActivity };
    const res = await recordGateActivity(deps, { gateId: c.req.param("gid"), workspaceId: principal.workspaceId, activity: body.activity });
    return c.json(res);
  });

  // "Wait for me" — remove the deadline for this card without resolving it (§6.4 item 1).
  app.post("/runs/:id/gates/:gid/hold", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    const res = await holdGate(deps, { gateId: c.req.param("gid"), workspaceId: principal.workspaceId });
    return c.json(res);
  });

  // ---- internal run API: run-token auth; every call carries `attempt` (fencing) ----
  const internal = new Hono<Vars>();
  internal.use("/runs/:id/*", async (c, next) => {
    const auth = c.req.header("authorization");
    const token = auth?.startsWith("Bearer ") ? auth.slice(7) : undefined;
    const claims = token ? deps.tokens.verify(token) : null;
    if (!claims) return c.json({ error: "invalid_token" }, 401);
    if (claims.runId !== c.req.param("id")) return c.json({ error: "token_run_mismatch" }, 403);
    c.set("run", claims);
    await next();
  });

  const guard = async (c: { json: (b: unknown, s?: number) => Response }, fn: () => Promise<Response>): Promise<Response> => {
    try {
      return await fn();
    } catch (e) {
      const status = statusForError(e);
      if (status != null) return c.json({ code: codeForError(e) }, status as 401 | 409 | 413);
      throw e;
    }
  };

  internal.get("/runs/:id/hydration", (c) => {
    const run = c.get("run");
    return guard(c, async () => c.json(await hydration(deps, { runId: run.runId, attempt: run.attempt, workspaceId: run.workspaceId })));
  });

  internal.put("/runs/:id/heartbeat", (c) => {
    const run = c.get("run");
    return guard(c, async () => c.json(await heartbeat(deps, { runId: run.runId, attempt: run.attempt, workspaceId: run.workspaceId })));
  });

  internal.post("/runs/:id/events", (c) => {
    const run = c.get("run");
    return guard(c, async () => {
      const body = (await c.req.json()) as { events: EventBody[] };
      return c.json(
        await postEvents(deps, {
          runId: run.runId,
          attempt: run.attempt,
          workspaceId: run.workspaceId,
          events: body.events ?? [],
        }),
      );
    });
  });

  internal.post("/runs/:id/steps/:key/commit", (c) => {
    const run = c.get("run");
    return guard(c, async () => {
      const body = (await c.req.json()) as CommitBody;
      const res = await commitStep(deps, {
        runId: run.runId,
        attempt: run.attempt,
        workspaceId: run.workspaceId,
        stepKey: c.req.param("key"),
        ordinal: body.ordinal,
        of: body.of,
        producedVersionIds: body.producedVersionIds,
        credits: body.credits,
        durationMs: body.durationMs,
        result: body.result,
        next: body.next,
      });
      return c.json(res, res.ok ? 200 : 409);
    });
  });

  // Finalize → deliver (§12.4 step 8; D-P0.09-1/D-P0.12-1). The run-task posts the delivering dossier at the
  // final commit; the api runs the @rhema/mirror delivery transaction (validation → correspondence + freeze +
  // the obligation hook → attestation) atomically with `finalizing → completed`. The content store is bound to
  // the run's workspace (delivery reads prior versions); the obligation hook is constructed at deploy.
  internal.post("/runs/:id/deliver", (c) => {
    const run = c.get("run");
    return guard(c, async () => {
      const body = (await c.req.json()) as DeliverBody;
      const store = deps.contentStoreFor ? await deps.contentStoreFor(run.workspaceId) : deps.store;
      if (!store) return c.json({ error: "delivery requires a content store" }, 500);
      const deliverDeps: DeliverRunDeps = {
        ...deps,
        store,
        ...(deps.obligationHook ? { obligationHook: deps.obligationHook } : {}),
      };
      const res = await deliverRun(deliverDeps, {
        billingAccountId: body.billingAccountId,
        spentCredits: body.spentCredits,
        capCredits: body.capCredits,
        ...(body.holdLedgerId ? { holdLedgerId: body.holdLedgerId } : {}),
        ...(body.refundCredits != null ? { refundCredits: body.refundCredits } : {}),
        ...(body.byPhase ? { byPhase: body.byPhase } : {}),
        delivery: body.delivery,
      });
      return c.json(res, res.ok ? 200 : 409);
    });
  });

  internal.post("/runs/:id/steps/:key/fail", (c) => {
    const run = c.get("run");
    return guard(c, async () => {
      const body = (await c.req.json()) as { ordinal: number; errorClass: string; reason?: string };
      const res = await failStep(deps, {
        runId: run.runId,
        attempt: run.attempt,
        workspaceId: run.workspaceId,
        stepKey: c.req.param("key"),
        ordinal: body.ordinal,
        errorClass: body.errorClass,
        reason: body.reason,
      });
      return c.json(res, res.ok ? 200 : 409);
    });
  });

  internal.post("/runs/:id/audit", (c) => {
    const run = c.get("run");
    return guard(c, async () => {
      const body = (await c.req.json()) as Parameters<typeof audit>[1]["rows"];
      return c.json(await audit(deps, { runId: run.runId, attempt: run.attempt, workspaceId: run.workspaceId, rows: body }));
    });
  });

  app.route("/internal", internal);
  return app;
}

interface CreateRunBody {
  idempotencyKey: string;
  workflow: string;
  personaId?: string;
  modelProfile: ModelProfile;
  modelTier: "base" | "balanced" | "frontier";
  rigor: "quick" | "standard" | "full_board";
  estimateCredits: number;
  capCredits: number;
  rateTableVersion: number;
  inputs?: Record<string, unknown>;
  inputSnapshot?: Record<string, unknown>;
  sheetLaunched?: boolean;
  entitlementId?: string;
  imageDigest?: string;
  protocolsVersion?: string;
  draftId?: string;
  nextDraftId?: string;
  corrKind?: string;
  corrK?: number;
}
interface EventBody {
  type: Parameters<typeof postEvents>[1]["events"][number]["type"];
  payload: unknown;
  agentLabel?: string;
}
interface CommitBody {
  ordinal: number;
  of: number;
  producedVersionIds?: string[];
  credits: number;
  durationMs?: number;
  result: { status: "done"; sdkSubtype: string; predicatesPassed: boolean; compactions: number };
  next: CommitNext;
}
/** The finalizing run's delivery payload the run-task posts to `POST /internal/runs/:id/deliver`. */
interface DeliverBody {
  billingAccountId: string;
  spentCredits: number;
  capCredits: number;
  holdLedgerId?: string;
  refundCredits?: number;
  byPhase?: Record<string, number>;
  delivery: DeliveryArgs;
}
interface GateDecisionBody {
  action: DecisionAction;
  presence?: boolean;
  guidance?: string;
  standingRule?: boolean;
  edits?: GateEdit;
}
