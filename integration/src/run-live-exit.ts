// The dev entry that drives the LIVE Phase-0 exit on a deployed dev (P0.15c Stage B). It wires a pg.Pool-backed
// SqlClient + the live WorkflowLauncher into `driveLiveExit` (live-exit-driver.ts), sets `devTargetAuthorized:true`,
// and prints the operator readout. It is fail-closed at two levels: the driver refuses without an authorized dev
// target, and this entry refuses to run at all unless `RHEMA_LIVE_EXIT=1` — because it launches PAID runs on billable
// dev infra.
//
// Env:
//   RHEMA_LIVE_EXIT=1              required flag (this drives paid runs)
//   API_BASE_URL                   deployed api base url (no trailing slash needed)
//   DATABASE_URL                   the dev Postgres (an elevated/BYPASSRLS role — the assessors read RLS tables)
//   PROJECT_IDS                    comma-separated, exactly 3 project ids
//   RHEMA_USER_ID / RHEMA_WORKSPACE_ID / RHEMA_BILLING_ACCOUNT_ID   identity (default the seed ids)
//
// The pilot six-arm wave is NOT wired here (that is the separate benchmark-runner driver), so `ready` reflects the
// reviews + start-latency + estimator legs only; the readout's pilot line reads "not run".

import pg from "pg";
import type { SqlClient } from "@rhema/orchestrator";
import { driveLiveExit, formatLiveExitReadout, type LiveExitDeps } from "./live-exit-driver.js";
import { LiveWorkflowLauncher, type LivePrincipal } from "./live-launcher.js";
import { createDbInstrumentedFolder } from "./instrumented-folder.js";

export interface RunLiveExitConfig {
  readonly apiBaseUrl: string;
  readonly databaseUrl: string;
  readonly projectIds: readonly string[];
  readonly principal: LivePrincipal;
}

/** Construct the live deps, drive the exit, and log the readout. Closes the pool on the way out. */
export async function runLiveExit(config: RunLiveExitConfig, log: (msg: string) => void = console.log): Promise<void> {
  const pool = new pg.Pool({ connectionString: config.databaseUrl });
  // A pg.Pool-backed SqlClient (the server.ts systemExec adaptation): normalize `.rows` and drop `readonly` params.
  const sql: SqlClient = {
    query: (text, params) => pool.query(text, params ? [...params] : undefined).then((r) => ({ rows: r.rows as unknown[] })),
  };
  try {
    const launcher = new LiveWorkflowLauncher({
      apiBaseUrl: config.apiBaseUrl,
      principal: config.principal,
      sql,
      // Each real project reviews its seeded frozen draft `<proj>_d1` (whose `<proj>_av1` head the fixture
      // repoints to real bytes — live-prepare-fixture.ts); without this the run has no draft to materialize.
      draftIdFor: (projectId) => `${projectId}_d1`,
    });
    const deps: LiveExitDeps = {
      exec: sql,
      launcher,
      projectIds: config.projectIds,
      devTargetAuthorized: true,
      // Fold each instrumented run's measured proxy cost into the estimator (§16.3 #1 / D-P0.15-2) so
      // `estimatorsAreProvisional()` flips false for the ported workflows after one metered run each.
      foldInstrumented: createDbInstrumentedFolder(),
    };
    const readout = await driveLiveExit(deps);
    log(formatLiveExitReadout(readout));
  } finally {
    await pool.end();
  }
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`run-live-exit: ${name} is required`);
    process.exit(1);
  }
  return v;
}

/** CLI entry — guarded so it only runs live when RHEMA_LIVE_EXIT=1. */
export async function main(): Promise<void> {
  if (process.env.RHEMA_LIVE_EXIT !== "1") {
    console.error(
      "run-live-exit: refusing to run — set RHEMA_LIVE_EXIT=1 to drive the LIVE, PAID Phase-0 exit on the deployed dev.",
    );
    process.exit(1);
    return;
  }
  const apiBaseUrl = requireEnv("API_BASE_URL");
  const databaseUrl = requireEnv("DATABASE_URL");
  const projectIds = (process.env.PROJECT_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (projectIds.length !== 3) {
    console.error(`run-live-exit: PROJECT_IDS must list exactly 3 project ids (got ${projectIds.length})`);
    process.exit(1);
    return;
  }
  const principal: LivePrincipal = {
    userId: process.env.RHEMA_USER_ID ?? "user_seed",
    workspaceId: process.env.RHEMA_WORKSPACE_ID ?? "ws_seed",
    billingAccountId: process.env.RHEMA_BILLING_ACCOUNT_ID ?? "bill_seed",
  };
  try {
    await runLiveExit({ apiBaseUrl, databaseUrl, projectIds, principal });
  } catch (err) {
    console.error("run-live-exit: failed:", err);
    process.exitCode = 1;
  }
}

// Run when invoked directly (`tsx integration/src/run-live-exit.ts`), not when imported.
if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  void main();
}
