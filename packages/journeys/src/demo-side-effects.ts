// 221 R7DEM.5 (REQ-DWEB-7, REQ-DACC-1/3/5; RV-10) — THE DEMO RECORDING PROXY. A bundled-Chromium
// walk over every `DEMO_DOCUMENT_ROUTE_ID` × essay × {logged out, planted-cookie} × {desktop,
// phone} that records EVERY network fact the page emits and fails on anything outside the demo
// allowlist — the committed, re-runnable proof that a demo surface makes zero unauthorized
// same-origin non-GET/session requests (the R3 §4 table regenerated against the final
// compositions, not the audit's guesses).
//
// The same collectors back `D3.readonly` (r7legs.ts): the leg IS this proxy's assert over the
// two user contexts. Re-run entry points:
//
//   pnpm exec vitest run packages/journeys/src/demo-side-effects.local.test.ts   (local web)
//   node packages/journeys/dist/demo-side-effects.js --base <url> --out <dir>    (any target —
//                                                                             the 224 preview)
//
// Outputs (committed generated artifacts): the regenerated side-effect table markdown +
// per-walk request logs. The trace file the server-side `RHEMA_DEMO_DS_TRACE` seam writes
// (apps/web/src/main.ts) reports WHICH DataSource methods the walk reached — DWEB-3's amended
// contract: `demoDataSource`'s implemented set is exactly the reached set.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DEMO_DOCUMENT_ROUTE_IDS } from "@rhema/contracts";
import type { Browser, BrowserContext, Page } from "playwright";

// ---------------------------------------------------------------------------
// The allowlist — the demo's whole outbound contract.
// ---------------------------------------------------------------------------

/** REQ-TOUR-9's pre-declared metrics carve-out — the ONLY sanctioned demo non-GET path. */
export const DEMO_METRICS_PATH = "/a/demo";

/**
 * Every request a demo page may issue: same-origin only, GET/HEAD only — except the one
 * pre-declared `POST /a/demo` metrics carve-out (no body content today; the allowlist SHAPE is
 * what this proxy proves, per R3 §4's "the harness knows the carve-out exists").
 */
export function isAllowedDemoRequest(method: string, url: string, origin: string): boolean {
  const u = new URL(url);
  if (u.origin !== origin) return false;
  const m = method.toUpperCase();
  if (m === "GET" || m === "HEAD") return true;
  return u.pathname === DEMO_METRICS_PATH;
}

// ---------------------------------------------------------------------------
// The walk.
// ---------------------------------------------------------------------------

export interface RecordedRequest {
  readonly method: string;
  readonly url: string;
  readonly resourceType: string;
  /** R7DEM.6b — the body of a non-GET request (the carve-out's event shape is asserted on it). */
  readonly postData?: string | null;
}

export interface BadResponse {
  readonly url: string;
  readonly status: number;
}

export interface DemoWalkResult {
  readonly essay: string;
  readonly signedIn: boolean;
  readonly width: number;
  readonly visited: readonly string[];
  readonly requests: readonly RecordedRequest[];
  readonly websockets: readonly string[];
  readonly badResponses: readonly BadResponse[];
  readonly violations: readonly string[];
  /** which DEMO_DOCUMENT_ROUTE_IDS the crawl reached (pattern ⇒ a concrete visited path). */
  readonly coverage: Readonly<Record<string, string>>;
}

const DEMO_LINK_RE = /^\/(demo\/|p\/demo~)/;

/** One BFS crawl of the demo namespace: documents only — `/bff/*` twins ride inside each page's
 *  own fetches (recorded as requests, never crawled). */
