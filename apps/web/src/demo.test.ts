// R7DEM.4 — the R3 §7 security sweep + header/boot/twin assertions for the demo serving half
// (REQ-DWEB-2/3/4/5/6/10/17). Every leg runs against the OUTER app built with a throwing,
// recording `dataSource`: a demo path must never touch it — the nested app serves snapshots.
// Per S-12, all reads run on the committed synthetic fixture (`fixtures/synthetic`), never the
// real corpus.

import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { DEMO_DOCUMENT_ROUTE_IDS } from "@rhema/contracts";
import { createWebApp, type WebDeps } from "./server.js";
import { demoDataSource, DemoUnsupported } from "./demo-data.js";
import { docMetaFor } from "./doc-meta.js";
import type { DataSource, SessionHeaders } from "./data.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(HERE, "..", "..", "..", "packages", "demo-corpus", "fixtures", "synthetic");
const ESSAY = "the-borrowed-commons";
const SLUG = `demo~${ESSAY}`;

/** A Vite manifest fixture so the shell emits real entry tags (and never the degrade warn). */
function spaAssetRoot(): string {
  const dir = mkdtempSync(join(tmpdir(), "rhema-demo-spa-"));
  mkdirSync(join(dir, ".vite"), { recursive: true });
  writeFileSync(
    join(dir, ".vite", "manifest.json"),
    JSON.stringify({ "src/main.tsx": { file: "assets/spa/main.js", isEntry: true } }),
  );
  return dir;
}

/** Every DataSource call recorded — the demo path must issue ZERO of them (§7 test 2). */
function recordingSource(calls: string[]): DataSource {
  const stub = {} as Record<string, unknown>;
  return new Proxy(stub, {
    get(_t, prop) {
      return (..._args: unknown[]) => {
        calls.push(String(prop));
        return Promise.reject(new Error(`outer DataSource touched: ${String(prop)}`));
      };
    },
  }) as DataSource;
}

/** `session` resolver mirroring main.ts's cookie-presence rule (no API call — cosmetic). */
function sessionFor(c: { req: { header: (n: string) => string | undefined } }): SessionHeaders | null {
  const cookie = c.req.header("cookie");
  return cookie ? { cookie } : null;
}

function makeApp(calls: string[]) {
  const deps: WebDeps = {
    dataSource: recordingSource(calls),
    session: sessionFor,
    demoCorpusRoot: FIXTURE,
    spaAssetRoot: spaAssetRoot(),
    buildGitSha: "testsha",
  };
  return createWebApp(deps);
}

const COOKIE = { headers: { cookie: "rhema.session_token=fake-session" } };
const PHONE = {
  headers: {
    "user-agent":
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  },
};

const TWIN_PATHS = [
  `/bff/p/${SLUG}`,
  `/bff/p/${SLUG}/v/2`,
  `/bff/p/${SLUG}/v/1/diff/2`,
  `/bff/p/${SLUG}/a/${encodeURIComponent("agents/author/research/index.md")}`,
  `/bff/p/${SLUG}/revisions/v1-v2`,
  `/bff/p/${SLUG}/review/v1-review`,
  `/bff/p/${SLUG}/r/v1-review`,
  `/bff/p/${SLUG}/figures`,
  `/bff/p/${SLUG}/figures/figure_1_signal_map`,
  `/p/${SLUG}/palette-search`,
];

const DOC_PATHS = [
  `/demo/${ESSAY}`,
  `/demo/${ESSAY}/v/2`,
  `/demo/${ESSAY}/v/1/diff/2`,
  `/demo/${ESSAY}/review/v1-review`,
  `/demo/${ESSAY}/r/v1-review`,
  `/demo/${ESSAY}/figures`,
  `/p/${SLUG}`,
  `/p/${SLUG}/v/3`,
  `/p/${SLUG}/revisions/v1-v2`,
];

async function get(app: ReturnType<typeof makeApp>, path: string, init?: RequestInit) {
  return app.request(`http://local.test${path}`, init);
}

