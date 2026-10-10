import { describe, it, expect, vi } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Context } from "hono";
import { createWebApp, type WebDeps } from "./server.js";
import { renderSpaShell, spaManifestEntry, type SpaBootPayload } from "./spa-shell.js";
import { feedLabelMaps } from "./feed-labels.js";
import type { DataSource } from "./data.js";

// SPA.3 — REQ-BND-1..5, 11, 12; REQ-SEQ-8; REQ-INV-1/6/7; REQ-FW-3/10; REQ-TL-4/5/7; REQ-TST-5.
// The shell document's contract, the SSR settle markers, the catch-all split, and the
// `/assets/spa/*` name-gated static route. Driven through `createWebApp` + Hono's `app.request`
// (no network), with `spaAssetRoot` pointed at a tmpdir fixture so the manifest + asset legs are
// deterministic without a Vite build.

const SESSION = { cookie: "__Host-rhema.session_token=tok.sig" };
const PRINCIPAL = { userId: "u_1", workspaceId: "w_1", billingAccountId: "ba_1" };

/** A tmpdir shaped like `public/spa/`: `.vite/manifest.json` + one hashed entry chunk. */
function spaFixture(): string {
  const root = mkdtempSync(join(tmpdir(), "rhema-spa-"));
  mkdirSync(join(root, ".vite"));
  mkdirSync(join(root, "assets", "chunks"), { recursive: true });
  writeFileSync(join(root, "assets", "main-abc123.js"), "console.log('entry');\n");
  writeFileSync(join(root, "assets", "chunks", "shared-def456.js"), "console.log('dep');\n");
  writeFileSync(
    join(root, ".vite", "manifest.json"),
    JSON.stringify({
      "src/spa/main.tsx": {
        file: "assets/main-abc123.js",
        isEntry: true,
        imports: ["_shared"],
      },
      _shared: { file: "assets/chunks/shared-def456.js" },
    }),
  );
  return root;
}

/** A minimal authed deps set; `dataSource` stubs carry only the reads the tested paths need. */
function spaDeps(over: Partial<WebDeps> = {}): WebDeps {
  return {
    dataSource: {
      checkSession: async () => true,
      listProjects: async () => [],
      getSessionPrincipal: async () => PRINCIPAL,
      getTheme: async () => ({ appTheme: "light" as const }),
    } as unknown as DataSource,
    session: () => SESSION,
    ...over,
  };
}

/** Pull the `data-spa-boot` JSON payload out of a shell document (the CSP nonce lands first). */
function bootOf(html: string): SpaBootPayload {
  const m = /<script\b[^>]*data-spa-boot[^>]*>([\s\S]*?)<\/script>/.exec(html);
  expect(m, "a shell carries the data-spa-boot embed").not.toBeNull();
  return JSON.parse(m![1]!);
}