export async function runDemoWalk(opts: {
  readonly baseUrl: string;
  readonly browser: Browser;
  readonly essay: string;
  readonly signedIn: boolean;
  readonly width: number;
  readonly height?: number;
  readonly maxPages?: number;
  readonly interactions?: boolean;
  /** concrete seed URLs the crawl starts from — the recording proxy proves every
   *  DEMO_ROUTE_ID shape; surfaces no in-demo link reaches (revisions, deep artifact pages)
   *  are seeded explicitly, derived from the corpus' own index where the harness runs locally. */
  readonly seeds?: readonly string[];
  readonly outDir?: string;
  readonly screenshotName?: (page: number, url: string) => string;
  /** R7DEM.5's negative leg: a test hook that runs INSIDE the demo page (e.g. injects the exact
   *  `navigator.sendBeacon` a gated effect would have fired) so the recorder proves it catches
   *  an out-of-allowlist request — the walk must report violations. */
  readonly pageHook?: (page: Page) => Promise<void>;
}): Promise<DemoWalkResult> {
  const origin = new URL(opts.baseUrl).origin;
  const context: BrowserContext = await opts.browser.newContext({
    baseURL: opts.baseUrl,
    viewport: { width: opts.width, height: opts.height ?? 900 },
  });
  if (opts.signedIn) {
    // the returningUser stand-in — cookie PRESENCE is all `boot.demo.signedIn` reads (the demo
    // principal is cosmetic); the planted cookie exercises the same server arm.
    await context.addCookies([
      { name: "rhema-dev.session_token", value: "demo-walk-standin", url: opts.baseUrl },
    ]);
  }
  const page: Page = await context.newPage();
  const collect = attachDemoRecord(page, origin);
  const visited = await crawlDemo(page, {
    essay: opts.essay,
    seeds: opts.seeds,
    maxPages: opts.maxPages,
    interactions: opts.interactions,
    outDir: opts.outDir,
    screenshotName: opts.screenshotName,
    pageHook: opts.pageHook,
  });
  await page.close();
  await context.close();
  // coverage: every document route pattern must have at least one visited URL matching it.
  const coverage: Record<string, string> = {};
  const violations = [...collect.violations];
  for (const id of DEMO_DOCUMENT_ROUTE_IDS) {
    const hit = visited.find((v) => routeIdMatches(id, v, opts.essay));
    if (hit) coverage[id] = hit;
    else violations.push(`route coverage miss: ${id} (no visited URL matched)`);
  }
  return {
    essay: opts.essay,
    signedIn: opts.signedIn,
    width: opts.width,
    visited,
    requests: collect.requests,
    websockets: collect.websockets,
    badResponses: collect.badResponses,
    violations,
    coverage,
  };
}

/** The recorded facts a page emits during a demo walk. */
export interface DemoCollect {
  readonly requests: RecordedRequest[];
  readonly websockets: string[];
  readonly badResponses: BadResponse[];
  readonly violations: string[];
  /** R7DEM.6b — bodies of `POST /a/demo` captured via route interception (Chromium does not
   *  surface sendBeacon bodies on the request event). */
  readonly demoPostBodies: string[];
}

/**
 * Attach the recording proxy's collectors to an EXISTING page (the runner-owned contexts
 * `D3.readonly` walks — anon() and returningUser() supply their own). Every request is
 * recorded; out-of-allowlist requests, EventSource opens and WebSockets become violations
 * immediately (same-origin 4xx/5xx land in `badResponses` for `walkViolations`).
 */
export function attachDemoRecord(page: Page, origin: string): DemoCollect {
  const collect: DemoCollect = {
    requests: [],
    websockets: [],
    badResponses: [],
    violations: [],
    demoPostBodies: [],
  };
  // R7DEM.6b — capture the carve-out's bodies: the Fetch-domain interception DOES surface a
  // sendBeacon payload where `request.postData()` returns null (ping requests).
  void page.route(`${origin}/a/demo`, (route) => {
    collect.demoPostBodies.push(route.request().postData() ?? "");
    void route.continue();
  });
  page.on("request", (req) => {
    const row = {
      method: req.method(),
      url: req.url(),
      resourceType: req.resourceType(),
      // R7DEM.6b — non-GET bodies are recorded so the leg can prove the one sanctioned write
      // carries only the {event, essay, step, src} shape.
      ...(req.method() !== "GET" && req.method() !== "HEAD" ? { postData: req.postData() } : {}),
    };
    collect.requests.push(row);
    if (row.resourceType === "eventsource") {
      collect.violations.push(`EventSource opened: ${row.url}`);
    }
    if (!isAllowedDemoRequest(row.method, row.url, origin)) {
      collect.violations.push(`${row.method} ${row.url} (${row.resourceType})`);
    }
  });
  page.on("websocket", (ws) => {
    collect.websockets.push(ws.url());
    collect.violations.push(`WebSocket opened: ${ws.url()}`);
  });
  page.on("response", (res) => {
    const u = new URL(res.url());
    if (u.origin === origin && res.status() >= 400) {
      collect.badResponses.push({ url: res.url(), status: res.status() });
    }
  });
  return collect;
}

