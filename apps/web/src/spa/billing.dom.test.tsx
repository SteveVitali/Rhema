// @vitest-environment happy-dom
//
// SPA.16 — the `billing` surface's component contract (REQ-SEQ-9, REQ-VFY-2/6, REQ-TST-2/6/10,
// REQ-BFF-1/9/15/27, REQ-DAT-4/8/12, REQ-UX-6/16, REQ-BILL-14/16/17; design/22 §2 +
// design/25 §settings.billing/billingReturn). Mounted through the production router (memory
// history + a stub fetch) at `/app/settings/billing`, the `/settings/billing` alias, and
// `/billing/return`: the SSR-verbatim vocabulary (plan card, ladder, top-ups, auto-reload,
// portal, waitlist), the fail-closed purchase switch (`purchase !== "open"` mounts no
// subscribe/top-up/portal form — BILL.3), the delegated JSON mutation legs (the `{ok,redirect}`
// flash nav vs the `{url}` Stripe hand-off through `navigateDocument`), the REQ-UX-16 in-flight
// affordance, the checkout-return states with the server-owned poll cadence, the SsrHandoff
// no-BFF leg, and the REQ-TST-2 parity legs against the SSR `BillingPage`/`BillingReturnPage`
// under a PageDataContext provider. Component axe covers both mounted surfaces.
//
// The fixtures mirror the retained SSR spec's (billing-pages.test.ts) — the parity legs compare
// the two renderers on the SAME data.

import { act, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createMemoryHistory, RouterProvider } from "@tanstack/react-router";
import { fireEvent } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  BillingBalanceDto,
  BillingPlansDto,
  BillingSubscriptionDto,
  CheckoutStatusDto } from "@rhema/api-client";
import { COPY } from "../copy.js";
import { createSpaRouter } from "./main.js";
import type { SpaBoot } from "./boot.js";
import { billingReturnQuery } from "./queries.js";
import type { BffBillingReturnTwin, BffBillingSettingsTwin } from "./queries.js";
import { axeCheck, restoreDocumentNav, stubDocumentNav } from "./testkit.js";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const PRINCIPAL = { userId: "u1", workspaceId: "w1", billingAccountId: "b1" };

// ---- fixtures — billing-pages.test.ts's set, verbatim -------------------------------------------

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
      whatItCovers: "Chat on your drafts." },
    writer: {
      display: "Writer", monthlyUsd: 20, annualMonthlyUsd: 17, includedCreditsMonthly: 2500,
      dailyChatCredits: null, concurrency: 1, modelTiers: ["base", "mid"], chatOnly: false,
      researchTools: true, runWordCap: null, topUps: true, projects: "unlimited", voices: "unlimited",
      exportFormats: "all", sharing: "export",
      whatItCovers: "Reviews, revisions and research tools." },
    team: {
      display: "Team", monthlyUsd: 40, annualMonthlyUsd: 34, includedCreditsMonthly: 5000,
      dailyChatCredits: null, concurrency: 4, modelTiers: ["base", "mid", "frontier"], chatOnly: false,
      researchTools: true, runWordCap: null, topUps: true, projects: "unlimited", voices: "unlimited",
      exportFormats: "all", sharing: "workspace", waitlist: true, seatsIncluded: 1,
      whatItCovers: "Shared workspaces — join the waitlist." } },
  trial: {
    windowDays: 14,
    entitlement: { kind: "review", wordCap: 6000, rigor: "standard", modelTier: "base" },
    pocketCredits: 150,
    upgradePromoCredits: 800,
    // HOT.1 — the api redacts the gated claim to null while `trial.firstReviewIncluded` is hidden.
    includedNote: null,
    postTrialNote: "After the trial, Free: 10 credits a day, chat only.",
    eligibilityLine: "One trial per person." },
  topUpPacks: [
    { id: "pack_10", usd: 10, credits: 1000 },
    { id: "pack_50", usd: 50, credits: 5250 },
  ],
  autoReloadDefaults: null };

function sub(partial?: Partial<BillingSubscriptionDto>): BillingSubscriptionDto {
  return {
    tier: "free",
    subscription: null,
    trial: { state: null, entitlement: null },
    autoReload: { enabled: false, thresholdCredits: null, packId: null, monthlyCapUsd: null },
    hasStripeCustomer: false,
    purchase: "open",
    ...partial };
}