describe("renderSpaShell — the document contract (REQ-BND-1/10/12; spec §3.1)", () => {
  const ctx = { req: { url: "http://app.test/p/acme/run?x=1" } } as unknown as Context;
  const boot: SpaBootPayload = {
    principal: PRINCIPAL,
    theme: { appTheme: "light" },
    deviceClass: "desktop",
    surfaces: { "/app": "ssr", "/p/$project/run": "spa" },
    project: { slug: "acme" },
  };
  const entry = { moduleScripts: ["assets/main-abc.js"], preloads: ["assets/shared-def.js"], stylesheets: [] };

  it("emits the SSR-parity head: charset, viewport, favicon enumeration, docMetaFor title", () => {
    const html = renderSpaShell(ctx, { path: "/p/acme/run", boot, entry });
    expect(html).toContain('<meta charset="utf-8">');
    expect(html).toContain('width=device-width, initial-scale=1, viewport-fit=cover');
    expect(html).toContain('<link rel="icon" href="/favicon.svg" type="image/svg+xml">');
    expect(html).toContain('<link rel="icon" href="/favicon.ico" sizes="any">');
    expect(html).toContain("<title>Run · Rhēma</title>"); // docMetaFor("/p/…/run") — never reimplemented
  });

  it("stamps data-renderer=spa + data-device + data-project — and NOT the SSR settle attrs", () => {
    const html = renderSpaShell(ctx, { path: "/p/acme/run", boot, entry });
    expect(html).toContain('data-renderer="spa"');
    expect(html).toContain('data-device="desktop"');
    expect(html).toContain('data-project="acme"');
    expect(html).toContain('data-app-theme="light"');
    // REQ-SEQ-8: the shell carries data-renderer but NOT data-mounted — the client flips it after
    // first data paint (a [data-mounted] probe must never satisfy on a bare shell).
    expect(html).not.toContain("data-mounted");
  });

  it("carries the mount node, the honest noscript floor, and the boot embed", () => {
    const html = renderSpaShell(ctx, { path: "/p/acme/run", boot, entry });
    expect(html).toContain('<div id="spa-root" data-spa-root></div>');
    expect(html).toContain("<noscript>");
    // REQ-BND-12 — the floor names the surface honestly. SPA.28: no SSR escape link remains —
    // there is no server-rendered document left to land on, so the noscript carries no href at
    // all (a `?ssr=1` link would loop back onto this same shell and lie about the floor).
    expect(html).toContain("needs JavaScript");
    expect(html).not.toContain("ssr=1");
    expect(html).not.toContain("server-rendered version");
    const parsed = bootOf(html);
    expect(parsed.surfaces["/p/$project/run"]).toBe("spa");
    expect(parsed.surfaces["/app"]).toBe("ssr");
    expect(parsed.deviceClass).toBe("desktop");
    expect(parsed.project?.slug).toBe("acme");
    expect(parsed.principal?.userId).toBe("u_1");
  });

  it("the boot JSON escapes `</` sequences — a crafted field can't close the script element", () => {
    const sneaky: SpaBootPayload = {
      ...boot,
      project: { slug: "x</script><script>evil()" },
    };
    const html = renderSpaShell(ctx, { path: "/p/x/run", boot: sneaky, entry });
    expect(html).not.toContain("</script><script>evil");
    expect(html).toContain("\\u003c/script");
  });

  it("emits manifest-resolved entry tags (module script + modulepreload), never inline module code", () => {
    const html = renderSpaShell(ctx, { path: "/p/acme/run", boot, entry });
    expect(html).toContain('<script type="module" src="/assets/spa/assets/main-abc.js">');
    expect(html).toContain('<link rel="modulepreload" href="/assets/spa/assets/shared-def.js">');
    // REQ-FW-3 — no inline modulepreload polyfill, no module source in markup.
    expect(html).not.toContain("modulepreload-polyfill");
    expect(html).not.toContain("import.meta.url");
  });

  it("an empty entry (missing build) still serves a complete shell — the degrade posture", () => {
    const html = renderSpaShell(ctx, { path: "/p/acme/run", boot, entry: { moduleScripts: [], preloads: [], stylesheets: [] } });
    expect(html).toContain('data-renderer="spa"');
    expect(html).toContain('<div id="spa-root"');
    expect(html).not.toContain('type="module"');
  });
});

describe("spaManifestEntry — the Vite manifest resolution (REQ-TL-4/5)", () => {
  it("resolves the entry chunk + its transitive imports + css", () => {
    const entry = spaManifestEntry({
      "src/spa/main.tsx": { file: "assets/main-a.js", isEntry: true, imports: ["_s1", "_s2"] },
      _s1: { file: "assets/s1-b.js", css: ["assets/s1-c.css"], imports: ["_s3"] },
      _s2: { file: "assets/s2-d.js" },
      _s3: { file: "assets/s3-e.js" },
      "src/spa/routes/x.tsx": { file: "assets/r-f.js", isDynamicEntry: true }, // dynamic chunk — NOT the entry
    });
    expect(entry?.moduleScripts).toEqual(["assets/main-a.js"]);
    expect(entry?.preloads).toEqual(["assets/s1-b.js", "assets/s3-e.js", "assets/s2-d.js"]);
    expect(entry?.stylesheets).toEqual(["assets/s1-c.css"]);
  });

  it("malformed / missing manifests resolve null (the caller degrades, never throws)", () => {
    expect(spaManifestEntry(null)).toBeNull();
    expect(spaManifestEntry({})).toBeNull();
    expect(spaManifestEntry({ "src/spa/main.tsx": { isEntry: true } })).toBeNull(); // no file
    expect(spaManifestEntry("not-an-object")).toBeNull();
  });
});

