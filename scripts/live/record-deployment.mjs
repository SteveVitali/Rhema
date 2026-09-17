#!/usr/bin/env node
// Thin runner for the LIVE deployment-provenance write (PRB.15 Stage B — operator-gated). Usage:
//
//   DATABASE_URL=postgres://… STAGE=prod GIT_SHA=$(git rev-parse HEAD) \
//   IMAGE_DIGESTS='{"api":"sha256:…","web":"sha256:…","worker":"sha256:…","fetcher":"sha256:…",
//                   "convert":"sha256:…","export":"sha256:…","collab":"sha256:…",
//                   "egress-proxy":"sha256:…","run-task":"sha256:…"}' \
//     node scripts/live/record-deployment.mjs
//
// Writes the `deployments` row for the deploy that just went out — the same digests pinned into
// `rhema:serviceImages` / `rhema:runTaskImageDigest` / `rhema:proxyImage`. PROTOCOLS_VERSION is computed
// HERE via compute-protocols-version.mjs --bare (the real 0.4.0+<sha> over the committed trio —
// REQ-SPEC-22); the run REFUSES to touch the DB if it comes back empty, so prod provenance can never
// stamp stub-0.0.0 (D-P0.04-2's live half). RATE_TABLE_VERSION defaults to today's date (the rate-table
// is date-versioned until P1.16's real table lands).

import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..");
const tsx = resolve(repoRoot, "node_modules/.bin/tsx");
const target = resolve(repoRoot, "integration/src/record-deployment.ts");

// Compute the real protocols_version in this process (it only needs node + the committed trio).
const pv = spawnSync(process.execPath, [resolve(repoRoot, "scripts/compute-protocols-version.mjs"), "--bare"], {
  encoding: "utf8",
});
const protocolsVersion = (pv.stdout ?? "").trim();
if (pv.status !== 0 || protocolsVersion === "") {
  console.error(
    "[record-deployment] compute-protocols-version.mjs returned no version — refusing to stamp " +
      "prod provenance with a stub (D-P0.04-2). Is the private @rhema/protocols checkout present?",
  );
  process.exit(1);
}
if (!protocolsVersion.startsWith("0.4.0+")) {
  console.error(`[record-deployment] unexpected protocols_version '${protocolsVersion}' — expected 0.4.0+<sha>`);
  process.exit(1);
}
console.log(`[record-deployment] protocols_version: ${protocolsVersion}`);

const child = spawn(tsx, [target], {
  stdio: "inherit",
  env: { ...process.env, PROTOCOLS_VERSION: protocolsVersion },
});
child.on("exit", (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
child.on("error", (err) => {
  console.error("[record-deployment] failed to spawn tsx:", err);
  process.exit(1);
});
