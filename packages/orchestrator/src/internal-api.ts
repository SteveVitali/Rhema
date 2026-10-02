// The internal run API (§12.4 steps 5–8; REQ-ARCH-11 amended; REQ-RUN-2/15; REQ-DATA-33). Authenticated by
// the run token held by the `harness` uid, single-run, EVERY call carries `attempt` and is rejected with
// `409 stale_task` when `attempt < runs.current_attempt` (fencing — AC2). There is no `POST fetch`: the fetch
// log of record is the proxy's. State transitions are made only here, in a transaction that also appends the
// event (REQ-DATA-33). Artifact materialization/harvest (P0.09), gate resolution (P0.10) and ledger internals
// (P0.11) live behind the interfaces this module calls; this ticket owns the durable lifecycle.

import {
  platformCredits,
  PLATFORM_FAULT_RESEARCH_PREFLIGHT,
  type AgentTypeKey,
  type GateKind,
  type GateOnExpiry,
  type WorkflowKey,
} from "@rhema/contracts";
import type { UsageSnapshot } from "@rhema/engine";
import {
  buildSeatHydration,
  declaredWritableArtifacts,
  persistHarvest,
  recordMounts,
  sha256Hex,
  type ContentStore,
  type MirrorManifest,
  type NewVersion,
  type Overlay,
  type ServerFile,
  ITERATION_CAPS,
} from "@rhema/mirror";
import { WORKFLOW_MANIFESTS } from "@rhema/protocols";
import { DRAFTED_STATUSES, parseDraftLedgerSections } from "@rhema/protocols";
// P1.14 — the §16.3 #10 calibration verdict + the §9.5 hold-out leak audit + the charter's
// seeded/guidance split (the deterministic reseed) — shared with the api surface verbatim.
import { calibrationVerdict } from "@rhema/contracts";
import { auditHoldoutLeak, renderCharterSeed, guidanceSection } from "@rhema/findings-core";
import type { Clock } from "./clock.js";
import type { IdFactory } from "./ids.js";
import type { EventWriter } from "./event-writer.js";
import type { HeartbeatStore } from "./heartbeat.js";
import type { HoldLedger } from "./ledger.js";
import type { RunTokenService } from "./token.js";
import { scheduleGateExpiry, type Queue } from "./queue.js";
import {
  scheduleCreditsCheck,
  scheduleGateNotifications,
  scheduleRunProgressNotification,
  scheduleRunTerminalNotification,
} from "./notifications.js";
import type { EmailActionConfig } from "./email-actions.js";
import type { SqlClient, TxRunner } from "./tx.js";
import { applyTransition, readRunState, type RunFields } from "./transition.js";
import { isTerminal, type RunState } from "./state-machine.js";
import { revokeRunCredentials } from "./credentials.js";
import { seatForWorkflow } from "./run-shape.js";
import { preApproveGateByTrial } from "./gate-resolution.js";
import { resolveDeliveryBase, type DeliveryBaseDraft } from "./delivery-base.js";
import { userSourceMounts } from "./user-sources.js";
import { applyOutlineApproval } from "./outline-delivery.js";
import { applyFigureDelivery, enqueueFigureRender } from "./figure-delivery.js";
import type { FigureClaimsMountProvider } from "./figure-claims.js";
import {
  absorbMeteredGap,
  incrementalMeteredDebit,
  netDebitedCredits,
  reconcileRunSpend,
  refundMeteredExcess,
  settleMeteredDebit,
  type DebitMode,
} from "./spend.js";
import { MAX_EVENT_BATCH } from "./event-store.js";

/** The full DI bundle the internal API + provisioning + reaper + phase loop share. */
export interface OrchestratorDeps {
  readonly txRunner: TxRunner;
  /**
   * SEC.1 (REQ-SPEC-30; ADR-017) — the SYSTEM-pool transaction runner: same tenant-scoped transaction
   * semantics as `txRunner`, but bound to the elevated (`SYSTEM_DATABASE_URL`) pool instead of the
   * user-serving role. Paths that write system-only tables — `proxy_credentials`/`proxy_allowlists`
   * mints at provision — MUST run here; the user role holds no grant on them and the operation fails
   * closed. Falls back to `txRunner` when unset (single-role dev). Credential REVOCATION does not
   * ride this seam: it crosses the boundary through the 0045 SECURITY DEFINER function so a
   * user-initiated cancel stays atomic on the user pool.
   */
  readonly systemTxRunner?: TxRunner;
  readonly eventWriter: EventWriter;
  readonly clock: Clock;
  readonly ids: IdFactory;
  readonly heartbeats: HeartbeatStore;
  readonly tokens: RunTokenService;
  readonly ledger: HoldLedger;
  readonly queue: Queue;
  /**
   * Optional obligations-mount provider (P0.12; the app binds `@rhema/obligations` here). On a re-review's
   * Editor hydration it returns the read-only `obligations.json` server file for the letter-writing context —
   * never an independence context (REQ-OBJ-4/8). Unset ⇒ no obligations.json is mounted (the pre-P0.12 shape).
   */
  readonly obligationMount?: ObligationMountProvider;
  /**
   * PRB.09 email-notification deploy config (the signed-action HMAC key + api/app origins). The api holds it
   * to CONSUME one-click links; the worker holds it to MINT them inside `notify` jobs. Unset ⇒ notification
   * jobs are enqueued but the `notify` handler no-ops (`unconfigured`) — a deploy without mail stays green.
   */
  readonly notifications?: EmailActionConfig;
  /**
   * P1.13 — the figure-claims inventory mount (§7.5; REQ-VIZ-13). A review/fact_check run's Editor
   * hydration mounts `.rhema/figure-claims.json` — the deterministic claim rows for figures
   * inserted into the reviewed draft — when the api binds this provider (closed over the workspace
   * content store). Unset ⇒ no file mounts (the pre-P1.13 shape).
   */
  readonly figureClaimsMount?: FigureClaimsMountProvider;
  /**
   * RES.1 — the optional ops alert sink (the worker binds `OPS_ALERT_WEBHOOK_URL`). The ONLY consumer is
   * the stranded sweep's `research_preflight_failed` leg: a run that can never research pages once —
   * the payload is ID-only (`{kind, runId, workspaceId}`), never prompt/draft text. Unset ⇒ the marker
   * still flips `runs.failure.alerted` so the failure is recorded once and never re-paged on resume.
   */
  // method signature (not a function-typed property): a sub-dep may narrow the payload it accepts —
  // e.g. the worker's billing sink takes `ReconcileAlert` — while the sweep's preflight page sends
  // its own id-only shape. Method-param bivariance keeps both assignable to this seam.
  alert?(a: unknown): void | Promise<void>;
  /**
   * RES.2 (REQ-SPEC-31(3)) — the platform-fault settlement for an Unverified delivery: refund the run's
   * research-class phase debits, absorb the refunded metered burn, restore the consumed trial
   * entitlement, stamp the `runs.delivery` settlement markers, then page once. Bound by the deploy
   * (api + worker) to @rhema/ledger's `settleUnverifiedDelivery` — the orchestrator holds only the seam
   * because `refundPhases` lives across the ledger boundary. Callers: `deliverRun` (post-commit,
   * best-effort) and the stranded sweep's leg E (the durable retry). Unset ⇒ the label still persists
   * atomically; settlement simply waits for a bound caller.
   */
  settleUnverified?(args: UnverifiedSettleArgs): Promise<unknown>;
  /**
   * ECON.1 (REQ-SPEC-32(a); ADR-031) — the debit mode. `committed` (default; `DEBIT_MODE` env unset) keeps
   * the launched semantics: commits charge max(pod claim, metered catch-up) and the settle only tops up.
   * `metered` charges exactly the proxy meter `min(metered, cap)`: commits debit the metered remainder
   * only, `finalizeRun` refunds any over-debit (`metered_over_debit`), and a user-cancelled run settles to
   * metered instead of release-only. Shipped dark — the deploy keeps `committed` until the calibrated
   * caps + operator flip gate land.
   */
  readonly debitMode?: DebitMode;
}

/** The settlement parameters for one Unverified delivery (RES.2) — passed to `deps.settleUnverified`. */
export interface UnverifiedSettleArgs {
  readonly runId: string;
  readonly workspaceId: string;
  readonly billingAccountId: string;
  /** the run manifest's research-class phase KEYS (review: `verification` + `discourse`; fact_check:
   *  `verification`) — the settle resolves them to the committed `steps.id`s the debit rows carry. */
  readonly phaseKeys: readonly string[];
  /** the persisted coverage counts (the alert payload carries them; ids + counts only — invariant 10). */
  readonly checkableClaims: number;
  readonly coveredClaims: number;
}

/** Builds the re-review `obligations.json` mount file for a seat's hydration, or null when none applies. */
export interface ObligationMountProvider {
  forHydration(
    exec: SqlClient,
    args: { runId: string; projectId: string | null; seat: AgentTypeKey; workflow: string; inputs: Record<string, unknown> },
  ): Promise<ServerFile | null>;
}

/** A subset sufficient for the transition/gate helpers. */
type MinDeps = Pick<OrchestratorDeps, "eventWriter" | "clock" | "ids">;

/** Rejected internal call from a superseded attempt → `409 stale_task`; the task self-terminates (AC2). */
export class StaleTaskError extends Error {
  readonly httpStatus = 409;
  readonly code = "stale_task";
  constructor(
    readonly runId: string,
    readonly attempt: number,
    readonly currentAttempt: number,
  ) {
    super(`stale_task: attempt ${attempt} < current ${currentAttempt} for run ${runId}`);
    this.name = "StaleTaskError";
  }
}

/** A `POST events` batch exceeded the §12.5 limit (≤250); the run-task client must chunk before sending. */
export class EventBatchTooLargeError extends Error {
  readonly httpStatus = 413;
  readonly code = "event_batch_too_large";
  constructor(
    readonly size: number,
    readonly max: number,
  ) {
    super(`event batch of ${size} exceeds the ${max}-event limit (§12.5)`);
    this.name = "EventBatchTooLargeError";
  }
}

/** Call carries a token/attempt for a run that has already reached a terminal state (token revoked). */
export class RevokedTokenError extends Error {
  readonly httpStatus = 401;
  readonly code = "revoked";
  constructor(readonly runId: string) {
    super(`token revoked: run ${runId} is terminal`);
    this.name = "RevokedTokenError";
  }
}

interface RunFenceRow {
  readonly state: RunState;
  readonly current_attempt: number;
}