describe("SSR settle markers (REQ-SEQ-8; design/27)", () => {
  it("every SSR document carries data-renderer=ssr + data-route + data-mounted", async () => {
    const app = createWebApp(spaDeps({ session: () => null })); // the public docs render for an anonymous viewer
    const login = await (await app.request("/login")).text();
    expect(login).toContain('data-renderer="ssr"');
    expect(login).toContain('data-route="/login"');
    expect(login).toContain("data-mounted");
    const landing = await (await app.request("/")).text();
    expect(landing).toContain('data-route="/"');
    expect(landing).toContain("data-mounted");
    const missing = await app.request("/nope");
    const body = await missing.text();
    expect(missing.status).toBe(404);
    expect(body).toContain('data-renderer="ssr"');
    expect(body).toContain('data-route="/nope"'); // unknown shape ⇒ the raw path
  });

  it("a param-shaped SSR document stamps the resolved route id or the raw path", async () => {
    const app = createWebApp(spaDeps({ spaAssetRoot: spaFixture() }));
    // SPA.28 — an unmatched SPA-prefixed deep link serves the shell even carrying `?ssr=1` (the
    // override channel is gone); the client router owns not-found and stamps the route itself.
    const res = await app.request("/p/acme/unknown-leaf?ssr=1");
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('data-renderer="spa"');
    // A matched shape's SSR 404 (project row absent) stamps the $param id, not the raw path.
    const shaped = await app.request("/p/acme/revisions/c_1");
    expect(shaped.status).toBe(404);
    expect(await shaped.text()).toContain('data-route="/p/$project/revisions/$cid"');
  });
});

describe("GET /session — the same-origin session probe (REQ-BND-6)", () => {
  it("anonymous ⇒ 401 unauthenticated; the api stays the oracle", async () => {
    const app = createWebApp(spaDeps({ session: () => null }));
    const res = await app.request("/session");
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthenticated" });
  });

  it("authenticated ⇒ the api's principal payload verbatim", async () => {
    const app = createWebApp(spaDeps());
    const res = await app.request("/session");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(PRINCIPAL);
  });

  it("a dead upstream is a 502 — never a forged principal", async () => {
    const app = createWebApp(
      spaDeps({
        dataSource: {
          getSessionPrincipal: async () => {
            throw new Error("upstream down");
          },
        } as unknown as DataSource,
      }),
    );
    const res = await app.request("/session");
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "session_unavailable" });
  });
});

describe("GET /bff/feed-labels — the standalone long-stale label read (REQ-BFF-24; spec R12)", () => {
  it("anonymous ⇒ 401 — the BFF reads sit behind the session gate", async () => {
    const app = createWebApp(spaDeps({ session: () => null }));
    const res = await app.request("/bff/feed-labels");
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthenticated" });
  });

  it("authenticated ⇒ the same server-built maps the SSR embed ships (deploy-versioned copy)", async () => {
    const app = createWebApp(spaDeps());
    const res = await app.request("/bff/feed-labels");
    expect(res.status).toBe(200);
    const body = (await res.json()) as ReturnType<typeof feedLabelMaps>;
    expect(body.t).toBeDefined();
    expect(body.enums.phase).toBeDefined();
    expect(body.enums.kind).toBeDefined();
    expect(body.t["run.state_changed"]).toBeDefined();
  });
});

