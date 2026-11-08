import { mkdtempSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { Browser } from "playwright";
import { runJourneys } from "./runner.js";
import { CapOverrunError } from "./spend-guard.js";
import type { JourneyStep } from "./registry.js";
import { STEP_REGISTRY } from "./registry.js";
import { ALL_IMPLS } from "./impls.js";
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
    const r = await run([step("G1", "green"), step("G2", "green")], {
      G1: async () => undefined,
      G2: async () => {
        throw new Error("boom");
      },
    });
    expect(r.results.find((x) => x.id === "G1")?.outcome).toBe("pass");
    expect(r.results.find((x) => x.id === "G2")?.outcome).toBe("fail");
    expect(r.results.find((x) => x.id === "G2")?.error).toBe("boom");
    expect(r.passed).toBe(false);
  });
  it("a red step failing ⇒ owed (never a run failure); a red step passing ⇒ ready-to-flip", async () => {
    const r = await run([step("R-1", "red"), step("R-2", "red")], {
      "R-1": async () => {
        throw new Error("not yet");
      },
      "R-2": async () => undefined,
    });
    expect(r.results.find((x) => x.id === "R-1")?.outcome).toBe("owed");
    expect(r.results.find((x) => x.id === "R-2")?.outcome).toBe("ready-to-flip");
    expect(r.passed).toBe(true);
  });
  // R7OPEN.1 (REQ-DACC-8) — the offline dry path over the real registry: every round-7 leg's
  // wired owed-stub classifies `owed` through the runner (never a run failure), so the nightly
  // cannot re-redden. Removing a leg's stub (or flipping its row green) fails this test.
  it("the flipped round-7 legs classify real failures, never owed", async () => {
    // 250_R7DEP.2 flipped U1–U7 green at T1 `e578a767` (preview board @`d0a77d0` + prod Stage-B
    // `prod-stageb/`). The round-7 owed census is EMPTY: a green row's offline failure is a real
    // `fail` (it can re-redden the nightly honestly), never the `owed` classification.
    const R7_IDS = [
      "U1.shell", "U2.noreload", "U3.occlusion", "U4.controls", "U5.write", "U6.chat", "U7.import",
    ];
    const steps = STEP_REGISTRY.filter((s) => R7_IDS.includes(s.id));
    expect(steps.map((s) => s.id).sort()).toEqual(R7_IDS.slice().sort());
    const r = await run(steps, ALL_IMPLS);
    for (const res of r.results) {
      expect(res.outcome, res.id).toBe("fail");
      // The flipped rows are `expected:"green"` — their real bodies fail on the stub ctx with
      // their own errors (never the owed signature); the offline dry path classifies each as a
      // real `fail`, which is exactly the honest-nightly contract post-flip.
      expect(res.error, res.id).toBeTruthy();
      expect(res.error, res.id).not.toContain("owed — owner");
    }
    expect(r.passed).toBe(false); // a green leg failing fails the run — the honest post-flip arm
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

  // F-R6SWP.1-1 — the per-leg incremental flush: a wall-clock kill mid-run must leave the
  // completed legs' verdicts on disk. The second step reads report.json DURING the run and
  // sees the first leg's outcome under `partial: true`; the final write drops the marker.
  it("flushes a partial report.json after every leg — a mid-run kill keeps leg verdicts", async () => {
    const seen: { partial?: boolean; resultCount?: number; f1Outcome?: string } = {};
    let capturedDir = "";
    const r = await run([step("F1", "green"), step("F2", "green")], {
      F1: async () => undefined,
      F2: async (ctx) => {
        capturedDir = ctx.outDir;
        const onDisk = JSON.parse(await readFile(path.join(ctx.outDir, "report.json"), "utf8")) as {
          partial?: boolean;
          results: { id: string; outcome: string }[];
        };
        seen.partial = onDisk.partial;
        seen.resultCount = onDisk.results.length;
        seen.f1Outcome = onDisk.results.find((x) => x.id === "F1")?.outcome;
      },
    });
    expect(seen.partial).toBe(true);
    expect(seen.resultCount).toBe(1);
    expect(seen.f1Outcome).toBe("pass");
    // the completed run's report is the full shape — no partial marker, both legs present.
    expect(r.partial).toBeUndefined();
    const final = JSON.parse(await readFile(path.join(capturedDir, "report.json"), "utf8")) as {
      partial?: boolean;
      results: unknown[];
    };
    expect(final.partial).toBeUndefined();
    expect(final.results).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// R5ECON.1 (REQ-ECON-7) — the cap_overrun verdict: a leg whose metered spend exceeds its
// declared capUsd closes `cap_overrun` (never owed/fail), fails the run, and pauses the
// funded window — every later step in the dispatch skips.

describe("runJourneys — cap_overrun pauses the funded window (REQ-ECON-7)", () => {
  it("a CapOverrunError classifies cap_overrun on a red step, fails the run, and skips every later leg", async () => {
    const r = await run(
      [step("P-a", "red", true), step("P-b", "red", true), step("G-p", "green")],
      {
        "P-a": async () => {
          throw new CapOverrunError("P-a", 6.25, 1.0);
        },
        "P-b": async () => undefined, // must NEVER run — the window is paused
        "G-p": async () => undefined,
      },
      true,
    );
    const a = r.results.find((x) => x.id === "P-a")!;
    expect(a.outcome).toBe("cap_overrun"); // the distinct verdict — not owed, not fail
    expect(a.error).toContain("cap_overrun");
    const b = r.results.find((x) => x.id === "P-b")!;
    expect(b.outcome).toBe("skipped");
    expect(b.error).toContain("paused");
    const g = r.results.find((x) => x.id === "G-p")!;
    expect(g.outcome).toBe("skipped"); // the pause halts free legs too — the dispatch is dead
    expect(r.passed).toBe(false);
  });
  it("cap_overrun on a green step is still cap_overrun — the verdict ignores expected color", async () => {
    const r = await run([step("G-c", "green")], {
      "G-c": async () => {
        throw new CapOverrunError("G-c", 9, 5);
      },
    });
    expect(r.results[0]!.outcome).toBe("cap_overrun");
    expect(r.passed).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// SPA.6 — the renderer leg contract (REQ-VFY-7, REQ-SEQ-4): --expect-renderer rides the document
// response stream. SPA.28 — --pin-renderer's x-rhema-renderer stamping is retired (REQ-SEQ-4's
// removal leg): no runner-created context may inject renderer headers anymore.

/** A page stub with an event tap + a `goto` that fires a scripted document response. */
function fakeCtxPage(opts: {
  docUrl: string;
  docHtml: string;
  status?: number;
  contentType?: string;
  resourceType?: string;
}) {
  const listeners = new Map<string, ((arg: unknown) => void)[]>();
  const response = {
    url: () => opts.docUrl,
    status: () => opts.status ?? 200,
    headers: () => ({ "content-type": opts.contentType ?? "text/html" }),
    request: () => ({ resourceType: () => opts.resourceType ?? "document" }),
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
      // round-robin: each ctx.anon() wires the NEXT scripted page (single-anon tests are
      // unaffected — they only ever take contexts[0]).
      return contexts[(newContextCalls.length - 1) % contexts.length]!;
    },
  } as unknown as Browser;
  return { browser, newContextCalls };
}

describe("runJourneys — the renderer leg contract (SPA.6; REQ-VFY-7, REQ-SEQ-4)", () => {
  const SSR = '<html data-renderer="ssr" data-route="/app" data-mounted>';
  const SPA = '<html data-renderer="spa" data-route="/app" data-mounted>';

  it("--expect-renderer fails a green step whose served document reports the wrong renderer", async () => {
    const { browser } = browserWithPages([
      fakeCtxPage({ docUrl: "https://app.test/app", docHtml: SPA }),
    ]);
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
    const { browser } = browserWithPages([
      fakeCtxPage({ docUrl: "https://app.test/app", docHtml: SSR }),
    ]);
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

  it("REQ-ED-12 — a forced-SSR document (data-ssr-cause) under --expect-renderer spa is honored, not flagged", async () => {
    // ARMB-1 — the Page family's forced arm (phone UA / showcase row) is the spec-mandated
    // renderer for that request; the assert keys the exemption on the cause stamp, so an
    // unstamped ssr doc on a gated route still fails (the G9 case above).
    const FORCED =
      '<html data-renderer="ssr" data-route="/p/$project" data-mounted data-ssr-cause="showcase">';
    const { browser } = browserWithPages([
      fakeCtxPage({ docUrl: "https://app.test/p/showcase", docHtml: FORCED }),
    ]);
    const r = await run(
      [step("G12", "green")],
      {
        G12: async (ctx) => {
          const { page } = await ctx.anon();
          await (page as unknown as { emitDoc(): Promise<void> }).emitDoc();
        },
      },
      false,
      { browser, expectRenderer: "spa" },
    );
    expect(r.results[0]!.outcome).toBe("pass");
  });

  it("a foreign-origin or non-HTML document never trips the renderer check", async () => {
    const foreign = fakeCtxPage({
      docUrl: "https://checkout.stripe.com/c/pay/cs_1",
      docHtml: "<html/>",
    });
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

  it("no context carries extraHTTPHeaders — the renderer pin is retired (SPA.28 removal-detecting)", async () => {
    // Every leg runs un-pinned now: a resurrected pinRenderer seam would stamp
    // `x-rhema-renderer` onto every context — the assert refuses that shape outright.
    const { browser, newContextCalls } = browserWithPages([
      fakeCtxPage({ docUrl: "https://app.test/app", docHtml: SSR }),
    ]);
    await run(
      [step("G13", "green")],
      {
        G13: async (ctx) => {
          await ctx.anon();
        },
      },
      false,
      { browser },
    );
    expect(newContextCalls[0]).not.toHaveProperty("extraHTTPHeaders");
    expect(JSON.stringify(newContextCalls[0])).not.toContain("x-rhema-renderer");
  });
});

// ---------------------------------------------------------------------------
// NAVC.2 — the UNCONDITIONAL document-load counter (REQ-NAVT-3, O2-F20). It used to ride the
// `expectRenderer` gate, so an unpinned run observed nothing and a mechanism assert would have
// been blind; now the count is always live on `ctx.documentLoads` — only the renderer ASSERT
// stays pin-gated.

describe("runJourneys — the unconditional documentLoads counter (NAVC.2; REQ-NAVT-3, O2-F20)", () => {
  const SSR = '<html data-renderer="ssr" data-route="/app" data-mounted data-nav-count="0">';

  it("counts a served document with NO renderer pinned — the un-gating is the point", async () => {
    const { browser } = browserWithPages([
      fakeCtxPage({ docUrl: "https://app.test/app", docHtml: SSR }),
    ]);
    const r = await run(
      [step("G20", "green")],
      {
        G20: async (ctx) => {
          const { page } = await ctx.anon();
          expect(ctx.documentLoads).toBe(0);
          await (page as unknown as { emitDoc(): Promise<void> }).emitDoc();
          expect(ctx.documentLoads).toBe(1); // live getter — the response listener wrote through
          await (page as unknown as { emitDoc(): Promise<void> }).emitDoc();
          expect(ctx.documentLoads).toBe(2);
        },
      },
      false,
      { browser }, // deliberately NO expectRenderer — the count must not gate on it
    );
    expect(r.results[0]!.outcome).toBe("pass");
  });

  it("non-document / foreign / non-2xx / non-HTML responses never count", async () => {
    const pages = [
      fakeCtxPage({ docUrl: "https://app.test/app", docHtml: SSR, resourceType: "xhr" }),
      fakeCtxPage({ docUrl: "https://checkout.stripe.com/c/pay/cs_1", docHtml: SSR }),
      fakeCtxPage({ docUrl: "https://app.test/app", docHtml: SSR, status: 404 }),
      fakeCtxPage({
        docUrl: "https://app.test/app",
        docHtml: "<svg/>",
        contentType: "image/svg+xml",
      }),
    ];
    const { browser } = browserWithPages(pages);
    const r = await run(
      [step("G21", "green")],
      {
        G21: async (ctx) => {
          for (let i = 0; i < pages.length; i += 1) {
            const { page } = await ctx.anon(); // each anon wires the next scripted page
            await (page as unknown as { emitDoc(): Promise<void> }).emitDoc();
          }
          expect(ctx.documentLoads).toBe(0);
        },
      },
      false,
      { browser, expectRenderer: "ssr" }, // even pinned, a non-landed document must not count
    );
    expect(r.results[0]!.outcome).toBe("pass");
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
