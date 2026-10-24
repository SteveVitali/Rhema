// R6WRT.1 / REQ-WRT-3 — source pins on the tombstone hand-date driver (D-P1.04-2's arm under
// GD-PREAUTH-ACTS.R6). Pins only — no database.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const src = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "hand-date-tombstone.mjs"),
  "utf8",
);

describe("hand-date-tombstone — verbatim D-P1.04-2 arm", () => {
  it("arms ONE purpose-made probe tombstone (slug-pinned, idempotent)", () => {
    expect(src).toContain('"r6wrt1-tombstone-probe"');
    expect(src).toContain("PROBE_SLUG");
  });
  it("the tombstone lives on an is_test workspace only — never a real tenant", () => {
    expect(src).toContain("where is_test");
    expect(src).toContain("values ($1,'personal',$2,$3,true)");
  });
  it("back-dates deleted_at past the 30-day grace (PROJECT_PURGE_AFTER_DAYS)", () => {
    expect(src).toContain("GRACE_DAYS = 30");
    expect(src).toContain("set deleted_at");
    expect(src).toMatch(/GRACE_DAYS \* 24 \+ 1/); // 30d + 1h margin
  });
  it("arms the real project.purge machinery — a pgboss job, never a direct delete", () => {
    expect(src).toContain('"project.purge"');
    expect(src).toContain("insert into pgboss.job");
    expect(src).toContain("${JOB_NAME}:${plan.projectId}");
    // the script NEVER deletes the project itself — destruction is the worker's job:
    expect(src).not.toMatch(/delete from projects/);
  });
  it("purge-exempt = inside the 26h test-tenant sweep freshness window", () => {
    expect(src).toContain("PURGE_HOURS = 26");
    expect(src).toContain("Number(w.age_h) < PURGE_HOURS");
  });
});

describe("hand-date-tombstone — fail-closed arms", () => {
  it("--execute refuses without the recorded operator go (R6WRT_OPERATOR_GO)", () => {
    expect(src).toContain('process.env.R6WRT_OPERATOR_GO !== "confirmed"');
    expect(src).toContain("process.exit(2)");
  });
  it("--execute refuses unless the resolved plan matches the ruled item exactly", () => {
    expect(src).toContain('plan.status === "armable" || plan.status === "armed-already"');
    expect(src).toContain("REFUSING --execute");
    expect(src).toContain("pre-authorization VOID for this act");
  });
  it("dry-run is the default — writes happen only under --execute", () => {
    expect(src).toContain('argv.includes("--execute")');
    expect(src).toMatch(/if \(!execute\)[\s\S]*dry-run\.json[\s\S]*process\.exit\(0\)/);
  });
  it("blocks when no test user is resolvable — never fabricates an owner silently", () => {
    expect(src).toContain("no test user resolvable — blocked");
    expect(src).not.toMatch(/insert into "user"/);
  });
});

describe("hand-date-tombstone — evidence mechanics", () => {
  it("pre-state capture lands BEFORE the write (plan verbatim → gitignored logs)", () => {
    expect(src).toContain("docs/build/logs/r6wrt1-capture".replaceAll("/", '", "'));
    expect(src.indexOf("pre-state captured")).toBeLessThan(src.indexOf('await client.query("begin")'));
  });
  it("one transaction with rollback; reads stay read-only", () => {
    expect(src).toContain('await client.query("begin read only")');
    expect(src).toContain('await client.query("begin")');
    expect(src).toContain('await client.query("rollback")');
    expect(src).toContain('await client.query("commit")');
  });
  it("post-state verifies the arm OR the already-fired destruction", () => {
    expect(src).toContain("post.destroyedAlready");
    expect(src).toContain("post.project.age_days >= GRACE_DAYS");
  });
  it("requires the system-role DSN (RLS bypass) — never invents credentials", () => {
    expect(src).toContain("SYSTEM_DATABASE_URL");
    expect(src).toContain("system-role DSN over the IAP tunnel");
  });
});
