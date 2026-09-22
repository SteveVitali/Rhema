#!/usr/bin/env node
/**
 * Record deploy provenance (REQ-ARCH-39). Run in the CI `images` job AFTER images are built and
 * their digests pinned: it assembles {git_sha, image_digests, protocols_version, rate_table_version}
 * and validates it through the same builder the deploy uses (@rhema/infra), then writes it as a
 * build artifact (the `deployments` table is fed from this artifact by the deploy step).
 *
 * Inputs via env: GIT_SHA, IMAGE_DIGESTS (JSON object service->sha256:…), PROTOCOLS_VERSION,
 * RATE_TABLE_VERSION, STAGE. Requires @rhema/infra to be built (`pnpm --filter @rhema/infra build`).
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildDeploymentProvenance } from "../infra/dist/config/provenance.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`record-provenance: missing required env ${name}`);
  return v;
}

const record = buildDeploymentProvenance({
  gitSha: requireEnv("GIT_SHA"),
  imageDigests: JSON.parse(requireEnv("IMAGE_DIGESTS")),
  // An empty/whitespace PROTOCOLS_VERSION (e.g. `--bare` with no protocols checkout) falls back to the
  // stub, so provenance never records a blank version (which the contract would reject).
  protocolsVersion: process.env.PROTOCOLS_VERSION?.trim() || "stub-0.0.0",
  rateTableVersion: process.env.RATE_TABLE_VERSION ?? new Date().toISOString().slice(0, 10),
  stage: requireEnv("STAGE"),
});

const outDir = resolve(root, "provenance-artifacts");
mkdirSync(outDir, { recursive: true });
const outFile = resolve(outDir, `${record.stage}-${record.git_sha}.json`);
writeFileSync(outFile, JSON.stringify(record, null, 2) + "\n");
console.log(`Recorded deploy provenance -> ${outFile}`);
console.log(JSON.stringify(record, null, 2));
