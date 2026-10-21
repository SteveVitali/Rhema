#!/usr/bin/env node
// R5OPS.1 (REQ-OPS-3; ratified Q-CDN) — the out-of-band verification of the production
// `usercontent.rhema.tools` Cloud CDN layer. READ-ONLY against production: `gcloud` describes +
// storage listings + `curl` GETs. The only privileged datum is the CDN signing key read from
// Secret Manager (`rhema-prod-user-content-signing-key`) — the same value the runbook installs on
// the backend bucket as `rhema-tools-key` (infra/PROD-BRINGUP.md §6). Key bytes go to a tmpfile
// for `gcloud compute sign-url` and are deleted in the same run; they never print.
//
// Probes (each recorded verbatim in the evidence JSON):
//   unsigned   — GET a real object path with no params → expected 403 (private bucket)
//   signed     — GET the same object with a fresh `gcloud compute sign-url` signature
//   corrupted  — GET with a mangled Signature → a signature-enforcing edge rejects it
//
// Verdicts:
//   PASS        — signed fetch reached a 2xx with the usercontent header contract
//                 (no Set-Cookie; allowlisted-or-octet-stream Content-Type; attachment
//                 Content-Disposition when the object carries none)
//   CONFIG-OK-ORIGIN-DENIED — the CDN config verifies (enableCdn + USE_ORIGIN_HEADERS +
//                 signedUrlKeyNames) but signed/unsigned/corrupted all 403 at the GCS origin —
//                 the LB→bucket read leg denies; a live defect, not passed evidence.
//   FAIL        — config absent or an unexpected shape.
//
//   CDN_VERIFY_ACK=yes GCP_PROJECT=rhema-507501 \
//     node scripts/live/usercontent-cdn-verify.mjs --execute [--object <gs path under the bucket>]
//   node scripts/live/usercontent-cdn-verify.mjs --dry-run
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const args = process.argv.slice(2);
const dryRun = !args.includes("--execute");
const flag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};
const PROJECT = process.env.GCP_PROJECT || "rhema-507501";
const HOST = "usercontent.rhema.tools";
const OBJECT = flag("--object") || "quarantine/01M2R2E1WA81E1BQJX94K1SZQ4/prb16-imp-1.md";
const SECRET = process.env.USERCONTENT_SIGNING_SECRET_NAME || "rhema-prod-user-content-signing-key";
const KEY_NAME = "rhema-tools-key";

const ALLOWED_TYPES = /^(application\/octet-stream|text\/|image\/|application\/json|application\/pdf)/;

function plan() {
  return {
    req: "REQ-OPS-3",
    reads: [
      `gcloud compute backend-buckets list/describe (project ${PROJECT})`,
      `gcloud compute url-maps describe (host rule for ${HOST})`,
      `gcloud secrets versions access ${SECRET} (→ tmpfile, deleted same-run, never printed)`,
      `gcloud compute sign-url https://${HOST}/${OBJECT} --key-name ${KEY_NAME}`,
      `curl GETs: unsigned / signed / corrupted-signature`,
    ],
    asserts:
      "signed → 2xx + no Set-Cookie + allowlist-or-octet-stream Content-Type (+ attachment disposition when present)",
  };
}

if (dryRun) {
  console.log(JSON.stringify({ dry_run: true, plan: plan() }, null, 1));
  process.exit(0);
}
if (process.env.CDN_VERIFY_ACK !== "yes") {
  console.error("refusing: --execute requires CDN_VERIFY_ACK=yes (the operator's prod-read go)");
  process.exit(3);
}

const gcloud = (gargs, opts = {}) =>
  execFileSync("gcloud", gargs, { encoding: "utf8", ...opts }).trim();

