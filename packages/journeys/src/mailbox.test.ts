import { describe, expect, it } from "vitest";
import {
  createGmailClient,
  TEST_MAILBOX,
  JOURNEY_SA,
  GMAIL_READ_SCOPE,
} from "./mailbox.js";

// JOURNEY.1 — the keyless Gmail DWD client: pinned sub, readonly scope, signJwt → jwt-bearer →
// gmail.readonly. All fetches are stubbed — nothing live, nothing secret.

const LINK = "https://app.rhema.tools/api/auth/magic-link/verify?token=abc123&callbackURL=%2Fapp";

function stubFetch(opts: { signPayload?: (p: Record<string, unknown>) => void } = {}) {
  const calls: { url: string; body?: string }[] = [];
  const fetchFn = (async (url: unknown, init?: { body?: string }) => {
    const u = String(url);
    calls.push({ url: u, body: init?.body });
    if (u.includes(":signJwt")) {
      const payload = JSON.parse(JSON.parse(init!.body!).payload as string);
      opts.signPayload?.(payload);
      return new Response(JSON.stringify({ signedJwt: "hdr.payload.sig" }), { status: 200 });
    }
    if (u === "https://oauth2.googleapis.com/token") {
      expect(init!.body!).toContain("jwt-bearer");
      expect(init!.body!).toContain("assertion=hdr.payload.sig");
      return new Response(JSON.stringify({ access_token: "ya29.test", expires_in: 3600 }), { status: 200 });
    }
    if (u.includes("/gmail/v1/") && u.includes("/messages?")) {
      return new Response(JSON.stringify({ messages: [{ id: "m1" }] }), { status: 200 });
    }
    if (u.includes("/gmail/v1/") && u.includes("/messages/m1")) {
      const payload = {
        payload: {
          headers: [
            { name: "Subject", value: "Your Rhema sign-in link" },
            { name: "To", value: "test+j1nv@rhema.tools" },
            { name: "From", value: "noreply@rhema.tools" },
            { name: "Date", value: "Wed, 01 Oct 2026 00:00:00 +0000" },
          ],
          mimeType: "text/plain",
          body: { data: Buffer.from(`Sign in: ${LINK}`, "utf8").toString("base64url") },
        },
      };
      return new Response(JSON.stringify(payload), { status: 200 });
    }
    return new Response("not found", { status: 404 });
  }) as typeof fetch;
  return { fetchFn, calls };
}

describe("createGmailClient — the keyless DWD mailbox", () => {
  it("refuses any userId other than the pinned test mailbox", () => {
    expect(() => createGmailClient("alice@example.com", { callerToken: async () => "t" })).toThrow(
      /pinned to test@rhema.tools/,
    );
    expect(() => createGmailClient("test@rhema.tools.evil", { callerToken: async () => "t" })).toThrow();
    expect(() => createGmailClient(TEST_MAILBOX, { callerToken: async () => "t" })).not.toThrow();
  });

  it("signs a DWD JWT with the SA as iss, the pinned mailbox as sub, readonly scope only", async () => {
    let payload: Record<string, unknown> | undefined;
    const { fetchFn, calls } = stubFetch({ signPayload: (p) => (payload = p) });
    const client = createGmailClient(TEST_MAILBOX, {
      fetchFn,
      callerToken: async () => "caller-token",
      now: () => 1_700_000_000_000,
    });
    const ids = await client.listMessages("to:test+j1nv@rhema.tools");
    expect(ids).toEqual(["m1"]);
    expect(payload?.iss).toBe(JOURNEY_SA);
    expect(payload?.sub).toBe(TEST_MAILBOX);
    expect(payload?.scope).toBe(GMAIL_READ_SCOPE);
    expect(payload?.aud).toBe("https://oauth2.googleapis.com/token");
    // signJwt call carried the CALLER's token (WI/ADC), never a key
    expect(calls[0]?.url).toContain(`${encodeURIComponent(JOURNEY_SA)}:signJwt`);
    // the gmail call ran under the exchanged token
    expect(calls.at(-1)?.url).toContain(`/users/${encodeURIComponent(TEST_MAILBOX)}/messages`);
  });

  it("awaitMagicLink polls and extracts the verify URL", async () => {
    const { fetchFn } = stubFetch();
    const client = createGmailClient(TEST_MAILBOX, {
      fetchFn,
      callerToken: async () => "t",
      now: () => Date.now(),
    });
    const link = await client.awaitMagicLink("test+j1nv@rhema.tools", 0, 15_000);
    expect(link).toBe(LINK);
  });

  it("times out when no matching message lands", async () => {
    const fetchFn = (async () => new Response(JSON.stringify({ messages: [] }), { status: 200 })) as typeof fetch;
    // needs signJwt+token stubs first — wrap: first two calls stubbed, then empty lists
    const inner = stubFetch().fetchFn;
    let n = 0;
    const composed = (async (u: unknown, i?: { body?: string }) =>
      n++ < 2 ? inner(u, i) : fetchFn(u)) as typeof fetch;
    const client = createGmailClient(TEST_MAILBOX, {
      fetchFn: composed,
      callerToken: async () => "t",
    });
    await expect(client.awaitMagicLink("test+x@rhema.tools", 0, 50)).rejects.toThrow(/timed out/);
  });
});
