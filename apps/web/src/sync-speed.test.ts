// R7SYNC.1 — the source/shell legs of the ticket's Stage-A verification (REQ-SPEED-1…4,
// REQ-SYNC-5). The DOM mounts live in spa/sync-speed.dom.test.tsx; these are the node-env
// halves: the beforeLoad request pin, the static frame + font preloads, the PREFETCH_SAFE
// contract, the scoped-invalidation grep, and the estimator-literal grep.

import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { prefetchQueryForHref, PREFETCH_SAFE, PREFETCH_EXCLUDED } from "./spa/queries.js";
import { renderSpaShell, type SpaBootPayload } from "./spa-shell.js";
import type { Context } from "hono";

const SPA = join(process.cwd(), "apps/web/src/spa");
const SRC = join(process.cwd(), "apps/web/src");

describe("REQ-SPEED-1 — no serial handoff POST before the loader", () => {
  it("beforeLoad issues no request; the loader fires POST + GET concurrently", () => {
    const src = readFileSync(join(SPA, "routes/_authenticated/p.$project.index.tsx"), "utf8");
    const codeStart = src.indexOf("export const Route");
    const beforeLoadBody = src.slice(src.indexOf("beforeLoad:", codeStart), src.indexOf("loader:"));
    expect(beforeLoadBody).not.toContain("postProjectHandoff");
    expect(beforeLoadBody).not.toContain("await");
    const loaderBody = src.slice(src.indexOf("loader:"));
    expect(loaderBody.indexOf("postProjectHandoff")).toBeLessThan(
      loaderBody.indexOf("await context.queryClient.ensureQueryData"),
    );
  });
});

describe("REQ-SPEED-2/4 — the static frame + font preloads in the served shell", () => {
  it("the first bytes paint data-shell-frame + skeleton rows + the two font preloads + noscript", () => {
    const ctx = { req: { url: "http://app.test/p/acme" } } as unknown as Context;
    const boot: SpaBootPayload = {
      principal: null,
      theme: {},
      deviceClass: "desktop",
      surfaces: {},
    };
    const html = renderSpaShell(ctx, {
      path: "/p/acme",
      boot,
      entry: { moduleScripts: [], preloads: [], stylesheets: [] },
    });
    const rootIx = html.indexOf('id="spa-root"');
    expect(html.slice(rootIx)).toContain("data-shell-frame");
    expect(html.slice(rootIx)).toContain("ide-sk-row");
    expect(html).toContain('rel="preload" as="font"');
    expect(html).toContain("literata-latin-standard-normal.woff2");
    expect(html).toContain("inter-latin-wght-normal.woff2");
    expect(html).toContain("<noscript");
  });

  it("the SSR document head carries the same two preloads (source pin)", () => {
    const src = readFileSync(join(SRC, "render.tsx"), "utf8");
    expect(src).toContain('f.family === "Literata" && f.style === "normal"');
    expect(src).toContain('f.family === "Inter"');
    expect(src).toContain('rel="preload" as="font"');
  });
});

describe("REQ-SPEED-3 — PREFETCH_SAFE: hover/focus prefetch for side-effect-free twins only", () => {
  it("the named side-effecting twins stay OUT; safe hrefs resolve, excluded resolve null", () => {
    for (const excluded of PREFETCH_EXCLUDED) {
      expect(PREFETCH_SAFE).not.toContain(excluded);
    }
    expect(prefetchQueryForHref("/p/acme/v/3")).not.toBeNull();
    expect(prefetchQueryForHref("/p/acme/v/2/diff/3")).not.toBeNull();
    expect(prefetchQueryForHref("/p/acme/export")).not.toBeNull();
    expect(prefetchQueryForHref("/p/acme")).not.toBeNull();
    expect(prefetchQueryForHref("/p/acme/run")).toBeNull();
    expect(prefetchQueryForHref("/p/acme/r/run9")).toBeNull();
    expect(prefetchQueryForHref("/p/acme/review/run9")).toBeNull();
    expect(prefetchQueryForHref("/app/new")).toBeNull();
  });

  it("demo boots resolve ONLY demo-slug twins — never a real-slug or session-gated read", () => {
    const demo = { demoSlug: "demo~essay" };
    expect(prefetchQueryForHref("/p/real-slug/v/1", demo)).toBeNull();
    expect(prefetchQueryForHref("/p/real-slug", demo)).toBeNull();
    expect(prefetchQueryForHref("/app", demo)).toBeNull();
    expect(prefetchQueryForHref("/app/inbox", demo)).toBeNull();
    expect(prefetchQueryForHref("/p/demo~essay/v/1", demo)).not.toBeNull();
  });

  it("no bare ['bff'] invalidation survives in the SPA sources — writes invalidate scoped keys", () => {
    const hits: string[] = [];
    const walk = (dir: string): void => {
      for (const f of readdirSync(dir)) {
        const p = join(dir, f);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.tsx?$/.test(p) && !p.endsWith(".test.ts") && !p.endsWith(".test.tsx")) {
          if (/invalidateQueries\(\{\s*queryKey:\s*\["bff"\]\s*\}\)/.test(readFileSync(p, "utf8"))) hits.push(p);
        }
      }
    };
    walk(SPA);
    expect(hits).toEqual([]);
  });
});

describe("REQ-SYNC-5 — every duration/cost claim flows the shared estimator", () => {
  it("no hand-typed '~N–M min' or 'N cr' literal exists in SPA sources", () => {
    const hits: string[] = [];
    const walk = (dir: string): void => {
      for (const f of readdirSync(dir)) {
        const p = join(dir, f);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.tsx?$/.test(p) && !p.endsWith(".test.ts") && !p.endsWith(".test.tsx")) {
          const src = readFileSync(p, "utf8");
          for (const m of src.matchAll(/~\s*\d+\s*[–-]\s*\d+\s*min|\b\d[\d,]*\s*cr\b/g)) {
            hits.push(`${p.slice(SPA.length)}: ${m[0]}`);
          }
        }
      }
    };
    walk(SPA);
    expect(hits).toEqual([]);
  });

  it("the Run hints + settings protocol cards ride server-composed estimator figures", () => {
    const server = readFileSync(join(SRC, "server.ts"), "utf8");
    expect(server).toContain("row.estimates");
    expect(server).toContain("listProtocolCards");
    const q = readFileSync(join(SPA, "queries.ts"), "utf8");
    expect(q).toContain("runHints");
    expect(q).toContain("protocolCards");
  });
});

describe("REQ-SPEED-5 — the timing leg (recorded, not gated)", () => {
  it("the leg file declares all three metrics, N>=20 samples, and no gating flag", () => {
    const src = readFileSync(join(process.cwd(), "packages/journeys/src/speed-leg.ts"), "utf8");
    expect(src).toContain("warmOpenP75Ms");
    expect(src).toContain("hardOpenP75Ms");
    expect(src).toContain("pendingMs");
    expect(src).toMatch(/SAMPLES\s*=\s*20/);
    expect(src).toContain("gated: false");
  });
});
