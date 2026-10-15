#!/usr/bin/env node
// FUNDED-WINDOW journey driver — runs registered journey steps (incl. `paid:true` riders) under
// the operator-funded window's authority. The committed `rhema-journeys --paid` weekly guard
// (ISO-week $5 on flagged test tenants) is already spent for the week — this driver substitutes
// the funded window's own binding guard, measured under the SYSTEM role only (D-STB.5b-1):
//
//   (a) journeySpendThisIsoWeek — flagged-tenant proxy-metered spend this ISO week (the guard's
//       own measure, reported for the record);
//   (b) round cumulative — sum(list_cost_usd) over the SAME flagged-tenant proxy scope since the
//       round epoch (R5ECON.1 / REQ-ECON-6 + O2-F11: it used to sum ALL usage_records — operator
//       spend and seeded fixture rows included; seeded rows are marked `req_jrn_` and excluded
//       everywhere now);
//       refuses when cumulative ≥ the re-authorized round cap (R5ECON.3 / ratified Q-ECON.f:
//       FUNDED_WINDOW_CAP_USD default $60 — the stale round-3 $150 bound is gone; the levered
//       window's own estimate is ~$20–40) or when cumulative + --headroom <usd> would cross it
//       (the per-leg pre-flight).
//
//   --headroom <legCapUsd> is REQUIRED on every dispatch (REQ-ECON-9): it must cover the SELECTED
//   legs' summed declared caps (`capUsd` on the registry rows — the §5.3 table verbatim) AND
//   stay inside the envelope. Every selected paid step must declare a cap ≥ the $0.50 floor —
//   a paid leg with no declared cap refuses the dispatch.
//
//   R5ECON.3 (REQ-FND-8) — the §5.5 window-opening checklist is MECHANICAL: `--dry-run` evaluates
//   the gate's verbatim rows (system-role DSN · cumulative < ~$60 · required headroom · per-leg
//   cap enforcement · T9 → launchers → riders → B19C-last ordering · funded stable tenant +
//   purge exemption · REQ-ECON-6 exclusions · REQ-ECON-11 opt-outs · unpaused) and prints them
//   as pass/fail rows. A row that cannot be measured fails CLOSED. The dry run never launches a
//   browser and never dispatches a leg.
//
//   A leg that closes `cap_overrun` (metered > declared capUsd, REQ-ECON-7) PAUSES the window:
//   the driver writes <stateDir>/funded-pause.json and every later dispatch refuses until the
//   operator re-authorizes and removes the sentinel.
//
// Env: JOURNEY_DATABASE_URL — REQUIRED for dispatch (and for every measured checklist row), the
// system-role DSN (the driver refuses a non-bypass role, same as the weekly guard).
// JOURNEY_FUNDED_STABLE_TAG=a points the paid legs at the funded stable tenant
// (fresh flagged tenants carry only the 10-cr daily allowance — their launches 402);
// TEST_TENANT_PURGE_HOURS (default 26) is the purge window the tenant-freshness check reads.
// JOURNEY_FUNDED_HOLD_GATE=<dir> arms B19A/B19B's hold — their open gates stay parked for the
// window's riders (T15) and a re-run resumes them.
// JOURNEY_GCP_ACCESS_TOKEN or gcloud ADC mints the mailbox credential.
//
//   node scripts/live/funded-window.mjs --stage prod --expect-sha <sha> --headroom 20 \
//     --out docs/build/reports/<date>_funded            # the full ordered window
//   node scripts/live/funded-window.mjs --stage prod --dry-run [--headroom 20]  # checklist only
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..");
const require = createRequire(resolve(repoRoot, "packages", "journeys", "package.json"));
const pg = require("pg");

