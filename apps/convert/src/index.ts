// @rhema/convert — convert — no-network file conversion to canonical markdown (skeleton service).
// Skeleton package (P0.01). Real implementation lands in a later ticket.

export const PACKAGE_NAME = "@rhema/convert" as const;

/** Marker export so the skeleton service/library is importable and the build graph is exercised. */
export function packageInfo(): { name: string } {
  return { name: PACKAGE_NAME };
}
