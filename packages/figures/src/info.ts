export const PACKAGE_NAME = "@rhema/figures" as const;

/** Marker export so the package is importable and the build graph is exercised. */
export function packageInfo(): { name: string } {
  return { name: PACKAGE_NAME };
}
