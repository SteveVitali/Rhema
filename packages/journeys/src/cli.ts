#!/usr/bin/env node
// JOURNEY.1 — the journey CLI (`rhema-journeys`). Nightly runs the $0 legs; the weekly adds --paid.
//
//   rhema-journeys --web https://app.rhema.tools --api https://api.rhema.tools \
//     --steps N2,N7,R1,R5,X1 --expect-sha e6c9103 --out docs/build/reports/<date>_JOURNEY.1-journeys
//
// Flags: --steps csv | --journey <name|all> (registry order) | --paid (the weekly leg) |
// --stage <prod|dev|pr-N> | --out <dir> | --state-dir <dir> | --expect-sha <sha> | --nonce <n> |
// --surface <key[,key…]> (the SURFACE_GATES subset — the per-flip two-leg selector) |
// --expect-renderer <ssr|spa> (fails the run when a served document's data-renderer differs) |
// --pin-renderer <ssr|spa> (x-rhema-renderer on every context; `spa` refused on prod targets).
// --stage resolves the stage's public origins (prod is the only stage with real DNS today —
// infra/config/stages.ts); any other stage still needs explicit --web/--api overrides.

import { chromium } from "playwright";
import pg from "pg";
import type { SpaSurface } from "@rhema/contracts";
import { STEP_REGISTRY } from "./registry.js";
import {
  gateEcho,
  gatedStepIds,
  isProdTarget,
  parseRendererFlag,
  parseSurfaces,
} from "./cli-flags.js";
import { ALL_IMPLS } from "./impls.js";
import { createGmailClient } from "./mailbox.js";
import { fetchDeployedSha, provenanceMatch } from "./provenance.js";
import { checkWeeklySpendCap } from "./spend-guard.js";
import { journeyNonce } from "./nonce.js";
import { runJourneys, type JourneyReport } from "./runner.js";

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const has = (flag: string) => process.argv.includes(flag);

// --stage resolves the stage's public origins; only prod carries real DNS (stages.ts) — other
// stages fall back to explicit --web/--api or the JOURNEY_*_URL env pair.
const stage = arg("--stage") ?? process.env.JOURNEY_STAGE;
const stageOrigins = (s: string): { web: string; api: string } | undefined =>
  s === "prod" ? { web: "https://rhema.tools", api: "https://api.rhema.tools" } : undefined;
if (stage && !stageOrigins(stage) && !arg("--web") && !process.env.JOURNEY_WEB_URL) {
  console.error(`--stage ${stage} has no known public origin; pass --web/--api explicitly`);
  process.exit(2);
}
const origins = stage ? stageOrigins(stage) : undefined;
const web = arg("--web") ?? process.env.JOURNEY_WEB_URL ?? origins?.web ?? "http://localhost:3000";
const api = arg("--api") ?? process.env.JOURNEY_API_URL ?? origins?.api ?? web;
const paid = has("--paid");
const nonce = arg("--nonce") ?? journeyNonce();
const date = new Date().toISOString().slice(0, 10);
const outDir = arg("--out") ?? `docs/build/reports/${date}_JOURNEY.1-journeys`;
const stateDir = arg("--state-dir") ?? process.env.JOURNEY_STATE_DIR ?? ".journeys-state";
const expectSha = arg("--expect-sha") ?? process.env.JOURNEY_EXPECT_SHA;

// SPA.6 — the renderer leg contract (REQ-VFY-7/8, REQ-SEQ-4). `--expect-renderer` asserts
// data-renderer on every same-origin document; `--pin-renderer` stamps x-rhema-renderer on every
// context (leg A pins ssr; leg B runs un-pinned). The validation lives in cli-flags.ts so the
// refusal table is unit-tested; an error here is exit 2 (a misuse, not a failure).
const expectParsed = parseRendererFlag(
  arg("--expect-renderer") ?? process.env.JOURNEY_EXPECT_RENDERER,
  "--expect-renderer",
);
const pinParsed = parseRendererFlag(
  arg("--pin-renderer") ?? process.env.JOURNEY_PIN_RENDERER,
  "--pin-renderer",
);
for (const p of [expectParsed, pinParsed]) {
  if (p.error) {
    console.error(p.error);
    process.exit(2);
  }
}
const expectRenderer = expectParsed.value;
const pinRenderer = pinParsed.value;
// Force-SPA is refused on a prod target — SPA_OVERRIDES is never set there, so a spa pin could
// only produce vacuous green anyway.
if (pinRenderer === "spa" && isProdTarget(stage, web)) {
  console.error(
    "--pin-renderer spa is honored only where the stage sets SPA_OVERRIDES=1 (non-prod) — refusing to pin it against a prod target",
  );
  process.exit(2);
}

