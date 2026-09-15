import { sha256Hex } from "@rhema/benchmark";

// Canonical JSON hashing — the basis of both the per-arm `config_hash` (REQ-EVAL-20) and the pre-registration
// hash-commit (REQ-EVAL-10). A stable serialization (object keys sorted recursively) means the SAME configuration
// always produces the SAME hash regardless of key insertion order, so a hash mismatch is a REAL configuration
// change (a deviation), never an artifact of serialization. Reuses P0.13's `sha256Hex` (no new crypto surface).

/** Deterministically serialize a value with all object keys sorted recursively (arrays keep their order). */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = sortKeys((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}

/** sha256 (hex) over the canonical serialization of a value — the one hashing path this package uses. */
export function canonicalHash(value: unknown): string {
  return sha256Hex(canonicalJson(value));
}
