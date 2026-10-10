import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// REQ-GROWTH-13 — exactly ONE `<Paywall>` mount, and it is the run sheet (trivially true at beta, asserted
// anyway). We scan the source of the two React surfaces (@rhema/ui components + the web app) for JSX mounts
// of <Paywall> (excluding the component's own definition/export), and assert there is exactly one, inside
// the run sheet. A future ticket that mounts a second paywall anywhere fails this deterministically.

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(p));
    else if (/\.(tsx|ts)$/.test(entry.name) && !/\.test\.(tsx|ts)$/.test(entry.name)) out.push(p);
  }
  return out;
}

describe("REQ-GROWTH-13 — the run sheet is the only <Paywall> mount", () => {
  it("exactly one JSX <Paywall> mount exists, and it is in the run sheet component", () => {
    // repo-root-relative — vitest's cwd is the package dir, not the repo root.
    const root = fileURLToPath(new URL("../../..", import.meta.url));
    const files = [...walk(join(root, "packages/ui/src")), ...walk(join(root, "apps/web/src"))];
    const mounts: { file: string; count: number }[] = [];
    for (const file of files) {
      // strip block + line comments so prose mentions of `<Paywall>` (docs) do not count as mounts.
      const src = readFileSync(file, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/[^\n]*/g, "");
      // count JSX opening tags `<Paywall` but NOT the definition `function Paywall(` / export.
      const count = (src.match(/<Paywall[\s/>]/g) ?? []).length;
      if (count > 0) mounts.push({ file, count });
    }
    const total = mounts.reduce((n, m) => n + m.count, 0);
    expect(total).toBe(1);
    expect(mounts[0]!.file).toMatch(/run-sheet\.tsx$/);
  });
});
