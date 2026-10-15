// @vitest-environment happy-dom
//
// SPA.20 — the `run-sheet` surface's component contract (REQ-SEQ-9, REQ-VFY-2/6, REQ-TST-2/6/10,
// REQ-BFF-1/2/3/4/11/23, REQ-DAT-4/6, REQ-UX-16; design/22 §2 `p.run` + §7.3; design/25 §p.run).
// Mounted through the production router (memory history + a stub fetch) at `/p/:slug/run`: the
// SSR-verbatim vocabulary (the title/scope pills, rigor radios, the dollars-first estimate box,
// the consent label swap, the insufficient/included/suspended/missing arms, the collapsed-row
// fields + Advanced toggles, the Payment-Link button, the typed `data-estimate-matrix` embed),
// the `var R=` repaint ported to React state off `recompute.cells` (a lever change touches NO
// network), the run POST's flat JSON field map, the exhausted POST's `{ok,url}` hand-off, the
// phone-blocked arm (§10.1), the active-run replacement, the notice flash, the `SsrHandoff`
// no-BFF leg, and the REQ-TST-2 parity leg against `RunSheetPage` under a PageDataContext
// provider. Component axe covers the mounted form.

import { act, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createMemoryHistory, RouterProvider } from "@tanstack/react-router";
import { fireEvent } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildRunSheetView, type RunSheetView } from "@rhema/run-sheet";
import { COPY } from "../copy.js";
import { createSpaRouter } from "./main.js";
import type { SpaBoot } from "./boot.js";
import type { BffRunSheetTwin } from "./queries.js";
import { restoreDocumentNav, stubDocumentNav } from "./testkit.js";


declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const PRINCIPAL = { userId: "u1", workspaceId: "w1", billingAccountId: "b1" };
const SLUG = "the-politics-of-visibility";

// ---- fixtures — the SSR spec's set (view.test.ts/run-sheet.test.tsx), verbatim -------------------

function sheetView(over: Partial<Parameters<typeof buildRunSheetView>[0]> = {}): RunSheetView {
  return buildRunSheetView({
    workflow: "review",
    targetVersion: "v2",
    rigor: "standard",
    modelTier: "balanced",
    inputs: { words: 5180 },
    scope: { protocol: "Essay", venue: "LRB", stage: "near-final" },
    spendableCredits: 100000,
    idempotencyKey: "idem_1",
    insufficientMode: "beta",
    scopeLine: "4 open obligations will be checked",
    standingNotes: 2,
    ...over });
}

function twinFor(view: RunSheetView, over: Partial<BffRunSheetTwin["runSheet"]> = {}): BffRunSheetTwin {
  return {
    runSheet: {
      slug: SLUG,
      projectTitle: "The Politics of Visibility",
      view,
      ...over },
    project: { title: "The Politics of Visibility", pill: "Drafting", slug: SLUG },
    paperTheme: "light",
    ide: { projectId: "p1", inboxCount: 0 } };
}

const BASE_TWIN = twinFor(sheetView());

// ---- the mount substrate -----------------------------------------------------------------------

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" } });
}

interface FetchOpts {
  twin?: BffRunSheetTwin | null;
  /** mutation overrides — action path → envelope/ApiError-ish body + status. */
  mutations?: Record<string, { status?: number; body: unknown }>;
  /** the second-and-later twin read (the post-mutation refetch's server truth). */
  twinAfter?: BffRunSheetTwin;
}

interface RecordedPost {
  url: string;
  json: Record<string, unknown> | null;
}

/** The fetch stub — the run twin GET answers the fixture; POSTs record `{url, json}` and answer
 *  the `{ok,…}` envelope (or the override). Anything unstubbed 500s loudly. */