const PAID_SUB = sub({
  tier: "writer",
  hasStripeCustomer: true,
  subscription: {
    id: "sub_1", tier: "writer", cycle: "monthly", status: "active",
    periodStart: "2026-09-01T00:00:00Z", periodEnd: "2026-10-01T00:00:00Z",
    cancelAtPeriodEnd: false, scheduledTier: null, pastDue: false } });

const BALANCE: BillingBalanceDto = {
  spendableCredits: 3100,
  suspended: false,
  clawbackDebt: 0,
  purchase: "open",
  paymentLinkUrl: "https://buy.stripe.com/test_link" };

const CHECKOUT_OPEN: CheckoutStatusDto = {
  state: "open",
  kind: "subscribe",
  returnTo: null,
  createdAt: new Date().toISOString() };

const CHECKOUT_COMPLETED: CheckoutStatusDto = {
  state: "completed",
  kind: "subscribe",
  returnTo: "/p/new-essay/run",
  createdAt: new Date().toISOString() };

const CHECKOUT_EXPIRED: CheckoutStatusDto = {
  state: "expired",
  kind: "subscribe",
  returnTo: null,
  createdAt: new Date(Date.now() - 60_000).toISOString() };

// ---- the mount substrate -------------------------------------------------------------------------

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" } });
}

interface FetchOpts {
  billing?: BffBillingSettingsTwin;
  billingReturn?: BffBillingReturnTwin;
  /** mutation overrides — action path → envelope (default `{ok:true, redirect:"…?saved=1"}`). */
  mutations?: Record<string, { ok: true; redirect?: string; url?: string }>;
  /** per-path deferred replies — the REQ-UX-16 in-flight leg holds a POST open. */
  hold?: Record<string, Promise<Response>>;
}

/** The fetch stub — every same-origin path the mounts can reach is named; anything else 500s so a
 *  surprise read fails loudly rather than fabricating data. POSTs record their init. */
function makeFetch(opts: FetchOpts = {}) {
  return vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url === "/session") return jsonResponse(200, PRINCIPAL);
    if (url === "/bff/feed-labels") return jsonResponse(200, { t: {}, enums: {} });
    if (url === "/bff/settings/billing") {
      return jsonResponse(200, opts.billing ?? { billing: { subscription: sub(), plans: PLANS }, balance: BALANCE });
    }
    if (url.startsWith("/bff/billing/return")) {
      return jsonResponse(200, opts.billingReturn ?? { checkoutReturn: CHECKOUT_OPEN, cancelled: false, pollAfterSeconds: 5 });
    }
    if (opts.hold?.[url] != null) return opts.hold[url]!;
    if (opts.mutations?.[url] != null) return jsonResponse(200, opts.mutations[url]!);
    // The billing mutation grammar — the SSR action paths answer the JSON envelope.
    if (url.startsWith("/app/settings/billing/") || url.startsWith("/settings/billing/")) {
      return jsonResponse(200, { ok: true, redirect: "/app/settings/billing?saved=1" });
    }
    return jsonResponse(500, { error: "unstubbed_path" });
  });
}

function bootFor(surfaces: Record<string, "spa" | "ssr">, deviceClass: "desktop" | "phone" = "desktop"): SpaBoot {
  return { principal: PRINCIPAL, theme: {}, deviceClass, surfaces };
}

const SPA_ALL = {
  "/app/settings/billing": "spa",
  "/settings/billing": "spa",
  "/billing/return": "spa" } as const;

let docNavSpy: ReturnType<typeof vi.fn>;
const mounted: Root[] = [];

async function mountAt(path: string, boot: SpaBoot, fetchImpl: ReturnType<typeof makeFetch>) {
  vi.stubGlobal("fetch", fetchImpl);
  const rootEl = document.createElement("div");
  rootEl.setAttribute("data-spa-root", "");
  document.body.appendChild(rootEl);
  const { router, queryClient } = createSpaRouter({
    boot,
    history: createMemoryHistory({ initialEntries: [path] }) });
  const root = createRoot(rootEl);
  mounted.push(root);
  await act(async () => {
    root.render(
      <StrictMode>
        <RouterProvider router={router} />
      </StrictMode>,
    );
    await router.load();
  });
  return { router, queryClient, rootEl };
}

