// The LIVE `WorkflowLauncher` (P0.15c Stage B). Implements the seam `driveLiveExit` (live-exit-driver.ts) drives:
// it POSTs to the deployed api's run-creation route (`POST /projects/:id/runs`) with the three identity headers the
// gateway injects (x-rhema-user-id / -workspace-id / -billing-account-id — apps/api/src/server.ts headerPrincipal),
// reads `runId` off the response, then POLLS the run to a terminal state and computes the §13.5 queued→running
// latency from the run row's timestamps.
//
// There is NO run-status GET route in apps/api/src/run-routes.ts (only the SSE feed at GET /runs/:id/events and the
// run-token-authed internal API), so terminal detection + latency use the DB-polling fallback: an injected pg.Pool-
// backed SqlClient reads the `runs` row directly. `queued→running` = started_at (set on the provisioning→running
// first heartbeat; internal-api.ts sets `startedAt` on that edge) − created_at (a sheet-launched run goes
// created→queued atomically at creation, so created_at is the queued-entry instant).
//
// Every I/O seam (fetch, the SQL executor, sleep, the clock) is injected so the launcher is unit-tested offline.

import type { WorkflowKey } from "@rhema/contracts";
import { isTerminal, type ModelProfile, type RunState, type SqlClient } from "@rhema/orchestrator";
import type { LaunchedRun, Rigor, WorkflowKind, WorkflowLauncher } from "./live-exit-driver.js";

/** The run-creation principal, sent as the gateway identity headers. */
export interface LivePrincipal {
  readonly userId: string;
  readonly workspaceId: string;
  readonly billingAccountId: string;
}

/** The subset of `fetch`'s Response the launcher reads (the global `Response` satisfies it). */
export interface FetchResponseLike {
  readonly status: number;
  json(): Promise<unknown>;
  text(): Promise<string>;
}
export type FetchLike = (url: string, init: RequestInit) => Promise<FetchResponseLike>;

export interface LiveLauncherOptions {
  /** the deployed api base url, e.g. `https://api.dev.rhema…` (no trailing slash). */
  readonly apiBaseUrl: string;
  readonly principal: LivePrincipal;
  /** pg.Pool-backed executor for polling the `runs` row (no api status route exists — DB-poll fallback). */
  readonly sql: SqlClient;
  // ---- run-body defaults (match the G21 harness shape; overridable) ----
  readonly modelProfile?: ModelProfile;
  readonly modelTier?: "base" | "balanced" | "frontier";
  readonly estimateCredits?: number;
  readonly capCredits?: number;
  readonly rateTableVersion?: number;
  /** resolve the working-draft id for a project (folded into the run inputs + lock set). */
  readonly draftIdFor?: (projectId: string) => string | undefined;
  // ---- polling ----
  readonly pollIntervalMs?: number;
  readonly timeoutMs?: number;
  /**
   * A per-PROCESS nonce folded into every launch's idempotency key (RES.1 live probes). The in-process
   * seq alone resets on restart — a retried probe would replay the previous attempt's key and read back
   * its (already-terminal) run. Live drivers MUST pass one (e.g. attempt tag); tests omit it.
   */
  readonly idempotencySeed?: string;
  // ---- injectable seams (tests) ----
  readonly fetch?: FetchLike;
  readonly sleep?: (ms: number) => Promise<void>;
  readonly now?: () => number;
}

/** The driver's WorkflowKind → a real §6 WorkflowKey. `quick_voice` has no distinct key: it is a Quick-rigor voice run. */
const WORKFLOW_KEY_BY_KIND: Record<WorkflowKind, WorkflowKey> = {
  review: "review",
  revise: "revise",
  fact_check: "fact_check",
  profile_voice: "profile_voice",
  quick_voice: "profile_voice",
};

/** The driver's Rigor → the api's rigor enum. `full` is the full-board rigor; `quick_voice` forces `quick`. */
const RIGOR_KEY: Record<Rigor, "standard" | "full_board"> = { standard: "standard", full: "full_board" };

const DEFAULTS = {
  modelProfile: { tier: "balanced" } as ModelProfile,
  modelTier: "balanced" as const,
  estimateCredits: 560,
  capCredits: 840,
  rateTableVersion: 1,
  pollIntervalMs: 1_000,
  timeoutMs: 15 * 60_000, // a real Review run may take minutes; fail-closed after 15 min.
};

/** A live run-launch or poll failure — non-2xx creation, a missing runId, a not-found run, or a poll timeout. */
export class LiveLauncherError extends Error {
  constructor(message: string) {
    super(`live-launcher: ${message}`);
    this.name = "LiveLauncherError";
  }
}

interface RunRow {
  readonly state: RunState;
  readonly currentAttempt: number;
  readonly createdAtMs: number;
  readonly startedAtMs: number | null;
}

/** A timestamptz comes back from node-postgres as a Date (server) — accept an ISO string too (defensive). */
function toMs(v: unknown): number {
  if (v instanceof Date) return v.getTime();
  if (typeof v === "string") return Date.parse(v);
  if (typeof v === "number") return v;
  throw new LiveLauncherError(`unexpected timestamp value: ${String(v)}`);
}

export class LiveWorkflowLauncher implements WorkflowLauncher {
  private readonly fetch: FetchLike;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => number;
  private readonly base: string;
  private launchSeq = 0;

