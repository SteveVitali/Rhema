// 271_R6SEC.3 (RH-26) — the workflow supply-chain pins. Two halves:
//
//   1. Every third-party `uses:` in the workflows is pinned to a 40-hex commit SHA with a
//      `# v…` version comment — the mutable-tag posture (`actions/checkout@v4`, …) is what the
//      finding flagged: these jobs hold `id-token: write`, a prod SSH key, and a BYPASSRLS DSN.
//      `./`-relative (local composite) actions are exempt — they're the same tree.
//   2. The journeys IAP+SSH tunnel step never accepts a host key silently:
//      `StrictHostKeyChecking=yes` with a real known_hosts file — no `no`, no `/dev/null`.

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const WORKFLOWS_DIR = fileURLToPath(new URL("../../.github/workflows", import.meta.url));
const workflowFiles = readdirSync(WORKFLOWS_DIR).filter((f) => /\.(ya?ml)$/.test(f));
const workflows = Object.fromEntries(
  workflowFiles.map((f) => [f, readFileSync(`${WORKFLOWS_DIR}/${f}`, "utf8")]),
);

/** Every `uses:` line's action ref, repo-wide. */
function externalUses() {
  const hits = [];
  for (const [file, text] of Object.entries(workflows)) {
    text.split("\n").forEach((line, i) => {
      const m = line.match(/uses:\s*([^\s#]+)/);
      if (!m) return;
      const ref = m[1].replace(/^["']|["']$/g, "");
      if (ref.startsWith("./")) return; // local composite action — same tree
      hits.push({ file, line: i + 1, ref, raw: line });
    });
  }
  return hits;
}

describe("RH-26 — third-party actions are SHA-pinned with a version comment", () => {
  const uses = externalUses();

  it("the workflows carry external actions (the pin set is non-vacuous)", () => {
    expect(uses.length).toBeGreaterThanOrEqual(6);
    expect(uses.some((u) => u.ref.startsWith("google-github-actions/auth@"))).toBe(true);
  });

  it.each(uses.map((u) => [`${u.file}:${u.line} ${u.ref}`, u]))(
    "%s is pinned to a 40-hex commit SHA",
    (_label, u) => {
      expect(u.ref).toMatch(/^[a-z0-9][a-z0-9./_-]*@[0-9a-f]{40}$/);
    },
  );

  it.each(uses.map((u) => [`${u.file}:${u.line} ${u.ref}`, u]))(
    "%s carries a trailing `# v…` version comment",
    (_label, u) => {
      expect(u.raw).toMatch(/@[0-9a-f]{40}\s+#\s*v\d/);
    },
  );
});

describe("RH-26 — the journeys SSH tunnel verifies the proxy host key", () => {
  const journeys = workflows["journeys.yml"] ?? "";

  it("StrictHostKeyChecking=yes is the only host-key posture — no `no`, no /dev/null", () => {
    expect(journeys).toContain("StrictHostKeyChecking=yes");
    expect(journeys).not.toContain("StrictHostKeyChecking=no");
    expect(journeys).not.toContain("UserKnownHostsFile=/dev/null");
  });

  it("known_hosts comes from a keyscan through the authenticated IAP tunnel", () => {
    expect(journeys).toContain("ssh-keyscan");
    expect(journeys).toContain("start-iap-tunnel");
    expect(journeys).toContain("UserKnownHostsFile=/tmp/jrn-known-hosts");
  });
});