const J = await import(resolve(repoRoot, "packages", "journeys", "dist", "index.js"));
const { ALL_IMPLS } = await import(resolve(repoRoot, "packages", "journeys", "dist", "impls.js"));
const { assertLegCapUsd } = await import(
  resolve(repoRoot, "packages", "journeys", "dist", "stb5b-helpers.js")
);
const { chromium } = require("playwright");
const {
  STEP_REGISTRY,
  FLAGGED_PROXY_SPEND_SCOPE,
  CapOverrunError,
  FUNDED_WINDOW_CAP_USD,
  FUNDED_WINDOW_SINCE_DEFAULT,
  stableIdentity,
  planWindowDispatch,
  windowChecklist,
  optOutPinsHonored,
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
const dryRun = process.argv.includes("--dry-run");
const stage = arg("--stage") ?? "prod";
const origins = stage === "prod" ? { web: "https://rhema.tools", api: "https://api.rhema.tools" } : undefined;
const web = (arg("--web") ?? origins?.web ?? "http://localhost:3000").replace(/\/+$/, "");
const api = (arg("--api") ?? origins?.api ?? web).replace(/\/+$/, "");
const nonce = arg("--nonce") ?? journeyNonce();
const outDir = arg("--out") ?? `docs/build/reports/${new Date().toISOString().slice(0, 10)}_funded`;
const stateDir = arg("--state-dir") ?? process.env.JOURNEY_STATE_DIR ?? ".journeys-state";
const expectSha = arg("--expect-sha") ?? process.env.JOURNEY_EXPECT_SHA;
// REQ-ECON-9 — the dispatch's declared headroom: REQUIRED live (it pre-flights the round bound
// and must cover the selected legs' summed caps); absent on a --dry-run it simply fails its row.
const headroomRaw = arg("--headroom") ?? process.env.JOURNEY_HEADROOM_USD;
let headroom = null;
if (headroomRaw !== undefined) {
  headroom = Number(headroomRaw);
  if (!Number.isFinite(headroom) || headroom <= 0) {
    console.error(`--headroom must be a positive USD figure — got ${JSON.stringify(headroomRaw)}`);
    process.exit(2);
  }
} else if (!dryRun) {
  console.error(
    "funded-window dispatch requires --headroom <legCapUsd> (REQ-ECON-9 — the dispatch's declared bound pre-flights the round envelope before any leg launches)",
  );
  process.exit(3);
}
// R5ECON.3 (ratified Q-ECON.f) — the re-authorized round envelope: ~$60, env-overridable
// (FUNDED_WINDOW_CAP_USD; FUNDED_ROUND3_CAP_USD reads as the legacy fallback).
const ROUND_CAP = Number(
  process.env.FUNDED_WINDOW_CAP_USD ?? process.env.FUNDED_ROUND3_CAP_USD ?? FUNDED_WINDOW_CAP_USD,
);
const ROUND_SINCE = process.env.FUNDED_ROUND_SINCE ?? process.env.FUNDED_ROUND3_SINCE ?? FUNDED_WINDOW_SINCE_DEFAULT;
const PURGE_HOURS = Number(process.env.TEST_TENANT_PURGE_HOURS ?? 26);

const stepsArg = arg("--steps");
const selected = STEP_REGISTRY.filter((s) =>
  stepsArg ? stepsArg.split(",").map((x) => x.trim()).includes(s.id) : true,
);
if (selected.length === 0) {
  console.error("no steps selected");
  process.exit(2);
}
// §5.5 ordering + cap presence + the summed headroom requirement — the dispatch plan is the
// window's own vocabulary (window-plan.ts): T9 first, launchers in registry order, riders,
// B19C last-and-conditional.
const plan = planWindowDispatch(selected);
const steps = plan.ordered;
if (!dryRun && plan.missingCaps.length > 0) {
  console.error(
    `funded dispatch refused: ${plan.missingCaps.join(",")} declare no capUsd — ` +
      `REQ-ECON-9 requires every paid leg's cap stated in advance on its registry row`,
  );
  process.exit(3);
}
if (!dryRun && headroom !== null && headroom < plan.requiredHeadroomUsd) {
  console.error(
    `funded dispatch refused: --headroom $${headroom} does not cover the selected legs' summed caps ` +
      `$${plan.requiredHeadroomUsd.toFixed(2)} (${plan.paid.map((s) => `${s.id}=$${s.capUsd}`).join(" ")})`,
  );
  process.exit(3);
}

// ---- REQ-ECON-7 — the funded-window pause sentinel: a prior cap_overrun stops every later
// dispatch until the operator re-authorizes (removes the file after reviewing the evidence).
const pauseFile = resolve(stateDir, "funded-pause.json");
const paused = existsSync(pauseFile)
  ? { paused: true, detail: readFileSync(pauseFile, "utf8").slice(0, 300) }
  : { paused: false };
if (!dryRun && paused.paused) {
  console.error(`funded window PAUSED — a leg closed cap_overrun (REQ-ECON-7): ${paused.detail}`);
  console.error(`operator re-authorization required — remove ${pauseFile} to re-open the window`);
  process.exit(3);
}

// ---- the funded-window guard (system role only; an app-login DSN fails closed) ---------------
const dsn = process.env.JOURNEY_DATABASE_URL;
if (!dsn && !dryRun) {
  console.error("funded-window driver requires JOURNEY_DATABASE_URL (system-role DSN over the IAP tunnel)");
  process.exit(3);
}
const pool = dsn ? new pg.Pool({ connectionString: dsn, max: 2 }) : null;
const q = (sql, params) => pool.query(sql, params).then((r) => r.rows);
try {
  // the measured reads every checklist row hangs off (null ⇒ unmeasured ⇒ the row fails closed).
  let systemRoleBypass = null;
  let iso = null;
  let cum = null;
  let fundedTenant = null;
  const stableTag = process.env.JOURNEY_FUNDED_STABLE_TAG ?? null;
  if (pool) {
    const trust = await q(
      `select (r.rolsuper or r.rolbypassrls) as bypass from pg_roles r where r.rolname = current_user`,
    );
    systemRoleBypass = trust[0]?.bypass === true;
    if (systemRoleBypass !== true && !dryRun) {
      console.error("meter pool is not RLS-bypassing — bind the system DSN (D-STB.5b-1). Refusing.");
      process.exit(3);
    }
    if (systemRoleBypass === true) {
      // REQ-ECON-6 — both queries share the ONE guard scope (flagged tenants · meter-of-record
      // proxy rows · the `req_jrn_` seed exclusion). The cumulative arm previously summed ALL
      // usage_records — operator spend included (O2-F11); it is pinned to the same scope now.
      iso = await q(
        `select coalesce(sum(u.list_cost_usd),0)::float8 as usd, count(*)::int n
           from usage_records u join workspaces w on w.id = u.workspace_id
          where ${FLAGGED_PROXY_SPEND_SCOPE} and u.ts >= date_trunc('week', now())`,
      );
      cum = await q(
        `select coalesce(sum(u.list_cost_usd),0)::float8 as usd, count(*)::int n
           from usage_records u join workspaces w on w.id = u.workspace_id
          where ${FLAGGED_PROXY_SPEND_SCOPE} and u.ts >= $1`,
        [ROUND_SINCE],
      );
      if (stableTag) {
        const t = await q(
          `select w.id, w.is_test,
                  extract(epoch from (now() - w.created_at)) / 3600 as age_hours
             from workspaces w
             join workspace_members m on m.workspace_id = w.id
             join "user" u on u.id = m.user_id
            where u.email = $1
            order by w.created_at desc limit 1`,
          [stableIdentity(stableTag)],
        );
        fundedTenant = t[0]
          ? { exists: true, isTest: t[0].is_test === true, ageHours: Number(t[0].age_hours), purgeHours: PURGE_HOURS }
          : { exists: false, isTest: false, ageHours: null, purgeHours: PURGE_HOURS };
      }
    }
  }
  const isoUsd = iso ? Number(iso[0]?.usd ?? 0) : null;
  const cumUsd = cum ? Number(cum[0]?.usd ?? 0) : null;

  // REQ-ECON-7 — prove the leg-close cap assert is live in THIS build: a synthetic over-cap call
  // must throw the runner's distinct verdict (CapOverrunError), nothing else.
  let capEnforcementLive = false;
  try {
    assertLegCapUsd("__probe__", 1.5, 1.0);
  } catch (e) {
    capEnforcementLive = e instanceof CapOverrunError;
  }

  // ---- the §5.5 window-opening checklist — printed on EVERY run; --dry-run stops here. -------
  const rows = windowChecklist({
    dsnBound: !!dsn,
    systemRoleBypass,
    cumulativeUsd: cumUsd,
    cumulativeRows: cum ? Number(cum[0]?.n ?? 0) : null,
    roundCapUsd: ROUND_CAP,
    roundSince: ROUND_SINCE,
    headroomUsd: headroom,
    plan,
    capEnforcementLive,
    fundedStableTag: stableTag,
    fundedTenant,
    seedExclusionsLive: FLAGGED_PROXY_SPEND_SCOPE.includes("req_jrn_"),
    optOutPinsHonored: optOutPinsHonored(),
    paused,
  });
  const widest = Math.max(...rows.map((r) => r.id.length));
  console.log(`[funded-checklist] §5.5 window-opening checklist (${dryRun ? "dry-run — no dispatch" : "pre-flight"})`);
  for (const r of rows) {
    console.log(`  ${r.status.toUpperCase().padEnd(4)} ${r.id.padEnd(widest)}  ${r.label}`);
    console.log(`       ${" ".repeat(widest)}  ↳ ${r.detail}`);
  }
  const failed = rows.filter((r) => r.status === "fail");
  if (dryRun) {
    console.log(
      `[funded-checklist] ${rows.length - failed.length}/${rows.length} rows pass` +
        (failed.length ? ` — ${failed.map((r) => r.id).join(",")} fail closed` : " — the window is openable"),
    );
    process.exit(failed.length === 0 ? 0 : 3);
  }

  console.log(
    `[funded-guard] iso-week flagged proxy spend $${isoUsd?.toFixed(4) ?? "?"} (${iso?.[0]?.n ?? "?"} rows) · ` +
      `round cumulative $${cumUsd?.toFixed(4) ?? "?"} (${cum?.[0]?.n ?? "?"} rows since ${ROUND_SINCE}, flagged proxy scope) · ` +
      `re-authorized cap $${ROUND_CAP} · declared headroom $${headroom} (covers ${plan.paid.length} paid leg(s), Σ caps $${plan.requiredHeadroomUsd.toFixed(2)}) · ` +
      `dispatch order ${steps.map((s) => s.id).join(" → ")}`,
  );
  if (cumUsd === null || cumUsd >= ROUND_CAP) {
    console.error(`funded guard refused: round cumulative $${cumUsd?.toFixed(2) ?? "unmeasured"} ≥ $${ROUND_CAP} (or unreadable)`);
    process.exit(3);
  }
  if (cumUsd + headroom > ROUND_CAP) {
    console.error(
      `funded guard refused: cumulative $${cumUsd.toFixed(2)} + declared headroom $${headroom} would cross $${ROUND_CAP}`,
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
    launchOpts.channel = "chrome"; // the scheduled run's installed Chrome (ADR-020)
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
      spend: { weeklyMeteredUsd: isoUsd ?? 0, capUsd: ROUND_CAP, withinCap: (cumUsd ?? Infinity) < ROUND_CAP },
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
  await pool?.end();
}
