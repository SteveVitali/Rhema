// JOURNEY.1 — check-deploy-provenance.mjs behavior: pass on match, fail closed on mismatch/absent.
// The script is spawned ASYNC (spawnSync would starve the in-process test server → deadlock).
import { test } from "vitest";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import http from "node:http";

const SHA = "e6c91039e66ac3c42e97b6a8ce67150516a67ddf";
const SCRIPT = fileURLToPath(new URL("./check-deploy-provenance.mjs", import.meta.url));

function run(args) {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, [SCRIPT, ...args], { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    p.on("close", (status) => resolve({ status, stdout: out, stderr: err }));
  });
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