describe("R3 §7 test 2 — zero outer DataSource calls, cookie-invariant, no Set-Cookie", () => {
  for (const path of TWIN_PATHS) {
    it(`GET ${path} — 200, zero calls, byte-identical, no Set-Cookie`, async () => {
      const calls: string[] = [];
      const app = makeApp(calls);
      const anon = await get(app, path);
      const authed = await get(app, path, COOKIE);
      expect(anon.status, `anon ${path}`).toBe(200);
      expect(authed.status, `authed ${path}`).toBe(200);
      expect(await anon.text()).toBe(await authed.text());
      expect(anon.headers.get("set-cookie")).toBeNull();
      expect(authed.headers.get("set-cookie")).toBeNull();
      expect(calls).toEqual([]);
    });
  }

  for (const path of ["/demo", ...DOC_PATHS]) {
    it(`GET ${path} — document served, zero calls, no Set-Cookie`, async () => {
      const calls: string[] = [];
      const app = makeApp(calls);
      const anon = await get(app, path);
      const authed = await get(app, path, COOKIE);
      expect(anon.status, `anon ${path}`).toBe(200);
      expect(authed.status, `authed ${path}`).toBe(200);
      expect(anon.headers.get("set-cookie")).toBeNull();
      expect(authed.headers.get("set-cookie")).toBeNull();
      expect(calls).toEqual([]);
    });
  }

  it("/bff/demo/feed-labels is public and cookie-invariant", async () => {
    const calls: string[] = [];
    const app = makeApp(calls);
    const anon = await get(app, "/bff/demo/feed-labels");
    const authed = await get(app, "/bff/demo/feed-labels", COOKIE);
    expect(anon.status).toBe(200);
    expect(authed.status).toBe(200);
    expect(await anon.text()).toBe(await authed.text());
    expect(calls).toEqual([]);
  });
});

