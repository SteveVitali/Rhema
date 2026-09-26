// @rhema/egress-proxy — the live HTTP shell: a TypeScript forward proxy (undici), not Envoy (REQ-ARCH-31).
//
// A forward proxy (not a CONNECT tunnel) so the proxy can read response usage and rewrite server-tool bodies —
// exactly why the ticket chose undici over Envoy (per-run policy needs a DB lookup + body rewriting). The
// sandbox points `ANTHROPIC_BASE_URL` at this server; it terminates, runs the pipeline, and forwards to the
// provider over its own TLS. The DB-backed resolver, the Secret Manager key source and the network bind are
// LIVE wiring (needs a GCP deploy — deferred, see DEFERRALS P0.07); the pipeline itself is fully tested in-process.
//
// The server STREAMS the upstream response through to the sandbox incrementally (`streamProxyRequest`,
// D-P0.07-5): the Agent SDK's `stream:true` responses reach it frame-by-frame instead of waiting for the whole
// buffered body (the P0.15e agent→proxy-hang suspect). Metering still folds the COMPLETE response once — and
// commits before the stream's terminal bytes leave (DEF.3 F10), so stream end always implies the meter of
// record; a meter refusal truncates the stream rather than serving an unmetered success (I2).

import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { request as undiciRequest } from "undici";
import {
  streamProxyRequest,
  type Forwarder,
  type HandlerDeps,
  type ProxyRequest,
  type StreamingForwarder,
  type StreamingHandlerDeps,
} from "./handler.js";
import { ReloadableSecretProvider } from "./sinks.js";

/** Normalize undici's response headers (string | string[] | undefined) into a flat record. */
function normalizeUndiciHeaders(raw: Record<string, string | string[] | undefined>): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v === "string") headers[k] = v;
    else if (Array.isArray(v)) headers[k] = v.join(", ");
  }
  return headers;
}

/**
 * A buffered `Forwarder` backed by undici (retained for the buffered `handleProxyRequest` path + tests). Buffers
 * the whole response so the pipeline can read its usage block. The live server uses `undiciStreamForwarder`.
 */
export function undiciForwarder(scheme: "https" | "http" = "https"): Forwarder {
  return async (req) => {
    const res = await undiciRequest(`${scheme}://${req.host}${req.path}`, {
      method: req.method as "GET" | "POST" | "PUT" | "DELETE" | "PATCH",
      headers: { ...req.headers, host: req.host },
      body: req.method === "GET" || req.method === "HEAD" ? undefined : req.body,
    });
    const body = await res.body.text();
    return { status: res.statusCode, headers: normalizeUndiciHeaders(res.headers), body };
  };
}

/**
 * A streaming `StreamingForwarder` backed by undici: forwards the validated, rewritten request to the provider
 * over HTTPS and returns the response as a byte stream (undici's `res.body` is an `AsyncIterable<Buffer>`), so
 * the server can pipe each SSE frame to the sandbox as it arrives (D-P0.07-5).
 */
export function undiciStreamForwarder(scheme: "https" | "http" = "https"): StreamingForwarder {
  return async (req) => {
    const res = await undiciRequest(`${scheme}://${req.host}${req.path}`, {
      method: req.method as "GET" | "POST" | "PUT" | "DELETE" | "PATCH",
      headers: { ...req.headers, host: req.host },
      body: req.method === "GET" || req.method === "HEAD" ? undefined : req.body,
    });
    return { status: res.statusCode, headers: normalizeUndiciHeaders(res.headers), body: res.body };
  };
}

/** Read the full request body as a string (the request — the model's turn — is small; only the response streams). */
function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

export interface ServerOptions extends StreamingHandlerDeps {
  /** The provider host every request is forwarded to (the sandbox reaches only this proxy). */
  readonly providerHost: string;
}

/** A HandlerDeps view (unused by the streaming server; retained so callers may still buffer if they wish). */
export type BufferedServerOptions = HandlerDeps & { readonly providerHost: string };

/**
 * Create the proxy HTTP server. Each request becomes a `ProxyRequest` targeting the provider host (path from the
 * incoming URL) and is streamed through `streamProxyRequest` — the upstream response is piped back frame-by-frame
 * while the full body is metered once after it ends. If the secret provider is a `ReloadableSecretProvider`,
 * SIGHUP re-reads the provider key (REQ-ARCH-30) — a rotated key needs no restart.
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
        await streamProxyRequest(proxyReq, opts, res);
      } catch (err) {
        // Never leak an internal error body to the sandbox; log server-side (stderr) only. If the response has
        // already begun streaming (headers sent), we can only close it — a truncated stream, not a 502.
        console.error("[egress-proxy] request failed:", err);
        if (!res.headersSent) {
          res.writeHead(502, { "content-type": "application/json" });
          res.end(JSON.stringify({ error: { type: "proxy_error", message: "upstream request failed" } }));
        } else if (!res.writableEnded) {
          // the stream had begun but not finished (e.g. an upstream mid-stream error, or a meter refusal
          // with the terminal chunk still withheld — DEF.3 F10); close it — the client sees a truncated
          // stream, never a wrong status. A post-`end()` throw is already finished, so we do nothing
          // (avoid ERR_STREAM_ALREADY_FINISHED).
          res.end();
        }
      }
    })();
  });
}