describe("the catch-all split (REQ-BND-4/11)", () => {
  it("anonymous GET under an SPA prefix ⇒ /login — a signed-out deep link never sees the shell", async () => {
    const app = createWebApp(spaDeps({ session: () => null }));
    for (const path of ["/app/future", "/p/acme/future", "/v/per_1/x", "/usage/x"]) {
      const res = await app.request(path);
      expect(res.status, path).toBe(302);
      expect(res.headers.get("location"), path).toBe("/login");
    }
  });

  it("anonymous GET outside SPA space ⇒ the public 404 (not a /login bounce)", async () => {
    const app = createWebApp(spaDeps({ session: () => null }));
    const res = await app.request("/definitely-not-a-page");
    expect(res.status).toBe(404);
    expect(await res.text()).toContain('data-renderer="ssr"');
  });

  it("authenticated deep links reach the shell unconditionally — no flag/consult can veto it", async () => {
    // SPA.28: there is no consult to resurrect — SPA-prefixed deep links hand to the shell and
    // the client router owns not-found. A resurrected membership/consult leg fails this.
    const app = createWebApp(spaDeps({ spaAssetRoot: spaFixture() }));
    const res = await app.request("/p/acme/future-route");
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('data-renderer="spa"');
    expect(html).toContain('data-spa-boot');
    expect(html).not.toContain("data-mounted");
  });

  it("authenticated + SPA-space deep link ⇒ the shell (client router owns not-found)", async () => {
    const app = createWebApp(spaDeps({ spaAssetRoot: spaFixture() }));
    const res = await app.request("/p/acme/future-route");
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('data-renderer="spa"');
    expect(html).toContain('data-project="acme"');
    expect(html).toContain('<div id="spa-root" data-spa-root></div>');
    expect(html).toContain('data-spa-boot');
    expect(html).not.toContain("data-mounted");
  });

  it("the retired force-SSR escape (?ssr=1 / x-rhema-renderer: ssr) is INERT — the shell still serves (REQ-SEQ-4 removal)", async () => {
    // Removal-detecting: a resurrected consult that honors either signal would answer the SSR
    // 404 here; the only correct answer post-removal is the shell.
    const app = createWebApp(spaDeps({ spaAssetRoot: spaFixture() }));
    for (const init of [
      {},
      { headers: { "x-rhema-renderer": "ssr" } },
      { headers: { "x-rhema-renderer": "SSRish" } },
    ]) {
      const res = await app.request("/app/future?ssr=1", init);
      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain('data-renderer="spa"');
      expect(html).not.toContain('data-renderer="ssr"');
    }
  });

  it("the retired force-SPA signals (?renderer=spa / x-rhema-renderer: spa) change nothing; anonymous stays gated", async () => {
    // Removal-detecting: the shell served anyway, so a spa-pin can't widen anything — and the
    // session gate still runs first, so it can't open the shell for an anonymous request.
    const app = createWebApp(spaDeps({ spaAssetRoot: spaFixture() }));
    for (const init of [
      {},
      { headers: { "x-rhema-renderer": "spa" } },
    ]) {
      const res = await app.request("/app/future?renderer=spa", init);
      expect(res.status).toBe(200);
      expect(await res.text()).toContain('data-renderer="spa"');
    }
    const anon = createWebApp(spaDeps({ session: () => null }));
    for (const init of [
      {},
      { headers: { "x-rhema-renderer": "spa" } },
    ]) {
      const denied = await anon.request("/app/future?renderer=spa", init);
      expect(denied.status).toBe(302);
      expect(denied.headers.get("location")).toBe("/login");
    }
  });

  it("non-GET verbs keep the SSR 404 even under an SPA prefix", async () => {
    const app = createWebApp(spaDeps());
    const res = await app.request("/app/future", { method: "POST" });
    expect(res.status).toBe(404);
    expect(await res.text()).toContain('data-renderer="ssr"');
  });
});

