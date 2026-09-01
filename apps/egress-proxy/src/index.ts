// @rhema/egress-proxy — egress-proxy — per-run allowlist + credential; the usage meter of record (skeleton service).
// Skeleton package (P0.01). Real implementation lands in a later ticket.

export const PACKAGE_NAME = "@rhema/egress-proxy" as const;

/** Marker export so the skeleton service/library is importable and the build graph is exercised. */
export function packageInfo(): { name: string } {
  return { name: PACKAGE_NAME };
}
