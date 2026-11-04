import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

// REQ-CORPUS-14 / D-R6OSS.1-1 (post-HUMAN-H14, 219_R7DATA.1) — the tripwire inverted: H14 signed
// the export on 2026-11-03 and the sanitized corpus is committed permanent public history. The
// post-sign invariant is that the withheld marker is GONE (re-withholding would pretend the data
// isn't already public history) and the real derived dirs are tracked and non-empty.

const PKG = fileURLToPath(new URL("..", import.meta.url));
const ROOT = join(PKG, "..", "..");
const MARKER = "withheld until HUMAN-H14";
const GITIGNORE = join(PKG, ".gitignore");

describe("post-H14 corpus invariant (REQ-CORPUS-14, 219_R7DATA.1)", () => {
  it("the withheld marker and root-anchored withholding patterns are gone from .gitignore", () => {
    if (!existsSync(GITIGNORE)) return;
    const text = readFileSync(GITIGNORE, "utf8");
    expect(text).not.toContain(MARKER);
    expect(text).not.toMatch(/^\/(corpus|snapshots|goldens)\/\s*$/m);
  });

  it("the real corpus, goldens and snapshots are tracked and non-empty at HEAD", () => {
    for (const dir of ["corpus", "goldens", "snapshots"]) {
      const tracked = execFileSync("git", ["ls-files", `packages/demo-corpus/${dir}`], {
        cwd: ROOT,
        encoding: "utf8",
      })
        .split("\n")
        .filter(Boolean);
      expect(tracked.length, `packages/demo-corpus/${dir}/ tracked`).toBeGreaterThan(0);
    }
  });

  it("the export manifest carries the operator-signed digest (H14)", () => {
    const manifest = JSON.parse(
      readFileSync(join(PKG, "corpus/export-manifest.json"), "utf8"),
    ) as { digest?: string };
    expect(manifest.digest).toBe(
      "19861a06c4401b8f9e1798751fe7dd6ab0e03b8670e974a4aab638c542116c91",
    );
  });

  it("the committed corpus still carries its rules dir (denylist gate inputs)", () => {
    expect(readdirSync(join(PKG, "corpus/_rules")).length).toBeGreaterThan(0);
  });
});
