// 271_R6SEC.3 (RH-25) — the env-file exclusion pins. `.gcloudignore` is what
// `gcloud builds submit` reads for the upload context (it does NOT fall back to .gitignore when
// it exists), and `.dockerignore` gates the Docker build context — a local `.env` file with real
// credentials would otherwise ride into Cloud Build / an image layer. These are literal pins on
// the two files' contents (they're data files, not programs).

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const GCLOUDIGNORE = readFileSync(
  fileURLToPath(new URL("../.gcloudignore", import.meta.url)),
  "utf8",
);
const DOCKERIGNORE = readFileSync(
  fileURLToPath(new URL("../.dockerignore", import.meta.url)),
  "utf8",
);
const GITIGNORE = readFileSync(fileURLToPath(new URL("../.gitignore", import.meta.url)), "utf8");

/** The patterns that must exist, as parsed ignore-file lines. */
function patterns(text: string): string[] {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l !== "" && !l.startsWith("#"));
}

/** Minimal gitignore-semantics check for `.env`-family paths (the finding's exposure set). */
function excludesEnvFile(text: string): boolean {
  const pats = patterns(text);
  // `.env` covers `.env` exactly; `.env.*` covers the suffixed locals (.env.local, .env.dev …).
  return pats.includes(".env") && pats.includes(".env.*");
}

describe("RH-25 — .env* exclusions on every build-context filter", () => {
  it(".gcloudignore excludes .env and .env.* (the Cloud Build upload context)", () => {
    expect(excludesEnvFile(GCLOUDIGNORE)).toBe(true);
  });

  it(".gcloudignore keeps the documented template shippable, matching .gitignore", () => {
    expect(patterns(GCLOUDIGNORE)).toContain("!.env.example");
    expect(patterns(GITIGNORE)).toContain("!.env.example");
  });

  it(".gcloudignore still carries the upload context's other exclusions (no regression)", () => {
    for (const p of [".git", "**/node_modules", "**/dist"]) {
      expect(patterns(GCLOUDIGNORE)).toContain(p);
    }
    // The vendored SDK keep-comment is what the file exists for — it must remain a comment, not a rule.
    expect(GCLOUDIGNORE).toContain("Keep: apps/run-task/vendor");
  });

  it(".dockerignore excludes .env and .env.* too (same exposure class on the Docker context)", () => {
    expect(excludesEnvFile(DOCKERIGNORE)).toBe(true);
    expect(patterns(DOCKERIGNORE)).toContain("!.env.example");
  });
});
