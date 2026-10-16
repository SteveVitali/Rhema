import { describe, it, expect } from "vitest";
import {
  readdirSync,
  existsSync,
  readFileSync,
  mkdtempSync,
  mkdirSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { CLIENT_ENTRIES } from "../client-entries.mjs";
import { createWebApp } from "./server.js";
import type { DataSource } from "./data.js";

// HOT.1 (REQ-SPEC-29) — bundle↔route parity. The page.js 404 happened because the build entry list and
// the server's route table were two lists. Now `client-entries.mjs` is the single source; this test
// fails if they ever diverge again — a client source with no entry, an entry with no client source, a
// page referencing an unbuilt bundle, or an entry whose route doesn't serve its artifact.
//
// SPA.26 (REQ-TL-13/REQ-TST-8) — the parity contract retargets to the two asset pipelines:
//   • the esbuild islands — CLIENT_ENTRIES is now the SURVIVING SSR set (`landing` public; `page` +
//     `ide` mounted forever by the REQ-ED-12 phone/showcase branch + the `?ssr=1` fallback — ADR-107);
//     the retired islands (`outline` here, `editor` at SPA.24) must be absent from entries, from every
//     emitted reference, and from the asset routes.
//   • the Vite SPA bundle — every manifest artifact (`file`/`imports`/`css`) answers its
//     `/assets/spa/…` URL with the right content-type, and every `/assets/spa/` URL the shell
//     document emits resolves (the HOT.1 built⇒served invariant extended to the SPA).

const root = fileURLToPath(new URL("..", import.meta.url));

/** Island names whose bundles + mounts retired — a re-emitted reference or a resurrected route fails. */
const RETIRED_ENTRIES = ["outline", "editor"] as const;

const stubDataSource: DataSource = {
  checkSession: async () => false,
  listProjects: async () => [],
  getDossier: async () => { throw new Error("unused"); },
  checkInvite: async () => ({ ok: false, reason: "unknown" }),
  signup: async () => ({ ok: false, status: 403, error: "invite_required" }),
  previewImport: async () => { throw new Error("unused"); },
  createImport: async () => ({ draftId: "d" }),
  createRun: async () => ({ runId: "r", state: "queued", deduped: false }),
  getBillingBalance: async () => ({ spendableCredits: 0, suspended: false, clawbackDebt: 0 }),
  recordExhaustedPrompt: async () => undefined,
};

/** All non-test source files under `src/` (recursive — the scan must cover `src/spa/**` too). */
function* srcFiles(dir: string): Generator<string> {
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, name.name);
    if (name.isDirectory()) {
      if (name.name === "node_modules" || name.name.startsWith(".")) continue;
      yield* srcFiles(p);
    } else if (/\.(ts|tsx)$/.test(name.name) && !name.name.includes(".test.")) {
      yield p;
    }
  }
}

/** `/assets/<name>.js` single-segment references across the emitters (island tags only —
 *  `/assets/spa/…` paths are the manifest leg below and never match `[\w-]+\.js`). */
function referencedIslandAssets(): Set<string> {
  const referenced = new Set<string>();
  for (const file of srcFiles(join(root, "src"))) {
    const text = readFileSync(file, "utf8");
    for (const m of text.matchAll(/\/assets\/([\w-]+)\.js/g)) referenced.add(m[1]!);
  }
  return referenced;
}

/** A tmpdir shaped like `public/spa/`: `.vite/manifest.json` + entry/import/dynamic chunks + css. */
function spaFixture(): string {
  const dir = mkdtempSync(join(tmpdir(), "rhema-spa-parity-"));
  mkdirSync(join(dir, ".vite"));
  mkdirSync(join(dir, "assets", "chunks"), { recursive: true });
  writeFileSync(join(dir, "assets", "main-abc123.js"), "console.log('entry');\n");
  writeFileSync(join(dir, "assets", "main-abc123.js.map"), "{}\n"); // hidden sourcemap — never served
  writeFileSync(join(dir, "assets", "chunks", "shared-def456.js"), "console.log('dep');\n");
  writeFileSync(join(dir, "assets", "chunks", "lazy-ghi789.js"), "console.log('lazy');\n");
  writeFileSync(join(dir, "assets", "app-jkl012.css"), "body{}\n");
  writeFileSync(
    join(dir, ".vite", "manifest.json"),
    JSON.stringify({
      "src/spa/main.tsx": {
        file: "assets/main-abc123.js",
        isEntry: true,
        imports: ["_shared"],
        css: ["assets/app-jkl012.css"],
      },
      _shared: { file: "assets/chunks/shared-def456.js" },
      "src/spa/routes/lazy.tsx": {
        file: "assets/chunks/lazy-ghi789.js",
        isDynamicEntry: true,
      },
    }),
  );
  return dir;
}

const SPA_SESSION = { cookie: "__Host-rhema.session_token=tok.sig" };

function spaDeps(spaAssetRoot: string): Parameters<typeof createWebApp>[0] {
  return {
    dataSource: {
      ...stubDataSource,
      checkSession: async () => true,
      getSessionPrincipal: async () => ({ userId: "u_1", workspaceId: "w_1", billingAccountId: "ba_1" }),
      getTheme: async () => ({ appTheme: "light" as const }),
    },
    session: () => SPA_SESSION,
    spa: () => true,
    spaAssetRoot,
  };
}

