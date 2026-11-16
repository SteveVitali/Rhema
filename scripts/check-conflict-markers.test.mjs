// 271_R6SEC.3 (RH-1) — the conflict-marker gate's own tests. `scanText` is pure over file text;
// the real-repo assertion runs the same tracked-file scan the CI step does and fails while any
// marker survives (it was RED pre-fix on the committed Pulumi.dev.yaml conflict).

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { scanText, trackedFiles } from "./check-conflict-markers.mjs";

const ROOT = resolve(new URL("..", import.meta.url).pathname);

describe("scanText — the unresolved-marker detector", () => {
  it("flags the three standard markers at column 0", () => {
    const text = ["a: 1", "<".repeat(7) + " Updated upstream", "b: 2", "=".repeat(7), "c: 3", ">".repeat(7) + " Stashed changes"].join("\n");
    const hits = scanText(text);
    expect(hits.map((h) => h.line)).toEqual([2, 4, 6]);
  });

  it("flags the diff3 base marker and 8+ char runs", () => {
    expect(scanText("|".repeat(7) + " base").length).toBe(1);
    expect(scanText("<".repeat(8) + " x").length).toBe(1);
  });

  it("ignores indented or short marker-shaped text", () => {
    for (const line of ["  " + "<".repeat(7) + " ours", "<".repeat(6), "======= heading-ish?", "equals: ==="]) {
      expect(scanText(line), line).toEqual([]);
    }
  });

  it("a clean yaml/ts/md body produces no hits", () => {
    expect(scanText("config:\n  a: 1\n  b: [x, y]\n")).toEqual([]);
    expect(scanText("# Title\n\nSome prose about `<<<<<<<` inside backticks.\n")).toEqual([]);
  });

  it("the per-file opt-out line exempts fixture/evidence docs", () => {
    const text = "# doc\n<!-- conflict-marker-check: allow -->\n" + "<".repeat(7) + " quoted\n";
    expect(scanText(text)).toEqual([]);
  });
});

describe("the committed tree carries no unresolved conflict markers", () => {
  it("every tracked yaml/ts/md file scans clean — the RH-1 regression", () => {
    const bad = [];
    for (const rel of trackedFiles(ROOT)) {
      for (const hit of scanText(readFileSync(resolve(ROOT, rel), "utf8"))) {
        bad.push(`${rel}:${hit.line}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("Pulumi.dev.yaml parses as plain config (no secure: DSN restoration)", () => {
    const src = readFileSync(resolve(ROOT, "infra/pulumi/Pulumi.dev.yaml"), "utf8");
    expect(src).not.toMatch(/^<{7}|^={7}|^>{7}|^\|{7}/m);
    // The stashed side tried to restore the hand-encrypted DSN configs OPS.1 dropped by design —
    // they must not return with the marker cleanup either.
    expect(src).not.toContain("workerSystemDatabaseUrl");
    expect(src).not.toContain("proxyDatabaseUrl");
  });
});
