// 221 R7DEM.5 (REQ-DWEB-7; RV-10) — Stage A: run the REAL recording proxy
// (`demo-side-effects.ts`) locally — bundled Chromium over every DEMO_DOCUMENT_ROUTE_ID × the
// committed synthetic essay × {logged out, planted-cookie} × {desktop, phone} against a LOCAL
// web server serving `demoDataSource` (the demo path needs no api — `API_BASE_URL` points at a
// dead port; the guard answers every demo request).
//
// What it proves:
//   • every request the pages emit sits inside the allowlist (GET/HEAD same-origin + the
//     pre-declared POST /a/demo metrics carve-out) — zero non-GET/session side effects.
//   • every DEMO_DOCUMENT_ROUTE_ID is reached by the crawl (route coverage).
//   • the DataSource reach: `RHEMA_DEMO_DS_TRACE` records the methods the nested app invoked;
//     the test diffs reached vs `demoDataSource`'s implemented set (DWEB-3's amended contract).
//   • NEGATIVE: a page-injected POST /a/dwell (the request a gated dwell effect WOULD fire)
//     makes the recorder report a violation — the proxy fails on out-of-allowlist requests.
//
// Committed generated output: docs/demo-side-effects.md (the regenerated R3 §4 table) +
// per-walk logs under docs/build/reports/demo-side-effects/.
//
// Requires apps/web's dist build + public/spa (turbo build) and bundled Chromium
// (`pnpm --filter @rhema/journeys exec playwright install chromium`). A missing piece is a
// skip on a dev box and a failure under CI (the unit job installs both).

import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { chromium, type Browser } from "playwright";
import {
  emitWalkArtifacts,
  readTraceFile,
  runDemoWalk,
  walkViolations,
  type DemoWalkResult,
} from "./demo-side-effects.js";

const REPO = resolve(fileURLToPath(new URL(".", import.meta.url)), "../../..");
const OUT = join(REPO, "docs/build/reports/demo-side-effects");
const TABLE = join(REPO, "docs/demo-side-effects.md");
const MAIN = join(REPO, "apps/web/dist/main.js");
const DEMO_DATA = join(REPO, "apps/web/dist/demo-data.js");
const CORPUS_ROOT = join(REPO, "packages/demo-corpus/fixtures/synthetic");
const ESSAY = "the-borrowed-commons";
const TRACE = join(OUT, "datasource-trace.jsonl");
const PORT = 43600 + Math.floor(Math.random() * 400);
const BASE = `http://127.0.0.1:${PORT}`;

let server: ChildProcess | undefined;
let browser: Browser | undefined;

