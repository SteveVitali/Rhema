// PROTOCOLS_VERSION — the versioned (skill sha, manifest, parsers/serializers) trio recorded on every
// run and deploy (REQ-SPEC-22 / REQ-ARCH-39). P0.04 freezes it as a content-addressed hash over the
// trio; here in P0.03 it is a provisional semver so provenance is well-formed. The public stub reports
// the sentinel "stub-0.0.0"; this package reports the real (provisional) version.
export const PROTOCOLS_VERSION = "0.3.0-p0.03" as const;

/** False in the private package (true in the public stub) — lets consumers detect stub resolution. */
export const IS_PROTOCOLS_STUB = false as const;
