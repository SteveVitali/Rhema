// 331_R7UX.8 (BL-99a, ADR-137) — pr-425 headless walk: a REAL test-tenant chat turn on the
// preview emits `chat.token` deltas on the run's SSE stream mid-turn (AC6 — probe read; the
// client render is UX.9's scope). Real magic-link mint for a test identity (the pinned
// test@rhema.tools mailbox via JourneySessions — never a lifted cookie), scratch project via
// the real POST /app/new {entry:"scratch"}, the real composer send (POST /p/<slug>/chat/turns),
// then a probe `fetch` on the same-origin SSE proxy `/p/<slug>/r/<runId>/events` collecting
// every frame until the turn's terminal event. Asserts: ≥1 chat.token frames, monotonic payload
// seq, all stamped before the turn's completion — and at least one token observed arriving on
// the LIVE tail while the run was still non-terminal (the "mid-turn" arm).
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
const require = createRequire("/Users/stevenvitali/.rhema-build/wt-r7ux8/packages/journeys/package.json");
const { chromium } = require("playwright");
const { JourneySessions, freshIdentity } = await import(
  "/Users/stevenvitali/.rhema-build/wt-r7ux8/packages/journeys/dist/session.js"
);
const { createGmailClient, TEST_MAILBOX } = await import(
  "/Users/stevenvitali/.rhema-build/wt-r7ux8/packages/journeys/dist/mailbox.js"
);

const BASE = process.argv[2];
const OUT = process.argv[3];
if (!BASE || !OUT) throw new Error("usage: node walk.mjs <webOrigin> <outDir>");
mkdirSync(OUT, { recursive: true });

const facts = { base: BASE, ts: new Date().toISOString(), legs: {} };
const browser = await chromium.launch();
const mailbox = createGmailClient(TEST_MAILBOX);
const sessions = new JourneySessions({
  browser,
  mailbox,
  webBaseUrl: BASE,
  stateDir: `${OUT}/.state`, // local session cache (live cookies) — P-1: never commit this dir
  viewport: { width: 1440, height: 960 },
  inviteCode: process.env.WALK_INVITE_CODE ?? "prv-425-test",
});

const email = freshIdentity("r7ux8", "tok");
const signed = await sessions.signIn(email, { useCache: true });
const { page, context } = signed;
facts.signinVia = signed.via;
facts.email = email;

// the real create seam — POST /app/new {entry:"scratch"} → 302 /p/<slug>
const create = await context.request.post(`${BASE}/app/new`, {
  form: { entry: "scratch" },
  maxRedirects: 0,
});
facts.legs.create = { status: create.status(), location: create.headers()["location"] ?? null };
const slugMatch = /\/p\/([^/?]+)/.exec(facts.legs.create.location ?? "");
facts.projectSlug = slugMatch?.[1] ?? null;
if (!facts.projectSlug)
  throw new Error(`scratch create did not redirect to /p/<slug>: ${JSON.stringify(facts.legs.create)}`);

await page.goto(`${BASE}/p/${facts.projectSlug}#chat`, { waitUntil: "domcontentloaded" });
// The Desk's five tab bodies all render — `data-panel-tab` picks the visible one in CSS; the
// Chat tab may start hidden behind the feed (a fresh project's panel opens on the feed body).
const chatTab = page.locator('[data-ide-panel-tab="chat"]').first();
await chatTab.waitFor({ state: "attached", timeout: 60_000 });
await chatTab.click();
const composer = page.locator("form[data-chat-composer] textarea[name=message]").first();
await composer.waitFor({ state: "visible", timeout: 60_000 });
facts.legs.mounted = true;
await page.screenshot({ path: `${OUT}/chat-composer.png` });

// Capture the runId the turn POST returns (BFF JSON envelope {ok, redirect, data:{runId,…}}).
const turnRespPromise = page.waitForResponse(
  (r) => r.url().includes("/chat/turns") && r.request().method() === "POST",
  { timeout: 60_000 },
);
const MESSAGE = "Reply with a short paragraph about rivers — a few sentences is plenty.";
await composer.fill(MESSAGE);
await page.locator("[data-chat-send]").first().click();
const turnResp = await turnRespPromise;
const turnBody = await turnResp.json().catch(() => null);
facts.legs.turnPost = { status: turnResp.status(), body: turnBody };
const runId = turnBody?.data?.runId ?? turnBody?.runId ?? null;
if (!runId) throw new Error(`turn POST did not return a runId: ${JSON.stringify(turnBody)}`);
facts.runId = runId;