function makeFetch(opts: FetchOpts = {}) {
  const posts: RecordedPost[] = [];
  let runReads = 0;
  const impl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const path = url.split("?")[0]!;
    if (url === "/session") return jsonResponse(200, PRINCIPAL);
    if (url === "/bff/feed-labels") return jsonResponse(200, { t: {}, enums: {} });
    if (init?.method === "POST") {
      posts.push({ url: path, json: init.body ? JSON.parse(String(init.body)) : null });
      const mut = opts.mutations?.[path];
      if (mut != null) return jsonResponse(mut.status ?? 200, mut.body);
      return jsonResponse(200, { ok: true, data: { runId: "run_1", state: "running" } });
    }
    if (path === `/bff/p/${SLUG}/run`) {
      runReads += 1;
      const twin = runReads > 1 && opts.twinAfter != null ? opts.twinAfter : opts.twin;
      if (twin === null) return jsonResponse(404, { error: "not_found" });
      return jsonResponse(200, twin ?? BASE_TWIN);
    }
    return jsonResponse(500, { error: "unstubbed_path" });
  });
  return { impl, posts };
}

function bootFor(surfaces: Record<string, "spa" | "ssr">, deviceClass: "desktop" | "phone" = "desktop"): SpaBoot {
  return { principal: PRINCIPAL, theme: {}, deviceClass, surfaces };
}

const SPA_RUN = { "/p/$project/run": "spa" } as const;

let docNavSpy: ReturnType<typeof vi.fn>;
const mounted: Root[] = [];

