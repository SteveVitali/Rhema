import { describe, expect, it } from "vitest";
import type { ProjectRow } from "@rhema/contracts";
import { ApiError, type BillingPlansDto, type BillingSubscriptionDto, type CheckoutStatusDto, type UsageAccountDto, type UsageProjectDto } from "@rhema/api-client";
import { createWebApp, type WebDeps } from "./server.js";
import type { DataSource } from "./data.js";

// P1.16 — the billing surfaces (§14.2/14.3/14.5/14.6): the /settings/billing plan card (ladder,
// subscribe→Checkout, cancel-at-period-end, opt-in auto-reload, portal link, Team waitlist), the
// /billing/return webhook-lag poll (REQ-BILL-14), the §14.5 level-1 account read on /usage with the
// CSV export (REQ-BILL-11), and the level-2 /p/:project/usage rollup. Driven via app.request with an
// in-memory data source.

const SLUG = "new-essay";
const PROJECTS: ProjectRow[] = [
  { id: "proj_new", slug: SLUG, title: "New Essay", state: { key: "draft", pill: "Draft", overlay: null, suggested: { action: "review", label: "Review" } } },
];

const PLANS: BillingPlansDto = {
  version: "pricing-v1",
  issuedAt: "2026-09-02",
  usdPerCredit: 0.01,
  platformRate: 1.4,
  annualSavingsPct: 0.15,
  plans: {
    free: {
      display: "Free", monthlyUsd: 0, annualMonthlyUsd: 0, includedCreditsMonthly: 0,
      dailyChatCredits: 10, concurrency: 1, modelTiers: ["base"], chatOnly: true, researchTools: false,
      runWordCap: null, topUps: false, projects: 3, voices: 1, exportFormats: ["md"], sharing: "none",
      whatItCovers: "Chat on your drafts.",
    },
    writer: {
      display: "Writer", monthlyUsd: 20, annualMonthlyUsd: 17, includedCreditsMonthly: 2500,
      dailyChatCredits: null, concurrency: 1, modelTiers: ["base", "mid"], chatOnly: false,
      researchTools: true, runWordCap: null, topUps: true, projects: "unlimited", voices: "unlimited",
      exportFormats: "all", sharing: "export",
      whatItCovers: "Reviews, revisions and research tools.",
    },
    team: {
      display: "Team", monthlyUsd: 40, annualMonthlyUsd: 34, includedCreditsMonthly: 5000,
      dailyChatCredits: null, concurrency: 4, modelTiers: ["base", "mid", "frontier"], chatOnly: false,
      researchTools: true, runWordCap: null, topUps: true, projects: "unlimited", voices: "unlimited",
      exportFormats: "all", sharing: "workspace", waitlist: true, seatsIncluded: 1,
      whatItCovers: "Shared workspaces — join the waitlist.",
    },
  },
  trial: {
    windowDays: 14,
    entitlement: { kind: "review", wordCap: 6000, rigor: "standard", modelTier: "base" },
    pocketCredits: 150,
    upgradePromoCredits: 800,
    // HOT.1 — the api redacts the gated claim to null while `trial.firstReviewIncluded` is hidden.
    includedNote: null,
    postTrialNote: "After the trial, Free: 10 credits a day, chat only.",
    eligibilityLine: "One trial per person.",
  },
  topUpPacks: [
    { id: "pack_10", usd: 10, credits: 1000 },
    { id: "pack_50", usd: 50, credits: 5250 },
  ],
  autoReloadDefaults: null,
};

function sub(partial?: Partial<BillingSubscriptionDto>): BillingSubscriptionDto {
  return {
    tier: "free",
    subscription: null,
    trial: { state: null, entitlement: null },
    autoReload: { enabled: false, thresholdCredits: null, packId: null, monthlyCapUsd: null },
    hasStripeCustomer: false,
    purchase: "open",
    ...partial,
  };
}

