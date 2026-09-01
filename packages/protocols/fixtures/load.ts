import { readFileSync, readdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Test-only loader for the golden fixture corpus (not part of the tsc build — see fixtures/README.md).

export const FIXTURES_ROOT = dirname(fileURLToPath(import.meta.url));

/** The three real projects that carry fixtures (directories, excluding `_cases`). */
export function projects(): string[] {
  return readdirSync(FIXTURES_ROOT, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith("_"))
    .map((d) => d.name)
    .sort();
}

export function hasFixture(project: string, file: string): boolean {
  return existsSync(join(FIXTURES_ROOT, project, file));
}

export function loadJson(project: string, file: string): unknown {
  return JSON.parse(readFileSync(join(FIXTURES_ROOT, project, file), "utf8"));
}

export function loadCase(name: string): unknown {
  return JSON.parse(readFileSync(join(FIXTURES_ROOT, "_cases", name), "utf8"));
}