/** The BFS crawl over the demo namespace on an existing page — documents only; returns the
 *  visited paths. */
export async function crawlDemo(
  page: Page,
  opts: {
    readonly essay: string;
    readonly seeds?: readonly string[];
    readonly maxPages?: number;
    readonly interactions?: boolean;
    readonly outDir?: string;
    readonly screenshotName?: (page: number, url: string) => string;
    readonly pageHook?: (page: Page) => Promise<void>;
  },
): Promise<readonly string[]> {
  const visited: string[] = [];
  // 221a — the hub joins every walk (position 2 keeps the essay index page first for the
  // interaction pass); the recording proxy must stay clean over the filled `/demo` too.
  const queue: string[] = [`/demo/${opts.essay}`, "/demo", ...(opts.seeds ?? [])];
  const seen = new Set<string>();
  const maxPages = opts.maxPages ?? 48;
  while (queue.length > 0 && visited.length < maxPages) {
    const next = queue.shift()!;
    if (seen.has(next)) continue;
    seen.add(next);
    // the demo has no live connections — `domcontentloaded` + a short settle beats a
    // `networkidle` that waits out the SPA's twin fetches on every one of ~30 pages.
    await page.goto(next, { waitUntil: "domcontentloaded", timeout: 20_000 }).catch(() => undefined);
    await page.waitForTimeout(450);
    visited.push(next);
    // the index page carries the interactive arms — drive every gated effect the table
    // lists: palette open+type (the allowlisted palette-search GET), the theme/paper menu
    // picks (gated POSTs), ⌘S (the read-only pill, not a mint), and the out-of-scope
    // keymap chords (inert under the demo read).
    if (opts.interactions !== false && visited.length === 1) {
      await driveDemoInteractions(page);
    }
    if (opts.pageHook) await opts.pageHook(page);
    if (opts.outDir && opts.screenshotName && visited.length <= 3) {
      await page.screenshot({ path: join(opts.outDir, opts.screenshotName(visited.length, next)) });
    }
    // enqueue in-demo links — the crawl IS the route coverage (DOM-rendered anchors only).
    const hrefs = await page.$$eval("a[href]", (as) =>
      as.map((a) => a.getAttribute("href") ?? "").filter(Boolean),
    );
    for (const href of hrefs) {
      const path = href.split("#")[0]!.split("?")[0]!;
      if (DEMO_LINK_RE.test(path) && !seen.has(path)) queue.push(path);
    }
  }
  return visited;
}

/** Map a visited path onto a DEMO_ROUTE_ID pattern — `/demo/<essay>/…` and `/p/demo~<essay>/…`
 *  both count (the public↔internal mapping is S-1). */
export function routeIdMatches(routeId: string, visitedPath: string, essay: string): boolean {
  const inner = routeId.replace("/p/$project", "");
  const pub = `/demo/${essay}${inner}`;
  const int = `/p/demo~${essay}${inner}`;
  const shape = (p: string): string =>
    p
      .replace(/\$artifactId/g, "[^/]+")
      .replace(/\$figureId/g, "[^/]+")
      .replace(/\$runId/g, "[^/]+")
      .replace(/\$cid/g, "[^/]+")
      .replace(/\$n/g, "\\d+")
      .replace(/\$m/g, "\\d+")
      .replace(/\$v/g, "\\d+");
  return new RegExp(`^${shape(pub)}$`).test(visitedPath) || new RegExp(`^${shape(int)}$`).test(visitedPath);
}

