import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

// The file collector for the `protocols_version` content address (REQ-SPEC-22). It reads the trio from a
// private-checkout root: the ported skills + conventions (the "skill sha" half), the phase manifests, and
// the parsers/serializers (incl. their shared markdown twins). Node-only (fs) — imported by the version
// self-check test and `scripts/compute-protocols-version.mjs`, never re-exported from the package index.

/** The trio's roots, relative to the package root. Everything reachable under these is hashed. */
export const TRIO_ROOTS = [
  "skills",
  "conventions",
  "manifests",
  "parsers",
  "serializers",
  "src/md-twins.ts",
] as const;

const EXCLUDE_DIRS = new Set(["node_modules", "dist", ".turbo"]);
function isExcludedFile(rel: string): boolean {
  return rel.endsWith(".test.ts") || rel.endsWith(".tsbuildinfo") || rel.endsWith(".d.ts");
}

function walk(abs: string, root: string, out: Record<string, string>): void {
  const st = statSync(abs);
  if (st.isDirectory()) {
    for (const name of readdirSync(abs).sort()) {
      if (EXCLUDE_DIRS.has(name)) continue;
      walk(join(abs, name), root, out);
    }
    return;
  }
  const rel = relative(root, abs).split(sep).join("/");
  if (isExcludedFile(rel)) return;
  // Normalize CRLF → LF so the digest is stable across platforms/checkouts.
  out[rel] = readFileSync(abs, "utf8").replace(/\r\n/g, "\n");
}

/** Collect the trio files under `packageRoot` as a `relativePath → content` map (LF-normalized). */
export function collectTrioFiles(packageRoot: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const r of TRIO_ROOTS) {
    const abs = join(packageRoot, r);
    try {
      walk(abs, packageRoot, out);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw e;
    }
  }
  return out;
}
