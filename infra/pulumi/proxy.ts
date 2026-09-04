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
    "# COS: authenticate Docker to Artifact Registry / GCR with the instance service account.",
    "docker-credential-gcr configure-docker --registries=us-docker.pkg.dev,gcr.io >/dev/null 2>&1 || true",
    'docker pull "$IMAGE"',
    "# Run the proxy on the host network so the sandbox reaches it on the instance IP at $PORT. It restarts",
    "# on crash/reboot; DATABASE_URL + the key SECRET NAME come in as env (the proxy reads the key from SM).",
    "docker rm -f egress-proxy >/dev/null 2>&1 || true",
    "docker run -d --name egress-proxy --restart always --network host \\",
    '  -e DATABASE_URL="$DB_URL" \\',
    '  -e ANTHROPIC_KEY_SECRET="$KEY_SECRET" \\',
    '  -e PORT="$PORT" \\',
    '  "$IMAGE"',
    "",
  ].join("\n");
}
