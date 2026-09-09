// The pure content-address for `protocols_version` (REQ-SPEC-22; ticket P0.04 AC5) — PUBLIC and
// public-CI-tested (scripts/lib/protocols-version.test.mjs), so the versioning mechanism is covered even
// where the private @rhema/protocols checkout is absent. The private package re-implements the identical
// algorithm in src/version.ts (for its runtime-exported PROTOCOLS_VERSION + consumer API); the private
// self-check (version.test.ts asserts the frozen value equals this algorithm's output over the real trio)
// keeps the two copies in lockstep — a divergence would turn that self-check red.

import { createHash } from "node:crypto";

const sha256 = (s) => createHash("sha256").update(s, "utf8").digest("hex");

/**
 * Content address over a `relativePath → content` map spanning the trio (skills, manifests,
 * parsers/serializers). Deterministic and order-independent; changes iff a trio file's path or content
 * changes, never for a file outside the map.
 * @param {Record<string,string>} files
 * @param {string} base
 * @returns {string}
 */
export function computeProtocolsVersion(files, base = "0.4.0") {
  const manifest = Object.keys(files)
    .sort()
    .map((path) => `${path} ${sha256(files[path])}`)
    .join("\n");
  return `${base}+${sha256(manifest).slice(0, 16)}`;
}
