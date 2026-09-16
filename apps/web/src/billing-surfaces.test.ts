import { describe, expect, it } from "vitest";
import type { ProjectRow } from "@rhema/contracts";
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
  balance?: { spendableCredits: number; suspended: boolean; clawbackDebt: number; paymentLinkUrl?: string };
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
      getBillingBalance: async () => opts.balance ?? { spendableCredits: 200_000, suspended: false, clawbackDebt: 0 },
      recordExhaustedPrompt: async (_s, action) => { recorded.push(action); },
    } as unknown as DataSource,
    session: () => ({}),
    ...(opts.planOfferUrl ? { betaPlanOfferUrl: opts.planOfferUrl } : {}),
  };
}

describe("the exhaustion resolution panel (AC3; REQ-BETA-12/15; §14.6)", () => {
  it("a cap over the spendable balance renders the panel WITH the Payment Link and records 'shown'", async () => {
    const recorded: string[] = [];
    const app = createWebApp(makeDeps({ balance: { spendableCredits: 10, suspended: false, clawbackDebt: 0, paymentLinkUrl: PAY_LINK }, recorded }));
    const res = await app.request(`/p/${SLUG}/run?words=5180`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('data-insufficient="true"');
    expect(html).toContain("is more than your spendable balance"); // §14.6 sentence 1
    expect(html).toContain("Or ask for more credits."); // §14.6 sentence 3 (beta mode — no "/ upgrade")
    // the Payment-Link action — a form POST to the telemetry route, carrying the link for verification.
    expect(html).toContain(`data-payment-link="${PAY_LINK}"`);
    expect(html).toContain(`formaction="/p/${SLUG}/exhausted"`);
    expect(html).toContain('value="open_payment_link"');
    expect(recorded).toEqual(["shown"]); // the impression IS the telemetry event
  });

  it("a comfortable balance renders the estimate box, no panel, no telemetry", async () => {
    const recorded: string[] = [];
    const app = createWebApp(makeDeps({ recorded }));
    const res = await app.request(`/p/${SLUG}/run?words=5180`);
    const html = await res.text();
    expect(html).toContain("data-estimate-box");
    expect(html).not.toContain('data-insufficient="true"');
    expect(recorded).toEqual([]);
  });

  it("the panel's Payment-Link POST records open_payment_link then 302s to the link", async () => {
    const recorded: string[] = [];
    const app = createWebApp(makeDeps({ balance: { spendableCredits: 10, suspended: false, clawbackDebt: 0, paymentLinkUrl: PAY_LINK }, recorded }));
    const res = await app.request(`/p/${SLUG}/exhausted`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ action_taken: "open_payment_link" }).toString(),
      redirect: "manual",
    });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(PAY_LINK);
    expect(recorded).toEqual(["open_payment_link"]);
  });

  it("an exhausted POST with no configured link returns to the sheet (no open redirect)", async () => {
    const recorded: string[] = [];
    const app = createWebApp(makeDeps({ balance: { spendableCredits: 10, suspended: false, clawbackDebt: 0 }, recorded }));
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
});

describe("the suspended account (REQ-SPEC-24.7)", () => {
  it("the sheet renders the suspended notice with Run disabled — never the Payment Link", async () => {
    const recorded: string[] = [];
    const app = createWebApp(makeDeps({ balance: { spendableCredits: 10, suspended: true, clawbackDebt: 40, paymentLinkUrl: PAY_LINK }, recorded }));
    const res = await app.request(`/p/${SLUG}/run?words=5180`);
    const html = await res.text();
    expect(html).toContain('data-suspended="true"');
    expect(html).toContain("paused while a payment dispute");
    expect(html).not.toContain(`data-payment-link`); // a suspended account is never upsold
  });
});

describe("the final-month beta-plan offer (REQ-BETA-15 — copy + link only)", () => {
  it("renders only when the deploy configured the link; no subscription machinery", async () => {
    const app = createWebApp(makeDeps({ planOfferUrl: "https://rhema.example/beta-plan" }));
    const res = await app.request(`/p/${SLUG}/run?words=5180`);
    const html = await res.text();
    expect(html).toContain("data-plan-offer");
    expect(html).toContain("Founding users keep the beta rate");
    expect(html).toContain('href="https://rhema.example/beta-plan"');

    const without = createWebApp(makeDeps({}));
    const res2 = await without.request(`/p/${SLUG}/run?words=5180`);
    expect(await res2.text()).not.toContain("data-plan-offer");
  });
});
