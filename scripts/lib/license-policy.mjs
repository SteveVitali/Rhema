/**
 * Pure licence-policy decision logic (REQ-ARCH-40, spec §13.2). Kept dependency-free and side-effect
 * free so it is directly unit-testable; the CLI wrapper (scripts/check-licenses.mjs) feeds it the
 * installed dependency graph.
 */

/**
 * @typedef {{ allow: string[] }} Allowlist
 * @typedef {{ exceptions: Record<string, { license?: string, rationale: string }> }} Exceptions
 * @typedef {{ ok: boolean, reason: string }} Verdict
 */

/**
 * Decide whether a single package's licence is acceptable.
 * @param {string} name package name (npm name, or a system-binary/asset key)
 * @param {string | null | undefined} license SPDX id or expression (may be an `A OR B` expression)
 * @param {{ allowlist: Allowlist, exceptions: Exceptions }} policy
 * @returns {Verdict}
 */
export function evaluateLicense(name, license, policy) {
  const allow = new Set((policy.allowlist?.allow ?? []).map((s) => s.toUpperCase()));
  const exceptions = policy.exceptions?.exceptions ?? {};

  if (Object.prototype.hasOwnProperty.call(exceptions, name)) {
    const exc = exceptions[name];
    // R6LOW.1 / RH-A4-4 — an exception records the licence it was granted FOR; a package that has
    // been relicensed since (SSPL, BUSL, a missing licence field) is a NEW policy question, not a
    // covered exception. Fail closed and let the diff re-review.
    if (typeof exc.license === "string" && exc.license.trim() !== "") {
      if (typeof license !== "string" || license.trim() !== exc.license.trim()) {
        return {
          ok: false,
          reason: `exception package relicensed (recorded '${exc.license}', observed '${license ?? "missing"}') — re-review required`,
        };
      }
      return { ok: true, reason: `exception: ${exc.rationale}` };
    }
    return { ok: true, reason: `exception (licence unpinned): ${exc.rationale}` };
  }

  if (!license) {
    return { ok: false, reason: "missing licence field" };
  }

  // Accept an SPDX OR-expression if ANY branch is allowlisted; require ALL branches for AND.
  const orBranches = license.split(/\s+OR\s+/i).map((b) => b.trim());
  const branchAllowed = (branch) => {
    const andParts = branch
      .replace(/[()]/g, "")
      .split(/\s+AND\s+/i)
      .map((p) => p.trim().replace(/\+$/, "").toUpperCase());
    return andParts.every((p) => allow.has(p));
  };
  if (orBranches.some(branchAllowed)) {
    return { ok: true, reason: `allowlisted: ${license}` };
  }

  return { ok: false, reason: `disallowed licence '${license}' and no checked-in exception` };
}

/**
 * Evaluate a whole dependency list.
 * @param {Array<{ name: string, license?: string | null }>} packages
 * @param {{ allowlist: Allowlist, exceptions: Exceptions }} policy
 * @returns {{ ok: boolean, violations: Array<{ name: string, license: string | null | undefined, reason: string }> }}
 */
export function evaluateAll(packages, policy) {
  const violations = [];
  for (const pkg of packages) {
    const verdict = evaluateLicense(pkg.name, pkg.license, policy);
    if (!verdict.ok) {
      violations.push({ name: pkg.name, license: pkg.license, reason: verdict.reason });
    }
  }
  return { ok: violations.length === 0, violations };
}

/**
 * Non-vacuity (SPA.8 / REQ-SAFE-9): package names that MUST appear in a real enumeration of the
 * installed graph. If a scope/flag regression shrank `pnpm licenses list` (e.g. prod-only) the
 * gate would be green over a graph that never included the SPA dependency set — fail instead.
 * @param {Array<{ name: string }>} packages
 * @param {readonly string[]} required
 * @returns {string[]} required names absent from `packages`
 */
export function missingRequired(packages, required) {
  const have = new Set(packages.map((p) => p.name));
  return required.filter((n) => !have.has(n));
}
