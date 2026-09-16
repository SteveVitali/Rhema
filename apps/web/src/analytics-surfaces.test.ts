import { describe, it, expect, vi } from "vitest";
import type { UsageDto } from "@rhema/api-client";
import { createWebApp, type WebDeps } from "./server.js";
import type { DataSource } from "./data.js";

// PRB.12 — the beta's instrumentation surfaces (REQ-BETA-6/10/14; REQ-PROD-15):
//  • GET /settings renders the analytics toggle bound to analytics_opt_out; POST /settings/privacy
//    flips it (the checkbox posts "on" when sharing is ON — the flag is the inverse).
//  • GET /usage renders the §14.5 level-1 glance (balance + recent runs' spend) and carries the
//    dwell heartbeat script.
//  • POST /a/dwell is the beacon's sink — {surface, ms} wraps into the whitelisted surface.dwell
//    mint; a malformed body is a quiet 204, an anonymous post a 401.
//  • GET /app carries the §14.5 level-0 balance chip (spendable + held in the tooltip).

const USAGE: UsageDto = {
  spendableCredits: 1200,
  heldCredits: 140,
  runs: [
    {
      runId: "run_1",
      projectId: "proj_1",
      workflow: "chapter_review",
      state: "done",
      estimateCredits: 400,
      capCredits: 600,
      spentCredits: 517,
      createdAt: "2026-09-20T12:00:00Z",
      endedAt: "2026-09-20T12:04:00Z",
    },
  ],
};

function makeDeps(over: Partial<WebDeps> = {}, dsOver: Partial<DataSource> = {}): WebDeps {
  return {
    dataSource: {
      listProjects: async () => [],
      checkInvite: async () => ({ ok: true }),
      getPrivacySettings: async () => ({ analyticsOptOut: false }),
      setAnalyticsOptOut: async () => undefined,
      getUsage: async () => USAGE,
      getBillingBalance: async () => ({ spendableCredits: 1200, heldCredits: 140, suspended: false, clawbackDebt: 0 }),
      postAnalyticsEvent: async () => undefined,
      ...dsOver,
    } as DataSource,
    session: () => ({}),
    ...over,
  };
}

const form = (fields: Record<string, string>) => ({
  body: new URLSearchParams(fields).toString(),
  headers: { "content-type": "application/x-www-form-urlencoded" },
});

describe("GET|POST /settings — the REQ-PROD-15 opt-out toggle", () => {
  it("renders the bound toggle (checked while sharing is on)", async () => {
    const res = await createWebApp(makeDeps()).request("/settings");
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('data-privacy-form="true"');
    expect(html).toContain('data-analytics-toggle="true"');
    expect(html).toContain("checked"); // analyticsOptOut false ⇒ sharing ON ⇒ box checked
  });

  it("reflects the opted-out state (box unchecked) and the saved banner", async () => {
    const res = await createWebApp(
      makeDeps({}, { getPrivacySettings: async () => ({ analyticsOptOut: true }) }),
    ).request("/settings?saved=1");
    const html = await res.text();
    expect(html).not.toContain("checked");
    expect(html).toContain('data-privacy-saved="true"');
  });

  it("POST flips the flag — checked box ⇒ optOut false; absent box ⇒ optOut true", async () => {
    const set = vi.fn<DataSource["setAnalyticsOptOut"]>(async () => undefined);
    const app = createWebApp(makeDeps({}, { setAnalyticsOptOut: set }));

    const on = await app.request("/settings/privacy", { method: "POST", ...form({ analytics: "on" }) });
    expect(on.status).toBe(302);
    expect(on.headers.get("location")).toBe("/settings?saved=1");
    expect(set).toHaveBeenLastCalledWith(expect.anything(), false);

    const off = await app.request("/settings/privacy", { method: "POST", ...form({}) });
    expect(set).toHaveBeenLastCalledWith(expect.anything(), true);
    expect(off.status).toBe(302);
  });

  it("redirects to /login unauthenticated", async () => {
    const app = createWebApp(makeDeps({ session: () => null }));
    expect((await app.request("/settings")).headers.get("location")).toBe("/login");
    expect(
      (await app.request("/settings/privacy", { method: "POST", ...form({}) })).headers.get("location"),
    ).toBe("/login");
  });
});

describe("GET /usage — the §14.5 level-1 glance", () => {
  it("renders the balance + the runs table and carries the dwell heartbeat", async () => {
    const res = await createWebApp(makeDeps()).request("/usage");
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('data-usage-balance="true"');
    expect(html).toContain("1,200"); // spendable
    expect(html).toContain("140"); // held
    expect(html).toContain('data-usage-run="run_1"');
    // REQ-BETA-10: the heartbeat script rides the page — it posts to /a/dwell.
    expect(html).toContain("/a/dwell");
    expect(html).toContain('var s="usage"');
  });

  it("redirects to /login unauthenticated", async () => {
    const res = await createWebApp(makeDeps({ session: () => null })).request("/usage");
    expect(res.headers.get("location")).toBe("/login");
  });
});

describe("POST /a/dwell — the heartbeat sink (REQ-BETA-10)", () => {
  it("wraps {surface, ms} into the whitelisted surface.dwell mint", async () => {
    const post = vi.fn<DataSource["postAnalyticsEvent"]>(async () => undefined);
    const res = await createWebApp(makeDeps({}, { postAnalyticsEvent: post })).request("/a/dwell", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ surface: "editor", ms: 42_000 }),
    });
    expect(res.status).toBe(204);
    expect(post).toHaveBeenCalledWith(expect.anything(), {
      event: "surface.dwell",
      props: { surface: "editor", ms: 42_000 },
    });
  });

  it("clamps absurd ms and truncates surface — the beacon is lossy, never trusted", async () => {
    const post = vi.fn<DataSource["postAnalyticsEvent"]>(async () => undefined);
    await createWebApp(makeDeps({}, { postAnalyticsEvent: post })).request("/a/dwell", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ surface: "x".repeat(100), ms: 9e9 }),
    });
    expect(post).toHaveBeenCalledWith(expect.anything(), {
      event: "surface.dwell",
      props: { surface: "x".repeat(40), ms: 3_600_000 },
    });
  });

  it("a malformed body is a quiet 204; unauthenticated is 401", async () => {
    const post = vi.fn<DataSource["postAnalyticsEvent"]>(async () => undefined);
    const app = createWebApp(makeDeps({}, { postAnalyticsEvent: post }));
    expect((await app.request("/a/dwell", { method: "POST", body: "not json" })).status).toBe(204);
    expect(post).not.toHaveBeenCalled();

    const anon = createWebApp(makeDeps({ session: () => null }));
    expect(
      (
        await anon.request("/a/dwell", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ surface: "editor", ms: 1000 }),
        })
      ).status,
    ).toBe(401);
  });
});

describe("GET /app — the §14.5 level-0 balance chip", () => {
  it("renders the chip (spendable in the label; held rides the tooltip)", async () => {
    const res = await createWebApp(makeDeps()).request("/app");
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('data-balance-chip="true"');
    expect(html).toContain("1,200");
  });

  it("a billing-read miss never blocks the list — the chip simply hides", async () => {
    const res = await createWebApp(
      makeDeps({}, { getBillingBalance: async () => Promise.reject(new Error("down")) }),
    ).request("/app");
    expect(res.status).toBe(200);
    expect(await res.text()).not.toContain('data-balance-chip="true"');
  });
});
