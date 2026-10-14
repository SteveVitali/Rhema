import { mkdtempSync } from "node:fs";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { Browser, Page } from "playwright";
import { JourneySessions, assertTestIdentity, freshIdentity, stableIdentity } from "./session.js";
import { journeyNonce, testIdentity, marker } from "./nonce.js";
import { provenanceMatch } from "./provenance.js";

// JOURNEY.1 — the session guard + identity shapes + provenance compare (deterministic halves).

describe("assertTestIdentity — the session-minting guard", () => {
  it("accepts the base and plus-tag forms only", () => {
    expect(() => assertTestIdentity("test@rhema.tools")).not.toThrow();
    expect(() => assertTestIdentity("test+jrn-a@rhema.tools")).not.toThrow();
    expect(() => assertTestIdentity("test+j1nv@rhema.tools")).not.toThrow();
  });
  it("refuses every real/lookalike address — the harness cannot mint real-user sessions", () => {
    for (const bad of [
      "steve@rhema.tools",
      "test@evil.tools",
      "test@rhema.tools.evil",
      "tesseract@rhema.tools",
      "attacker+test@rhema.tools.evil",
      "",
      "not-an-email",
    ]) {
      expect(() => assertTestIdentity(bad), bad).toThrow(/test identities/);
    }
  });
});

describe("identity + nonce shapes", () => {
  it("freshIdentity is nonce-namespaced and unique per run", () => {
    const n1 = journeyNonce();
    const n2 = journeyNonce();
    expect(n1).not.toBe(n2);
    expect(freshIdentity(n1, "nv")).toBe(`test+j${n1}nv@rhema.tools`);
    expect(freshIdentity(n1, "nv")).not.toBe(freshIdentity(n2, "nv"));
  });
  it("stableIdentity is cache-stable across runs", () => {
    expect(stableIdentity("a")).toBe("test+jrn-a@rhema.tools");
    expect(stableIdentity("a")).toBe(stableIdentity("a"));
  });
  it("testIdentity + marker namespace artifacts", () => {
    expect(testIdentity("abc123", "tA")).toBe("test+jabc123ta@rhema.tools");
    expect(marker("deadbeef", "proj")).toBe("JRN-DEADBEEF-PROJ");
  });
});

// SPA.6 — the session-context leg-A contract: extraHTTPHeaders ride every session context AND
// onPage fires BEFORE the page's first navigation (a cached mint's /app probe is renderer-checked).
describe("JourneySessions — pin + wiring order (REQ-SEQ-4, REQ-VFY-7)", () => {
  it("a cached sign-in carries the renderer pin and wires the page before its first goto", async () => {
    const stateDir = mkdtempSync(path.join(tmpdir(), "jrns-"));
    const email = stableIdentity("a");
    writeFileSync(path.join(stateDir, `${email.replace(/[^a-z0-9]/g, "_")}.json`), "{}");
    const order: string[] = [];
    const ctxOpts: Record<string, unknown>[] = [];
    const page = {
      url: () => "https://app.test/app",
      goto: async () => {
        order.push("goto");
        return { status: () => 200 };
      },
      waitForLoadState: async () => undefined,
    } as unknown as Page;
    const context = {
      newPage: async () => {
        order.push("newPage");
        return page;
      },
      storageState: async () => undefined,
      close: async () => undefined,
      cookies: async () => [{ name: "rhema-dev.session_token" }],
    };
    const browser = {
      newContext: async (o?: Record<string, unknown>) => {
        ctxOpts.push(o ?? {});
        return context;
      },
    } as unknown as Browser;
    const sessions = new JourneySessions({
      browser,
      mailbox: {} as never,
      webBaseUrl: "https://app.test",
      stateDir,
      extraHTTPHeaders: { "x-rhema-renderer": "ssr" },
      onPage: () => order.push("onPage"),
    });
    const s = await sessions.signIn(email, { useCache: true });
    expect(s.via).toBe("cache");
    // the pin is on the context; the wiring precedes the probe's first navigation.
    expect(ctxOpts[0]).toMatchObject({ extraHTTPHeaders: { "x-rhema-renderer": "ssr" } });
    expect(order).toEqual(["newPage", "onPage", "goto"]);
  });
});

describe("provenanceMatch — the deploy-provenance compare", () => {
  it("matches full and short SHAs in either direction", () => {
    const full = "e6c91039e66ac3c42e97b6a8ce67150516a67ddf";
    expect(provenanceMatch(full, { web: full, api: full })).toBe(true);
    expect(provenanceMatch("e6c9103", { web: full })).toBe(true);
    expect(provenanceMatch(full, { web: "e6c9103" })).toBe(true);
  });
  it("fails closed on absent/unknown/mismatched SHAs", () => {
    const full = "e6c91039e66ac3c42e97b6a8ce67150516a67ddf";
    expect(provenanceMatch(full, { web: null })).toBe(false);
    expect(provenanceMatch(full, { web: "unknown" })).toBe(false);
    expect(provenanceMatch(full, { web: full, api: "deadbeef" + full.slice(8) })).toBe(false);
    expect(provenanceMatch("", { web: full })).toBe(false);
  });
});
