#!/usr/bin/env node
// FUNDED-WINDOW journey driver — runs registered journey steps (incl. `paid:true` riders) under
// the operator-funded window's authority. The committed `rhema-journeys --paid` weekly guard
// (ISO-week $5 on flagged test tenants) is already spent for the week — this driver substitutes
// the funded window's own binding guard, measured under the SYSTEM role only (D-STB.5b-1):
//
//   (a) journeySpendThisIsoWeek — flagged-tenant proxy-metered spend this ISO week (the guard's
//       own measure, reported for the record);
//   (b) round-3 cumulative — sum(list_cost_usd) over the SAME flagged-tenant proxy scope since
//       2026-10-01 (R5ECON.1 / REQ-ECON-6 + O2-F11: it used to sum ALL usage_records — operator
//       spend and seeded fixture rows included; seeded rows are marked `req_jrn_` and excluded
//       everywhere now);
//       refuses when cumulative ≥ FUNDED_ROUND3_CAP_USD (default $150, the round-3 hard pause)
//       or when cumulative + --headroom <usd> would cross it (the per-leg pre-flight).
//
//   --headroom <legCapUsd> is REQUIRED on every dispatch (REQ-ECON-9). A leg that closes
//   `cap_overrun` (metered > declared capUsd, REQ-ECON-7) PAUSES the window: the driver writes
//   <stateDir>/funded-pause.json and every later dispatch refuses until the operator
//   re-authorizes and removes the sentinel.
//
// Env: JOURNEY_DATABASE_URL — REQUIRED, the system-role DSN (the driver refuses a non-bypass
// role, same as the weekly guard). JOURNEY_FUNDED_STABLE_TAG=a points the STB.5b legs at the
// funded stable tenant (fresh flagged tenants carry only the 10-cr daily allowance — their
// launches 402). JOURNEY_GCP_ACCESS_TOKEN or gcloud ADC mints the mailbox credential.
//
//   node scripts/live/funded-window.mjs --stage prod --steps T9,T10 --expect-sha <sha> \
//     --out docs/build/reports/<date>_funded-c [--headroom 4]
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..");
const require = createRequire(resolve(repoRoot, "packages", "journeys", "package.json"));
const pg = require("pg");
const { chromium } = require("playwright");

const J = await import(resolve(repoRoot, "packages", "journeys", "dist", "index.js"));
const { ALL_IMPLS } = await import(resolve(repoRoot, "packages", "journeys", "dist", "impls.js"));
const {
  STEP_REGISTRY,
  FLAGGED_PROXY_SPEND_SCOPE,
  createGmailClient,
  fetchDeployedSha,
  provenanceMatch,
  journeyNonce,
  runJourneys,
} = J;