const el = () => document.querySelector<HTMLElement>("[data-spa-root]");


/** Submit one form inside an act — fireEvent + the mutation's microtask flush. */
async function submit(form: Element) {
  await act(async () => {
    fireEvent.submit(form);
  });
}

beforeEach(() => {
  docNavSpy = stubDocumentNav();
  document.documentElement.removeAttribute("data-route");
  document.documentElement.removeAttribute("data-mounted");
  document.title = "";
});

afterEach(() => {
  for (const r of mounted.splice(0)) act(() => r.unmount());
  restoreDocumentNav();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

// ---- /app/settings/billing ------------------------------------------------------------------------

describe("GET /app/settings/billing mounted (SPA.16)", () => {
  const BOOT = bootFor(SPA_ALL);

  it("renders the plan card + ladder + forms vocabulary verbatim (free tier)", async () => {
    await mountAt("/app/settings/billing", BOOT, makeFetch());
    const main = el()!;
    expect(main.querySelector("h1")?.textContent).toBe(COPY.billing.heading);
    // The shared settings strip — the billing entry is the active section.
    const nav = main.querySelector("[data-settings-nav]");
    expect(nav).not.toBeNull();
    expect(nav!.querySelector('[data-section="billing"]')?.getAttribute("aria-current")).toBe("page");
    // The plan card + ladder — pricing DTO verbatim. The section containers carry their own
    // manifest hooks ([data-plan-ladder] wraps the [data-plan] cards; [data-topups] wraps the
    // pack forms/gate; [data-auto-reload] wraps the auto-reload form) — asserted alongside the
    // controls so the SPA.16-manifested hooks are covered (SPA.18 chain-debt repair).
    expect(main.querySelector('[data-plan-card]')).not.toBeNull();
    expect(main.querySelector('[data-current-plan="free"]')).not.toBeNull();
    expect(main.querySelector("[data-plan-ladder]")).not.toBeNull();
    expect(main.querySelector('[data-plan="writer"]')).not.toBeNull();
    expect(main.textContent).toContain("$20/mo");
    // Free's subscribe entry + the honest top-up gate (never a Checkout it cannot complete).
    expect(main.querySelector('[data-subscribe-form="writer"]')).not.toBeNull();
    expect(main.querySelector("[data-topups]")).not.toBeNull();
    expect(main.querySelector("[data-topup-form]")).toBeNull();
    expect(main.querySelector("[data-topup-gated]")).not.toBeNull();
    expect(main.textContent).toContain("Top-ups need a paid plan");
    // Auto-reload + the Team waitlist (a waitlist form, never a checkout button — REQ-GROWTH-7).
    // The auto-reload select carries name="packId" even on free — the field hook is asserted here.
    expect(main.querySelector("[data-auto-reload]")).not.toBeNull();
    expect(main.querySelector("[data-auto-reload-form]")).not.toBeNull();
    expect(main.querySelector('[data-auto-reload-form] [name="packId"]')).not.toBeNull();
    expect(main.querySelector("[data-waitlist-form]")).not.toBeNull();
    expect(main.querySelector('[data-subscribe-form="team"]')).toBeNull();
    // No Stripe customer + purchase open ⇒ the honest no-card note names the reason.
    expect(main.querySelector("[data-no-customer]")).not.toBeNull();
  });


  it("an active subscription shows the renewal line + cancel + portal + paid top-ups", async () => {
    await mountAt("/app/settings/billing", BOOT, makeFetch({
      billing: { billing: { subscription: PAID_SUB, plans: PLANS }, balance: BALANCE } }));
    const main = el()!;
    expect(main.querySelector('[data-current-plan="writer"]')).not.toBeNull();
    expect(main.textContent).toContain("Renews 2026-10-01");
    expect(main.querySelector("[data-cancel-form]")).not.toBeNull();
    expect(main.querySelector("[data-portal-form]")).not.toBeNull();
    expect(main.querySelector('[data-topup-form="pack_50"]')).not.toBeNull();
    // The current plan never offers a subscribe form.
    expect(main.querySelector('[data-subscribe-form="writer"]')).toBeNull();
  });

  it("a past_due subscription carries the delinquency banner (data-past-due)", async () => {
    const pastDue = sub({
      tier: "writer",
      hasStripeCustomer: true,
      subscription: { ...PAID_SUB.subscription!, pastDue: true } });
    await mountAt("/app/settings/billing", BOOT, makeFetch({
      billing: { billing: { subscription: pastDue, plans: PLANS }, balance: BALANCE } }));
    expect(el()!.querySelector("[data-past-due]")).not.toBeNull();
  });

  it("a live trial reports its state verbatim (data-trial-state pending/active/used/denied)", async () => {
    for (const [state, marker] of [
      ["trial_pending", "pending"],
      ["trial_active", "active"],
      ["trial_denied", "denied"],
      ["trial_used", "used"],
    ] as const) {
      document.body.innerHTML = "";
      await mountAt("/app/settings/billing", BOOT, makeFetch({
        billing: {
          billing: { subscription: sub({ trial: { state, entitlement: null } }), plans: PLANS },
          balance: BALANCE } }));
      expect(el()!.querySelector(`[data-trial-state="${marker}"]`), state).not.toBeNull();
    }
  });

  it("BILL.3 fail-closed — purchase absent mounts NO purchase forms (the paused note renders)", async () => {
    const closed = { ...PAID_SUB, purchase: undefined };
    await mountAt("/app/settings/billing", BOOT, makeFetch({
      billing: { billing: { subscription: closed, plans: PLANS }, balance: BALANCE } }));
    const main = el()!;
    expect(main.querySelector("[data-purchase-paused]")).not.toBeNull();
    expect(main.querySelector("[data-subscribe-form]")).toBeNull();
    expect(main.querySelector("[data-topup-form]")).toBeNull();
    expect(main.querySelector("[data-portal-form]")).toBeNull();
    // Cancellation stays reachable — it is not a purchase and makes no Stripe call.
    expect(main.querySelector("[data-cancel-form]")).not.toBeNull();
  });

  it("purchase=closed renders the paused copy + keeps cancel (the SSR's exact arms)", async () => {
    await mountAt("/app/settings/billing", BOOT, makeFetch({
      billing: { billing: { subscription: { ...PAID_SUB, purchase: "closed" }, plans: PLANS }, balance: BALANCE } }));
    const main = el()!;
    expect(main.querySelector("[data-purchase-paused]")).not.toBeNull();
    expect(main.textContent).toContain("Purchases are paused");
    expect(main.querySelector("[data-subscribe-form]")).toBeNull();
    expect(main.querySelector("[data-topup-form]")).toBeNull();
    expect(main.querySelector("[data-portal-form]")).toBeNull();
    expect(main.querySelector("[data-cancel-form]")).not.toBeNull();
  });

  it("a degraded twin renders data-billing-down — the SSR's absent-`billing` branch, never a fabricated tier", async () => {
    await mountAt("/app/settings/billing", BOOT, makeFetch({ billing: { billing: null, balance: null } }));
    const main = el()!;
    expect(main.querySelector("[data-billing-down]")).not.toBeNull();
    expect(main.textContent).toContain("temporarily unavailable");
    expect(main.querySelector("[data-plan-card]")).toBeNull();
    expect(main.querySelector("[data-subscribe-form]")).toBeNull();
  });

  it("the ?notice=<code> flash lands the classified copy through validated search (REQ-BILL-16)", async () => {
    await mountAt("/app/settings/billing?notice=purchase_closed", BOOT, makeFetch());
    expect(el()!.querySelector("[data-notice]")?.textContent).toContain("Purchases are paused");
  });

  it("the ?saved=1 flash renders through validated search", async () => {
    await mountAt("/app/settings/billing?saved=1", BOOT, makeFetch());
    expect(el()!.querySelector("[data-saved]")?.textContent).toBe(COPY.billing.saved);
  });

  it("the subscribe POST rides the JSON branch — fields verbatim, the {url} envelope doc-navs to Stripe", async () => {
    const f = makeFetch({
      mutations: {
        "/app/settings/billing/subscribe": { ok: true, url: "https://checkout.stripe.com/c/pay/cs_1" } } });
    const { router } = await mountAt("/app/settings/billing", BOOT, f);
    const form = el()!.querySelector<HTMLFormElement>('[data-subscribe-form="writer"]')!;
    expect(form.getAttribute("action")).toBe("/app/settings/billing/subscribe");
    expect(form.getAttribute("method")).toBe("post");
    await submit(form);
    const post = f.mock.calls.find(([u, i]) => String(u) === "/app/settings/billing/subscribe" && i != null);
    expect(post).toBeDefined();
    const init = post![1] as RequestInit;
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({ "content-type": "application/json", accept: "application/json" });
    expect(JSON.parse(String(init.body))).toMatchObject({ tier: "writer", cycle: "monthly" });
    // REQ-BFF-27 — the server-validated Stripe URL is a DOCUMENT navigation, never a router push.
    await vi.waitFor(() => expect(docNavSpy).toHaveBeenCalledWith("https://checkout.stripe.com/c/pay/cs_1"));
    expect(router.state.location.pathname).toBe("/app/settings/billing");
  });

  it("the top-up + portal POSTs mint the same {url} hand-off grammar", async () => {
    const f = makeFetch({
      billing: { billing: { subscription: PAID_SUB, plans: PLANS }, balance: BALANCE },
      mutations: {
        "/app/settings/billing/topup": { ok: true, url: "https://checkout.stripe.com/c/pay/cs_top" },
        "/app/settings/billing/portal": { ok: true, url: "https://billing.stripe.com/session/bps_1" } } });
    await mountAt("/app/settings/billing", BOOT, f);
    const topup = el()!.querySelector<HTMLFormElement>('[data-topup-form="pack_10"]')!;
    await submit(topup);
    const topupPost = f.mock.calls.find(([u, i]) => String(u) === "/app/settings/billing/topup" && i != null);
    expect(JSON.parse(String((topupPost![1] as RequestInit).body))).toEqual({ packId: "pack_10" });
    await vi.waitFor(() => expect(docNavSpy).toHaveBeenCalledWith("https://checkout.stripe.com/c/pay/cs_top"));

    const portal = el()!.querySelector<HTMLFormElement>("[data-portal-form]")!;
    await submit(portal);
    const portalPost = f.mock.calls.find(([u, i]) => String(u) === "/app/settings/billing/portal" && i != null);
    expect(portalPost).toBeDefined();
    await vi.waitFor(() => expect(docNavSpy).toHaveBeenCalledWith("https://billing.stripe.com/session/bps_1"));
  });

  it("the cancel/auto-reload/waitlist POSTs carry their fields and follow the ?saved=1 redirect arm", async () => {
    const f = makeFetch({
      billing: { billing: { subscription: PAID_SUB, plans: PLANS }, balance: BALANCE } });
    await mountAt("/app/settings/billing", BOOT, f);

    const autoReload = el()!.querySelector<HTMLFormElement>("[data-auto-reload-form]")!;
    const enable = autoReload.querySelector<HTMLInputElement>('[name="enabled"]')!;
    enable.checked = true;
    const threshold = autoReload.querySelector<HTMLInputElement>('[name="thresholdCredits"]')!;
    threshold.value = "500";
    const cap = autoReload.querySelector<HTMLInputElement>('[name="monthlyCapUsd"]')!;
    cap.value = "50";
    await submit(autoReload);
    const arPost = f.mock.calls.find(([u, i]) => String(u) === "/app/settings/billing/auto-reload" && i != null);
    expect(JSON.parse(String((arPost![1] as RequestInit).body))).toMatchObject({
      enabled: "1", thresholdCredits: "500", packId: "pack_10", monthlyCapUsd: "50" });
    // The {redirect} arm is an in-router nav — the saved flash renders through validated search.
    await vi.waitFor(() => expect(el()!.querySelector("[data-saved]")).not.toBeNull());
    expect(docNavSpy).not.toHaveBeenCalled();

    const waitlist = el()!.querySelector<HTMLFormElement>("[data-waitlist-form]")!;
    const email = waitlist.querySelector<HTMLInputElement>('[name="email"]')!;
    email.value = "lead@example.com";
    const seats = waitlist.querySelector<HTMLInputElement>('[name="seats"]')!;
    seats.value = "4";
    await submit(waitlist);
    const wlPost = f.mock.calls.find(([u, i]) => String(u) === "/app/settings/billing/waitlist" && i != null);
    expect(JSON.parse(String((wlPost![1] as RequestInit).body))).toEqual({ email: "lead@example.com", seats: "4" });

    const cancel = el()!.querySelector<HTMLFormElement>("[data-cancel-form]")!;
    await submit(cancel);
    const cancelPost = f.mock.calls.find(([u, i]) => String(u) === "/app/settings/billing/cancel" && i != null);
    expect(cancelPost).toBeDefined();
  });

  it("a notice-redirect arm lands the classified copy — never an error page (REQ-BILL-16)", async () => {
    const f = makeFetch({
      mutations: {
        "/app/settings/billing/subscribe": { ok: true, redirect: "/app/settings/billing?notice=plan_waitlisted" } } });
    await mountAt("/app/settings/billing", BOOT, f);
    const form = el()!.querySelector<HTMLFormElement>('[data-subscribe-form="writer"]')!;
    await submit(form);
    await vi.waitFor(() => expect(el()!.querySelector("[data-notice]")).not.toBeNull());
    expect(el()!.querySelector("[data-notice]")?.textContent).toContain("plan isn");
    expect(docNavSpy).not.toHaveBeenCalled();
  });

  it("REQ-UX-16 — the in-flight form carries aria-busy + disabled controls, restored on settle", async () => {
    const d = (() => {
      let resolve!: (v: Response) => void;
      const promise = new Promise<Response>((r) => { resolve = r; });
      return { promise, resolve };
    })();
    const f = makeFetch({
      hold: { "/app/settings/billing/auto-reload": d.promise } });
    await mountAt("/app/settings/billing", BOOT, f);
    const form = el()!.querySelector<HTMLFormElement>("[data-auto-reload-form]")!;
    await act(async () => { fireEvent.submit(form); });
    expect(form.getAttribute("aria-busy")).toBe("true");
    expect(form.querySelector<HTMLButtonElement>("button[type='submit']")!.disabled).toBe(true);
    d.resolve(jsonResponse(200, { ok: true, redirect: "/app/settings/billing?saved=1" }));
    await vi.waitFor(() => expect(form.getAttribute("aria-busy")).toBeNull());
  });

  it("the /settings/billing alias mounts the same surface (the flag covers both mounts)", async () => {
    await mountAt("/settings/billing", BOOT, makeFetch());
    const main = el()!;
    expect(main.querySelector('[data-current-plan="free"]')).not.toBeNull();
    expect(main.querySelector('[data-subscribe-form="writer"]')).not.toBeNull();
  });

  it("an unflipped leaf hands off to the server without spending a BFF read (SsrHandoff)", async () => {
    const f = makeFetch();
    await mountAt("/app/settings/billing", bootFor({ ...SPA_ALL, "/app/settings/billing": "ssr" }), f);
    await vi.waitFor(() => expect(docNavSpy).toHaveBeenCalled());
    expect(docNavSpy.mock.calls[0]?.[0]).toContain("/app/settings/billing");
    expect(f.mock.calls.filter(([u]) => String(u) === "/bff/settings/billing")).toHaveLength(0);
  });

  it("compact (phone) withholds the purchase forms — the read-only card stays (§10.1)", async () => {
    await mountAt("/app/settings/billing", bootFor(SPA_ALL, "phone"), makeFetch());
    const main = el()!;
    expect(main.querySelector("[data-phone-blocked]")).not.toBeNull();
    expect(main.querySelector("[data-plan-card]")).not.toBeNull();
    expect(main.querySelector("[data-subscribe-form]")).toBeNull();
    expect(main.querySelector("[data-auto-reload-form]")).toBeNull();
  });

  it("axe — the mounted billing surface carries no component-level violations", async () => {
    await mountAt("/app/settings/billing", BOOT, makeFetch({
      billing: { billing: { subscription: PAID_SUB, plans: PLANS }, balance: BALANCE } }));
    await axeCheck(el()!);
  });
});

// ---- /billing/return — the Checkout return (REQ-BILL-14) ------------------------------------------

describe("GET /billing/return mounted (SPA.16)", () => {
  const BOOT = bootFor(SPA_ALL);

  it("completed renders the confirmed line + the returnTo continue link (same-origin only)", async () => {
    await mountAt("/billing/return?session_id=cs_1", BOOT, makeFetch({
      billingReturn: { checkoutReturn: CHECKOUT_COMPLETED, cancelled: false } }));
    const main = el()!;
    expect(main.querySelector('[data-checkout-state="completed"]')).not.toBeNull();
    expect(main.textContent).toContain("Payment confirmed");
    const link = main.querySelector<HTMLAnchorElement>("[data-checkout-continue]")!;
    expect(link.getAttribute("href")).toBe("/p/new-essay/run");
  });

  it("a non-same-origin returnTo degrades to the billing base — never a client-invented target", async () => {
    await mountAt("/billing/return?session_id=cs_1", BOOT, makeFetch({
      billingReturn: { checkoutReturn: { ...CHECKOUT_COMPLETED, returnTo: "https://evil.example" }, cancelled: false } }));
    const link = el()!.querySelector<HTMLAnchorElement>("[data-checkout-continue]")!;
    expect(link.getAttribute("href")).toBe("/app/settings/billing");
  });

  it("open renders the pending line; the poll cadence is the twin's server-owned pollAfterSeconds", async () => {
    await mountAt("/billing/return?session_id=cs_1", BOOT, makeFetch({
      billingReturn: { checkoutReturn: CHECKOUT_OPEN, cancelled: false, pollAfterSeconds: 5 } }));
    const main = el()!;
    expect(main.querySelector('[data-checkout-state="open"]')).not.toBeNull();
    expect(main.textContent).toContain("Confirming your payment");
    expect(main.querySelector("[data-checkout-continue]")).not.toBeNull();
  });

  it("cancelled renders the cancelled copy and stops the poll", async () => {
    const f = makeFetch({
      billingReturn: { checkoutReturn: CHECKOUT_OPEN, cancelled: true } });
    await mountAt("/billing/return?session_id=cs_1&cancelled=1", BOOT, f);
    const main = el()!;
    expect(main.querySelector('[data-checkout-state="cancelled"]')).not.toBeNull();
    expect(main.textContent).toContain("cancelled");
  });

  it("expired renders the expired copy — a settled checkout never polls", async () => {
    await mountAt("/billing/return?session_id=cs_1", BOOT, makeFetch({
      billingReturn: { checkoutReturn: CHECKOUT_EXPIRED, cancelled: false } }));
    const main = el()!;
    expect(main.querySelector('[data-checkout-state="expired"]')).not.toBeNull();
  });

  it("REQ-BFF-15 — refetchInterval reads the twin's pollAfterSeconds; absent ⇒ the poll stops", () => {
    const q = billingReturnQuery({ session_id: "cs_1" });
    const refetch = q.refetchInterval!;
    // The server's verdict, verbatim: 5 s inside the ≤30 s webhook-lag window.
    const polling = { state: { data: { checkoutReturn: CHECKOUT_OPEN, cancelled: false, pollAfterSeconds: 5 } } };
    expect(refetch(polling as never)).toBe(5000);
    // completed / expired / cancelled / past-window all answer WITHOUT pollAfterSeconds.
    for (const data of [
      { checkoutReturn: CHECKOUT_COMPLETED, cancelled: false },
      { checkoutReturn: CHECKOUT_EXPIRED, cancelled: false },
      { checkoutReturn: CHECKOUT_OPEN, cancelled: true },
      { checkoutReturn: null, cancelled: false },
    ]) {
      expect(refetch({ state: { data } } as never)).toBe(false);
    }
  });


  it("an unflipped leaf hands off — zero BFF reads (SsrHandoff)", async () => {
    const f = makeFetch();
    await mountAt("/billing/return?session_id=cs_1", bootFor({ ...SPA_ALL, "/billing/return": "ssr" }), f);
    await vi.waitFor(() => expect(docNavSpy).toHaveBeenCalled());
    expect(docNavSpy.mock.calls[0]?.[0]).toContain("/billing/return");
    expect(f.mock.calls.filter(([u]) => String(u).startsWith("/bff/billing/return"))).toHaveLength(0);
  });

  it("axe — the mounted return surface carries no component-level violations", async () => {
    await mountAt("/billing/return?session_id=cs_1", BOOT, makeFetch({
      billingReturn: { checkoutReturn: CHECKOUT_COMPLETED, cancelled: false } }));
    await axeCheck(el()!);
  });
});
