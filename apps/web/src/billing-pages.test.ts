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
  // SPA.27 (REQ-TST-1) — the plan-card render asserts (the ladder + prices, the forms' mounts and
  // absences, the renewal/banner/trial lines, the purchase-paused gates) retired with the
  // document: the billing leaf paints the SAME `{billing:{subscription,plans}, balance}` payload
  // the `/bff/settings/billing` twin ships — the pins below assert the payload the leaf gates on
  // (purchase/absent-purchase/past-due/trial state all ride through verbatim, unmassaged).

  const billingPayload = async (app: ReturnType<typeof createWebApp>) =>
    (await (await app.request("/bff/settings/billing")).json()) as {
      billing: { subscription: { tier: string; purchase?: string; subscription?: { status: string; pastDue: boolean; periodEnd: string } | null; trial?: { state: string } | null }; plans: { trial?: { includedNote?: string | null } } } | null;
      balance: { purchase?: string } | null;
    };

  it("the twin ships the subscription + plans + balance verbatim (the leaf paints the card)", async () => {
    const app = createWebApp(makeDeps({ subscription: sub({ tier: "free" }) }));
    const res = await app.request("/bff/settings/billing");
    expect(res.status).toBe(200);
    const body = await billingPayload(app);
    expect(body.billing?.subscription.tier).toBe("free");
    expect(body.billing?.plans).toBeTruthy();
    expect(body.balance).toBeTruthy();
  });

  it("an active subscription's period end + status ride the twin", async () => {
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
    const body = await billingPayload(app);
    expect(body.billing?.subscription.subscription).toMatchObject({ status: "active", periodEnd: "2026-10-01T00:00:00Z", pastDue: false });
  });

  it("an absent purchase field reaches the leaf unmassaged — the fail-closed gate is client truth", async () => {
    const fixture = sub({ tier: "writer", hasStripeCustomer: true });
    const app = createWebApp(makeDeps({ subscription: { ...fixture, purchase: undefined } }));
    const body = await billingPayload(app);
    expect(body.billing?.subscription.purchase).toBeUndefined();
  });

  it("purchase=closed rides the twin verbatim (BILL.3 — the leaf mounts no purchase forms)", async () => {
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
    const body = await billingPayload(app);
    expect(body.billing?.subscription.purchase).toBe("closed");
  });

  it("a past-due subscription's status + flag ride the twin (§14.6 — the leaf paints the banner)", async () => {
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
    const body = await billingPayload(app);
    expect(body.billing?.subscription.subscription).toMatchObject({ status: "past_due", pastDue: true });
  });

  it("an active trial's window + a null includedNote ride the twin (HOT.1)", async () => {
    const app = createWebApp(makeDeps({
      subscription: sub({
        tier: "free",
        trial: { state: "trial_active", entitlement: { id: "te_1", state: "active", wordCap: 6000, expiresAt: null } },
      }),
    }));
    const body = await billingPayload(app);
    expect(body.billing?.subscription.trial?.state).toBe("trial_active");
    expect(body.billing?.plans.trial?.includedNote ?? null).toBeNull(); // the gated claim stays off
  });

  it("a claim-on DTO (includedNote non-null) reaches the leaf (HOT.1 flip seam)", async () => {
    const app = createWebApp(makeDeps({
      subscription: sub({
        tier: "free",
        trial: { state: "trial_active", entitlement: { id: "te_1", state: "active", wordCap: 6000, expiresAt: null } },
      }),
      plans: { ...PLANS, trial: { ...PLANS.trial, includedNote: "Your trial review run is Included — no credits spent." } },
    }));
    const body = await billingPayload(app);
    expect(body.billing?.plans.trial?.includedNote).toContain("Included");
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

  it("every classified api refusal carries its own ?notice code (the leaf paints the copy)", async () => {
    const apiFailure = (status: number, code: string) =>
      new ApiError(status, "https://api.test/billing/checkout", undefined, code);
    // SPA.27 — the notice's verbatim copy is leaf paint now (billing leaf dom tests); the server
    // contract that survives is the classified `?notice=<code>` redirect per refusal.
    const cases: readonly {
      path: string; body?: URLSearchParams; code: string; portal?: boolean;
    }[] = [
      { path: "subscribe", body: new URLSearchParams({ tier: "writer" }), code: "purchase_closed" },
      { path: "subscribe", body: new URLSearchParams({ tier: "writer" }), code: "plan_waitlisted" },
      { path: "subscribe", body: new URLSearchParams({ tier: "writer" }), code: "stripe_rejected" },
      { path: "subscribe", body: new URLSearchParams({ tier: "writer" }), code: "stripe_unconfigured" },
      { path: "subscribe", body: new URLSearchParams({ tier: "writer" }), code: "stripe_unavailable" },
      { path: "topup", body: new URLSearchParams({ packId: "pack_10" }), code: "topups_require_plan" },
      { path: "topup", body: new URLSearchParams({ packId: "pack_10" }), code: "first_month_cap" },
      { path: "portal", code: "no_stripe_customer", portal: true },
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
      // SPA.27 — the notice copy is leaf paint now; the server contract is the classified
      // `?notice=<code>` flash the leaf maps to its verbatim line.
      const location = res.headers.get("location") ?? "";
      expect(location, `${row.path}/${row.code}`).toBe(`/settings/billing?notice=${row.code}`);
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

// SPA.27 — the /billing/return document is deleted; the checkout-return read + the server's
// §14.6 webhook-lag poll verdict (open ∧ ¬cancelled ∧ <30 s ⇒ `pollAfterSeconds:5`, else absent —
// REQ-BFF-15) ride the `/bff/billing/return` twin. The leaf owns the confirmed/pending/expired
// lines + the meta-refresh; the server owns the poll verdict, pinned on the payload below.
describe("the /billing/return poll (REQ-BILL-14; §14.6 webhook lag)", () => {
  const checkoutReturn = async (deps: WebDeps, sessionId = "cs_1") =>
    (await (await createWebApp(deps).request(`/bff/billing/return?session_id=${sessionId}`)).json()) as {
      checkoutReturn: { state: string; returnTo?: string | null } | null;
      cancelled: boolean;
      pollAfterSeconds?: number;
    };

  it("a completed checkout's row + returnTo ride the twin; no poll verdict", async () => {
    const body = await checkoutReturn(makeDeps({
      checkoutStatus: {
        state: "completed",
        kind: "subscribe",
        returnTo: "/p/new-essay/run",
        createdAt: new Date().toISOString(),
      },
    }));
    expect(body.checkoutReturn).toMatchObject({ state: "completed", returnTo: "/p/new-essay/run" });
    expect(body.pollAfterSeconds).toBeUndefined(); // never a forever-poll
  });

  it("an open checkout inside the ≤30 s window carries pollAfterSeconds", async () => {
    const body = await checkoutReturn(makeDeps({
      checkoutStatus: { state: "open", kind: "subscribe", returnTo: null, createdAt: new Date().toISOString() },
    }));
    expect(body.checkoutReturn?.state).toBe("open");
    expect(body.pollAfterSeconds).toBe(5);
  });

  it("an open checkout past the 30 s webhook-lag bound stops the poll verdict", async () => {
    const body = await checkoutReturn(makeDeps({
      checkoutStatus: {
        state: "open",
        kind: "subscribe",
        returnTo: null,
        createdAt: new Date(Date.now() - 31_000).toISOString(),
      },
    }, "cs_late"));
    expect(body.checkoutReturn?.state).toBe("open");
    expect(body.pollAfterSeconds).toBeUndefined();
  });

  it("an expired checkout answers its state — no poll verdict, ever (BILL.3)", async () => {
    const body = await checkoutReturn(makeDeps({
      checkoutStatus: {
        state: "expired",
        kind: "topup",
        returnTo: "/settings/billing",
        createdAt: new Date().toISOString(),
      },
    }, "cs_exp"));
    expect(body.checkoutReturn).toMatchObject({ state: "expired", returnTo: "/settings/billing" });
    expect(body.pollAfterSeconds).toBeUndefined();
  });
});

describe("the §14.5 level-1 account read on /usage (REQ-BILL-8/9/11)", () => {
  it("the twin ships the level-1 account read verbatim (the leaf paints the line/bars/warnings)", async () => {
    const app = createWebApp(makeDeps({}));
    const res = await app.request("/bff/usage");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      usage: { spendableCredits: number } | null;
      account: { monthToDateCredits: number; buckets: { bucket: string }[]; warnings: string[]; nextExpiry: { credits: number } } | null;
    };
    expect(body.usage?.spendableCredits).toBe(3100);
    expect(body.account?.monthToDateCredits).toBe(412);
    expect(body.account?.buckets.map((b) => b.bucket)).toEqual(["included", "topup"]);
    expect(body.account?.warnings[0]).toContain("rollover cap");
    expect(body.account?.nextExpiry.credits).toBe(500);
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
  it("the twin ships the rollup verbatim (the leaf paints the total + the runs table)", async () => {
    const app = createWebApp(makeDeps({}));
    const res = await app.request(`/bff/p/${SLUG}/usage`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      usageProject: { slug: string; totalCredits: number; runs: { runId: string; credits: number }[] };
    };
    expect(body.usageProject.slug).toBe(SLUG);
    expect(body.usageProject.totalCredits).toBe(88);
    expect(body.usageProject.runs.map((r) => r.runId)).toEqual(["run_1", "run_2"]);
  });

  it("an unknown project: the document serves the shell; the twin answers not_found", async () => {
    const app = createWebApp(makeDeps({}));
    // SPA.27 — the document 404 is deleted; the leaf owns not-found off the twin's miss.
    expect((await app.request("/p/nope/usage")).status).toBe(200);
    const twin = await app.request("/bff/p/nope/usage");
    expect(twin.status).toBe(404);
  });
});
