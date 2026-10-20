#!/usr/bin/env node
// JOURNEY.1 (REQ-SPEC-29; REQ-ARCH-39) — the deploy-provenance gate. Compares the deployed source
// SHA each reachable service reports (GET <url>/healthz → build.gitSha — baked into the image at
// build time via Dockerfile `ARG GIT_SHA` → RHEMA_BUILD_GIT_SHA) against the expected chain-tip SHA.
// Fails closed: any unreachable service, absent/unknown SHA, or mismatch exits non-zero.
//
// Usage:
//   node scripts/check-deploy-provenance.mjs --expect <chain-tip-sha> \
//     --healthz https://app.rhema.tools --healthz https://api.rhema.tools [--deployed <sha>]
//
// `--deployed <sha>` carries an already-resolved deployed SHA (e.g. the `deployments` row) into the
// same comparison without this script needing DB access.
//
// R6ENG.1 (REQ-ENG-8; ADR-114): a strict mismatch gets ONE second opinion — when the deployed
// SHA is a git ancestor of the expected SHA and `git diff <deployed>..<expected>` touches only
// the deploy-neutral allowlist (`scripts/deploy-neutral-paths.txt`), the deploy is honestly
// current-under-docs-only-drift and the label PASSes with a drift note. Non-ancestry, an
// unresolvable SHA, or ANY non-neutral path fails exactly as it did before — fail-closed.

import { deployNeutralDrift } from "./deploy-neutral.mjs";

const args = process.argv.slice(2);
const take = (flag) => {
  const out = [];
  for (let i = 0; i < args.length; i++) if (args[i] === flag && args[i + 1]) out.push(args[++i]);
  return out;
};

const expectSha = (take("--expect")[0] ?? "").trim().toLowerCase();
const healthzUrls = take("--healthz");
const deployedShas = take("--deployed");

if (!expectSha || (healthzUrls.length === 0 && deployedShas.length === 0)) {
  console.error(
    "usage: check-deploy-provenance.mjs --expect <sha> (--healthz <url>… | --deployed <sha>…)",
  );
  process.exit(2);
}

const observed = {};

async function fetchSha(url) {
  try {
    const r = await fetch(`${url.replace(/\/+$/, "")}/healthz`);
    if (!r.ok) return null;
    const j = await r.json();
    const sha = j?.build?.gitSha;
    return typeof sha === "string" && sha && sha !== "unknown" ? sha : null;
  } catch {
    return null;
  }
}

for (const url of healthzUrls) observed[url] = await fetchSha(url);
deployedShas.forEach((sha, i) => {
  observed[`--deployed#${i}`] = sha.trim().toLowerCase() || null;
});

const match = (sha) => {
  const s = sha?.trim().toLowerCase();
  return !!s && s !== "unknown" && (s.startsWith(expectSha) || expectSha.startsWith(s));
};

let ok = true;
for (const [label, sha] of Object.entries(observed)) {
  let good = match(sha);
  let drift = false;
  if (!good && sha != null) {
    // REQ-ENG-8 second opinion — ancestor + deploy-neutral-diff-only. `deployNeutralDrift` is
    // fail-closed: absent/unknown/unresolvable SHAs and non-repo cwds all return ok:false.
    const verdict = deployNeutralDrift(expectSha, sha);
    good = verdict.ok;
    drift = verdict.ok;
  }
  if (!good) ok = false;
  console.log(
    `${good ? "PASS" : "FAIL"}  ${label}  deployed=${sha ?? "(absent)"}  expected=${expectSha}` +
      (drift ? "  (deploy-neutral drift: deployed ⊂ ancestors of HEAD, allowlisted diff only)" : ""),
  );
}

if (!ok) {
  console.error(
    "deploy-provenance mismatch — the deployed source is not the expected chain tip (or a service reports no SHA). Deploy/refresh first; the check fails closed.",
  );
  process.exit(1);
}
console.log(`provenance OK — every observed service deploys ${expectSha}`);