describe("R3 §7 tests 4–5 — writes refused; non-allowlisted GETs get a terminal 404", () => {
  it("every non-GET on demo paths → 405 demo_read_only, zero calls", async () => {
    const calls: string[] = [];
    const app = makeApp(calls);
    for (const [method, path] of [
      ["POST", `/bff/p/${SLUG}`],
      ["POST", `/bff/p/${SLUG}/handoff`],
      ["PUT", `/p/${SLUG}`],
      ["DELETE", `/bff/p/${SLUG}/v/2`],
      ["POST", `/p/${SLUG}/gates/g`],
      ["POST", `/demo/${ESSAY}`],
    ] as const) {
      const res = await get(app, path, {
        method,
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      expect(res.status, `${method} ${path}`).toBe(405);
      expect((await res.json() as { error?: string }).error).toBe("demo_read_only");
      expect(res.headers.get("set-cookie")).toBeNull();
    }
    expect(calls).toEqual([]);
  });

  it("a form-posted write gets the terminal SSR notice (data-demo-readonly-notice)", async () => {
    const calls: string[] = [];
    const app = makeApp(calls);
    const res = await get(app, `/p/${SLUG}`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: "a=b",
    });
    expect(res.status).toBe(405);
    const html = await res.text();
    expect(html).toContain('data-demo-readonly-notice');
    expect(html).not.toContain('data-renderer="spa"');
    expect(calls).toEqual([]);
  });

  it("non-allowlisted GETs + unknown slugs → terminal 404, never the shell", async () => {
    const calls: string[] = [];
    const app = makeApp(calls);
    for (const path of [
      `/p/${SLUG}/run`,
      `/p/${SLUG}/export`,
      `/p/${SLUG}/r/v1-review/events`,
      `/p/${SLUG}/edit/d/doc`,
      `/p/${SLUG}/settings`,
      `/p/${SLUG}/visualize`,
      `/p/${SLUG}/obligations/new`,
      `/p/demo~unknown-essay`,
      `/bff/p/demo~unknown-essay`,
      `/bff/p/${SLUG}/run`,
      `/bff/p/${SLUG}/usage`,
      `/demo/unknown-essay`,
      `/demo/${ESSAY}/run`,
    ]) {
      const res = await get(app, path);
      expect(res.status, path).toBe(404);
      const body = await res.text();
      expect(body, path).not.toContain('data-renderer="spa"');
      expect(res.headers.get("set-cookie"), path).toBeNull();
    }
    expect(calls).toEqual([]);
  });
});

describe("REQ-DWEB-5/6 — twin + boot facts", () => {
  it("the overview twin carries readOnly:true, ReadOnlyProject{demo}, no collab, no activeRun", async () => {
    const calls: string[] = [];
    const app = makeApp(calls);
    for (const path of [`/bff/p/${SLUG}`, `/bff/p/${SLUG}/v/2`]) {
      const body = (await (await get(app, path)).json()) as {
        project?: { readOnlyProject?: { reason?: string } | null; showcase?: boolean };
        page?: { readOnly?: boolean; collabWsUrl?: string };
      };
      expect(body.project?.readOnlyProject, path).toEqual({ reason: "demo" });
      expect(body.project?.showcase ?? false, path).toBe(false);
      expect(body.page?.readOnly, path).toBe(true);
      expect(body.page?.collabWsUrl, path).toBeUndefined();
      const text = JSON.stringify(body);
      expect(text).not.toContain('"activeRun":{');
      expect(text).not.toContain('"activeRun": "');
    }
    expect(calls).toEqual([]);
  });

  it("the demo boot carries demo:{essay,slug,signedIn,build}, no principal, all-spa surfaces", async () => {
    const calls: string[] = [];
    const app = makeApp(calls);
    const read = async (init?: RequestInit) => {
      const html = await (await get(app, `/demo/${ESSAY}`, init)).text();
      const m = /<script[^>]*data-spa-boot[^>]*>([^<]+)<\/script>/.exec(html);
      expect(m, "boot embed").not.toBeNull();
      return JSON.parse(m![1]!) as {
        demo?: { essay: string; slug: string; signedIn: boolean; build: string | null };
        principal?: unknown;
        theme: Record<string, unknown>;
        surfaces: Record<string, string>;
        project?: { slug: string };
      };
    };
    const anon = await read();
    expect(anon.demo).toEqual({
      essay: ESSAY,
      slug: SLUG,
      signedIn: false,
      build: "testsha",
    });
    expect(anon.principal).toBeUndefined();
    expect(anon.theme).toEqual({});
    expect(anon.project?.slug).toBe(SLUG);
    for (const id of DEMO_DOCUMENT_ROUTE_IDS) expect(anon.surfaces[id], id).toBe("spa");
    // phone UA: no SsrHandoff loop — every in-scope demo routeId stays "spa" (REQ-DWEB-6).
    const phone = await read(PHONE);
    for (const id of DEMO_DOCUMENT_ROUTE_IDS) expect(phone.surfaces[id], `phone ${id}`).toBe("spa");
    const authed = await read(COOKIE);
    expect(authed.demo?.signedIn).toBe(true);
    expect(authed.principal).toBeUndefined();
    // /p/<slug> document path serves the same demo boot.
    const html = await (await get(app, `/p/${SLUG}`)).text();
    const m = /<script[^>]*data-spa-boot[^>]*>([^<]+)<\/script>/.exec(html);
    expect(JSON.parse(m![1]!).demo?.slug).toBe(SLUG);
    expect(calls).toEqual([]);
  });
});

describe("REQ-DWEB-10 — cache posture", () => {
  it("twins are public with an ETag of snapshot hash + build SHA; the shell is no-cache", async () => {
    const calls: string[] = [];
    const app = makeApp(calls);
    const twin = await get(app, `/bff/p/${SLUG}`);
    expect(twin.headers.get("cache-control")).toBe("public, max-age=300, s-maxage=86400");
    expect(twin.headers.get("etag")).toMatch(/^"demo-testsha-[0-9a-f]{24}"$/);
    // HEAD answers the same headers with an empty body.
    const head = await get(app, `/bff/p/${SLUG}`, { method: "HEAD" });
    expect(head.headers.get("etag")).toBe(twin.headers.get("etag"));
    for (const path of [`/demo/${ESSAY}`, `/p/${SLUG}`]) {
      const shell = await get(app, path);
      expect(shell.headers.get("cache-control"), path).toBe("no-cache");
    }
    expect(calls).toEqual([]);
  });
});

describe("REQ-DWEB-8 — one CSP nonce per <script>", () => {
  it("every <script> on a demo document carries exactly one nonce matching the header", async () => {
    const calls: string[] = [];
    const app = makeApp(calls);
    for (const path of ["/demo", `/demo/${ESSAY}`, `/p/${SLUG}`]) {
      const res = await get(app, path);
      const html = await res.text();
      const cspNonce = /'nonce-([^']+)'/.exec(res.headers.get("content-security-policy") ?? "")?.[1];
      expect(cspNonce, path).toBeTruthy();
      const tags = html.match(/<script[^>]*>/g) ?? [];
      expect(tags.length, path).toBeGreaterThan(0);
      for (const tag of tags) {
        expect(tag.match(/nonce=/g)?.length ?? 0, `${path} ${tag}`).toBe(1);
        expect(tag).toContain(`nonce="${cspNonce}"`);
      }
    }
    expect(calls).toEqual([]);
  });
});

