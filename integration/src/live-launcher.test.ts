import { describe, it, expect } from "vitest";
import type { SqlClient } from "@rhema/orchestrator";
import { LiveWorkflowLauncher, LiveLauncherError, type FetchLike, type FetchResponseLike } from "./live-launcher.js";

const PRINCIPAL = { userId: "user_seed", workspaceId: "ws_seed", billingAccountId: "bill_seed" };

/** A one-shot fetch that records the request and returns a fixed response. */
function fakeFetch(response: { status: number; body: unknown }): { fetch: FetchLike; calls: { url: string; init: RequestInit }[] } {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetch: FetchLike = (url, init) => {
    calls.push({ url, init });
    const res: FetchResponseLike = {
      status: response.status,
      json: () => Promise.resolve(response.body),
      text: () => Promise.resolve(typeof response.body === "string" ? response.body : JSON.stringify(response.body)),
    };
    return Promise.resolve(res);
  };
  return { fetch, calls };
}

/** A SqlClient that returns the scripted run rows in order, repeating the last one. */
function scriptedSql(rows: Record<string, unknown>[]): SqlClient {
  let i = 0;
  return {
    query: (_sql: string, _params?: readonly unknown[]) => {
      const row = rows[Math.min(i, rows.length - 1)];
      i++;
      return Promise.resolve({ rows: row ? [row] : [] });
    },
  };
}

describe("LiveWorkflowLauncher — run creation contract", () => {
  it("POSTs to /projects/:id/runs with the three identity headers and maps kind/rigor", async () => {
    const { fetch, calls } = fakeFetch({ status: 201, body: { runId: "run_1", state: "queued", deduped: false } });
    const created = new Date("2026-09-03T00:00:00.000Z");
    const startedAt = new Date("2026-09-03T00:00:05.000Z"); // +5s → 5000ms latency
    const sql = scriptedSql([{ state: "completed", current_attempt: 1, created_at: created, started_at: startedAt }]);

    const launcher = new LiveWorkflowLauncher({ apiBaseUrl: "https://api.dev/", principal: PRINCIPAL, sql, fetch, sleep: () => Promise.resolve() });
    const run = await launcher.launch({ projectId: "proj_pv", workflow: "review" });

    expect(run).toEqual({ runId: "run_1", attempt: 1, queuedToRunningMs: 5000 });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe("https://api.dev/projects/proj_pv/runs"); // trailing slash trimmed
    const headers = calls[0]!.init.headers as Record<string, string>;
    expect(headers["x-rhema-user-id"]).toBe("user_seed");
    expect(headers["x-rhema-workspace-id"]).toBe("ws_seed");
    expect(headers["x-rhema-billing-account-id"]).toBe("bill_seed");
    expect(headers["content-type"]).toBe("application/json");
    const body = JSON.parse(calls[0]!.init.body as string) as { workflow: string; rigor: string; idempotencyKey: string };
    expect(body.workflow).toBe("review");
    expect(body.rigor).toBe("standard");
    expect(body.idempotencyKey).toMatch(/^live-review-proj_pv-standard-n-1$/);
  });

  it("maps full rigor to full_board and quick_voice to a quick profile_voice run", async () => {
    const { fetch, calls } = fakeFetch({ status: 201, body: { runId: "run_2" } });
    const sql = scriptedSql([{ state: "completed", current_attempt: 1, created_at: new Date(0), started_at: new Date(0) }]);
    const launcher = new LiveWorkflowLauncher({ apiBaseUrl: "https://api.dev", principal: PRINCIPAL, sql, fetch, sleep: () => Promise.resolve() });

    await launcher.launch({ projectId: "p1", workflow: "revise", rigor: "full", instrumented: true });
    const revise = JSON.parse(calls[0]!.init.body as string) as { workflow: string; rigor: string; inputs: { instrumented: boolean } };
    expect(revise.workflow).toBe("revise");
    expect(revise.rigor).toBe("full_board");
    expect(revise.inputs.instrumented).toBe(true);

    await launcher.launch({ projectId: "p1", workflow: "quick_voice" });
    const voice = JSON.parse(calls[1]!.init.body as string) as { workflow: string; rigor: string };
    expect(voice.workflow).toBe("profile_voice");
    expect(voice.rigor).toBe("quick");
  });

  it("gives each launch a distinct idempotency key (never collapses two runs into one)", async () => {
    const { fetch, calls } = fakeFetch({ status: 201, body: { runId: "run_x" } });
    const sql = scriptedSql([{ state: "completed", current_attempt: 1, created_at: new Date(0), started_at: new Date(0) }]);
    const launcher = new LiveWorkflowLauncher({ apiBaseUrl: "https://api.dev", principal: PRINCIPAL, sql, fetch, sleep: () => Promise.resolve() });
    await launcher.launch({ projectId: "p1", workflow: "review" });
    await launcher.launch({ projectId: "p1", workflow: "review" });
    const k1 = (JSON.parse(calls[0]!.init.body as string) as { idempotencyKey: string }).idempotencyKey;
    const k2 = (JSON.parse(calls[1]!.init.body as string) as { idempotencyKey: string }).idempotencyKey;
    expect(k1).not.toBe(k2);
  });

  it("folds a resolved draft id into inputs + the lock set", async () => {
    const { fetch, calls } = fakeFetch({ status: 201, body: { runId: "run_d" } });
    const sql = scriptedSql([{ state: "completed", current_attempt: 1, created_at: new Date(0), started_at: new Date(0) }]);
    const launcher = new LiveWorkflowLauncher({
      apiBaseUrl: "https://api.dev", principal: PRINCIPAL, sql, fetch, sleep: () => Promise.resolve(),
      draftIdFor: (p) => `${p}_d2`,
    });
    await launcher.launch({ projectId: "proj_pv", workflow: "review" });
    const body = JSON.parse(calls[0]!.init.body as string) as { draftId: string; inputs: { draftId: string } };
    expect(body.draftId).toBe("proj_pv_d2");
    expect(body.inputs.draftId).toBe("proj_pv_d2");
  });
});

