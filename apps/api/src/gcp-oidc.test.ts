import { describe, it, expect } from "vitest";
import { generateKeyPairSync, createSign, type KeyObject, type JsonWebKey } from "node:crypto";
import { createGcpOidcVerifier } from "./gcp-oidc.js";

// SEC.2 (ADR-040) — the trusted web→api client-IP channel's verifier: only a Google-signed OIDC ID
// token for the agreed audience (and the pinned caller SA) makes the api trust a stamped
// `x-rhema-client-ip`. Everything else — forged signature, wrong aud/iss/exp/SA, JWKS unreachable —
// resolves false and the request falls back to the penultimate-XFF rule. Tests mint real RS256 JWTs
// against a generated keypair served by a stubbed JWKS fetch — no network, deterministic.

const AUD = "https://api.rhema.tools";
const CALLER_SA = "rhema-web@rhema.iam.gserviceaccount.com";

function b64url(buf: Buffer | string): string {
  return (typeof buf === "string" ? Buffer.from(buf) : buf)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function mintJwt(privateKey: KeyObject, payload: Record<string, unknown>, kid = "kid-1"): string {
  const header = b64url(JSON.stringify({ alg: "RS256", kid, typ: "JWT" }));
  const body = b64url(JSON.stringify(payload));
  const sig = createSign("RSA-SHA256").update(`${header}.${body}`).sign(privateKey);
  return `${header}.${body}.${b64url(sig)}`;
}

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = publicKey.export({ format: "jwk" }) as JsonWebKey;
const KID = "kid-1";
const jwksBody = { keys: [{ ...jwk, kid: KID, alg: "RS256" }] };

/** A fetch stub serving the fixed JWKS (tracks calls so rotation re-fetch is observable). */
function jwksFetch(failures = 0) {
  let calls = 0;
  let left = failures;
  const f = (async () => {
    calls += 1;
    if (left > 0) {
      left -= 1;
      return { ok: false, status: 503, json: async () => ({}) } as Response;
    }
    return { ok: true, status: 200, json: async () => jwksBody } as Response;
  }) as typeof fetch & { calls: number };
  Object.defineProperty(f, "calls", { get: () => calls });
  return f;
}

const NOW = Math.floor(new Date("2026-10-02T12:00:00Z").getTime() / 1000);
const validPayload = {
  iss: "https://accounts.google.com",
  aud: AUD,
  exp: NOW + 3600,
  iat: NOW,
  email: CALLER_SA,
  email_verified: true,
};

describe("createGcpOidcVerifier (ADR-040 — the trusted internal-IP channel)", () => {
  const verifier = (fetchImpl: ReturnType<typeof jwksFetch> = jwksFetch()) =>
    createGcpOidcVerifier({
      audience: AUD,
      email: CALLER_SA,
      fetchImpl,
      now: () => NOW * 1000,
    });

  it("a Google-signed token for the right audience + caller SA verifies", async () => {
    const verify = verifier();
    expect(await verify(mintJwt(privateKey, validPayload))).toBe(true);
  });

  it("forged/wrong-claim tokens all resolve false — the stamp is never trusted", async () => {
    const verify = verifier();
    // wrong audience — a token minted for another service can't authorize the stamp here.
    expect(await verify(mintJwt(privateKey, { ...validPayload, aud: "https://evil.example" }))).toBe(false);
    // wrong issuer — not Google-signed.
    expect(await verify(mintJwt(privateKey, { ...validPayload, iss: "https://evil.example" }))).toBe(false);
    // expired.
    expect(await verify(mintJwt(privateKey, { ...validPayload, exp: NOW - 60 }))).toBe(false);
    // a DIFFERENT service account than the web runtime SA.
    expect(await verify(mintJwt(privateKey, { ...validPayload, email: "other@rhema.iam.gserviceaccount.com" }))).toBe(false);
    // garbage / malformed tokens.
    expect(await verify("not-a-jwt")).toBe(false);
    expect(await verify("a.b.c")).toBe(false);
  });

  it("a token signed by an unknown key fails (signature never skips verification)", async () => {
    const other = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const verify = verifier();
    // signed by a keypair the JWKS does not publish, under the published kid.
    expect(await verify(mintJwt(other.privateKey, validPayload))).toBe(false);
  });

  it("a kid miss forces ONE JWKS refetch (key rotation), then verifies", async () => {
    const { privateKey: pk2, publicKey: pub2 } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const jwk2 = pub2.export({ format: "jwk" }) as JsonWebKey;
    const rotated = { keys: [...jwksBody.keys, { ...jwk2, kid: "kid-2", alg: "RS256" }] };
    let calls = 0;
    const f = (async () => {
      calls += 1;
      return { ok: true, status: 200, json: async () => rotated } as Response;
    }) as typeof fetch;
    const verify = createGcpOidcVerifier({ audience: AUD, fetchImpl: f, now: () => NOW * 1000 });
    expect(await verify(mintJwt(pk2, validPayload, "kid-2"))).toBe(true);
    expect(calls).toBe(1);
  });

  it("a JWKS outage resolves false — never throws into the request path", async () => {
    const verify = verifier(jwksFetch(10));
    expect(await verify(mintJwt(privateKey, validPayload))).toBe(false);
  });

  it("no pinned email ⇒ any Google SA token for the audience trusts the channel", async () => {
    const verify = createGcpOidcVerifier({ audience: AUD, fetchImpl: jwksFetch(), now: () => NOW * 1000 });
    expect(await verify(mintJwt(privateKey, { ...validPayload, email: "whoever@x.iam.gserviceaccount.com" }))).toBe(true);
  });
});
