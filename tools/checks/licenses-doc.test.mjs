import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// AC6: LICENSES.md lists the SDK commercial-terms exception and the pandoc/GPL separate-process
// rationale. Also assert the machine-readable exception file agrees, so the doc and the enforced
// policy never drift.

const root = process.cwd();
const licenses = readFileSync(resolve(root, "LICENSES.md"), "utf8");
const exceptions = JSON.parse(readFileSync(resolve(root, "licenses.exceptions.json"), "utf8"));

describe("LICENSES.md (AC6, REQ-ARCH-40)", () => {
  it("documents the Agent SDK commercial-terms exception", () => {
    expect(licenses).toContain("@anthropic-ai/claude-agent-sdk");
    expect(licenses.toLowerCase()).toContain("commercial");
  });

  it("documents the pandoc GPL separate-process rationale", () => {
    expect(licenses).toContain("pandoc");
    expect(licenses.toLowerCase()).toContain("separate process");
    expect(licenses).toMatch(/GPL/);
  });

  it("states the 'never Claude Code' brand rule", () => {
    expect(licenses).toContain("Claude Code");
  });

  it("the machine-readable exception list carries the same two exceptions", () => {
    expect(exceptions.exceptions["@anthropic-ai/claude-agent-sdk"]).toBeDefined();
    expect(exceptions.exceptions["pandoc"].license).toMatch(/GPL/);
  });
});