const ACCOUNT: UsageAccountDto = {
  level0: { spendableCredits: 3100, heldCredits: 120, plan: "writer", trialState: null, trialDaysLeft: null },
  buckets: [
    { bucket: "included", available: 2000, held: 100, expiresAt: "2026-10-01T00:00:00Z" },
    { bucket: "topup", available: 1100, held: 20, expiresAt: "2027-06-01T00:00:00Z" },
  ],
  monthToDateCredits: 412,
  includedRemaining: 2000,
  includedMonthly: 2500,
  includedRolloverCap: 5000,
  periodStart: "2026-09-01T00:00:00Z",
  periodEnd: "2026-10-01T00:00:00Z",
  warnings: ["Included credits reset in 7 days — 500 over the rollover cap will expire."],
  nextExpiry: { bucket: "included", credits: 500, at: "2026-10-01T00:00:00Z" },
};

const PROJECT_USAGE: UsageProjectDto = {
  projectId: "proj_new",
  projectName: "New Essay",
  totalCredits: 88,
  runs: [
    { runId: "run_1", at: "2026-09-20T10:00:00Z", workflow: "review", state: "delivered", credits: 55, estimateCredits: 60, capCredits: 90 },
    { runId: "run_2", at: "2026-09-21T10:00:00Z", workflow: "chat", state: "delivered", credits: 33, estimateCredits: 30, capCredits: 45 },
  ],
};

function makeDeps(opts: {
  subscription?: BillingSubscriptionDto;
  plans?: BillingPlansDto;
  checkout?: { sessionId: string; url: string };
  checkoutError?: ApiError;
  portalError?: ApiError;
  checkoutStatus?: CheckoutStatusDto;
  usageAccount?: UsageAccountDto;
  usageProject?: UsageProjectDto;
  csv?: { bytes: ArrayBuffer; mediaType: string; fileName: string };
  recorded?: { calls: Record<string, unknown[]> };
}): WebDeps {
  const calls = opts.recorded?.calls ?? {};
  const rec = (k: string, v: unknown) => { (calls[k] ??= []).push(v); };
  return {
    dataSource: {
      listProjects: async () => PROJECTS,
      checkInvite: async () => ({ ok: true }),
      getBillingBalance: async () => ({ spendableCredits: 3100, suspended: false, clawbackDebt: 0, purchase: "open" }),
      getUsage: async () => ({ spendableCredits: 3100, heldCredits: 120, runs: [] }),
      getSubscription: async () => opts.subscription ?? sub(),
      getPlans: async () => opts.plans ?? PLANS,
      startCheckout: async (_s: unknown, req: unknown) => {
        rec("checkout", req);
        if (opts.checkoutError) throw opts.checkoutError;
        if (!opts.checkout) throw new Error("stripe down");
        return opts.checkout;
      },
      createBillingPortalSession: async () => {
        rec("portal", true);
        if (opts.portalError) throw opts.portalError;
        if (!opts.checkout) throw new Error("no portal");
        return { url: opts.checkout.url };
      },
      cancelSubscription: async () => { rec("cancel", true); return { applied: true }; },
      changePlan: async (_s: unknown, tier: unknown, cycle: unknown) => { rec("changePlan", { tier, cycle }); return { applied: "scheduled" }; },
      getCheckoutSession: async () =>
        opts.checkoutStatus ?? {
          state: "open",
          kind: "subscribe",
          returnTo: null,
          createdAt: new Date().toISOString(),
        },
      setAutoReload: async (_s: unknown, req: unknown) => { rec("autoReload", req); return { ok: true }; },
      joinTeamWaitlist: async (_s: unknown, req: unknown) => { rec("waitlist", req); return { ok: true }; },
      getUsageAccount: async () => opts.usageAccount ?? ACCOUNT,
      getUsageProject: async () => opts.usageProject ?? PROJECT_USAGE,
      downloadUsageCsv: async () => {
        rec("csv", true);
        return opts.csv ?? { bytes: new TextEncoder().encode("a,b\n1,2\n").buffer as ArrayBuffer, mediaType: "text/csv; charset=utf-8", fileName: "usage.csv" };
      },
    } as unknown as DataSource,
    session: () => ({}),
  };
}

