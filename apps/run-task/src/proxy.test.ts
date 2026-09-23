import { describe, it, expect, afterEach } from "vitest";
import { createServer, type Server } from "node:http";
import { buildAgentEnv } from "@rhema/engine";
import {
  injectProxyCredential,
  validateProxyRequest,
  PROXY_CREDENTIAL_HEADER,
} from "./proxy-injector.js";

// AC2 — a shell escape (`node -e` HTTP call) from uid `agent` reaches NEITHER the internal API (no token)
// NOR the provider (the proxy refuses a credential-less request). We prove it against real stub servers: the
// proxy uses the reference `validateProxyRequest`; the internal API requires a bearer token. The escaped
// agent's env (buildAgentEnv) carries neither the credential nor the token, so both requests are refused —
// only the harness-side injector can present the credential.

const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => new Promise<void>((r) => s.close(() => r()))));
});

const CREDENTIAL = "run-cred-abc";
const ALLOWLIST = { hosts: ["api.anthropic.internal"] };

/** A stub egress proxy enforcing the REQ-SPEC-11 rule. */
function startStubProxy(): Promise<string> {
  const server = createServer((req, res) => {
    const v = validateProxyRequest({
      headers: { [PROXY_CREDENTIAL_HEADER]: (req.headers[PROXY_CREDENTIAL_HEADER] as string) ?? "" },
      host: "api.anthropic.internal",
      expectedCredential: CREDENTIAL,
      allowlist: ALLOWLIST,
    });
    res.statusCode = v.status;
    res.end(v.reason ?? "ok");
  });
  servers.push(server);
  return listen(server);
}

/** A stub internal API requiring a bearer run token. */
function startStubInternalApi(): Promise<string> {
  const server = createServer((req, res) => {
    const auth = req.headers.authorization;
    res.statusCode = auth && auth.startsWith("Bearer ") ? 200 : 401;
    res.end(res.statusCode === 200 ? "ok" : "unauthorized");
  });
  servers.push(server);
  return listen(server);
}

function listen(server: Server): Promise<string> {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      resolve(`http://127.0.0.1:${port}`);
    });
  });
}

/** Simulate a `node -e` shell escape: it can use only the scrubbed agent env (no secrets). */
function escapedAgentEnv(): Record<string, string> {
  return buildAgentEnv({
    runId: "run_1",
    proxyBaseUrl: "http://proxy.internal",
    configDir: "/work/.config",
    maxConcurrentSubagents: 5,
  });
}

describe("AC2 — shell escape reaches neither the provider nor the internal API", () => {
  it("the escaped agent env carries no proxy credential and no run token", () => {
    const env = escapedAgentEnv();
    expect(env[PROXY_CREDENTIAL_HEADER]).toBeUndefined();
    expect(env.PROXY_CREDENTIAL).toBeUndefined();
    expect(env.RUN_TOKEN).toBeUndefined();
    expect(env.API_INTERNAL_URL).toBeUndefined();
  });

  it("the proxy refuses a credential-less request from the escaped agent (403)", async () => {
    const proxyUrl = await startStubProxy();
    // the escape has no credential to present (it is not in its env):
    const res = await fetch(proxyUrl, { headers: {} });
    expect(res.status).toBe(403);
    expect(await res.text()).toMatch(/missing proxy credential/);
  });

  it("the proxy refuses a request bearing a WRONG credential (403)", async () => {
    const proxyUrl = await startStubProxy();
    const res = await fetch(proxyUrl, { headers: { [PROXY_CREDENTIAL_HEADER]: "guessed" } });
    expect(res.status).toBe(403);
  });

  it("only the harness-injected request is served (200)", async () => {
    const proxyUrl = await startStubProxy();
    const headers = injectProxyCredential({}, CREDENTIAL); // harness-side wrapper
    const res = await fetch(proxyUrl, { headers });
    expect(res.status).toBe(200);
  });

  it("the internal API refuses the escaped agent (no bearer token → 401)", async () => {
    const apiUrl = await startStubInternalApi();
    const res = await fetch(`${apiUrl}/internal/runs/run_1/heartbeat`, { method: "PUT" });
    expect(res.status).toBe(401);
  });
});

describe("validateProxyRequest (REQ-SPEC-11 reference rule)", () => {
  it("refuses an off-allowlist host even WITH the right credential", () => {
    const v = validateProxyRequest({
      headers: { [PROXY_CREDENTIAL_HEADER]: CREDENTIAL },
      host: "attacker.example",
      expectedCredential: CREDENTIAL,
      allowlist: ALLOWLIST,
    });
    expect(v.ok).toBe(false);
    expect(v.status).toBe(403);
    expect(v.reason).toMatch(/not on the run allowlist/);
  });
});
