#!/usr/bin/env node
// R6CI.1 (operator insert 176a; ADR-115) — the `ci-anchor` job's payload writer.
//
// Runs only when `needs.fast-path.outputs.mode == 'full'` — a fast-path run never writes
// an anchor (a `mode != "full"` producer is poison to the verifier). Writes
// `anchor/payload.json` = {mode:"full", run_id, head_sha, non_docs_tree, base_sha?} for the
// `ci-pass-<h>` upload step. Fail-closed: malformed inputs exit non-zero, which fails the
// step rather than publishing a bad anchor.

import { mkdirSync, writeFileSync } from "node:fs";

const { RUN_ID, HEAD_SHA, BASE_SHA, NON_DOCS_TREE } = process.env;

const die = (msg) => {
  console.error(`write-anchor-payload: ${msg}`);
  process.exit(1);
};

if (!/^\d+$/.test(RUN_ID ?? "")) die(`RUN_ID '${RUN_ID}' is not numeric`);
if (!/^[0-9a-f]{40}$/.test(HEAD_SHA ?? "")) die(`HEAD_SHA '${HEAD_SHA}' is not a 40-hex sha`);
if (!/^[0-9a-f]{64}$/.test(NON_DOCS_TREE ?? "")) die(`NON_DOCS_TREE is not a 64-hex sha256`);
if (BASE_SHA && !/^[0-9a-f]{40}$/.test(BASE_SHA)) die(`BASE_SHA '${BASE_SHA}' is not a 40-hex sha`);

const payload = {
  mode: "full",
  run_id: Number(RUN_ID),
  head_sha: HEAD_SHA,
  non_docs_tree: NON_DOCS_TREE,
};
// pull_request runs record the merge's base side so the verifier can prove the merge base
// never moved; push/dispatch runs carry no base_sha (the bare head tree was verified).
if (BASE_SHA) payload.base_sha = BASE_SHA;

mkdirSync("anchor", { recursive: true });
writeFileSync("anchor/payload.json", JSON.stringify(payload) + "\n");
console.log(`anchor payload: ${JSON.stringify(payload)}`);
