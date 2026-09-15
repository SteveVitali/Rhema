// Injectable id factory. Production mints ULIDs; tests use a deterministic sequence.

export type IdFactory = (prefix?: string) => string;

/** A deterministic, monotonic id factory for tests: `${prefix}_000001`, … */
export function sequentialIds(start = 0): IdFactory {
  let n = start;
  return (prefix = "id") => `${prefix}_${String(++n).padStart(6, "0")}`;
}