describe("the /settings/billing plan card (§14.2/14.6)", () => {
  it("renders the ladder with pricing.json prices, the plan forms, auto-reload and the waitlist", async () => {
    const app = createWebApp(makeDeps({ subscription: sub({ tier: "free" }) }));
    const res = await app.request("/settings/billing");
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('data-plan-card="true"');
    expect(html).toContain('data-current-plan="free"');
    expect(html).toContain('data-plan="writer"');
    expect(html).toContain("$20/mo");
    expect(html).toContain('data-subscribe-form="writer"');
    // BILL.3 / §14.2 — Free is never offered a Checkout top-up it cannot complete; the honest gate
    // note renders instead. The pack buttons belong to the paid-plan card (asserted below).
    expect(html).not.toContain('data-topup-form=');
    expect(html).toContain('data-topup-gated="true"');
    expect(html).toContain("Top-ups need a paid plan");
    expect(html).toContain('data-auto-reload-form="true"');
    // Team is waitlisted — a waitlist form, never a checkout button (REQ-GROWTH-7).
    expect(html).toContain('data-waitlist-form="true"');
    expect(html).not.toContain('data-subscribe-form="team"');
  });

  it("an active subscription shows the renewal date + the cancel-at-period-end form + the portal", async () => {
    const app = createWebApp(makeDeps({
      subscription: sub({
        tier: "writer",
        hasStripeCustomer: true,
        subscription: {
          id: "sub_1", tier: "writer", cycle: "monthly", status: "active",
          periodStart: "2026-09-01T00:00:00Z", periodEnd: "2026-10-01T00:00:00Z",
          cancelAtPeriodEnd: false, scheduledTier: null, pastDue: false,
        },
      }),
    }));
    const html = await (await app.request("/settings/billing")).text();
    expect(html).toContain('data-current-plan="writer"');
    expect(html).toContain("Renews 2026-10-01");
    expect(html).toContain('data-cancel-form="true"');
    expect(html).toContain('data-portal-form="true"');
    expect(html).toContain('data-topup-form="pack_50"');
    // the current plan never offers a subscribe form
    expect(html).not.toContain('data-subscribe-form="writer"');
  });

  it("an absent purchase field fails closed — an older api never unlocks the forms", async () => {
    const fixture = sub({ tier: "writer", hasStripeCustomer: true });
    const app = createWebApp(makeDeps({ subscription: { ...fixture, purchase: undefined } }));
    const html = await (await app.request("/settings/billing")).text();
    expect(html).toContain('data-purchase-paused="true"');
    expect(html).not.toContain('data-subscribe-form=');
    expect(html).not.toContain('data-topup-form=');
    expect(html).not.toContain('data-portal-form=');
  });

  it("purchase=closed renders the paused note and mounts no subscribe/top-up/portal form (BILL.3)", async () => {
    const app = createWebApp(makeDeps({
      subscription: sub({
        tier: "writer",
        purchase: "closed",
        hasStripeCustomer: true,
        subscription: {
          id: "sub_1", tier: "writer", cycle: "monthly", status: "active",
          periodStart: "2026-09-01T00:00:00Z", periodEnd: "2026-10-01T00:00:00Z",
          cancelAtPeriodEnd: false, scheduledTier: null, pastDue: false,
        },
      }),
    }));
    const html = await (await app.request("/settings/billing")).text();
    expect(html).toContain('data-purchase-paused="true"');
    expect(html).toContain("Purchases are paused");
    expect(html).not.toContain('data-subscribe-form=');
    expect(html).not.toContain('data-topup-form=');
    expect(html).not.toContain('data-portal-form=');
    // cancellation stays reachable — it is not a purchase and makes no Stripe call.
    expect(html).toContain('data-cancel-form="true"');
  });

  it("a past-due subscription renders the renewal-failure banner (§14.6)", async () => {
    const app = createWebApp(makeDeps({
      subscription: sub({
        tier: "writer",
        subscription: {
          id: "sub_1", tier: "writer", cycle: "monthly", status: "past_due",
          periodStart: "2026-09-01T00:00:00Z", periodEnd: "2026-10-01T00:00:00Z",
          cancelAtPeriodEnd: false, scheduledTier: null, pastDue: true,
        },
      }),
    }));
    const html = await (await app.request("/settings/billing")).text();
    expect(html).toContain('data-past-due="true"');
    expect(html).toContain("renewal payment didn&#x27;t go through");
  });

  it("the trial card renders the factual window line for an active trial while the claim is hidden (HOT.1)", async () => {
    const app = createWebApp(makeDeps({
      subscription: sub({
        tier: "free",
        trial: { state: "trial_active", entitlement: { id: "te_1", state: "active", wordCap: 6000, expiresAt: null } },
      }),
    }));
    const html = await (await app.request("/settings/billing")).text();
    expect(html).toContain('data-trial-state="active"');
    // the gated claim (badge + "your review run is Included") stays off; the factual window renders.
    expect(html).not.toContain("Included");
    expect(html).toContain("Trial window — 14 days.");
  });

  it("a claim-on DTO (includedNote non-null) renders the Included badge + note (HOT.1 flip seam)", async () => {
    const app = createWebApp(makeDeps({
      subscription: sub({
        tier: "free",
        trial: { state: "trial_active", entitlement: { id: "te_1", state: "active", wordCap: 6000, expiresAt: null } },
      }),
      plans: { ...PLANS, trial: { ...PLANS.trial, includedNote: "Your trial review run is Included — no credits spent." } },
    }));
    const html = await (await app.request("/settings/billing")).text();
    expect(html).toContain('data-trial-state="active"');
    expect(html).toContain("Included");
    expect(html).toContain("Your trial review run is Included");
  });

  it("the subscribe POST mints a Checkout session and 302s to Stripe", async () => {
    const recorded = { calls: {} as Record<string, unknown[]> };
    const app = createWebApp(makeDeps({ checkout: { sessionId: "cs_1", url: "https://checkout.stripe.com/c/pay/cs_1" }, recorded }));
    const res = await app.request("/settings/billing/subscribe", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ tier: "writer", cycle: "annual" }).toString(),
      redirect: "manual",
    });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("https://checkout.stripe.com/c/pay/cs_1");
    expect(recorded.calls.checkout).toEqual([{ kind: "subscribe", plan: "writer", cycle: "annual", returnTo: "/settings/billing" }]);
  });

  it("a checkout miss returns to the card with the unavailable notice — never a half state", async () => {
    const app = createWebApp(makeDeps({}));
    const res = await app.request("/settings/billing/subscribe", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ tier: "writer" }).toString(),
      redirect: "manual",
    });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/settings/billing?notice=checkout");
  });

  it("the top-up POST mints Checkout and the portal POST reaches Stripe's hosted portal", async () => {
    const topup = createWebApp(makeDeps({ checkout: { sessionId: "cs_top", url: "https://checkout.stripe.com/c/pay/cs_top" } }));
    const res = await topup.request("/settings/billing/topup", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ packId: "pack_10" }).toString(),
      redirect: "manual",
    });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("https://checkout.stripe.com/c/pay/cs_top");

    const portal = createWebApp(makeDeps({ checkout: { sessionId: "bps_1", url: "https://billing.stripe.com/session/bps_1" } }));
    const res2 = await portal.request("/settings/billing/portal", { method: "POST", redirect: "manual" });
    expect(res2.status).toBe(302);
    expect(res2.headers.get("location")).toBe("https://billing.stripe.com/session/bps_1");
  });

  it("every classified api refusal carries its own notice/copy; only real outages use the generic line", async () => {
    const apiFailure = (status: number, code: string) =>
      new ApiError(status, "https://api.test/billing/checkout", undefined, code);
    const cases: readonly {
      path: string; body?: URLSearchParams; code: string; copy: string; portal?: boolean;
    }[] = [
      { path: "subscribe", body: new URLSearchParams({ tier: "writer" }), code: "purchase_closed", copy: "Purchases are paused" },
      { path: "subscribe", body: new URLSearchParams({ tier: "writer" }), code: "plan_waitlisted", copy: "plan isn" },
      { path: "subscribe", body: new URLSearchParams({ tier: "writer" }), code: "stripe_rejected", copy: "Stripe refused that checkout" },
      { path: "subscribe", body: new URLSearchParams({ tier: "writer" }), code: "stripe_unconfigured", copy: "isn&#x27;t configured" },
      { path: "subscribe", body: new URLSearchParams({ tier: "writer" }), code: "stripe_unavailable", copy: "Billing is temporarily unavailable" },
      { path: "topup", body: new URLSearchParams({ packId: "pack_10" }), code: "topups_require_plan", copy: "Top-ups need a paid plan" },
      { path: "topup", body: new URLSearchParams({ packId: "pack_10" }), code: "first_month_cap", copy: "first month" },
      { path: "portal", code: "no_stripe_customer", copy: "no card on file", portal: true },
    ];
    for (const row of cases) {
      const app = createWebApp(makeDeps(
        row.portal ? { portalError: apiFailure(404, row.code) } : { checkoutError: apiFailure(403, row.code) },
      ));
      const res = await app.request(`/settings/billing/${row.path}`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        ...(row.body ? { body: row.body.toString() } : {}),
        redirect: "manual",
      });
      expect(res.status, `${row.path}/${row.code}`).toBe(302);
      const location = res.headers.get("location") ?? "";
      expect(location).toBe(`/settings/billing?notice=${row.code}`);
      const html = await (await app.request(location)).text();
      expect(html, `${row.path}/${row.code}`).toContain(row.copy);
    }
  });

  it("never emits a non-Stripe checkout/portal redirect (CSP's server-side half)", async () => {
    const app = createWebApp(makeDeps({ checkout: { sessionId: "cs_bad", url: "https://evil.example/pay" } }));
    for (const [path, body] of [
      ["subscribe", new URLSearchParams({ tier: "writer" })],
      ["topup", new URLSearchParams({ packId: "pack_10" })],
    ] as const) {
      const res = await app.request(`/settings/billing/${path}`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: body.toString(),
        redirect: "manual",
      });
      expect(res.status).toBe(302);
      expect(res.headers.get("location")).toBe(`/settings/billing?notice=${path === "portal" ? "portal" : "checkout"}`);
    }
    const res = await app.request("/settings/billing/portal", { method: "POST", redirect: "manual" });
    expect(res.headers.get("location")).toBe("/settings/billing?notice=portal");
  });

  it("the cancel POST applies cancel_at_period_end and flashes saved", async () => {
    const recorded = { calls: {} as Record<string, unknown[]> };
    const app = createWebApp(makeDeps({ recorded }));
    const res = await app.request("/settings/billing/cancel", { method: "POST", redirect: "manual" });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/settings/billing?saved=1");
    expect(recorded.calls.cancel).toEqual([true]);
  });

  it("the auto-reload POST is opt-in and user-capped (REQ-BILL-17)", async () => {
    const recorded = { calls: {} as Record<string, unknown[]> };
    const app = createWebApp(makeDeps({ recorded }));
    const res = await app.request("/settings/billing/auto-reload", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ enabled: "1", thresholdCredits: "500", packId: "pack_50", monthlyCapUsd: "50" }).toString(),
      redirect: "manual",
    });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/settings/billing?saved=1");
    expect(recorded.calls.autoReload).toEqual([{ enabled: true, thresholdCredits: 500, packId: "pack_50", monthlyCapUsd: 50 }]);
  });

  it("the waitlist POST joins the Team list", async () => {
    const recorded = { calls: {} as Record<string, unknown[]> };
    const app = createWebApp(makeDeps({ recorded }));
    const res = await app.request("/settings/billing/waitlist", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ email: "lead@example.com", seats: "4" }).toString(),
      redirect: "manual",
    });
    expect(res.status).toBe(302);
    expect(recorded.calls.waitlist).toEqual([{ email: "lead@example.com", seats: 4 }]);
  });
});

