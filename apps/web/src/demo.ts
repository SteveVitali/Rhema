// R7DEM.4 (REQ-DWEB-2/4/5/6/10/17; ADR-126) — the demo guard + the nested JSON app's wiring.
// Registered inside `createWebApp` right after the middleware block, before `/session` and every
// `/p`/`/bff` handler (R3 §3 S1), as a single `app.use("*")` so every demo path is claimed before
// any authed route can see it.
//
// The rules, in order:
//   1. non-GET/HEAD on a demo path           → 405 `{error:"demo_read_only"}` (JSON, or the
//      terminal SSR notice for a form poster) — zero DataSource calls of either kind;
//   2. an unregistered `demo~` slug, or a GET outside `DEMO_ROUTE_IDS` → a terminal 404
//      document / JSON 404 — never the shell, never a DataSource;
//   3. document GETs (`/demo/<essay>/…`, `/p/demo~<essay>/…`) → the OUTER app's
//      `spaShellDocument` with the demo boot (single CSP nonce — REQ-DWEB-8);
//   4. twin GETs (`/bff/p/demo~*/…`) → forwarded to the nested
//      `createWebApp({demo:true})` with the request's `cookie`/`authorization` headers stripped;
//      `set-cookie` is deleted on the way back and the response is stamped `public` + ETag
//      (S-13) so the authed `no-store` floor is overridden and the bodies are cookie-invariant.
//
// RV-35 — this module sits OUTSIDE `check:no-cookies`' TARGETS: the guard's header-handling
// literals live here, so the cookie strip/stamp needs no `never-cookies exempt` annotation.

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Context, Hono } from "hono";
import { ApiError } from "@rhema/api-client";
import {
  DEMO_DOCUMENT_ROUTE_IDS,
  DEMO_SLUG_PREFIX,
  demoEssayFor,
  demoEssayForSlug,
  isDemoSlugPrefix,
  spaRouteFor,
} from "@rhema/contracts";
import { renderDocument } from "./render.js";
import { demoReadOnlyElement, notFoundElement } from "./routes.js";
import { demoHubDocument } from "./demo-page.js";
import { feedLabelMaps } from "./feed-labels.js";
import { spaShellDocument } from "./spa-shell.js";
import { wantsJson } from "./bff.js";
import { createWebApp, type WebDeps } from "./server.js";
import { DemoError, demoDataSource, demoHubCards, demoSessionFor, defaultDemoCorpusRoot } from "./demo-data.js";
import type { SessionHeaders } from "./data.js";

/** The twin cache posture (S-13): browser TTL short, CDN TTL long; the `?b=<sha>` the boot
 *  carries makes cross-deploy staleness impossible. */
const TWIN_CACHE = "public, max-age=300, s-maxage=86400";
/** The asset route's immutable cache (REQ-DWEB-17). */
const ASSET_CACHE = "public, max-age=31536000, immutable";
/** The demo shell's posture — a per-request CSP nonce must never freeze at the edge. */
const SHELL_CACHE = "no-cache";
/** The only content types the asset route may emit (REQ-DWEB-17 allowlist). */
const ASSET_TYPES: Readonly<Record<string, string>> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

interface DemoPath {
  /** the registered essay row is absent ⇒ the 404 arm (an unregistered `demo~` string). */
  readonly registered: boolean;
  readonly essay: string;
  readonly slug: string;
  /** `/demo` exactly — the hub frame. */
  readonly hub?: boolean;
  /** the request arrived on `/bff/p/…` — answers are JSON and forwards are to the nested app. */
  readonly bff?: boolean;
  /** the allowlisted routeId the path resolves to (null ⇒ terminal 404). */
  readonly routeId: string | null;
}

/** Path → the demo claim, or null when the path is not the guard's business. */
function demoPathFor(pathname: string): DemoPath | null {
  const path = pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
  if (path === "/demo") {
    return { registered: true, essay: "", slug: "", hub: true, routeId: "/demo" };
  }
  // `/demo/<essay>/…` — the public alias: internally `/p/demo~<essay>/…` (S-1's server arm).
  if (path === "/demo" || path.startsWith("/demo/")) {
    const rest = path.slice("/demo/".length);
    const cut = rest.indexOf("/");
    const essay = cut < 0 ? rest : rest.slice(0, cut);
    const tail = cut < 0 ? "" : rest.slice(cut);
    const slug = `${DEMO_SLUG_PREFIX}${essay}`;
    const registered = demoEssayForSlug(slug) != null;
    return {
      registered,
      essay,
      slug,
      routeId: registered ? routeIdFor(`/p/${slug}${tail}`) : null,
    };
  }
  // `/bff/p/demo~<slug>/…` — a JSON twin path.
  const bff = /^\/bff\/p\/([^/]+)(\/.*)?$/.exec(path);
  if (bff) {
    const slug = bff[1]!;
    if (!isDemoSlugPrefix(slug)) return null;
    const registered = demoEssayForSlug(slug) != null;
    return {
      registered,
      essay: slug.slice(DEMO_SLUG_PREFIX.length),
      slug,
      bff: true,
      routeId: registered ? routeIdFor(`/p/${slug}${bff[2] ?? ""}`) : null,
    };
  }
  // `/p/demo~<slug>/…` — the internal namespace (document or endpoint).
  const p = /^\/p\/([^/]+)(\/.*)?$/.exec(path);
  if (p) {
    const slug = p[1]!;
    if (!isDemoSlugPrefix(slug)) return null;
    const registered = demoEssayForSlug(slug) != null;
    return {
      registered,
      essay: slug.slice(DEMO_SLUG_PREFIX.length),
      slug,
      routeId: registered ? routeIdFor(path) : null,
    };
  }
  return null;
}

