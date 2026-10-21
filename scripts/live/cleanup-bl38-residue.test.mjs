// BL38.1 — source pins on the guarded prod-residue cleanup driver (ratified Q-5:
// dry-run → operator confirm → bounded apply). These pins assert the fail-closed
// arms exist — they never connect to a database.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const src = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "cleanup-bl38-residue.mjs"),
  "utf8",
);

describe("cleanup-bl38-residue — verbatim Q-5 scope", () => {
  it("names the four itemized residue families verbatim", () => {
    expect(src).toContain('"01M3D7E119PP2HA9GP6XT2DG87"'); // stale draft
    expect(src).toContain('"prod:82179e1"'); // stray provenance row
    expect(src).toContain("prod:82179e1356b1d574739f759f1eecb111af73729b"); // the preserved twin
    expect(src).toContain("14stevevitali+rhema-review@gmail.com"); // review account
    expect(src).toContain('"The Library After Dark"');
    expect(src).toContain('"The Library After Dark (review test)"');
  });
  it("guards the draft to the operator workspace + my-first-project only", () => {
    expect(src).toContain('"01M2V3PM11XSF05VJ9G01PM5ZB"');
    expect(src).toContain('d.slug !== DRAFT_SIG.projectSlug');
  });
  it("preserves the full-sha deployments twin (signature + existence guards)", () => {
    expect(src).toContain('"0.4.0+test"');
    expect(src).toContain("DEPLOYMENT_TWIN_ID");
  });
  it("only deletes the review account through the scheduled-delete contract (marker past 14d grace)", () => {
    expect(src).toContain("deletion_requested_at");
    expect(src).toContain("ACCOUNT_GRACE_DAYS = 14");
  });
});

describe("cleanup-bl38-residue — fail-closed arms", () => {
  it("--apply refuses without the recorded operator go (BL38_OPERATOR_GO)", () => {
    expect(src).toContain('process.env.BL38_OPERATOR_GO !== "confirmed"');
    expect(src).toContain("process.exit(2)");
  });
  it("out-of-scope rows resolve as observations — recorded and reported, NEVER in a delete set", () => {
    expect(src).toContain("out-of-scope, untouched");
    expect(src).toContain("deletion list in-scope");
    // a foreign title-match is filtered OUT of the delete set, not into it:
    expect(src).toContain("const outScope = all.filter((p) => p.workspace_id !== reviewWs)");
    // blocked items skip their deletes and surface as an operator-report exit (3):
    expect(src).toContain("post.blockedSkipped.length ? 3 : 0");
  });
  it("dry-run is the default — writes happen only under --apply", () => {
    expect(src).toContain('argv.includes("--apply")');
    expect(src).toMatch(/if \(!apply\)[\s\S]*dry-run\.json[\s\S]*process\.exit\(0\)/);
  });
  it("blocks a draft delete when NO-ACTION referencers exist outside the itemized tree", () => {
    for (const probe of [
      "working_copies",
      "correspondence_items",
      "claims",
      "findings",
      "revision_obligations",
      "descendant_drafts",
    ]) {
      expect(src).toContain(`"${probe}"`);
    }
    expect(src).toContain("outside the itemized tree — out-of-scope");
  });
  it("LAD projects key on title AND the review workspace — a foreign title-match is an observation", () => {
    expect(src).toContain("out-of-scope, untouched");
    expect(src).toContain("and workspace_id = $2");
  });
});

describe("cleanup-bl38-residue — evidence + safety mechanics", () => {
  it("pre-state capture lands BEFORE any delete (verbatim → gitignored logs, redacted → reports)", () => {
    expect(src).toContain("docs/build/logs/bl38-capture".replaceAll("/", '", "')) ;
    expect(src.indexOf("pre-state captured")).toBeLessThan(src.indexOf('await client.query("begin")'));
    expect(src).toContain("redactRow");
  });
  it("executes the bounded deletes in ONE transaction with rollback on error", () => {
    expect(src).toContain('await client.query("begin")');
    expect(src).toContain('await client.query("rollback")');
    expect(src).toContain('await client.query("commit")');
  });
  it("verifies post-state: every target absent, twin present, operator project intact", () => {
    expect(src).toContain("post.draft === 0");
    expect(src).toContain("post.deploymentsTwin === 1");
    expect(src).toContain("post.myFirstProject === 1");
  });
  it("the account leg replicates handleAccountHardDelete's leaf-first order (usage anonymized, workspace retained)", () => {
    expect(src).toContain("update usage_records set user_id = null, project_id = null, persona_id = null");
    expect(src).toContain('delete from "user" where id = $1');
    // projects die before personas before artifacts before the user — the canonical tail.
    const iProjects = src.indexOf('delete from projects where workspace_id = $1');
    const iUser = src.indexOf('delete from "user" where id = $1');
    expect(iProjects).toBeGreaterThan(-1);
    expect(iUser).toBeGreaterThan(iProjects);
  });
  it("requires the system-role DSN (RLS bypass) — never invents credentials", () => {
    expect(src).toContain("SYSTEM_DATABASE_URL");
    expect(src).toContain("system-role DSN over the IAP tunnel");
  });
});
