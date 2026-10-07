#!/usr/bin/env node
// RES.1 (D-RES.1-1) — provision the live-probe inputs through the REAL surfaces, nothing else:
//   • sign the funded stable identity `test+jrn-a@rhema.tools` in through the real magic-link
//     funnel (the Gmail DWD mailbox leg N2 exercises — storageState reuse first, a fresh link on
//     a dead cache);
//   • create a project whose head draft is `fixtures/planted-error-excerpt.md` through the real
//     paste-draft preview flow (the same `createDraftProject` leg N6 drives);
//   • print ONE JSON line: { email, via, projectSlug, sessionCookie }.
//
// The session cookie is a bearer credential (`token.signature`) — it is printed to stdout so the
// caller can pass it straight to PROBE_SESSION_COOKIE; it is NEVER written to a file or ledger.
//
//   pnpm --filter @rhema/journeys exec tsx src/provision-res1.ts
// env: JOURNEY_WEB_URL (default https://rhema.tools), JOURNEY_STATE_DIR (default .journeys-state),
//      JOURNEY_GCP_ACCESS_TOKEN (else gcloud ADC — mailbox.ts's caller credential).

import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createGmailClient, TEST_MAILBOX } from "./mailbox.js";
import { JourneySessions, stableIdentity } from "./session.js";
import { createDraftProject } from "./steps.js";

const webBaseUrl = (process.env.JOURNEY_WEB_URL ?? "https://rhema.tools").replace(/\/+$/, "");
const stateDir = process.env.JOURNEY_STATE_DIR ?? ".journeys-state";

const browser = await chromium.launch({ headless: true });
try {
  const sessions = new JourneySessions({
    browser,
    mailbox: createGmailClient(TEST_MAILBOX),
    webBaseUrl,
    stateDir,
  });
  const signed = await sessions.signIn(stableIdentity("a"), { useCache: true });
  const excerpt = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "../fixtures/planted-error-excerpt.md"),
    "utf8",
  );
  const projectSlug = await createDraftProject(
    signed.page,
    webBaseUrl,
    `res1-probe-${new Date().toISOString().slice(0, 10)}`,
    excerpt,
  );
  // The session cookie the probe replays on api.rhema.tools (the api resolves the session row
  // directly — packages/db/src/session.ts; the same cookie the browser presents to rhema.tools).
  const cookies = await signed.context.cookies(webBaseUrl);
  const sess = cookies.find((c) => /session/i.test(c.name));
  const sessionCookie = sess ? `${sess.name}=${sess.value}` : null;
  console.log(
    JSON.stringify({ email: signed.email, via: signed.via, projectSlug, sessionCookie }),
  );
  if (!sessionCookie) throw new Error("signed-in context carries no session cookie");
} finally {
  await browser.close();
}
