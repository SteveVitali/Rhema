import { describe, it, expect, vi } from "vitest";
import type { UsageDto } from "@rhema/api-client";
import { createWebApp, type WebDeps } from "./server.js";
import type { DataSource } from "./data.js";

// PRB.12 — the beta's instrumentation surfaces (REQ-BETA-6/10/14; REQ-PROD-15):
//  • P1.20 — the toggle migrated into the §14.7 tree: GET /app/settings/data renders the
//    "Exclude my usage from product analytics" checkbox bound to analytics_opt_out (checked = the
//    opt-OUT is on, matching the verbatim §14.7 label); POST /app/settings/data/privacy flips it.
//    The legacy /settings/privacy post still works and lands on the new page.
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

describe("P1.20 — the REQ-PROD-15 opt-out toggle in the §14.7 Data section", () => {
  // SPA.27 — the bound-toggle render asserts retired with the document; the leaf paints the
  // `data-analytics-toggle` checkbox off the twin's `privacy.analyticsOptOut` (the flag is the
  // opt-OUT — checked = excluded). The payload pins below keep the flag direction honest.

  it("the twin ships the opt-OUT flag verbatim (sharing on ⇒ analyticsOptOut false)", async () => {
    const doc = await createWebApp(makeDeps()).request("/app/settings/data");
    expect(doc.status).toBe(200);
    expect(await doc.text()).toContain('id="spa-root"');
    const res = await createWebApp(makeDeps()).request("/bff/settings/data");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { privacy: { analyticsOptOut: boolean } };
    expect(body.privacy.analyticsOptOut).toBe(false);
  });

  it("the opted-out state rides the twin (?saved=1 stays leaf-owned URL flash)", async () => {
    const res = await createWebApp(
      makeDeps({}, { getPrivacySettings: async () => ({ analyticsOptOut: true }) }),
    ).request("/bff/settings/data");
    const body = (await res.json()) as { privacy: { analyticsOptOut: boolean } };
    expect(body.privacy.analyticsOptOut).toBe(true);
  });

  it("POST flips the flag — checked box ⇒ optOut true; absent box ⇒ optOut false", async () => {
    const set = vi.fn<DataSource["setAnalyticsOptOut"]>(async () => undefined);
    const app = createWebApp(makeDeps({}, { setAnalyticsOptOut: set }));

    const off = await app.request("/app/settings/data/privacy", {
      method: "POST",
      ...form({ analyticsOptOut: "on" }),
    });
    expect(off.status).toBe(302);
    expect(off.headers.get("location")).toBe("/app/settings/data?saved=1");
    expect(set).toHaveBeenLastCalledWith(expect.anything(), true);

    const on = await app.request("/app/settings/data/privacy", { method: "POST", ...form({}) });
    expect(set).toHaveBeenLastCalledWith(expect.anything(), false);
    expect(on.status).toBe(302);
  });

  it("the legacy /settings surface migrates: GET 302s to the tree; the old POST still flips the flag", async () => {
    const set = vi.fn<DataSource["setAnalyticsOptOut"]>(async () => undefined);
    const app = createWebApp(makeDeps({}, { setAnalyticsOptOut: set }));
    const res = await app.request("/settings");
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/app/settings/account");

    // the old checkbox posted "on" when sharing was ON — the inverse flag.
    const on = await app.request("/settings/privacy", { method: "POST", ...form({ analytics: "on" }) });
    expect(on.status).toBe(302);
    expect(set).toHaveBeenLastCalledWith(expect.anything(), false);
    await app.request("/settings/privacy", { method: "POST", ...form({}) });
    expect(set).toHaveBeenLastCalledWith(expect.anything(), true);
  });

  it("redirects to /login unauthenticated", async () => {
    const app = createWebApp(makeDeps({ session: () => null }));
    expect((await app.request("/settings")).headers.get("location")).toBe("/login");
    expect((await app.request("/app/settings/data")).headers.get("location")).toBe("/login");
    expect(
      (await app.request("/app/settings/data/privacy", { method: "POST", ...form({}) })).headers.get("location"),
    ).toBe("/login");
  });
});

describe("GET /usage — the §14.5 level-1 glance", () => {
  it("the twin ships the balance + runs verbatim (the glance + heartbeat are leaf paint)", async () => {
    // SPA.27 — the rendered glance + the inline dwell script retired with the document; the
    // leaf mounts the §14.5 level-1 view off the twin and owns the heartbeat client-side.
    const res = await createWebApp(makeDeps()).request("/bff/usage");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      usage: { spendableCredits: number; heldCredits: number; runs: { runId: string }[] } | null;
      account: unknown;
    };
    expect(body.usage?.spendableCredits).toBe(1200);
    expect(body.usage?.heldCredits).toBe(140);
    expect(body.usage?.runs.map((r) => r.runId)).toEqual(["run_1"]);
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
  it("the twin ships the chip's balance verbatim (spendable + held ride the nav payload)", async () => {
    const res = await createWebApp(makeDeps()).request("/bff/app");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { balance: { spendableCredits: number; heldCredits: number } | null };
    expect(body.balance).toEqual({ spendableCredits: 1200, heldCredits: 140 });
  });

  it("a billing-read miss degrades the twin's chip field to null — never a 500", async () => {
    const res = await createWebApp(
      makeDeps({}, { getBillingBalance: async () => Promise.reject(new Error("down")) }),
    ).request("/bff/app");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { balance: unknown };
    expect(body.balance).toBeNull(); // the leaf hides the chip off the null
  });
});
