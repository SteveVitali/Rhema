import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createOrchestratorTestDb, seedProject, seedRun, type OrchestratorTestDb } from "./testing/pg.js";
import { makeDeps, type TestDeps } from "./testing/deps.js";
import { admitRun, provisionRun, mintProxyCredential, type JobLauncher, type ProvisionArgs } from "./provision.js";
import { lockKeys } from "./locks.js";
import { createDbRunContextResolver } from "./resolver.js";
import type { RunAllowlistData } from "./resolver.js";
import { authorWebToolPolicy } from "./allowlist.js";

let db: OrchestratorTestDb;
let deps: TestDeps;
let seed: Awaited<ReturnType<typeof seedProject>>;

beforeEach(async () => {
  db = await createOrchestratorTestDb();
  deps = makeDeps(db);
  seed = await seedProject(db, { draftN: 1 });
});
afterEach(() => db.close());

const nsAuthor = () => lockKeys.nsWrite("author", seed.projectId);

describe("admission — lock set + writer lock + concurrency (AC4; REQ-RUN-17)", () => {
  it("a second writer queues behind the running writer, naming the blocking run", async () => {
    await seedRun(db, {
      runId: "run1",
      workspaceId: seed.workspaceId,
      projectId: seed.projectId,
      workflow: "draft",
      state: "provisioning",
      lockSet: [nsAuthor(), lockKeys.draftWrite("d2")],
    });
    await seedRun(db, {
      runId: "run2",
      workspaceId: seed.workspaceId,
      projectId: seed.projectId,
      workflow: "draft",
      state: "queued",
      lockSet: [nsAuthor(), lockKeys.draftWrite("d3")],
    });
    const res = await admitRun(deps, {
      runId: "run2",
      workspaceId: seed.workspaceId,
      billingAccountId: seed.billingAccountId,
      workflow: "draft",
      projectId: seed.projectId,
      concurrencyLimit: 10,
    });
    expect(res).toMatchObject({ admitted: false, reason: "lock_conflict", blockingRunId: "run1", key: nsAuthor() });
  });

  it("review(vN, A) ∥ review(vN, B) — variants at k=1 and k=2 are both admitted", async () => {
    await seedRun(db, {
      runId: "run1",
      workspaceId: seed.workspaceId,
      projectId: seed.projectId,
      workflow: "review",
      state: "running",
      lockSet: [lockKeys.draftRead(seed.draftId!), lockKeys.corr(seed.draftId!, "review", 1)],
    });
    await seedRun(db, {
      runId: "run2",
      workspaceId: seed.workspaceId,
      projectId: seed.projectId,
      workflow: "review",
      state: "queued",
      lockSet: [lockKeys.draftRead(seed.draftId!), lockKeys.corr(seed.draftId!, "review", 2)],
    });
    const res = await admitRun(deps, {
      runId: "run2",
      workspaceId: seed.workspaceId,
      billingAccountId: seed.billingAccountId,
      workflow: "review",
      projectId: seed.projectId,
      concurrencyLimit: 10,
    });
    expect(res.admitted).toBe(true);
  });

  it("a persona run locks the persona, not the project — admitted alongside a project run", async () => {
    await seedRun(db, {
      runId: "run1",
      workspaceId: seed.workspaceId,
      projectId: seed.projectId,
      workflow: "review",
      state: "running",
      lockSet: [lockKeys.draftRead(seed.draftId!), lockKeys.corr(seed.draftId!, "review", 1)],
    });
    await seedRun(db, {
      runId: "pv-run",
      workspaceId: seed.workspaceId,
      personaId: "pv1",
      workflow: "refresh_voice",
      state: "queued",
      lockSet: [lockKeys.personaProfileWrite("pv1")],
    });
    const res = await admitRun(deps, {
      runId: "pv-run",
      workspaceId: seed.workspaceId,
      billingAccountId: seed.billingAccountId,
      workflow: "refresh_voice",
      concurrencyLimit: 10,
    });
    expect(res.admitted).toBe(true);
  });

  it("plan concurrency: an account at its limit queues the next run", async () => {
    await seedRun(db, { runId: "run1", workspaceId: seed.workspaceId, state: "running" });
    await seedRun(db, { runId: "run2", workspaceId: seed.workspaceId, state: "queued" });
    const res = await admitRun(deps, {
      runId: "run2",
      workspaceId: seed.workspaceId,
      billingAccountId: seed.billingAccountId,
      workflow: "review",
      concurrencyLimit: 1,
    });
    expect(res).toMatchObject({ admitted: false, reason: "concurrency" });
  });

  it("a lone writer acquires the per-project writer lock on admission", async () => {
    await seedRun(db, {
      runId: "run1",
      workspaceId: seed.workspaceId,
      projectId: seed.projectId,
      workflow: "draft",
      state: "queued",
      lockSet: [nsAuthor()],
    });
    const res = await admitRun(deps, {
      runId: "run1",
      workspaceId: seed.workspaceId,
      billingAccountId: seed.billingAccountId,
      workflow: "draft",
      projectId: seed.projectId,
      concurrencyLimit: 10,
    });
    expect(res.admitted).toBe(true);
    const proj = (
      await db.txRunner.run(seed.workspaceId, (tx) =>
        tx.query("select active_writer_run_id from projects where id=$1", [seed.projectId]),
      )
    ).rows[0] as { active_writer_run_id: string };
    expect(proj.active_writer_run_id).toBe("run1");
  });
});

