// The Phase-0 FakeEngine integration harness (ledger G21). Composes the REAL api HTTP routes + worker
// lifecycle handlers + FakeEngine + PGlite so the five G21 scenarios (gates, orphan resume, cancel, cap
// exhaustion, stale task) and the delivered-run Phase-0 exit assessment run end-to-end in one process.

import {
  createOrchestratorTestDb,
  seedProject,
  makeDeps,
  type OrchestratorTestDb,
  type TestDeps,
} from "@rhema/orchestrator/testing";
import {
  runPhase,
  type PhaseOutcome,
  type OracleInputs,
  type SqlClient,
  proxyVsSdkCrossCheck,
  type UsageCrossCheck,
} from "@rhema/orchestrator";
import { createRunRoutes, type Principal } from "@rhema/api";
import {
  handleRunStart,
  handleRunReap,
  handleRunCancel,
  completeCancellation,
  type WorkerRunDeps,
} from "@rhema/worker";
import { FakeEngine, FIXTURES, type PhaseRequest } from "@rhema/engine";
import { WORKFLOW_MANIFESTS, type PhaseManifest } from "@rhema/protocols";
import { buildAccessReport, validateCitedFetched, normalizeUrl } from "@rhema/mirror";

const review = WORKFLOW_MANIFESTS.review!;
const intake: PhaseManifest = review.phases[0]!;

/** A clean recorded fixture (SDK success) and the cap-exhaustion fixture (proxy 402 → SDK `budget`). */
export const HAPPY = FIXTURES.find((f) => f.name === "intake-happy")!;
export const BUDGET_STOP = FIXTURES.find((f) => f.name === "budget-stop")!;

/** The review intake phase's step key — the first phase the G21 scenarios commit. */
export const INTAKE_STEP_KEY = intake.key;

export interface G21Harness {
  readonly db: OrchestratorTestDb;
  readonly deps: TestDeps;
  readonly worker: WorkerRunDeps;
  readonly api: ReturnType<typeof createRunRoutes>;
  readonly seed: Awaited<ReturnType<typeof seedProject>>;
  readonly launches: string[];
  close(): Promise<void>;
  /** HTTP: create a run through the real api route (the sheet's Run click). */
  createRunHttp(over?: Partial<CreateRunBody>): Promise<{ status: number; runId?: string; state?: string }>;
  /** worker: provision a queued run (mint token + credential, launch the Job). Returns the run token. */
  startRun(runId: string): Promise<{ ok: boolean; token?: string; attempt?: number; state?: string }>;
  /** HTTP: first heartbeat (provisioning → running) via the real internal api, run-token authed. */
  heartbeatHttp(runId: string, token: string): Promise<{ status: number; body: unknown }>;
  /** run a FakeEngine phase in-process (the task side). */
  runFakePhase(
    runId: string,
    attempt: number,
    fixtureName: string,
    oracle?: OracleInputs,
    ordinal?: number,
  ): Promise<PhaseOutcome>;
  /** HTTP: commit a step through the real internal api (advance / gate / finalize). */
  commitHttp(
    runId: string,
    token: string,
    body: { stepKey: string; ordinal: number; of: number; credits: number; next: unknown },
  ): Promise<{ status: number; body: { ok?: boolean; state?: string; code?: string; currentAttempt?: number } }>;
  /** HTTP: resolve a gate through the real api route (the human's decision). */
  resolveGateHttp(runId: string, gateId: string, action: string): Promise<{ status: number; body: unknown }>;
  /** the open (unresolved) gate id for a run, or null. */
  openGateId(runId: string): Promise<string | null>;
  /** the current run state (DB read). */
  stateOf(runId: string): Promise<string>;
}

interface CreateRunBody {
  idempotencyKey: string;
  workflow: string;
  modelProfile: { tier: "base" | "balanced" | "frontier" };
  modelTier: "base" | "balanced" | "frontier";
  rigor: "quick" | "standard" | "full_board";
  estimateCredits: number;
  capCredits: number;
  rateTableVersion: number;
  inputs?: Record<string, unknown>;
  draftId?: string;
}

function makeReq(attempt: number, ordinal: number, of: number): PhaseRequest {
  return {
    runId: "run1",
    attempt,
    cwd: "/work/project",
    phase: intake,
    ordinal,
    of,
    skill: review.skill,
    inputs: {},
    seat: "editor",
    maxBudgetUsd: 5,
    maxTurns: 40,
  };
}

const OK_ORACLE: OracleInputs = { phaseResult: { status: "done" }, facts: { thesisPresent: true, inventoryPresent: true } };

