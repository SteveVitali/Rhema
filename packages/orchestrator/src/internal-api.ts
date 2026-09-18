// The internal run API (§12.4 steps 5–8; REQ-ARCH-11 amended; REQ-RUN-2/15; REQ-DATA-33). Authenticated by
// the run token held by the `harness` uid, single-run, EVERY call carries `attempt` and is rejected with
// `409 stale_task` when `attempt < runs.current_attempt` (fencing — AC2). There is no `POST fetch`: the fetch
// log of record is the proxy's. State transitions are made only here, in a transaction that also appends the
// event (REQ-DATA-33). Artifact materialization/harvest (P0.09), gate resolution (P0.10) and ledger internals
// (P0.11) live behind the interfaces this module calls; this ticket owns the durable lifecycle.

import type { AgentTypeKey, GateKind, GateOnExpiry } from "@rhema/contracts";
import type { UsageSnapshot } from "@rhema/engine";
import {
  buildSeatHydration,
  persistHarvest,
  recordMounts,
  type ContentStore,
  type MirrorManifest,
  type NewVersion,
  type Overlay,
  type ServerFile,
} from "@rhema/mirror";
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
  scheduleRunTerminalNotification,
} from "./notifications.js";
import type { EmailActionConfig } from "./email-actions.js";
import type { SqlClient, TxRunner } from "./tx.js";
import { applyTransition, readRunState, type RunFields } from "./transition.js";
import { isTerminal, type RunState } from "./state-machine.js";
import { revokeRunCredentials } from "./credentials.js";
import { reconcileRunSpend } from "./spend.js";
import { MAX_EVENT_BATCH } from "./event-store.js";

/** The full DI bundle the internal API + provisioning + reaper + phase loop share. */
export interface OrchestratorDeps {
  readonly txRunner: TxRunner;
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
    const seat = (row.seat ?? "editor") as AgentTypeKey;
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

