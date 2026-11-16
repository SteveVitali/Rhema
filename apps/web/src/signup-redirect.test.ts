import { describe, expect, it } from "vitest";
import type { ProjectRow } from "@rhema/api-client";
import type { Hono } from "hono";
import { createWebApp, type WebDeps } from "./server.js";
import type { DataSource } from "./data.js";

// 262_R6FIX.12 (F-15 / BL-105) — the sign-up redirect-loop regression suite. The `6b008f67`
// (R7HOME.2b) regression: `GET /app` honored the §15.3 carried-file intent by 302ing to
// `/app/new?entry=…`, while `GET /app/new` 302'd EVERY document GET back to `/app` — the stored
// `signup_intent` persisted, so the two redirects ping-ponged forever (`ERR_TOO_MANY_REDIRECTS`)
// for every new user arriving with draft/outline/drop-zone intent.
//
// The fix's contract under test:
//   • `GET /app/new?entry=draft|outline` (+`held`) serves the SPA shell — the in-router leaf
//     issues the ONE create POST and lands the writer on the new project's import surface;
//   • the intent is consumed ONCE — `GET /app` clears `signup_intent` as it honors it
//     (`consumeSignupIntent`), so a subsequent `/app` GET never force-redirects again and a
//     persistently refused create cannot re-loop;
//   • a bare/other-entry `GET /app/new` keeps the R7HOME.2b server-owned redirect — a
//     bookmark/refusal landing still never mints a project;
//   • every auth landing URL reaches a 200 document in ≤ 2 hops for BOTH the Showcase-only
//     workspace and a user with own projects.

const SHOWCASE_ROW: ProjectRow = {
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
} as ProjectRow;

const OWN_ROW: ProjectRow = {
  id: "prj_own",
  slug: "my-first-draft",
  title: "My first draft",
  state: {
    key: "draft",
    pill: "Draft",
    overlay: null,
    suggested: { action: "review", label: "Review" },
  },
} as ProjectRow;

const SHOWCASE = {
  slug: "showcase",
  projectId: "prj_showcase",
  reviewRunId: "run_sc",
  firstFindingId: "f_1",
  opened: false,
  archived: false,
};

type IntentState = { entry?: "scratch" | "outline" | "draft"; src?: string; held?: boolean } | null;

function makeDeps(
  intentRef: { current: IntentState },
  projects: ProjectRow[],
  calls: string[],
): WebDeps {
  return {
    dataSource: {
      checkSession: async () => true,
      listProjects: async () => projects,
      getShowcaseEntry: async () => ({ showcase: SHOWCASE, intent: intentRef.current }),
      consumeSignupIntent: async () => {
        calls.push("consumeSignupIntent");
        intentRef.current = null;
        return { ok: true };
      },
    } as unknown as DataSource,
    session: () => ({}),
  };
}

/** Follow a document-GET redirect chain hop by hop; returns the final response + hop count. */
async function follow(
  app: Hono,
  url: string,
  cap = 8,
): Promise<{ res: Response; hops: number; chain: string[] }> {
  const chain = [url];
  let res = await app.request(url, { redirect: "manual" });
  let hops = 0;
  while (
    (res.status === 301 || res.status === 302 || res.status === 307 || res.status === 308) &&
    hops < cap
  ) {
    const loc = res.headers.get("location")!;
    chain.push(loc);
    res = await app.request(loc, { redirect: "manual" });
    hops++;
  }
  return { res, hops, chain };
}

const SPA_SHELL = ['id="spa-root"', 'data-renderer="spa"'] as const;

describe("R6FIX.12 — every auth landing URL reaches 200 in ≤2 hops (Showcase-only user)", () => {
  // Each case: the landing URL + the intent state the account arrives with. `draft`/`outline`
  // resolve through the in-router create leaf (the shell); `scratch`/bare `/app` resolve through
  // the §15.3 Showcase-first redirect (the unopened only-child dossier).
  const cases: { url: string; intent: IntentState; finalPath: string }[] = [
    {
      url: "/app?entry=draft&held=1",
      intent: { entry: "draft", held: true },
      finalPath: "/app/new?entry=draft&held=1",
    },
    {
      url: "/app?entry=outline",
      intent: { entry: "outline" },
      finalPath: "/app/new?entry=outline",
    },
    {
      url: "/app?entry=scratch",
      intent: { entry: "scratch" },
      finalPath: "/p/showcase/review/run_sc#finding-f_1",
    },
    { url: "/app", intent: null, finalPath: "/p/showcase/review/run_sc#finding-f_1" },
    // the OAuth callback target — `next` threads entry+held+src verbatim (no stored intent:
    // `onUserCreate` never writes `signup_intent`, so the `?entry=` fallback carries it).
    {
      url: "/app?entry=draft&held=1&src=hero",
      intent: null,
      finalPath: "/app/new?entry=draft&held=1",
    },
  ];

  for (const { url, intent, finalPath } of cases) {
    it(`${url} resolves to a 200 document in ≤2 hops`, async () => {
      const intentRef = { current: intent };
      const calls: string[] = [];
      const app = createWebApp(makeDeps(intentRef, [SHOWCASE_ROW], calls)) as unknown as Hono;
      const { res, hops, chain } = await follow(app, url);
      expect(res.status, `redirect chain: ${chain.join(" → ")}`).toBe(200);
      expect(hops, `redirect chain: ${chain.join(" → ")}`).toBeLessThanOrEqual(2);
      // the handoff lands on the expected surface — the shell for the create entries,
      // the Showcase dossier for scratch/bare.
      expect(chain[chain.length - 1]).toBe(finalPath);
      expect(await res.text()).toContain('id="spa-root"');
    });
  }

  it("the N1 revisit URL — GET /app/new?entry=draft&held=1 — serves the shell directly", async () => {
    const intentRef = { current: null };
    const app = createWebApp(makeDeps(intentRef, [SHOWCASE_ROW], [])) as unknown as Hono;
    const res = await app.request("/app/new?entry=draft&held=1", { redirect: "manual" });
    expect(res.status).toBe(200);
    const html = await res.text();
    for (const marker of SPA_SHELL) expect(html).toContain(marker);
  });

  it("GET /app/new?entry=outline serves the shell directly", async () => {
    const intentRef = { current: null };
    const app = createWebApp(makeDeps(intentRef, [SHOWCASE_ROW], [])) as unknown as Hono;
    const res = await app.request("/app/new?entry=outline", { redirect: "manual" });
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('data-renderer="spa"');
  });
});

