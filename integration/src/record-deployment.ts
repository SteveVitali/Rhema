// The LIVE deployment-provenance writer (PRB.15 Stage B — operator-gated). Inserts the production
// `deployments` row — {stage, git_sha, image_digests, protocols_version, rate_table_version} —
// validated through the same `buildDeploymentProvenance` builder the CI `images` job uses
// (REQ-ARCH-39 / D-P0.04-2's live half). `id` is `${stage}:${git_sha}` so a re-record of the same
// deploy refreshes the row rather than duplicating it.
//
// The runner (`scripts/live/record-deployment.mjs`) computes PROTOCOLS_VERSION via
// `compute-protocols-version.mjs --bare` (the real `0.4.0+<sha>` over the committed trio) and fails
// before touching the DB if it comes back empty/stub — prod provenance must never stamp `stub-0.0.0`.

import pg from "pg";
import { buildDeploymentProvenance } from "@rhema/infra";
import { PROTOCOL_SEEDS } from "@rhema/protocols";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`record-deployment: missing required env ${name}`);
  return v;
}

export interface RecordDeploymentResult {
  readonly id: string;
  readonly stage: string;
  readonly gitSha: string;
  readonly protocolsVersion: string;
  readonly services: string[];
}

/**
 * Insert-or-refresh the `deployments` row for this deploy. `imageDigestsJson` is the `{service:
 * "sha256:…"}` map the images pipeline published (the SAME values pinned into `rhema:serviceImages`,
 * `rhema:runTaskImageDigest`, `rhema:proxyImage` — provenance asserts what is actually deployed).
 */
export async function recordDeployment(
  pool: pg.Pool,
  args: {
    stage: string;
    gitSha: string;
    imageDigestsJson: string;
    protocolsVersion: string;
    rateTableVersion: string;
  },
  log: (msg: string) => void = console.log,
): Promise<RecordDeploymentResult> {
  if (args.protocolsVersion === "stub-0.0.0" || args.protocolsVersion.trim() === "") {
    throw new Error(
      `record-deployment: refusing stub/empty protocols_version (${JSON.stringify(args.protocolsVersion)}) — ` +
        "prod provenance must carry the real 0.4.0+<sha> (D-P0.04-2)",
    );
  }
  const record = buildDeploymentProvenance({
    stage: args.stage,
    gitSha: args.gitSha,
    imageDigests: JSON.parse(args.imageDigestsJson),
    protocolsVersion: args.protocolsVersion,
    rateTableVersion: args.rateTableVersion,
  });
  const id = `${record.stage}:${record.git_sha}`;
  await pool.query(
    `insert into deployments (id, stage, git_sha, image_digests, protocols_version, rate_table_version)
     values ($1,$2,$3,$4,$5,$6)
     on conflict (id) do update
       set image_digests = excluded.image_digests,
           protocols_version = excluded.protocols_version,
           rate_table_version = excluded.rate_table_version,
           deployed_at = now()`,
    [
      id,
      record.stage,
      record.git_sha,
      JSON.stringify(record.image_digests),
      record.protocols_version,
      record.rate_table_version,
    ],
  );
  log(`[deployments] recorded ${id} protocols_version=${record.protocols_version}`);
  for (const [svc, digest] of Object.entries(record.image_digests)) {
    log(`[deployments]   ${svc} -> ${digest}`);
  }
  return {
    id,
    stage: record.stage,
    gitSha: record.git_sha,
    protocolsVersion: record.protocols_version,
    services: Object.keys(record.image_digests).sort(),
  };
}

/** CLI entry: DATABASE_URL + STAGE + GIT_SHA + IMAGE_DIGESTS + PROTOCOLS_VERSION (+ RATE_TABLE_VERSION). */
export async function main(): Promise<void> {
  const databaseUrl = requireEnv("DATABASE_URL");
  const protocolsVersion = requireEnv("PROTOCOLS_VERSION");
  const pool = new pg.Pool({ connectionString: databaseUrl });
  try {
    await recordDeployment(pool, {
      stage: requireEnv("STAGE"),
      gitSha: requireEnv("GIT_SHA"),
      imageDigestsJson: requireEnv("IMAGE_DIGESTS"),
      protocolsVersion,
      rateTableVersion: process.env.RATE_TABLE_VERSION ?? new Date().toISOString().slice(0, 10),
    });
    console.log(`[record-deployment] done (${PROTOCOL_SEEDS.length} protocol seed(s) shipped this build)`);
  } catch (err) {
    console.error("[record-deployment] failed:", err);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  void main();
}
