import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { Browser } from "playwright";
import { runJourneys } from "./runner.js";
import type { JourneyStep } from "./registry.js";
import type { MailboxClient } from "./mailbox.js";

// JOURNEY.1 — the runner's expected-flag semantics (AC: "green step fails ⇒ the run fails; a red
// step failing is reported as owed-to-its-owner, never a run failure; a red step passing is
// 'ready to flip'"). Steps here are stubs — the classification is what's under test.

const step = (id: string, expected: "red" | "green", paid = false): JourneyStep => ({
  id,
  journey: "new-visitor",
  asserts: `${id} asserts something`,
  owner: "X.1",
  expected,
  paid,
});

const stubBrowser = { contexts: () => [] } as unknown as Browser;
const stubMailbox = {} as MailboxClient;

async function run(
  steps: JourneyStep[],
  impls: Parameters<typeof runJourneys>[0]["impls"],
  paid = false,
  extra: Partial<Parameters<typeof runJourneys>[0]> = {},
) {
  const outDir = mkdtempSync(path.join(tmpdir(), "jrnr-"));
  return runJourneys({
    browser: stubBrowser,
    webBaseUrl: "https://app.test",
    apiBaseUrl: "https://api.test",
    mailbox: stubMailbox,
    stateDir: outDir,
    outDir,
    nonce: "testnonce",
    paid,
    steps,
    impls,
    provenance: { expected: "abc", observed: { web: "abc" }, match: true },
    spend: { weeklyMeteredUsd: 0, capUsd: 5, withinCap: true },
    ...extra,
  });
}

describe("runJourneys — the expected-flag semantics", () => {
  it("a green step passing ⇒ pass; a green step failing ⇒ fail + run failure", async () => {
    const r = await run(
      [step("G1", "green"), step("G2", "green")],
      { G1: async () => undefined, G2: async () => { throw new Error("boom"); } },
    );
    expect(r.results.find((x) => x.id === "G1")?.outcome).toBe("pass");
    expect(r.results.find((x) => x.id === "G2")?.outcome).toBe("fail");
    expect(r.results.find((x) => x.id === "G2")?.error).toBe("boom");
    expect(r.passed).toBe(false);
  });
  it("a red step failing ⇒ owed (never a run failure); a red step passing ⇒ ready-to-flip", async () => {
    const r = await run(
      [step("R-1", "red"), step("R-2", "red")],
      { "R-1": async () => { throw new Error("not yet"); }, "R-2": async () => undefined },
    );
    expect(r.results.find((x) => x.id === "R-1")?.outcome).toBe("owed");
    expect(r.results.find((x) => x.id === "R-2")?.outcome).toBe("ready-to-flip");
    expect(r.passed).toBe(true);
  });
  it("paid steps skip without --paid; a missing impl on a green step fails the run", async () => {
    const r = await run([step("P1x", "red", true), step("G3", "green")], {});
    expect(r.results.find((x) => x.id === "P1x")?.outcome).toBe("skipped");
    expect(r.results.find((x) => x.id === "G3")?.outcome).toBe("fail");
    expect(r.passed).toBe(false);
  });
  it("the report lands on disk with console-error + failed-request capture arrays", async () => {
    const r = await run([step("G4", "green")], { G4: async () => undefined });
    const res = r.results[0]!;
    expect(res.consoleErrors).toEqual([]);
    expect(res.failedRequests).toEqual([]);
    expect(typeof res.durationMs).toBe("number");
  });
});

// ---------------------------------------------------------------------------
// SPA.6 — the renderer leg contract (REQ-VFY-7, REQ-SEQ-4): --expect-renderer rides the document
// response stream; --pin-renderer stamps x-rhema-renderer on EVERY context the runner makes.