describe("REQ-DWEB-17 — the asset route", () => {
  it("serves allowlisted corpus images with an immutable cache + allowlisted content-type", async () => {
    const calls: string[] = [];
    const app = makeApp(calls);
    const res = await get(app, `/bff/demo/asset/${ESSAY}/drafts/figures/figure_1_signal_map.png`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    expect((await res.arrayBuffer()).byteLength).toBeGreaterThan(0);
    expect(calls).toEqual([]);
  });

  it("404s everything else: markdown, unknown essay, traversal, unlisted media", async () => {
    const calls: string[] = [];
    const app = makeApp(calls);
    for (const path of [
      `/bff/demo/asset/${ESSAY}/index.json`,
      `/bff/demo/asset/${ESSAY}/drafts/v1.md`,
      `/bff/demo/asset/${ESSAY}/agents/author/research/index.md`,
      `/bff/demo/asset/${ESSAY}/drafts/figures/nope.png`,
      `/bff/demo/asset/${ESSAY}/drafts/figures/figure_1_signal_map.svg`,
      `/bff/demo/asset/unknown-essay/drafts/figures/figure_1_signal_map.png`,
      `/bff/demo/asset/${ESSAY}/../published.md`,
      `/bff/demo/asset/${ESSAY}/drafts/../../published.md`,
    ]) {
      const res = await get(app, path);
      expect(res.status, path).toBe(404);
    }
    expect(calls).toEqual([]);
  });
});

describe("REQ-DWEB-3 — the demoDataSource boundary", () => {
  it("an unimplemented seam throws DemoUnsupported", async () => {
    const ds = demoDataSource(FIXTURE);
    await expect((ds as { getBillingBalance: () => Promise<unknown> }).getBillingBalance()).rejects.toThrow(
      DemoUnsupported,
    );
    await expect((ds as { getInbox: () => Promise<unknown> }).getInbox()).rejects.toThrow(
      DemoUnsupported,
    );
  });

  it("the module graph has no fetch(, no process.env, no banned runtime imports", () => {
    // Walk demo-data.ts's RUNTIME import closure (relative specifiers only; `import type` and
    // type-position imports are erased at compile time and never reach the bundle).
    const seen = new Set<string>();
    const bannedPkg = /^@rhema\/(api-client|db|live-clients|demo-corpus)$/;
    const importRe = /^\s*import\s+(?!type\b)[^'"]*from\s+['"]([^'"]+)['"]|^\s*import\s+['"]([^'"]+)['"]/gm;
    const visit = (file: string): string[] => {
      if (seen.has(file)) return [];
      seen.add(file);
      // Comments stripped first — the module documents its own boundary (the words live there).
      const src = readFileSync(file, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/(^|\s)\/\/[^\n]*/g, "$1");
      const bad: string[] = [];
      if (/[^.\w]fetch\s*\(/.test(src)) bad.push(`${file}: fetch(`);
      if (/process\.env/.test(src)) bad.push(`${file}: process.env`);
      for (const m of src.matchAll(importRe)) {
        const spec = m[1] ?? m[2]!;
        if (bannedPkg.test(spec)) bad.push(`${file}: runtime import ${spec}`);
        if (spec.startsWith(".")) {
          bad.push(...visit(join(dirname(file), `${spec}.ts`)));
          if (existsSync(join(dirname(file), `${spec}.tsx`))) {
            bad.push(...visit(join(dirname(file), `${spec}.tsx`)));
          }
        }
      }
      return bad;
    };
    expect(visit(join(HERE, "demo-data.ts"))).toEqual([]);
  });

  it("snapshot JSON is never `import`ed into a bundle (disk reads only)", () => {
    const src = readFileSync(join(HERE, "demo-data.ts"), "utf8");
    expect(src).not.toMatch(/from\s+['"][^'"]*\.json['"]/);
    expect(src).not.toMatch(/\bimport\s*\(/);
  });

  it("demoDataSource is absent from the system-pool boundary (no tenant read)", () => {
    const boundary = readFileSync(
      join(HERE, "..", "..", "..", "tools", "system-pool-boundary.json"),
      "utf8",
    );
    expect(boundary).not.toContain("demoDataSource");
    expect(boundary).not.toContain("demo-data");
    expect(boundary).not.toContain("demo-corpus");
  });
});

describe("hub + documents", () => {
  it("GET /demo serves the hub frame with data-demo-root and the N10 head contract", async () => {
    const calls: string[] = [];
    const app = makeApp(calls);
    const res = await get(app, "/demo");
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("data-demo-root");
    expect(html).toContain("<title>Demo · Rhēma</title>");
    expect(html).toContain('<meta name="description"');
    expect(html).toContain('property="og:title"');
    expect(html).toContain('name="twitter:card"');
    expect(calls).toEqual([]);
  });

  it("demo document titles name the essay (doc-meta — the SSR doc + the client HeadManager)", () => {
    // The demo shell carries no <title> — the SPA head manager stamps it client-side from the
    // SAME `docMetaFor` vocabulary the SSR document uses, so asserting the pure function covers
    // both pipelines (doc/22's head-parity contract).
    for (const [path, title] of [
      ["/demo", "Demo · Rhēma"],
      [`/demo/${ESSAY}`, "The Borrowed Commons: a Grammar of Shared Decay · Rhēma"],
      [`/demo/${ESSAY}/v/2`, "Page — The Borrowed Commons: a Grammar of Shared Decay · Rhēma"],
      [
        `/demo/${ESSAY}/review/v1-review`,
        "Dossier — The Borrowed Commons: a Grammar of Shared Decay · Rhēma",
      ],
    ]) {
      expect(docMetaFor(path).title, path).toBe(title);
    }
    // the /p/ shape prefixes the project title the twin/document read supplies, like every
    // project surface (no registry row is consulted on /p paths — same rule as tenant slugs).
    expect(
      docMetaFor(`/p/${SLUG}/v/2`, {
        project: { title: "The Borrowed Commons: a Grammar of Shared Decay" },
      }).title,
    ).toBe("Page — The Borrowed Commons: a Grammar of Shared Decay · Rhēma");
    // an unregistered `/demo/<unknown>` has no registry row — the demo fallback title.
    expect(docMetaFor("/demo/unknown-essay").title).toBe("Demo · Rhēma");
  });
});
