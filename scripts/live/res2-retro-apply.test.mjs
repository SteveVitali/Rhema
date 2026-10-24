// R6WRT.1 / REQ-WRT-1 — source pins on the guarded retro-apply driver (GD-RES.2-1 "refund +
// relabel" under GD-PREAUTH-ACTS.R6). These pins assert the fail-closed arms + the verbatim
// scope exist — they never connect to a database.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const src = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "res2-retro-apply.mjs"),
  "utf8",
);

describe("res2-retro-apply — verbatim GD-RES.2-1 scope", () => {
  it("names the two ruled runs with their ruled credit amounts", () => {
    expect(src).toContain('"01M3EAAZG2AQ289B6ZFEP5XYN2"');
    expect(src).toContain('"01M3SK62YZST272B35CG12K6TW"');
    expect(src).toMatch(/runId:\s*"01M3EAAZG2AQ289B6ZFEP5XYN2",\s*credits:\s*56/);
    expect(src).toMatch(/runId:\s*"01M3SK62YZST272B35CG12K6TW",\s*credits:\s*340/);
  });
  it("names the test-tenant probes verbatim — excluded from every write", () => {
    expect(src).toContain('"01M3VT9R1MAVVKM3Q7RXCRY5RD"');
    expect(src).toContain('"01M3VYSGV9XZ9RCWNP0CGDXQHD"');
    expect(src).toContain("TEST_TENANT_PROBES");
    // the probes only ever appear in READ queries + the untouched check — the write path
    // iterates `applicable` which resolves from RULED only:
    expect(src).toContain("for (const item of applicable)");
    expect(src).not.toMatch(/for \(const .* of TEST_TENANT_PROBES\)[\s\S]{0,200}insert/);
  });
  it("uses the canonical research-phase keys + refund classification", () => {
    expect(src).toContain('RESEARCH_PHASES = ["verification", "discourse"]');
    expect(src).toContain('"platform_fault:zero_coverage"');
    expect(src).toContain("platform-fault:${run.id}:${draw.stepId}#${draw.bucket}");
  });
});

describe("res2-retro-apply — fail-closed arms", () => {
  it("--execute refuses without the recorded operator go (R6WRT_OPERATOR_GO)", () => {
    expect(src).toContain('process.env.R6WRT_OPERATOR_GO !== "confirmed"');
    expect(src).toContain("process.exit(2)");
  });
  it("--execute refuses unless the resolved set equals the ruled set EXACTLY", () => {
    expect(src).toContain("const scopeExact =");
    expect(src).toContain("applicable.length === RULED.length");
    expect(src).toContain("item.wouldRefund === r.credits");
    expect(src).toContain("REFUSING --execute");
    expect(src).toContain("pre-authorization VOID for this act");
  });
  it("dry-run is the default — writes happen only under --execute", () => {
    expect(src).toContain('argv.includes("--execute")');
    expect(src).toMatch(/if \(!execute\)[\s\S]*dry-run\.json[\s\S]*process\.exit\(0\)/);
  });
  it("guards each run to the ruled shape (completed review, delivery null, non-test tenant)", () => {
    expect(src).toContain('run.state === "completed"');
    expect(src).toContain('run.workflow === "review"');
    expect(src).toContain("run.delivery == null");
    expect(src).toContain("run.is_test === false");
    expect(src).toContain("not-yet-refunded");
  });
  it("new zero-coverage candidates resolve as observations — reported, NEVER written", () => {
    expect(src).toContain("out-of-scope finding, untouched");
    expect(src).toContain("r.id <> all($1::text[])");
  });
});

describe("res2-retro-apply — canonical write shape + evidence mechanics", () => {
  it("refund rows replicate refundPhases verbatim (kind/source/reason/idempotency)", () => {
    expect(src).toContain("insert into credit_ledger");
    expect(src).toContain("'refund'");
    expect(src).toContain("'run'");
    expect(src).toContain("on conflict (idempotency_key) do nothing");
  });
  it("maintains credit_balances in the same transaction (+available per refund)", () => {
    expect(src).toContain("insert into credit_balances");
    expect(src).toContain("update credit_balances set available = available + $3");
  });
  it("stamps the write-once delivery label + settle markers", () => {
    expect(src).toContain("update runs set delivery = $2::jsonb where id = $1 and delivery is null");
    expect(src).toContain('label: "unverified"');
    expect(src).toContain("platformFaultSettledAt");
    expect(src).toContain("alerted: false");
    expect(src).toContain("delivery write-once violated");
  });
  it("pre-state capture lands BEFORE any write (verbatim → gitignored logs, redacted → reports)", () => {
    expect(src).toContain("docs/build/logs/r6wrt1-capture".replaceAll("/", '", "'));
    expect(src.indexOf("pre-state captured")).toBeLessThan(src.indexOf('await client.query("begin")'));
    expect(src).toContain("redactRow");
  });
  it("executes both runs in ONE transaction with rollback on error", () => {
    expect(src).toContain('await client.query("begin")');
    expect(src).toContain('await client.query("rollback")');
    expect(src).toContain('await client.query("commit")');
    // reads stay read-only: the resolve phase runs inside BEGIN READ ONLY
    expect(src).toContain('await client.query("begin read only")');
  });
  it("verifies post-state: labels stamped, refund totals == ruled, probes untouched", () => {
    expect(src).toContain('post[r.runId]?.label === "unverified"');
    expect(src).toContain("post[r.runId]?.refundRows === r.credits");
    expect(src).toContain("TEST_TENANT_PROBES.every((p) => post[p]?.delivery == null)");
  });
  it("requires the system-role DSN (RLS bypass) — never invents credentials", () => {
    expect(src).toContain("SYSTEM_DATABASE_URL");
    expect(src).toContain("system-role DSN over the IAP tunnel");
  });
});
