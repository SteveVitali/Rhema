#!/usr/bin/env node
// BL-115 — fetch the stage's shared `x-rhema-identity-key` from Secret Manager and hand it to a
// live caller WITHOUT the value ever touching argv, logs, or the repo. Post-267_R6SEC.2 (RH-10)
// the non-prod identity shim ignores `x-rhema-*` headers unless the request also carries the
// stage's shared key; the key is minted per non-prod stage into `rhema-<stage>-identity-headers-key`
// (infra/pulumi index.ts ~:422 — a RandomPassword SecretVersion). Callers used to read it by hand.
//
//   node scripts/live/identity-key.mjs <stage> [--project <gcp-project>]
//       print the key to stdout — for command substitution: RHEMA_IDENTITY_KEY="$(…)".
//       stdout is the sanctioned hand-off channel (the caller's env-var contract); the value is
//       still never echoed to stderr or persisted.
//   node scripts/live/identity-key.mjs <stage> --var <NAME> -- <cmd> [args…]
//       spawn <cmd> with NAME set in its env — the value never enters argv or this process's logs.
//
// `prod` is refused: the identity shim is never armed on prod (AGENTS gotcha 4), so a fetched
// "prod key" would name a secret that does not exist — fail honest instead of gcloud-erroring.
// Only `dev` and `pr-<n>` stages mint the secret.

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

export const IDENTITY_KEY_STAGES = /^dev$|^pr-\d+$/;

/** Secret Manager id for the stage's shared identity key (`rhema-<stage>-identity-headers-key`). */
export function identitySecretName(stage) {
  return `rhema-${stage}-identity-headers-key`;
}

export function classifyStage(stage) {
  if (stage === "prod") {
    return "refused: the identity shim is never armed on prod — no rhema-prod-identity-headers-key exists to fetch";
  }
  if (!IDENTITY_KEY_STAGES.test(stage)) {
    return `refused: '${stage}' is not a shim stage (only dev and pr-<n> mint identity-headers-key)`;
  }
  return "ok";
}

function gcloud(args, capture = false) {
  const res = spawnSync("gcloud", args, {
    encoding: "utf8",
    stdio: capture ? ["inherit", "pipe", "inherit"] : "inherit",
  });
  return res;
}

function usage() {
  console.error(
    "usage: node scripts/live/identity-key.mjs <dev|pr-<n>> [--project <gcp-project>]\n" +
      "       node scripts/live/identity-key.mjs <dev|pr-<n>> --var <NAME> -- <cmd> [args…]",
  );
  return 2;
}

export function main(argv) {
  const stage = argv[0];
  if (!stage || stage.startsWith("-")) return usage();
  const verdict = classifyStage(stage);
  if (verdict !== "ok") {
    console.error(`identity-key: ${verdict}`);
    return 1;
  }
  const secret = identitySecretName(stage);

  // Parse the tail: [--project <p>] or --var <NAME> -- <cmd…>.
  const rest = argv.slice(1);
  let projectArgs = [];
  let varName = null;
  let child = null;
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === "--project" && i + 1 < rest.length && child === null) {
      projectArgs = ["--project", rest[++i]];
    } else if (rest[i] === "--var" && i + 1 < rest.length && child === null) {
      varName = rest[++i];
    } else if (rest[i] === "--") {
      child = rest.slice(i + 1);
      break;
    } else {
      return usage();
    }
  }
  if (varName !== null && child === null) return usage();
  if (child !== null && child.length === 0) return usage();

  // The value is captured in-process — it never becomes an argv element and is never logged.
  const res = gcloud(
    ["secrets", "versions", "access", "latest", "--secret", secret, ...projectArgs],
    { capture: true },
  );
  if (res.status !== 0) {
    console.error(
      `identity-key: gcloud could not read '${secret}' — check gcloud auth + the operator's ` +
        "Secret Manager grant (the key is minted by the stage's pulumi stack).",
    );
    return res.status ?? 1;
  }
  const value = (res.stdout ?? "").trim();
  if (!value) {
    console.error(`identity-key: '${secret}' resolved to an empty value — refusing to hand it on.`);
    return 1;
  }

  if (child !== null) {
    // Env injection — the ONLY sanctioned channel for live callers (never argv/log/repo).
    const env = { ...process.env, [varName ?? "RHEMA_IDENTITY_KEY"]: value };
    const run = spawnSync(child[0], child.slice(1), { stdio: "inherit", env });
    return run.status ?? 1;
  }
  // Command-substitution channel: `VAR="$(node scripts/live/identity-key.mjs dev)"`.
  process.stdout.write(value + "\n");
  return 0;
}

// Entrypoint guard — the checkout path contains `ē`, which import.meta.url percent-encodes
// (infra/AGENTS.md gotcha 9): compare path↔path, not url↔path.
const invokedAsScript = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (invokedAsScript) {
  process.exit(main(process.argv.slice(2)));
}
