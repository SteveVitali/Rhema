import { describe, it, expect } from "vitest";
import { buildProxyStartupScript } from "./proxy.js";

// The egress-proxy MIG re-platform (D-P0.15c-7): the pure startup-script config, unit-tested like the other
// infra facts. It must run the digest image with a supported pattern (a startup-script `docker run`, NOT the
// discontinued COS container-declaration), taking image + config from metadata and passing the three env vars.
describe("buildProxyStartupScript (D-P0.15c-7)", () => {
  const script = buildProxyStartupScript();

  it("reads the image + config from instance metadata (no secret baked into the template)", () => {
    expect(script).toContain("computeMetadata/v1/instance/attributes");
    expect(script).toContain("$MD/proxy-image");
    expect(script).toContain("$MD/database-url");
    expect(script).toContain("$MD/anthropic-key-secret");
    expect(script).toContain("$MD/proxy-port");
    expect(script).toContain("Metadata-Flavor: Google");
  });

  it("pulls + docker-runs the image with the proxy's three env vars, restarting on crash", () => {
    expect(script).toContain('docker pull "$IMAGE"');
    expect(script).toContain("docker run -d");
    expect(script).toContain("--restart always");
    expect(script).toContain('-e DATABASE_URL="$DB_URL"');
    expect(script).toContain('-e ANTHROPIC_KEY_SECRET="$KEY_SECRET"');
    expect(script).toContain('-e PORT="$PORT"');
    // authenticates docker to Artifact Registry with the instance SA (no baked key).
    expect(script).toContain("configure-docker");
  });

  it("does NOT use the discontinued COS container-declaration path", () => {
    expect(script).not.toContain("gce-container-declaration");
    expect(script.startsWith("#!/bin/bash")).toBe(true);
  });
});