describe("the registered-handler shell serve (spec §4 fixed order)", () => {
  it("an SPA-space document GET serves the shell — full head parity + boot + manifest tags", async () => {
    const app = createWebApp(spaDeps({ spaAssetRoot: spaFixture() }));
    const res = await app.request("/usage");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    const html = await res.text();
    expect(html).toContain('data-renderer="spa"');
    expect(html).toContain("<title>Usage · Rhēma</title>");
    expect(html).toContain('<div id="spa-root" data-spa-root></div>');
    expect(html).toContain("<noscript>");
    // the manifest-resolved tags, nonce-stamped by the CSP middleware
    expect(html).toMatch(/<script nonce="[^"]+" type="module" src="\/assets\/spa\/assets\/main-abc123\.js">/);
    expect(html).toContain('<link rel="modulepreload" href="/assets/spa/assets/chunks/shared-def456.js">');
    // REQ-BND-10 — the boot embed. SPA.28: the renderer map is static truth — every
    // surface-keyed document route serves the shell unconditionally (the consult is gone). The
    // structural exceptions stay "ssr": server-owned rows (`surfaces: null`), the public funnel,
    // and pageMount routes on phone (REQ-ED-12).
    const boot = bootOf(html);
    expect(boot.surfaces["/usage"]).toBe("spa");
    expect(boot.surfaces["/app"]).toBe("spa");
    expect(boot.surfaces["/p/$project"]).toBe("spa"); // the whole auth'd doc set is flag-on now
    expect(boot.surfaces["/app/usage/r/$runId"]).toBe("ssr"); // server-owned row
    expect(boot.surfaces["/"]).toBe("ssr"); // the public funnel stays SSR forever
    expect(boot.principal?.userId).toBe("u_1");
    expect(boot.theme.appTheme).toBe("light");
    expect(boot.deviceClass).toBe("desktop");
    // REQ-BND-10 — the embed is a seed, not an authorization grant: no session material in markup.
    expect(html).not.toContain("tok.sig");
    expect(html).not.toContain("__Host-rhema.session_token");
  });

  it("the retired override signals cannot resurrect an SSR arm — the shell serves regardless (REQ-SEQ-4 removal; REQ-TST-1)", async () => {
    // Removal-detecting: `/usage` has no SSR render path AND no consult to honor — `?ssr=1`,
    // `?renderer=spa`, and both `x-rhema-renderer` values converge on the same shell document.
    // A resurrected consult/override leg fails this.
    const app = createWebApp(
      spaDeps({
        dataSource: {
          checkSession: async () => true,
          listProjects: async () => [],
        } as unknown as DataSource,
      }),
    );
    for (const [path, headers] of [
      ["/usage", {}],
      ["/usage?ssr=1", {}],
      ["/usage?renderer=spa", {}],
      ["/usage", { "x-rhema-renderer": "ssr" }],
      ["/usage", { "x-rhema-renderer": "spa" }],
    ] as const) {
      const res = await app.request(path, { headers });
      expect(res.status, path).toBe(200);
      const html = await res.text();
      expect(html).toContain('data-renderer="spa"');
      expect(html).toContain('<div id="spa-root" data-spa-root></div>');
      expect(html).not.toContain('data-renderer="ssr"');
      expect(html).not.toContain("data-mounted");
    }
  });

  it("/app's first-five-minutes precedence still wins ahead of the shell serve", async () => {
    const app = createWebApp(
      spaDeps({
        dataSource: {
          checkSession: async () => true,
          listProjects: async () => [
            { id: "p_show", slug: "the-showcase", title: "Showcase", showcase: true, state: { key: "draft", pill: "Draft", overlay: null, suggested: { action: "review", label: "Review" } } },
          ],
          getBillingBalance: async () => ({ spendableCredits: 200_000, suspended: false, clawbackDebt: 0 }),
          getShowcaseEntry: async () => ({
            showcase: { slug: "the-showcase", reviewRunId: "run_1", opened: false, archived: false },
            intent: {},
          }),
        } as unknown as DataSource,
      }),
    );
    const res = await app.request("/app");
    expect(res.status).toBe(302); // the server-owned redirect still runs BEFORE the shell serve
    expect(res.headers.get("location")).toBe("/p/the-showcase/review/run_1");
  });

  it("the Page family's forced-SSR posture holds on phone (REQ-ED-12 — the last request-path renderer decision)", async () => {
    const app = createWebApp(
      spaDeps({
        dataSource: {
          checkSession: async () => true,
          listProjects: async () => [
            { id: "p_1", slug: "acme", title: "Acme", state: { key: "draft", pill: "Draft", overlay: null, suggested: { action: "review", label: "Review" } } },
          ],
          getWhatChanged: async () => null, // the SSR path then answers the not-found document
        } as unknown as DataSource,
      }),
    );
    const res = await app.request("/p/acme/revisions/c_1", { headers: { "user-agent": "Mobi iPhone" } });
    const html = await res.text();
    expect(res.status).toBe(404);
    expect(html).toContain('data-renderer="ssr"'); // forced-SSR — never the shell on phone
    expect(html).toContain('data-route="/p/$project/revisions/$cid"');
    expect(html).not.toContain('data-renderer="spa"');
  });

  it("a missing Vite manifest still serves the shell (REQ-TL-7's log-and-serve posture)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      const emptyDir = mkdtempSync(join(tmpdir(), "rhema-spa-empty-"));
      const app = createWebApp(spaDeps({ spaAssetRoot: emptyDir }));
      const res = await app.request("/usage");
      expect(res.status).toBe(200); // no 500 — the shell degrades to a noscript-only document
      const html = await res.text();
      expect(html).toContain('data-renderer="spa"');
      expect(html).not.toContain('type="module"');
      expect(warn).toHaveBeenCalledOnce();
    } finally {
      warn.mockRestore();
    }
  });
});

