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
    return { ok: true, reason: `exception: ${exceptions[name].rationale}` };
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
