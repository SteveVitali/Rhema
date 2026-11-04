import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { gateDir, gateFiles, loadPatterns } from "./denylist.js";

// REQ-CORPUS-2: every hard pattern fails (negative controls synthesized in-test — never committed
// as literal identity tokens); bare Steven/Desktop/claude/operator/@example.com pass; a file:line
// allowlist entry passes exactly its line; a stale entry fails. Plus parity with the
// self-contained always-run checker tools/demo-corpus/check-corpus.mjs.

const PKG = fileURLToPath(new URL("..", import.meta.url));
const CHECKER = join(PKG, "..", "..", "tools", "demo-corpus", "check-corpus.mjs");
const patterns = loadPatterns();

// Assembled so no literal identity token is committed in this file.
const NEGATIVES: Record<string, string> = {
  "identity-vitali": ["Steve", "Vitali"].join(""),
  "identity-steve": "a man named " + ["S", "teve"].join(""),
  "academia-edu": "profile at aca" + "demia.edu/x",
  "home-absolute": "/Use" + "rs/someone/file",
  "home-tilde": "~" + "/private/file",
  "utm-param": "https://e.org/a?" + "utm_source=x",
  "reader-proxy": "https://r.ji" + "na.ai/https://e.org",
  "scratch-path": "agent" + "-scratch/projects/x",
  "persona-slug": "sjs" + "-substack",
  "persona-dir": "person" + "as/x/PERSONA.md",
};

const FILES = (text: string) => [{ relPath: "slug/f.md", text }];

describe("denylist gate (REQ-CORPUS-2)", () => {
  it("fails on every hard pattern (in-test negatives)", () => {
    for (const [ruleId, text] of Object.entries(NEGATIVES)) {
      const g = gateFiles(FILES(text), patterns, []);
      expect(g.ok, ruleId).toBe(false);
      expect(g.violations[0]?.ruleId, ruleId).toBe(ruleId);
    }
  });

  it("passes bare Steven / Desktop / claude / operator / @example.com", () => {
    const text =
      "Steven Marsh wrote it; the Analyst's Desktop Binder; a claude benchmark; " +
      "the utility operator shall file; alice@example.com quoted from docs.";
    expect(gateFiles(FILES(text), patterns, []).ok).toBe(true);
  });

  it("a file:line allowlist entry passes exactly its line; other lines still fail", () => {
    const tok = ["Steve", "Vitali"].join("");
    const g = gateFiles(
      [{ relPath: "slug/published.md", text: `credit ${tok}\nalso ${tok}` }],
      patterns,
      [{ id: "la-1", file: "slug/published.md", line: 1, reason: "credit line (S-11)" }],
    );
    expect(g.ok).toBe(false);
    expect(g.violations).toEqual([
      { file: "slug/published.md", line: 2, ruleId: "identity-vitali" },
    ]);
    const g2 = gateFiles(
      [{ relPath: "slug/published.md", text: `credit ${tok}\nclean line` }],
      patterns,
      [{ id: "la-1", file: "slug/published.md", line: 1, reason: "credit line (S-11)" }],
    );
    expect(g2.ok).toBe(true);
  });

  it("identity-vitali still catches every real token form but not scholarly prose (real-data fix)", () => {
    // The real corpus's kept source notes quote Ligthart's "Revitalization through
    // Relativization" — `vitali` bare-substring false-fired on it; `(?![a-z])` ends that class.
    const prose =
      "the Revitalization through Relativization section; revitalizing the doctrine; Vitalis, 1634.";
    expect(gateFiles(FILES(prose), patterns, []).ok).toBe(true);
    for (const tok of [
      ["Steve", "Vitali"].join(""),
      ["steven", "vitali"].join(""),
      ["all-steven-", "vitali"].join(""),
      ["steven-j-", "vitali"].join(""),
      ["V", "ITALI"].join(""),
      ["Vitali", "'s"].join(""),
    ]) {
      const g = gateFiles(FILES(`token ${tok} here`), patterns, []);
      expect(g.ok, tok).toBe(false);
      expect(g.violations[0]?.ruleId, tok).toBe("identity-vitali");
    }
  });

  it(".png artifacts are never line-scanned — binary bytes false-fire text patterns (real-data fix)", () => {
    // The real export's sanitized PNGs contain `~/` byte pairs in IDAT data.
    const pngBytes = "PNG-binary " + "~" + "/idat " + ["steven", "vitali"].join("") + " bytes";
    const g = gateFiles([{ relPath: "slug/drafts/figures/fig.png", text: pngBytes }], patterns, []);
    expect(g.ok).toBe(true);
    // parity: the always-run checker agrees on a planted .png negative
    const dir = mkdtempSync(join(tmpdir(), "deny-png-"));
    mkdirSync(join(dir, "slug"), { recursive: true });
    writeFileSync(join(dir, "slug", "fig.png"), pngBytes);
    writeFileSync(join(dir, "slug", "f.md"), "clean\n");
    const out = execFileSync("node", [CHECKER, "--dir", dir], { encoding: "utf8" });
    expect(out).toContain("0 violations");
  });

  it("a stale allowlist entry fails", () => {
    const g = gateFiles(FILES("clean line\n"), patterns, [
      { id: "la-stale", file: "slug/f.md", line: 9, reason: "points at a line with no hit" },
    ]);
    expect(g.ok).toBe(false);
    expect(g.stale[0]?.id).toBe("la-stale");
  });

  it("the committed synthetic corpus is clean through the same gate", () => {
    expect(gateDir(join(PKG, "fixtures/synthetic/corpus"), patterns).ok).toBe(true);
  });

  it("parity: the self-contained check-corpus.mjs CLI agrees (always-run leg)", () => {
    const clean = execFileSync("node", [CHECKER, "--dir", join(PKG, "fixtures/synthetic/corpus")], {
      encoding: "utf8",
    });
    expect(clean).toContain("0 violations");
    const dirty = mkdtempSync(join(tmpdir(), "deny-"));
    mkdirSync(join(dirty, "slug"), { recursive: true });
    writeFileSync(join(dirty, "slug", "f.md"), NEGATIVES["identity-vitali"] + "\n");
    expect(() => execFileSync("node", [CHECKER, "--dir", dirty], { encoding: "utf8" })).toThrow();
    try {
      execFileSync("node", [CHECKER, "--dir", dirty], { encoding: "utf8", stdio: "pipe" });
    } catch (e) {
      expect(String((e as { stderr?: string }).stderr)).toContain("DENYLIST slug/f.md:1");
    }
  });
});