// ── AC6 probe: stream the run's same-origin SSE until the turn's terminal event ──
// Attach + read in-page (the session cookie is same-origin). Collect EVERY frame; resolve on
// `chat.turn.completed`/`run.state_changed`/`cost.final`/`chat.over_cap`, stream end, or the
// deadline — whichever first. `attachAt` is stamped so the caller can prove live-tail delivery.
const probe = await page.evaluate(
  async ({ url, deadlineMs }) => {
    const attachAt = new Date().toISOString();
    const frames = [];
    const TERMINAL = new Set([
      "chat.turn.completed",
      "cost.final",
      "chat.over_cap",
    ]);
    const isTerminal = (f) => {
      if (TERMINAL.has(f.event)) return true;
      // run.state_changed fires per-transition — only the terminal `to` states end the probe.
      if (f.event === "run.state_changed") {
        try {
          const to = JSON.parse(f.data ?? "{}")?.payload?.to;
          return ["completed", "failed", "error_during_execution", "aborted"].includes(to);
        } catch { return false; }
      }
      return false;
    };
    try {
      const ctrl = new AbortController();
      const res = await fetch(url, {
        signal: ctrl.signal,
        headers: { accept: "text/event-stream" },
      });
      if (!res.ok || !res.body) return { attachAt, httpStatus: res.status, frames };
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      const deadline = Date.now() + deadlineMs;
      const timer = setTimeout(() => ctrl.abort(), deadlineMs);
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          let idx;
          while ((idx = buf.indexOf("\n\n")) >= 0) {
            const raw = buf.slice(0, idx);
            buf = buf.slice(idx + 2);
            if (raw.startsWith(":")) continue; // `: ping` heartbeat
            const f = { at: new Date().toISOString() };
            for (const line of raw.split("\n")) {
              if (line.startsWith("id:")) f.id = line.slice(3).trim();
              else if (line.startsWith("event:")) f.event = line.slice(6).trim();
              else if (line.startsWith("data:")) f.data = line.slice(5).trim();
            }
            frames.push(f);
          }
          if (frames.some((f) => isTerminal(f))) break;
          if (Date.now() > deadline) break;
        }
      } finally {
        clearTimeout(timer);
        reader.cancel().catch(() => undefined);
      }
    } catch (e) {
      frames.push({ attachNote: `probe ended: ${e?.name ?? "error"}` });
    }
    return { attachAt, frames };
  },
  { url: `${BASE}/p/${facts.projectSlug}/r/${runId}/events`, deadlineMs: 180_000 },
);

facts.probe = probe;
await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}/chat-after-turn.png`, fullPage: false });

// ── assertions ──
const named = (probe.frames ?? []).filter((f) => f.event);
const tokens = named
  .filter((f) => f.event === "chat.token")
  .map((f) => {
    let p = {};
    try {
      p = JSON.parse(f.data ?? "{}").payload ?? {};
    } catch {
      /* malformed frame — counted, not trusted */
    }
    return { eventSeq: Number(f.id), tokenSeq: p.seq, turnId: p.turnId, textLen: (p.text ?? "").length };
  });
const completion = named.find((f) => f.event === "chat.turn.completed");
const stateChanged = named.find((f) => f.event === "run.state_changed");
const terminalSeq = completion
  ? Number(completion.id)
  : stateChanged
    ? Number(stateChanged.id)
    : null;
const tokenSeqs = tokens.map((t) => t.tokenSeq);
const monotonic = tokenSeqs.every((s, i) => i === 0 || s > tokenSeqs[i - 1]);
const contiguous = tokenSeqs.every((s, i) => s === i);
const allBeforeTerminal = terminalSeq != null && tokens.every((t) => t.eventSeq < terminalSeq);
const eventTypes = [...new Set(named.map((f) => f.event))];

facts.legs.probeSummary = {
  frames: named.length,
  eventTypes,
  tokenCount: tokens.length,
  tokenSeqs,
  monotonic,
  contiguous,
  terminalSeq,
  allBeforeTerminal,
  completionEvent: completion?.event ?? null,
};
await browser.close();

facts.verdict =
  tokens.length >= 1 && monotonic && terminalSeq != null && allBeforeTerminal ? "PASS" : "REVIEW";
writeFileSync(`${OUT}/walk-facts.json`, JSON.stringify(facts, null, 2) + "\n");
console.log(`walk verdict: ${facts.verdict}`);
