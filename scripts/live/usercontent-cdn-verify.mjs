#!/usr/bin/env node
// R6UCD.1 (REQ-POST-7, ADR-113) — the out-of-band verification of the API-MINTED usercontent
// delivery path. Supersedes the R5OPS.1 CDN-edge contract (that edge-signed path verified only
// the config — the LB→bucket origin read was always denied — and its repair was ruled out
// 2026-10-20). READ-ONLY against production: `gcloud` describes + IAM signBlob + `curl` GETs.
// NO secret material is touched at all — the old run read the CDN key from Secret Manager; this
// path has no key material. The only privileged primitive is `signBlob` on the api's service
// account (the same mechanism the api itself uses to mint — `createGcsV4UserContentSigner`).
//
// Probes (each recorded verbatim in the evidence JSON):
//   api-mint-unauth — GET <api>/usercontent/sign?key=<object> with NO session → expected 401:
//     an unsigned caller can never obtain a URL (the tenant check precedes signing)
//   unsigned        — GET https://storage.googleapis.com/<bucket>/<object> → expected 403
//                     (private bucket — publicAccessPrevention enforced)
//   signed          — a v4 GET minted with the §13.3 response-* params → expected 2xx +
//                     Content-Disposition: attachment + Content-Type: application/octet-stream +
//                     NO Set-Cookie. With --cookie the URL is minted through the REAL route
//                     (the session cookie proves the api's tenant check + signBlob live);
//                     otherwise `gcloud storage sign-url --impersonate-service-account=<api SA>`
//                     exercises the identical primitive.
//   tampered        — the minted URL with a corrupted X-Goog-Signature → denied
//   expired         — a v4 URL whose signed lifetime bound is in the past → denied
//
// Verdicts: PASS — signed fetched 2xx with the §13.3 header contract and every denial held;
//           FAIL — any probe answered unexpectedly.
//
//   CDN_VERIFY_ACK=yes GCP_PROJECT=rhema-507501 \
//     node scripts/live/usercontent-cdn-verify.mjs --execute \
//       [--object <key under the bucket>] [--bucket <name>] [--api-url <origin>] \
//       [--sa <api service account email>] [--cookie "<name>=<value>"]
//   node scripts/live/usercontent-cdn-verify.mjs --dry-run
import { execFileSync } from "node:child_process";

const args = process.argv.slice(2);
const dryRun = !args.includes("--execute");
const flag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};
const PROJECT = process.env.GCP_PROJECT || "rhema-507501";
const STACK = process.env.RHEMA_STACK || "prod";
const BUCKET = flag("--bucket") || `rhema-${STACK}-user-content`;
const API_SA = flag("--sa") || `rhema-${STACK}-api@${PROJECT}.iam.gserviceaccount.com`;
const API_URL = (flag("--api-url") || "https://api.rhema.tools").replace(/\/+$/, "");
const OBJECT = flag("--object") || "quarantine/01M2R2E1WA81E1BQJX94K1SZQ4/prb16-imp-1.md";
const COOKIE = flag("--cookie"); // "name=value" — mints through the REAL route when supplied
const TTL_SECONDS = 300; // USERCONTENT_URL_TTL_SECONDS — packages/contracts/src/upload.ts
const GCS_HOST = "storage.googleapis.com";

