// R6SOAK.1 (REQ-ENG-7; D-COST.1-3 (a)) — the soak driver's deterministic contract. Every leg must
// fail if the corresponding check is removed: the pr-<n> guard (the soak can ONLY aim at an owned
// preview), the pre-registered iteration bound, the failure-mode classification (launch budget +
// timeout/retry log markers), and the end-to-end loop over injected seams — N send/cancel pairs,
// a fresh revision per iteration, green only when every launch lands inside the budget.

import { describe, it, expect } from "vitest";
import {
  parseArgs,
  classifyIteration,
  verdictFor,
  fixtureIds,
  soak,
  LAUNCH_BUDGET_MS,
  RUN_START_QUEUE,
  RUN_CANCEL_QUEUE,
} from "./worker-soak.mjs";

const ARGS = ["--stack", "pr-7", "--iterations", "3"];

describe("parseArgs — the soak can only aim at an owned pr-<n> preview", () => {
  it("refuses every non-pr-<digits> stack before any exec", () => {
    for (const bad of ["prod", "dev", "staging", "pr-x", "pr-", "pr1", "PR-7"]) {
      expect(() => parseArgs(["--stack", bad]), bad).toThrow(/refused|must be an owned/);
    }
    expect(() => parseArgs(["--iterations", "3"])).toThrow(); // stack required
  });
  it("bounds --iterations (1..20) and defaults to the pre-registered shape", () => {
    expect(() => parseArgs(["--stack", "pr-7", "--iterations", "0"])).toThrow();
    expect(() => parseArgs(["--stack", "pr-7", "--iterations", "21"])).toThrow();
    const a = parseArgs(["--stack", "pr-7"]);
    expect(a.iterations).toBe(6);
    expect(a.launchBudgetMs).toBe(LAUNCH_BUDGET_MS);
    expect(a.project).toBe("rhema-507501");
  });
});

describe("classifyIteration — the D-P0.15h-3 failure-mode signature", () => {
  const budget = LAUNCH_BUDGET_MS;
  it("a launch inside the budget with no retry markers is clean", () => {
    expect(
      classifyIteration({ jobLaunchMs: 12_000, logMarkers: ["[worker] building GKE launcher…"] }, budget),
    ).toBe("clean");
  });
  it("a launch over the ensureLauncher budget is degraded — the throttle survived", () => {
    expect(classifyIteration({ jobLaunchMs: budget + 1, logMarkers: [] }, budget)).toBe("degraded");
  });
  it("a launch that needed the timeout/retry machinery is degraded even if it landed", () => {
    expect(
      classifyIteration({ jobLaunchMs: 5_000, logMarkers: ["launch attempt 1/3 failed after 60000ms"] }, budget),
    ).toBe("degraded");
    expect(
      classifyIteration({ jobLaunchMs: 5_000, logMarkers: ["timeout after 60000ms: GKE launcher build"] }, budget),
    ).toBe("degraded");
  });
  it("a launch that never landed inside the watch window is failed", () => {
    expect(classifyIteration({ jobLaunchMs: null, logMarkers: [] }, budget)).toBe("failed");
  });
});

describe("verdictFor — green only when every iteration is clean", () => {
  it("six clean launches → green", () => {
    const recs = Array.from({ length: 6 }, () => ({ jobLaunchMs: 10_000, logMarkers: [] }));
    expect(verdictFor(recs).verdict).toBe("green");
  });
  it("one degraded launch → red (the floor stays)", () => {
    const recs = Array.from({ length: 6 }, () => ({ jobLaunchMs: 10_000, logMarkers: [] }));
    recs[3] = { jobLaunchMs: LAUNCH_BUDGET_MS + 1, logMarkers: [] };
    expect(verdictFor(recs).verdict).toBe("red");
    expect(verdictFor(recs).classes).toEqual(["clean", "clean", "clean", "degraded", "clean", "clean"]);
  });
  it("one failed launch → red", () => {
    const recs = [{ jobLaunchMs: null, logMarkers: [] }];
    expect(verdictFor(recs).verdict).toBe("red");
  });
});

describe("fixtureIds — deterministic and stack-scoped", () => {
  it("produces greppable ids per iteration", () => {
    const ids = fixtureIds({ fixturePrefix: "r6soak", stack: "pr-7" }, 2);
    expect(ids.runId).toBe("run_r6soak_pr-7_2");
    expect(ids.workspaceId).toBe("ws_r6soak");
  });
});

// ---- the end-to-end loop over injected seams: N revision bumps + N run.start + N run.cancel ----