const allowlist: RunAllowlistData = {
  endpoints: [{ host: "api.anthropic.com", pathPrefix: "/v1/" }],
  models: ["claude-sonnet-5"],
  urlPolicy: { blockedDomains: ["holdout.example"], novelDomainCap: 5, knownDomains: ["nyt.com"] },
};

function provisionArgs(over: Partial<ProvisionArgs> = {}): ProvisionArgs {
  return {
    runId: "run1",
    workspaceId: seed.workspaceId,
    billingAccountId: seed.billingAccountId,
    workflow: "review",
    projectId: seed.projectId,
    concurrencyLimit: 10,
    seat: "editor",
    imageDigest: "sha256:pinned",
    serviceAccount: "run-sa@rhema-507501.iam",
    modelTier: "balanced",
    provider: "anthropic",
    rateTableVersion: 1,
    capCredits: 840,
    allowlist,
    ...over,
  };
}

describe("provisionRun (§12.4 step 4)", () => {
  it("admits, transitions queued → provisioning, mints token + credential + allowlist, launches the Job", async () => {
    await seedRun(db, { runId: "run1", workspaceId: seed.workspaceId, projectId: seed.projectId, state: "queued", lockSet: [] });
    const launcher: JobLauncher = { launch: () => Promise.resolve({ jobId: "job-1" }) };
    const res = await provisionRun(deps, launcher, provisionArgs());
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.jobId).toBe("job-1");
      expect(deps.tokens.verify(res.token)?.attempt).toBe(1);
    }
    const row = (
      await db.txRunner.run(seed.workspaceId, (tx) =>
        tx.query("select state, proxy_credential_id, proxy_allowlist_id from runs where id='run1'", []),
      )
    ).rows[0] as { state: string; proxy_credential_id: string; proxy_allowlist_id: string };
    expect(row.state).toBe("provisioning");
    expect(row.proxy_credential_id).toBeTruthy();
    expect(row.proxy_allowlist_id).toBeTruthy();
  });

  it("a launch that fails 3× ends the run provisioning → failed and revokes the credential", async () => {
    await seedRun(db, { runId: "run1", workspaceId: seed.workspaceId, projectId: seed.projectId, state: "queued", lockSet: [] });
    let calls = 0;
    const launcher: JobLauncher = {
      launch: () => {
        calls++;
        return Promise.reject(new Error("no capacity"));
      },
    };
    const res = await provisionRun(deps, launcher, provisionArgs());
    expect(res).toMatchObject({ ok: false, reason: "launch_failed", attempts: 3 });
    expect(calls).toBe(3);
    expect(await stateOf("run1")).toBe("failed");
    const cred = (await db.client.query("select revoked_at from proxy_credentials where run_id='run1'", [])).rows[0] as {
      revoked_at: Date | null;
    };
    expect(cred.revoked_at).not.toBeNull();
  });

  it("rotates the credential on re-provision: the prior attempt's credential is revoked, the new one has an expiry", async () => {
    const launcher: JobLauncher = { launch: () => Promise.resolve({ jobId: "job-1" }) };
    await seedRun(db, { runId: "run1", workspaceId: seed.workspaceId, projectId: seed.projectId, state: "queued", lockSet: [] });
    await provisionRun(deps, launcher, provisionArgs());
    // simulate a reaper resume: back to queued, attempt bumped.
    await db.txRunner.run(seed.workspaceId, (tx) =>
      tx.query("update runs set state='queued', current_attempt=2 where id='run1'", []),
    );
    await provisionRun(deps, launcher, provisionArgs());

    const creds = (
      await db.client.query("select attempt, revoked_at, expires_at from proxy_credentials where run_id='run1' order by attempt", [])
    ).rows as { attempt: number; revoked_at: Date | null; expires_at: Date | null }[];
    expect(creds).toHaveLength(2);
    expect(creds[0].attempt).toBe(1);
    expect(creds[0].revoked_at).not.toBeNull(); // attempt-1 credential revoked on rotation
    expect(creds[1].attempt).toBe(2);
    expect(creds[1].revoked_at).toBeNull();
    expect(creds[1].expires_at).not.toBeNull(); // mint sets an expiry (defense in depth)
  });

  it("does not provision when not admitted (returns the admit blocker)", async () => {
    await seedRun(db, { runId: "holder", workspaceId: seed.workspaceId, state: "running" });
    await seedRun(db, { runId: "run1", workspaceId: seed.workspaceId, projectId: seed.projectId, state: "queued", lockSet: [] });
    const launcher: JobLauncher = { launch: () => Promise.resolve({ jobId: "x" }) };
    const res = await provisionRun(deps, launcher, provisionArgs({ concurrencyLimit: 1 }));
    expect(res).toMatchObject({ ok: false, reason: "not_admitted" });
    expect(await stateOf("run1")).toBe("queued");
  });

  it("SLO.1 — a successful provision lands run_start_stage_ms samples (admit_mint + job_launch); failures never sample", async () => {
    await seedRun(db, { runId: "run1", workspaceId: seed.workspaceId, projectId: seed.projectId, state: "queued", lockSet: [] });
    const launcher: JobLauncher = { launch: () => Promise.resolve({ jobId: "job-1" }) };
    const res = await provisionRun(deps, launcher, provisionArgs());
    expect(res.ok).toBe(true);
    // the sample write is awaited-but-caught inside provisionRun — a short yield still covers the
    // ordering on the single-wire PGlite.
    await new Promise((r) => setTimeout(r, 20));
    const rows = (
      await db.client.query(
        `select detail, value_ms, run_id from slo_samples where signal = 'run_start_stage_ms' order by detail`,
        [],
      )
    ).rows as { detail: string; value_ms: number; run_id: string }[];
    expect(rows.map((r) => r.detail)).toEqual(["admit_mint", "job_launch"]);
    for (const r of rows) {
      expect(r.run_id).toBe("run1");
      expect(r.value_ms).toBeGreaterThanOrEqual(0);
    }

    // a launch that fails 3× lands NO stage rows (the failure path's own signal carries it)
    await db.client.query(`delete from slo_samples`, []);
    await db.txRunner.run(seed.workspaceId, (tx) =>
      tx.query("update runs set state='queued', current_attempt=2 where id='run1'", []),
    );
    const badLauncher: JobLauncher = { launch: () => Promise.reject(new Error("no capacity")) };
    const failed = await provisionRun(deps, badLauncher, provisionArgs());
    expect(failed.ok).toBe(false);
    await new Promise((r) => setTimeout(r, 20));
    const n = (await db.client.query(`select count(*)::int n from slo_samples where signal = 'run_start_stage_ms'`, [])).rows[0] as { n: number };
    expect(n.n).toBe(0);
  });
});

