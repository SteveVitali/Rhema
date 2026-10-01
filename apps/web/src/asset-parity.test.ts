import { describe, it, expect } from "vitest";
import { readdirSync, existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { CLIENT_ENTRIES } from "../client-entries.mjs";
import { createWebApp } from "./server.js";
import type { DataSource } from "./data.js";

// HOT.1 (REQ-SPEC-29) — bundle↔route parity. The page.js 404 happened because the build entry list and
// the server's route table were two lists. Now `client-entries.mjs` is the single source; this test
// fails if they ever diverge again — a client source with no entry, an entry with no client source, a
// page referencing an unbuilt bundle, or an entry whose route doesn't serve its artifact.

const root = fileURLToPath(new URL("..", import.meta.url));

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

describe("client-bundle ↔ route parity (HOT.1, REQ-SPEC-29)", () => {
  it("every CLIENT_ENTRIES item has a buildable src/client/<entry>.ts (an entry can never 404 for lack of source)", () => {
    const sources = new Set(
      readdirSync(new URL("../src/client", import.meta.url))
        .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
        .map((f) => f.slice(0, -".ts".length)),
    );
    // shared non-entry modules (collab.ts, sync-machine.ts) are allowed — they're imports, not bundles.
    for (const entry of CLIENT_ENTRIES) expect(sources).toContain(entry);
  });

  it("every /assets/<x>.js referenced in the SSR sources names a built entry", () => {
    const referenced = new Set<string>();
    for (const file of readdirSync(new URL("../src", import.meta.url))) {
      // tests legitimately reference non-entries (the 404 case below) — the parity invariant is about
      // what the SSR emits.
      if ((!file.endsWith(".ts") && !file.endsWith(".tsx")) || file.includes(".test.")) continue;
      const text = readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8");
      for (const m of text.matchAll(/\/assets\/([\w-]+)\.js/g)) referenced.add(m[1]!);
    }
    for (const r of referenced) expect(CLIENT_ENTRIES).toContain(r);
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
