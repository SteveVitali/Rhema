import { describe, expect, it } from "vitest";
import { STRIPE_HOSTED_ORIGINS, GOOGLE_OAUTH_ORIGINS, type ProjectRow } from "@rhema/contracts";
import { createWebApp, type WebDeps } from "./server.js";
import type { DataSource } from "./data.js";

// PRB.08 — AC3: a run whose cap exceeds spendable shows the resolution panel with the Payment Link, and
// `credits.exhausted_prompt{action_taken}` fires (REQ-BETA-12; §14.6). Also the suspended-account notice
// (REQ-SPEC-24.7) and the final-month beta-plan offer (copy + link only — REQ-BETA-15). Driven via
// app.request with an in-memory data source.

const SLUG = "new-essay";
const PROJECTS: ProjectRow[] = [
  { id: "proj_new", slug: SLUG, title: "New Essay", state: { key: "draft", pill: "Draft", overlay: null, suggested: { action: "review", label: "Review" } } },
];
const PAY_LINK = "https://buy.stripe.com/test_beta_topup";

function makeDeps(opts: {
  balance?: {
    spendableCredits: number;
    suspended: boolean;
    clawbackDebt: number;
    paymentLinkUrl?: string;
    billingAccountId?: string;
    /** BILL.3 — absent exercises the fail-closed older-api shape; explicit `open` is the purchase path. */
    purchase?: "open" | "closed";
  };
  planOfferUrl?: string;
  recorded?: string[];
}): WebDeps {
  const recorded = opts.recorded ?? [];
  return {
    dataSource: {
      listProjects: async () => PROJECTS,
      checkInvite: async () => ({ ok: true }),
      previewImport: async () => { throw new Error("unused"); },
      createImport: async () => ({ draftId: "d" }),
      createRun: async () => ({ runId: "run_new", state: "queued", deduped: false }),
      getDossier: async () => { throw new Error("unused"); },
      recordDisposition: async () => ({ id: "d", findingId: "f", kind: "accept", status: "proposed" }),
      listGates: async () => [],
      decideGate: async () => {},
      recordGateActivity: async () => {},
      listDecisions: async () => [],
      answerDecision: async () => {},
      getPretriage: async () => ({ correspondenceId: "c", triaged: 0, total: 0, entries: [] }),
      getApprovalOverrides: async () => ({}),
      setApprovalOverrides: async () => {},
      getWhatChanged: async () => { throw new Error("unused"); },
      commentOnHunk: async () => { throw new Error("unused"); },
      getEditorDoc: async () => { throw new Error("unused"); },
      saveEditorDraft: async () => { throw new Error("unused"); },
      postEditorNote: async () => { throw new Error("unused"); },
      cancelEditorRun: async () => { throw new Error("unused"); },
      reviseWithEdits: async () => { throw new Error("unused"); },
      getBillingBalance: async () => opts.balance ?? { spendableCredits: 200_000, suspended: false, clawbackDebt: 0, purchase: "open" },
      recordExhaustedPrompt: async (_s, action) => { recorded.push(action); },
    } as unknown as DataSource,
    session: () => ({}),
    ...(opts.planOfferUrl ? { betaPlanOfferUrl: opts.planOfferUrl } : {}),
  };
}

// The sheet's GET facts now ride the `/bff/p/:slug/run` twin verbatim — the composition's
// `view` carries `insufficient`/`paymentLinkUrl`/`suspended`/`planOfferUrl` and the 'shown'
// telemetry still mints off the same read (SPA.27: the panel's paint is leaf-owned).
const runSheetView = async (app: ReturnType<typeof createWebApp>, query = "words=5180") =>
  (
    (await (await app.request(`/bff/p/${SLUG}/run?${query}`)).json()) as {
      runSheet: {
        view: {
          insufficient: { sentences: string[] } | null;
          paymentLinkUrl?: string;
          suspended?: boolean;
          planOfferUrl?: string;
        };
      };
    }
  ).runSheet.view;

