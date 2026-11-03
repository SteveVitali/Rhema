import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

// REQ-CORPUS-14 / D-R6OSS.1-1 — the withholding tripwire: while the dated .gitignore marker is
// present, no file under the withheld real-data paths (corpus/**, snapshots/**, goldens/**) may be
// tracked — a `git add -f` lands in permanent public history. Fails hard on a planted entry.

const PKG = fileURLToPath(new URL("..", import.meta.url));
const ROOT = join(PKG, "..", "..");
const WITHHELD_RE = /^packages\/demo-corpus\/(corpus|snapshots|goldens)\//;
const MARKER = "withheld until HUMAN-H14";

export function withheldViolations(tracked: readonly string[], markerPresent: boolean): string[] {
  if (!markerPresent) return [];
  return tracked.filter((p) => WITHHELD_RE.test(p));
}

describe("withholding tripwire (REQ-CORPUS-14)", () => {
  it("the dated withheld marker is present in packages/demo-corpus/.gitignore", () => {
    expect(readFileSync(join(PKG, ".gitignore"), "utf8")).toContain(MARKER);
  });

  it("no withheld path is tracked at HEAD", () => {
    const tracked = execFileSync(
      "git",
      [
        "ls-files",
        "packages/demo-corpus/corpus",
        "packages/demo-corpus/snapshots",
        "packages/demo-corpus/goldens",
      ],
      { cwd: ROOT, encoding: "utf8" },
    )
      .split("\n")
      .filter(Boolean);
    expect(tracked).toEqual([]);
  });

  it("the check fails on a force-added withheld path while the marker is present", () => {
    const gitignore = readFileSync(join(PKG, ".gitignore"), "utf8");
    expect(withheldViolations(["packages/demo-corpus/corpus/real/v1.md"], true)).toHaveLength(1);
    expect(
      withheldViolations(["packages/demo-corpus/snapshots/x.json"], gitignore.includes(MARKER)),
    ).toHaveLength(1);
    expect(
      withheldViolations(["packages/demo-corpus/fixtures/synthetic/corpus/x.md"], true),
    ).toHaveLength(0);
  });
});
