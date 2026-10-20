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

/* ── R6ENG.1 (REQ-ENG-8; ADR-114) — the deploy-neutral drift arm ───────────────────────────
 * Under docs-only merges the deployed SHA legitimately trails HEAD. The second opinion is
 * fail-closed: (1) the deployed SHA must be a git ancestor of the expected SHA, and (2) every
 * path in `git diff <deployed>..<expected>` must be neutral under the committed allowlist
 * `scripts/deploy-neutral-paths.txt` — the SAME file the standalone gate parses (twin
 * grammar: `#` comments/blank lines ignored; trailing `/` subtree-matches; else exact).
 * Non-ancestry, unresolvable SHAs, git-absent/non-repo cwd, or ANY non-neutral path → strict.
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// src/ and dist/ are both exactly one directory deep under packages/journeys/, so three hops
// reach the repo root in both layouts.
const ALLOWLIST_PATH = fileURLToPath(
  new URL("../../../scripts/deploy-neutral-paths.txt", import.meta.url),
);

export interface DeployNeutralRules {
  readonly subtree: readonly string[];
  readonly exact: readonly string[];
  readonly isNeutral: (path: string) => boolean;
}

let cachedRules: DeployNeutralRules | undefined;

/** Parse the committed allowlist (same grammar as scripts/deploy-neutral.mjs). */
export function loadDeployNeutralRules(text?: string): DeployNeutralRules {
  if (text === undefined && cachedRules !== undefined) return cachedRules;
  const body = text ?? readFileSync(ALLOWLIST_PATH, "utf8");
  const subtree: string[] = [];
  const exact: string[] = [];
  for (const raw of body.split("\n")) {
    const line = raw.trim();
    if (line === "" || line.startsWith("#")) continue;
    if (line.endsWith("/")) subtree.push(line);
    else exact.push(line);
  }
  const rules: DeployNeutralRules = {
    subtree,
    exact,
    isNeutral: (path) => exact.includes(path) || subtree.some((pre) => path.startsWith(pre)),
  };
  if (text === undefined) cachedRules = rules;
  return rules;
}

export interface DriftVerdict {
  readonly ok: boolean;
  readonly reason?: string;
  readonly neutralPaths?: readonly string[];
}

const git = (
  args: readonly string[],
  cwd: string,
): { ok: true; out: string } | { ok: false } => {
  try {
    return {
      ok: true,
      out: execFileSync("git", args as string[], {
        cwd,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      }),
    };
  } catch {
    return { ok: false };
  }
};

/** REQ-ENG-8 — may an observed deployed SHA trail the expected HEAD and still pass?
 *  Fail-closed on every gap; a single non-neutral path keeps the strict FAIL. */
export function deployNeutralDrift(
  expectedSha: string,
  deployedSha: string,
  opts: { cwd?: string; isNeutral?: (path: string) => boolean } = {},
): DriftVerdict {
  const cwd = opts.cwd ?? process.cwd();
  const isNeutral = opts.isNeutral ?? loadDeployNeutralRules().isNeutral;
  const expected = expectedSha?.trim().toLowerCase();
  const deployed = deployedSha?.trim().toLowerCase();
  if (!expected || !deployed || deployed === "unknown") {
    return { ok: false, reason: "absent-or-unknown-sha" };
  }
  for (const sha of [expected, deployed]) {
    if (!git(["rev-parse", "--verify", `${sha}^{commit}`], cwd).ok) {
      return { ok: false, reason: `sha-unresolvable: ${sha}` };
    }
  }
  if (!git(["merge-base", "--is-ancestor", deployed, expected], cwd).ok) {
    return { ok: false, reason: "deployed-not-an-ancestor" };
  }
  const diff = git(["diff", "--name-only", `${deployed}..${expected}`], cwd);
  if (!diff.ok) return { ok: false, reason: "diff-unavailable" };
  const paths = diff.out.split("\n").map((l) => l.trim()).filter((l) => l !== "");
  const offenders = paths.filter((p) => !isNeutral(p));
  if (offenders.length > 0) {
    return { ok: false, reason: `non-neutral paths in diff: ${offenders.join(", ")}` };
  }
  return { ok: true, neutralPaths: paths };
}

/** REQ-ENG-8 second opinion over an observation set: every label must either strict-match
 *  or pass the drift arm. Returns the matching labels so the report can record WHICH legs
 *  passed under drift (the strict arm records nothing extra — `match: false` stays honest). */
export function provenanceDriftCheck(
  expected: string,
  observed: Record<string, string | null>,
  opts: { cwd?: string } = {},
): { match: boolean; drifted: string[] } {
  const exp = expected.trim().toLowerCase();
  const drifted: string[] = [];
  for (const [label, sha] of Object.entries(observed)) {
    const s = sha?.trim().toLowerCase();
    if (s && s !== "unknown" && (s.startsWith(exp) || exp.startsWith(s))) continue;
    if (s == null) return { match: false, drifted: [] };
    const verdict = deployNeutralDrift(exp, s, opts);
    if (!verdict.ok) return { match: false, drifted: [] };
    drifted.push(label);
  }
  return { match: true, drifted };
}
