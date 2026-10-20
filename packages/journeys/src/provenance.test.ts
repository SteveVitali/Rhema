import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  deployNeutralDrift,
  fetchDeployedSha,
  loadDeployNeutralRules,
  provenanceDriftCheck,
  provenanceMatch,
} from "./provenance.js";

const ok = (sha: string) =>
  new Response(JSON.stringify({ ok: true, service: "x", build: { gitSha: sha } }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
const gfe404 = () =>
  new Response("<html><title>Error 404</title></html>", { status: 404 });

describe("fetchDeployedSha", () => {
  it("reads /healthz verbatim on a host that serves it", async () => {
    const seen: string[] = [];
    const sha = await fetchDeployedSha("https://app.example", async (url) => {
      seen.push(String(url));
      return ok("abc123");
    });
    expect(sha).toBe("abc123");
    expect(seen).toEqual(["https://app.example/healthz"]);
  });

  it("VERIF.2 (F-OPS.1-10) — falls back to /healthz/ when the bare path is GFE-intercepted", async () => {
    const seen: string[] = [];
    const sha = await fetchDeployedSha("https://svc-abc-uc.a.run.app/", async (url) => {
      const u = String(url);
      seen.push(u);
      return u.endsWith("/healthz/") ? ok("def456") : gfe404();
    });
    expect(sha).toBe("def456");
    expect(seen).toEqual([
      "https://svc-abc-uc.a.run.app/healthz",
      "https://svc-abc-uc.a.run.app/healthz/",
    ]);
  });

  it("stays null when neither path reaches the app", async () => {
    expect(await fetchDeployedSha("https://x.example", async () => gfe404())).toBeNull();
    expect(
      await fetchDeployedSha("https://x.example", async () => {
        throw new Error("connrefused");
      }),
    ).toBeNull();
  });

  it("treats an unknown/empty gitSha as unproven", async () => {
    expect(await fetchDeployedSha("https://x.example", async () => ok("unknown"))).toBeNull();
    expect(await fetchDeployedSha("https://x.example", async () => ok(""))).toBeNull();
  });
});

describe("provenanceMatch", () => {
  it("prefix-matches either direction and fails closed on null/unknown", () => {
    expect(provenanceMatch("abcdef1234", { web: "abcdef1234ffff", api: "abcdef1234" })).toBe(true);
    expect(provenanceMatch("abcdef1234ffff", { web: "abcdef1234" })).toBe(true);
    expect(provenanceMatch("abc", { web: "abc", api: null })).toBe(false);
    expect(provenanceMatch("abc", { web: "abc", api: "unknown" })).toBe(false);
    expect(provenanceMatch("", { web: "abc" })).toBe(false);
  });
});

// ── R6ENG.1 (REQ-ENG-8; ADR-114) — the deploy-neutral drift arm ──────────────────────────
// Fixture: a real git repo — `deployed` is the base commit; `docsHead`/`ciHead` add only
// allowlisted paths; `codeHead` adds a code file; `orphan` is an unrelated root.
function initDriftRepo() {
  const dir = mkdtempSync(join(tmpdir(), "prov-drift-"));
  const g = (...args: string[]) =>
    execFileSync("git", args, { cwd: dir, encoding: "utf8" }).trim();
  const add = (rel: string, body: string) => {
    mkdirSync(dirname(join(dir, rel)), { recursive: true });
    writeFileSync(join(dir, rel), body);
  };
  const commit = () => {
    g("-c", "user.email=t@t", "-c", "user.name=t", "add", "-A");
    g("-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "c");
    return g("rev-parse", "HEAD");
  };
  g("init", "-qb", "main");
  add("src/app.ts", "export const x = 1;\n");
  const deployed = commit();
  add("docs/note.md", "# note\n");
  const docsHead = commit();
  add(".gitleaks.toml", 'title = "t"\n');
  const ciHead = commit();
  add("src/change.ts", "export const y = 2;\n");
  const codeHead = commit();
  g("checkout", "-q", "--orphan", "other");
  g("rm", "-qrf", ".");
  g("-c", "user.email=t@t", "-c", "user.name=t", "commit", "--allow-empty", "-qm", "o");
  const orphan = g("rev-parse", "HEAD");
  return { dir, deployed, docsHead, ciHead, codeHead, orphan };
}

describe("loadDeployNeutralRules — the committed allowlist", () => {
  it("parses subtree + exact rules, ignoring comments and blanks", () => {
    const r = loadDeployNeutralRules("# c\n\ndocs/\n.gitleaks.toml\n");
    expect(r.isNeutral("docs/build/runs/X.md")).toBe(true);
    expect(r.isNeutral("docs/tickets/00_MANIFEST.md")).toBe(true);
    expect(r.isNeutral(".gitleaks.toml")).toBe(true);
    expect(r.isNeutral("docs")).toBe(false); // the bare dir name is not the subtree
    expect(r.isNeutral("packages/journeys/src/cli.ts")).toBe(false);
    expect(r.isNeutral(".github/workflows/journeys.yml")).toBe(false);
    expect(r.isNeutral("docs/../src/app.ts")).toBe(true); // prefix-lexical — see ADR-114
  });

  it("the committed allowlist covers docs + .gitleaks.toml and no workflow path", () => {
    const r = loadDeployNeutralRules();
    expect(r.isNeutral("docs/build/LEDGER.md")).toBe(true);
    expect(r.isNeutral(".gitleaks.toml")).toBe(true);
    expect(r.isNeutral(".github/workflows/journeys.yml")).toBe(false);
  });
});

describe("deployNeutralDrift — REQ-ENG-8 second opinion, fail-closed", () => {
  it("accepts an ancestor whose diff is docs-only", () => {
    const r = initDriftRepo();
    const v = deployNeutralDrift(r.docsHead, r.deployed, { cwd: r.dir });
    expect(v.ok).toBe(true);
    expect(v.neutralPaths).toEqual(["docs/note.md"]);
  });

  it("accepts docs + CI-only config (.gitleaks.toml) diffs", () => {
    const r = initDriftRepo();
    expect(deployNeutralDrift(r.ciHead, r.deployed, { cwd: r.dir }).ok).toBe(true);
  });

  it("rejects when the diff carries a code path", () => {
    const r = initDriftRepo();
    const v = deployNeutralDrift(r.codeHead, r.deployed, { cwd: r.dir });
    expect(v.ok).toBe(false);
    expect(v.reason).toMatch(/non-neutral/);
  });

  it("rejects a non-ancestor and an absent/unknown deployed sha", () => {
    const r = initDriftRepo();
    expect(deployNeutralDrift(r.docsHead, r.orphan, { cwd: r.dir }).ok).toBe(false);
    expect(deployNeutralDrift(r.docsHead, r.orphan, { cwd: r.dir }).reason).toMatch(
      /not-an-ancestor|unresolvable/,
    );
    expect(deployNeutralDrift(r.docsHead, "unknown", { cwd: r.dir }).ok).toBe(false);
    expect(deployNeutralDrift(r.docsHead, "", { cwd: r.dir }).ok).toBe(false);
  });

  it("fails closed outside a git repo", () => {
    const r = initDriftRepo();
    const outside = mkdtempSync(join(tmpdir(), "prov-norepo-"));
    expect(deployNeutralDrift(r.docsHead, r.deployed, { cwd: outside }).ok).toBe(false);
  });
});

describe("provenanceDriftCheck — per-label second opinion", () => {
  it("exact match: strict labels never enter the drift arm", () => {
    const r = initDriftRepo();
    const v = provenanceDriftCheck(r.deployed, { web: r.deployed, api: r.deployed }, { cwd: r.dir });
    expect(v).toEqual({ match: true, drifted: [] });
  });

  it("allowed ancestor drift: names the drifted labels", () => {
    const r = initDriftRepo();
    const v = provenanceDriftCheck(
      r.docsHead,
      { web: r.deployed, api: r.docsHead },
      { cwd: r.dir },
    );
    expect(v).toEqual({ match: true, drifted: ["web"] });
  });

  it("rejected drift: one non-neutral label fails the whole check", () => {
    const r = initDriftRepo();
    expect(
      provenanceDriftCheck(r.codeHead, { web: r.deployed, api: r.codeHead }, { cwd: r.dir }).match,
    ).toBe(false);
    expect(
      provenanceDriftCheck(r.docsHead, { web: r.deployed, api: null }, { cwd: r.dir }).match,
    ).toBe(false);
    expect(
      provenanceDriftCheck(r.docsHead, { web: r.deployed, api: "unknown" }, { cwd: r.dir }).match,
    ).toBe(false);
  });
});