describe("the /billing/return poll (REQ-BILL-14; §14.6 webhook lag)", () => {
  it("a completed checkout renders the confirmed line + the returnTo continue link", async () => {
    const app = createWebApp(makeDeps({
      checkoutStatus: {
        state: "completed",
        kind: "subscribe",
        returnTo: "/p/new-essay/run",
        createdAt: new Date().toISOString(),
      },
    }));
    const res = await app.request("/billing/return?session_id=cs_1");
    const html = await res.text();
    expect(html).toContain('data-checkout-state="completed"');
    expect(html).toContain("Payment confirmed");
    expect(html).toContain('href="/p/new-essay/run"');
    expect(html).not.toContain('http-equiv="refresh"');
  });

  it("an open checkout renders the pending line + auto-refresh (the ≤30 s window)", async () => {
    const app = createWebApp(makeDeps({
      checkoutStatus: { state: "open", kind: "subscribe", returnTo: null, createdAt: new Date().toISOString() },
    }));
    const res = await app.request("/billing/return?session_id=cs_1");
    const html = await res.text();
    expect(html).toContain('data-checkout-state="open"');
    expect(html).toContain("Confirming your payment");
    expect(html).toContain("we&#x27;ll email you");
    expect(html).toContain('http-equiv="refresh"');
    expect(html).toContain("session_id=cs_1");
  });

  it("an open checkout past the 30 s webhook-lag bound keeps the email fallback but stops polling", async () => {
    const app = createWebApp(makeDeps({
      checkoutStatus: {
        state: "open",
        kind: "subscribe",
        returnTo: null,
        createdAt: new Date(Date.now() - 31_000).toISOString(),
      },
    }));
    const html = await (await app.request("/billing/return?session_id=cs_late")).text();
    expect(html).toContain('data-checkout-state="open"');
    expect(html).toContain("we&#x27;ll email you");
    expect(html).not.toContain('http-equiv="refresh"');
  });

  it("an expired checkout renders the honest expired state — no forever-poll (BILL.3)", async () => {
    const app = createWebApp(makeDeps({
      checkoutStatus: {
        state: "expired",
        kind: "topup",
        returnTo: "/settings/billing",
        createdAt: new Date().toISOString(),
      },
    }));
    const html = await (await app.request("/billing/return?session_id=cs_exp")).text();
    expect(html).toContain('data-checkout-state="expired"');
    expect(html).toContain("checkout expired");
    expect(html).not.toContain('http-equiv="refresh"');
    expect(html).toContain('href="/settings/billing"');
  });
});

