import { describe, it, expect, afterEach } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { startCredentialInjector, type CredentialInjector } from "./credential-injector.js";
import { PROXY_CREDENTIAL_HEADER, injectProxyCredential, validateProxyRequest } from "./proxy-injector.js";

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
      headers: { "content-type": "application/json", "x-custom": "keep-me" },
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
});