async function startServer(): Promise<boolean> {
  try {
    mkdirSync(OUT, { recursive: true });
    writeFileSync(TRACE, "");
    const p = spawn(process.execPath, [MAIN], {
      cwd: REPO,
      env: {
        ...process.env,
        PORT: String(PORT),
        API_BASE_URL: "http://127.0.0.1:1", // dead on purpose — the demo path never fetches it
        RHEMA_BUILD_GIT_SHA: "r7dem5-local",
        RHEMA_DEMO_CORPUS_ROOT: CORPUS_ROOT,
        RHEMA_DEMO_DS_TRACE: TRACE,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    server = p;
    for (let i = 0; i < 100; i++) {
      try {
        const r = await fetch(`${BASE}/healthz`);
        if (r.ok) return true;
      } catch {
        /* still booting */
      }
      await new Promise((r) => setTimeout(r, 200));
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Concrete seed URLs derived from the fixture's own index — the crawl proves every
 * DEMO_ROUTE_ID shape even where no in-demo link reaches the surface (revisions, artifact
 * pages the flattened `--` artifactId makes addressable, figure cards).
 */
function fixtureSeeds(): string[] {
  const ix = JSON.parse(
    readFileSync(join(CORPUS_ROOT, "snapshots", ESSAY, "index.json"), "utf8"),
  ) as { chunks: Record<string, Record<string, string>> };
  const seeds: string[] = [];
  const artifactIds = Object.keys(ix.chunks["artifact-page"] ?? {}).slice(0, 6);
  for (const id of artifactIds) {
    seeds.push(`/demo/${ESSAY}/a/${id.split("/").join("--")}`);
  }
  for (const cid of Object.keys(ix.chunks["what-changed"] ?? {}).slice(0, 3)) {
    seeds.push(`/demo/${ESSAY}/revisions/${cid}`);
  }
  for (const runId of Object.keys(ix.chunks["dossier"] ?? {})) {
    seeds.push(`/demo/${ESSAY}/review/${runId}`, `/demo/${ESSAY}/r/${runId}`);
  }
  for (const figId of Object.keys(ix.chunks["figure-image"] ?? {})) {
    seeds.push(`/demo/${ESSAY}/figures/${figId}`);
  }
  const versions = Object.keys(ix.chunks["version-diff"] ?? {}).slice(0, 3);
  for (const v of versions) {
    const [n, m] = v.split(":");
    seeds.push(`/demo/${ESSAY}/v/${n}`, `/demo/${ESSAY}/v/${n}/diff/${m}`);
  }
  seeds.push(`/demo/${ESSAY}/figures`);
  return seeds;
}

/** `demoDataSource`'s implemented method set — read through the built dist the server runs. */
function implementedMethods(): string[] {
  const out = execFileSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `import { demoDataSource } from ${JSON.stringify(DEMO_DATA)};\n` +
        `console.log(JSON.stringify(Object.getOwnPropertyNames(demoDataSource(${JSON.stringify(CORPUS_ROOT)}))));`,
    ],
    { encoding: "utf8" },
  );
  return (JSON.parse(out) as string[]).sort();
}

describe("the demo recording proxy (REQ-DWEB-7; RV-10)", () => {
  let walks: DemoWalkResult[] = [];
  let reached: readonly string[] = [];
  let implemented: string[] = [];

  beforeAll(async () => {
    if (!(await startServer())) return;
    browser = await chromium.launch();
  }, 30_000);

  afterAll(async () => {
    await browser?.close();
    server?.kill();
  }, 20_000);

  it("walks every DEMO_DOCUMENT_ROUTE_ID × {anon, cookie} × {desktop, phone} — zero out-of-allowlist requests", async () => {
    if (browser == null) throw new Error("local server or bundled Chromium unavailable");
    const seeds = fixtureSeeds();
    const results: DemoWalkResult[] = [];
    for (const signedIn of [false, true]) {
      for (const width of [1440, 390]) {
        results.push(
          await runDemoWalk({
            baseUrl: BASE,
            browser,
            essay: ESSAY,
            signedIn,
            width,
            seeds,
            outDir: OUT,
            screenshotName: (n, url) =>
              `walk-${signedIn ? "cookie" : "anon"}-${width}-${String(n).padStart(2, "0")}-${url.replace(/[^\w]+/g, "_").slice(0, 60)}.png`,
          }),
        );
      }
    }
    walks = results;
    reached = readTraceFile(TRACE);
    implemented = implementedMethods();
    emitWalkArtifacts(OUT, walks, { dataSourceReached: reached, dataSourceImplemented: implemented, origin: new URL(BASE).origin });
    // the committed table regenerates from the same emit (generated output, never hand-edited).
    const { renderSideEffectsTable } = await import("./demo-side-effects.js");
    writeFileSync(
      TABLE,
      renderSideEffectsTable({
        walks,
        dataSourceReached: reached,
        dataSourceImplemented: implemented,
        generatedAt: new Date().toISOString(),
        origin: new URL(BASE).origin,
      }),
    );
    const violations = walks.flatMap((w) => [
      ...walkViolations(w).map((v) => `${w.signedIn ? "cookie" : "anon"}@${w.width}: ${v}`),
    ]);
    expect(violations).toEqual([]);
  }, 360_000);

  it("NEGATIVE — a page-injected POST /a/dwell (the gated effect's exact request) makes the recorder fail", async () => {
    if (browser == null) throw new Error("local server or bundled Chromium unavailable");
    const w = await runDemoWalk({
      baseUrl: BASE,
      browser,
      essay: ESSAY,
      signedIn: false,
      width: 1440,
      maxPages: 1,
      interactions: false,
      pageHook: async (page) => {
        await page.evaluate(() =>
          navigator.sendBeacon("/a/dwell", JSON.stringify({ surface: "p.project", ms: 1 })),
        );
      },
    });
    const violations = walkViolations(w);
    expect(violations.some((v) => v.includes("/a/dwell"))).toBe(true);
  }, 60_000);

  it("the DataSource reach: every method the walk invoked sits inside demoDataSource's implemented set", async () => {
    if (browser == null) throw new Error("local server or bundled Chromium unavailable");
    // the first test populated `reached` + `implemented`.
    if (walks.length === 0) throw new Error("the walk test must run first (sequential suite)");
    expect(reached.length).toBeGreaterThan(0);
    const over = reached.filter((m) => !implemented.includes(m));
    const under = implemented.filter((m) => !reached.includes(m));
    // reached ⊆ implemented is the contract; `under` is recorded in the table — the DWEB-3
    // amendment says the implemented set is exactly what the walk reaches, so a divergence is
    // flagged for the run record (not silently widened).
    expect(over).toEqual([]);
    expect(
      under,
      `implemented but unreached methods (leave the Pick or extend the walk): ${under.join(", ")}`,
    ).toEqual([]);
  });
});
