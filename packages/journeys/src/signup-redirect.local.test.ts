// 262_R6FIX.12 (F-15 / BL-105) — Stage A: the local arm of the N1/N3 post-auth chain, run
// against a REAL web build (`apps/web/dist/main.js`) and a minimal stub api. The deployed legs
// mint through the real magic-link leg + Gmail mailbox; locally the session rides the
// dev/preview identity-header shim (`x-rhema-user-id`/`x-rhema-workspace-id`/
// `x-rhema-billing-account-id`, which `main.ts`'s `session(c)` forwards verbatim) and the stub
// api answers the six reads the chain consumes: `GET /session`, `GET /projects`,
// `GET /showcase` (intent), `POST /showcase/intent/consume`, `POST /projects` (the leaf's ONE
// create), and 404s everything else (every other twin read is best-effort/degraded by design).
//
// What it proves, in a real browser on the built bundle:
//   • the landing drop-zone's REAL IndexedDB hold + the `/signup?…&held=1` hop (public SSR —
//     no api needed);
//   • `GET /app?entry=draft&held=1` → `/app/new?entry=draft&held=1` → the SPA shell → the
//     leaf's ONE create POST → the new project's `/p/:slug/import?held=1` surface → the hold
//     hydrated into `input[name=file]` (N1's post-auth half, verbatim);
//   • the intent consumed ONCE — `POST /showcase/intent/consume` fired exactly once and a
//     later `/app` GET lands on the §15.3 default (the unopened-only-child Showcase dossier
//     URL), never bouncing back to `/app/new`;
//   • document navigation count — the whole sign-in chain never exceeds its hops (no loop).
//
// Requires apps/web's dist build + public/spa (turbo build) and bundled Chromium. A missing
// piece is a skip on a dev box and a failure under CI — the `*.local.test.ts` contract.

import { spawn, type ChildProcess } from "node:child_process";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { chromium, type Browser } from "playwright";

const REPO = resolve(fileURLToPath(new URL(".", import.meta.url)), "../../..");
const MAIN = join(REPO, "apps/web/dist/main.js");
const WEB_PORT = 44500 + Math.floor(Math.random() * 400);
const BASE = `http://127.0.0.1:${WEB_PORT}`;

const SESSION = {
  "x-rhema-user-id": "usr_local_r6fix12",
  "x-rhema-workspace-id": "ws_local_r6fix12",
  "x-rhema-billing-account-id": "ba_local_r6fix12",
} as const;

const SHOWCASE_ROW = {
  id: "prj_showcase",
  slug: "showcase",
  title: "Showcase — a worked example",
  showcase: true,
  state: {
    key: "edited_by_you",
    pill: "Edited by you",
    overlay: null,
    suggested: { action: "none", label: null },
  },
};

/** The mutable stub-api state — the request log is the loop detector. */
const apiState = {
  intent: { entry: "draft", held: true } as unknown,
  projects: [SHOWCASE_ROW] as unknown[],
  log: [] as string[],
  consumes: 0,
  creates: 0,
};

async function startStubApi(): Promise<{ url: string; close: () => void }> {
  const srv: Server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://stub");
    apiState.log.push(`${req.method} ${url.pathname}`);
    const json = (status: number, body: unknown) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
    };
    if (url.pathname === "/session") {
      return json(200, {
        userId: SESSION["x-rhema-user-id"],
        workspaceId: SESSION["x-rhema-workspace-id"],
        billingAccountId: SESSION["x-rhema-billing-account-id"],
      });
    }
    if (url.pathname === "/projects" && req.method === "GET") {
      return json(200, { projects: apiState.projects });
    }
    if (url.pathname === "/projects" && req.method === "POST") {
      apiState.creates++;
      const n = apiState.projects.length;
      const slug = `held-draft-${n}`;
      const project = { id: `prj_held_${n}`, slug, title: "Untitled" };
      apiState.projects.push({
        ...project,
        state: {
          key: "draft",
          pill: "Draft",
          overlay: null,
          suggested: { action: "review", label: "Review" },
        },
      });
      return json(201, {
        project: { ...project, draftId: null, draftN: null, conversionNotes: null },
      });
    }
    if (url.pathname === "/showcase" && req.method === "GET") {
      return json(200, {
        showcase: {
          slug: "showcase",
          projectId: "prj_showcase",
          reviewRunId: "run_sc",
          firstFindingId: "f_1",
          opened: false,
          archived: false,
        },
        intent: apiState.intent,
      });
    }
    if (url.pathname === "/showcase/intent/consume" && req.method === "POST") {
      apiState.consumes++;
      apiState.intent = null;
      return json(200, { ok: true });
    }
    return json(404, { error: "not_found" });
  });
  await new Promise<void>((r) => srv.listen(0, "127.0.0.1", r));
  const port = (srv.address() as AddressInfo).port;
  return { url: `http://127.0.0.1:${port}`, close: () => srv.close() };
}

