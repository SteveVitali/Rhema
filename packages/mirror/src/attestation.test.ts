import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { materializeSeat } from "./materialize.js";
import { accessReportEvent, buildAccessReport, ITERATION_CAPS, IterationCapError, recordMounts, recordSubagentLaunch, renderAccessReportMd } from "./attestation.js";
import { parseRunEvent } from "@rhema/contracts";
import { createMirrorTestDb, testDeps, type MirrorTestDb } from "./testing/harness.js";
import { InMemoryContentStore } from "./content-store.js";
import { seedBase, seedFetchLog, seedMirrorProject, seedRun } from "./testing/fixture.js";

// P0.09 attestation (REQ-DATA-19/20; §12.6): the access_report is built ONLY from server-side facts — the
// hydration manifest (mounted-path counts), the proxy fetch log (fetches + denied attempts), the subagent
// launch records (scoping), and the in-container audit (secondary "attempts"). AC7.

describe("access report (attestation)", () => {
  let db: MirrorTestDb;
  let store: InMemoryContentStore;
  let workspaceId: string;
  const runId = "run_att";
  const projectId = "proj_pv";

  beforeEach(async () => {
    db = await createMirrorTestDb();
    store = new InMemoryContentStore();
    ({ workspaceId } = await seedBase(db.exec));
    await seedMirrorProject(db.exec, store, workspaceId, { id: projectId, personaId: "prs_pv", tag: "PV" });
    await seedRun(db.exec, { runId, workspaceId, projectId, state: "finalizing" });

    // (1) the hydration manifest — mounted paths for the Editor seat.
    const tree = await materializeSeat(db.exec, store, { seat: "editor", projectId, personaId: "prs_pv" });
    await recordMounts(db.exec, { runId, attempt: 1, manifest: tree.manifest });

    // (2) the proxy fetch log — two allowed fetches + one denied attempt.
    await seedFetchLog(db.exec, { runId, url: "https://a.example/1", normalizedUrl: "https://a.example/1" });
    await seedFetchLog(db.exec, { runId, url: "https://b.example/2", normalizedUrl: "https://b.example/2", kind: "search" });
    await seedFetchLog(db.exec, { runId, url: "https://holdout.example/x", normalizedUrl: "https://holdout.example/x", decision: "deny" });

    // (3) a subagent launch record — the second read, scoped to the draft only.
    await recordSubagentLaunch(db.exec, testDeps(), {
      runId, attempt: 1, label: "second-reader", inputsKind: "explicit_files", inputPaths: ["/work/project/drafts/v1.md"], producerQueryId: "q1",
    });

    // (4) the in-container audit — one denied hook decision (a secondary "attempts" record).
    await db.exec.query(
      `insert into access_log(run_id, ts, agent_label, tool, path, decision) values ($1, now(), 'editor', 'Read', '/work/project/agents/author/x', 'deny')`,
      [runId],
    );
  });
  afterEach(() => db.close());

  it("counts mounted paths from the manifest, fetches from the proxy log, scoping + denied attempts", async () => {
    const report = await buildAccessReport(db.exec, { runId, attempt: 1, violations: 2 });

    expect(report.seat).toBe("editor");
    expect(report.mountedPathCount).toBeGreaterThan(0);
    // the Editor never mounted the Drafter namespace — provable from the manifest counts.
    expect(report.byTopLevel["agents"]).toBeGreaterThan(0);
    expect(report.fetches).toBe(2); // two allowed fetch/search rows
    expect(report.deniedAttempts).toBe(2); // one proxy deny + one in-container hook deny
    expect(report.subagents).toEqual([{ label: "second-reader", inputsKind: "explicit_files", fileCount: 1 }]);
    expect(report.violations).toBe(2);
  });

  it("the boundary.attested event payload validates against the catalogue", async () => {
    const report = await buildAccessReport(db.exec, { runId, attempt: 1 });
    const payload = accessReportEvent(report);
    // it must pass the whitelist validator (REQ-DATA-37 / §12.5).
    expect(() => parseRunEvent("boundary.attested", payload)).not.toThrow();
    expect(payload.paths_touched_count).toBe(report.mountedPathCount);
    expect(payload.fetches).toBe(2);
  });

  it("renders the attestation data for the delivered dossier (AC7)", async () => {
    const report = await buildAccessReport(db.exec, { runId, attempt: 1 });
    const md = renderAccessReportMd(report);
    expect(md).toContain("# Access report");
    expect(md).toContain("second-reader: explicit_files");
    expect(md).toContain("URLs fetched: 2");
  });

  // D-STB.5b-2 (CAP.3; REQ-DATA-20, §12.6) — the audit/gap-check iteration caps were declared in
  // ITERATION_CAPS with no consumer (only .replan was enforced). The launch ledger is the budget:
  // a capped role's (cap+1)-th `subagent_launches` row is refused before it lands.
  it("ITERATION_CAPS bound a capped role's launches at the ledger — the (cap+1)-th is refused", async () => {
    const launchDeps = testDeps(1000);
    for (let i = 0; i < ITERATION_CAPS.audit; i++) {
      await recordSubagentLaunch(db.exec, launchDeps, {
        runId, attempt: i + 1, label: "fidelity-auditor", inputsKind: "explicit_files",
        inputPaths: ["/work/project/drafts/v1.md"],
      });
    }
    await expect(
      recordSubagentLaunch(db.exec, launchDeps, {
        runId, attempt: 9, label: "fidelity-auditor", inputsKind: "explicit_files",
        inputPaths: ["/work/project/drafts/v1.md"],
      }),
    ).rejects.toMatchObject({ name: "IterationCapError", cap: ITERATION_CAPS.audit });
    const n = (await db.exec.query(
      `select count(*)::int as n from subagent_launches where run_id = $1 and label = 'fidelity-auditor'`,
      [runId],
    )).rows[0] as { n: number };
    expect(n.n).toBe(ITERATION_CAPS.audit); // the refused launch left no row
  });

  it("the gap-analyst cap binds independently; uncapped roles are untouched; the count is per-run", async () => {
    const launchDeps = testDeps(2000);
    for (let i = 0; i < ITERATION_CAPS.gapCheck; i++) {
      await recordSubagentLaunch(db.exec, launchDeps, {
        runId, attempt: 1, label: "gap-analyst", inputsKind: "explicit_files", inputPaths: [],
      });
    }
    await expect(
      recordSubagentLaunch(db.exec, launchDeps, {
        runId, attempt: 1, label: "gap-analyst", inputsKind: "explicit_files", inputPaths: [],
      }),
    ).rejects.toBeInstanceOf(IterationCapError);
    // a different run's budget is its own; the uncapped calibrator label is unaffected.
    await seedRun(db.exec, { runId: "run_att2", workspaceId, projectId, state: "running" });
    await recordSubagentLaunch(db.exec, launchDeps, {
      runId: "run_att2", attempt: 1, label: "gap-analyst", inputsKind: "explicit_files", inputPaths: [],
    });
    for (let i = 0; i < ITERATION_CAPS.gapCheck + 2; i++) {
      await recordSubagentLaunch(db.exec, launchDeps, {
        runId, attempt: 1, label: "holdout-calibrator", inputsKind: "explicit_files", inputPaths: [],
      });
    }
    const cal = (await db.exec.query(
      `select count(*)::int as n from subagent_launches where run_id = $1 and label = 'holdout-calibrator'`,
      [runId],
    )).rows[0] as { n: number };
    expect(cal.n).toBe(ITERATION_CAPS.gapCheck + 2);
  });

  it("re-materialization at resume replaces the (run, attempt) manifest row", async () => {
    const before = (await db.exec.query("select count(*)::int as n from run_mounts where run_id=$1", [runId])).rows[0] as { n: number };
    expect(before.n).toBe(1);
    const tree = await materializeSeat(db.exec, store, { seat: "author", projectId, personaId: "prs_pv" });
    await recordMounts(db.exec, { runId, attempt: 1, manifest: tree.manifest });
    const after = (await db.exec.query("select seat from run_mounts where run_id=$1 and attempt=1", [runId])).rows[0] as { seat: string };
    expect(after.seat).toBe("author"); // upserted, not duplicated
    expect(((await db.exec.query("select count(*)::int as n from run_mounts where run_id=$1", [runId])).rows[0] as { n: number }).n).toBe(1);
  });
});
