// Injectable id factory. Production mints ULIDs; tests use a deterministic sequence.

import { randomInt } from "node:crypto";

export type IdFactory = (prefix?: string) => string;

/** A deterministic, monotonic id factory for tests: `${prefix}_000001`, … */
export function sequentialIds(start = 0): IdFactory {
  let n = start;
  return (prefix = "id") => `${prefix}_${String(++n).padStart(6, "0")}`;
}

/**
 * A deterministic id factory that is ALSO a valid 26-char id (the ULID shape the schemas validate): a monotonic
 * counter left-padded with `0` to 26 digits. Digits are valid Crockford base32, so ids emitted into events
 * (which validate the id shape at the write boundary) pass. Distinct + stable; the prefix is not encoded.
 */
export function sequentialUlids(start = 0): IdFactory {
  let n = start;
  return () => String(++n).padStart(26, "0");
}

/** Crockford base32 (no I/L/O/U) — the ULID alphabet the id schemas validate. */
const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** A ULID: 48-bit timestamp (10 chars) + 80-bit randomness (16 chars), 26 Crockford-base32 chars. */
export function ulid(now: number = Date.now()): string {
  let time = "";
  let t = Math.floor(now);
  for (let i = 0; i < 10; i++) {
    time = CROCKFORD[t % 32] + time;
    t = Math.floor(t / 32);
  }
  let rand = "";
  for (let i = 0; i < 16; i++) rand += CROCKFORD[randomInt(0, 32)];
  return time + rand;
}

/**
 * The production id factory: a fresh ULID per call (the `prefix` is not encoded — the ULID shape is what the
 * schemas validate). Cryptographically-random suffix, so ids are unique across processes without coordination.
 */
export function randomUlids(): IdFactory {
  return () => ulid();
}
