import { describe, expect, it } from "vitest";
import type { Browser, BrowserContextOptions } from "playwright";
import { newMarkedContext } from "./marked-context.js";
import { AUTOMATED_TRAFFIC_UA_MARKER } from "@rhema/contracts";

// 264_R6FIX.14 — the marker seam's unit contract: compose, probe-once, retry-on-failure.

const IPHONE_UA_FRAGMENT_FOR_TEST =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

type CtxCall = BrowserContextOptions;
function fakeBrowser(defaultUa = "DefaultUA/9.9") {
  const calls: CtxCall[] = [];
  const page = { evaluate: async () => defaultUa };
  const context = { newPage: async () => page, close: async () => undefined };
  const browser = {
    newContext: async (o?: CtxCall) => {
      calls.push(o ?? {});
      return context;
    },
  } as unknown as Browser;
  return { browser, calls };
}

describe("newMarkedContext — the +RhemaJourney UA seam (264_R6FIX.14)", () => {
  it("composes the marker onto an explicit userAgent (the IPHONE legs' arm)", async () => {
    const { browser, calls } = fakeBrowser();
    await newMarkedContext(browser, {
      userAgent: IPHONE_UA_FRAGMENT_FOR_TEST,
      isMobile: true,
    });
    expect(calls).toHaveLength(1); // no probe — the caller's UA is already known
    expect(calls[0]!.userAgent).toBe(`${IPHONE_UA_FRAGMENT_FOR_TEST} ${AUTOMATED_TRAFFIC_UA_MARKER}`);
    expect(calls[0]!.isMobile).toBe(true); // non-UA options pass through verbatim
  });

  it("probes the browser's default UA once, then composes — and caches per Browser", async () => {
    const { browser, calls } = fakeBrowser("HeadlessChrome/131.0");
    await newMarkedContext(browser, { baseURL: "https://app.test" });
    await newMarkedContext(browser, { baseURL: "https://app.test", viewport: { width: 1, height: 1 } });
    // call 0 = the options-free probe; calls 1/2 = the two real contexts, both marked.
    expect(calls[0]).toEqual({});
    expect(calls[1]!.userAgent).toBe(`HeadlessChrome/131.0 ${AUTOMATED_TRAFFIC_UA_MARKER}`);
    expect(calls[2]!.userAgent).toBe(`HeadlessChrome/131.0 ${AUTOMATED_TRAFFIC_UA_MARKER}`);
    expect(calls).toHaveLength(3); // the second context did NOT re-probe
  });

  it("a failed probe does not poison the cache — the next context retries", async () => {
    const calls: CtxCall[] = [];
    let evaluations = 0;
    const context = (ua: string | null) => ({
      newPage: async () => ({
        evaluate: async () => {
          evaluations += 1;
          if (evaluations === 1) throw new Error("probe hiccup");
          return ua;
        },
      }),
      close: async () => undefined,
    });
    const browser = {
      newContext: async (o?: CtxCall) => {
        calls.push(o ?? {});
        return context("RetryUA/1.0");
      },
    } as unknown as Browser;
    await expect(newMarkedContext(browser)).rejects.toThrow("probe hiccup");
    await newMarkedContext(browser);
    expect(calls.at(-1)!.userAgent).toBe(`RetryUA/1.0 ${AUTOMATED_TRAFFIC_UA_MARKER}`);
    expect(evaluations).toBe(2);
  });

  it("the marker token is the contracts vocabulary, not a local literal", () => {
    expect(AUTOMATED_TRAFFIC_UA_MARKER).toBe("+RhemaJourney");
  });
});