/**
 * Fence a call by attempt (REQ-RUN-15): reject `attempt < current_attempt` with 409, and reject any call once
 * the run is terminal (revocation). Locks the run row `for update` so a concurrent re-enqueue can't slip past.
 */
async function fence(tx: SqlClient, runId: string, attempt: number): Promise<RunFenceRow> {
  const res = await tx.query("select state, current_attempt from runs where id = $1 for update", [runId]);
  const row = res.rows[0] as RunFenceRow | undefined;
  if (!row) throw new Error(`run ${runId} not found`);
  if (isTerminal(row.state)) throw new RevokedTokenError(runId);
  if (attempt < row.current_attempt) throw new StaleTaskError(runId, attempt, row.current_attempt);
  return row;
}

// ---------------------------------------------------------------------------- gates

export interface OpenGateArgs {
  readonly runId: string;
  readonly kind: GateKind;
  readonly blocking: boolean;
  readonly onExpiry: string;
  readonly stepId?: string;
  readonly artifactVersionId?: string;
  readonly deadlineAt?: Date | null;
}

/**
 * Open a gate (§6.4; REQ-GATE-1) inside `tx`: insert the durable gate row and append the paired `gate.opened`
 * event. This ticket OPENS gates and exits the task; gate RESOLUTION (decision write, overlay serialization,
 * expiry scheduling) is P0.10 — only the `gate:<id>` job TYPE is registered (queue.ts). Returns the gate id.
 */
export async function openGate(tx: SqlClient, deps: MinDeps, args: OpenGateArgs): Promise<string> {
  const now = deps.clock.now();
  const gateId = deps.ids("gate");
  await tx.query(
    `insert into gates(id, run_id, step_id, kind, artifact_version_id, opened_at, deadline_at, blocking,
       on_expiry, held, paused_while_reading)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,false,false)`,
    [gateId, args.runId, args.stepId ?? null, args.kind, args.artifactVersionId ?? null, now, args.deadlineAt ?? null, args.blocking, args.onExpiry],
  );
  await deps.eventWriter.append(tx, {
    runId: args.runId,
    type: "gate.opened",
    payload: {
      kind: args.kind,
      ...(args.artifactVersionId ? { artifactVersionId: args.artifactVersionId } : {}),
      deadlineAt: args.deadlineAt ? args.deadlineAt.toISOString() : null,
    },
    at: now,
  });
  return gateId;
}

// ---------------------------------------------------------------------------- heartbeat

export interface HeartbeatArgs {
  readonly runId: string;
  readonly attempt: number;
  readonly workspaceId: string;
}
export interface HeartbeatResponse {
  readonly ok: true;
  readonly cancelRequested: boolean;
  /** a freshly-minted token (refresh on heartbeat, §12.4). */
  readonly token: string;
  readonly state: RunState;
}

/**
 * `PUT /internal/runs/:id/heartbeat` — fence, take `provisioning → running` on the first beat, SETEX the
 * heartbeat, return `cancelRequested` and a refreshed token (§12.4 steps 4–5).
 */
export async function heartbeat(deps: OrchestratorDeps, args: HeartbeatArgs): Promise<HeartbeatResponse> {
  const { state } = await deps.txRunner.run(args.workspaceId, async (tx) => {
    const row = await fence(tx, args.runId, args.attempt);
    if (row.state === "provisioning") {
      await applyTransition(tx, deps, {
        runId: args.runId,
        from: "provisioning",
        to: "running",
        fields: { startedAt: deps.clock.now() },
      });
      return { state: "running" as RunState };
    }
    return { state: row.state };
  });

  const prior = await deps.heartbeats.get(args.runId);
  await deps.heartbeats.beat({
    runId: args.runId,
    attempt: args.attempt,
    workspaceId: args.workspaceId,
    at: deps.clock.now(),
  });
  const cancelRequested = prior?.cancelRequested ?? state === "cancelling";
  const token = deps.tokens.mint({ runId: args.runId, attempt: args.attempt, workspaceId: args.workspaceId, seat: "harness" });
  return { ok: true, cancelRequested, token, state };
}

// ---------------------------------------------------------------------------- events

export interface EventBatchItem {
  readonly type: Parameters<EventWriter["append"]>[1]["type"];
  readonly payload: unknown;
  readonly agentLabel?: string;
}

/**
 * `POST /internal/runs/:id/events` — fence, then append the batch (≤250) atomically. Every event pairs with
 * the run's durable history; payloads are validated at the write boundary (event-writer). Returns the last seq.
 */
export async function postEvents(
  deps: OrchestratorDeps,
  args: { runId: string; attempt: number; workspaceId: string; events: readonly EventBatchItem[] },
): Promise<{ ok: true; lastSeq: number }> {
  if (args.events.length > MAX_EVENT_BATCH) throw new EventBatchTooLargeError(args.events.length, MAX_EVENT_BATCH);
  return deps.txRunner.run(args.workspaceId, async (tx) => {
    await fence(tx, args.runId, args.attempt);
    let lastSeq = 0;
    const now = deps.clock.now();
    for (const ev of args.events) {
      const appended = await deps.eventWriter.append(tx, {
        runId: args.runId,
        type: ev.type,
        payload: ev.payload,
        at: now,
        agentLabel: ev.agentLabel,
      });
      lastSeq = appended.seq;
    }
    return { ok: true, lastSeq };
  });
}

// ---------------------------------------------------------------------------- audit

export interface AuditRows {
  readonly access?: ReadonlyArray<{ ts: Date; agentLabel: string; tool: string; path: string; namespace?: string; decision: string }>;
  readonly fetch?: ReadonlyArray<{
    ts: Date;
    agentLabel: string;
    kind: string;
    query?: string;
    url?: string;
    normalizedUrl?: string;
    status?: number;
    bytes?: number;
    decision: string;
    denyReason?: string;
  }>;
}

/**
 * `POST /internal/runs/:id/audit` — the buffered `access_log` / `fetch_log` rows the harness ships (the
 * SECONDARY "attempts" record; the trust chip rests on server-side facts, §12.6). Fenced; append-only.
 */
