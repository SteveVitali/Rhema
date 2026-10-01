import { describe, expect, it } from "vitest";
import { chromium, type Browser } from "playwright";
import { assertActionable } from "./occlusion.js";

// JOURNEY.1 — the actionable-control assertion, exercised against REAL layout (a bundled chromium
// with a composed fixture page): visible+enabled+unoccluded passes; covered, hidden, disabled all
// fail with the named reason. Deterministic — no network, no app.

const PAGE = `<!doctype html><body style="margin:0">
  <button id="clear" style="display:block;width:200px;height:44px">Send</button>
  <div style="position:relative;width:200px;height:44px">
    <button id="covered" style="position:absolute;inset:0">Send</button>
    <div id="veil" style="position:absolute;inset:0;background:red"></div>
  </div>
  <button id="hidden" style="display:none">Send</button>
  <button id="disabled" disabled>Send</button>
</body>`;

let browser: Browser | undefined;
async function getBrowser(): Promise<Browser | undefined> {
  if (browser) return browser;
  try {
    browser = await chromium.launch({ headless: true });
    return browser;
  } catch {
    return undefined; // browsers not installed locally — CI installs chromium (ci.yml unit job)
  }
}

describe("assertActionable — real-layout occlusion checks", () => {
  it("passes a clear, enabled, visible control; fails covered/hidden/disabled", async () => {
    const b = await getBrowser();
    if (!b) {
      // A skip is only tolerable on a dev box without browsers installed; under CI the unit job
      // installs chromium, so a missing browser there is a real failure — never a silent pass.
      if (process.env.CI) throw new Error("playwright chromium missing under CI — install step broken");
      console.warn("playwright browsers not installed — skipping layout assertions");
      return;
    }
    const page = await b.newPage();
    await page.setContent(PAGE);
    await expect(assertActionable(page.locator("#clear"), "Send")).resolves.toBeTruthy();
    await expect(assertActionable(page.locator("#covered"), "Send")).rejects.toThrow(/occluded/);
    await expect(assertActionable(page.locator("#hidden"), "Send")).rejects.toThrow(/not visible|not in the DOM/);
    await expect(assertActionable(page.locator("#disabled"), "Send")).rejects.toThrow(/not enabled/);
    await expect(assertActionable(page.locator("#nope"), "Send")).rejects.toThrow(/not in the DOM/);
    await b.close();
    browser = undefined;
  }, 60_000);
});