describe("the §14.5 level-1 account read on /usage (REQ-BILL-8/9/11)", () => {
  it("renders the plan/period line, bucket bars, warnings, next expiry and the CSV link", async () => {
    const app = createWebApp(makeDeps({}));
    const res = await app.request("/usage");
    const html = await res.text();
    expect(html).toContain('data-usage-account="true"');
    expect(html).toContain('data-usage-bucket="included"');
    expect(html).toContain('data-usage-bucket="topup"');
    expect(html).toContain("412 cr this period");
    expect(html).toContain('data-usage-warning="true"');
    expect(html).toContain('data-usage-next-expiry="true"');
    expect(html).toContain('href="/usage.csv"');
  });

  it("GET /usage.csv proxies the RFC-4180 download with the session", async () => {
    const recorded = { calls: {} as Record<string, unknown[]> };
    const app = createWebApp(makeDeps({ recorded }));
    const res = await app.request("/usage.csv");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/csv");
    expect(res.headers.get("content-disposition")).toContain('filename="usage.csv"');
    expect(await res.text()).toBe("a,b\n1,2\n");
    expect(recorded.calls.csv).toEqual([true]);
  });
});

describe("the §14.5 level-2 project rollup (/p/:project/usage)", () => {
  it("renders the project total + the runs table with per-run cost and report links", async () => {
    const app = createWebApp(makeDeps({}));
    const res = await app.request(`/p/${SLUG}/usage`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('data-project-usage-total="true"');
    expect(html).toContain("88 cr across 2 runs");
    expect(html).toContain('data-project-usage-run="run_1"');
    expect(html).toContain('href="/app/usage/r/run_1"');
  });

  it("an unknown project 404s", async () => {
    const app = createWebApp(makeDeps({}));
    const res = await app.request("/p/nope/usage");
    expect(res.status).toBe(404);
  });
});