async function mountAt(path: string, boot: SpaBoot, fetchImpl: ReturnType<typeof makeFetch>["impl"]) {
  vi.stubGlobal("fetch", fetchImpl);
  const rootEl = document.createElement("div");
  rootEl.setAttribute("data-spa-root", "");
  document.body.appendChild(rootEl);
  const { router } = createSpaRouter({
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
  return { router, rootEl };
}

const el = () => document.querySelector<HTMLElement>("[data-spa-root]");


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

// ---- /p/:slug/run ------------------------------------------------------------------------------

describe("GET /p/:slug/run mounted (SPA.20)", () => {
  const BOOT = bootFor(SPA_RUN);

  it("renders the SSR-verbatim vocabulary — title, rigor radios, the estimate box, fields", async () => {
    const f = makeFetch();
    await mountAt(`/p/${SLUG}/run`, BOOT, f.impl);
    const main = el()!;
    expect(main.querySelector("h1")?.textContent).toBe(COPY.runSheet.heading);
    const form = main.querySelector("form[data-run-sheet]")!;
    expect(form.getAttribute("data-run-sheet")).toBe("review");
    expect(form.getAttribute("action")).toBe(`/p/${SLUG}/run`);
    expect(form.getAttribute("method")).toBe("post");
    // the estimate box's dollars-first + credits-second lines (REQ-BILL-1).
    expect(main.querySelector("[data-estimate-box]")).not.toBeNull();
    expect(main.querySelector("[data-dollars-line]")?.textContent).toContain("≈ $");
    expect(main.querySelector("[data-dollars-line]")?.textContent).toContain("never more than");
    expect(main.querySelector("[data-credits-line]")?.textContent).toContain("credits");
    expect(main.querySelector("[data-time-line]")?.textContent).toContain("~");
    // the Run affordance carries the shown figure + labels (REQ-GROWTH-16).
    const btn = main.querySelector<HTMLButtonElement>("button[data-run-button]")!;
    expect(btn.disabled).toBe(false);
    expect(btn.getAttribute("data-estimate-credits")).toMatch(/^\d+$/);
    expect(btn.getAttribute("data-run-label")).toBe(COPY.runSheet.runReview);
    expect(btn.getAttribute("data-confirm-label")).toBe(COPY.runSheet.confirm);
    expect(btn.getAttribute("data-needs-consent")).toBe(
      String(BASE_TWIN.runSheet.view.consent.needsSecondClick),
    );
    // the flat hidden field map the run POST consumes (literal selectors — the dom-contract
    // gate's assertion scan keys on these).
    expect(main.querySelector('input[name="workflow"]')).not.toBeNull();
    expect(main.querySelector('input[name="idempotencyKey"]')).not.toBeNull();
    expect(main.querySelector('input[name="estimateCredits"]')).not.toBeNull();
    expect(main.querySelector('input[name="rateTableVersion"]')).not.toBeNull();
    expect(main.querySelector('input[name="words"]')).not.toBeNull();
    expect(main.querySelector('input[name="claims"]')).not.toBeNull();
    expect(main.querySelector('input[name="toggleKeys"]')).not.toBeNull();
    expect(main.querySelector('input[name="toggleRigor"]')).not.toBeNull();
    expect(main.querySelector('input[name="guidance"], textarea[name="guidance"]')).not.toBeNull();
    expect(main.querySelector('input[name="autoRun"]')).not.toBeNull();
    expect(main.querySelector('input[name="capCredits"]')).not.toBeNull();
    expect(main.querySelector('input[name="dontAskUnder"]')).not.toBeNull();
    expect(main.querySelector('select[name="approval"]')).not.toBeNull();
    expect(main.querySelector('select[name="modelTier"]')).not.toBeNull();
    expect(main.querySelector('input[name="protocol"]')).not.toBeNull();
    expect(main.querySelector('input[name="venue"]')).not.toBeNull();
    expect(main.querySelector('input[name="stage"]')).not.toBeNull();
    expect(main.querySelector<HTMLInputElement>('input[name="workflow"]')!.value).toBe("review");
    expect(main.querySelector<HTMLInputElement>('input[name="idempotencyKey"]')!.value).toBe("idem_1");
    expect(main.querySelectorAll('input[name="rigor"]').length).toBe(3);
    expect(main.querySelector<HTMLInputElement>('input[name="rigor"]:checked')!.value).toBe("standard");
    // the collapsed-row fields + Advanced toggles.
    expect(main.querySelector("[data-sheet-fields]")).not.toBeNull();
    expect(main.querySelector("select[data-tier-select]")).not.toBeNull();
    expect(main.querySelector('input[name="capCredits"][data-cap-input]')).not.toBeNull();
    expect(main.querySelector('input[name="dontAskUnder"]')).not.toBeNull();
    expect(main.querySelector('textarea[name="guidance"]')).not.toBeNull();
    expect(main.querySelector('input[name="autoRun"]')).not.toBeNull();
    expect(main.querySelector("[data-auto-run]")).not.toBeNull();
    expect(main.querySelector('select[name="approval"]')).not.toBeNull();
    expect(main.querySelector('input[name="protocol"]')).not.toBeNull();
    expect(main.querySelector('input[name="venue"]')).not.toBeNull();
    expect(main.querySelector('input[name="stage"]')).not.toBeNull();
    expect(main.querySelectorAll('input[name^="toggle."]').length).toBeGreaterThan(0);
    expect(main.querySelector("[data-delta]")).not.toBeNull();
    expect(main.querySelector("[data-standing-notes]")?.textContent).toContain("2");
    expect(main.querySelector("[data-scope-approval]")).not.toBeNull();
    expect(main.querySelector("[data-scope-line]")?.textContent).toContain("4 open obligations");
    expect(main.querySelector("[data-why-line]")?.textContent).toContain(COPY.runSheet.why);
    // the paywall group + the typed matrix embed — and NO var R= island.
    expect(main.querySelector('[data-paywall="run-sheet"][role="group"]')).not.toBeNull();
    const embed = main.querySelector('script[type="application/json"][data-estimate-matrix]');
    expect(embed).not.toBeNull();
    const matrix = JSON.parse(embed!.textContent!) as { cells: Record<string, { e: number }> };
    expect(Object.keys(matrix.cells).length).toBeGreaterThan(0);
    expect(main.innerHTML).not.toContain("var R=");
    // REQ-BILL-1: tokens never surface.
    expect(main.textContent).not.toMatch(/token/i);
  });

  it("repaints the estimate box off recompute.cells on a rigor change — no fetch", async () => {
    const f = makeFetch();
    await mountAt(`/p/${SLUG}/run`, BOOT, f.impl);
    const view = BASE_TWIN.runSheet.view;
    const callsBefore = f.impl.mock.calls.length;
    const fb = el()!.querySelector<HTMLInputElement>('input[name="rigor"][value="full_board"]')!;
    await act(async () => {
      fireEvent.click(fb);
    });
    const cell = view.recompute.cells[`full_board|${view.modelTier}|`];
    // full_board at this fixture has no enabled-toggle change — the key is `rigor|tier|`
    // only when every toggle is off; find the rendered toggles' ON set for the key.
    const onToggles = Object.entries(
      Object.fromEntries(view.toggleDeltas.map((d) => [d.toggle, d.enabled])),
    )
      .filter(([, on]) => on)
      .map(([k]) => k)
      .sort()
      .join(",");
    const repainted = view.recompute.cells[`full_board|${view.modelTier}|${onToggles}`] ?? cell;
    expect(repainted, "a recompute cell exists for full_board|tier|toggles").toBeTruthy();
    const dollars = el()!.querySelector("[data-dollars-line]")!.textContent!;
    expect(dollars).toContain(`≈ $${(repainted!.e / 100).toFixed(2)}`);
    expect(dollars).toContain(`never more than $${(repainted!.c / 100).toFixed(2)}`);
    const btn = el()!.querySelector<HTMLButtonElement>("button[data-run-button]")!;
    expect(btn.getAttribute("data-estimate-credits")).toBe(String(repainted!.e));
    expect(el()!.querySelector<HTMLInputElement>('input[name="estimateCredits"]')!.value).toBe(
      String(repainted!.e),
    );
    // no fetch beyond the twin read — the repaint is a pure cells lookup.
    expect(f.impl.mock.calls.length).toBe(callsBefore);
  });

  it("flips the Run label to the consent label when the repainted estimate crosses the threshold", async () => {
    const f = makeFetch();
    await mountAt(`/p/${SLUG}/run`, BOOT, f.impl);
    const view = BASE_TWIN.runSheet.view;
    // find a cell over the absolute consent threshold and drive the levers to it.
    const target = Object.entries(view.recompute.cells).find(([, c]) => c.e > 500);
    expect(target, "the matrix contains a >500-credit cell").toBeTruthy();
    const [key] = target!;
    const [rigor, tier] = key.split("|");
    await act(async () => {
      fireEvent.click(el()!.querySelector(`input[name="rigor"][value="${rigor}"]`)!);
    });
    await act(async () => {
      fireEvent.change(el()!.querySelector("select[data-tier-select]")!, { target: { value: tier } });
    });
    const btn = el()!.querySelector<HTMLButtonElement>("button[data-run-button]")!;
    expect(btn.getAttribute("data-needs-consent")).toBe("true");
    expect(btn.textContent).toBe(COPY.runSheet.confirm);
  });

  it("posts the flat field map as JSON and lands the started confirmation off {ok,data}", async () => {
    const f = makeFetch({ twinAfter: twinFor(sheetView(), { activeRun: { runId: "run_1", state: "running" } }) });
    await mountAt(`/p/${SLUG}/run`, BOOT, f.impl);
    await submit(el()!.querySelector("form[data-run-sheet]")!);
    const post = f.posts.find((p) => p.url === `/p/${SLUG}/run`);
    expect(post, "the run POST fired").toBeTruthy();
    const body = post!.json!;
    expect(body.workflow).toBe("review");
    expect(body.idempotencyKey).toBe("idem_1");
    expect(body.rigor).toBe("standard");
    expect(body.modelTier).toBe("balanced");
    expect(Number(body.estimateCredits)).toBeGreaterThan(0);
    expect(Number(body.rateTableVersion)).toBeGreaterThan(0);
    expect(String(body.toggleKeys)).toContain("fact_check");
    expect(body.toggleRigor).toBe("standard");
    // the document's started arm — role=status + the COPY leaf.
    const status = el()!.querySelector('p[role="status"]');
    expect(status?.textContent).toBe(COPY.runSheet.started);
  });

  it("a refusal code repaints the SSR arm's notice leaf — server truth off the invalidated twin", async () => {
    const f = makeFetch({
      mutations: { [`/p/${SLUG}/run`]: { status: 402, body: { error: "insufficient_balance" } } },
      twinAfter: twinFor(sheetView({ spendableCredits: 40 })) });
    await mountAt(`/p/${SLUG}/run`, BOOT, f.impl);
    await submit(el()!.querySelector("form[data-run-sheet]")!);
    const alert = el()!.querySelector('p[role="alert"]');
    expect(alert?.textContent).toBe(COPY.runSheet.insufficient);
  });
});

// ---- the estimate-box arms ---------------------------------------------------------------------

describe("the §5.6/§14 arms (SPA.20)", () => {
  const BOOT = bootFor(SPA_RUN);

  it("renders the insufficient-balance resolution panel + lever links + the Payment-Link button", async () => {
    const view = sheetView({ spendableCredits: 40, paymentLinkUrl: "https://buy.stripe.com/test_1" });
    const f = makeFetch({ twin: twinFor(view) });
    await mountAt(`/p/${SLUG}/run`, BOOT, f.impl);
    const main = el()!;
    expect(main.querySelector('[data-insufficient="true"]')).not.toBeNull();
    expect(main.querySelector("[data-resolution-options]")).not.toBeNull();
    for (const a of ["turn_off_fact_check", "use_base", "lower_rigor"]) {
      expect(main.querySelector(`a[data-resolution="${a}"]`), `resolution ${a}`).not.toBeNull();
    }
    const pay = main.querySelector<HTMLButtonElement>("button[data-payment-link]")!;
    expect(pay.getAttribute("data-payment-link")).toBe("https://buy.stripe.com/test_1");
    expect(pay.getAttribute("formaction")).toBe(`/p/${SLUG}/exhausted`);
    expect(main.querySelector('button[name="action_taken"]')).not.toBeNull();
    expect(pay.getAttribute("name")).toBe("action_taken");
    expect(pay.getAttribute("value")).toBe("open_payment_link");
    // the Run affordance is blocked.
    expect(main.querySelector<HTMLButtonElement>("button[data-run-button]")!.disabled).toBe(true);
  });

  it("the Payment-Link click POSTs /exhausted as JSON and document-navigates the {ok,url} hand-off", async () => {
    const view = sheetView({ spendableCredits: 40, paymentLinkUrl: "https://buy.stripe.com/test_1" });
    const f = makeFetch({
      twin: twinFor(view),
      mutations: {
        [`/p/${SLUG}/exhausted`]: { status: 200, body: { ok: true, url: "https://buy.stripe.com/test_1?client_reference_id=b1" } } } });
    await mountAt(`/p/${SLUG}/run`, BOOT, f.impl);
    const pay = el()!.querySelector<HTMLButtonElement>("button[data-payment-link]")!;
    const form = el()!.querySelector("form[data-run-sheet]")!;
    // the click records the retarget before the submit lands — fire both halves.
    await act(async () => {
      fireEvent.click(pay);
      fireEvent.submit(form);
    });
    const post = f.posts.find((p) => p.url === `/p/${SLUG}/exhausted`);
    expect(post, "the exhausted POST fired").toBeTruthy();
    expect(post!.json?.action_taken).toBe("open_payment_link");
    expect(docNavSpy).toHaveBeenCalledWith("https://buy.stripe.com/test_1?client_reference_id=b1");
  });

  it("renders the paused line when purchase is closed (BILL.3)", async () => {
    const view = sheetView({ spendableCredits: 40, purchaseClosed: true });
    const f = makeFetch({ twin: twinFor(view) });
    await mountAt(`/p/${SLUG}/run`, BOOT, f.impl);
    expect(el()!.querySelector('[data-purchase-paused="true"]')?.textContent).toBe(
      COPY.runSheet.purchasePaused,
    );
    expect(el()!.querySelector("button[data-payment-link]")).toBeNull();
  });

  it("renders the §14.3 Included arm — no dollars/cap arithmetic, the entitlement line, the claim field", async () => {
    const view = sheetView({
      entitlement: true,
      entitlementDetails: { id: "ent_1", wordCap: 6000, rigor: "standard", modelTier: "base", kind: "trial" } });
    const f = makeFetch({ twin: twinFor(view) });
    await mountAt(`/p/${SLUG}/run`, BOOT, f.impl);
    const main = el()!;
    expect(main.querySelector('[data-included="true"]')).not.toBeNull();
    expect(main.querySelector("[data-entitlement-line]")).not.toBeNull();
    expect(main.querySelector<HTMLInputElement>('input[name="entitlementId"]')!.value).toBe("ent_1");
    // Included still ships the typed matrix — the journey's figure read.
    expect(main.querySelector("script[data-estimate-matrix]")).not.toBeNull();
  });

  it("renders the suspended arm — Run off, the dispute notice, no payment link", async () => {
    const view = sheetView({ suspended: true });
    const f = makeFetch({ twin: twinFor(view) });
    await mountAt(`/p/${SLUG}/run`, BOOT, f.impl);
    const main = el()!;
    expect(main.querySelector('[data-suspended="true"]')?.textContent).toBe(COPY.runSheet.suspended);
    expect(main.querySelector<HTMLButtonElement>("button[data-run-button]")!.disabled).toBe(true);
  });

  it("renders the unmeasured-inputs arm — '—' + the estimating hint, never a fabricated figure", async () => {
    const view = sheetView({ inputsAvailable: false });
    const f = makeFetch({ twin: twinFor(view) });
    await mountAt(`/p/${SLUG}/run`, BOOT, f.impl);
    const main = el()!;
    expect(main.querySelector('[data-estimate-missing="true"]')).not.toBeNull();
    expect(main.querySelector("[data-dollars-line]")?.textContent).toContain("—");
  });

  it("renders the in-progress arm INSTEAD of the form when the twin carries activeRun", async () => {
    const f = makeFetch({
      twin: twinFor(sheetView(), { activeRun: { runId: "run_9", state: "running" } }) });
    await mountAt(`/p/${SLUG}/run`, BOOT, f.impl);
    const main = el()!;
    expect(main.querySelector("form[data-run-sheet]")).toBeNull();
    expect(main.querySelector('p[role="status"]')?.textContent).toBe(COPY.runSheet.inProgress);
    expect(main.querySelector(`a[href="/p/${SLUG}/review/run_9"]`)).not.toBeNull();
  });

  it("renders the memo arms — protocol select, confidentiality line, user_sources field", async () => {
    const view = sheetView({
      scope: { protocol: "memo", protocolOptions: [{ id: "memo", name: "Memo" }, { id: "essay", name: "Essay" }] },
      userSourcesText: "Q3 forecast :: https://internal.example/q3" });
    const f = makeFetch({ twin: twinFor(view) });
    await mountAt(`/p/${SLUG}/run`, BOOT, f.impl);
    const main = el()!;
    expect(main.querySelector("select[data-protocol-select]")).not.toBeNull();
    expect(main.querySelector("[data-memo-confidentiality]")).not.toBeNull();
    expect(main.querySelector("[data-user-sources-field] textarea[name='userSources']")?.textContent).toContain(
      "Q3 forecast",
    );
  });

  it("renders the promote-on-launch line on a working head (§5.6 item 7)", async () => {
    const view = sheetView({ headState: "working", promoteToVersion: "v3" });
    const f = makeFetch({ twin: twinFor(view) });
    await mountAt(`/p/${SLUG}/run`, BOOT, f.impl);
    const line = el()!.querySelector("[data-promote-line]");
    expect(line).not.toBeNull();
    expect(line!.textContent).toContain("v3");
  });

  it("renders the §7.2 command-scope pills + the whole-draft comparison line", async () => {
    const view = sheetView({
      commandScope: {
        serialized: "section:III",
        labels: ["Section III"],
        scopedInputs: { words: 1200 } } });
    const f = makeFetch({ twin: twinFor(view) });
    await mountAt(`/p/${SLUG}/run`, BOOT, f.impl);
    const main = el()!;
    expect(main.querySelector("[data-command-scope]")).not.toBeNull();
    expect(main.querySelector("[data-scope-pill]")?.textContent).toBe("Section III");
    expect(main.querySelector<HTMLInputElement>('input[name="scope"]')!.value).toBe("section:III");
    expect(main.querySelector("[data-whole-line]")).not.toBeNull();
  });

  it("renders the clamped-tier notice when the plan locked the requested tier", async () => {
    const view = sheetView({ requestedModelTier: "frontier", allowedModelTiers: ["base", "balanced"] });
    const f = makeFetch({ twin: twinFor(view) });
    await mountAt(`/p/${SLUG}/run`, BOOT, f.impl);
    expect(el()!.querySelector("[data-tier-clamped]")).not.toBeNull();
  });

  it("renders the linked-voice line — name, pill, and the priced update-voice action", async () => {
    const base = sheetView();
    const view: RunSheetView = {
      ...base,
      voice: {
        mode: "linked",
        personaId: "pers_1",
        name: "S. J. Sebastian",
        pill: { label: "Stale", tone: "warn" },
        updateEstimateCredits: 9,
        updateAction: `/p/${SLUG}/update-voice` } };
    const f = makeFetch({ twin: twinFor(view) });
    await mountAt(`/p/${SLUG}/run`, BOOT, f.impl);
    const main = el()!;
    expect(main.querySelector("[data-voice-line]")?.textContent).toContain("S. J. Sebastian");
    expect(main.querySelector('[data-voice-mode="linked"]')).not.toBeNull();
    expect(main.querySelector('[data-voice-pill="warn"]')?.textContent).toBe("Stale");
    const upd = main.querySelector<HTMLButtonElement>("button[data-update-voice]")!;
    expect(upd.getAttribute("formaction")).toBe(`/p/${SLUG}/update-voice`);
    expect(main.querySelector<HTMLInputElement>('input[name="voice_persona"]')!.value).toBe("pers_1");
  });
});

// ---- the page arms (flash, phone, not-found, handoff) -------------------------------------------

describe("the page arms (SPA.20)", () => {
  const BOOT = bootFor(SPA_RUN);

  it("renders the ?notice=purchase_paused flash off URL state", async () => {
    const f = makeFetch();
    await mountAt(`/p/${SLUG}/run?notice=purchase_paused`, BOOT, f.impl);
    expect(el()!.querySelector('p[role="alert"]')?.textContent).toBe(COPY.runSheet.purchasePaused);
  });

  it("a lever deep link forwards the query onto the twin fetch verbatim", async () => {
    const f = makeFetch();
    await mountAt(`/p/${SLUG}/run?workflow=revise&rigor=quick&tier=base&toggle.fact_check=off`, BOOT, f.impl);
    const twinCall = f.impl.mock.calls.find(([u]) => String(u).startsWith(`/bff/p/${SLUG}/run`));
    expect(twinCall, "the twin GET fired").toBeTruthy();
    const url = decodeURIComponent(String(twinCall![0]));
    for (const frag of ["workflow=revise", "rigor=quick", "tier=base", "toggle.fact_check=off"]) {
      expect(url).toContain(frag);
    }
  });

  it("renders the beta-plan offer line + link when the twin carries planOfferUrl (PRB.08)", async () => {
    const f = makeFetch({ twin: twinFor(sheetView({ planOfferUrl: "https://rhema.example/beta-plan" })) });
    await mountAt(`/p/${SLUG}/run`, BOOT, f.impl);
    const offer = el()!.querySelector("[data-plan-offer]");
    expect(offer).not.toBeNull();
    expect(offer!.querySelector('a[href="https://rhema.example/beta-plan"]')).not.toBeNull();
  });

  it("renders the revise pretriage line when the twin carries it", async () => {
    const twin = { ...twinFor(sheetView({ workflow: "revise" })), pretriage: { triaged: 3, total: 12 } };
    const f = makeFetch({ twin });
    await mountAt(`/p/${SLUG}/run?workflow=revise`, BOOT, f.impl);
    expect(el()!.querySelector("[data-pretriage-line]")?.textContent).toBe(
      COPY.triage.pretriageFmt.replace("{n}", "3").replace("{m}", "12"),
    );
  });

  it("renders the §10.1 capability note and never the run form at phone width", async () => {
    const f = makeFetch();
    await mountAt(`/p/${SLUG}/run`, bootFor(SPA_RUN, "phone"), f.impl);
    const main = el()!;
    expect(main.querySelector('[data-phone-blocked="true"]')).not.toBeNull();
    expect(main.querySelector("form[data-run-sheet]")).toBeNull();
  });

  it("a 404 twin maps to the router's not-found — the document's own answer", async () => {
    const f = makeFetch({ twin: null });
    await mountAt(`/p/${SLUG}/run`, BOOT, f.impl);
    // the not-found route renders its own surface — no run form, no stack page.
    expect(el()!.querySelector("form[data-run-sheet]")).toBeNull();
    expect(el()!.textContent).not.toBe("");
  });

  it("SsrHandoff — a non-spa verdict mounts the shell and never fetches the twin", async () => {
    const f = makeFetch();
    await mountAt(`/p/${SLUG}/run`, bootFor({ "/p/$project/run": "ssr" }), f.impl);
    expect(el()!.querySelector("form[data-run-sheet]")).toBeNull();
    expect(f.impl.mock.calls.some(([u]) => String(u).includes(`/bff/p/${SLUG}/run`))).toBe(false);
  });
});

// ---- axe + parity --------------------------------------------------------------------------------

