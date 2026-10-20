// JOURNEY.1 — check-deploy-provenance.mjs behavior: pass on match, fail closed on mismatch/absent.
// The script is spawned ASYNC (spawnSync would starve the in-process test server → deadlock).
import { test } from "vitest";
import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import http from "node:http";

const SHA = "e6c91039e66ac3c42e97b6a8ce67150516a67ddf";
const SCRIPT = fileURLToPath(new URL("./check-deploy-provenance.mjs", import.meta.url));

function run(args, opts = {}) {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, [SCRIPT, ...args], {
      stdio: ["ignore", "pipe", "pipe"],
      cwd: opts.cwd,
    });
    let out = "";
    let err = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    p.on("close", (status) => resolve({ status, stdout: out, stderr: err }));
  });
}

// R6ENG.1 (REQ-ENG-8) — the drift arms need a real repo: `deployed` is the base commit;
// `docsHead`/`ciHead` add only allowlisted paths; `codeHead` adds a code file; `orphan` is an
// unrelated root (non-ancestor). The script's git calls run against the spawn cwd.
function initDriftRepo() {
  const dir = mkdtempSync(join(tmpdir(), "prov-drift-"));
  const g = (...args) => execFileSync("git", args, { cwd: dir, encoding: "utf8" }).trim();
  const add = (rel, body) => {
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
  add(".gitleaks.toml", "title = \"t\"\n");
  const ciHead = commit();
  add("src/change.ts", "export const y = 2;\n");
  const codeHead = commit();
  g("checkout", "-q", "--orphan", "other");
  g("rm", "-qrf", ".");
  g("-c", "user.email=t@t", "-c", "user.name=t", "commit", "--allow-empty", "-qm", "o");
  const orphan = g("rev-parse", "HEAD");
  return { dir, deployed, docsHead, ciHead, codeHead, orphan };
}

function withServer(body, fn) {
  const srv = http.createServer((_req, res) => {
    res.writeHead(200, { "content-type": "application/json", connection: "close" });
    res.end(JSON.stringify(body));
  });
  return new Promise((resolve) =>
    srv.listen(0, "127.0.0.1", async () => {
      try {
        resolve(await fn(`http://127.0.0.1:${srv.address().port}`));
      } finally {
        srv.closeAllConnections?.();
        srv.close();
      }
    }),
  );
}

test("passes when every healthz reports the expected sha", async () => {
  await withServer({ ok: true, build: { gitSha: SHA } }, async (url) => {
    const r = await run(["--expect", SHA, "--healthz", url]);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /provenance OK/);
  });
});

test("fails closed on mismatch, absent build field, and unreachable service", async () => {
  await withServer({ ok: true, build: { gitSha: "deadbeef".repeat(5) } }, async (url) => {
    assert.notEqual((await run(["--expect", SHA, "--healthz", url])).status, 0);
  });
  await withServer({ ok: true }, async (url) => {
    assert.notEqual((await run(["--expect", SHA, "--healthz", url])).status, 0);
  });
  const r = await run(["--expect", SHA, "--healthz", "http://127.0.0.1:1"]);
  assert.notEqual(r.status, 0);
});

test("--deployed mode compares a pre-resolved sha (the deployments row)", async () => {
  assert.equal((await run(["--expect", SHA, "--deployed", SHA])).status, 0);
  assert.equal((await run(["--expect", SHA, "--deployed", SHA.slice(0, 7)])).status, 0);
  assert.notEqual((await run(["--expect", SHA, "--deployed", "f".repeat(40)])).status, 0);
});

test("usage error without --expect", async () => {
  assert.equal((await run(["--healthz", "http://x"])).status, 2);
});

test("R6ENG.1 REQ-ENG-8 — ancestor + deploy-neutral diff (docs / CI-only config) passes", async () => {
  const r = initDriftRepo();
  const docs = await run(["--expect", r.docsHead, "--deployed", r.deployed], { cwd: r.dir });
  assert.equal(docs.status, 0, docs.stderr);
  assert.match(docs.stdout, /deploy-neutral drift/);
  // docs + .gitleaks.toml (the allowlist's exact-path rule) still pass.
  const ci = await run(["--expect", r.ciHead, "--deployed", r.deployed], { cwd: r.dir });
  assert.equal(ci.status, 0, ci.stderr);
});

test("R6ENG.1 REQ-ENG-8 — code drift and non-ancestor fail exactly as the strict arm", async () => {
  const r = initDriftRepo();
  const code = await run(["--expect", r.codeHead, "--deployed", r.deployed], { cwd: r.dir });
  assert.notEqual(code.status, 0);
  const div = await run(["--expect", r.docsHead, "--deployed", r.orphan], { cwd: r.dir });
  assert.notEqual(div.status, 0);
});

test("R6ENG.1 REQ-ENG-8 — the drift arm fails closed outside a git repo", async () => {
  const r = initDriftRepo();
  const outside = mkdtempSync(join(tmpdir(), "prov-norepo-"));
  const res = await run(["--expect", r.docsHead, "--deployed", r.deployed], { cwd: outside });
  assert.notEqual(res.status, 0);
});
