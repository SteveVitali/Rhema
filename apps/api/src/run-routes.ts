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
  harvestStep,
  audit,
  hydration,
  buildHarnessRunSpec,
  deliverRun,
  finalizeRun,
  rateTableCreditRenderer,
  type CreditRenderer,
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
import { buildEstimate } from "@rhema/run-sheet";
import { captureGuidance } from "@rhema/orchestrator";
import { loadPretriage } from "./triage-routes.js";
import { computeReReviewSeed } from "./what-changed.js";
import { capFromEstimate } from "@rhema/contracts";
import { registrableDomain } from "@rhema/mirror";
import type { DeliveryArgs, NewVersion, ObligationHook, VerdictSourceContext } from "@rhema/mirror";
import type { AgentTypeKey } from "@rhema/contracts";
import type { UsageSnapshot } from "@rhema/engine";

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
  /**
   * Static config for the server-authored harness run spec (D-P0.15c-6): the image path the ported skills are
   * baked at, and the per-run USD ceiling the phase budget share is taken against. Unset ⇒ the runspec defaults
   * (`/app/skills`, dev `max_usd` $10). The deploy binds these from the image + stage config.
   */
  readonly runSpecConfig?: { readonly skillsDir?: string; readonly maxUsdPerRun?: number };
  /**
   * Provisional-credit renderer for the harvest route's running `usage.tick`/`sdk_stream` row (D-P0.15d-3).
   * Unset ⇒ the shared versioned rate-table renderer. Injected so tests can force a deterministic figure.
   */
  readonly renderCredits?: CreditRenderer;
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

    // Estimator cap sizing (PRB.3; REQ-BILL-3/6, §5.6 item 4). The cap is the hard proxy budget, so the
    // estimate + cap the run is CREATED with must be re-derived server-side from the levers, never trusted
    // from the client (a crafted or JS-stale POST could otherwise freeze money figures that do not match the
    // run's rigor/tier/inputs). For a beta sheet workflow we recompute `estimate` + `cap = ceil(1.5×estimate)`
    // from the run's frozen inputs (rigor, tier, word/claim counts); the circuit breaker then scales the cap.
    // A non-sheet workflow (not launchable from the beta sheet — REQ-WF-3) keeps the client figure, but the
    // cap is always floored at `ceil(1.5×estimate)` so it can never be sized below the guarantee.
    let estimateCredits = body.estimateCredits;
    let capCredits = body.capCredits;
    try {
      const snap = body.inputSnapshot ?? {};
      const derived = buildEstimate({
        workflow,
        rigor: body.rigor,
        modelTier: body.modelTier,
        inputs: {
          ...(typeof snap.wordCount === "number" ? { words: snap.wordCount } : {}),
          ...(typeof snap.claimCount === "number" ? { claims: snap.claimCount } : {}),
        },
        ...(typeof snap.claimCount === "number" ? { claimCount: snap.claimCount } : {}),
      });
      estimateCredits = derived.estimateCredits;
      capCredits = derived.capCredits;
    } catch {
      // not a beta sheet workflow — keep the client estimate but floor the cap at the 1.5× guarantee.
      if (estimateCredits != null) capCredits = Math.max(capCredits ?? 0, capFromEstimate(estimateCredits));
    }

    // Circuit breaker (REQ-SPEC-24.5; D-P0.11-1): when absorbed cap-overruns have drifted past threshold in the
    // last 24 h, NEW runs get a 2× cap (widening the safety band while the estimator re-fits). Applied once at
    // creation; a no-op (1×) when the platform has absorbed nothing.
    if (deps.circuitBreaker && capCredits != null) {
      const { capMultiplier } = await deps.circuitBreaker(deps.clock.now());
      capCredits = capCredits * capMultiplier;
    }

    // PRB.05 / REQ-IDE-28: pre-triage dispositions reach the Revise run as HIGHEST-PRECEDENCE guidance.
    // The user's unfrozen rows on the latest review correspondence serialize into `inputs.pretriage` as
    // a response-ledger sidecar (actor: "user") — the file-level source the triage phase reads — and a
    // run-scope guidance record states "you pre-triaged N of M" so the run never overrides a user row.
    let inputs = body.inputs ?? {};
    let pretriage: { triaged: number; total: number } | null = null;
    // PRB.06: prior_review is a SERVER-resolved fact (never client-trusted — a crafted input cannot point a
    // response at the wrong dossier, and a re-review's changed_since is computed from the store's bytes).
    //   · Revise: the response answers the project's latest review + reserves the v(N+1) draft row id its
    //     delivery creates (`nextDraftId`), so What-changed + the move trace find it deterministically.
    //   · Review: a re-review carries `priorReviewId` + `changedSince` (the vN→v(N+1) block diff the Editor
    //     reads first; human-edited blocks arrive as `humanAdded`/`unverifiable` placeholders, REQ-DATA-25).
    if (workflow === "revise") {
      const pre = await deps.txRunner.run(principal.workspaceId, (tx) => loadPretriage(tx, projectId));
      if (pre.correspondenceId != null) inputs = { ...inputs, priorReviewId: pre.correspondenceId };
      inputs = { ...inputs, nextDraftId: deps.ids("dft") };
      if (pre.correspondenceId != null && pre.entries.length > 0) {
        inputs = {
          ...inputs,
          pretriage: {
            correspondenceId: pre.correspondenceId,
            sidecar: "response_ledger",
            version: 1,
            entries: pre.entries,
          },
        };
        pretriage = { triaged: pre.triaged, total: pre.total };
      }
    } else if (workflow === "review") {
      const store = deps.contentStoreFor ? await deps.contentStoreFor(principal.workspaceId) : deps.store;
      if (store) {
        const seed = await deps.txRunner.run(principal.workspaceId, (tx) =>
          computeReReviewSeed(tx, store, { projectId, ...(body.draftId != null ? { headDraftId: body.draftId } : {}) }),
        );
        if (seed) inputs = { ...inputs, priorReviewId: seed.priorReviewId, changedSince: seed.changedSince };
      }
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
      estimateCredits,
      capCredits,
      rateTableVersion: body.rateTableVersion,
      phaseClassesUsed: phaseClassesForWorkflow(workflow),
      inputs,
      inputSnapshot: body.inputSnapshot ?? {},
      sheetLaunched: body.sheetLaunched ?? true,
      entitlementId: body.entitlementId,
      imageDigest: body.imageDigest,
      protocolsVersion: body.protocolsVersion,
      lockSetSpec: {
        projectId,
        personaId: body.personaId,
        draftId: body.draftId,
        // a Revise run's v(N+1) row id is server-reserved above; the write lock binds that same id.
        nextDraftId: typeof inputs.nextDraftId === "string" ? inputs.nextDraftId : body.nextDraftId,
        corrKind: body.corrKind,
        corrK: body.corrK,
      },
    });

    if (res.ok) {
      // Pre-triage guidance (REQ-IDE-28): a run-scope record the Revise phase delivers verbatim — the
      // user's rows are authoritative ("you pre-triaged N of M"); agent triage may add rows, never override.
      if (pretriage && !res.deduped) {
        await captureGuidance(deps, {
          workspaceId: principal.workspaceId,
          projectId,
          userId: principal.userId,
          source: "run_sheet",
          text: `You pre-triaged ${pretriage.triaged} of ${pretriage.total} findings — rows marked actor:user are authoritative and must not be overridden.`,
          scope: "run",
          runId: res.runId,
          workflows: ["revise"],
        });
      }
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
    // REQ-SPEC-24.7 (PRB.08): a chargeback-suspended account takes no new runs — 403, never a silent queue.
    if (res.reason === "account_suspended") return c.json({ error: res.reason }, 403);
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
      if (res.reason === "account_suspended") return c.json({ error: res.reason }, 403); // REQ-SPEC-24.7
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

  // The server-authored harness run spec (D-P0.15c-6): the phase request + hydration manifest + derived server
  // files + §12.6 hook-policy inputs the two-uid harness executes. Token-authed + attempt-fenced like every
  // internal route; the harness fetches it instead of reading a mounted file (§12.6 "attestation derives only
  // from server-side facts"). No secret is in the payload (REQ-SPEC-10/11).
  internal.get("/runs/:id/runspec", (c) => {
    const run = c.get("run");
    return guard(c, async () =>
      c.json(
        await buildHarnessRunSpec(deps, {
          runId: run.runId,
          attempt: run.attempt,
          workspaceId: run.workspaceId,
          ...(deps.runSpecConfig?.skillsDir ? { skillsDir: deps.runSpecConfig.skillsDir } : {}),
          ...(deps.runSpecConfig?.maxUsdPerRun != null ? { maxUsdPerRun: deps.runSpecConfig.maxUsdPerRun } : {}),
        }),
      ),
    );
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

  // Harvest → persist produced versions (P0.15e; §12.2 commit step 2). The pod harness reports the phase's
  // produced writable versions (base64 bytes — it cannot write GCS/DB itself, REQ-SPEC-10/11); the api persists
  // them content-addressed inside the run's workspace store and returns the version ids for the commit. Also
  // records the provisional running `usage.tick`/`sdk_stream` row (D-P0.15d-3). Token-authed + attempt-fenced.
  internal.post("/runs/:id/steps/:key/harvest", (c) => {
    const run = c.get("run");
    return guard(c, async () => {
      const body = (await c.req.json()) as HarvestBody;
      const store = deps.contentStoreFor ? await deps.contentStoreFor(run.workspaceId) : deps.store;
      if (!store) return c.json({ error: "harvest requires a content store" }, 500);
      const versions: NewVersion[] = (body.versions ?? []).map((v) => ({
        path: v.path,
        root: v.root,
        kind: v.kind,
        namespace: v.namespace,
        sha256: v.sha256,
        bytes: Buffer.from(v.bytesB64, "base64"),
        wordCount: v.wordCount,
        ...(v.producerQueryId !== undefined ? { producerQueryId: v.producerQueryId } : {}),
      }));
      const res = await harvestStep(
        { ...deps, store, renderCredits: deps.renderCredits ?? rateTableCreditRenderer },
        {
          runId: run.runId,
          attempt: run.attempt,
          workspaceId: run.workspaceId,
          stepKey: c.req.param("key"),
          ordinal: body.ordinal,
          seat: body.seat,
          ...(body.projectId !== undefined ? { projectId: body.projectId } : {}),
          ...(body.personaId !== undefined ? { personaId: body.personaId } : {}),
          versions,
          usage: body.usage,
        },
      );
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
      // The pod harness reports only the /work dossier; the MONEY facts (billing account, accrued spend/cap, the
      // hold) are server-side truth, so resolve them from the run row when the body omits them (a harness POST).
      // Existing callers that pass them explicitly (tests) are honored unchanged.
      const money =
        body.billingAccountId && body.spentCredits != null && body.capCredits != null
          ? { billingAccountId: body.billingAccountId, spentCredits: body.spentCredits, capCredits: body.capCredits, holdLedgerId: body.holdLedgerId }
          : await resolveRunMoney(deps, run.workspaceId, run.runId);
      const res = await deliverRun(deliverDeps, {
        billingAccountId: money.billingAccountId,
        spentCredits: money.spentCredits,
        capCredits: money.capCredits,
        ...(money.holdLedgerId ? { holdLedgerId: money.holdLedgerId } : {}),
        ...(body.refundCredits != null ? { refundCredits: body.refundCredits } : {}),
        ...(body.byPhase ? { byPhase: body.byPhase } : {}),
        // the run/attempt/workspace of record come from the token, not the pod's dossier (§12.6 attestation).
        // Rebuild verdictContext SERVER-SIDE from the claim ledger: the pod's Sets do not survive the JSON POST
        // (a Set serializes to `{}`), so a wire verdictContext has no working `.has` (§12.8(c) would crash). The
        // citation domains are recoverable from the ledger's own cited urls — the same conservative build the
        // harness does — so reconstruct them here rather than trusting the (Set-less) wire value.
        // PRB.06: priorReviewId + newDraftId are likewise server truth — read from the run's frozen inputs
        // (seeded at creation), never the pod's dossier.
        delivery: await (async () => {
          const runInputs = (
            await deps.txRunner.run(run.workspaceId, (tx) =>
              tx.query(`select inputs from runs where id = $1`, [run.runId]),
            )
          ).rows[0] as { inputs: Record<string, unknown> | string } | undefined;
          const ins =
            typeof runInputs?.inputs === "string"
              ? (JSON.parse(runInputs.inputs) as Record<string, unknown>)
              : (runInputs?.inputs ?? {});
          return {
            ...body.delivery,
            runId: run.runId,
            attempt: run.attempt,
            workspaceId: run.workspaceId,
            verdictContext: verdictContextFromLedger(body.delivery.claimLedger),
            ...(typeof ins.priorReviewId === "string" ? { priorReviewId: ins.priorReviewId } : {}),
            ...(typeof ins.nextDraftId === "string" ? { newDraftId: ins.nextDraftId } : {}),
          };
        })(),
      });
      return c.json(res, res.ok ? 200 : 409);
    });
  });

  // Bare finalize (§12.4 step 8) — `finalizing → completed` with NO delivery dossier: a pinned `phase:N` run,
  // or a workflow that produces no correspondence. Token-authed; money facts resolved from the run row.
  internal.post("/runs/:id/finalize", (c) => {
    const run = c.get("run");
    return guard(c, async () => {
      const body = (await c.req.json().catch(() => ({}))) as { byPhase?: Record<string, number> };
      const money = await resolveRunMoney(deps, run.workspaceId, run.runId);
      const res = await finalizeRun(deps, {
        runId: run.runId,
        workspaceId: run.workspaceId,
        billingAccountId: money.billingAccountId,
        spentCredits: money.spentCredits,
        capCredits: money.capCredits,
        ...(money.holdLedgerId ? { holdLedgerId: money.holdLedgerId } : {}),
        ...(body.byPhase ? { byPhase: body.byPhase } : {}),
      });
      return c.json(res);
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
/** One harvested writable version the pod reports (bytes base64-encoded for JSON transport). */
interface HarvestVersionBody {
  path: string;
  root: NewVersion["root"];
  kind: string;
  namespace: string;
  sha256: string;
  bytesB64: string;
  wordCount: number;
  producerQueryId?: string;
}
/** The harvest payload the run-task posts to `POST /internal/runs/:id/steps/:key/harvest`. */
interface HarvestBody {
  ordinal: number;
  seat: AgentTypeKey;
  projectId?: string | null;
  personaId?: string | null;
  versions: HarvestVersionBody[];
  usage: UsageSnapshot;
}
/** The finalizing run's delivery payload the run-task posts to `POST /internal/runs/:id/deliver`. The money
 *  fields are optional — a harness POST omits them and the route resolves them from the run row (server truth). */
interface DeliverBody {
  billingAccountId?: string;
  spentCredits?: number;
  capCredits?: number;
  holdLedgerId?: string;
  refundCredits?: number;
  byPhase?: Record<string, number>;
  delivery: DeliveryArgs;
}

/**
 * Build the §12.8(c) verdict-source context from the claim ledger's own cited domains (server-side). The pod's
 * `verdictContext` Sets do not survive the JSON deliver POST (a `Set` stringifies to `{}`), so the api
 * reconstructs them from the ledger — the same conservative build the harness does (citation domains from the
 * ledger; reputable/search-reached left empty). Robust to a missing/degraded wire value.
 */
function verdictContextFromLedger(claimLedger: DeliveryArgs["claimLedger"]): VerdictSourceContext {
  const citationDomains = new Set<string>();
  for (const c of claimLedger?.claims ?? []) {
    if (c.url) citationDomains.add(registrableDomain(c.url));
    for (const s of c.sources ?? []) if (s.url) citationDomains.add(registrableDomain(s.url));
  }
  return { citationDomains, reputableDomains: new Set<string>(), searchResultDomains: new Set<string>() };
}

/** Resolve a run's delivery money facts from server truth (the run row + its workspace's billing account). */
async function resolveRunMoney(
  deps: RunApiDeps,
  workspaceId: string,
  runId: string,
): Promise<{ billingAccountId: string; spentCredits: number; capCredits: number; holdLedgerId?: string }> {
  return deps.txRunner.run(workspaceId, async (tx) => {
    const row = (
      await tx.query(
        `select r.spent_credits, r.cap_credits, r.hold_ledger_id, w.billing_account_id
           from runs r join workspaces w on w.id = r.workspace_id where r.id = $1`,
        [runId],
      )
    ).rows[0] as
      | { spent_credits: number; cap_credits: number; hold_ledger_id: string | null; billing_account_id: string }
      | undefined;
    if (!row) throw new Error(`deliver: run ${runId} not found`);
    return {
      billingAccountId: row.billing_account_id,
      spentCredits: row.spent_credits,
      capCredits: row.cap_credits,
      ...(row.hold_ledger_id ? { holdLedgerId: row.hold_ledger_id } : {}),
    };
  });
}
interface GateDecisionBody {
  action: DecisionAction;
  presence?: boolean;
  guidance?: string;
  standingRule?: boolean;
  edits?: GateEdit;
}
