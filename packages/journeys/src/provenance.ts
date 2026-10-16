// JOURNEY.1 (REQ-ARCH-39; REQ-SPEC-29) — the deploy-provenance check's client half. The standalone
// gate is `scripts/check-deploy-provenance.mjs` (no workspace deps — usable from any CI job); this
// module is the same assertion for in-process callers (the runner report records what it saw).

export interface ProvenanceObservation {
  /** service label → the deployed git SHA it reported (null when the service doesn't expose one) */
  readonly observed: Record<string, string | null>;
}

/** Fetch `/healthz`'s `build.gitSha` (RHEMA_BUILD_GIT_SHA, baked by Dockerfile `ARG GIT_SHA`).
 *  VERIF.2 (F-OPS.1-10) — Cloud Run's GFE intercepts the bare `/healthz` on `*.run.app` origins
 *  (a Google 404 — the app never sees it), so a non-2xx there falls back to `/healthz/`, the
 *  registered alias the front-end does NOT claim. Prod/direct hosts answer the first probe. */
export async function fetchDeployedSha(
  baseUrl: string,
  fetchFn: typeof fetch = fetch,
): Promise<string | null> {
  const read = async (path: string): Promise<string | null> => {
    try {
      const r = await fetchFn(`${baseUrl.replace(/\/+$/, "")}${path}`);
      if (!r.ok) return null;
      const j = (await r.json()) as { build?: { gitSha?: string | null } };
      const sha = j.build?.gitSha;
      return typeof sha === "string" && sha.length > 0 && sha !== "unknown" ? sha : null;
    } catch {
      return null;
    }
  };
  return (await read("/healthz")) ?? (await read("/healthz/"));
}

/** Compare deployed SHAs with the expected chain-tip SHA — fails closed on null/unknown/mismatch.
 *  Prefix comparison in either direction so a short-sha on either side still matches. */
export function provenanceMatch(
  expected: string,
  observed: Record<string, string | null>,
): boolean {
  const exp = expected.trim().toLowerCase();
  if (!exp) return false;
  return Object.values(observed).every((sha) => {
    const s = sha?.trim().toLowerCase();
    return !!s && s !== "unknown" && (s.startsWith(exp) || exp.startsWith(s));
  });
}