function fakeInfra({ launchMs = 8_000, neverLaunch = false } = {}) {
  let rev = 0;
  const gcloudCalls = [];
  const samples = new Map(); // runId -> slo_samples rows
  const runs = new Map(); // runId -> state
  const gcloud = (argv) => {
    gcloudCalls.push(argv.join(" "));
    if (argv[1] === "services" && argv[2] === "update") { rev += 1; return { status: 0, stdout: "" }; }
    if (argv[1] === "services" && argv[2] === "describe") {
      const name = `rhema-pr-7-worker-${String(rev).padStart(5, "0")}-x`;
      return {
        status: 0,
        stdout: JSON.stringify({
          status: { latestReadyRevisionName: name, traffic: [{ percent: 100, revisionName: name }] },
          spec: { template: { spec: { containers: [{ resources: { limits: { cpu: "500m", memory: "512Mi" } } }] } } },
        }),
      };
    }
    if (argv[0] === "logging") return { status: 0, stdout: JSON.stringify([{ textPayload: "[worker] building GKE launcher (lazy)…" }]) };
    return { status: 0, stdout: "" };
  };
  const sends = [];
  const boss = {
    send: async (queue, payload, opts) => {
      sends.push({ queue, payload, opts });
      if (queue === RUN_START_QUEUE && !neverLaunch) {
        runs.set(payload.runId, "provisioning");
        samples.set(payload.runId, [
          { detail: "admit_mint", value_ms: 120 },
          { detail: "job_launch", value_ms: launchMs },
        ]);
      }
      return "job-id";
    },
  };
  const db = {
    query: async (sql, params = []) => {
      if (sql.includes("insert into runs")) { runs.set(params[0], "queued"); return { rows: [] }; }
      if (sql.includes("from runs where id")) {
        const state = runs.get(params[0]);
        return { rows: state ? [{ state, state_since_ms: 0 }] : [] };
      }
      if (sql.includes("from slo_samples")) return { rows: samples.get(params[0]) ?? [] };
      return { rows: [] }; // fixture inserts + cleanup deletes
    },
  };
  return { gcloud, gcloudCalls, boss, sends, db };
}

const baseArgs = {
  stack: "pr-7", iterations: 3, project: "rhema-507501", region: "us-central1",
  launchBudgetMs: LAUNCH_BUDGET_MS, watchTimeoutMs: 1, revisionWaitMs: 60_000,
  fixturePrefix: "r6soak",
};
const io0 = { log: () => {}, sleep: () => Promise.resolve() };

describe("soak — the N-iteration loop over injected seams", () => {
  it("runs exactly N send/cancel pairs, one fresh revision per iteration, green when all land", async () => {
    process.env.RHEMA_SOAK_DATABASE_URL = "postgresql://x";
    const infra = fakeInfra();
    const res = await soak({ ...baseArgs }, { ...io0, ...infra });
    expect(res.verdict).toBe("green");
    expect(res.records).toHaveLength(3);
    // N revision bumps — a distinct cold instance each time — and N start + N cancel sends
    expect(infra.gcloudCalls.filter((c) => c.includes("services update")).length).toBe(3);
    const starts = infra.sends.filter((s) => s.queue === RUN_START_QUEUE);
    const cancels = infra.sends.filter((s) => s.queue === RUN_CANCEL_QUEUE);
    expect(starts).toHaveLength(3);
    expect(cancels).toHaveLength(3);
    // the api's real send shape: {runId, workspaceId} singleton-keyed on the runId
    expect(starts[0].payload).toEqual({ runId: "run_r6soak_pr-7_1", workspaceId: "ws_r6soak" });
    expect(starts[0].opts.singletonKey).toBe("run_r6soak_pr-7_1");
    expect(new Set(res.records.map((r) => r.revision)).size).toBe(3);
    expect(res.records.every((r) => r.classification === "clean")).toBe(true);
    delete process.env.RHEMA_SOAK_DATABASE_URL;
  });

  it("a launch that never lands inside the watch window is recorded failed → red", async () => {
    process.env.RHEMA_SOAK_DATABASE_URL = "postgresql://x";
    const infra = fakeInfra({ neverLaunch: true });
    const res = await soak({ ...baseArgs, iterations: 2 }, { ...io0, ...infra });
    expect(res.verdict).toBe("red");
    expect(res.records.map((r) => r.classification)).toEqual(["failed", "failed"]);
    delete process.env.RHEMA_SOAK_DATABASE_URL;
  });

  it("refuses to run without the tunnel DSN", async () => {
    delete process.env.RHEMA_SOAK_DATABASE_URL;
    await expect(soak({ ...baseArgs, iterations: 1 }, { ...io0, ...fakeInfra() })).rejects.toThrow(/RHEMA_SOAK_DATABASE_URL/);
  });
});