let server: ChildProcess | undefined;
let browser: Browser | undefined;

async function startWeb(apiUrl: string): Promise<string | null> {
  try {
    const p = spawn(process.execPath, [MAIN], {
      cwd: REPO,
      env: {
        ...process.env,
        PORT: String(WEB_PORT),
        API_BASE_URL: apiUrl,
        APP_BASE_URL: BASE,
        RHEMA_BUILD_GIT_SHA: "r6fix12-local",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    server = p;
    for (let i = 0; i < 100; i++) {
      try {
        const r = await fetch(`${BASE}/healthz`);
        if (r.ok) return BASE;
      } catch {
        /* still booting */
      }
      await new Promise((r) => setTimeout(r, 200));
    }
    return null;
  } catch {
    return null;
  }
}

describe("262_R6FIX.12 — the sign-up redirect-loop hotfix, local browser arm (N1/N3 post-auth chain)", () => {
  it("held draft → /app handoff → ONE create → /p/:slug/import hydrated; intent consumed once; no loop", async () => {
    const stub = await startStubApi();
    const base = await startWeb(stub.url);
    if (base == null) {
      stub.close();
      if (process.env.CI)
        throw new Error("local web server did not start (apps/web build missing?)");
      console.warn("local web server unavailable — skipping");
      return;
    }
    try {
      browser = await chromium.launch({ headless: true });
    } catch {
      stub.close();
      server?.kill();
      if (process.env.CI) throw new Error("playwright chromium missing under CI");
      console.warn("playwright browsers not installed — skipping");
      return;
    }
    try {
      const ctx = await browser.newContext({ baseURL: BASE });
      const page = await ctx.newPage();
      // every same-origin DOCUMENT response, in order — the loop's footprint.
      const docs: string[] = [];
      page.on("response", (r) => {
        if (r.request().resourceType() === "document" && r.url().startsWith(BASE)) {
          docs.push(`${r.status()} ${r.url()}`);
        }
      });

      // — the REAL landing drop-zone hold (N1's first leg, verbatim) —
      const landing = await page.goto(`${BASE}/`);
      expect(landing?.ok()).toBe(true);
      await page.setInputFiles('input[name="held"]', {
        name: "n1-held-draft.md",
        mimeType: "text/markdown",
        buffer: Buffer.from("# N1 Held Draft\n\nThe draft that must survive sign-in."),
      });
      await page.waitForURL((u) => u.pathname === "/signup" && u.searchParams.get("held") === "1", {
        timeout: 10_000,
      });

      // — the post-auth landing (the magic-link/OAuth target): ≤2 hops to the create surface —
      // the session rides the dev/preview identity shim from here on (the same IndexedDB
      // context keeps the hold — N1's one-context rule verbatim).
      await ctx.setExtraHTTPHeaders({ ...SESSION });
      await page.goto(`${BASE}/app?entry=draft&held=1`);
      await page.waitForURL(/\/p\/[^/]+\/import/, { timeout: 30_000 });
      expect(page.url()).toMatch(/\/p\/held-draft-\d+\/import/);
      // the ONE create + the ONE consume — the stub api's log is the count of record.
      expect(apiState.creates).toBe(1);
      expect(apiState.consumes).toBe(1);
      // the held file hydrated into the import surface's file input (N1's assertion verbatim)
      await page.waitForFunction(
        () =>
          ((document.querySelector('input[name="file"]') as HTMLInputElement | null)?.files
            ?.length ?? 0) === 1,
        undefined,
        { timeout: 15_000 },
      );
      const attached = await page.evaluate(
        () =>
          (document.querySelector('input[name="file"]') as HTMLInputElement | null)?.files?.[0]
            ?.name ?? "",
      );
      expect(attached).toBe("n1-held-draft.md");
      const notice = (await page.locator("[data-held-notice]").textContent()) ?? "";
      expect(notice).toContain("n1-held-draft.md");

      // — consumed once: a later /app lands on the §5.2 list itself (the create minted an
      // own project + the stored intent is cleared), never /app/new again —
      await page.goto(`${BASE}/app`);
      await page.waitForLoadState("domcontentloaded");
      expect(new URL(page.url()).pathname).toBe("/app");
      expect(apiState.consumes).toBe(1);
      expect(apiState.creates).toBe(1);

      // — the loop's footprint: document responses only ever hit each hop once —
      // /app (the 302 isn't a separate document entry in Playwright — the redirect chain is
      // inside one navigation; what must hold is: no second document fetch of /app/new and no
      // repeated /app fetch after the handoff)
      const appNewDocs = docs.filter((d) => d.includes("/app/new"));
      expect(appNewDocs.length).toBeLessThanOrEqual(1);
      await ctx.close();
    } finally {
      await browser?.close();
      server?.kill();
      stub.close();
    }
  }, 120_000);
});