// `--surface <key[,key…]>` selects the SURFACE_GATES subset (the two-leg selector); unknown keys
// and empty gates fail closed. Combined with --steps/--journey it intersects.
const surfaceParsed = parseSurfaces(arg("--surface") ?? process.env.JOURNEY_SURFACE);
if (surfaceParsed.error) {
  console.error(surfaceParsed.error);
  process.exit(2);
}
const surfaces: SpaSurface[] | undefined = surfaceParsed.surfaces;
let gatedIds: Set<string> | undefined;
if (surfaces !== undefined) {
  const gated = gatedStepIds(surfaces, (id) => STEP_REGISTRY.find((s) => s.id === id)?.paid);
  if (gated.error) {
    console.error(gated.error);
    process.exit(2);
  }
  gatedIds = gated.ids;
  for (const key of surfaces) console.error(gateEcho(key));
}

const stepsArg = arg("--steps");
const journeyArg = arg("--journey");
const steps = STEP_REGISTRY.filter(
  (s) =>
    (gatedIds ? gatedIds.has(s.id) : true) &&
    (stepsArg
      ? // exact id OR a parent prefix (`--steps P1` selects the P1.* split legs)
        stepsArg
          .split(",")
          .map((x) => x.trim())
          .some((t) => s.id === t || s.id.startsWith(`${t}.`))
      : journeyArg && journeyArg !== "all"
        ? s.journey === journeyArg || s.journey === "both"
        : true),
);
if (steps.length === 0) {
  console.error("no steps selected");
  process.exit(2);
}

// provenance (REQ-ARCH-39): read every reachable /healthz BEFORE walking — a stale deploy is a
// fail-closed run, not an amber footnote.
const observed: Record<string, string | null> = {};
for (const [label, base] of Object.entries({ web, api })) {
  observed[label] = await fetchDeployedSha(base);
}
const provOk = expectSha ? provenanceMatch(expectSha, observed) : false;

// The measured spend-guard path needs a DB read — JOURNEY_DATABASE_URL binds a read pool when the
// runner can reach the stage's Postgres (operator-driven legs). D-STB.5b-1: that DSN MUST be the
// system role — an app-login DSN reads usage_records as $0 through FORCE RLS, so the guard probes
// the bound role and fails closed on a blind pool. Scheduled CI can't reach the private DB: the
// no-db attestation stands because the cron itself bounds paid runs to one leg/week.
let spendDb: { query(sql: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }> } | undefined;
let spendPool: pg.Pool | undefined;
if (paid && process.env.JOURNEY_DATABASE_URL) {
  spendPool = new pg.Pool({ connectionString: process.env.JOURNEY_DATABASE_URL, max: 1 });
  spendDb = spendPool;
}
const spend = paid
  ? await checkWeeklySpendCap({ ...(spendDb ? { db: spendDb } : {}) })
  : { capUsd: 5, weeklyMeteredUsd: 0, withinCap: true };
if (paid && !spend.withinCap) {
  console.error(`spend guard refused: ${spend.reason}`);
  process.exit(3);
}
if (paid && spend.weeklyMeteredUsd !== null && spend.weeklyMeteredUsd + 3 > spend.capUsd) {
  console.error(`spend guard refused: $${spend.weeklyMeteredUsd} already metered this week`);
  process.exit(3);
}

const launchOpts: Parameters<typeof chromium.launch>[0] = { headless: true };
try {
  const probe = await chromium.launch({ channel: "chrome", headless: true });
  await probe.close();
  launchOpts.channel = "chrome"; // the scheduled run's installed Chrome (ADR-020)
} catch {
  /* fall back to the bundled chromium */
}
const browser = await chromium.launch(launchOpts);

let report: JourneyReport;
try {
  report = await runJourneys({
    browser,
    webBaseUrl: web.replace(/\/+$/, ""),
    apiBaseUrl: api.replace(/\/+$/, ""),
    mailbox: createGmailClient("test@rhema.tools"),
    stateDir,
    outDir,
    nonce,
    paid,
    steps,
    impls: ALL_IMPLS,
    provenance: { expected: expectSha, observed, match: provOk },
    spend: {
      weeklyMeteredUsd: spend.weeklyMeteredUsd,
      capUsd: spend.capUsd,
      withinCap: spend.withinCap,
    },
    ...(expectRenderer ? { expectRenderer } : {}),
    ...(pinRenderer ? { pinRenderer } : {}),
  });
} finally {
  await browser.close();
  await spendPool?.end();
}

for (const r of report.results) {
  const mark =
    r.outcome === "pass" ? "PASS" : r.outcome === "owed" ? "owed" : r.outcome === "skipped" ? "skip" : r.outcome === "ready-to-flip" ? "FLIP" : "FAIL";
  console.log(`${mark.padEnd(5)} ${r.id.padEnd(10)} [${r.owner}] ${r.error ?? ""}`);
}
console.log(`provenance ${provOk ? "match" : "NO-MATCH"} · spend $${report.spend.weeklyMeteredUsd ?? "?"} ≤ $${report.spend.capUsd} · report ${outDir}/report.json`);

// exit non-zero when a green step failed or provenance mismatched with an expectation given.
const provenanceFailed = expectSha !== undefined && !provOk;
process.exit(report.passed && !provenanceFailed ? 0 : 1);
