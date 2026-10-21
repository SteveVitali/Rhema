// R6WRT.1 / REQ-WRT-2 — source pins on the deployments-stamp rewrite driver (D-BL38.1-1
// "rewrite the id in place" under GD-PREAUTH-ACTS.R6). Pins only — no database.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const src = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "bl38-stamp-rewrite.mjs"),
  "utf8",
);

describe("bl38-stamp-rewrite — verbatim D-BL38.1-1 scope", () => {
  it("names the one ruled row verbatim", () => {
    expect(src).toContain('"prod:d5a74cc"');
    expect(src).toContain("SHORT_ID");
  });
  it("pins the documented signature (stage + protocols + rate_table + deploy time)", () => {
    expect(src).toContain('"0.4.0+ec61156725a895ab"');
    expect(src).toContain('"2026-10-14T15:24:36"');
    expect(src).toContain('stage: "prod"');
    expect(src).toContain('rate_table_version: "2026-10-14"');
  });
  it("the rewrite target is the row's OWN sha — verbatim 40-char or a UNIQUE repo expansion (fail-closed)", () => {
    expect(src).toMatch(/\/\^\[0-9a-f\]\{40\}\$/);
    expect(src).toContain("targetId = `prod:${item.fullSha}`");
    expect(src).toContain('"rev-parse", "--verify"');
    expect(src).toContain("update deployments set id = $2 where id = $1");
    // a rewritten id is provenance: the expanded commit may not postdate the deploy stamp
    expect(src).toContain("sha-before-deploy");
  });
});

describe("bl38-stamp-rewrite — fail-closed arms", () => {
  it("--execute refuses without the recorded operator go (R6WRT_OPERATOR_GO)", () => {
    expect(src).toContain('process.env.R6WRT_OPERATOR_GO !== "confirmed"');
    expect(src).toContain("process.exit(2)");
  });
  it("--execute refuses unless the resolved row matches the ruled item exactly", () => {
    expect(src).toContain('item.status === "rewritable"');
    expect(src).toContain("REFUSING --execute");
    expect(src).toContain("pre-authorization VOID for this act");
    expect(src).toContain("target-free");
  });
  it("dry-run is the default — writes happen only under --execute", () => {
    expect(src).toContain('argv.includes("--execute")');
    expect(src).toMatch(/if \(!execute\)[\s\S]*dry-run\.json[\s\S]*process\.exit\(0\)/);
  });
  it("other short-sha rows resolve as observations — reported, NEVER touched", () => {
    expect(src).toContain("id ~ '^prod:[0-9a-f]{7}$' and id <> $1");
    expect(src).toContain("— out-of-scope");
  });
});

describe("bl38-stamp-rewrite — evidence mechanics", () => {
  it("pre-state capture lands BEFORE the write (verbatim → gitignored logs)", () => {
    expect(src).toContain("docs/build/logs/r6wrt1-capture".replaceAll("/", '", "'));
    expect(src.indexOf("pre-state captured")).toBeLessThan(src.indexOf('await client.query("begin")'));
  });
  it("one transaction with rollback; reads stay read-only", () => {
    expect(src).toContain('await client.query("begin read only")');
    expect(src).toContain('await client.query("begin")');
    expect(src).toContain('await client.query("rollback")');
    expect(src).toContain('await client.query("commit")');
  });
  it("post-state verifies: short id gone, target present, zero remaining short-sha rows", () => {
    expect(src).toContain("post.shortId === 0");
    expect(src).toContain("post.target.length === 1");
    expect(src).toContain("post.remainingShortSha === 0");
  });
  it("requires the system-role DSN (RLS bypass) — never invents credentials", () => {
    expect(src).toContain("SYSTEM_DATABASE_URL");
    expect(src).toContain("system-role DSN over the IAP tunnel");
  });
});