describe("client-bundle ↔ route parity (HOT.1, REQ-SPEC-29)", () => {
  it("every CLIENT_ENTRIES item has a buildable src/client/<entry>.ts (an entry can never 404 for lack of source)", () => {
    const sources = new Set(
      readdirSync(new URL("../src/client", import.meta.url))
        .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
        .map((f) => f.slice(0, -".ts".length)),
    );
    // shared non-entry modules (collab.ts, hold-store.ts) are allowed — they're imports, not bundles.
    for (const entry of CLIENT_ENTRIES) expect(sources).toContain(entry);
  });

  it("every /assets/<x>.js referenced in the emitted sources names a built entry", () => {
    for (const r of referencedIslandAssets()) expect(CLIENT_ENTRIES).toContain(r);
  });

  it("SPA.26 — the retired islands are out of the entries, out of every reference, and off the routes", async () => {
    for (const retired of RETIRED_ENTRIES) {
      expect(CLIENT_ENTRIES, `${retired} resurrected in CLIENT_ENTRIES`).not.toContain(retired);
      expect(
        referencedIslandAssets().has(retired),
        `${retired}.js referenced again — the mount tag came back`,
      ).toBe(false);
    }
    const app = createWebApp({ dataSource: stubDataSource, session: () => null });
    for (const retired of RETIRED_ENTRIES) {
      const res = await app.request(`/assets/${retired}.js`);
      // the asset route serves ONLY listed entries — a stale artifact on disk can't resurrect the
      // bundle; the request falls through to the catch-all's 404.
      expect(res.status, `/assets/${retired}.js must 404`).toBe(404);
    }
  });

  it("every entry answers /assets/<entry>.js — 200 JS when built, an empty 404 only when the artifact is absent", async () => {
    const app = createWebApp({ dataSource: stubDataSource, session: () => null });
    for (const entry of CLIENT_ENTRIES) {
      const built = existsSync(`${root}public/${entry}.js`);
      const res = await app.request(`/assets/${entry}.js`);
      if (built) {
        expect(res.status, `/assets/${entry}.js must serve its built artifact`).toBe(200);
        expect(res.headers.get("content-type")).toContain("text/javascript");
      } else {
        // generated artifacts are gitignored; the route must still exist (a plain empty 404, never the
        // catch-all's HTML — a silent 404 is the bug this pack fixes).
        expect(res.status).toBe(404);
        expect(await res.text()).toBe("");
      }
    }
  });

  it("an unknown /assets/*.js name 404s (no open-ended file serving)", async () => {
    const app = createWebApp({ dataSource: stubDataSource, session: () => null });
    const res = await app.request("/assets/not-an-entry.js");
    expect(res.status).toBe(404);
  });
});

describe("SPA manifest ↔ /assets/spa/** parity (SPA.26 — REQ-TL-13, REQ-TST-8)", () => {
  it("every manifest artifact (entry, imports, dynamic chunks, css) answers its /assets/spa URL", async () => {
    const spaRoot = spaFixture();
    const app = createWebApp(spaDeps(spaRoot));
    const manifest = JSON.parse(
      readFileSync(join(spaRoot, ".vite", "manifest.json"), "utf8"),
    ) as Record<string, { file?: string; css?: string[] }>;
    const artifacts = new Set<string>();
    for (const chunk of Object.values(manifest)) {
      if (typeof chunk.file === "string") artifacts.add(chunk.file);
      for (const f of chunk.css ?? []) artifacts.add(f);
    }
    expect(artifacts.size).toBeGreaterThan(0);
    for (const rel of artifacts) {
      const res = await app.request(`/assets/spa/${rel}`);
      expect(res.status, `/assets/spa/${rel} must serve its manifest artifact`).toBe(200);
      const ct = res.headers.get("content-type") ?? "";
      if (rel.endsWith(".js")) expect(ct, rel).toContain("text/javascript");
      if (rel.endsWith(".css")) expect(ct, rel).toContain("text/css");
    }
  });

  it("every /assets/spa URL the shell document emits resolves (REQ-TST-8 — shell tags never 404)", async () => {
    const spaRoot = spaFixture();
    const app = createWebApp(spaDeps(spaRoot));
    // a flagged auth'd GET serves the shell — its module script/modulepreload/stylesheet tags are
    // exactly the manifest-resolved set.
    const doc = await app.request("/p/acme/run");
    const html = await doc.text();
    expect(html).toContain('data-renderer="spa"');
    const refs = new Set(
      [...html.matchAll(/\/assets\/spa\/([\w./-]+)/g)].map((m) => m[1]!),
    );
    expect(refs.size).toBeGreaterThan(0);
    for (const rel of refs) {
      const res = await app.request(`/assets/spa/${rel}`);
      expect(res.status, `shell-referenced /assets/spa/${rel}`).toBe(200);
    }
  });

  it("refused shapes never serve — sourcemaps, non-assets/ paths, dot-segments", async () => {
    const spaRoot = spaFixture();
    const app = createWebApp(spaDeps(spaRoot));
    for (const bad of [
      "assets/main-abc123.js.map", // Vite's hidden sourcemap output
      ".vite/manifest.json", // the manifest itself is not an asset
      "manifest.json", // no `assets/` first segment
      "assets/../main-abc123.js", // a `..` segment — the name gate refuses dotdirs
      "assets/missing.js", // absent artifact
    ]) {
      const res = await app.request(`/assets/spa/${bad}`);
      expect(res.status, `/assets/spa/${bad}`).toBe(404);
    }
  });
});
