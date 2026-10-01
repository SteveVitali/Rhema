// @rhema/run-task — the harness-side per-request proxy-credential injector (D-P0.15f-2; REQ-SPEC-11; §12.4
// step 4, §12.7).
//
// The two-uid boundary forbids the agent (uid `agent`, scrubbed env) from ever holding the per-run proxy
// credential (`scrubbed-env.ts` — REQ-SPEC-10). But the egress-proxy serves the provider key ONLY for requests
// carrying that credential (`x-rhema-proxy-credential`). This module bridges the two: a small streaming reverse
// proxy that runs IN THE HARNESS PROCESS (uid `harness`, the sole credential holder), listening on loopback. The
// harness points the agent's `ANTHROPIC_BASE_URL` at THIS injector (not the egress-proxy directly); the injector
// stamps the credential (`injectProxyCredential`) onto every request and forwards it to the egress-proxy
// upstream. A shell escape from uid `agent` that calls the egress-proxy directly has no credential → the proxy
// 403s it (`egress.denied`, `validateProxyRequest`); calling the injector on loopback is the only credentialed
// path, and the injector is a different process/uid the agent cannot read the credential out of.
//
// Streaming is load-bearing: the SDK's inference responses are SSE, so the injector must pipe request and
// response bodies through WITHOUT buffering (frame-by-frame) — it uses node's `http(s).request` pipe, not a
// buffer-then-forward. It is unit-tested against a fake upstream (header stamped, method/path/body forwarded,
// response streamed).

import http from "node:http";
import https from "node:https";
import type { AddressInfo } from "node:net";
import { PHASE_CLASS_HEADER, PROXY_CREDENTIAL_HEADER } from "./proxy-injector.js";

/** Request headers the injector must not forward verbatim: `host` is re-derived from the upstream URL; the
 *  credential slot is stamped by us; the rest are per-connection hop-by-hop headers (RFC 7230 §6.1) plus the
 *  body-framing headers — dropping `content-length`/`transfer-encoding` lets node re-derive framing from the
 *  piped stream (no double-framing). All lowercase (node lowercases incoming header names). */
const DROP_REQUEST_HEADERS = new Set<string>([
  "host",
  "connection",
  "keep-alive",
  "proxy-authorization",
  "proxy-connection",
  "upgrade",
  "te",
  "trailer",
  "transfer-encoding",
  "content-length",
  PROXY_CREDENTIAL_HEADER, // never trust an agent-supplied credential header — we stamp the real one
  // RES.1 (REQ-SPEC-31(2)): the research floor stamp is harness truth — an agent-supplied phase class
  // would let a non-research phase pose as `research` and drain the reserved verification share.
  PHASE_CLASS_HEADER,
  // the agent's env carries a NON-SECRET placeholder ANTHROPIC_API_KEY so the CLI runs (D-P0.06-1); strip the
  // resulting x-api-key/authorization here so it never leaves the pod — the egress-proxy authenticates via the
  // injected credential and injects the REAL provider key itself (defense-in-depth; the proxy also strips these).
  "authorization",
  "x-api-key",
]);

/** Response headers the injector must not forward verbatim: the per-connection hop-by-hop + body-framing set.
 *  node re-derives framing when we `pipe` the body, so copying the upstream's `content-length`/`transfer-encoding`
 *  through could mis-frame. Kept symmetric with the request side. All lowercase. */
const DROP_RESPONSE_HEADERS = new Set<string>([
  "connection",
  "keep-alive",
  "proxy-connection",
  "transfer-encoding",
  "content-length",
  "upgrade",
  "te",
  "trailer",
]);

/** Copy the upstream response headers minus the hop-by-hop/framing set (symmetric with the request side). */
function filterResponseHeaders(headers: http.IncomingHttpHeaders): http.OutgoingHttpHeaders {
  const out: http.OutgoingHttpHeaders = {};
  for (const [k, v] of Object.entries(headers)) {
    if (v === undefined) continue;
    if (DROP_RESPONSE_HEADERS.has(k.toLowerCase())) continue;
    out[k] = v;
  }
  return out;
}

export interface CredentialInjector {
  /** the loopback base URL the harness sets as the agent's `ANTHROPIC_BASE_URL` (e.g. `http://127.0.0.1:PORT`). */
  readonly url: string;
  /** stop listening (called when the run ends). */
  close(): Promise<void>;
}