describe("the exhaustion resolution panel (AC3; REQ-BETA-12/15; §14.6)", () => {
  it("a cap over the spendable balance flags the view insufficient, carries the link, records 'shown'", async () => {
    const recorded: string[] = [];
    const app = createWebApp(makeDeps({ balance: { spendableCredits: 10, suspended: false, clawbackDebt: 0, paymentLinkUrl: PAY_LINK, purchase: "open" }, recorded }));
    const view = await runSheetView(app);
    expect(view.insufficient).not.toBeNull(); // the leaf paints the §14.6 panel off this
    expect(view.insufficient?.sentences[0]).toContain("is more than your spendable balance");
    expect(view.insufficient?.sentences[2]).toContain("Or ask for more credits."); // beta mode — no "/ upgrade"
    expect(view.paymentLinkUrl).toBe(PAY_LINK);
    expect(view.suspended).toBeUndefined();
    expect(recorded).toEqual(["shown"]); // the impression IS the telemetry event — twin read mints it
  });

  it("a comfortable balance answers no panel, no telemetry", async () => {
    const recorded: string[] = [];
    const view = await runSheetView(createWebApp(makeDeps({ recorded })));
    expect(view.insufficient).toBeNull();
    expect(view.paymentLinkUrl).toBeUndefined();
    expect(recorded).toEqual([]);
  });

  it("the panel's Payment-Link POST records open_payment_link then 302s to the link + client_reference_id (F32)", async () => {
    const recorded: string[] = [];
    const app = createWebApp(
      makeDeps({ balance: { spendableCredits: 10, suspended: false, clawbackDebt: 0, paymentLinkUrl: PAY_LINK, purchase: "open", billingAccountId: "ba_123" }, recorded }),
    );
    const res = await app.request(`/p/${SLUG}/exhausted`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ action_taken: "open_payment_link" }).toString(),
      redirect: "manual",
    });
    expect(res.status).toBe(302);
    // F32 (PRB.19): the Stripe-originated checkout joins via client_reference_id — a bare link lands unresolved.
    expect(res.headers.get("location")).toBe(`${PAY_LINK}?client_reference_id=ba_123`);
    expect(recorded).toEqual(["open_payment_link"]);
  });

  it("the composed link preserves the configured URL's existing query and encodes the account id", async () => {
    const app = createWebApp(
      makeDeps({
        balance: {
          spendableCredits: 10, suspended: false, clawbackDebt: 0,
          paymentLinkUrl: "https://buy.stripe.com/test_link?prefilled_promo_code=ABC",
          billingAccountId: "ba x+y", // reserved chars → percent-encoded by URL
          purchase: "open",
        },
      }),
    );
    const res = await app.request(`/p/${SLUG}/exhausted`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ action_taken: "open_payment_link" }).toString(),
      redirect: "manual",
    });
    const loc = res.headers.get("location")!;
    const url = new URL(loc);
    expect(url.origin + url.pathname).toBe("https://buy.stripe.com/test_link");
    expect(url.searchParams.get("prefilled_promo_code")).toBe("ABC");
    expect(url.searchParams.get("client_reference_id")).toBe("ba x+y");
  });

  it("a balance read without a billingAccountId redirects to the bare link (never breaks the redirect)", async () => {
    const app = createWebApp(makeDeps({ balance: { spendableCredits: 10, suspended: false, clawbackDebt: 0, paymentLinkUrl: PAY_LINK, purchase: "open" } }));
    const res = await app.request(`/p/${SLUG}/exhausted`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ action_taken: "open_payment_link" }).toString(),
      redirect: "manual",
    });
    expect(res.headers.get("location")).toBe(PAY_LINK);
  });

  it("an exhausted POST with no configured link returns to the sheet (no open redirect)", async () => {
    const recorded: string[] = [];
    const app = createWebApp(makeDeps({ balance: { spendableCredits: 10, suspended: false, clawbackDebt: 0, purchase: "open" }, recorded }));
    const res = await app.request(`/p/${SLUG}/exhausted`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ action_taken: "open_payment_link" }).toString(),
      redirect: "manual",
    });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(`/p/${SLUG}/run`);
    expect(recorded).toEqual(["open_payment_link"]);
  });

  it("purchase=closed drops the link from the view and refuses the hand-off POST (BILL.3)", async () => {
    const recorded: string[] = [];
    const app = createWebApp(makeDeps({
      balance: { spendableCredits: 10, suspended: false, clawbackDebt: 0, paymentLinkUrl: PAY_LINK, purchase: "closed" },
      recorded,
    }));
    // the composition strips the link (purchaseClosed ⇒ the leaf can only paint the paused note)
    const view = await runSheetView(app);
    expect(view.insufficient).not.toBeNull();
    expect(view.paymentLinkUrl).toBeUndefined();

    const res = await app.request(`/p/${SLUG}/exhausted`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ action_taken: "open_payment_link" }).toString(),
      redirect: "manual",
    });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(`/p/${SLUG}/run?notice=purchase_paused`);
    // the click is still telemetry (the user acted), but no Stripe URL is emitted.
    expect(recorded).toEqual(["shown", "open_payment_link"]);
  });

  it("an absent purchase field fails closed and a non-Stripe link is never followed (BILL.3)", async () => {
    const app = createWebApp(makeDeps({
      balance: { spendableCredits: 10, suspended: false, clawbackDebt: 0, paymentLinkUrl: PAY_LINK },
    }));
    const res = await app.request(`/p/${SLUG}/exhausted`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ action_taken: "open_payment_link" }).toString(),
      redirect: "manual",
    });
    expect(res.headers.get("location")).toBe(`/p/${SLUG}/run?notice=purchase_paused`);

    const rogue = createWebApp(makeDeps({
      balance: { spendableCredits: 10, suspended: false, clawbackDebt: 0, paymentLinkUrl: "https://evil.example/pay", purchase: "open" },
    }));
    const res2 = await rogue.request(`/p/${SLUG}/exhausted`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ action_taken: "open_payment_link" }).toString(),
      redirect: "manual",
    });
    expect(res2.status).toBe(302);
    expect(res2.headers.get("location")).toBe(`/p/${SLUG}/run`);
  });

  it("the CSP form-action is 'self' plus exactly the Stripe- and Google-hosted origins — no wildcard (BILL.3/MAINT.5)", async () => {
    const app = createWebApp(makeDeps({}));
    const res = await app.request(`/p/${SLUG}/run?words=5180`);
    const csp = res.headers.get("content-security-policy") ?? "";
    const formAction = /(?:^|;)\s*form-action\s+([^;]+)/.exec(csp)?.[1]?.trim().split(/\s+/);
    expect(formAction).toEqual(["'self'", ...STRIPE_HOSTED_ORIGINS, ...GOOGLE_OAUTH_ORIGINS]);
    expect(csp).not.toContain("*");
  });
});

describe("the suspended account (REQ-SPEC-24.7)", () => {
  it("the view flags suspended and carries no link — a suspended account is never upsold", async () => {
    const view = await runSheetView(
      createWebApp(makeDeps({ balance: { spendableCredits: 10, suspended: true, clawbackDebt: 40, paymentLinkUrl: PAY_LINK } })),
    );
    expect(view.suspended).toBe(true);
    expect(view.paymentLinkUrl).toBeUndefined();
  });
});

describe("the final-month offer line (REQ-BETA-15 — copy + link only)", () => {
  it("the offer URL rides the view only when the deploy configured it; no subscription machinery", async () => {
    const view = await runSheetView(createWebApp(makeDeps({ planOfferUrl: "https://rhema.example/beta-plan" })));
    expect(view.planOfferUrl).toBe("https://rhema.example/beta-plan");

    const without = await runSheetView(createWebApp(makeDeps({})));
    expect(without.planOfferUrl).toBeUndefined();
  });
});
