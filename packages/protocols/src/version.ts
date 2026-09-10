import { createHash } from "node:crypto";

// PROTOCOLS_VERSION — the versioned (skill sha, manifest, parsers/serializers) trio recorded on every
// run and deploy (REQ-SPEC-22 / REQ-ARCH-39). It is a **content address** over the trio: the base
// semver plus a digest of the ported skills, the phase manifests, and the parsers/serializers. It changes
// iff any of the trio changes (AC5), so protocol drift can never ship silently and a run resumes only on
// its own `protocols_version` (+ image digest; consumed by P0.08). The public stub reports the sentinel
// "stub-0.0.0"; this private package reports the real content-addressed version.
//
// The frozen constant below is asserted against a fresh recomputation over the real files by
// version.test.ts (via ../src/version-files collectTrioFiles) — so an undeclared trio edit turns the
// self-check red until the constant is regenerated with `node scripts/compute-protocols-version.mjs
// --write`. That regeneration discipline is what makes "drift is a fork, not a diff" (REQ-SPEC-22) hold.

/** Human-facing base version; bumped by spec amendment. The digest tail is derived from the trio. */
export const PROTOCOLS_VERSION_BASE = "0.4.0" as const;

/**
 * The content-addressed protocols version, frozen. Regenerate with
 * `node scripts/compute-protocols-version.mjs --write` whenever the trio changes.
 */
export const PROTOCOLS_VERSION = "0.4.0+5856e59c83489481" as const;

/** False in the private package (true in the public stub) — lets consumers detect stub resolution. */
export const IS_PROTOCOLS_STUB = false as const;

function sha256(s: string): string {
  return createHash("sha256").update(s, "utf8").digest("hex");
}

/**
 * Compute the content-addressed protocols version from a map of `relativePath → fileContent` spanning the
 * trio (ported skills, manifests, parsers/serializers). Pure and deterministic: paths are sorted, each
 * file hashed, and the digest hashed again — so it changes iff any trio file's path or content changes,
 * and never for a file outside the map. Line endings should be normalized by the collector.
 */
export function computeProtocolsVersion(
  files: Record<string, string>,
  base: string = PROTOCOLS_VERSION_BASE,
): string {
  const manifest = Object.keys(files)
    .sort()
    .map((path) => `${path} ${sha256(files[path]!)}`)
    .join("\n");
  return `${base}+${sha256(manifest).slice(0, 16)}`;
}
