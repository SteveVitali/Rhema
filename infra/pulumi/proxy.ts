// The egress-proxy MIG startup script (D-P0.15c-7 re-platform). GCP discontinued the COS
// `gce-container-declaration` container-on-VM path; the supported replacement is a plain COS VM whose
// startup-script pulls + runs the container. This is the pure script builder — a string with no live
// dependency — so it is unit-tested (proxy.test.ts) exactly like the other infra facts, and `compute.ts`
// injects it as the InstanceTemplate's `startup-script` metadata.
//
// The script takes every value from instance metadata (so no secret is baked into the template): the
// digest-pinned image, the DATABASE_URL (a Pulumi secret config), the Anthropic key SECRET NAME (the proxy
// fetches the value from Secret Manager itself via the instance SA), and the port. COS ships Docker and can
// authenticate to Artifact Registry with the instance service account.

/** Build the COS startup script that runs the egress-proxy container from instance metadata. */
export function buildProxyStartupScript(): string {
  return [
    "#!/bin/bash",
    "set -euo pipefail",
    'MD="http://metadata.google.internal/computeMetadata/v1/instance/attributes"',
    'HDR="Metadata-Flavor: Google"',
    'IMAGE=$(curl -s -H "$HDR" "$MD/proxy-image")',
    'DB_URL=$(curl -s -H "$HDR" "$MD/database-url")',
    'KEY_SECRET=$(curl -s -H "$HDR" "$MD/anthropic-key-secret")',
    'PORT=$(curl -s -H "$HDR" "$MD/proxy-port")',
    "# COS: authenticate Docker to Artifact Registry with the instance SA. `docker-credential-gcr configure-docker`",
    "# did NOT attach credentials on this COS image (the regional pull came back 'Unauthenticated request' —",
    "# surfaced live P0.15e), so log in explicitly with the SA's metadata OAuth token (robust + no helper needed).",
    "# The AR host is derived from the digest-pinned image ref so it always matches (regional pkg.dev).",
    "# COS mounts / read-only, so point DOCKER_CONFIG at a writable tmpfs path or `docker login` fails to save",
    "# credentials (mkdir /root/.docker: read-only file system — surfaced live P0.15e).",
    "export DOCKER_CONFIG=/tmp/docker && mkdir -p \"$DOCKER_CONFIG\"",
    'AR_HOST=$(echo "$IMAGE" | cut -d/ -f1)',
    'TOKEN=$(curl -s -H "$HDR" "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token" | sed -n \'s/.*"access_token":"\\([^"]*\\)".*/\\1/p\')',
    'echo "$TOKEN" | docker login -u oauth2accesstoken --password-stdin "https://${AR_HOST}"',
    'docker pull "$IMAGE"',
    "# PUBLISH the port (-p) rather than --network host: on COS the hardened host iptables DROPs inbound to an",
    "# arbitrary host port (only SSH + established are allowed), so --network host leaves 8443 unreachable from",
    "# the sandbox even with the GCP firewall open (surfaced live P0.15e — the MIG health check + the pod SYN",
    "# both timed out). `-p` makes Docker install the DNAT + ACCEPT rules for the published port. The container",
    "# still egresses to the managed Postgres (AlloyDB dev / Cloud SQL prod) + the provider via the bridge (SNAT to the host).",
    "docker rm -f egress-proxy >/dev/null 2>&1 || true",
    'docker run -d --name egress-proxy --restart always -p "${PORT}:${PORT}" \\',
    '  -e DATABASE_URL="$DB_URL" \\',
    '  -e ANTHROPIC_KEY_SECRET="$KEY_SECRET" \\',
    '  -e PORT="$PORT" \\',
    '  "$IMAGE"',
    "",
  ].join("\n");
}
