import { describe, expect, it } from "vitest";
import type { Page } from "playwright";
import {
  awaitMounted,
  gatedRouteIds,
  gotoOk,
  onOurOrigin,
  rendererOfDocument,
  reloadSettled,
  settleNav,
  ssrCauseOfDocument,
  type RendererName,
  type SettleScope,
  type SsrCause,
} from "./settle.js";

// SPA.6 — the settle contract's removal-catching tests (REQ-VFY-3/4/7): the pure helpers are
// checked directly, and the page-facing helpers run against a scripted Page stub (the contract
// IS the wait — a settle that stops waiting on the markers is the removal these tests catch).

const SSR_DOC = '<html lang="en" data-renderer="ssr" data-route="/p/$project" data-mounted>';
const SPA_DOC = '<html lang="en" data-renderer="spa" data-route="/p/$project" data-mounted>';
const UNMARKED = "<html><body>no markers</body></html>";

describe("rendererOfDocument (REQ-VFY-7)", () => {
  it("parses the ssr/spa marker off the <html> element and returns null for anything else", () => {
    expect(rendererOfDocument(SSR_DOC)).toBe("ssr");
    expect(rendererOfDocument(SPA_DOC)).toBe("spa");
    expect(rendererOfDocument(UNMARKED)).toBeNull();
    expect(rendererOfDocument('<html data-renderer="bogus">')).toBeNull(); // outside the vocabulary
    expect(rendererOfDocument('<div data-renderer="spa">')).toBeNull(); // only <html> counts
    expect(rendererOfDocument(`<body>${SSR_DOC}</body>`)).toBe("ssr"); // position-free
  });
});

describe("onOurOrigin (the foreign-origin guard)", () => {
  it("is true only for the web origin — Stripe-hosted pages never trip the marker asserts", () => {
    expect(onOurOrigin("https://app.test/p/x", "https://app.test")).toBe(true);
    expect(onOurOrigin("https://app.test:443/p/x", "https://app.test")).toBe(true); // default port normalizes
    expect(onOurOrigin("https://checkout.stripe.com/c/pay/cs_1", "https://app.test")).toBe(false);
    expect(onOurOrigin("https://app.test.evil.example", "https://app.test")).toBe(false);
    expect(onOurOrigin("about:blank", "https://app.test")).toBe(false);
    expect(onOurOrigin("not a url", "https://app.test")).toBe(false);
  });
});

/** A scripted Page stub: `attrs` is what document.documentElement reports; `url` is page.url().
 *  `waitForFunction` installs a fake `document` so the REAL predicate runs — a settle that drops
 *  the data-mounted/data-route/data-renderer check is the removal these tests catch. */
function fakePage(opts: {
  url: string;
  attrs: {
    route: string | null;
    renderer: RendererName | null;
    mounted: boolean;
    ssrCause?: SsrCause | null;
  };
  gotoStatus?: number;
}): Page {
  const attrValue = (name: string): string | null =>
    name === "data-route"
      ? opts.attrs.route
      : name === "data-renderer"
        ? opts.attrs.renderer
        : name === "data-ssr-cause"
          ? (opts.attrs.ssrCause ?? null)
          : null;
  return {
      url: () => opts.url,
      async waitForFunction(
        fn: (a: readonly [string | null, string | null]) => boolean,
        arg: readonly [string | null, string | null],
      ) {
        const el = {
          hasAttribute: (name: string) =>
            name === "data-mounted" ? opts.attrs.mounted : attrValue(name) != null,
          getAttribute: attrValue,
        };
        const prev = (globalThis as { document?: unknown }).document;
        (globalThis as { document?: unknown }).document = { documentElement: el };
        try {
          if (!fn(arg)) throw new Error("timeout waiting for function");
        } finally {
          (globalThis as { document?: unknown }).document = prev;
        }
      },
      async evaluate(fn: unknown) {
        const el = {
          hasAttribute: (name: string) =>
            name === "data-mounted" ? opts.attrs.mounted : false,
          getAttribute: attrValue,
        };
        const prev = (globalThis as { document?: unknown }).document;
        (globalThis as { document?: unknown }).document = { documentElement: el };
        try {
          return typeof fn === "function" ? (fn as () => unknown)() : undefined;
        } finally {
          (globalThis as { document?: unknown }).document = prev;
        }
      },
      async goto() {
        return { status: () => opts.gotoStatus ?? 200 };
      },
      async reload() {
        return { status: () => opts.gotoStatus ?? 200 };
      },
      async waitForLoadState() {
        return undefined;
      },
      async waitForURL() {
        return undefined;
      },
    } as unknown as Page;
}