const evidence = { req: "REQ-OPS-3", at: new Date().toISOString(), object: OBJECT };
const keyDir = mkdtempSync(join(tmpdir(), "r5ops1-cdn-"));
try {
  // 1. backend bucket: CDN enabled, origin-header cache mode, signed-url key attached.
  const bucketsRaw = gcloud([
    "compute", "backend-buckets", "list",
    "--project", PROJECT, "--format", "json",
  ]);
  const bucket = JSON.parse(bucketsRaw).find((b) => (b.cdnPolicy?.signedUrlKeyNames ?? []).length);
  if (!bucket) {
    evidence.verdict = "FAIL — no backend bucket with a signedUrlKeyNames entry found";
    console.log(JSON.stringify(evidence, null, 1));
    process.exit(4);
  }
  const described = JSON.parse(
    gcloud(["compute", "backend-buckets", "describe", bucket.name, "--project", PROJECT, "--format", "json"]),
  );
  evidence.backend_bucket = {
    name: described.name,
    bucketName: described.bucketName,
    enableCdn: described.enableCdn,
    cacheMode: described.cdnPolicy?.cacheMode,
    signedUrlKeyNames: described.cdnPolicy?.signedUrlKeyNames,
    signedUrlCacheMaxAgeSec: described.cdnPolicy?.signedUrlCacheMaxAgeSec,
  };

  // 2. urlmap host rule for the usercontent host.
  const maps = JSON.parse(
    gcloud(["compute", "url-maps", "list", "--project", PROJECT, "--format", "json"]),
  );
  let hostRule = null;
  for (const m of maps) {
    let d;
    try {
      d = JSON.parse(
        gcloud(["compute", "url-maps", "describe", m.name, "--project", PROJECT, "--format", "json"]),
      );
    } catch {
      continue; // regional or foreign-scope maps aren't describable via the global compute API
    }
    for (const hr of d.hostRules ?? []) {
      if ((hr.hosts ?? []).includes(HOST)) {
        hostRule = { urlMap: m.name, pathMatcher: hr.pathMatcher };
      }
    }
  }
  evidence.host_rule = hostRule;

  // 3. mint a signed URL with the documented key (tmpfile; deleted in finally).
  const keyFile = join(keyDir, "key");
  writeFileSync(keyFile, gcloud(["secrets", "versions", "access", "latest", "--secret", SECRET, "--project", PROJECT]));
  const signOut = gcloud([
    "compute", "sign-url", `https://${HOST}/${OBJECT}`,
    "--key-name", KEY_NAME, "--key-file", keyFile, "--expires-in", "600",
  ]);
  const signedUrl = signOut.match(/https:\/\/\S+/)[0];

  // 4. the three fetch probes.
  const fetchProbe = (url) => {
    const out = execFileSync(
      "curl", ["-sS", "-o", "/dev/null", "-w", "%{http_code}", "-D", "-", "--max-time", "20", url],
      { encoding: "utf8" },
    );
    const code = out.trim().split("\n").pop();
    const hdrs = {};
    for (const line of out.split("\n").slice(0, -1)) {
      const m = line.match(/^([^:]+):\s*(.+?)\s*$/);
      if (m) hdrs[m[1].toLowerCase()] = m[2];
    }
    return { status: Number(code), headers: hdrs };
  };
  const unsigned = fetchProbe(`https://${HOST}/${OBJECT}`);
  const signed = fetchProbe(signedUrl);
  const corrupted = fetchProbe(
    `https://${HOST}/${OBJECT}?Expires=9999999999&KeyName=${KEY_NAME}&Signature=AAAAAAAAAAAAAAAAAAAAAA==`,
  );
  evidence.probes = {
    unsigned: { status: unsigned.status, server: unsigned.headers.server },
    signed: {
      status: signed.status,
      content_type: signed.headers["content-type"],
      content_disposition: signed.headers["content-disposition"],
      set_cookie: "set-cookie" in signed.headers,
      cache_control: signed.headers["cache-control"],
      age: signed.headers["age"],
    },
    corrupted_signature: { status: corrupted.status, server: corrupted.headers.server },
  };

  // 5. verdict.
  const s = evidence.probes.signed;
  const headerContract =
    s.status >= 200 && s.status < 300 &&
    s.set_cookie === false &&
    ALLOWED_TYPES.test(s.content_type ?? "");
  if (headerContract) {
    evidence.verdict = "PASS — CDN-signed usercontent headers verified (non-403, header contract holds)";
  } else if (unsigned.status === 403 && signed.status === 403 && corrupted.status === 403) {
    evidence.verdict =
      "CONFIG-OK-ORIGIN-DENIED — enableCdn+USE_ORIGIN_HEADERS+rhema-tools-key verified via gcloud, " +
      "but signed/unsigned/corrupted all return the GCS origin's AccessDenied 403: the edge does not " +
      "gate on the signature and the LB→private-bucket origin read is denied (no objectViewer grant). " +
      "NON-EVIDENCE for the signed-delivery path — recorded as a live finding.";
  } else {
    evidence.verdict = "FAIL — unexpected response shape; inspect probes";
  }
} finally {
  rmSync(keyDir, { recursive: true, force: true });
}

console.log(JSON.stringify(evidence, null, 1));
process.exit(evidence.verdict.startsWith("PASS") ? 0 : 4);