export async function audit(
  deps: OrchestratorDeps,
  args: { runId: string; attempt: number; workspaceId: string; rows: AuditRows },
): Promise<{ ok: true; written: number }> {
  return deps.txRunner.run(args.workspaceId, async (tx) => {
    await fence(tx, args.runId, args.attempt);
    let written = 0;
    for (const r of args.rows.access ?? []) {
      await tx.query(
        `insert into access_log(run_id, ts, agent_label, tool, path, namespace, decision)
         values ($1,$2,$3,$4,$5,$6,$7)`,
        [args.runId, r.ts, r.agentLabel, r.tool, r.path, r.namespace ?? null, r.decision],
      );
      written++;
    }
    for (const r of args.rows.fetch ?? []) {
      await tx.query(
        `insert into fetch_log(run_id, ts, agent_label, kind, query, url, normalized_url, status, bytes,
           decision, deny_reason, attempt)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [
          args.runId,
          r.ts,
          r.agentLabel,
          r.kind,
          r.query ?? null,
          r.url ?? null,
          r.normalizedUrl ?? null,
          r.status ?? null,
          r.bytes ?? null,
          r.decision,
          r.denyReason ?? null,
          args.attempt,
        ],
      );
      written++;
    }
    return { ok: true, written };
  });
}

// ---------------------------------------------------------------------------- hydration

export interface HydrationResponse {
  readonly runId: string;
  readonly attempt: number;
  readonly seat: string;
  readonly workflow: string;
  readonly projectId: string | null;
  readonly personaId: string | null;
  readonly inputs: Record<string, unknown>;
  /** overlay versions serialized from gate decisions (P0.10 populates on resume); [] on the first attempt. */
  readonly overlays: string[];
  /** the server-generated hydration manifest (§12.6 attestation) — persisted to `run_mounts` and returned so
   *  the harness fetches bytes per entry to write `/work` (P0.09). */
  readonly manifest: MirrorManifest;
  /** derived (non-artifact) mount-file bytes by path, utf8 — the manifest entries the harness cannot fetch from
   *  GCS because they are server-generated (`manifest.md`, the re-review `obligations.json`). D-P0.15c-6. */
  readonly serverFiles: Record<string, string>;
  /**
   * PRB.19 (F26b) — the run's declared phase-output paths granted writable for this run (the manifest entries
   * for committed artifacts at these paths already carry `mode:"readwrite"`; this list is the NEW-file grant
   * the harvest + hook policy enforce). Sorted, deduped; [] for a run whose workflow declares none.
   */
  readonly writablePaths: readonly string[];
  /** PRB.19 (F26a) — the server-resolved delivery base (the draft the delivery freezes + diffs against) with
   *  its EFFECTIVE promoted head; null when the run's project has no draft to deliver on. */
  readonly deliveryBase: DeliveryBaseDraft | null;
}

export interface HydrationArgs {
  readonly runId: string;
  readonly attempt: number;
  readonly workspaceId: string;
  /** gate-derived overlays applied over the committed tree at resume (P0.10 supplies these); [] on attempt 1. */
  readonly overlays?: readonly Overlay[];
}

/**
 * `GET /internal/runs/:id/hydration` — the descriptor the harness materializes `/work` from (§11.5/§12.6).
 * Fenced. Generates the per-seat hydration manifest SERVER-SIDE (the attestation fact — "which paths were
 * mounted for which seat"), persists it to `run_mounts` (materialization before step 1 and at every resume),
 * and returns it with the run's frozen inputs + seat. `overlays[]` (P0.10) override the committed tree at resume.
 */
export async function hydration(deps: OrchestratorDeps, args: HydrationArgs): Promise<HydrationResponse> {
  return deps.txRunner.run(args.workspaceId, async (tx) => {
    await fence(tx, args.runId, args.attempt);
    const res = await tx.query(
      `select r.workflow, r.project_id, r.persona_id, r.inputs, ai.type_key as seat
         from runs r left join agent_instances ai on ai.id = r.agent_instance_id
        where r.id = $1`,
      [args.runId],
    );
    const row = res.rows[0] as {
      workflow: string;
      project_id: string | null;
      persona_id: string | null;
      inputs: Record<string, unknown> | string;
      seat: string | null;
    };
    const inputs = typeof row.inputs === "string" ? (JSON.parse(row.inputs) as Record<string, unknown>) : row.inputs;
    // The seat resolves from the run's agent instance when one is bound; otherwise from the workflow's
    // declared seat (PRB.16b; LIVE FINDING 14 — `agent_instance_id` is never populated by run creation,
    // so every author-seat and persona-builder-seat run silently hydrated as `editor`: the author's
    // `agents/author/**` working memory was unmounted/unwritable, the editor's private namespace was
    // mounted in its place — a boundary inversion — and a Revise bootstrap could never see the dossier
    // through the author's shared `correspondence/` view as §12.6 intends). The workflow is the frozen
    // authority: `revise` hydrates `author`, `profile_voice` hydrates `persona_builder`, `review` keeps
    // `editor`. An explicit agent instance still wins (the seat override hook).
    const seat = (row.seat ?? seatForWorkflow(row.workflow as WorkflowKey)) as AgentTypeKey;
    // On resume, apply the run's accumulated gate-derived overlays (REQ-SPEC-9): a caller may pass them
    // explicitly, else they are loaded from the resolved gates' `Decision.overlayVersionIds`. [] on attempt 1.
    const overlays = args.overlays ?? (await loadRunOverlays(tx, args.runId));

    // A re-review's letter-writing context gains a read-only obligations.json (REQ-OBJ-4/8; P0.12). The
    // provider decides applicability (Editor seat + a re-review) and returns null otherwise; a server file is
    // `derived`, so materializeScoped never hands it to an input-scoped independence subagent.
    const serverFiles: ServerFile[] = [];
    if (deps.obligationMount) {
      const oblFile = await deps.obligationMount.forHydration(tx, {
        runId: args.runId,
        projectId: row.project_id,
        seat,
        workflow: row.workflow,
        inputs,
      });
      if (oblFile) serverFiles.push(oblFile);
    }

    // PRB.19 (F26) — resolve the delivery base + the run's declared-output write grant BEFORE the manifest:
    // the grant decides the manifest `mode` of any committed artifact at a declared path, and the base's `n`
    // resolves the `vN`/`v(N+1)` placeholders the declared artifacts name. Both are server facts (frozen
    // inputs + tables) — the pod never supplies them.
    const deliveryResolution = row.project_id
      ? await resolveDeliveryBase(tx, { projectId: row.project_id, workflow: row.workflow, inputs })
      : { base: null, reviewedDraftN: null };
    const deliveryBase = deliveryResolution.base;
    // P1.13 — the figure-claims inventory mount (§7.5; REQ-VIZ-13/14): a review/fact_check run's
    // Editor hydration gains `.rhema/figure-claims.json` — the deterministic Tier-1 claim rows for
    // figures inserted into the reviewed draft (the draft's `<!-- rhema:figure -->` markers, read
    // server-side). The api binds the provider over the workspace store; unset ⇒ no file mounts.
    if (
      deps.figureClaimsMount &&
      (row.workflow === "review" || row.workflow === "fact_check") &&
      row.project_id &&
      deliveryBase
    ) {
      const claimsFile = await deps.figureClaimsMount.forHydration(tx, {
        runId: args.runId,
        projectId: row.project_id,
        draftN: deliveryBase.n,
        workflow: row.workflow,
      });
      if (claimsFile) serverFiles.push(claimsFile);
    }

    // P1.21 (REQ-WF-8/REQ-GENRE-6) — a Memo run's `user_sources[]` mount as derived read-only files
    // (`user_sources/NN-name.md`): the agent verifies claims against the bytes, never a fetch — the
    // run's URL policy carries each source's domain in `userSourceDomains` and the proxy denies the
    // fetch (§16.4: enforced, never advised). Derived files stay out of input-scoped independence
    // contexts by construction (materializeScoped), so the second read never sees them.
    for (const m of userSourceMounts(inputs?.user_sources)) {
      serverFiles.push({
        path: m.path,
        root: "project",
        bytes: Buffer.from(m.content, "utf8"),
        kind: null,
        namespace: "shared",
      });
    }

    const workflowManifest = WORKFLOW_MANIFESTS[row.workflow as WorkflowKey];
    const writablePaths =
      row.project_id && workflowManifest
        ? declaredWritableArtifacts(seat, workflowManifest, {
            // P1.10 — a Draft run has no base draft; its `v(N+1)` placeholders resolve to the reserved
            // `nextDraftN` (the same value `expandDeclaredPath` derives as baseDraftN + 1).
            baseDraftN: deliveryBase?.n ?? (deliveryResolution.newDraftN != null ? deliveryResolution.newDraftN - 1 : null),
            reviewedDraftN: deliveryResolution.reviewedDraftN,
            // P1.12 — `<slug>` resolves to the frozen outline slug (the conduit grant into
            // `agents/author/outline/`); the runspec's `phase_output` uses the same value.
            slug: typeof inputs["outlineSlug"] === "string" ? (inputs["outlineSlug"] as string) : null,
            // P1.13 — `<fig>` resolves to the server-minted figure id (the conduit grant into
            // `assets/figures/<fig>/` — the run's spec/data/provenance writes).
            fig: typeof inputs["figureId"] === "string" ? (inputs["figureId"] as string) : null,
          })
        : [];

    const { manifest, derived } = await buildSeatHydration(tx, {
      seat,
      projectId: row.project_id,
      personaId: row.persona_id,
      overlays,
      serverFiles,
      writablePaths,
      // BL-66 — bind the run so a prior run's seat-namespace output never mounts into this run's /work.
      runId: args.runId,
    });
    await recordMounts(tx, { runId: args.runId, attempt: args.attempt, manifest });

    const derivedFiles: Record<string, string> = {};
    for (const d of derived) derivedFiles[d.path] = Buffer.from(d.bytes).toString("utf8");

    return {
      runId: args.runId,
      attempt: args.attempt,
      seat,
      workflow: row.workflow,
      projectId: row.project_id,
      personaId: row.persona_id,
      inputs,
      overlays: overlays.map((o) => o.artifactVersionId),
      manifest,
      serverFiles: derivedFiles,
      writablePaths,
      deliveryBase,
    };
  });
}

/**
 * Load a run's accumulated gate-derived overlays (REQ-SPEC-9): the `overlay_version_ids` from every resolved
 * gate's decision, in resolution order. materialize's overlay map keys by path, so a later decision editing the
 * same file wins over an earlier one. [] when no gate serialized an overlay (the common resume case too).
 */
export async function loadRunOverlays(tx: SqlClient, runId: string): Promise<Overlay[]> {
  const res = await tx.query(
    `select d.overlay_version_ids as ids
       from decisions d join gates g on g.id = d.gate_id
      where g.run_id = $1 and d.overlay_version_ids is not null
      order by d.at, g.opened_at`,
    [runId],
  );
  const overlays: Overlay[] = [];
  for (const r of res.rows as { ids: string[] | null }[]) {
    for (const id of r.ids ?? []) overlays.push({ artifactVersionId: id });
  }
  return overlays;
}

// ---------------------------------------------------------------------------- harvest (persist produced versions)

/** Provisional-credit renderer seam (usage × versioned rate table); default 0 until wired (D-P0.15d-3). */
type ProvisionalCreditRenderer = (usage: UsageSnapshot, modelTier: string, rateTableVersion: number) => number;

export interface HarvestStepDeps extends OrchestratorDeps {
  /** the content-addressed artifact store, bound to the run's workspace (GCS in prod). */
  readonly store: ContentStore;
  /** renders the running phase's provisional credits from the reported SDK usage (D-P0.15d-3); default 0. */
  readonly renderCredits?: ProvisionalCreditRenderer;
}

export interface HarvestStepArgs {
  readonly runId: string;
  readonly attempt: number;
  readonly workspaceId: string;
  readonly stepKey: string;
  readonly ordinal: number;
  readonly seat: AgentTypeKey;
  readonly projectId?: string | null;
  readonly personaId?: string | null;
  /** the harvested writable versions (content-addressed bytes) the pod produced this phase. */
  readonly versions: readonly NewVersion[];
  /** the SDK usage snapshot for the phase (provisional `usage.tick`; the proxy stays the meter of record). */
  readonly usage: UsageSnapshot;
}

export type HarvestStepResult =
  | {
      readonly ok: true;
      readonly producedVersionIds: string[];
      readonly byPath: Record<string, string>;
      /** the provisional per-phase credits (SDK usage × the run's rate table) — the harness forwards this to
       *  `commit` as the step cost. The proxy-metered reconciliation (±2%) is the live leg (D-P0.15-2). */
      readonly provisionalCredits: number;
    }
  | { readonly ok: false; readonly code: "stale_task"; readonly currentAttempt: number };

/**
 * `POST /internal/runs/:id/steps/:key/harvest` (P0.15e; §12.2 commit step 2). The pod harness reports the
 * phase's produced writable versions (it cannot write GCS or the DB itself — REQ-SPEC-10/11); the api persists
 * them content-addressed and returns their version ids for the subsequent `commit`. In the same fenced tx it
 * records the phase's PROVISIONAL running usage — an `sdk_stream` `usage_records` row + a `usage.tick` event
 * (credits via the injected renderer, D-P0.15d-3) — so Σ includes the just-run phase before the reconciled
 * commit. The proxy's `{source:'proxy'}` rows remain the meter of record.
 */
export async function harvestStep(deps: HarvestStepDeps, args: HarvestStepArgs): Promise<HarvestStepResult> {
  const renderCredits = deps.renderCredits ?? (() => 0);
  try {
    return await deps.txRunner.run(args.workspaceId, async (tx): Promise<HarvestStepResult> => {
      await fence(tx, args.runId, args.attempt);

      // the artifact scope is a SERVER fact (the run's project/persona), never trusted from the pod; the
      // harness-supplied projectId is a fallback only. `artifacts` requires exactly one of project/persona.
      const scope = (await tx.query("select project_id, persona_id from runs where id = $1", [args.runId])).rows[0] as
        | { project_id: string | null; persona_id: string | null }
        | undefined;
      const projectId = scope?.project_id ?? args.projectId ?? null;
      const personaId = scope?.persona_id ?? args.personaId ?? null;

      const persisted = await persistHarvest(
        tx,
        deps.store,
        { ids: deps.ids, clock: deps.clock },
        { workspaceId: args.workspaceId, projectId, personaId },
        args.versions,
      );

      // P1.10 / REQ-WF-4/7 — the Draft phase's `04-draft-ledger.md` `## Sections` rows become
      // machine-generated `section.drafted` events in plan order (the per-section stream +
      // budget bar the Page renders; §5.5). Emitted HERE, from the committed artifact bytes —
      // never from pod-supplied event text — and deduped on `sectionRef` so a ledger re-harvest
      // (a retried phase, a re-plan attempt) cannot double-emit a section.
      const draftLedger = args.versions.find((v) => /(^|\/)04-draft-ledger\.md$/.test(v.path));
      if (draftLedger) {
        const rows = parseDraftLedgerSections(Buffer.from(draftLedger.bytes).toString("utf8")).filter(
          (s) => DRAFTED_STATUSES.has(s.status),
        );
        if (rows.length > 0) {
          const emitted = new Set(
            (
              await tx.query(
                `select payload->>'sectionRef' as ref from run_events where run_id = $1 and type = 'section.drafted'`,
                [args.runId],
              )
            ).rows.map((r) => (r as { ref: string }).ref),
          );
          for (const s of rows) {
            const sectionRef = s.title || `§${s.ordinal}`;
            if (emitted.has(sectionRef)) continue;
            emitted.add(sectionRef);
            await deps.eventWriter.append(tx, {
              runId: args.runId,
              type: "section.drafted",
              payload: {
                sectionRef,
                words: s.actualWords ?? 0,
                ...(s.budgetWords != null ? { budget: s.budgetWords } : {}),
              },
              at: deps.clock.now(),
            });
          }
        }
      }

      // provisional running usage (D-P0.15d-3): the run's model tier + rate-table version price the reported SDK
      // usage; the `sdk_stream` row + `usage.tick` reflect the just-run phase (the commit reconciles against the
      // proxy's metered rows). The renderer returns fractional credits; the int column rounds this DISPLAY figure.
      const runRow = (
        await tx.query("select model_tier, rate_table_version, spent_credits, cap_credits from runs where id = $1", [args.runId])
      ).rows[0] as { model_tier: string; rate_table_version: number; spent_credits: number; cap_credits: number } | undefined;
      let provisionalCredits = 0;
      if (runRow) {
        const credits = Math.round(renderCredits(args.usage, runRow.model_tier, runRow.rate_table_version));
        provisionalCredits = credits;
        const now = deps.clock.now();
        await tx.query(
          `insert into usage_records(
             id, ts, workspace_id, billing_account_id, run_id, attempt, step_id, role, provider, model,
             model_tier, rate_table_version, input_tokens, cache_write_tokens, cache_read_tokens, output_tokens,
             searches, fetches, list_cost_usd, credits, source)
           select $1,$2,r.workspace_id,w.billing_account_id,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,'sdk_stream'
             from runs r join workspaces w on w.id = r.workspace_id where r.id = $3`,
          [
            deps.ids("usg"),
            now,
            args.runId,
            args.attempt,
            `step:${args.stepKey}`,
            args.seat,
            "anthropic",
            runRow.model_tier,
            runRow.model_tier,
            runRow.rate_table_version,
            args.usage.inputTokens,
            args.usage.cacheCreationTokens,
            args.usage.cacheReadTokens,
            args.usage.outputTokens,
            args.usage.webSearchRequests,
            args.usage.webFetchRequests,
            0,
            credits,
          ],
        );
        // The `sdk_estimate` cross-check row (D-P0.15-2 / REQ-SPEC-11): the SDK's own `costUsd` at the same
        // phase boundary, platform-priced the same way the proxy's metered rows are — the figure of record
        // `proxyVsSdkCrossCheck` diffs against the proxy's `list_cost_usd` (the ±2% live leg). Without this
        // writer the cross-check compares the proxy against nothing on real runs.
        await tx.query(
          `insert into usage_records(
             id, ts, workspace_id, billing_account_id, run_id, attempt, step_id, role, provider, model,
             model_tier, rate_table_version, input_tokens, cache_write_tokens, cache_read_tokens, output_tokens,
             searches, fetches, list_cost_usd, credits, source)
           select $1,$2,r.workspace_id,w.billing_account_id,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,'sdk_estimate'
             from runs r join workspaces w on w.id = r.workspace_id where r.id = $3`,
          [
            deps.ids("usg"),
            now,
            args.runId,
            args.attempt,
            `step:${args.stepKey}`,
            args.seat,
            "anthropic",
            runRow.model_tier,
            runRow.model_tier,
            runRow.rate_table_version,
            args.usage.inputTokens,
            args.usage.cacheCreationTokens,
            args.usage.cacheReadTokens,
            args.usage.outputTokens,
            args.usage.webSearchRequests,
            args.usage.webFetchRequests,
            args.usage.costUsd,
            Math.round(platformCredits(args.usage.costUsd)),
          ],
        );
        await deps.eventWriter.append(tx, {
          runId: args.runId,
          type: "usage.tick",
          payload: { spentCredits: runRow.spent_credits + credits, capCredits: runRow.cap_credits },
          at: now,
        });
      }

      const byPath: Record<string, string> = {};
      for (const p of persisted) byPath[p.path] = p.versionId;
      return { ok: true, producedVersionIds: persisted.map((p) => p.versionId), byPath, provisionalCredits };
    });
  } catch (e) {
    if (e instanceof StaleTaskError) return { ok: false, code: "stale_task", currentAttempt: e.currentAttempt };
    throw e;
  }
}

// ---------------------------------------------------------------------------- commit / fail / finalize

/** Where the run goes after a committed step (decided by the phase loop's completion oracle). */
export type CommitNext =
  | { readonly kind: "advance" } //    running → running (self-edge); the task runs the next phase
  | { readonly kind: "gate"; readonly gateKind: GateKind; readonly blocking: boolean; readonly onExpiry: string; readonly deadlineAt?: Date | null; readonly artifactVersionId?: string }
  | { readonly kind: "finalize" }; //  final phase committed → finalizing

export interface CommitStepArgs {
  readonly runId: string;
  readonly attempt: number;
  readonly workspaceId: string;
  readonly stepKey: string;
  readonly ordinal: number;
  readonly of: number;
  readonly producedVersionIds?: readonly string[];
  readonly credits: number;
  readonly durationMs?: number;
  readonly result: { status: "done"; sdkSubtype: string; predicatesPassed: boolean; compactions: number };
  readonly next: CommitNext;
}

export type CommitStepResult =
  | { readonly ok: true; readonly idempotent: boolean; readonly state: RunState; readonly gateId?: string }
  | { readonly ok: false; readonly code: "stale_task"; readonly currentAttempt: number };

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * `POST /internal/runs/:id/steps/:key/commit` (REQ-RUN-2). Idempotent on `(run_id, step_key, attempt)`. In one
 * atomic transaction: upsert the step row, append `step.finished`, and take the next transition — advance
 * (self-edge, current_step_id set), open a gate + `running → waiting_gate` (task exits, writer lock held,
 * parked ≤30 days), or `running → finalizing`. Reconciliation-against-metered-rows and artifact materialization
 * are the ledger's / P0.09's; this owns the durable step + state write.
 */
export async function commitStep(deps: OrchestratorDeps, args: CommitStepArgs): Promise<CommitStepResult> {
  // PRB.16b F21 (live): `next.deadlineAt` is a `Date` pod-side but crosses the JSON commit body as an
  // ISO STRING — `openGate`'s `deadlineAt.toISOString()` then threw `TypeError: … is not a function`
  // and rolled the whole commit tx back. Every DEADLINE-bearing gate kind was uncommittable over the
  // wire (approve_sample/approve_cutlist/approve_plan/confirm_cost/resume_partial/refusal); the wait
  // kinds (approve_triage & co., `deadlineMs: null`) never carried the field and survived — which is
  // why the defect surfaced first on Quick Voice's `approve_sample` (run 01M2T65W5PZ3174FPVFNQRVKZS:
  // census harvested 2 versions, the commit 500'd opening the gate, the pod saw
  // "commit rejected: unknown"). Coerce at this funnel — the single point openGate + the post-commit
  // schedulers all read — so wire callers need no knowledge of the encoding. A malformed value
  // degrades to `null` (wait semantics: no expiry job scheduled) rather than crash-looping the step.
  const next: CommitNext = (() => {
    if (args.next.kind !== "gate") return args.next;
    const raw = args.next.deadlineAt as unknown;
    if (typeof raw !== "string") return args.next;
    const parsed = new Date(raw);
    return { ...args.next, deadlineAt: Number.isNaN(parsed.getTime()) ? null : parsed };
  })();
  const box: { debitedBillingAccountId: string | null; trialGateId: string | null; figureId: string | null } = {
    debitedBillingAccountId: null,
    trialGateId: null,
    figureId: null,
  };
  try {
    const res = await deps.txRunner.run(args.workspaceId, async (tx): Promise<CommitStepResult & { ok: true }> => {
      await fence(tx, args.runId, args.attempt);

      // idempotency on (run_id, step_key, attempt): a replay of an already-committed step is a no-op.
      const prior = await tx.query(
        "select state from steps where run_id = $1 and phase = $2 and attempt = $3",
        [args.runId, args.stepKey, args.attempt],
      );
      const priorRow = prior.rows[0] as { state: string } | undefined;
      if (priorRow?.state === "done") {
        const state = (await readRunState(tx, args.runId))!;
        return { ok: true, idempotent: true, state };
      }

      const now = deps.clock.now();
      // PRB.16b F17: `returning id` is REQUIRED here — on the conflict path (a RETRIED step whose failed row
      // already exists for the ordinal) the minted id is discarded and the pre-existing row keeps its own. The
      // returned id is the ONLY `steps.id` that actually exists downstream: a freshly-minted id used for
      // `current_step_id` / `debit.phaseId` / `gates.step_id` writes a dangling reference, and `openGate`'s
      // `gates_step_id_fkey` then rolls the whole commit back (live: run 01M2SH38's attempt-5 triage verdict
      // was complete and the commit 500'd on exactly this — the pod's "commit rejected" exit orphaned the run).
      const upserted = await tx.query(
        `insert into steps(id, run_id, phase, ordinal, state, attempt, produced_version_ids, started_at,
           ended_at, credits, result)
         values ($1,$2,$3,$4,'done',$5,$6,$7,$7,$8,$9)
         on conflict (run_id, ordinal) do update set
           state='done', attempt=excluded.attempt, produced_version_ids=excluded.produced_version_ids,
           ended_at=excluded.ended_at, credits=excluded.credits, result=excluded.result
         returning id`,
        [
          deps.ids("step"),
          args.runId,
          args.stepKey,
          args.ordinal,
          args.attempt,
          (args.producedVersionIds ?? []) as string[],
          now,
          args.credits,
          JSON.stringify(args.result),
        ],
      );
      const stepId = (upserted.rows[0] as { id: string }).id;

      await deps.eventWriter.append(tx, {
        runId: args.runId,
        type: "step.finished",
        payload: {
          phase: args.stepKey,
          ordinal: args.ordinal,
          of: args.of,
          credits: args.credits,
          ...(args.durationMs != null ? { durationMs: args.durationMs } : {}),
        },
        at: now,
      });

      // accumulate the step's credits into the run's running spend; a committed phase resets the reaper's
      // re-enqueue budget (≤2 re-enqueues are PER STEP).
      await tx.query(
        "update runs set spent_credits = spent_credits + $2, current_step_id = $3, resume_count = 0 where id = $1",
        [args.runId, args.credits, stepId],
      );

      // P1.13 — a `figure` run's `render` step committing means its spec/data/provenance just landed
      // content-addressed; the deterministic server render (§12.1; REQ-VIZ-6) is the post-commit
      // queue consequence, so the figure id rides the box out of the tx (never enqueued inside it).
      if (args.stepKey === "render") {
        const figRun = (
          await tx.query("select workflow, inputs from runs where id = $1", [args.runId])
        ).rows[0] as { workflow: string; inputs: unknown } | undefined;
        if (figRun?.workflow === "figure") {
          const ins =
            typeof figRun.inputs === "string"
              ? (JSON.parse(figRun.inputs) as Record<string, unknown>)
              : (figRun.inputs as Record<string, unknown> | null);
          if (typeof ins?.["figureId"] === "string") box.figureId = ins["figureId"] as string;
        }
      }

      // debit per committed step (REQ-DATA-34), coupling into the ledger inside the commit tx. DEF.2/F5:
      // the charge follows the PROXY meter, not only the pod's claim — `incrementalMeteredDebit` returns
      // max(args.credits, attempt metered − attempt debited), so a step rollup that under-counts burn the
      // proxy saw (subagent fan-out, server-tool fees — the PRB.25 gap) commits the metered delta at the
      // next boundary instead of leaking it (STB.3's committed-vs-metered divergence). `args.credits`
      // remains the floor and the whole story where no proxy rows exist; P0.11's `debit` still enforces
      // min(actual, cap − Σ) under the run-row lock. idempotent on (run, step, attempt).
      const debitCredits = await incrementalMeteredDebit(
        tx,
        args.runId,
        args.attempt,
        args.credits,
        deps.debitMode ?? "committed",
      );
      if (debitCredits > 0) {
        const ba = (
          await tx.query("select w.billing_account_id from runs r join workspaces w on w.id=r.workspace_id where r.id=$1", [
            args.runId,
          ])
        ).rows[0] as { billing_account_id: string };
        box.debitedBillingAccountId = ba.billing_account_id;
        await deps.ledger.debit(tx, {
          billingAccountId: ba.billing_account_id,
          workspaceId: args.workspaceId,
          runId: args.runId,
          phaseId: stepId,
          credits: debitCredits,
          idempotencyKey: `debit:${args.runId}:${args.stepKey}:${args.attempt}`,
        });
      }

      if (next.kind === "advance") {
        // P1.05 — "Pause after this phase" (§6.5; REQ-GATE-12 amended): the flag set by the steering route
        // is honored HERE, at the committed boundary — the in-flight phase's step row + spend landed above,
        // so the park is clean: clear the request, stamp `paused_at`, park `running → waiting_gate` at zero
        // compute, and emit `steer.paused`. No gate row opens — this is a steering park, not an approval;
        // the task exits on `state === "waiting_gate"` and `resumePausedRun` re-queues it.
        const pauseRequested = (
          await tx.query("select pause_requested_at from runs where id = $1", [args.runId])
        ).rows[0] as { pause_requested_at: Date | null } | undefined;
        if (pauseRequested?.pause_requested_at != null) {
          await tx.query("update runs set pause_requested_at = null, paused_at = $2 where id = $1", [
            args.runId,
            now,
          ]);
          await applyTransition(tx, deps, {
            runId: args.runId,
            from: "running",
            to: "waiting_gate",
            reason: "paused",
            fields: { parkedUntil: new Date(now.getTime() + THIRTY_DAYS_MS) },
          });
          await deps.eventWriter.append(tx, {
            runId: args.runId,
            type: "steer.paused",
            payload: { reason: "paused after phase" },
            at: now,
          });
          return { ok: true, idempotent: false, state: "waiting_gate" };
        }
        const state = (await readRunState(tx, args.runId))!; // stays running (self-edge, no state row change)
        return { ok: true, idempotent: false, state };
      }
      if (next.kind === "finalize") {
        await applyTransition(tx, deps, { runId: args.runId, from: "running", to: "finalizing" });
        return { ok: true, idempotent: false, state: "finalizing" };
      }
      // gate: open it inside the commit tx, transition to waiting_gate, park ≤30 days; the task then exits.
      const parkFields: RunFields = { parkedUntil: new Date(now.getTime() + THIRTY_DAYS_MS) };
      await applyTransition(tx, deps, { runId: args.runId, from: "running", to: "waiting_gate", fields: parkFields });
      const gateId = await openGate(tx, deps, {
        runId: args.runId,
        kind: next.gateKind,
        blocking: next.blocking,
        onExpiry: next.onExpiry,
        stepId,
        artifactVersionId: next.artifactVersionId,
        deadlineAt: next.deadlineAt,
      });
      // P1.10 — a trial first-section preview pre-resolves Approve plan only (§6.4 item 3;
      // REQ-SPEC-1's trial mechanism): the frozen `inputs.preview` marks the run; the actual
      // `Decision{by:'trial', action:'proceed_as_proposed'}` + `waiting_gate → queued` resume land
      // post-commit (autoResolveGate opens its own tx — never nested inside this one).
      if (next.gateKind === "approve_plan") {
        const ins = (
          await tx.query("select inputs from runs where id = $1", [args.runId])
        ).rows[0] as { inputs: unknown } | undefined;
        const inputs =
          typeof ins?.inputs === "string"
            ? (JSON.parse(ins.inputs) as { preview?: unknown })
            : (ins?.inputs as { preview?: unknown } | undefined);
        if (inputs?.preview != null) box.trialGateId = gateId;
      }
      return { ok: true, idempotent: false, state: "waiting_gate", gateId };
    });
    // P1.10 — the trial preview's Approve plan resolves immediately post-commit (the gate row +
    // `gate.opened` stand for the record; the decision + resume proceed it). A resolved gate needs
    // no expiry/reminder jobs.
    if (box.trialGateId) {
      await preApproveGateByTrial(deps, {
        runId: args.runId,
        gateId: box.trialGateId,
        workspaceId: args.workspaceId,
      });
    }
    // Schedule the `gate:<id>` expiry job AFTER commit (§6.4 item 6; the queue send is not transactional with
    // the DB write). Only for a freshly-opened gate with a deadline; a wait gate schedules nothing. A
    // trial-pre-resolved Approve plan schedules none — it was resolved above.
    if (res.ok && !res.idempotent && res.gateId && next.kind === "gate" && !box.trialGateId) {
      const now = deps.clock.now();
      if (next.deadlineAt) {
        await scheduleGateExpiry(deps, {
          gateId: res.gateId,
          workspaceId: args.workspaceId,
          deadlineAt: next.deadlineAt,
          now,
        });
      }
      // PRB.09 — the notification jobs ride the same post-commit seam: the +15 min waiting check (immediate
      // for spend kinds) and the T−1 h / T−10 m reminders for an auto-proceeding deadline (D-P0.10-1).
      await scheduleGateNotifications(deps, {
        gateId: res.gateId,
        workspaceId: args.workspaceId,
        kind: next.gateKind,
        onExpiry: next.onExpiry as GateOnExpiry,
        deadlineAt: next.deadlineAt ?? null,
        now,
      });
    }
    // PRB.09 — a landed debit may have crossed a 50/80/100 % threshold (§14.6); the check job re-reads totals.
    if (res.ok && !res.idempotent && box.debitedBillingAccountId) {
      await scheduleCreditsCheck(deps, {
        billingAccountId: box.debitedBillingAccountId,
        workspaceId: args.workspaceId,
      });
    }
    // P1.19 — a committed phase boundary is the §5.11 Advanced `run_progress` opt-in's trigger; the
    // handler short-circuits unless the project opted in (the queue send is cheap and unconditional;
    // the idempotent-replay path above skips it).
    if (res.ok && !res.idempotent) {
      await scheduleRunProgressNotification(deps, {
        runId: args.runId,
        workspaceId: args.workspaceId,
        phase: args.stepKey,
        ordinal: args.ordinal,
        of: args.of,
      });
    }
    // P1.13 — the committed render step's consequence: the worker-side deterministic render. The
    // queue send is post-commit (not transactional with the step row); the job's singleton key on
    // (figure, run, attempt) dedupes a retried commit, and the job re-renders idempotently.
    if (res.ok && !res.idempotent && box.figureId) {
      await enqueueFigureRender(deps, {
        runId: args.runId,
        workspaceId: args.workspaceId,
        figureId: box.figureId,
        attempt: args.attempt,
      });
    }
    return res;
  } catch (e) {
    if (e instanceof StaleTaskError) return { ok: false, code: "stale_task", currentAttempt: e.currentAttempt };
    throw e;
  }
}

/**
 * The cap-402 signature as it reaches the pod-reported failure reason: the egress proxy's 402 body
 * (`run … has reached its cap of N credits`) surfaces inside the agent's thrown SDK error, folded
 * into `reason` by the commit loop (D-P0.15e-4). A bare `402` status mention counts too — the proxy
 * is the only 402 source in the run path.
 */
const CAP_REACHED_REASON = /reached its cap|cap[_\s-]?reached|cap of \d+ credits|\b402\b/i;

/**
 * Terminal phase failures (PRB.16b; LIVE FINDING 13): outcomes the pod and the reaper can NEVER
 * recover by re-running the same phase. A `budget` subtype or a cap-402 reason means every further
 * model request 402s instantly (the proxy refuses before forwarding); a phase-result `blocked` is
 * the agent's own terminal report (e.g. the dossier-visibility block); a `replan` asks for a
 * back-edge no machinery exists to take. Leaving the run `running` for the reaper was the live
 * cap-402 crash loop (heartbeat stale → orphaned → re-enqueued → instant 402 → repeat).
 *
 * RES.1 adds `research_preflight_failed` (REQ-SPEC-31(3)): the harness's model × server-tool probe
 * found a pair the provider refuses — the run can never research, so it terminalizes here with the
 * same settle (zero debit → the refund leg no-ops; the probe burn absorbs as platform cost), and the
 * stranded sweep's preflight leg pages exactly one ID-only ops alert.
 *
 * BILL.3 (§14.6) adds `provider_transient`: that class only reaches failStep after the phase retry
 * policy is exhausted, so the run must settle `failed` (refund + release) rather than stay `running`
 * for the reaper to re-enqueue into the same provider outage.
 */
function terminalPhaseFailure(errorClass: string, reason: string | undefined): { code: string } | null {
  if (errorClass === "budget" || (reason != null && CAP_REACHED_REASON.test(reason))) {
    return { code: "cap_reached" };
  }
  if (errorClass === "provider_transient") return { code: "provider_outage" };
  if (errorClass === "blocked") return { code: "phase_blocked" };
  if (errorClass === "replan") return { code: "phase_replan" };
  if (errorClass === "research_preflight_failed") return { code: "research_preflight_failed" };
  return null;
}

/**
 * `POST /internal/runs/:id/steps/:key/fail` — record a step failure. The error-class decision (retry / gate /
 * quarantine) is the phase loop's; this endpoint marks the step failed and fences by attempt. When the
 * failure is TERMINAL (cap-402 / blocked / replan — F13), the same transaction also fails the RUN:
 * `running → failed` + spend reconcile + hold release + credential revocation — never left `running`
 * for the reaper to re-enqueue into the same instant failure.
 */
export async function failStep(
  deps: OrchestratorDeps,
  args: { runId: string; attempt: number; workspaceId: string; stepKey: string; ordinal: number; errorClass: string; reason?: string },
): Promise<
  | { ok: true; terminal?: string; backEdge?: { to: string[]; replans: number }; gateId?: string }
  | { ok: false; code: "stale_task"; currentAttempt: number }
> {
  let terminalCode: string | undefined;
  let refusalGateId: string | undefined;
  try {
    const res = await deps.txRunner.run(args.workspaceId, async (tx) => {
      const fenceRow = await fence(tx, args.runId, args.attempt);
      const now = deps.clock.now();
      const stepId = deps.ids("step");
      await tx.query(
        `insert into steps(id, run_id, phase, ordinal, state, attempt, started_at, ended_at, result)
         values ($1,$2,$3,$4,'failed',$5,$6,$6,$7)
         on conflict (run_id, ordinal) do update set state='failed', attempt=excluded.attempt,
           ended_at=excluded.ended_at, result=excluded.result`,
        [stepId, args.runId, args.stepKey, args.ordinal, args.attempt, now, JSON.stringify({ errorClass: args.errorClass, reason: args.reason })],
      );
      // Observability (D-P0.15e-4): emit an `engine.error` run event in the SAME tx as the step-fail row, so a
      // failed phase — an agent crash included, its class+message folded into `reason` by the pod loop — is
      // queryable from `run_events` (not only `steps`) without pod exec. `engine.error` is INTERNAL-visibility
      // (never streamed to the user SSE) and carries no secret / user content (the harness reports facts only).
      await deps.eventWriter.append(tx, {
        runId: args.runId,
        type: "engine.error",
        payload: { errorClass: args.errorClass, phase: args.stepKey, ordinal: args.ordinal, ...(args.reason ? { reason: args.reason } : {}) },
        at: now,
      });

      // P1.10 / REQ-WF-5 — a `replan` self-report on a phase whose manifest declares `backEdges` is a
      // bounded re-plan, NOT a terminal failure: reset the back-edge target's committed step row(s) (state
      // 'reset' + a result marker the runspec reads into the phase's `replan` input — the re-plan gets the
      // grounding failure as context, not a blind retry) so the committed-phase count serves it again, and
      // count `runs.replans`. The (cap+1)-th failure — `ITERATION_CAPS.replan` replans already consumed —
      // escalates to a `refusal` Approval on the run (parked `waiting_gate`; never a silent continue).
      if (args.errorClass === "replan" && fenceRow.state === "running") {
        const runFacts = (
          await tx.query("select workflow, replans from runs where id = $1", [args.runId])
        ).rows[0] as { workflow: string; replans: number } | undefined;
        const wf = runFacts ? WORKFLOW_MANIFESTS[runFacts.workflow as WorkflowKey] : undefined;
        const phase = wf?.phases.find((p) => p.key === args.stepKey);
        const targets = (phase?.backEdges ?? [])
          .map((k) => wf!.phases.find((p) => p.key === k))
          .filter((p): p is NonNullable<typeof p> => p != null);
        if (runFacts && targets.length > 0) {
          if (runFacts.replans < ITERATION_CAPS.replan) {
            const minOrdinal = Math.min(...targets.map((t) => t.index));
            await tx.query(
              `update steps set state = 'reset',
                 result = jsonb_build_object('reset','replan','fromPhase',$3::text,'reason',coalesce($4::text,''))
               where run_id = $1 and ordinal >= $2 and state = 'done'`,
              [args.runId, minOrdinal, args.stepKey, args.reason ?? null],
            );
            await tx.query("update runs set replans = replans + 1 where id = $1", [args.runId]);
            return { ok: true as const, backEdge: { to: targets.map((t) => t.key), replans: runFacts.replans + 1 } };
          }
          // Re-plan cap consumed → the third grounding failure opens the refusal Approval (REQ-WF-5:
          // proceed-with-[unverified] / cut the claim / stop — resolved through resolveGate). The run
          // parks `waiting_gate`; the pod exits and the user decides — never a silent continue.
          const failedStep = (
            await tx.query("select id from steps where run_id = $1 and ordinal = $2", [args.runId, args.ordinal])
          ).rows[0] as { id: string } | undefined;
          await applyTransition(tx, deps, {
            runId: args.runId,
            from: "running",
            to: "waiting_gate",
            reason: "replan_cap",
          });
          refusalGateId = await openGate(tx, deps, {
            runId: args.runId,
            kind: "refusal",
            blocking: true,
            onExpiry: "cancel",
            ...(failedStep ? { stepId: failedStep.id } : {}),
          });
          return { ok: true as const, gateId: refusalGateId };
        }
      }

      // F13 (PRB.16b): a terminal phase failure finalizes the run HERE, inside the step-fail tx —
      // transition + spend reconcile + hold release + credential revocation are one commit, and the
      // reaper/stranded sweep see a terminal run (no second provisioning).
      const terminal = terminalPhaseFailure(args.errorClass, args.reason);
      if (terminal && fenceRow.state === "running") {
        const money = (
          await tx.query(
            `select r.hold_ledger_id, w.billing_account_id
               from runs r join workspaces w on w.id = r.workspace_id where r.id = $1`,
            [args.runId],
          )
        ).rows[0] as { hold_ledger_id: string | null; billing_account_id: string } | undefined;
        await applyTransition(tx, deps, {
          runId: args.runId,
          from: "running",
          to: "failed",
          reason: terminal.code,
          fields: {
            failure: {
              code: terminal.code,
              // the pod's folded reason can run long (class + SDK subtype + agent message) — bound it.
              message: (args.reason ?? terminal.code).slice(0, 500),
              retryable: false,
            },
          },
        });
        // DEF.2/F5 — a failed run refunds its net committed debits (§12.4 step 9: failed/refused runs
        // `refund` their debits), then the metered burn the user did not pay books absorbed (platform
        // COGS — REQ-SPEC-24.8 "carried in the reserve"). The refund precedes the absorb so the gap is
        // computed against the post-refund charge (≈ the whole metered figure).
        if (money) {
          const netDebited = await netDebitedCredits(tx, args.runId);
          if (netDebited > 0) {
            await deps.ledger.refund(tx, {
              billingAccountId: money.billing_account_id,
              workspaceId: args.workspaceId,
              runId: args.runId,
              credits: netDebited,
              // RES.2 — a research-preflight failure is a PLATFORM fault (the harness could never reach
              // research tools): the refund rows carry the platform-fault class so they never re-debit
              // on resume and stay out of DEF.4's user-refund accounting.
              ...(terminal.code === "research_preflight_failed"
                ? { reason: PLATFORM_FAULT_RESEARCH_PREFLIGHT }
                : {}),
              idempotencyKey: `refund:${args.runId}`,
            });
            await deps.eventWriter.append(tx, {
              runId: args.runId,
              type: "cost.refunded",
              payload: { credits: netDebited, reason: terminal.code },
              at: now,
            });
          }
        }
        if (money?.hold_ledger_id) {
          await deps.ledger.release(tx, {
            billingAccountId: money.billing_account_id,
            workspaceId: args.workspaceId,
            runId: args.runId,
            holdLedgerId: money.hold_ledger_id,
            idempotencyKey: `release:${args.runId}`,
          });
        }
        if (money) {
          await absorbMeteredGap(tx, deps, {
            runId: args.runId,
            workspaceId: args.workspaceId,
            billingAccountId: money.billing_account_id,
          });
        }
        await reconcileRunSpend(tx, args.runId);
        await revokeRunCredentials(tx, args.runId, now); // terminal revocation (REQ-SPEC-11)
        terminalCode = terminal.code;
      }
      return { ok: true as const, ...(terminalCode ? { terminal: terminalCode } : {}) };
    });
    // post-commit side effects for a terminalized run (the heartbeat stops; the failed notice queues).
    if (terminalCode) {
      await deps.heartbeats.clear(args.runId);
      await scheduleRunTerminalNotification(deps, {
        runId: args.runId,
        workspaceId: args.workspaceId,
        outcome: "failed",
      });
    }
    // P1.10 — a re-plan-cap refusal gate gets the same waiting notice as any refusal card
    // (onExpiry `cancel`, no deadline ⇒ no reminders; PRB.09's notification seam).
    if (refusalGateId) {
      await scheduleGateNotifications(deps, {
        gateId: refusalGateId,
        workspaceId: args.workspaceId,
        kind: "refusal",
        onExpiry: "cancel",
        deadlineAt: null,
        now: deps.clock.now(),
      });
    }
    return res;
  } catch (e) {
    if (e instanceof StaleTaskError) return { ok: false, code: "stale_task", currentAttempt: e.currentAttempt };
    throw e;
  }
}

/**
 * Finalize a run (§12.4 step 8): `finalizing → completed`, release the unused hold, clear the heartbeat and
 * emit `cost.final`. The delivery transaction's artifact promotion is P0.09's; a delivery-validation failure is
 * `finalizing → failed` via `failRun`. Debit is a separate retried ledger transaction (P0.11) — coupled here.
 */
export async function finalizeRun(
  deps: OrchestratorDeps,
  args: {
    runId: string;
    workspaceId: string;
    billingAccountId: string;
    holdLedgerId?: string;
    spentCredits: number;
    capCredits: number;
    byPhase?: Record<string, number>;
    /**
     * P1.12 — the workspace-bound content store the Outline approval consequences need (the
     * source-note copy reads the assistant notes' bytes). Required for `workflow: "outline"`
     * runs; the `run.finalize` worker job and the bare-finalize route both bind it.
     */
    store?: ContentStore;
  },
): Promise<{ ok: true; state: RunState }> {
  await deps.txRunner.run(args.workspaceId, async (tx) => {
    await applyTransition(tx, deps, { runId: args.runId, from: "finalizing", to: "completed" });
    // DEF.2/F5 — the charge leg of §12.4 step 9: debit the attempt's proxy-metered remainder the phase
    // commits never reached (a lagged metered row, under-reported subagent burn) BEFORE the release —
    // the catch-up draws the run's held credits; released first it would draw nothing and absorb.
    const curAttempt = (
      await tx.query("select current_attempt from runs where id = $1", [args.runId])
    ).rows[0] as { current_attempt: number } | undefined;
    if (curAttempt) {
      await settleMeteredDebit(tx, deps, {
        runId: args.runId,
        workspaceId: args.workspaceId,
        billingAccountId: args.billingAccountId,
        attempt: curAttempt.current_attempt,
      });
      // ECON.1 — `debitMode=metered`: the charge is exactly the meter (ADR-031). The pod-claim floor in
      // `incrementalMeteredDebit` can over-debit (634 vs 632 on 01M3SK62…); under metered the excess is
      // the user's — returned here, still inside the hold, before the release.
      if (deps.debitMode === "metered") {
        await refundMeteredExcess(tx, deps, {
          runId: args.runId,
          workspaceId: args.workspaceId,
          billingAccountId: args.billingAccountId,
          attempt: curAttempt.current_attempt,
        });
      }
    }
    if (args.holdLedgerId) {
      await deps.ledger.release(tx, {
        billingAccountId: args.billingAccountId,
        workspaceId: args.workspaceId,
        runId: args.runId,
        holdLedgerId: args.holdLedgerId,
        idempotencyKey: `release:${args.runId}`,
      });
    }
    // a residual metered-over-cap remainder absorbs as platform COGS (writeDebit self-books most of it).
    await absorbMeteredGap(tx, deps, {
      runId: args.runId,
      workspaceId: args.workspaceId,
      billingAccountId: args.billingAccountId,
    });
    // PRB.16b: reconcile spent_credits from the usage rows of record before the final figure is
    // emitted — a caller-resolved `args.spentCredits` can predate the last metered usage.
    const spentCredits = Math.max(args.spentCredits, await reconcileRunSpend(tx, args.runId));
    await deps.eventWriter.append(tx, {
      runId: args.runId,
      type: "cost.final",
      payload: {
        spentCredits,
        capCredits: args.capCredits,
        ...(args.byPhase ? { byPhase: args.byPhase } : {}),
      },
      at: deps.clock.now(),
    });
    await revokeRunCredentials(tx, args.runId, deps.clock.now()); // terminal revocation (REQ-SPEC-11)
    // PRB.10 — a completed persona build catalogs its snapshot (§9.3 "stored facts"): the persona_profiles
    // row every staleness read diffs against, from the facts FROZEN into inputs.snapshot at creation (never
    // re-derived from mutable persona state) + the artifact ids the committed steps produced. The persona's
    // current_profile_id points at it and active_run_id clears — all inside the finalize transaction.
    const runRow = (
      await tx.query(`select workflow, persona_id, project_id, inputs from runs where id = $1`, [args.runId])
    ).rows[0] as
      | { workflow: string; persona_id: string | null; project_id: string | null; inputs: Record<string, unknown> | string }
      | undefined;
    const runInputs =
      typeof runRow?.inputs === "string" ? (JSON.parse(runRow.inputs) as Record<string, unknown>) : (runRow?.inputs ?? {});
    // P1.12 — the Approve-outline consequences (§7.3): the research-note copies +
    // `outline.approved` event, inside the same transaction as `finalizing → completed`. The
    // workflow's last phase is gated, so this finalize only ever runs post-approval.
    if (runRow?.workflow === "outline" && runRow.project_id) {
      if (!args.store) throw new Error("finalizeRun: outline consequences require a ContentStore");
      await applyOutlineApproval(tx, { ...deps, store: args.store }, {
        runId: args.runId,
        workspaceId: args.workspaceId,
        projectId: runRow.project_id,
        inputs: runInputs,
      });
    }
    // P1.13 — the Figure run's delivery consequences (§7.5; REQ-VIZ-1/9): fold `figure.json` +
    // `provenance.json` into the `figures` row, pin the produced spec/data versions, append the
    // `figure_versions` ordinal, and snapshot the prior version's files under `versions/<n>/` —
    // all inside the finalize transaction.
    if (runRow?.workflow === "figure" && runRow.project_id) {
      if (!args.store) throw new Error("finalizeRun: figure consequences require a ContentStore");
      await applyFigureDelivery(tx, { ...deps, store: args.store }, {
        runId: args.runId,
        workspaceId: args.workspaceId,
        projectId: runRow.project_id,
        inputs: runInputs,
      });
    }
    const snap = (runInputs.snapshot ?? null) as Record<string, unknown> | null;
    if (
      runRow?.persona_id &&
      (runRow.workflow === "profile_voice" || runRow.workflow === "refresh_voice" || runRow.workflow === "calibrate_voice")
    ) {
      const produced = await tx.query(
        `select distinct av.artifact_id from steps s
           join artifact_versions av on av.id = any(s.produced_version_ids)
          where s.run_id = $1 and s.state = 'done'`,
        [args.runId],
      );
      const artifactIds = (produced.rows as { artifact_id: string }[]).map((r) => r.artifact_id);
      const profileId = deps.ids("pp");

      // ---- P1.14: the calibration verdict (§16.3 #10 resolved) + the hold-out leak audit (§9.5) ----
      // The calibration step reports raw measures rows + the blind-check fact in `steps.result`
      // (`result.calibration = {rows, blindCheckPickedPrediction}`); the SERVER computes
      // within-one-band + the verdict — the model can't grade its own homework. Absent a report:
      // 'tested' when a calibration step committed (it ran to completion), else 'untested' —
      // a skipped/voided calibration must never read as tested.
      const calStep = (
        await tx.query(
          `select result from steps where run_id = $1 and phase = 'calibration' and state = 'done'
             order by ordinal desc limit 1`,
          [args.runId],
        )
      ).rows[0] as { result: unknown } | undefined;
      const calResult = (
        calStep?.result && typeof calStep.result === "object"
          ? (calStep.result as Record<string, unknown>).calibration
          : null
      ) as { blindCheckPickedPrediction?: boolean; rows?: { withinBand?: boolean }[] } | null;
      let calibrationStatus: string;
      if (calResult && (calResult.blindCheckPickedPrediction === true || (calResult.rows?.length ?? 0) > 0)) {
        calibrationStatus = calibrationVerdict({
          // a row without an explicit withinBand verdict counts as NOT within — absence must
          // never grade itself a pass (the server, not the model, owns the verdict).
          rows: (calResult.rows ?? []).map((r) => ({ withinBand: r.withinBand === true })),
          ...(calResult.blindCheckPickedPrediction === undefined ? {} : { blindCheckPickedPrediction: calResult.blindCheckPickedPrediction }),
        });
      } else if (calStep) {
        calibrationStatus = "tested";
      } else {
        const frozen = typeof snap?.calibration_status === "string" ? snap.calibration_status : "untested";
        calibrationStatus = frozen === "pending" ? "untested" : frozen;
      }

      // ---- P1.14: the hold-out leak audit (§9.5; REQ-PERSONA-11). A policy-allowed read of the
      //  hold-out by any non-calibrator label VOIDS calibration — never patches it: status snaps to
      //  'untested' and the build note carries the flag. ----
      const holdouts = (runInputs.holdouts ?? null) as
        | { itemId: string; url: string | null; mirrorPath: string; words: number; revealedAt: string | null }
        | null;
      let leakFlag: { kind: string; path: string | null; url: string | null; agent: string | null; at: string | null }[] | null = null;
      if (holdouts) {
        const audit = await auditHoldoutLeak(tx, { runId: args.runId, holdout: holdouts });
        if (audit.leaked) {
          calibrationStatus = "untested";
          leakFlag = audit.leaks.map((l) => ({ kind: l.kind, path: l.path, url: l.url, agent: l.agent, at: l.at }));
        }
      }
      // The reveal (§9.4): a tested/voided-tested verdict stamps the hold-out's identity visible —
      // 'untested' keeps it hidden (a voided audit hides it again until a clean calibration).
      const holdoutForNote = holdouts
        ? {
            ...holdouts,
            revealedAt:
              calibrationStatus === "tested" || calibrationStatus === "tested-badly-off"
                ? (holdouts.revealedAt ?? deps.clock.now().toISOString())
                : null,
          }
        : null;

      // ---- P1.14: profile corrections consume-once (REQ-PERSONA-7). Every unconsumed correction
      //  for the persona stamps `consumed_by_profile_id = <this build>` and lands in the build
      //  note's list — it can never silently re-apply to a later build. ----
      const unconsumed = (
        await tx.query(
          `select id, text from profile_corrections where persona_id = $1 and consumed_by_profile_id is null order by at`,
          [runRow.persona_id],
        )
      ).rows as { id: string; text: string }[];
      if (unconsumed.length > 0) {
        await tx.query(
          `update profile_corrections set consumed_by_profile_id = $2
             where persona_id = $1 and consumed_by_profile_id is null`,
          [runRow.persona_id, profileId],
        );
      }

      // ---- P1.14: the build note (§9.2 "the decisions the build made"): tier, corpus facts, the
      //  calibration verdict + the §16.3 #10 inputs, the hold-out (with the reveal stamp), the
      //  consumed corrections, and any leak flag — everything the Overview/Profile tabs read. ----
      const memberProfileRows = (
        await tx.query(
          `select p.current_profile_id from persona_members pm join personas p on p.id = pm.member_id
             where pm.composite_id = $1`,
          [runRow.persona_id],
        )
      ).rows as { current_profile_id: string | null }[];
      const memberProfiles = memberProfileRows
        .map((r) => r.current_profile_id)
        .filter((x): x is string => x != null);
      const buildNote = {
        tier: typeof snap?.tier === "string" ? snap.tier : null,
        corpusWords: typeof snap?.corpus_size_at_build === "number" ? snap.corpus_size_at_build : null,
        corpusPieces: snap?.sample_set && typeof snap.sample_set === "object" ? Object.keys(snap.sample_set).length : 0,
        calibration: {
          status: calibrationStatus,
          blindCheckPickedPrediction: calResult?.blindCheckPickedPrediction ?? null,
          measureRows: calResult?.rows ?? [],
        },
        holdouts: holdoutForNote,
        leaks: leakFlag,
        consumedCorrections: unconsumed.map((r) => r.id),
      };
      const buildNoteBody = [
        `Voice ${runRow.workflow === "refresh_voice" ? "update" : "build"} (${buildNote.tier ?? "unknown tier"}):`,
        `${buildNote.corpusPieces} pieces, ${buildNote.corpusWords ?? "?"} words.`,
        `Calibration: ${calibrationStatus}.`,
        unconsumed.length > 0 ? `Applied ${unconsumed.length} correction${unconsumed.length === 1 ? "" : "s"} from your description.` : null,
        leakFlag?.[0]
          ? `Calibration voided — a hold-out read leaked (${leakFlag[0].kind} by ${leakFlag[0].agent ?? "unknown"}).`
          : null,
        holdoutForNote?.revealedAt ? `Held-out piece revealed after calibration.` : holdouts ? `One piece is held back for calibration testing.` : null,
      ]
        .filter(Boolean)
        .join(" ");

      await tx.query(
        `insert into persona_profiles
           (id, persona_id, built_by_run_id, built_at, tier, seed_sha256, sample_set_hash, sample_set,
            corpus_size_at_build, calibration_status, artifact_ids, member_profile_ids, build_note)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb)`,
        [
          profileId,
          runRow.persona_id,
          args.runId,
          deps.clock.now(),
          typeof snap?.tier === "string" ? snap.tier : null,
          typeof snap?.seed_sha256 === "string" ? snap.seed_sha256 : null,
          typeof snap?.sample_set_hash === "string" ? snap.sample_set_hash : null,
          JSON.stringify(snap?.sample_set ?? {}),
          typeof snap?.corpus_size_at_build === "number" ? snap.corpus_size_at_build : null,
          calibrationStatus,
          artifactIds,
          memberProfiles,
          JSON.stringify(buildNote),
        ],
      );
      await tx.query(
        `insert into persona_build_notes (id, persona_id, profile_id, body) values ($1,$2,$3,$4)`,
        [deps.ids("pbn"), runRow.persona_id, profileId, buildNoteBody],
      );
      await tx.query(
        `update personas set current_profile_id = $2, active_run_id = null where id = $1`,
        [runRow.persona_id, profileId],
      );
    }

    // P1.14 — the adopt hatch's charter reseed (§9.6; REQ-WF-11): a completed reseed_charter run
    // writes a NEW head version of `agents/author/voice-charter.md` with the seeded lines
    // regenerated and the guidance bytes carried VERBATIM (the diff the adopt dialog previewed).
    // If the pod produced a version the finalize uses it; otherwise the deterministic reseed
    // writes the same shape — guidance lines are structurally outside both paths' reach.
    if (runRow?.workflow === "reseed_charter" && runRow.project_id && runRow.persona_id && args.store) {
      const personaRow = (
        await tx.query(`select display_name, byline, registers from personas where id = $1`, [runRow.persona_id])
      ).rows[0] as { display_name: string | null; byline: string | null; registers: string[] | null } | undefined;
      const charterArt = (
        await tx.query(
          `select a.id, a.head_version_id from artifacts a
            where a.project_id = $1 and a.mirror_path = 'agents/author/voice-charter.md'`,
          [runRow.project_id],
        )
      ).rows[0] as { id: string; head_version_id: string | null } | undefined;
      const producedCharter = (
        await tx.query(
          `select av.id, av.content_sha256, av.s3_key, av.bytes, av.word_count from steps s
             join artifact_versions av on av.id = any(s.produced_version_ids)
             join artifacts a on a.id = av.artifact_id
            where s.run_id = $1 and a.mirror_path = 'agents/author/voice-charter.md'
            order by s.ordinal desc limit 1`,
          [args.runId],
        )
      ).rows[0] as { id: string; content_sha256: string; s3_key: string; bytes: number; word_count: number | null } | undefined;
      let currentText = "";
      if (charterArt?.head_version_id) {
        const sha = (
          await tx.query(`select content_sha256 from artifact_versions where id = $1`, [charterArt.head_version_id])
        ).rows[0] as { content_sha256: string } | undefined;
        const bytes = sha ? await args.store.get(sha.content_sha256).catch(() => null) : null;
        if (bytes) currentText = new TextDecoder().decode(bytes);
      }
      if (!producedCharter) {
        // Deterministic reseed: seeded lines regenerate from the adopted voice; guidance carries.
        const seeded = renderCharterSeed({
          name: personaRow?.display_name ?? null,
          byline: personaRow?.byline ?? null,
          registers: personaRow?.registers ?? null,
        });
        const guidance = guidanceSection(currentText);
        const nextText = guidance ? `${seeded}\n\n${guidance}\n` : `${seeded}\n`;
        const bytes = new TextEncoder().encode(nextText);
        const contentSha256 = sha256Hex(bytes);
        const { key } = await args.store.put(args.workspaceId, contentSha256, bytes);
        const versionId = deps.ids("av");
        let artifactId = charterArt?.id;
        if (!artifactId) {
          artifactId = deps.ids("art");
          await tx.query(
            `insert into artifacts (id, workspace_id, project_id, kind, namespace, mirror_path)
               values ($1,$2,$3,'voice_charter','project','agents/author/voice-charter.md')`,
            [artifactId, args.workspaceId, runRow.project_id],
          );
        }
        const ord = (
          await tx.query(`select coalesce(max(ordinal),0)+1 as n from artifact_versions where artifact_id = $1`, [artifactId])
        ).rows[0] as { n: string | number };
        await tx.query(
          `insert into artifact_versions
             (id, artifact_id, ordinal, content_sha256, s3_key, bytes, word_count, media_type, created_by, immutable)
             values ($1,$2,$3,$4,$5,$6,$7,'text/markdown',$8::jsonb,false)`,
          [
            versionId,
            artifactId,
            Number(ord.n),
            contentSha256,
            key,
            bytes.byteLength,
            nextText.trim().split(/\s+/).filter(Boolean).length,
            JSON.stringify({ kind: "run", runId: args.runId, workflow: "reseed_charter" }),
          ],
        );
        await tx.query(`update artifacts set head_version_id = $2 where id = $1`, [artifactId, versionId]);
      }
      await tx.query(`update personas set active_run_id = null where id = $1`, [runRow.persona_id]);
    }
  });
  await deps.heartbeats.clear(args.runId);
  // the run token is revoked implicitly: a terminal state rejects every further internal call (see `fence`).
  await scheduleRunTerminalNotification(deps, { runId: args.runId, workspaceId: args.workspaceId, outcome: "completed" });
  return { ok: true, state: "completed" };
}

/**
 * Terminal failure with a refund of debits (§12.4 step 9): from `running`/`provisioning`/`finalizing` →
 * failed. DEF.2/F5 — the refund is the DEFAULT, not a caller option: `refundCredits` unset refunds the
 * run's whole net committed charge (Σ debit − Σ refund — the spec's "failed/refused runs refund their
 * debits"); an explicit `0` opts out (e.g. a policy that keeps a delivered partial paid). After the
 * release, the metered burn the user did not pay books `adjustment(absorbed)` — platform COGS.
 */
export async function failRun(
  deps: OrchestratorDeps,
  args: { runId: string; workspaceId: string; billingAccountId: string; from: RunState; failure: { code: string; message: string; retryable: boolean }; refundCredits?: number; holdLedgerId?: string },
): Promise<{ ok: true; state: RunState }> {
  await deps.txRunner.run(args.workspaceId, async (tx) => {
    await applyTransition(tx, deps, {
      runId: args.runId,
      from: args.from,
      to: "failed",
      reason: args.failure.code,
      fields: { failure: args.failure },
    });
    // refund debits before any delivery (REQ-DATA-34); release the unused hold.
    const refundCredits = args.refundCredits ?? (await netDebitedCredits(tx, args.runId));
    if (refundCredits > 0) {
      await deps.ledger.refund(tx, {
        billingAccountId: args.billingAccountId,
        workspaceId: args.workspaceId,
        runId: args.runId,
        credits: refundCredits,
        // RES.2 — the research-preflight default refund rides the platform-fault class (same class as the
        // Unverified refund; the pod could never reach research tools — the fault is ours, not the user's).
        ...(args.failure.code === "research_preflight_failed"
          ? { reason: PLATFORM_FAULT_RESEARCH_PREFLIGHT }
          : {}),
        idempotencyKey: `refund:${args.runId}`,
      });
      // PRB.08: the run row surfaces "refunded N credits; partial results kept" — emit the whitelisted fact.
      await deps.eventWriter.append(tx, {
        runId: args.runId,
        type: "cost.refunded",
        payload: { credits: refundCredits, reason: args.failure.code },
        at: deps.clock.now(),
      });
    }
    if (args.holdLedgerId) {
      await deps.ledger.release(tx, {
        billingAccountId: args.billingAccountId,
        workspaceId: args.workspaceId,
        runId: args.runId,
        holdLedgerId: args.holdLedgerId,
        idempotencyKey: `release:${args.runId}`,
      });
    }
    // DEF.2/F5 — the metered burn the user did not pay absorbs as platform COGS (post-refund ⇒ ≈ the
    // whole metered figure); episode-keyed so a fail→resume→fail saga absorbs each leg once.
    await absorbMeteredGap(tx, deps, {
      runId: args.runId,
      workspaceId: args.workspaceId,
      billingAccountId: args.billingAccountId,
    });
    await reconcileRunSpend(tx, args.runId); // PRB.16b — the terminal settle owns the spend figure
    await revokeRunCredentials(tx, args.runId, deps.clock.now()); // terminal revocation (REQ-SPEC-11)
  });
  await deps.heartbeats.clear(args.runId);
  await scheduleRunTerminalNotification(deps, { runId: args.runId, workspaceId: args.workspaceId, outcome: "failed" });
  return { ok: true, state: "failed" };
}
