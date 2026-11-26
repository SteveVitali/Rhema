// 332_R7UX.9 (BL-99b, ADR-137) — pr-426 headless walk: a REAL test-tenant chat turn on the
// preview renders `chat.token` deltas INTO THE PENDING BUBBLE incrementally (the client half;
// UX.8 proved the wire). Real magic-link mint for a test identity (the pinned test@rhema.tools
// mailbox via JourneySessions — never a lifted cookie), scratch project via the real POST
// /app/new {entry:"scratch"}, the real composer send (POST /p/<slug>/chat/turns), then Node-side
// DOM sampling of [data-chat-stream] while an in-page SSE probe collects every frame until the
// turn's terminal event.
//
// Asserts (ADR-137 client contract):
//   1. [data-chat-stream] appears with non-empty text WHILE the run is non-terminal (mid-turn
//      incremental render — never inter-token timing, the producer may flush tokens in one `at`)
//   2. growth samples are recorded as evidence (2+ strictly-increasing lengths when the producer
//      spreads deltas across flushes)
//   3. the stream binds to ONE bubble — never duplicated across optimistic + transcript rows
//   4. canonical swap on completion: [data-chat-stream] unmounts and the canonical reply renders
//      in the same turn's bubble (the record outranks the stream on any mismatch)
//   5. wire evidence retained: ≥1 chat.token frames, monotonic payload seq, all before terminal
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
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
  inviteCode: process.env.WALK_INVITE_CODE ?? "prv-426-test",
});

const email = freshIdentity("r7ux9", "tok");
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
const MESSAGE =
  "Write a short paragraph about rivers — three or four sentences, plain prose, no list.";
await composer.fill(MESSAGE);
await page.locator("[data-chat-send]").first().click();
const turnResp = await turnRespPromise;
const turnBody = await turnResp.json().catch(() => null);
facts.legs.turnPost = { status: turnResp.status(), body: turnBody };
const runId = turnBody?.data?.runId ?? turnBody?.runId ?? null;
if (!runId) throw new Error(`turn POST did not return a runId: ${JSON.stringify(turnBody)}`);
facts.runId = runId;

