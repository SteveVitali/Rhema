// The run token (§12.4 step 4; REQ-ARCH-11 amended; ledger M14). A JWT (2 h) held by the `harness` uid,
// carrying claims incl. **attempt**; refreshed on heartbeat, rotated on every re-enqueue, revoked at terminal
// state. Fencing (attempt < current_attempt → 409) and revocation-at-terminal are enforced in the internal
// API handlers against the DB — the token itself only proves "this attempt of this run". Live JWT/jose (RS256,
// Secret Manager key) is deferred to the deploy; this HMAC signer is the deterministic seam.

import { createHmac, createSign, createVerify, timingSafeEqual, type KeyLike } from "node:crypto";
import type { Clock } from "./clock.js";

export const RUN_TOKEN_TTL_MS = 2 * 60 * 60 * 1000; // 2 h (§12.4)

export interface RunTokenClaims {
  readonly runId: string;
  readonly attempt: number;
  readonly workspaceId: string;
  readonly projectId?: string;
  readonly seat: string;
  /** step scope, when the token is narrowed to a step. */
  readonly scope?: string;
  /** issued-at / expiry, epoch ms. */
  readonly iat: number;
  readonly exp: number;
}

export interface RunTokenService {
  /** Mint a token for an attempt; `ttlMs` defaults to 2 h. */
  mint(claims: Omit<RunTokenClaims, "iat" | "exp">, ttlMs?: number): string;
  /** Decode + verify signature and expiry; null when invalid or expired. Does NOT check attempt/terminal. */
  verify(token: string): RunTokenClaims | null;
}

function b64url(buf: Buffer): string {
  return buf.toString("base64url");
}

/** HMAC-SHA256 signed `${payloadB64}.${sigB64}` token — the deterministic stand-in for the deployed JWT. */
export class HmacRunTokenService implements RunTokenService {
  constructor(
    private readonly secret: string,
    private readonly clock: Clock,
  ) {}

  mint(claims: Omit<RunTokenClaims, "iat" | "exp">, ttlMs: number = RUN_TOKEN_TTL_MS): string {
    const iat = this.clock.now().getTime();
    const full: RunTokenClaims = { ...claims, iat, exp: iat + ttlMs };
    const payload = b64url(Buffer.from(JSON.stringify(full), "utf8"));
    const sig = b64url(createHmac("sha256", this.secret).update(payload).digest());
    return `${payload}.${sig}`;
  }

  verify(token: string): RunTokenClaims | null {
    const dot = token.indexOf(".");
    if (dot <= 0) return null;
    const payload = token.slice(0, dot);
    const sig = token.slice(dot + 1);
    const expected = b64url(createHmac("sha256", this.secret).update(payload).digest());
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    let claims: RunTokenClaims;
    try {
      claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as RunTokenClaims;
    } catch {
      return null;
    }
    if (typeof claims.exp !== "number" || claims.exp < this.clock.now().getTime()) return null;
    return claims;
  }
}

// --- The LIVE RS256 signer (D-P0.08-1) — the deploy binding behind the same `RunTokenService` seam. -------
//
// A standard JWT (`base64url(header).base64url(payload).base64url(sig)`, alg RS256) so it is a drop-in swap
// for the HMAC stand-in: identical `RunTokenClaims` (epoch-ms iat/exp), identical internal-API expiry/attempt
// semantics. The api mints with the PRIVATE key (from Secret Manager); the egress-proxy verifies attempts with
// the PUBLIC key only (it can check a token but never forge one — REQ-ARCH-11/31). Built on node crypto, so it
// is fully round-trip-tested offline with a generated keypair; the only live piece is the key SOURCE (Secret
// Manager), which is D-P0.07-2.

export interface Rs256Keys {
  /** the RSA private key (PEM or KeyObject) — required to mint; omit for a verify-only holder (the proxy). */
  readonly privateKey?: KeyLike;
  /** the RSA public key (PEM or KeyObject) — required to verify. */
  readonly publicKey: KeyLike;
  /** optional key id, stamped into the JWT header for rotation. */
  readonly keyId?: string;
}

const JWT_HEADER_ALG = "RS256";

export class Rs256RunTokenService implements RunTokenService {
  constructor(
    private readonly keys: Rs256Keys,
    private readonly clock: Clock,
  ) {}

  mint(claims: Omit<RunTokenClaims, "iat" | "exp">, ttlMs: number = RUN_TOKEN_TTL_MS): string {
    if (!this.keys.privateKey) throw new Error("Rs256RunTokenService: cannot mint without a private key (verify-only holder)");
    const iat = this.clock.now().getTime();
    const full: RunTokenClaims = { ...claims, iat, exp: iat + ttlMs };
    const header = { alg: JWT_HEADER_ALG, typ: "JWT", ...(this.keys.keyId ? { kid: this.keys.keyId } : {}) };
    const signingInput = `${b64url(Buffer.from(JSON.stringify(header)))}.${b64url(Buffer.from(JSON.stringify(full)))}`;
    const sig = createSign("RSA-SHA256").update(signingInput).sign(this.keys.privateKey);
    return `${signingInput}.${b64url(sig)}`;
  }

  verify(token: string): RunTokenClaims | null {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const [headerB64, payloadB64, sigB64] = parts as [string, string, string];
    // Reject any alg but RS256 (defends against alg-confusion / "none").
    let header: { alg?: string };
    try {
      header = JSON.parse(Buffer.from(headerB64, "base64url").toString("utf8")) as { alg?: string };
    } catch {
      return null;
    }
    if (header.alg !== JWT_HEADER_ALG) return null;
    let ok: boolean;
    try {
      ok = createVerify("RSA-SHA256")
        .update(`${headerB64}.${payloadB64}`)
        .verify(this.keys.publicKey, Buffer.from(sigB64, "base64url"));
    } catch {
      return null;
    }
    if (!ok) return null;
    let claims: RunTokenClaims;
    try {
      claims = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8")) as RunTokenClaims;
    } catch {
      return null;
    }
    if (typeof claims.exp !== "number" || claims.exp < this.clock.now().getTime()) return null;
    return claims;
  }
}