/** The index-page interaction pass — every gated effect exercised once, honestly. */
async function driveDemoInteractions(page: Page): Promise<void> {
  const type = async (sel: string, text: string) => {
    const el = await page.$(sel);
    if (el == null) return;
    await el.fill(text).catch(() => undefined);
    await page.waitForTimeout(120);
  };
  // ⌘K opens the palette; typing drives the allowlisted palette-search GET (demoDataSource
  // answers []). Escape closes.
  await page.keyboard.press("Meta+k").catch(() => undefined);
  await page.waitForTimeout(150);
  await type("[data-palette-input]", "review");
  await page.waitForTimeout(250); // the controller's 200-ms debounce
  await page.keyboard.press("Escape").catch(() => undefined);
  // the theme/paper menu picks — localStorage still applies; the POSTs are gated (row 3).
  const themeMenu = await page.$("[data-ide-theme-menu]");
  if (themeMenu != null) {
    await themeMenu.click().catch(() => undefined);
    await page.waitForTimeout(100);
    const dark = await page.$('[data-ide-theme="light"]');
    await dark?.click().catch(() => undefined);
    await page.waitForTimeout(150);
  }
  // ⌘S — the restore-point mint must no-op and paint the read-only pill (row 6).
  await page.keyboard.press("Meta+s").catch(() => undefined);
  await page.waitForTimeout(150);
}

// ---------------------------------------------------------------------------
// The assertion + the generated table.
// ---------------------------------------------------------------------------

/** The walk's verdict — violations plus the response-side faults the proxy also proves absent. */
export function walkViolations(w: DemoWalkResult): readonly string[] {
  const out = [...w.violations];
  for (const b of w.badResponses) {
    out.push(`${b.status} on ${b.url}`);
  }
  return out;
}

/** Read the server's `RHEMA_DEMO_DS_TRACE` file → the sorted unique method names reached. */
export function readTraceFile(path: string): readonly string[] {
  if (!existsSync(path)) return [];
  return [...new Set(readFileSync(path, "utf8").split("\n").map((l) => l.trim()).filter(Boolean))].sort();
}

/**
 * The regenerated R3 §4 side-effect table — committed generated output (`docs/demo-side-effects.md`).
 * One row per request the walks saw, grouped by pattern; the DataSource reach appendix closes
 * DWEB-3's amended contract (implemented == reached).
 */
export function renderSideEffectsTable(args: {
  readonly walks: readonly DemoWalkResult[];
  readonly dataSourceReached: readonly string[];
  readonly dataSourceImplemented: readonly string[];
  readonly generatedAt: string;
  readonly origin: string;
}): string {
  const origin = args.origin;
  const lines: string[] = [
    `<!-- GENERATED — demo-side-effects.ts (R7DEM.5; REQ-DWEB-7). Regenerate:`,
    `     pnpm exec vitest run packages/journeys/src/demo-side-effects.local.test.ts`,
    `     or node packages/journeys/dist/demo-side-effects.js --base <url> --out <dir>. -->`,
    ``,
    `# Demo side-effect table (regenerated)`,
    ``,
    `- Generated: ${args.generatedAt} against ${origin}`,
    `- Walks: ${args.walks.length} (essay × {logged out, cookie} × {desktop, phone})`,
    `- Violations: ${args.walks.reduce((n, w) => n + walkViolations(w).length, 0)}`,
    ``,
    `## Requests seen`,
    ``,
    `| Request (method + path pattern) | Resource | Count | Allowlist |`,
    `|---|---|---|---|`,
  ];
  const byPattern = new Map<string, { method: string; resourceType: string; count: number }>();
  for (const w of args.walks) {
    for (const r of w.requests) {
      const path = new URL(r.url).pathname.replace(/demo~[^/]+/, "demo~<essay>").replace(/\/\d+(?=\/|$)/g, "/<n>");
      const key = `${r.method} ${path} ${r.resourceType}`;
      const cur = byPattern.get(key) ?? { method: r.method, resourceType: r.resourceType, count: 0 };
      cur.count += 1;
      byPattern.set(key, cur);
    }
  }
  for (const [key, v] of [...byPattern.entries()].sort()) {
    const [method, ...rest] = key.split(" ");
    const resourceType = rest.pop()!;
    const path = rest.join(" ");
    lines.push(`| \`${method} ${path}\` | ${resourceType} | ${v.count} | ${method === "GET" || method === "HEAD" ? "GET/HEAD — allowed" : path === DEMO_METRICS_PATH ? "metrics carve-out (REQ-TOUR-9)" : "❌ OUTSIDE ALLOWLIST"} |`);
  }
  lines.push(
    ``,
    `## Out-of-allowlist / fault rows`,
    ``,
  );
  for (const w of args.walks) {
    for (const v of walkViolations(w)) {
      lines.push(`- ❌ ${w.essay} ${w.signedIn ? "cookie" : "anon"} ${w.width}px: ${v}`);
    }
  }
  lines.push(
    ``,
    `## DataSource reach (DWEB-3's amended contract)`,
    ``,
    `- Implemented (\`demoDataSource\`): ${args.dataSourceImplemented.join(", ")}`,
    `- Reached by the walk: ${args.dataSourceReached.join(", ")}`,
    `- Delta (implemented \\ reached): ${args.dataSourceImplemented.filter((m) => !args.dataSourceReached.includes(m)).join(", ") || "(none)"}`,
    `- Delta (reached \\ implemented): ${args.dataSourceReached.filter((m) => !args.dataSourceImplemented.includes(m)).join(", ") || "(none)"}`,
    ``,
  );
  return lines.join("\n");
}