  constructor(private readonly opts: LiveLauncherOptions) {
    this.fetch = opts.fetch ?? (globalThis.fetch as unknown as FetchLike);
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.now = opts.now ?? Date.now;
    this.base = opts.apiBaseUrl.replace(/\/+$/, "");
  }

  async launch(input: {
    readonly projectId: string;
    readonly workflow: WorkflowKind;
    readonly rigor?: Rigor;
    readonly instrumented?: boolean;
    /**
     * RES.1 — the word/claim counts the run's estimate + web-research bound are sized on
     * (`runs.input_snapshot`, read at provision for `authorWebToolPolicy`). The sheet carries these
     * from its claim pre-pass; an API-direct launch that omits them silently lands the claims=0
     * fallback bound (8 searches/16 fetches) — the first live probe starved verification on exactly
     * this. Pass the fixture's real counts when the caller knows them.
     */
    readonly inputSnapshot?: Record<string, unknown>;
  }): Promise<LaunchedRun> {
    const { projectId, workflow, instrumented = false } = input;
    const workflowKey = WORKFLOW_KEY_BY_KIND[workflow];
    const rigor = workflow === "quick_voice" ? "quick" : RIGOR_KEY[input.rigor ?? "standard"];
    const draftId = this.opts.draftIdFor?.(projectId);
    // A distinct key per call so createRun's idempotency never collapses two intended runs into one
    // (deduped); `idempotencySeed` extends that across process restarts (a retried probe attempt must
    // mint a NEW run, not replay the previous attempt's terminal row).
    const seed = this.opts.idempotencySeed ? `${this.opts.idempotencySeed}-` : "";
    const idempotencyKey = `live-${workflow}-${projectId}-${rigor}-${instrumented ? "i" : "n"}-${seed}${++this.launchSeq}`;

    const body = {
      idempotencyKey,
      workflow: workflowKey,
      modelProfile: this.opts.modelProfile ?? DEFAULTS.modelProfile,
      modelTier: this.opts.modelTier ?? DEFAULTS.modelTier,
      rigor,
      estimateCredits: this.opts.estimateCredits ?? DEFAULTS.estimateCredits,
      capCredits: this.opts.capCredits ?? DEFAULTS.capCredits,
      rateTableVersion: this.opts.rateTableVersion ?? DEFAULTS.rateTableVersion,
      // `second_read` is opted OUT for the G1 review runs (the §12.6 scoped second-read producer is D-P0.15h-5;
      // G1 delivers with second_read off — this ticket's Stage B AC1). It is a review-only input.
      inputs: { ...(draftId ? { draftId } : {}), sidecar: true, instrumented, ...(workflow === "review" ? { second_read: false } : {}) },
      ...(draftId ? { draftId } : {}),
      // the word/claim counts the estimate + research bound size on (see `launch` above).
      ...(input.inputSnapshot ? { inputSnapshot: input.inputSnapshot } : {}),
    };

    const res = await this.fetch(`${this.base}/projects/${projectId}/runs`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-rhema-user-id": this.opts.principal.userId,
        "x-rhema-workspace-id": this.opts.principal.workspaceId,
        "x-rhema-billing-account-id": this.opts.principal.billingAccountId,
      },
      body: JSON.stringify(body),
    });

    // createRun returns 201 (new) or 200 (idempotent replay); anything else is a failure (402 balance, 422, 401…).
    if (res.status !== 200 && res.status !== 201) {
      const detail = await res.text().catch(() => "");
      throw new LiveLauncherError(`run creation failed (${res.status}) for ${workflow} on ${projectId}: ${detail}`);
    }
    const json = (await res.json().catch(() => ({}))) as { runId?: string };
    if (!json.runId) throw new LiveLauncherError(`run creation returned no runId for ${workflow} on ${projectId}`);

    return this.awaitTerminal(json.runId, `${workflow} on ${projectId}`);
  }

  /** Poll the `runs` row until a terminal state (or timeout); compute queued→running from its timestamps. */
  private async awaitTerminal(runId: string, label: string): Promise<LaunchedRun> {
    const started = this.now();
    for (;;) {
      const row = await this.readRun(runId);
      if (row == null) throw new LiveLauncherError(`run ${runId} (${label}) not found while polling`);
      if (isTerminal(row.state)) {
        const queuedToRunningMs = row.startedAtMs != null ? Math.max(0, row.startedAtMs - row.createdAtMs) : 0;
        return { runId, attempt: row.currentAttempt, queuedToRunningMs };
      }
      const timeoutMs = this.opts.timeoutMs ?? DEFAULTS.timeoutMs;
      if (this.now() - started > timeoutMs) {
        throw new LiveLauncherError(`run ${runId} (${label}) did not reach a terminal state within ${timeoutMs}ms (last state: ${row.state})`);
      }
      await this.sleep(this.opts.pollIntervalMs ?? DEFAULTS.pollIntervalMs);
    }
  }

  private async readRun(runId: string): Promise<RunRow | null> {
    const res = await this.opts.sql.query(
      "select state, current_attempt, created_at, started_at from runs where id = $1",
      [runId],
    );
    const r = res.rows[0] as
      | { state: RunState; current_attempt: number; created_at: unknown; started_at: unknown }
      | undefined;
    if (!r) return null;
    return {
      state: r.state,
      currentAttempt: r.current_attempt,
      createdAtMs: toMs(r.created_at),
      startedAtMs: r.started_at == null ? null : toMs(r.started_at),
    };
  }
}
