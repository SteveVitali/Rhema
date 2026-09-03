// @rhema/egress-proxy — the live HTTP shell: a TypeScript forward proxy (undici), not Envoy (REQ-ARCH-31).
//
// A forward proxy (not a CONNECT tunnel) so the proxy can read response usage and rewrite server-tool bodies —
// exactly why the ticket chose undici over Envoy (per-run policy needs a DB lookup + body rewriting). The
// sandbox points `ANTHROPIC_BASE_URL` at this server; it terminates, runs `handleProxyRequest`, and forwards to
// the provider over its own TLS. The DB-backed resolver, the Secret Manager key source and the network bind are
// LIVE wiring (needs a GCP deploy — deferred, see DEFERRALS P0.07); the pipeline itself is fully tested in-process.

import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { request as undiciRequest } from "undici";
import { handleProxyRequest, type Forwarder, type HandlerDeps, type ProxyRequest } from "./handler.js";
import { ReloadableSecretProvider } from "./sinks.js";

/** Response headers the proxy must not pass back verbatim (the Node server re-derives framing). */
const HOP_BY_HOP_RESPONSE = new Set(["transfer-encoding", "connection", "keep-alive", "content-length"]);

/**
 * A Forwarder backed by undici: forwards the validated, rewritten request to the provider over HTTPS. The
 * target host is the run's provider endpoint (the sandbox only ever reaches this proxy). Buffers the response
 * so the pipeline can read its usage block — the proxy is the meter of record, not a passthrough tunnel.
 */
export function undiciForwarder(scheme: "https" | "http" = "https"): Forwarder {
  return async (req) => {
    const res = await undiciRequest(`${scheme}://${req.host}${req.path}`, {
      method: req.method as "GET" | "POST" | "PUT" | "DELETE" | "PATCH",
      headers: { ...req.headers, host: req.host },
      body: req.method === "GET" || req.method === "HEAD" ? undefined : req.body,
    });
    const body = await res.body.text();
    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries(res.headers)) {
      if (typeof v === "string") headers[k] = v;
      else if (Array.isArray(v)) headers[k] = v.join(", ");
    }
    return { status: res.statusCode, headers, body };
  };
}

/** Read the full request body as a string. */
function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

export interface ServerOptions extends HandlerDeps {
  /** The provider host every request is forwarded to (the sandbox reaches only this proxy). */
  readonly providerHost: string;
}

/**
 * Create the proxy HTTP server. Each request becomes a `ProxyRequest` targeting the provider host (path from the
 * incoming URL), runs through `handleProxyRequest`, and the result is written back. If the secret provider is a
 * `ReloadableSecretProvider`, SIGHUP re-reads the provider key (REQ-ARCH-30) — a rotated key needs no restart.
 */
export function createProxyServer(opts: ServerOptions): Server {
  if (opts.secrets instanceof ReloadableSecretProvider) {
    process.on("SIGHUP", () => (opts.secrets as ReloadableSecretProvider).reload());
  }
  return createServer((req: IncomingMessage, res: ServerResponse) => {
    void (async () => {
      try {
        const body = await readBody(req);
        const path = req.url ?? "/";
        const headers: Record<string, string> = {};
        for (const [k, v] of Object.entries(req.headers)) {
          if (typeof v === "string") headers[k] = v;
          else if (Array.isArray(v)) headers[k] = v.join(", ");
        }
        const proxyReq: ProxyRequest = {
          method: req.method ?? "GET",
          host: opts.providerHost,
          path,
          url: `https://${opts.providerHost}${path}`,
          headers,
          body,
        };
        const out = await handleProxyRequest(proxyReq, opts);
        const outHeaders: Record<string, string> = {};
        for (const [k, v] of Object.entries(out.headers)) {
          if (!HOP_BY_HOP_RESPONSE.has(k.toLowerCase())) outHeaders[k] = v;
        }
        res.writeHead(out.status, outHeaders);
        res.end(out.body);
      } catch (err) {
        // Never leak an internal error body to the sandbox; log server-side (stderr) only.
        console.error("[egress-proxy] request failed:", err);
        res.writeHead(502, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: { type: "proxy_error", message: "upstream request failed" } }));
      }
    })();
  });
}
