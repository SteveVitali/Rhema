// @rhema/harness — Run harness: phase commit protocol, hydration manifest (skeleton).
// Skeleton package (P0.01). Real implementation lands in a later ticket.

export const PACKAGE_NAME = "@rhema/harness" as const;

/** Marker export so the skeleton service/library is importable and the build graph is exercised. */
export function packageInfo(): { name: string } {
  return { name: PACKAGE_NAME };
}
