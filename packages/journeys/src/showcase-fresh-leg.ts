// R6CNT.2 — the fresh-account Showcase leg (D-P1.17-2's prod half; the ticket's "dossier open on
// finding 1 ≤ 60 s after signup" AC). Drives the REAL signup funnel — a fresh test-mailbox
// identity through the magic-link round-trip (workspace provisioning + the Wells showcase seed
// happen server-side during the verify) — then opens the workspace Showcase dossier and waits for
// the first finding card. The measured window starts when the signed-in landing settles and ends
// when finding 1 is visible; ≤ 60 000 ms is green. Prints a JSON line with every timestamp —
// nothing about the leg is trusted without the numbers.
//
//   node_modules/.bin/tsx packages/journeys/src/showcase-fresh-leg.ts --web https://rhema.tools
//
// Exit 0 on a green leg; 1 on any leg failure (red numbers are printed, never hidden).

import { chromium } from "playwright";
import { createGmailClient } from "./mailbox.js";
import { JourneySessions, freshIdentity } from "./session.js";

const BUDGET_MS = 60_000;

async function main(): Promise<number> {
  const web = process.argv[process.argv.indexOf("--web") + 1] ?? "https://rhema.tools";
  const nonce = `${Date.now().toString(36)}`;
  const email = freshIdentity(nonce, "r6cnt2");
  const stateDir = `/tmp/r6cnt2-showcase-${nonce}`;
  const mailbox = createGmailClient("test@rhema.tools");
  const browser = await chromium.launch();

  let signupSubmittedAt = 0;
  let landingAt = 0;
  let findingAt = 0;
  let url = "";
  let title = "";
  let findingCount = 0;
  try {
    const sessions = new JourneySessions({ browser, mailbox, webBaseUrl: web, stateDir });
    signupSubmittedAt = Date.now();
    const { page, context } = await sessions.signIn(email, { useCache: false });
    landingAt = Date.now();

    // signed-in /showcase resolves the workspace's seeded Showcase dossier (forced-SSR family).
    await page.goto(`${web}/showcase`, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => undefined);
    url = page.url();
    title = ((await page.textContent("body")) ?? "").slice(0, 4000);

    // the dossier's first finding card — "dossier open on finding 1".
    await page.locator("[data-finding]").first().waitFor({ state: "visible", timeout: 30_000 });
    findingCount = await page.locator("[data-finding]").count();
    findingAt = Date.now();
    const firstLink = page.locator("[data-finding-link]").first();
    if ((await firstLink.count()) > 0) {
      await firstLink.click();
      await page.waitForLoadState("domcontentloaded", { timeout: 15_000 }).catch(() => undefined);
      url = page.url();
    }
    await context.close();
  } catch (err) {
    console.log(
      JSON.stringify({
        leg: "showcase-fresh",
        ok: false,
        error: err instanceof Error ? err.message.slice(0, 400) : String(err),
        email,
        signupSubmittedAt: new Date(signupSubmittedAt).toISOString(),
        landingAt: landingAt ? new Date(landingAt).toISOString() : null,
      }),
    );
    await browser.close();
    return 1;
  } finally {
    /* browser closed below */
  }
  await browser.close();

  const landingToFindingMs = findingAt - landingAt;
  const totalMs = findingAt - signupSubmittedAt;
  const isWells = /The Extinction of Man/.test(title) || /Extinction of Man/.test(title);
  const ok = landingToFindingMs <= BUDGET_MS && findingCount >= 1;
  console.log(
    JSON.stringify({
      leg: "showcase-fresh",
      ok,
      email,
      signupSubmittedAt: new Date(signupSubmittedAt).toISOString(),
      landingAt: new Date(landingAt).toISOString(),
      findingAt: new Date(findingAt).toISOString(),
      landingToFindingMs,
      budgetMs: BUDGET_MS,
      totalSignupToFindingMs: totalMs,
      findingCount,
      wellsContent: isWells,
      finalUrl: url,
    }),
  );
  return ok ? 0 : 1;
}

void main().then((code) => process.exit(code));
