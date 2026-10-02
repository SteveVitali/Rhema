import { describe, it, expect, afterEach } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { startCredentialInjector, type CredentialInjector } from "./credential-injector.js";
import {
  PHASE_CLASS_HEADER,
  PROXY_CREDENTIAL_HEADER,
  STEP_HEADER,
  injectProxyCredential,
  stampPhaseClass,
  validateProxyRequest,
} from "./proxy-injector.js";

const CREDENTIAL = "cred-per-run-abc";

interface Received {
  method?: string;
  url?: string;
  headers: http.IncomingHttpHeaders;
  body: string;
}

/** A fake egress-proxy: records what it received, then streams an SSE-style body back in two frames. */
function startFakeUpstream(): Promise<{ url: string; received: Received; close(): Promise<void> }> {
  const received: Received = { headers: {}, body: "" };
  const server = http.createServer((req, res) => {
    received.method = req.method;
    received.url = req.url;
    received.headers = req.headers;
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      received.body = Buffer.concat(chunks).toString("utf8");
      res.writeHead(200, { "content-type": "text/event-stream" });
      res.write("data: one\n\n");
      res.write("data: two\n\n");
      res.end();
    });
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const port = (server.address() as AddressInfo).port;
      resolve({
        url: `http://127.0.0.1:${port}`,
        received,
        close: () => new Promise<void>((r) => server.close(() => r())),
      });
    });
  });
}

describe("startCredentialInjector (D-P0.15f-2 — the harness-side credential path)", () => {
  let injector: CredentialInjector | undefined;
  let upstream: Awaited<ReturnType<typeof startFakeUpstream>> | undefined;
  afterEach(async () => {
    await injector?.close();
    await upstream?.close();
    injector = undefined;
    upstream = undefined;
  });

  it("stamps the per-run credential, forwards method+path+body, and streams the response back", async () => {
    upstream = await startFakeUpstream();
    injector = await startCredentialInjector({ credential: CREDENTIAL, upstreamBaseUrl: upstream.url });

    const res = await fetch(`${injector.url}/v1/messages?beta=1`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-custom": "keep-me",
        // the agent's placeholder key rides as x-api-key/authorization; the injector must strip them so they
        // never leave the pod (the proxy authenticates via the injected credential + injects the real key).
        "x-api-key": "sk-ant-placeholder",
        authorization: "Bearer sk-ant-placeholder",
      },
      body: JSON.stringify({ model: "claude-opus-5" }),
    });
    const text = await res.text();

    // the upstream (the egress-proxy stand-in) saw the run credential the AGENT never held:
    expect(upstream.received.headers[PROXY_CREDENTIAL_HEADER]).toBe(CREDENTIAL);
    // method, path (incl. query) and body pass through unchanged; a benign custom header is preserved:
    expect(upstream.received.method).toBe("POST");
    expect(upstream.received.url).toBe("/v1/messages?beta=1");
    expect(upstream.received.body).toBe(JSON.stringify({ model: "claude-opus-5" }));
    expect(upstream.received.headers["x-custom"]).toBe("keep-me");
    // the placeholder auth headers were stripped — they never leave the pod:
    expect(upstream.received.headers["x-api-key"]).toBeUndefined();
    expect(upstream.received.headers["authorization"]).toBeUndefined();
    // the SSE response streams back verbatim:
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/event-stream");
    expect(text).toBe("data: one\n\ndata: two\n\n");
  });

  it("overrides any agent-supplied credential header with the real one (defense-in-depth)", async () => {
    upstream = await startFakeUpstream();
    injector = await startCredentialInjector({ credential: CREDENTIAL, upstreamBaseUrl: upstream.url });
    await fetch(`${injector.url}/v1/messages`, {
      method: "POST",
      headers: { [PROXY_CREDENTIAL_HEADER]: "forged-by-agent" },
      body: "{}",
    });
    expect(upstream.received.headers[PROXY_CREDENTIAL_HEADER]).toBe(CREDENTIAL);
  });

  it("returns 502 (never hangs) when the upstream is unreachable", async () => {
    // point at a closed port — no upstream listening.
    injector = await startCredentialInjector({ credential: CREDENTIAL, upstreamBaseUrl: "http://127.0.0.1:1" });
    const res = await fetch(`${injector.url}/v1/messages`, { method: "POST", body: "{}" });
    expect(res.status).toBe(502);
  });

  it("RES.1 — stamps the live phase class per request and drops any agent-supplied copy", async () => {
    upstream = await startFakeUpstream();
    let phaseClass: string | undefined = "judge";
    injector = await startCredentialInjector({
      credential: CREDENTIAL,
      upstreamBaseUrl: upstream.url,
      phaseClass: () => phaseClass,
    });

    // a judge-phase request carries `judge`; the agent's own forged stamp is replaced, never trusted.
    await fetch(`${injector.url}/v1/messages`, {
      method: "POST",
      headers: { [PHASE_CLASS_HEADER]: "research" }, // the agent claiming research class
      body: "{}",
    });
    expect(upstream.received.headers[PHASE_CLASS_HEADER]).toBe("judge");

    // the phase boundary: the harness flips the class and the NEXT request carries it live.
    phaseClass = "research";
    await fetch(`${injector.url}/v1/messages`, { method: "POST", body: "{}" });
    expect(upstream.received.headers[PHASE_CLASS_HEADER]).toBe("research");

    // no stamp configured → the header is absent (the proxy reads absent as not floor-eligible).
    phaseClass = undefined;
    await fetch(`${injector.url}/v1/messages`, { method: "POST", body: "{}" });
    expect(upstream.received.headers[PHASE_CLASS_HEADER]).toBeUndefined();
  });

  it("RPT.1 — stamps `x-rhema-step: step:<key>` per request and drops any agent-supplied copy", async () => {
    upstream = await startFakeUpstream();
    let stepKey: string | undefined = "checking_claims";
    injector = await startCredentialInjector({
      credential: CREDENTIAL,
      upstreamBaseUrl: upstream.url,
      stepKey: () => stepKey,
    });

    // the agent's forged step attribution is replaced, never trusted (misattribution would corrupt the
    // Level-4 drill-down the report builds on `usage_records.step_id`).
    await fetch(`${injector.url}/v1/messages`, {
      method: "POST",
      headers: { [STEP_HEADER]: "step:editors_letter" }, // the agent claiming a different phase
      body: "{}",
    });
    expect(upstream.received.headers[STEP_HEADER]).toBe("step:checking_claims");

    // the phase boundary flips the stamp live on the NEXT request.
    stepKey = "editors_letter";
    await fetch(`${injector.url}/v1/messages`, { method: "POST", body: "{}" });
    expect(upstream.received.headers[STEP_HEADER]).toBe("step:editors_letter");

    // no step bound → the header is absent (usage rows land unattributed rather than misattributed).
    stepKey = undefined;
    await fetch(`${injector.url}/v1/messages`, { method: "POST", body: "{}" });
    expect(upstream.received.headers[STEP_HEADER]).toBeUndefined();
  });
});

