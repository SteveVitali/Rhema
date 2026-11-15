// 264_R6FIX.14 (R-4) — THE ONE automated-traffic marker seam. Every browser context the harness
// opens comes from `newMarkedContext`, which stamps the shared `+RhemaJourney` UA token
// (`AUTOMATED_TRAFFIC_UA_MARKER` — contracts owns the vocabulary) onto whatever UA the context
// would carry anyway. The funnel ingest reads the wire UA and writes
// `acquisition_events.surface='web:auto'`, so suite/smoke/probe traffic splits out of the
// organic funnel legs at the query layer — no per-leg changes, no stored-history rewrite.
//
// UA suffix, not a marker header, deliberately: (a) the committed SPA.28 pin in runner.test.ts
// forbids `extraHTTPHeaders`/`x-rhema-renderer` on runner contexts — a header marker would need
// pin surgery for a weaker carrier; (b) the drop-zone beacon path is `navigator.sendBeacon`,
// which cannot attach custom headers — the UA is the only channel that reaches BOTH hops
// (the GET / document + the /a/landing beacon) untouched; (c) the suffix composes with the
// IPHONE_USER_AGENT legs (the marker appends after any explicit userAgent option).

import { markedUserAgent } from "@rhema/contracts";
import type { Browser, BrowserContext, BrowserContextOptions } from "playwright";

// The browser's own default UA is not readable without opening a context, so the seam probes it
// once per Browser (about:blank only — no navigation, zero emitted requests) and caches the
// answer. A leg that passes its own `userAgent` (the IPHONE legs) never pays the probe.
const defaultUaCache = new WeakMap<Browser, Promise<string>>();

async function defaultUserAgent(browser: Browser): Promise<string> {
  let pending = defaultUaCache.get(browser);
  if (!pending) {
    pending = (async () => {
      const probe = await browser.newContext();
      try {
        const page = await probe.newPage();
        return await page.evaluate(() => navigator.userAgent);
      } finally {
        await probe.close();
      }
    })();
    defaultUaCache.set(browser, pending);
    // a rejected probe must not poison the cache — the next context retries.
    pending.catch(() => defaultUaCache.delete(browser));
  }
  return pending;
}

/**
 * The marked `browser.newContext`. Options pass through verbatim except `userAgent`, which is
 * composed: explicit caller UA → `<caller UA> <marker>`; absent → `<browser default UA> <marker>`
 * (probed once per browser, cached). Returns the same BrowserContext `newContext` would.
 */
export async function newMarkedContext(
  browser: Browser,
  options: BrowserContextOptions = {},
): Promise<BrowserContext> {
  const base = options.userAgent ?? (await defaultUserAgent(browser));
  return browser.newContext({ ...options, userAgent: markedUserAgent(base) });
}