/** A page stub with an event tap + a `goto` that fires a scripted document response. */
function fakeCtxPage(opts: {
  docUrl: string;
  docHtml: string;
  status?: number;
  contentType?: string;
}) {
  const listeners = new Map<string, ((arg: unknown) => void)[]>();
  const response = {
    url: () => opts.docUrl,
    status: () => opts.status ?? 200,
    headers: () => ({ "content-type": opts.contentType ?? "text/html" }),
    request: () => ({ resourceType: () => "document" }),
    text: async () => opts.docHtml,
  };
  const page = {
    on(ev: string, fn: (arg: unknown) => void) {
      listeners.set(ev, [...(listeners.get(ev) ?? []), fn]);
    },
    /** test-only: fire a response through the wired listeners, as the wire would. */
    async emitDoc() {
      for (const fn of listeners.get("response") ?? []) fn(response);
    },
    async goto() {
      return { status: () => opts.status ?? 200 };
    },
  };
  return page;
}

function browserWithPages(pages: ReturnType<typeof fakeCtxPage>[]) {
  const newContextCalls: Record<string, unknown>[] = [];
  const contexts = pages.map((page) => ({
    newPage: async () => page,
    close: async () => undefined,
    pages: () => [page],
  }));
  const browser = {
    contexts: () => contexts,
    newContext: async (o?: Record<string, unknown>) => {
      newContextCalls.push(o ?? {});
      return contexts[0]!;
    },
  } as unknown as Browser;
  return { browser, newContextCalls };
}

describe("runJourneys — the renderer leg contract (SPA.6; REQ-VFY-7, REQ-SEQ-4)", () => {
  const SSR = '<html data-renderer="ssr" data-route="/app" data-mounted>';
  const SPA = '<html data-renderer="spa" data-route="/app" data-mounted>';

  it("--expect-renderer fails a green step whose served document reports the wrong renderer", async () => {
    const { browser } = browserWithPages([fakeCtxPage({ docUrl: "https://app.test/app", docHtml: SPA })]);
    const r = await run(
      [step("G9", "green")],
      {
        G9: async (ctx) => {
          const { page } = await ctx.anon();
          await (page as unknown as { emitDoc(): Promise<void> }).emitDoc();
        },
      },
      false,
      { browser, expectRenderer: "ssr" },
    );
    const res = r.results[0]!;
    expect(res.outcome).toBe("fail");
    expect(res.error).toMatch(/data-renderer=spa.*expected ssr/);
    expect(r.passed).toBe(false);
  });

  it("--expect-renderer passes when the served document reports the pinned renderer", async () => {
    const { browser } = browserWithPages([fakeCtxPage({ docUrl: "https://app.test/app", docHtml: SSR })]);
    const r = await run(
      [step("G10", "green")],
      {
        G10: async (ctx) => {
          const { page } = await ctx.anon();
          await (page as unknown as { emitDoc(): Promise<void> }).emitDoc();
        },
      },
      false,
      { browser, expectRenderer: "ssr" },
    );
    expect(r.results[0]!.outcome).toBe("pass");
  });

  it("a foreign-origin or non-HTML document never trips the renderer check", async () => {
    const foreign = fakeCtxPage({ docUrl: "https://checkout.stripe.com/c/pay/cs_1", docHtml: "<html/>" });
    const img = fakeCtxPage({
      docUrl: "https://app.test/favicon.svg",
      docHtml: "<svg/>",
      contentType: "image/svg+xml",
    });
    const { browser } = browserWithPages([foreign, img]);
    const r = await run(
      [step("G11", "green")],
      {
        G11: async (ctx) => {
          const { page } = await ctx.anon();
          await (page as unknown as { emitDoc(): Promise<void> }).emitDoc();
        },
      },
      false,
      { browser, expectRenderer: "spa" },
    );
    expect(r.results[0]!.outcome).toBe("pass");
  });

  it("--pin-renderer stamps x-rhema-renderer on every context + flows into the report + ctx", async () => {
    const { browser, newContextCalls } = browserWithPages([fakeCtxPage({ docUrl: "https://app.test/app", docHtml: SSR })]);
    let seen: Readonly<Record<string, string>> | undefined;
    const r = await run(
      [step("G12", "green")],
      {
        G12: async (ctx) => {
          seen = ctx.extraHTTPHeaders;
          await ctx.anon();
        },
      },
      false,
      { browser, pinRenderer: "ssr" },
    );
    expect(r.results[0]!.outcome).toBe("pass");
    expect(seen).toEqual({ "x-rhema-renderer": "ssr" });
    expect(newContextCalls[0]).toMatchObject({
      extraHTTPHeaders: { "x-rhema-renderer": "ssr" },
    });
    expect(r.renderer).toEqual({ expect: null, pin: "ssr" });
  });

  it("no pin ⇒ no extraHTTPHeaders on the context (leg B runs un-pinned)", async () => {
    const { browser, newContextCalls } = browserWithPages([fakeCtxPage({ docUrl: "https://app.test/app", docHtml: SSR })]);
    await run([step("G13", "green")], { G13: async (ctx) => { await ctx.anon(); } }, false, { browser });
    expect(newContextCalls[0]).not.toHaveProperty("extraHTTPHeaders");
  });
});