describe("LiveWorkflowLauncher — terminal polling + latency", () => {
  it("polls until a terminal state, then computes queued→running from the row timestamps", async () => {
    const { fetch } = fakeFetch({ status: 201, body: { runId: "run_1", state: "queued" } });
    const created = new Date("2026-09-03T00:00:00.000Z");
    const startedAt = new Date("2026-09-03T00:00:12.000Z"); // 12s
    const sql = scriptedSql([
      { state: "queued", current_attempt: 1, created_at: created, started_at: null },
      { state: "running", current_attempt: 1, created_at: created, started_at: startedAt },
      { state: "completed", current_attempt: 2, created_at: created, started_at: startedAt },
    ]);
    let sleeps = 0;
    const launcher = new LiveWorkflowLauncher({ apiBaseUrl: "https://api.dev", principal: PRINCIPAL, sql, fetch, sleep: () => { sleeps++; return Promise.resolve(); } });
    const run = await launcher.launch({ projectId: "p1", workflow: "review" });
    expect(run).toEqual({ runId: "run_1", attempt: 2, queuedToRunningMs: 12000 });
    expect(sleeps).toBe(2); // two non-terminal reads → two sleeps before the terminal read
  });

  it("reports zero latency when a run terminates before ever running (started_at null)", async () => {
    const { fetch } = fakeFetch({ status: 201, body: { runId: "run_c" } });
    const sql = scriptedSql([{ state: "cancelled", current_attempt: 1, created_at: new Date(0), started_at: null }]);
    const launcher = new LiveWorkflowLauncher({ apiBaseUrl: "https://api.dev", principal: PRINCIPAL, sql, fetch, sleep: () => Promise.resolve() });
    const run = await launcher.launch({ projectId: "p1", workflow: "review" });
    expect(run.queuedToRunningMs).toBe(0);
  });

  it("throws on a poll timeout", async () => {
    const { fetch } = fakeFetch({ status: 201, body: { runId: "run_stuck" } });
    const sql = scriptedSql([{ state: "running", current_attempt: 1, created_at: new Date(0), started_at: new Date(1000) }]);
    let t = 0;
    const launcher = new LiveWorkflowLauncher({
      apiBaseUrl: "https://api.dev", principal: PRINCIPAL, sql, fetch,
      sleep: () => Promise.resolve(), now: () => (t += 10_000), timeoutMs: 15_000,
    });
    await expect(launcher.launch({ projectId: "p1", workflow: "review" })).rejects.toThrow(/did not reach a terminal state/);
  });
});

describe("LiveWorkflowLauncher — failure handling", () => {
  it("throws with the status + body on a non-2xx creation (e.g. 402 insufficient balance)", async () => {
    const { fetch } = fakeFetch({ status: 402, body: { error: "insufficient_balance", required: 840 } });
    const sql = scriptedSql([]);
    const launcher = new LiveWorkflowLauncher({ apiBaseUrl: "https://api.dev", principal: PRINCIPAL, sql, fetch });
    await expect(launcher.launch({ projectId: "p1", workflow: "review" })).rejects.toBeInstanceOf(LiveLauncherError);
    await expect(launcher.launch({ projectId: "p1", workflow: "review" })).rejects.toThrow(/402/);
  });

  it("throws when creation returns no runId", async () => {
    const { fetch } = fakeFetch({ status: 201, body: { state: "queued" } });
    const sql = scriptedSql([]);
    const launcher = new LiveWorkflowLauncher({ apiBaseUrl: "https://api.dev", principal: PRINCIPAL, sql, fetch });
    await expect(launcher.launch({ projectId: "p1", workflow: "review" })).rejects.toThrow(/no runId/);
  });

  it("throws when the run row vanishes during polling", async () => {
    const { fetch } = fakeFetch({ status: 201, body: { runId: "run_gone" } });
    const sql = scriptedSql([]); // no rows ever
    const launcher = new LiveWorkflowLauncher({ apiBaseUrl: "https://api.dev", principal: PRINCIPAL, sql, fetch, sleep: () => Promise.resolve() });
    await expect(launcher.launch({ projectId: "p1", workflow: "review" })).rejects.toThrow(/not found while polling/);
  });
});
