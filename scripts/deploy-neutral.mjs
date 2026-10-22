// R6ENG.1 (REQ-ENG-8; ADR-114) — the deploy-neutral allowlist + drift verdict.
//
// The nightly's provenance assert answers "is the deployed source the chain tip?" — honest
// only when an exact match is required. Under docs-only merges the deployed SHA legitimately
// trails HEAD: accepting that diff needs (1) ancestry (deployed ⊂ history of HEAD) and (2)
// a diff touching only deploy-neutral paths (the committed allowlist). This module is the
// shared half of the standalone gate `scripts/check-deploy-provenance.mjs`; the in-process
// twin lives at `packages/journeys/src/provenance.ts` and reads the SAME allowlist file.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ALLOWLIST_PATH = fileURLToPath(new URL("./deploy-neutral-paths.txt", import.meta.url));

/** Parse the committed allowlist. Grammar: `#` comments and blank lines ignored; a rule
 *  ending in `/` subtree-matches (path starts with it); any other rule matches exactly. */
export function loadDeployNeutralRules(text = readFileSync(ALLOWLIST_PATH, "utf8")) {
  const subtree = [];
  const exact = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (line === "" || line.startsWith("#")) continue;
    if (line.endsWith("/")) subtree.push(line);
    else exact.push(line);
  }
  const isNeutral = (path) => exact.includes(path) || subtree.some((pre) => path.startsWith(pre));
  return Object.freeze({ subtree: Object.freeze(subtree), exact: Object.freeze(exact), isNeutral });
}

const git = (args, cwd) => {
  try {
    return {
      ok: true,
      out: execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }),
    };
  } catch (e) {
    return { ok: false, status: e.status, stderr: String(e.stderr ?? "") };
  }
};

/** REQ-ENG-8 — may an observed deployed SHA trail the expected HEAD and still pass?
 *  Both conditions, fail-closed on every gap:
 *    1. `git merge-base --is-ancestor <deployed> <expected>` — the deploy is real history,
 *       not a divergent or unrelated ref.
 *    2. every path of `git diff --name-only <deployed>..<expected>` is allowlist-neutral.
 *  Git absent, either SHA unresolvable, non-ancestry, an empty-diff oddity, or ANY
 *  non-neutral path → `{ ok:false, reason }`. Callers treat `ok:false` as the pre-existing
 *  strict verdict — nothing that failed before is admitted now. */
export function deployNeutralDrift(expectedSha, deployedSha, opts = {}) {
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
