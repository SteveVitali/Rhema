// @rhema/security-checks — P1.22's launch-verification suite (REQ-SPEC-25; REQ-ARCH-25/28/29/32/34;
// REQ-EVAL-19). The package is check-only: the substance lives in the colocated `*.test.ts` suites, which
// compose the egress proxy, fetcher, mirror delivery checks, orchestrator drain, the migrated schema's
// RLS catalog, and the infra/posture facts into one runnable audit. Nothing here ships to a container.

export const PACKAGE_NAME = "@rhema/security-checks" as const;

/** Marker export retained for the build graph / provenance job. */
export function packageInfo(): { name: string } {
  return { name: PACKAGE_NAME };
}
