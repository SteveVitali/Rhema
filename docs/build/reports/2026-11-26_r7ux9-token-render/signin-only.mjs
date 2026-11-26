// signin-only leg: provision the UX.9 test identity (user + workspace + billing account) so the
// audited house-grant one-off job can bind its billing_account_id before the full walk.
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
const require = createRequire("/Users/stevenvitali/.rhema-build/wt-r7ux9/packages/journeys/package.json");
const { chromium } = require("playwright");
const { JourneySessions, freshIdentity } = await import(
  "/Users/stevenvitali/.rhema-build/wt-r7ux9/packages/journeys/dist/session.js"
);
const { createGmailClient, TEST_MAILBOX } = await import(
  "/Users/stevenvitali/.rhema-build/wt-r7ux9/packages/journeys/dist/mailbox.js"
);
const BASE = process.argv[2];
const OUT = process.argv[3];
if (!BASE || !OUT) throw new Error("usage: node signin-only.mjs <webOrigin> <outDir>");
mkdirSync(`${OUT}/.state`, { recursive: true });
const browser = await chromium.launch();
const mailbox = createGmailClient(TEST_MAILBOX);
const sessions = new JourneySessions({
  browser,
  mailbox,
  webBaseUrl: BASE,
  stateDir: `${OUT}/.state`,
  inviteCode: process.env.WALK_INVITE_CODE ?? "prv-426-test",
});
const email = freshIdentity("r7ux9", "tok");
const signed = await sessions.signIn(email);
console.log(JSON.stringify({ email, via: signed.via }));
await browser.close();