/** Write the table + per-walk request logs under `outDir`. Returns the table path. */
export function emitWalkArtifacts(
  outDir: string,
  walks: readonly DemoWalkResult[],
  args: { dataSourceReached: readonly string[]; dataSourceImplemented: readonly string[]; origin: string },
): string {
  mkdirSync(outDir, { recursive: true });
  for (const w of walks) {
    writeFileSync(
      join(outDir, `walk-${w.essay}-${w.signedIn ? "cookie" : "anon"}-${w.width}.json`),
      JSON.stringify(w, null, 2),
    );
  }
  const tablePath = join(outDir, "demo-side-effects.md");
  writeFileSync(
    tablePath,
    renderSideEffectsTable({
      walks,
      dataSourceReached: args.dataSourceReached,
      dataSourceImplemented: args.dataSourceImplemented,
      generatedAt: new Date().toISOString(),
      origin: args.origin,
    }),
  );
  return tablePath;
}

// ---------------------------------------------------------------------------
// The CLI re-run entry point — `node dist/demo-side-effects.js --base <url> --out <dir>`.
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const flag = (name: string): string | undefined => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const base = flag("base");
  const out = flag("out") ?? "docs/build/reports/demo-side-effects";
  if (!base) {
    console.error("usage: node dist/demo-side-effects.js --base <url> --out <dir> [--essay <key>]");
    process.exit(2);
  }
  const { chromium } = await import("playwright");
  const { DEMO_ESSAYS } = await import("@rhema/contracts");
  const browser = await chromium.launch();
  const essays = flag("essay") != null ? [flag("essay")!] : DEMO_ESSAYS.map((e) => e.essay);
  const walks: DemoWalkResult[] = [];
  try {
    for (const essay of essays) {
      for (const signedIn of [false, true]) {
        for (const width of [1440, 390]) {
          walks.push(await runDemoWalk({ baseUrl: base, browser, essay, signedIn, width, outDir: out }));
        }
      }
    }
  } finally {
    await browser.close();
  }
  const reached = readTraceFile(flag("trace") ?? "");
  const tablePath = emitWalkArtifacts(out, walks, { dataSourceReached: reached, dataSourceImplemented: [], origin: new URL(base).origin });
  const violations = walks.flatMap((w) => walkViolations(w));
  console.log(`wrote ${tablePath}; ${violations.length} violation(s)`);
  if (violations.length > 0) {
    for (const v of violations) console.error(`  ${v}`);
    process.exit(1);
  }
}

if (process.argv[1] != null && /demo-side-effects\.(js|ts)$/.test(process.argv[1])) {
  void main();
}