// ── in-page SSE probe (UX.8's shape — the wire evidence leg) ──
const probePromise = page.evaluate(
  async ({ url, deadlineMs }) => {
    const attachAt = new Date().toISOString();
    const frames = [];
    const TERMINAL = new Set(["chat.turn.completed", "cost.final", "chat.over_cap"]);
    const isTerminal = (f) => {
      if (TERMINAL.has(f.event)) return true;
      if (f.event === "run.state_changed") {
        try {
          const to = JSON.parse(f.data ?? "{}")?.payload?.to;
          return ["completed", "completed_partial", "failed", "cancelled",
            "error_during_execution", "aborted"].includes(to);
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
            if (raw.startsWith(":")) continue;
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

// ── DOM sampling (the UX.9 leg): [data-chat-stream] growth while the run is non-terminal ──
// Poll the live DOM on Node's clock — one read per ~150 ms — until the SSE probe reports a
// terminal frame or the deadline lands. Records {t, streamTextLen, streamingNodes, replyLen,
// pendingLine} so the verdict reads the render curve, never inter-token timing.
const samples = [];
let midShotTaken = false;
const deadline = Date.now() + 180_000;
for (;;) {
  const s = await page
    .evaluate(() => {
      const nodes = [...document.querySelectorAll("[data-chat-stream]")];
      const streaming = [...document.querySelectorAll("[data-streaming='true']")];
      const bubbles = [...document.querySelectorAll("[data-chat-bubble='assistant']")];
      const replyLens = bubbles.map((b) => {
        const t = [...b.querySelectorAll(".chat-bubble-text")]
          .filter((n) => !n.hasAttribute("data-chat-stream"))
          .map((n) => n.textContent?.length ?? 0)
          .reduce((a, c) => a + c, 0);
        return t;
      });
      return {
        streamTexts: nodes.map((n) => ({
          bound: n.getAttribute("data-chat-stream"),
          len: n.textContent?.length ?? 0,
        })),
        streamingCount: streaming.length,
        replyLens,
        pendingLine: !!document.querySelector("[data-chat-progress], .chat-bubble-pending"),
      };
    })
    .catch(() => null);
  if (s != null) samples.push({ t: Date.now(), ...s });
  const totalStream = (s?.streamTexts ?? []).reduce((a, c) => a + c.len, 0);
  if (!midShotTaken && totalStream >= 20) {
    // the IDE auto-selects the live-feed tab when a run starts — re-assert the chat tab so the
    // streamed bubble is VISIBLE in the shot (REQ-SPEC-29 visible-text evidence).
    midShotTaken = true;
    await chatTab.click().catch(() => undefined);
    await page.waitForTimeout(150);
    await page.screenshot({ path: `${OUT}/chat-mid-stream.png` });
  }
  if (Date.now() > deadline) break;
  // stop sampling once the terminal swap has fully landed: no stream nodes + a non-empty reply
  const swapped =
    s != null &&
    s.streamTexts.length === 0 &&
    s.streamingCount === 0 &&
    s.replyLens.some((l) => l > 0);
  if (swapped) break;
  await page.waitForTimeout(150);
}
const probe = await probePromise;
facts.probe = probe;
facts.domSamples = samples;

// final state — the canonical bubble after the swap
const finalDom = await page.evaluate(() => {
  const turns = [...document.querySelectorAll("[data-chat-turn]")];
  return turns.map((t) => ({
    id: t.getAttribute("data-chat-turn"),
    streamNodes: t.querySelectorAll("[data-chat-stream]").length,
    streaming: t.querySelectorAll("[data-streaming='true']").length,
    replyText: [...t.querySelectorAll("[data-chat-bubble='assistant'] .chat-bubble-text")]
      .filter((n) => !n.hasAttribute("data-chat-stream"))
      .map((n) => n.textContent ?? "")
      .join(""),
    pending: !!t.querySelector(".chat-bubble-pending"),
  }));
});
facts.finalDom = finalDom;
// the final shot shows the CANONICAL bubble in the chat tab — the swap made visible.
await chatTab.click().catch(() => undefined);
await page.waitForTimeout(400);
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
const termFrame = named.find((f) => {
  if (["chat.turn.completed", "cost.final", "chat.over_cap"].includes(f.event)) return true;
  if (f.event === "run.state_changed") {
    try {
      const to = JSON.parse(f.data ?? "{}")?.payload?.to;
      return ["completed", "completed_partial", "failed", "cancelled",
        "error_during_execution", "aborted"].includes(to);
    } catch { return false; }
  }
  return false;
});
const terminalSeq = termFrame ? Number(termFrame.id) : null;
const tokenSeqs = tokens.map((t) => t.tokenSeq);
const monotonic = tokenSeqs.every((s, i) => i === 0 || s > tokenSeqs[i - 1]);
const allBeforeTerminal = terminalSeq != null && tokens.every((t) => t.eventSeq < terminalSeq);
const eventTypes = [...new Set(named.map((f) => f.event))];

// DOM assertions — the render contract
const streamLens = samples.map((s) => s.streamTexts.reduce((a, c) => a + c.len, 0));
const sawNonEmpty = streamLens.some((l) => l > 0);
const increasing = streamLens.filter((l, i) => i === 0 || l > streamLens[i - 1]).length;
const growthSamples = streamLens.filter((l) => l > 0);
const strictlyGrew =
  growthSamples.length >= 2 && growthSamples.some((l, i) => i > 0 && l > growthSamples[i - 1]);
const maxConcurrentStreamNodes = Math.max(
  0,
  ...samples.map((s) => s.streamTexts.length),
);
const finalTurn = finalDom.find((t) => t.id === runId) ?? finalDom.at(-1) ?? null;
const canonicalSwap =
  finalTurn != null &&
  finalTurn.streamNodes === 0 &&
  finalTurn.streaming === 0 &&
  finalTurn.replyText.trim().length > 0;

facts.legs.dom = {
  sampleCount: samples.length,
  sawNonEmptyStream: sawNonEmpty,
  strictlyGrew,
  growthLens: growthSamples,
  maxConcurrentStreamNodes,
  finalTurn,
  canonicalSwap,
};
facts.legs.probeSummary = {
  frames: named.length,
  eventTypes,
  tokenCount: tokens.length,
  tokenSeqs,
  monotonic,
  terminalSeq,
  allBeforeTerminal,
  completionEvent: completion?.event ?? null,
};
await browser.close();

// PASS: wire healthy (tokens, ordered, pre-terminal) AND the render contract held —
// non-empty stream mid-turn, never two stream nodes at once, canonical swap on completion.
facts.verdict =
  tokens.length >= 1 &&
  monotonic &&
  terminalSeq != null &&
  allBeforeTerminal &&
  sawNonEmpty &&
  maxConcurrentStreamNodes <= 1 &&
  canonicalSwap
    ? "PASS"
    : "REVIEW";
writeFileSync(`${OUT}/walk-facts.json`, JSON.stringify(facts, null, 2) + "\n");
console.log(`walk verdict: ${facts.verdict}`);