function routeIdFor(mapped: string): string | null {
  return spaRouteFor(mapped).routeId;
}

function allowed(routeId: string | null): boolean {
  return routeId != null && (DEMO_DOCUMENT_ROUTE_IDS as readonly string[]).includes(routeId);
}

const terminal404 = (c: Context, json: boolean): Response =>
  json
    ? c.json({ error: "not_found" }, 404)
    : c.html(renderDocument(c.req.path, notFoundElement), 404);

/**
 * Mount the demo surface on the OUTER app. `deps.demoCorpusRoot` pins the data dir (tests pass
 * the committed synthetic fixture); unset ⇒ `defaultDemoCorpusRoot()` resolves the installed
 * `@rhema/demo-corpus` package. An unresolvable root leaves the guard registered but the twins
 * 404 — fail closed, never a silent empty.
 */
export function mountDemo(app: Hono, deps: WebDeps): void {
  const corpusRoot = deps.demoCorpusRoot ?? defaultDemoCorpusRoot();

  // The nested JSON app (S-2): the shared compositions verbatim over `demoDataSource`. Built
  // lazily on the first demo request so the throwaway-DataSource test apps never pay for it.
  let nested: Hono | null = null;
  const nestedApp = (): Hono => {
    if (nested == null) {
      const source = demoDataSource(corpusRoot ?? "");
      // DemoError → ApiError at the seam so the shared compositions' `instanceof ApiError &&
      // status === 404` arms work verbatim (demo-data.ts stays api-client-free).
      const adapted = new Proxy(source, {
        get(t, prop, receiver) {
          const v = Reflect.get(t, prop, receiver);
          if (typeof v !== "function") return v;
          return (...args: unknown[]) => {
            try {
              // R7DEM.5 (REQ-DWEB-7/DWEB-3) — the recording proxy's DataSource reach: only
              // IMPLEMENTED methods count as "reached" (a call that hits the throwing seam is
              // the surface degrading gracefully, not a read the demo serves). The walk's
              // reach report is then exactly `demoDataSource`'s working set — an implemented
              // method it never invokes leaves the Pick (DWEB-3's amended contract).
              if (prop in t) deps.demoDataSourceTrace?.(String(prop));
              const out = (v as (...a: unknown[]) => unknown)(...args);
              if (out instanceof Promise) {
                return out.catch((e) => {
                  throw e instanceof DemoError ? new ApiError(e.status, e.code, e.message) : e;
                });
              }
              return out;
            } catch (e) {
              throw e instanceof DemoError ? new ApiError(e.status, e.code, e.message) : e;
            }
          };
        },
      });
      nested = createWebApp({
        dataSource: adapted,
        // The constant demo session + the request-scoped essay hint for the one slug-less seam.
        session: (c: Context): SessionHeaders => {
          const slug = c.req.param("slug") ?? c.req.param("project") ?? "";
          return demoSessionFor(
            slug.startsWith(DEMO_SLUG_PREFIX) ? slug.slice(DEMO_SLUG_PREFIX.length) : "",
          );
        },
        collabWsUrl: undefined,
        demo: true,
        ...(deps.buildGitSha ? { buildGitSha: deps.buildGitSha } : {}),
        ...(deps.spaAssetRoot ? { spaAssetRoot: deps.spaAssetRoot } : {}),
        ...(deps.gcpProject ? { gcpProject: deps.gcpProject } : {}),
      });
    }
    return nested;
  };

  /** The demo shell — outer app, one CSP nonce, `no-cache`, the demo boot. */
  const demoShell = async (c: Context, essay: string): Promise<Response> => {
    const row = demoEssayFor(essay)!;
    const res = await spaShellDocument(c, deps, {}, {
      readOnlyProject: { reason: "demo" },
      demo: {
        essay,
        slug: row.slug,
        signedIn: deps.session(c) != null,
        build: deps.buildGitSha ?? null,
      },
    });
    res.headers.set("cache-control", SHELL_CACHE);
    return res;
  };

  /** The twin forward: strip the viewer's headers, drop `set-cookie`, stamp public + ETag. */
  const forward = async (c: Context): Promise<Response> => {
    const head = new Headers(c.req.raw.headers);
    head.delete("cookie");
    head.delete("authorization");
    const res = await nestedApp().fetch(
      new Request(c.req.raw.url, { method: "GET", headers: head }),
    );
    const body = await res.arrayBuffer();
    const headers = new Headers(res.headers);
    headers.delete("set-cookie");
    headers.set("cache-control", TWIN_CACHE);
    const digest = createHash("sha256").update(Buffer.from(body)).digest("hex").slice(0, 24);
    headers.set("etag", `"demo-${deps.buildGitSha ?? "local"}-${digest}"`);
    return new Response(c.req.method === "HEAD" ? null : body, {
      status: res.status,
      statusText: res.statusText,
      headers,
    });
  };

  // ---- the guard (before /session and every /p + /bff handler) ----------------------------
  app.use("*", async (c, next) => {
    const demo = demoPathFor(c.req.path);
    if (demo == null) return next();
    const json = demo.bff === true || wantsJson(c);
    if (c.req.method !== "GET" && c.req.method !== "HEAD") {
      c.res = json
        ? c.json({ error: "demo_read_only" }, 405)
        : c.html(renderDocument(c.req.path, demoReadOnlyElement), 405);
      return;
    }
    if (!demo.registered) {
      c.res = terminal404(c, json);
      return;
    }
    if (demo.hub === true) {
      // 221a (REQ-TOUR-1) — the filled hub: card facts read off the snapshots before render.
      // An unresolvable root serves the honest empty set (the same fail-closed posture as the
      // twins' 404) — the frame + provenance still render, never a fabricated card.
      const cards = corpusRoot == null ? [] : await demoHubCards(corpusRoot);
      c.res = c.html(renderDocument(c.req.path, demoHubDocument(cards)));
      return;
    }
    if (!allowed(demo.routeId)) {
      c.res = terminal404(c, json);
      return;
    }
    if (demo.bff === true) {
      c.res = await forward(c);
      return;
    }
    c.res = await demoShell(c, demo.essay);
  });

  // ---- public demo endpoints ------------------------------------------------------------
  // REQ-DWEB-5 — the SPA's demo feed-labels read (220a's boot fix): the same server-owned maps
  // `/bff/feed-labels` gates behind a session, public here because COPY is not tenant data.
  app.get("/bff/demo/feed-labels", (c) => {
    c.header("cache-control", TWIN_CACHE);
    return c.json(feedLabelMaps());
  });

  // REQ-DWEB-17 — the immutable asset route. It serves only the corpus index's `image`-kind
  // artifacts (the PROVENANCE-admitted set), never a traversal and never another media type.
  app.get("/bff/demo/asset/:essay/*", async (c) => {
    const essay = c.req.param("essay") ?? "";
    if (corpusRoot == null || demoEssayFor(essay) == null) {
      return c.json({ error: "not_found" }, 404);
    }
    const file = c.req.path.slice(`/bff/demo/asset/${essay}/`.length);
    const normalized = file.replaceAll("\\", "/");
    const parts = normalized.split("/");
    const name = parts[parts.length - 1]!;
    const ext = name.slice(name.lastIndexOf("."));
    if (
      file !== normalized ||
      parts.some((p) => p === "" || p === "." || p === "..") ||
      ASSET_TYPES[ext] == null
    ) {
      return c.json({ error: "not_found" }, 404);
    }
    // The allowlist is the essay's own artifact index — every `kind:"image"` entry is a
    // PROVENANCE-admitted file; anything else (markdown, `_rules`, dot paths) 404s.
    const index = await readFile(join(corpusRoot, "corpus", essay, "index.json"), "utf8")
      .then((t) => JSON.parse(t) as { artifacts?: { path?: string; kind?: string }[] })
      .catch(() => null);
    const admitted = (index?.artifacts ?? []).some(
      (a) => a.kind === "image" && a.path === normalized,
    );
    if (!admitted) return c.json({ error: "not_found" }, 404);
    const bytes = await readFile(join(corpusRoot, "corpus", essay, normalized)).catch(() => null);
    if (bytes == null) return c.json({ error: "not_found" }, 404);
    return c.body(new Uint8Array(bytes), 200, {
      "content-type": ASSET_TYPES[ext]!,
      "cache-control": ASSET_CACHE,
    });
  });
}