export async function createG21Harness(): Promise<G21Harness> {
  const db = await createOrchestratorTestDb();
  const deps = makeDeps(db);
  const seed = await seedProject(db, { draftN: 1 });
  const launches: string[] = [];

  const worker: WorkerRunDeps = {
    ...deps,
    launcher: { launch: (a) => { launches.push(a.runId); return Promise.resolve({ jobId: `job-${launches.length}` }); } },
    config: { imageDigest: "sha256:pinned", serviceAccount: "sa", provider: "anthropic", concurrencyFor: () => 10 },
  };

  const principal: Principal = { userId: seed.userId, workspaceId: seed.workspaceId, billingAccountId: seed.billingAccountId };
  const api = createRunRoutes({ ...deps, principal: () => principal });

  const stateOf = async (runId: string): Promise<string> => {
    const r = await db.txRunner.run(seed.workspaceId, (tx) => tx.query("select state from runs where id=$1", [runId]));
    return (r.rows[0] as { state: string }).state;
  };

  return {
    db,
    deps,
    worker,
    api,
    seed,
    launches,
    close: () => db.close(),

    async createRunHttp(over = {}) {
      const body: CreateRunBody = {
        idempotencyKey: `idem-${Math.random().toString(36).slice(2)}`,
        workflow: "review",
        modelProfile: { tier: "balanced" },
        modelTier: "balanced",
        rigor: "standard",
        estimateCredits: 560,
        capCredits: 840,
        rateTableVersion: 1,
        inputs: { draftId: seed.draftId, sidecar: true },
        draftId: seed.draftId,
        ...over,
      };
      const res = await api.request(`/projects/${seed.projectId}/runs`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json().catch(() => ({}))) as { runId?: string; state?: string };
      return { status: res.status, runId: json.runId, state: json.state };
    },

    async startRun(runId) {
      const res = await handleRunStart(worker, { runId, workspaceId: seed.workspaceId });
      return res.ok
        ? { ok: true, token: res.token, attempt: res.attempt, state: await stateOf(runId) }
        : { ok: false, state: await stateOf(runId) };
    },

    async heartbeatHttp(runId, token) {
      const res = await api.request(`/internal/runs/${runId}/heartbeat`, {
        method: "PUT",
        headers: { authorization: `Bearer ${token}` },
      });
      return { status: res.status, body: await res.json().catch(() => ({})) };
    },

    runFakePhase(runId, attempt, fixtureName, oracle = OK_ORACLE, ordinal = 0) {
      const fixture = FIXTURES.find((f) => f.name === fixtureName)!;
      return runPhase(deps, new FakeEngine(fixture), {
        runId,
        attempt,
        workspaceId: seed.workspaceId,
        modelTier: "balanced",
        rateTableVersion: 1,
        ordinal,
        of: 2,
        phase: intake,
        request: makeReq(attempt, ordinal, 2),
        readOracleInputs: () => Promise.resolve(oracle),
      });
    },

    async commitHttp(runId, token, body) {
      const res = await api.request(`/internal/runs/${runId}/steps/${body.stepKey}/commit`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({
          ordinal: body.ordinal,
          of: body.of,
          credits: body.credits,
          result: { status: "done", sdkSubtype: "success", predicatesPassed: true, compactions: 0 },
          next: body.next,
        }),
      });
      return { status: res.status, body: (await res.json().catch(() => ({}))) as { ok?: boolean; state?: string; code?: string; currentAttempt?: number } };
    },

    async resolveGateHttp(runId, gateId, action) {
      const res = await api.request(`/runs/${runId}/gates/${gateId}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      });
      return { status: res.status, body: await res.json().catch(() => ({})) };
    },

    async openGateId(runId) {
      const r = await db.client.query("select id from gates where run_id=$1 and resolved_at is null order by opened_at desc limit 1", [runId]);
      return (r.rows[0] as { id: string } | undefined)?.id ?? null;
    },

    stateOf,
  };
}

// ---------------------------------------------------------------- Phase-0 exit assessment (AC1–AC5) ----

export interface Phase0ExitAssessment {
  readonly runId: string;
  readonly attempt: number;
  readonly terminalState: string;
  /** the run reached a delivered/completed terminal state (delivery enforced cited⇒fetched + sidecars). */
  readonly delivered: boolean;
  /** AC1: boundary attestation violations (derived from the hydration manifest + proxy log). */
  readonly boundaryViolations: number;
  readonly boundaryOk: boolean;
  /** AC3: every persisted sidecar ArtifactVersion.parseStatus is 'ok' (REQ-DATA-7 amended). */
  readonly sidecars: { total: number; failed: number; allOk: boolean };
  /** AC2: cited ⇒ fetched over the run's persisted claims + claim sources vs the proxy fetch log. */
  readonly citedFetched: { checked: number; misses: number; ok: boolean };
  /** AC5: proxy-metered vs SDK-reported cost (± 2%). */
  readonly cost: UsageCrossCheck;
  /** all applicable Phase-0 exit checks green (cost is `comparable ? withinTolerance : n/a`). */
  readonly passed: boolean;
}

// A run whose delivery transaction committed reaches `completed` (§12.4). `completed_partial` delivered partial
// artifacts (cap/step failure) — the full Phase-0 exit criterion wants a clean `completed`.
const DELIVERED_STATES = new Set(["completed"]);

/**
 * Assess the §17 Phase-0 exit criteria for one delivered run, from persisted rows (AC1–AC5). Deterministic — the
 * checks read the same server-side facts the live dev runs would; here they run against a composed FakeEngine run's
 * rows. Compose it inside a tenant-scoped tx (claims/correspondence are RLS).
 */
export async function assessPhase0ExitForRun(
  exec: SqlClient,
  args: { runId: string; attempt: number },
): Promise<Phase0ExitAssessment> {
  const { runId, attempt } = args;

  const stateRow = (await exec.query("select state from runs where id=$1", [runId])).rows[0] as { state: string } | undefined;
  const terminalState = stateRow?.state ?? "unknown";
  const delivered = DELIVERED_STATES.has(terminalState);

  // AC1 — boundary attestation violations (mirror, from run_mounts + fetch_log + subagent_launches).
  const report = await buildAccessReport(exec, { runId, attempt });
  const boundaryViolations = report.violations;
  const boundaryOk = boundaryViolations === 0;

  // AC3 — persisted sidecar parseStatus. Only versions that carry a parse_status (the JSON sidecars) count.
  const svRes = await exec.query(
    `select av.parse_status from artifact_versions av
       join correspondence_items ci on av.id = any(ci.artifact_ids)
      where ci.run_id = $1 and av.parse_status is not null`,
    [runId],
  );
  const svRows = svRes.rows as { parse_status: string }[];
  const failed = svRows.filter((r) => r.parse_status !== "ok").length;
  const sidecars = { total: svRows.length, failed, allOk: failed === 0 };

  // AC2 — cited ⇒ fetched over persisted claims + claim_sources vs the proxy fetch log (REQ-VIS-9 / REQ-OBJ-18).
  const fetchedRes = await exec.query(
    `select normalized_url, url from fetch_log
      where run_id = $1 and kind in ('fetch','search') and decision in ('allow','success','ok')`,
    [runId],
  );
  const fetched = new Set<string>();
  for (const r of fetchedRes.rows as { normalized_url: string | null; url: string | null }[]) {
    if (r.normalized_url) fetched.add(r.normalized_url);
    else if (r.url) fetched.add(normalizeUrl(r.url));
  }
  const claimRes = await exec.query(
    `select c.url, c.normalized_url,
            (select coalesce(json_agg(json_build_object('url', cs.url, 'normalizedUrl', cs.normalized_url)), '[]')
               from claim_sources cs where cs.claim_id = c.id) as sources
       from claims c join correspondence_items ci on ci.id = c.correspondence_id
      where ci.run_id = $1`,
    [runId],
  );
  type ClaimShape = { url: string | null; normalized_url: string | null; sources: { url: string; normalizedUrl: string | null }[] | string };
  const claims = (claimRes.rows as ClaimShape[]).map((r) => ({
    url: r.url ?? undefined,
    sources: (typeof r.sources === "string" ? JSON.parse(r.sources) : r.sources).map((s: { url: string }) => ({ url: s.url })),
  }));
  // validateCitedFetched reads only `.url` and `.sources[].url`; the run's claim rows carry those (the full
  // ClaimRow shape is irrelevant to the join), so cast through `unknown`.
  const cited = validateCitedFetched(claims as unknown as Parameters<typeof validateCitedFetched>[0], fetched);
  const citedChecked = claims.reduce((n, c) => n + (c.url ? 1 : 0) + c.sources.length, 0);
  const citedFetched = { checked: citedChecked, misses: cited.misses.length, ok: cited.ok };

  // AC5 — proxy vs SDK cost (± 2%).
  const cost = await proxyVsSdkCrossCheck(exec, runId);

  const costOk = cost.comparable ? cost.withinTolerance : true; // not-comparable is not a failure (row-population is D-P0.08-2)
  const passed = boundaryOk && sidecars.allOk && citedFetched.ok && costOk;

  return { runId, attempt, terminalState, delivered, boundaryViolations, boundaryOk, sidecars, citedFetched, cost, passed };
}

export { handleRunReap, handleRunCancel, completeCancellation };