// ---------------------------------------------------------------------------
// SPA.17 — the --surface-scoped renderer assert (design/29 §coexistence): a gated leg's
// --expect-renderer applies only to documents under the gated surfaces' SPA_DOCUMENT_ROUTES
// route ids — the step's traversal docs keep their own flag's verdict.

describe("runJourneys — the surface-scoped renderer assert (SPA.17; design/29 §coexistence)", () => {
  const EXPORT_SSR = '<html data-renderer="ssr" data-route="/p/$project/export" data-mounted>';
  const EDITOR_SSR = '<html data-renderer="ssr" data-route="/p/$project" data-mounted>';

  it("a document OUTSIDE the gated set keeps its own renderer — leg B never demands spa on it", async () => {
    const { browser } = browserWithPages([
      fakeCtxPage({ docUrl: "https://app.test/p/acme", docHtml: EDITOR_SSR }),
    ]);
    const r = await run(
      [step("G14", "green")],
      {
        G14: async (ctx) => {
          expect(ctx.rendererScope).toEqual(new Set(["/p/$project/export"]));
          const { page } = await ctx.anon();
          await (page as unknown as { emitDoc(): Promise<void> }).emitDoc();
        },
      },
      false,
      { browser, expectRenderer: "spa", rendererScope: ["export"] },
    );
    expect(r.results[0]!.outcome).toBe("pass");
  });

  it("a document INSIDE the gated set reporting the wrong renderer still fails the leg", async () => {
    const { browser } = browserWithPages([
      fakeCtxPage({ docUrl: "https://app.test/p/acme/export", docHtml: EXPORT_SSR }),
    ]);
    const r = await run(
      [step("G15", "green")],
      {
        G15: async (ctx) => {
          const { page } = await ctx.anon();
          await (page as unknown as { emitDoc(): Promise<void> }).emitDoc();
        },
      },
      false,
      { browser, expectRenderer: "spa", rendererScope: ["export"] },
    );
    const res = r.results[0]!;
    expect(res.outcome).toBe("fail");
    expect(res.error).toMatch(/\/p\/acme\/export served data-renderer=ssr.*expected spa/);
    expect(r.passed).toBe(false);
  });

  it("the same gated doc reporting spa passes — the leg-B green", async () => {
    const { browser } = browserWithPages([
      fakeCtxPage({
        docUrl: "https://app.test/p/acme/export",
        docHtml: '<html data-renderer="spa" data-mounted>',
      }),
    ]);
    const r = await run(
      [step("G16", "green")],
      {
        G16: async (ctx) => {
          const { page } = await ctx.anon();
          await (page as unknown as { emitDoc(): Promise<void> }).emitDoc();
        },
      },
      false,
      { browser, expectRenderer: "spa", rendererScope: ["export"] },
    );
    expect(r.results[0]!.outcome).toBe("pass");
  });
});