    const { manifest, derived } = await buildSeatHydration(tx, {
      seat,
      projectId: row.project_id,
      personaId: row.persona_id,
      overlays,
      serverFiles,
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
  const box: { debitedBillingAccountId: string | null } = { debitedBillingAccountId: null };
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
      const stepId = deps.ids("step");
      await tx.query(
        `insert into steps(id, run_id, phase, ordinal, state, attempt, produced_version_ids, started_at,
           ended_at, credits, result)
         values ($1,$2,$3,$4,'done',$5,$6,$7,$7,$8,$9)
         on conflict (run_id, ordinal) do update set
           state='done', attempt=excluded.attempt, produced_version_ids=excluded.produced_version_ids,
           ended_at=excluded.ended_at, credits=excluded.credits, result=excluded.result`,
        [
          stepId,
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

      // debit per committed step (REQ-DATA-34), coupling into the ledger inside the commit tx. `args.credits`
      // is the step's reconciled cost (from the proxy's metered rows); P0.11's `debit` enforces min(actual,
      // cap − Σ) under the run-row lock. idempotent on (run, step, attempt) via the ledger's idempotency key.
      if (args.credits > 0) {
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
          credits: args.credits,
          idempotencyKey: `debit:${args.runId}:${args.stepKey}:${args.attempt}`,
        });
      }

      if (args.next.kind === "advance") {
        const state = (await readRunState(tx, args.runId))!; // stays running (self-edge, no state row change)
        return { ok: true, idempotent: false, state };
      }
      if (args.next.kind === "finalize") {
        await applyTransition(tx, deps, { runId: args.runId, from: "running", to: "finalizing" });
        return { ok: true, idempotent: false, state: "finalizing" };
      }
      // gate: open it inside the commit tx, transition to waiting_gate, park ≤30 days; the task then exits.
      const parkFields: RunFields = { parkedUntil: new Date(now.getTime() + THIRTY_DAYS_MS) };
      await applyTransition(tx, deps, { runId: args.runId, from: "running", to: "waiting_gate", fields: parkFields });
      const gateId = await openGate(tx, deps, {
        runId: args.runId,
        kind: args.next.gateKind,
        blocking: args.next.blocking,
        onExpiry: args.next.onExpiry,
        stepId,
        artifactVersionId: args.next.artifactVersionId,
        deadlineAt: args.next.deadlineAt,
      });
      return { ok: true, idempotent: false, state: "waiting_gate", gateId };
    });
    // Schedule the `gate:<id>` expiry job AFTER commit (§6.4 item 6; the queue send is not transactional with
    // the DB write). Only for a freshly-opened gate with a deadline; a wait gate schedules nothing.
    if (res.ok && !res.idempotent && res.gateId && args.next.kind === "gate") {
      const now = deps.clock.now();
      if (args.next.deadlineAt) {
        await scheduleGateExpiry(deps, {
          gateId: res.gateId,
          workspaceId: args.workspaceId,
          deadlineAt: args.next.deadlineAt,
          now,
        });
      }
      // PRB.09 — the notification jobs ride the same post-commit seam: the +15 min waiting check (immediate
      // for spend kinds) and the T−1 h / T−10 m reminders for an auto-proceeding deadline (D-P0.10-1).
      await scheduleGateNotifications(deps, {
        gateId: res.gateId,
        workspaceId: args.workspaceId,
        kind: args.next.gateKind,
        onExpiry: args.next.onExpiry as GateOnExpiry,
        deadlineAt: args.next.deadlineAt ?? null,
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
 */
function terminalPhaseFailure(errorClass: string, reason: string | undefined): { code: string } | null {
  if (errorClass === "budget" || (reason != null && CAP_REACHED_REASON.test(reason))) {
    return { code: "cap_reached" };
  }
  if (errorClass === "blocked") return { code: "phase_blocked" };
  if (errorClass === "replan") return { code: "phase_replan" };
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
): Promise<{ ok: true; terminal?: string } | { ok: false; code: "stale_task"; currentAttempt: number }> {
  let terminalCode: string | undefined;
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
        await reconcileRunSpend(tx, args.runId);
        if (money?.hold_ledger_id) {
          await deps.ledger.release(tx, {
            billingAccountId: money.billing_account_id,
            workspaceId: args.workspaceId,
            runId: args.runId,
            holdLedgerId: money.hold_ledger_id,
            idempotencyKey: `release:${args.runId}`,
          });
        }
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
  args: { runId: string; workspaceId: string; billingAccountId: string; holdLedgerId?: string; spentCredits: number; capCredits: number; byPhase?: Record<string, number> },
): Promise<{ ok: true; state: RunState }> {
  await deps.txRunner.run(args.workspaceId, async (tx) => {
    await applyTransition(tx, deps, { runId: args.runId, from: "finalizing", to: "completed" });
    if (args.holdLedgerId) {
      await deps.ledger.release(tx, {
        billingAccountId: args.billingAccountId,
        workspaceId: args.workspaceId,
        runId: args.runId,
        holdLedgerId: args.holdLedgerId,
        idempotencyKey: `release:${args.runId}`,
      });
    }
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
      await tx.query(`select workflow, persona_id, inputs from runs where id = $1`, [args.runId])
    ).rows[0] as { workflow: string; persona_id: string | null; inputs: Record<string, unknown> | string } | undefined;
    const runInputs =
      typeof runRow?.inputs === "string" ? (JSON.parse(runRow.inputs) as Record<string, unknown>) : (runRow?.inputs ?? {});
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
      await tx.query(
        `insert into persona_profiles
           (id, persona_id, built_by_run_id, built_at, tier, seed_sha256, sample_set_hash, sample_set,
            corpus_size_at_build, calibration_status, artifact_ids)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
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
          // a Quick Voice's resting calibration state is 'untested' (§9.3 row 6 — a fact about the tier).
          typeof snap?.calibration_status === "string" ? snap.calibration_status : "untested",
          artifactIds,
        ],
      );
      await tx.query(
        `update personas set current_profile_id = $2, active_run_id = null where id = $1`,
        [runRow.persona_id, profileId],
      );
    }
  });
  await deps.heartbeats.clear(args.runId);
  // the run token is revoked implicitly: a terminal state rejects every further internal call (see `fence`).
  await scheduleRunTerminalNotification(deps, { runId: args.runId, workspaceId: args.workspaceId, outcome: "completed" });
  return { ok: true, state: "completed" };
}

/** Terminal failure with a refund of debits (§12.4 step 9): from `running`/`provisioning`/`finalizing` → failed. */
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
    if (args.refundCredits && args.refundCredits > 0) {
      await deps.ledger.refund(tx, {
        billingAccountId: args.billingAccountId,
        workspaceId: args.workspaceId,
        runId: args.runId,
        credits: args.refundCredits,
        idempotencyKey: `refund:${args.runId}`,
      });
      // PRB.08: the run row surfaces "refunded N credits; partial results kept" — emit the whitelisted fact.
      await deps.eventWriter.append(tx, {
        runId: args.runId,
        type: "cost.refunded",
        payload: { credits: args.refundCredits, reason: args.failure.code },
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
    await reconcileRunSpend(tx, args.runId); // PRB.16b — the terminal settle owns the spend figure
    await revokeRunCredentials(tx, args.runId, deps.clock.now()); // terminal revocation (REQ-SPEC-11)
  });
  await deps.heartbeats.clear(args.runId);
  await scheduleRunTerminalNotification(deps, { runId: args.runId, workspaceId: args.workspaceId, outcome: "failed" });
  return { ok: true, state: "failed" };
}