function arg(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const stage = arg("--stage") ?? "prod";
const origins = stage === "prod" ? { web: "https://rhema.tools", api: "https://api.rhema.tools" } : undefined;
const web = (arg("--web") ?? origins?.web ?? "http://localhost:3000").replace(/\/+$/, "");
const api = (arg("--api") ?? origins?.api ?? web).replace(/\/+$/, "");
const nonce = arg("--nonce") ?? journeyNonce();
const outDir = arg("--out") ?? `docs/build/reports/${new Date().toISOString().slice(0, 10)}_funded`;
const stateDir = arg("--state-dir") ?? process.env.JOURNEY_STATE_DIR ?? ".journeys-state";
const expectSha = arg("--expect-sha") ?? process.env.JOURNEY_EXPECT_SHA;
// REQ-ECON-9 — the leg's declared cap is REQUIRED on every dispatch; it pre-flights the round
// bound below. Missing ⇒ the leg isn't bounded ⇒ refuse (exit 3); malformed ⇒ misuse (exit 2).
const headroomRaw = arg("--headroom") ?? process.env.JOURNEY_HEADROOM_USD;
if (headroomRaw === undefined) {
  console.error(
    "funded-window dispatch requires --headroom <legCapUsd> (REQ-ECON-9 — the leg's declared cap pre-flights the round bound before dispatch)",
  );
  process.exit(3);
}
const headroom = Number(headroomRaw);
if (!Number.isFinite(headroom) || headroom <= 0) {
  console.error(`--headroom must be a positive USD figure — got ${JSON.stringify(headroomRaw)}`);
  process.exit(2);
}
const ROUND3_CAP = Number(process.env.FUNDED_ROUND3_CAP_USD ?? 150);
const ROUND3_SINCE = process.env.FUNDED_ROUND3_SINCE ?? "2026-10-01";

const stepsArg = arg("--steps");
const steps = STEP_REGISTRY.filter((s) =>
  stepsArg ? stepsArg.split(",").map((x) => x.trim()).includes(s.id) : true,
);
if (steps.length === 0) {
  console.error("no steps selected");
  process.exit(2);
}

// ---- REQ-ECON-7 — the funded-window pause sentinel: a prior cap_overrun stops every later
// dispatch until the operator re-authorizes (removes the file after reviewing the evidence).
const pauseFile = resolve(stateDir, "funded-pause.json");
if (existsSync(pauseFile)) {
  console.error(`funded window PAUSED — a leg closed cap_overrun (REQ-ECON-7): ${readFileSync(pauseFile, "utf8")}`);
  console.error(`operator re-authorization required — remove ${pauseFile} to re-open the window`);
  process.exit(3);
}

// ---- the funded-window guard (system role only; an app-login DSN fails closed) ---------------
const dsn = process.env.JOURNEY_DATABASE_URL;
if (!dsn) {
  console.error("funded-window driver requires JOURNEY_DATABASE_URL (system-role DSN over the IAP tunnel)");
  process.exit(3);
}
const pool = new pg.Pool({ connectionString: dsn, max: 2 });
const q = (sql, params) => pool.query(sql, params).then((r) => r.rows);
try {
  const trust = await q(
    `select (r.rolsuper or r.rolbypassrls) as bypass from pg_roles r where r.rolname = current_user`,
  );
  if (trust[0]?.bypass !== true) {
    console.error("meter pool is not RLS-bypassing — bind the system DSN (D-STB.5b-1). Refusing.");
    process.exit(3);
  }
  // REQ-ECON-6 — both queries share the ONE guard scope (flagged tenants · meter-of-record
  // proxy rows · the `req_jrn_` seed exclusion). The cumulative arm previously summed ALL
  // usage_records — operator spend included (O2-F11); it is pinned to the same scope now.
  const iso = await q(
    `select coalesce(sum(u.list_cost_usd),0)::float8 as usd, count(*)::int n
       from usage_records u join workspaces w on w.id = u.workspace_id
      where ${FLAGGED_PROXY_SPEND_SCOPE} and u.ts >= date_trunc('week', now())`,
  );
  const cum = await q(
    `select coalesce(sum(u.list_cost_usd),0)::float8 as usd, count(*)::int n
       from usage_records u join workspaces w on w.id = u.workspace_id
      where ${FLAGGED_PROXY_SPEND_SCOPE} and u.ts >= $1`,
    [ROUND3_SINCE],
  );
  const isoUsd = Number(iso[0]?.usd ?? 0);
  const cumUsd = Number(cum[0]?.usd ?? 0);
  console.log(
    `[funded-guard] iso-week flagged proxy spend $${isoUsd.toFixed(4)} (${iso[0]?.n} rows) · ` +
      `round-3 cumulative $${cumUsd.toFixed(4)} (${cum[0]?.n} rows since ${ROUND3_SINCE}, flagged proxy scope) · ` +
      `cap $${ROUND3_CAP} · next-leg headroom ask $${headroom}`,
  );
  if (cumUsd >= ROUND3_CAP) {
    console.error(`funded guard refused: round-3 cumulative $${cumUsd.toFixed(2)} ≥ $${ROUND3_CAP}`);
    process.exit(3);
  }
  if (cumUsd + headroom > ROUND3_CAP) {
    console.error(
      `funded guard refused: cumulative $${cumUsd.toFixed(2)} + leg cap --headroom $${headroom} would cross $${ROUND3_CAP}`,
    );
    process.exit(3);
  }

  // ---- provenance -------------------------------------------------------------------------
  const observed = {};
  for (const [label, base] of Object.entries({ web, api })) {
    observed[label] = await fetchDeployedSha(base);
  }
  const provOk = expectSha ? provenanceMatch(expectSha, observed) : false;
  console.log(`[funded] provenance expected=${expectSha ?? "(none)"} observed=${JSON.stringify(observed)} match=${provOk}`);

  const launchOpts = { headless: true };
  try {
    const probe = await chromium.launch({ channel: "chrome", headless: true });
    await probe.close();
    launchOpts.channel = "chrome";
  } catch {
    /* bundled chromium */
  }
  const browser = await chromium.launch(launchOpts);
  let report;
  try {
    report = await runJourneys({
      browser,
      webBaseUrl: web,
      apiBaseUrl: api,
      mailbox: createGmailClient("test@rhema.tools"),
      stateDir,
      outDir,
      nonce,
      paid: true,
      steps,
      impls: ALL_IMPLS,
      provenance: { expected: expectSha, observed, match: provOk },
      // the report carries the funded window's own guard read — the weekly $5 figure is N/A here.
      spend: { weeklyMeteredUsd: isoUsd, capUsd: ROUND3_CAP, withinCap: cumUsd < ROUND3_CAP },
    });
  } finally {
    await browser.close();
  }
  for (const r of report.results) {
    const mark =
      r.outcome === "pass" ? "PASS" : r.outcome === "owed" ? "owed" : r.outcome === "skipped" ? "skip" : r.outcome === "ready-to-flip" ? "FLIP" : r.outcome === "cap_overrun" ? "CAP!" : "FAIL";
    console.log(`${mark.padEnd(5)} ${r.id.padEnd(10)} [${r.owner}] ${r.error ?? ""}`);
  }
  console.log(`report ${outDir}/report.json`);
  // REQ-ECON-7 — a cap_overrun pauses the funded window across dispatches: write the sentinel
  // the pre-flight above refuses on. report.passed already carries the non-zero exit.
  const overruns = report.results.filter((r) => r.outcome === "cap_overrun");
  if (overruns.length > 0) {
    mkdirSync(stateDir, { recursive: true });
    writeFileSync(
      pauseFile,
      JSON.stringify(
        {
          paused: true,
          at: new Date().toISOString(),
          legs: overruns.map((r) => ({ id: r.id, error: r.error })),
        },
        null,
        2,
      ),
    );
    console.error(
      `FUNDED WINDOW PAUSED — ${overruns.map((r) => r.id).join(",")} closed cap_overrun; ` +
        `${pauseFile} now refuses every dispatch until the operator re-authorizes (rm it to re-open)`,
    );
  }
  process.exit(report.passed ? 0 : 1);
} finally {
  await pool.end();
}
