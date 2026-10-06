import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// SEC.1 (REQ-SPEC-30; ADR-017) — the system-pool boundary pin. `tools/system-pool-boundary.json` is
// the audited list of files permitted to touch the elevated seams (`systemExec`, `systemTxRunner`,
// `systemPool`, `systemDatabaseUrl`, `SYSTEM_DATABASE_URL`). The ESLint rule
// `no-system-pool-in-user-route` enforces it at lint time; THIS test independently verifies the list
// is exact — every file containing a seam reference is listed (nothing sneaks past lint through a
// generated/indirect spelling), and every listed file still exists + still touches the seam (no stale
// grants that would hide a real regression). Adding a row is a deliberate, reviewed act — the audit
// reasoning lives in docs/security/tenancy-audit.md.

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const BOUNDARY = join(REPO, "tools", "system-pool-boundary.json");

const SEAM =
  /\bsystemExec\b|\bsystemTxRunner\b|\bsystemPool\b|\bsystemDatabaseUrl\b|\bSYSTEM_DATABASE_URL\b/;

/** Recursive .ts walk over the source roots — source files only (no dist/, no tests, no worktrees). */
function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (["node_modules", "dist", ".turbo", ".claude", "vendor", "public", ".scratch"].includes(entry.name)) continue;
      yield* walk(p);
    } else if (/\.[cm]?ts$/.test(entry.name) && !/\.test\.ts$/.test(entry.name)) {
      yield p;
    }
  }
}

describe("the system-pool boundary allowlist (SEC.1 — REQ-SPEC-30)", () => {
  const boundary = JSON.parse(readFileSync(BOUNDARY, "utf8")) as { files: Record<string, string> };
  const allowed = new Set(Object.keys(boundary.files));

  it("every source file touching a system-pool seam is allowlisted — and every allowlisted file earns it", () => {
    const touching = new Set<string>();
    for (const root of ["apps", "packages", "integration", "tools", "infra"]) {
      const dir = join(REPO, root);
      if (!existsSync(dir)) continue;
      for (const file of walk(dir)) {
        if (SEAM.test(readFileSync(file, "utf8"))) {
          touching.add(relative(REPO, file).split("/").join("/"));
        }
      }
    }

    const unlisted = [...touching].filter((f) => !allowed.has(f));
    const staleOrUntouched = [...allowed].filter(
      (f) => !existsSync(join(REPO, f)) || !touching.has(f),
    );

    expect(
      unlisted,
      `files touching the system-pool seam without an audit entry — add them to tools/system-pool-boundary.json with a reason, or move the work behind the audited seams:\n${unlisted.join("\n")}`,
    ).toEqual([]);
    expect(
      staleOrUntouched,
      `allowlist entries that no longer touch the seam (or are missing) — prune tools/system-pool-boundary.json:\n${staleOrUntouched.join("\n")}`,
    ).toEqual([]);
  });

  it("the boundary file itself is the allowlist the lint rule loads (path + shape)", () => {
    expect(existsSync(BOUNDARY)).toBe(true);
    expect(Object.keys(boundary.files).length).toBeGreaterThan(0);
    for (const [file, reason] of Object.entries(boundary.files)) {
      expect(file.endsWith(".ts"), `${file}: allowlist entries are repo-relative .ts paths`).toBe(true);
      expect(typeof reason === "string" && reason.length > 10, `${file}: carries an audit reason`).toBe(true);
    }
  });
});
