// SEC.2 (ADR-040) — the internal OIDC-token minter's cache + failure postures. A forged/expired
// stamp is the api's problem (it verifies); web's job is to never mint a secret, never stall a
// request, and never hammer the metadata server on failure.

import { describe, expect, it } from "vitest";
import {
  createInternalTokenMinter,
  GCE_METADATA_IDENTITY_URL,
} from "./internal-token.js";

/** An unsigned-shaped JWT — web only reads `exp` for cache timing (the api verifies the signature). */
function jwt(expUnix: number): string {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${b64({ alg: "RS256", kid: "k1" })}.${b64({ exp: expUnix })}.sig`;
}

function response(token: string, ok = true): Response {
  return new Response(token, { status: ok ? 200 : 500 });
}

describe("createInternalTokenMinter — the trusted-channel credential (SEC.2, ADR-040)", () => {
  it("no audience ⇒ null forever and never a fetch (local dev posture)", async () => {
    let calls = 0;
    const mint = createInternalTokenMinter({
      fetchImpl: (async () => {
        calls += 1;
        return response(jwt(9_999_999_999));
      }) as typeof fetch,
    });
    expect(await mint()).toBeNull();
    expect(await mint()).toBeNull();
    expect(calls).toBe(0);
  });

  it("mints against the metadata endpoint with the flavor header + the audience query", async () => {
    let seenUrl = "";
    let seenFlavor: string | null = null;
    const mint = createInternalTokenMinter({
      audience: "https://api.example.test/",
      fetchImpl: (async (url, init) => {
        seenUrl = String(url);
        seenFlavor = new Headers(init?.headers).get("Metadata-Flavor");
        return response(jwt(9_999_999_999));
      }) as typeof fetch,
    });
    const token = await mint();
    expect(token).toContain(".");
    expect(seenUrl.startsWith(`${GCE_METADATA_IDENTITY_URL}?audience=`)).toBe(true);
    expect(decodeURIComponent(seenUrl)).toContain("audience=https://api.example.test");
    expect(seenFlavor).toBe("Google");
  });

  it("caches a token to exp−60s, then re-mints", async () => {
    let t = 1_000_000;
    let calls = 0;
    // exp at t+3600s ⇒ cached until t+3540s (the 60s skew).
    const mint = createInternalTokenMinter({
      audience: "aud",
      now: () => t,
      fetchImpl: (async () => {
        calls += 1;
        return response(jwt(t / 1000 + 3600));
      }) as typeof fetch,
    });
    const first = await mint();
    expect(first).not.toBeNull();
    expect(await mint()).toBe(first);
    expect(calls).toBe(1);
    t += 3_540_000 - 1; // just before exp−60s — still cached
    expect(await mint()).toBe(first);
    expect(calls).toBe(1);
    t += 2; // past exp−60s — re-mint
    const second = await mint();
    expect(second).not.toBe(first);
    expect(calls).toBe(2);
  });

  it("falls back to the 50min cache when exp can't be parsed", async () => {
    let t = 0;
    let calls = 0;
    const mint = createInternalTokenMinter({
      audience: "aud",
      now: () => t,
      fetchImpl: (async () => {
        calls += 1;
        return response("not-a-jwt");
      }) as typeof fetch,
    });
    await mint();
    t += 50 * 60_000 - 1;
    await mint();
    expect(calls).toBe(1);
    t += 2;
    await mint();
    expect(calls).toBe(2);
  });

  it("negative-caches a mint failure for 60s (no per-request metadata round-trip)", async () => {
    let t = 0;
    let calls = 0;
    const mint = createInternalTokenMinter({
      audience: "aud",
      now: () => t,
      fetchImpl: (async () => {
        calls += 1;
        throw new Error("no metadata server");
      }) as typeof fetch,
    });
    expect(await mint()).toBeNull();
    expect(await mint()).toBeNull();
    expect(calls).toBe(1);
    t += 59_999;
    expect(await mint()).toBeNull();
    expect(calls).toBe(1);
    t += 2; // 60s elapsed — retry allowed
    expect(await mint()).toBeNull();
    expect(calls).toBe(2);
  });

  it("a non-OK metadata response negative-caches the same way", async () => {
    let calls = 0;
    const mint = createInternalTokenMinter({
      audience: "aud",
      fetchImpl: (async () => {
        calls += 1;
        return response("", false);
      }) as typeof fetch,
    });
    expect(await mint()).toBeNull();
    expect(await mint()).toBeNull();
    expect(calls).toBe(1);
  });

  it("a hung mint is bounded by the timeout and resolves null", async () => {
    const mint = createInternalTokenMinter({
      audience: "aud",
      timeoutMs: 25,
      fetchImpl: ((url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError")),
          );
        })) as typeof fetch,
    });
    expect(await mint()).toBeNull();
  });
});
