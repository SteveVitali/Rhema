// SEC.2 (ADR-040) — verify a GCP OIDC ID token minted by another service's runtime service account.
//
// The web service stamps the resolved client IP into `x-rhema-client-ip` on its server-to-server calls
// and proves the stamp with its runtime SA's identity token (`x-rhema-internal-token`, minted from the
// Cloud Run metadata server). The api verifies the token here — signature against Google's JWKS,
// `iss`/`aud`/`exp`, and the caller SA's email — so a direct caller cannot mint the trusted channel and
// a forged `X-Forwarded-For` first hop never picks the throttle bucket. No shared secret is involved:
// the credential IS the web service's identity (REQ-ARCH-30 — nothing to store, nothing to leak).
//
// Deliberately dependency-free: node:crypto verifies the RS256 signature and `fetch` (injectable)
// pulls Google's rotating certs — no google-auth-library in the bundle.

import { createPublicKey, createVerify, type KeyObject } from "node:crypto";

/** Google's public JWKS — the signing keys for metadata-minted OIDC tokens rotate; keyed by `kid`. */
export const GOOGLE_OIDC_JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";
const GOOGLE_ISSUERS = new Set(["accounts.google.com", "https://accounts.google.com"]);

interface Jwks {
  keys?: { kid?: string; kty?: string; n?: string; e?: string; alg?: string }[];
}

function b64urlDecode(s: string): Buffer {
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

export interface GcpOidcVerifierOptions {
  /** The audience the web service mints against (`INTERNAL_AUTH_AUDIENCE` — plain deploy config). */
  readonly audience: string;
  /**
   * Pin the caller: when set, the token's `email` claim must equal it (the web runtime SA). Unset ⇒ any
   * Google-signed SA token for the audience is trusted — only sane while a single internal caller exists.
   */
  readonly email?: string;
  readonly jwksUrl?: string;
  readonly fetchImpl?: typeof fetch;
  readonly now?: () => number;
  /** JWKS cache TTL (default 6h — Google rotates ~daily; a kid-miss always forces a refetch). */
  readonly jwksTtlMs?: number;
}

/**
 * Build `(token) => Promise<boolean>` for the `verifyInternalToken` seams. Verification failures —
 * bad signature, wrong aud/iss/exp, wrong SA, a JWKS fetch error — all resolve `false` (the stamped
 * IP is simply never trusted); they never throw into the request path.
 */
export function createGcpOidcVerifier(opts: GcpOidcVerifierOptions): (token: string) => Promise<boolean> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const now = opts.now ?? Date.now;
  const jwksUrl = opts.jwksUrl ?? GOOGLE_OIDC_JWKS_URL;
  const jwksTtlMs = opts.jwksTtlMs ?? 6 * 3_600_000;
  let jwks: { at: number; byKid: Map<string, KeyObject> } = { at: 0, byKid: new Map() };

  async function keys(force = false): Promise<Map<string, KeyObject>> {
    if (!force && jwks.byKid.size > 0 && now() - jwks.at < jwksTtlMs) return jwks.byKid;
    const res = await fetchImpl(jwksUrl);
    if (!res.ok) throw new Error(`jwks ${res.status}`);
    const body = (await res.json()) as Jwks;
    const byKid = new Map<string, KeyObject>();
    for (const k of body.keys ?? []) {
      if (k.kty === "RSA" && k.kid && k.n && k.e) {
        byKid.set(k.kid, createPublicKey({ key: { kty: "RSA", n: k.n, e: k.e }, format: "jwk" }));
      }
    }
    jwks = { at: now(), byKid };
    return byKid;
  }

  return async (token: string): Promise<boolean> => {
    try {
      const parts = token.split(".");
      if (parts.length !== 3) return false;
      const header = JSON.parse(b64urlDecode(parts[0]!).toString("utf8")) as { alg?: string; kid?: string };
      const payload = JSON.parse(b64urlDecode(parts[1]!).toString("utf8")) as {
        iss?: string; aud?: string; exp?: number; iat?: number; email?: string;
      };
      if (header.alg !== "RS256" || !header.kid) return false;
      // cheap claim checks BEFORE the signature fetch — a junk token never costs a JWKS round-trip.
      if (!payload.iss || !GOOGLE_ISSUERS.has(payload.iss)) return false;
      if (payload.aud !== opts.audience) return false;
      if (typeof payload.exp !== "number" || payload.exp * 1000 <= now()) return false;
      if (opts.email && payload.email !== opts.email) return false;
      const verify = (keyset: Map<string, KeyObject>): boolean => {
        const key = keyset.get(header.kid!);
        if (!key) return false;
        return createVerify("RSA-SHA256")
          .update(`${parts[0]}.${parts[1]}`)
          .verify(key, b64urlDecode(parts[2]!));
      };
      if (verify(await keys())) return true;
      return verify(await keys(true)); // kid miss ⇒ the certs rotated: refetch once.
    } catch {
      return false;
    }
  };
}
