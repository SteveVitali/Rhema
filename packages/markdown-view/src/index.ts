// @rhema/markdown-view — Rhema Markdown read-only view (skeleton).
// Skeleton package (P0.01). Real implementation lands in a later ticket.

export const PACKAGE_NAME = "@rhema/markdown-view" as const;

/** Marker export so the skeleton service/library is importable and the build graph is exercised. */
export function packageInfo(): { name: string } {
  return { name: PACKAGE_NAME };
}
