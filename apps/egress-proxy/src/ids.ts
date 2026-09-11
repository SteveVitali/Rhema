// @rhema/egress-proxy — ULID generation for `usage_records.id` (§11.3: ids are 26-char Crockford-base32 ULIDs).
//
// The proxy assigns the id when it writes a metered row. This is a minimal ULID (48-bit ms timestamp + 80 bits
// of randomness) over the Crockford base32 alphabet, matching @rhema/contracts `idSchema`. Id generation is
// injected into the handler (`newId`) so tests are deterministic; this is the production default.

import { randomBytes } from "node:crypto";

// Crockford base32 (no I, L, O, U) — exactly the alphabet @rhema/contracts `idSchema` accepts.
const ENCODING = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const TIME_LEN = 10;
const RANDOM_LEN = 16;

function encodeTime(nowMs: number): string {
  let n = nowMs;
  let out = "";
  for (let i = TIME_LEN - 1; i >= 0; i--) {
    const mod = n % 32;
    out = ENCODING[mod] + out;
    n = Math.floor(n / 32);
  }
  return out;
}

function encodeRandom(): string {
  const bytes = randomBytes(RANDOM_LEN);
  let out = "";
  for (let i = 0; i < RANDOM_LEN; i++) out += ENCODING[(bytes[i] ?? 0) % 32];
  return out;
}

/** A 26-char Crockford-base32 ULID (sortable by creation time). */
export function ulid(nowMs: number = Date.now()): string {
  return encodeTime(nowMs) + encodeRandom();
}

/** Id factory the handler injects; the default is a real ULID generator. */
export type IdFactory = () => string;
