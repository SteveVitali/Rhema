// Injectable id factory. Production mints ULIDs; tests use a deterministic sequence.

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