describe("DB-backed RunContextResolver (D-P0.07-3)", () => {
  it("mints a credential the resolver reads back into a RunContext; revocation → null", async () => {
    await seedRun(db, { runId: "run1", workspaceId: seed.workspaceId, projectId: seed.projectId, state: "provisioning" });
    const secret = await mintProxyCredential(deps, {
      runId: "run1",
      attempt: 1,
      workspaceId: seed.workspaceId,
      billingAccountId: seed.billingAccountId,
      projectId: seed.projectId,
      role: "editor",
      agentId: "editor",
      provider: "anthropic",
      modelTier: "balanced",
      rateTableVersion: 1,
      capCredits: 840,
      allowlist,
    });
    const resolver = createDbRunContextResolver(db.client, { now: () => deps.clock.now() });
    const ctx = await resolver.resolve(secret);
    expect(ctx).not.toBeNull();
    expect(ctx).toMatchObject({
      runId: "run1",
      attempt: 1,
      role: "editor",
      workspaceId: seed.workspaceId,
      billingAccountId: seed.billingAccountId,
      provider: "anthropic",
      modelTier: "balanced",
      rateTableVersion: 1,
      capCredits: 840,
      novelDomainCap: 5,
    });
    expect(ctx?.allowlist.models).toEqual(["claude-sonnet-5"]);
    expect(ctx?.allowlist.endpoints).toEqual([{ host: "api.anthropic.com", pathPrefix: "/v1/" }]);
    expect(ctx?.urlPolicy.blockedDomains).toEqual(["holdout.example"]);
    expect(ctx?.knownDomains).toEqual(["nyt.com"]);

    // an unknown credential resolves to null (proxy answers 403).
    expect(await resolver.resolve("bogus")).toBeNull();

    // revoke → the resolver no longer resolves it.
    await db.client.query("update proxy_credentials set revoked_at = now() where run_id='run1'", []);
    expect(await resolver.resolve(secret)).toBeNull();
  });

  it("persists the run's webTools research policy into the credential context (PRB.22)", async () => {
    await seedRun(db, { runId: "run2", workspaceId: seed.workspaceId, projectId: seed.projectId, state: "provisioning" });
    const webTools = authorWebToolPolicy({ claims: 3 });
    const secret = await mintProxyCredential(deps, {
      runId: "run2",
      attempt: 1,
      workspaceId: seed.workspaceId,
      billingAccountId: seed.billingAccountId,
      role: "editor",
      agentId: "editor",
      provider: "anthropic",
      modelTier: "base",
      rateTableVersion: 1,
      capCredits: 207,
      allowlist,
      webTools,
    });
    const resolver = createDbRunContextResolver(db.client, { now: () => deps.clock.now() });
    const ctx = await resolver.resolve(secret);
    expect(ctx?.webTools).toEqual(webTools); // the proxy's bound rides the credential context
  });
});

async function stateOf(runId: string): Promise<string> {
  const r = await db.txRunner.run(seed.workspaceId, (tx) => tx.query("select state from runs where id = $1", [runId]));
  return (r.rows[0] as { state: string }).state;
}
