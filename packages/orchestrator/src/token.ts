// The run token (§12.4 step 4; REQ-ARCH-11 amended; ledger M14). A JWT (2 h) held by the `harness` uid,
// carrying claims incl. **attempt**; refreshed on heartbeat, rotated on every re-enqueue, revoked at terminal
// state. Fencing (attempt < current_attempt → 409) and revocation-at-terminal are enforced in the internal
// API handlers against the DB — the token itself only proves "this attempt of this run". Live JWT/jose (RS256,
// Secret Manager key) is deferred to the deploy; this HMAC signer is the deterministic seam.

import { createHmac, timingSafeEqual } from "node:crypto";
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