describe("the boundary the injector satisfies (REQ-SPEC-11 reference rule)", () => {
  const allowlist = { hosts: ["api.anthropic.com"] };
  it("a credential-less request (a shell escape straight to the egress-proxy) is 403 egress.denied", () => {
    const v = validateProxyRequest({ headers: {}, host: "api.anthropic.com", expectedCredential: CREDENTIAL, allowlist });
    expect(v.ok).toBe(false);
    expect(v.status).toBe(403);
  });
  it("the injector-stamped request is admitted", () => {
    const headers = injectProxyCredential({}, CREDENTIAL);
    const v = validateProxyRequest({ headers, host: "api.anthropic.com", expectedCredential: CREDENTIAL, allowlist });
    expect(v.ok).toBe(true);
  });
  it("stampPhaseClass overwrites a forged header (any casing) and omits it when undefined", () => {
    const stamped = stampPhaseClass({ "X-Rhema-Phase-Class": "research", "x-keep": "1" }, "judge");
    expect(stamped[PHASE_CLASS_HEADER]).toBe("judge");
    expect(Object.keys(stamped).filter((k) => k.toLowerCase() === PHASE_CLASS_HEADER)).toHaveLength(1);
    expect(stamped["x-keep"]).toBe("1");
    expect(stampPhaseClass({ "x-keep": "1" }, undefined)[PHASE_CLASS_HEADER]).toBeUndefined();
  });
});