describe("R6FIX.12 — the same landings for a user with own projects", () => {
  const urls = [
    "/app?entry=draft&held=1",
    "/app?entry=outline",
    "/app?entry=scratch",
    "/app",
    "/app?entry=draft&held=1&src=hero",
    "/app/new?entry=draft&held=1",
  ];

  for (const url of urls) {
    it(`${url} resolves to a 200 document in ≤2 hops`, async () => {
      const intentRef = { current: { entry: "draft" as const, held: true } };
      const app = createWebApp(makeDeps(intentRef, [SHOWCASE_ROW, OWN_ROW], [])) as unknown as Hono;
      const { res, hops, chain } = await follow(app, url);
      expect(res.status, `redirect chain: ${chain.join(" → ")}`).toBe(200);
      expect(hops, `redirect chain: ${chain.join(" → ")}`).toBeLessThanOrEqual(2);
      // own-project users are never precedence-redirected — the intent stays unread and
      // unconsumed (it is never theirs to honor).
      expect(intentRef.current).not.toBeNull();
    });
  }
});

describe("R6FIX.12 — the intent is consumed ONCE", () => {
  it("a subsequent /app GET does NOT re-redirect to /app/new after the handoff", async () => {
    const intentRef = { current: { entry: "draft" as const, held: true } };
    const calls: string[] = [];
    const app = createWebApp(makeDeps(intentRef, [SHOWCASE_ROW], calls)) as unknown as Hono;

    // the magic-link landing: the intent redirects once and is cleared as it is honored.
    const first = await app.request("/app?entry=draft&held=1", { redirect: "manual" });
    expect(first.status).toBe(302);
    expect(first.headers.get("location")).toBe("/app/new?entry=draft&held=1");
    expect(calls).toEqual(["consumeSignupIntent"]);

    // the second /app GET: the intent is gone — no /app/new bounce; the §15.3 default
    // (unopened-only-child Showcase) owns the redirect instead.
    const second = await app.request("/app", { redirect: "manual" });
    expect(second.status).toBe(302);
    expect(second.headers.get("location")).not.toContain("/app/new");
    expect(second.headers.get("location")).toBe("/p/showcase/review/run_sc#finding-f_1");
    expect(calls).toEqual(["consumeSignupIntent"]); // still exactly once
  });

  it("a consume failure never blocks the handoff — the redirect still fires", async () => {
    const intentRef = { current: { entry: "outline" as const } };
    const app = createWebApp({
      dataSource: {
        checkSession: async () => true,
        listProjects: async () => [SHOWCASE_ROW],
        getShowcaseEntry: async () => ({ showcase: SHOWCASE, intent: intentRef.current }),
        consumeSignupIntent: async () => {
          throw new Error("api down");
        },
      } as unknown as DataSource,
      session: () => ({}),
    }) as unknown as Hono;
    const res = await app.request("/app?entry=outline", { redirect: "manual" });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/app/new?entry=outline");
  });
});

describe("R6FIX.12 — the server-owned redirect stays for non-handoff document GETs", () => {
  it.each(["/app/new", "/app/new?entry=scratch", "/app/new?held=1"])(
    "GET %s keeps redirecting to /app (a GET never mints)",
    async (url) => {
      const intentRef = { current: null };
      const app = createWebApp(makeDeps(intentRef, [SHOWCASE_ROW], [])) as unknown as Hono;
      const res = await app.request(url, { redirect: "manual" });
      expect(res.status).toBe(302);
      expect(res.headers.get("location")).toBe("/app");
    },
  );

  it("GET /app/new unauthenticated still 302s to /login", async () => {
    const intentRef = { current: null };
    const deps = makeDeps(intentRef, [SHOWCASE_ROW], []);
    const app = createWebApp({ ...deps, session: () => null }) as unknown as Hono;
    const res = await app.request("/app/new?entry=draft&held=1", { redirect: "manual" });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/login?next=%2Fapp%2Fnew%3Fentry%3Ddraft%26held%3D1");
  });
});