const SCOPE: SettleScope = { webBaseUrl: "https://app.test" };

describe("awaitMounted — the mounted-marker wait (REQ-VFY-3/4)", () => {
  it("resolves when data-mounted + the wanted route/renderer are present", async () => {
    const page = fakePage({
      url: "https://app.test/p/acme",
      attrs: { route: "/p/$project", renderer: "ssr", mounted: true },
    });
    await expect(
      awaitMounted(page, { ...SCOPE, expectRenderer: "ssr" }, { route: "/p/$project" }),
    ).resolves.toBeUndefined();
  });

  it("fails the wait when the settled document carries the WRONG renderer — the removeme check", async () => {
    const page = fakePage({
      url: "https://app.test/p/acme",
      attrs: { route: "/p/$project", renderer: "spa", mounted: true },
    });
    await expect(
      awaitMounted(page, { ...SCOPE, expectRenderer: "ssr" }, { route: "/p/$project" }),
    ).rejects.toThrow(/data-renderer="ssr".*"renderer": ?"spa"/);
  });

  it("fails the wait when data-mounted never lands (an SSR doc missing the marker is caught)", async () => {
    const page = fakePage({
      url: "https://app.test/p/acme",
      attrs: { route: "/p/$project", renderer: "ssr", mounted: false },
    });
    await expect(awaitMounted(page, SCOPE)).rejects.toThrow(/settle wait lapsed/);
  });

  it("no-ops on a foreign-origin page (a Stripe-hosted tab has no markers to assert)", async () => {
    const page = fakePage({
      url: "https://checkout.stripe.com/c/pay/cs_1",
      attrs: { route: null, renderer: null, mounted: false },
    });
    await expect(awaitMounted(page, { ...SCOPE, expectRenderer: "spa" })).resolves.toBeUndefined();
  });
});