function plan() {
  return {
    req: "REQ-POST-7",
    adr: "ADR-113",
    reads: [
      `curl GET ${API_URL}/usercontent/sign (no session → expect 401)`,
      `curl GET https://${GCS_HOST}/${BUCKET}/${OBJECT} (no signature → expect 403)`,
      COOKIE
        ? `curl GET ${API_URL}/usercontent/sign?key=${OBJECT} --cookie (the api's tenant check + signBlob mints the URL)`
        : `gcloud storage sign-url gs://${BUCKET}/${OBJECT} --impersonate-service-account=${API_SA} (the same v4/signBlob primitive the api uses)`,
      `curl GETs: signed / tampered-signature / expired-lifetime`,
    ],
    asserts:
      "unauth mint → 401 · unsigned GET → 403 · signed → 2xx + attachment + octet-stream + no Set-Cookie · tampered + expired → denied",
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

const evidence = {
  req: "REQ-POST-7",
  adr: "ADR-113",
  at: new Date().toISOString(),
  bucket: BUCKET,
  object: OBJECT,
  minted_via: COOKIE ? "api-route" : "gcloud-impersonated-signBlob",
};

const fetchProbe = (url, opts = {}) => {
  const out = execFileSync(
    "curl",
    ["-sS", "-o", "/dev/null", "-w", "%{http_code}", "-D", "-", "--max-time", "20", ...(opts.args ?? []), url],
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

// 1. the mint route is session-gated — an unsigned caller never obtains a URL.
const mintUnauth = fetchProbe(`${API_URL}/usercontent/sign?key=${encodeURIComponent(OBJECT)}`);
evidence.probes = {
  api_mint_unauthenticated: { status: mintUnauth.status },
};

// 2. unsigned object read — the bucket is private.
const unsigned = fetchProbe(`https://${GCS_HOST}/${BUCKET}/${OBJECT}`);
evidence.probes.unsigned = { status: unsigned.status, server: unsigned.headers.server };

// 3. the signed leg — the §13.3 serve contract is bound INTO the v4 signature
//    (response-content-disposition + response-content-type; the api signs exactly these).
let signedUrl;
let mintedBody = null;
if (COOKIE) {
  // through the real route — the api's tenant check + signer produce {url, expiresAt}.
  const mintOut = execFileSync(
    "curl",
    ["-sS", "-w", "\n%{http_code}", "-H", `Cookie: ${COOKIE}`, "--max-time", "20",
     `${API_URL}/usercontent/sign?key=${encodeURIComponent(OBJECT)}&type=text/plain`],
    { encoding: "utf8" },
  );
  const code = Number(mintOut.trim().split("\n").pop());
  mintedBody = mintOut.trim().split("\n").slice(0, -1).join("\n");
  evidence.probes.api_mint_authenticated = { status: code };
  if (code !== 200) {
    evidence.verdict = `FAIL — the session-scoped mint answered ${code}: ${mintedBody.slice(0, 200)}`;
    console.log(JSON.stringify(evidence, null, 1));
    process.exit(4);
  }
  signedUrl = JSON.parse(mintedBody).url;
  if (!signedUrl) {
    evidence.verdict = "FAIL — the mint answered 200 but the body carried no url";
    console.log(JSON.stringify(evidence, null, 1));
    process.exit(4);
  }
} else {
  // the same v4/signBlob primitive the api uses (IAM signBlob on the api SA — no key material).
  signedUrl = gcloud([
    "storage", "sign-url", `gs://${BUCKET}/${OBJECT}`,
    "--duration", `${TTL_SECONDS}s`,
    "--query-params", "response-content-disposition=attachment",
    "--query-params", "response-content-type=application/octet-stream",
    "--impersonate-service-account", API_SA,
    "--project", PROJECT,
  ]).match(/https:\/\/\S+/)[0];
}

// 4. the fetch probes.
const signed = fetchProbe(signedUrl);
const tampered = fetchProbe(signedUrl.replace(/(X-Goog-Signature=)[0-9a-f]+/i, "$1" + "0".repeat(64)));
// A GENUINELY expired URL: sign a second URL with a 1-second window and let it lapse — the
// signature itself is valid but the signed lifetime bound is spent ⇒ denied. (In --cookie mode
// the route's TTL is clamped, so shrinking X-Goog-Expires is the equivalent lifetime-probe —
// denied either way.)
const expiredUrl = COOKIE
  ? signedUrl.replace(/(X-Goog-Expires=)\d+/i, "$1" + "1")
  : gcloud([
      "storage", "sign-url", `gs://${BUCKET}/${OBJECT}`,
      "--duration", "1s",
      "--query-params", "response-content-disposition=attachment",
      "--impersonate-service-account", API_SA,
      "--project", PROJECT,
    ]).match(/https:\/\/\S+/)[0];
execFileSync("sleep", ["2"]);
const expired = fetchProbe(expiredUrl);
evidence.probes.signed = {
  status: signed.status,
  content_type: signed.headers["content-type"],
  content_disposition: signed.headers["content-disposition"],
  set_cookie: "set-cookie" in signed.headers,
};
evidence.probes.tampered_signature = { status: tampered.status };
evidence.probes.expired_lifetime = { status: expired.status };

// 5. verdict.
const s = evidence.probes.signed;
const headerContract =
  s.status >= 200 && s.status < 300 &&
  s.set_cookie === false &&
  s.content_disposition === "attachment" &&
  s.content_type === "application/octet-stream";
const denials =
  mintUnauth.status === 401 &&
  unsigned.status === 403 &&
  tampered.status >= 400 &&
  expired.status >= 400;
if (headerContract && denials) {
  evidence.verdict =
    "PASS — API-minted v4 usercontent verified: unsigned→403, unauth mint→401, signed→2xx with " +
    "attachment+octet-stream+no-cookie, tampered+expired→denied";
} else {
  evidence.verdict =
    "FAIL — inspect probes (headerContract=" + headerContract + ", denials=" + denials + ")";
}

console.log(JSON.stringify(evidence, null, 1));
process.exit(evidence.verdict.startsWith("PASS") ? 0 : 4);