export interface StartInjectorArgs {
  /** the per-run proxy credential (the harness reads it from `PROXY_CREDENTIAL_FILE`; NEVER in the agent env). */
  readonly credential: string;
  /** the egress-proxy base URL — the injector's upstream (the run's real `ANTHROPIC_BASE_URL`). */
  readonly upstreamBaseUrl: string;
  /**
   * RES.1 (REQ-SPEC-31(2)) — the current phase's manifest `phaseClass`, read per request. The harness
   * updates it at each phase boundary; the injector stamps it as `x-rhema-phase-class` so the proxy can
   * reserve the verification floor for research-class traffic only. Omit ⇒ no stamp (safe default).
   */
  readonly phaseClass?: () => string | undefined;
  /** loopback bind host (default `127.0.0.1`) + port (default `0` → an ephemeral free port). */
  readonly host?: string;
  readonly port?: number;
}

/** Build the forwarded request headers: copy the agent's, drop the un-forwardable set, stamp the credential. */
function buildForwardHeaders(
  incoming: http.IncomingHttpHeaders,
  credential: string,
  phaseClass: string | undefined,
): http.OutgoingHttpHeaders {
  const out: http.OutgoingHttpHeaders = {};
  for (const [k, v] of Object.entries(incoming)) {
    if (v === undefined) continue;
    if (DROP_REQUEST_HEADERS.has(k.toLowerCase())) continue;
    out[k] = v;
  }
  out[PROXY_CREDENTIAL_HEADER] = credential; // the harness's credential — the agent never held it
  if (phaseClass !== undefined) out[PHASE_CLASS_HEADER] = phaseClass; // RES.1 — harness truth, never the agent's
  return out;
}

/**
 * Start the harness-side credential injector. Resolves once it is listening; the returned `url` is the loopback
 * base the agent's `ANTHROPIC_BASE_URL` must point at.
 */
export async function startCredentialInjector(args: StartInjectorArgs): Promise<CredentialInjector> {
  const upstream = new URL(args.upstreamBaseUrl);
  const upstreamIsHttps = upstream.protocol === "https:";
  const requester = upstreamIsHttps ? https.request : http.request;

  const server = http.createServer((clientReq, clientRes) => {
    // Resolve the upstream target's path+query. `clientReq.url` is origin-form (e.g. `/v1/messages?…`); resolving
    // it against `upstream` yields the absolute path (an origin-form absolute path replaces any base path — the
    // egress-proxy base has none, so this is exactly the agent's path).
    const target = new URL(clientReq.url ?? "/", upstream);
    const upstreamReq = requester(
      {
        protocol: upstream.protocol,
        hostname: upstream.hostname,
        port: upstream.port || (upstreamIsHttps ? 443 : 80),
        method: clientReq.method,
        path: `${target.pathname}${target.search}`,
        headers: buildForwardHeaders(clientReq.headers, args.credential, args.phaseClass?.()),
      },
      (upstreamRes) => {
        // stream the response back (status + filtered headers + body) — SSE frames pass through incrementally.
        clientRes.writeHead(upstreamRes.statusCode ?? 502, filterResponseHeaders(upstreamRes.headers));
        upstreamRes.pipe(clientRes);
        // an upstream reset AFTER headers are sent cannot become a 502 (already committed) — tear the client
        // stream down so the agent sees a broken stream, never a silent hang.
        upstreamRes.on("error", () => clientRes.destroy());
      },
    );
    upstreamReq.on("error", (err) => {
      // an upstream connection failure surfaces to the agent as a 502 (never a hang); the harness logs it.
      if (!clientRes.headersSent) clientRes.writeHead(502, { "content-type": "text/plain" });
      clientRes.end(`injector: upstream request failed: ${err.message}`);
    });
    clientReq.on("error", () => upstreamReq.destroy());
    clientReq.pipe(upstreamReq); // stream the request body through (no buffering)
  });

  const host = args.host ?? "127.0.0.1";
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(args.port ?? 0, host, () => {
      server.removeListener("error", reject);
      resolve();
    });
  });
  const addr = server.address() as AddressInfo;
  const url = `http://${host}:${addr.port}`;

  return {
    url,
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
      }),
  };
}