describe("gotoOk / settleNav / reloadSettled — the canonical navs", () => {
  it("gotoOk throws on ≥400 BEFORE the settle wait", async () => {
    const page = fakePage({
      url: "https://app.test/p/missing",
      attrs: { route: null, renderer: "ssr", mounted: true },
      gotoStatus: 404,
    });
    await expect(gotoOk(page, "https://app.test/p/missing", SCOPE)).rejects.toThrow(/404/);
  });

  it("gotoOk settles on the landed document's markers", async () => {
    const page = fakePage({
      url: "https://app.test/p/acme",
      attrs: { route: "/p/$project", renderer: "spa", mounted: true },
    });
    await expect(
      gotoOk(page, "https://app.test/p/acme", { ...SCOPE, expectRenderer: "spa" }),
    ).resolves.toBeUndefined();
  });

  it("settleNav swallows a nav-less post (the SPA client-mutation path) and still asserts markers", async () => {
    const page = fakePage({
      url: "https://app.test/p/acme",
      attrs: { route: "/p/$project", renderer: "ssr", mounted: true },
    });
    await expect(settleNav(page, SCOPE)).resolves.toBeUndefined();
  });

  it("reloadSettled re-asserts the markers (the remount assert)", async () => {
    const page = fakePage({
      url: "https://app.test/p/acme",
      attrs: { route: "/p/$project", renderer: "ssr", mounted: true },
    });
    await expect(reloadSettled(page, SCOPE)).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// SPA.17 — the scoped renderer assert (design/29 §coexistence): a `--surface` leg asserts
// --expect-renderer only on documents under the gated surfaces' route ids; a traversal doc
// outside the set keeps its own flag's verdict and must never fail the leg.

describe("gatedRouteIds — the --surface path set (SPA.17)", () => {
  it("unset/empty ⇒ null (the every-document assert keeps its meaning)", () => {
    expect(gatedRouteIds(undefined)).toBeNull();
    expect(gatedRouteIds(null)).toBeNull();
    expect(gatedRouteIds([])).toBeNull();
  });
  it("a surface resolves to exactly its SPA_DOCUMENT_ROUTES rows", () => {
    expect(gatedRouteIds(["export"])).toEqual(new Set(["/p/$project/export"]));
    expect(gatedRouteIds(["ide-chrome"])).toEqual(
      new Set(["/p/$project/import", "/p/$project/import/preview"]),
    );
    expect(gatedRouteIds(["export", "ide-chrome"])).toEqual(
      new Set(["/p/$project/export", "/p/$project/import", "/p/$project/import/preview"]),
    );
  });
});

describe("awaitMounted — the scoped renderer assert (SPA.17)", () => {
  const EXPORT_SCOPE: SettleScope = {
    webBaseUrl: "https://app.test",
    expectRenderer: "spa",
    rendererScope: gatedRouteIds(["export"]),
  };
  it("an ungated route's settled document keeps its own renderer — the leg never demands spa on it", async () => {
    const page = fakePage({
      url: "https://app.test/p/acme",
      attrs: { route: "/p/$project", renderer: "ssr", mounted: true },
    });
    await expect(awaitMounted(page, EXPORT_SCOPE)).resolves.toBeUndefined();
  });
  it("a gated route carrying the WRONG renderer still fails the wait", async () => {
    const page = fakePage({
      url: "https://app.test/p/acme/export",
      attrs: { route: "/p/$project/export", renderer: "ssr", mounted: true },
    });
    await expect(awaitMounted(page, EXPORT_SCOPE)).rejects.toThrow(
      /data-renderer="spa".*"renderer": ?"ssr"/,
    );
  });
  it("a gated route carrying the pinned renderer resolves", async () => {
    const page = fakePage({
      url: "https://app.test/p/acme/export",
      attrs: { route: "/p/$project/export", renderer: "spa", mounted: true },
    });
    await expect(awaitMounted(page, EXPORT_SCOPE)).resolves.toBeUndefined();
  });
});

describe("the forced-SSR exemption (REQ-ED-12; ARMB-1)", () => {
  const FORCED_DOC =
    '<html data-renderer="ssr" data-route="/p/$project" data-mounted data-ssr-cause="showcase">';

  it("ssrCauseOfDocument parses the stamp and rejects anything outside the vocabulary", () => {
    expect(ssrCauseOfDocument(FORCED_DOC)).toBe("showcase");
    expect(
      ssrCauseOfDocument('<html data-renderer="ssr" data-ssr-cause="phone" data-mounted>'),
    ).toBe("phone");
    expect(ssrCauseOfDocument(SSR_DOC)).toBeNull(); // a plain SSR doc is NOT a forced verdict
    expect(ssrCauseOfDocument('<html data-ssr-cause="bogus">')).toBeNull();
    expect(ssrCauseOfDocument('<div data-ssr-cause="phone">')).toBeNull(); // only <html> counts
  });

  it("a gated route's forced-SSR document settles — the mandated verdict is not waited on to flip", async () => {
    const page = fakePage({
      url: "https://app.test/p/showcase",
      attrs: {
        route: "/p/$project",
        renderer: "ssr",
        mounted: true,
        ssrCause: "showcase",
      },
    });
    await expect(
      awaitMounted(
        page,
        { ...SCOPE, expectRenderer: "spa", rendererScope: gatedRouteIds(["editor"]) },
        { route: "/p/$project" },
      ),
    ).resolves.toBeUndefined();
  });

  it("a gated route's UNSTAMPED ssr document still fails — the stamp is the exemption's proof", async () => {
    const page = fakePage({
      url: "https://app.test/p/acme",
      attrs: { route: "/p/$project", renderer: "ssr", mounted: true },
    });
    await expect(
      awaitMounted(
        page,
        { ...SCOPE, expectRenderer: "spa", rendererScope: gatedRouteIds(["editor"]) },
        { route: "/p/$project" },
      ),
    ).rejects.toThrow(/settle wait lapsed/);
  });
});

describe("the retired renderer-override channel (SPA.28 removal-detecting)", () => {
  it("RENDERER_HEADER is gone from the settle module — x-rhema-renderer is dead text", async () => {
    // REQ-SEQ-4's removal leg: the harness can no longer pin a renderer — a re-exported
    // RENDERER_HEADER would silently revive the channel; this pin refuses that.
    const mod = await import("./settle.js");
    expect("RENDERER_HEADER" in mod).toBe(false);
  });
});