describe("GET /assets/spa/* — the name-gated Vite static route (REQ-TL-4/5)", () => {
  it("serves a manifest file with content-type + immutable long-cache", async () => {
    const app = createWebApp(spaDeps({ spaAssetRoot: spaFixture() }));
    const res = await app.request("/assets/spa/assets/main-abc123.js");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/javascript; charset=utf-8");
    expect(res.headers.get("cache-control")).toContain("immutable");
    expect(await res.text()).toContain("entry");
  });

  it("serves nested chunk paths but refuses the .vite manifest dir outright", async () => {
    const app = createWebApp(spaDeps({ spaAssetRoot: spaFixture() }));
    expect((await app.request("/assets/spa/assets/chunks/shared-def456.js")).status).toBe(200);
    expect((await app.request("/assets/spa/.vite/manifest.json")).status).toBe(404); // dotdir — refused by the name gate
    expect((await app.request("/assets/spa/assets/main-abc123.js.map")).status).toBe(404); // hidden sourcemaps never serve
  });

  it("refuses traversal, unknown extensions, and missing files — always an empty 404", async () => {
    const app = createWebApp(spaDeps({ spaAssetRoot: spaFixture() }));
    expect((await app.request("/assets/spa/assets/../secret.js")).status).toBe(404);
    expect((await app.request("/assets/spa/assets/..%2fsecret.js")).status).toBe(404);
    expect((await app.request("/assets/spa/assets/nope.exe")).status).toBe(404);
    expect((await app.request("/assets/spa/assets/missing.js")).status).toBe(404);
    expect((await app.request("/assets/spa/secrets/main.js")).status).toBe(404); // outside assets/
    expect((await app.request("/assets/spa/anything")).status).toBe(404);
  });
});

describe("CSP on the shell (REQ-FW-3)", () => {
  it("the CSP middleware nonces every script incl. the module entry + the JSON embed; no unsafe-eval", async () => {
    const app = createWebApp(spaDeps({ spaAssetRoot: spaFixture() }));
    const res = await app.request("/usage");
    const csp = res.headers.get("content-security-policy") ?? "";
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("'nonce-");
    expect(csp).not.toContain("unsafe-eval");
    const html = await res.text();
    const scripts = html.match(/<script\b[^>]*>/g) ?? [];
    expect(scripts.length).toBeGreaterThanOrEqual(3); // theme boot + JSON embed + module entry
    for (const tag of scripts) expect(tag).toContain('nonce="');
  });
});
