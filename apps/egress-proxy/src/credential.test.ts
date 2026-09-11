import { describe, expect, it } from "vitest";
import {
  AGENT_ID_HEADER,
  buildUpstreamHeaders,
  isEndpointAllowed,
  isModelAllowed,
  PROXY_CREDENTIAL_HEADER,
  presentedAgentId,
  presentedCredential,
  stripSandboxAuth,
} from "./credential.js";

describe("credential + header scrub", () => {
  it("reads the presented credential + agent id (case-insensitive)", () => {
    const headers = { [PROXY_CREDENTIAL_HEADER]: "cred-abc", [AGENT_ID_HEADER]: "editor" };
    expect(presentedCredential(headers)).toBe("cred-abc");
    expect(presentedAgentId(headers)).toBe("editor");
    expect(presentedCredential({ "X-Rhema-Proxy-Credential": "up" })).toBe("up");
    expect(presentedCredential({})).toBeUndefined();
  });

  it("strips the sandbox's Authorization and x-api-key (AC5)", () => {
    const scrubbed = stripSandboxAuth({
      authorization: "Bearer sandbox-token",
      "x-api-key": "sk-sandbox",
      "content-type": "application/json",
    });
    expect(scrubbed["authorization"]).toBeUndefined();
    expect(scrubbed["x-api-key"]).toBeUndefined();
    expect(scrubbed["content-type"]).toBe("application/json");
  });

  it("builds upstream headers: drops sandbox creds + proxy internals + hop-by-hop, injects the provider key (AC5)", () => {
    const upstream = buildUpstreamHeaders(
      {
        authorization: "Bearer sandbox-token",
        "x-api-key": "sk-sandbox",
        [PROXY_CREDENTIAL_HEADER]: "cred-abc",
        [AGENT_ID_HEADER]: "editor",
        cookie: "session=1",
        host: "proxy.internal",
        "content-length": "42",
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      "sk-PROVIDER",
    );
    // The only key that reaches the provider is the injected one.
    expect(upstream["x-api-key"]).toBe("sk-PROVIDER");
    expect(upstream["authorization"]).toBeUndefined();
    expect(upstream[PROXY_CREDENTIAL_HEADER]).toBeUndefined();
    expect(upstream[AGENT_ID_HEADER]).toBeUndefined();
    expect(upstream["cookie"]).toBeUndefined();
    expect(upstream["host"]).toBeUndefined();
    expect(upstream["content-length"]).toBeUndefined();
    // Legitimate headers pass through.
    expect(upstream["anthropic-version"]).toBe("2023-06-01");
    expect(upstream["content-type"]).toBe("application/json");
  });
});

describe("allowlist checks (AC1)", () => {
  const allowlist = {
    endpoints: [{ host: "api.anthropic.com", pathPrefix: "/v1/messages" }],
    models: ["claude-sonnet-5", "claude-opus-5"],
  };

  it("allows an on-allowlist host + path prefix", () => {
    expect(isEndpointAllowed(allowlist, "api.anthropic.com", "/v1/messages")).toBe(true);
    expect(isEndpointAllowed(allowlist, "API.ANTHROPIC.COM", "/v1/messages?beta=1")).toBe(true);
  });

  it("refuses an off-allowlist host or path (403 endpoint)", () => {
    expect(isEndpointAllowed(allowlist, "evil.example", "/v1/messages")).toBe(false);
    expect(isEndpointAllowed(allowlist, "api.anthropic.com", "/v1/models")).toBe(false);
  });

  it("refuses an off-allowlist or empty model (403 model)", () => {
    expect(isModelAllowed(allowlist, "claude-sonnet-5")).toBe(true);
    expect(isModelAllowed(allowlist, "claude-fable-5-1")).toBe(false);
    expect(isModelAllowed(allowlist, undefined)).toBe(false);
    expect(isModelAllowed(allowlist, "")).toBe(false);
  });
});
