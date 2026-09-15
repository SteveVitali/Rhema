import { request, Agent } from "undici";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import type { Forwarder } from "./fetch-guarded.js";
import type { DnsResolver } from "./ssrf.js";

// The live outbound seam. undici with `maxRedirections: 0` so OUR guard follows redirects (re-resolving +
// re-checking each hop), never undici's auto-follow. The fetcher parses nothing — it hands back the raw body.

function lowerHeaders(raw: Record<string, string | string[] | undefined>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (v == null) continue;
    out[k.toLowerCase()] = Array.isArray(v) ? v.join(", ") : v;
  }
  return out;
}

export const undiciForwarder: Forwarder = async (url, opts) => {
  // Pin the connect to the guard's validated IP via a custom lookup, so undici cannot re-resolve the host to a
  // different (private) address between the check and the connect (TOCTOU). TLS SNI/cert stay the hostname.
  const family = isIP(opts.pinnedIp);
  const dispatcher = new Agent({
    connect: {
      lookup: (_hostname, _options, cb) =>
        cb(null, [{ address: opts.pinnedIp, family: family === 6 ? 6 : 4 }]),
    },
  });
  // undici's request does NOT auto-follow redirects (no maxRedirections ⇒ 0); our guard follows them itself,
  // re-resolving + re-checking each hop.
  const res = await request(url, {
    method: opts.method,
    headers: opts.headers,
    signal: opts.signal,
    dispatcher,
  });
  // Free the pinned-connect Agent once the body is done (drained, closed, or errored).
  res.body.once("close", () => void dispatcher.close().catch(() => {}));
  return {
    status: res.statusCode,
    headers: lowerHeaders(res.headers),
    body: res.body,
  };
};

/** Resolve every A/AAAA address for a host (used by the SSRF host check). */
export const dnsResolver: DnsResolver = async (host) => {
  const results = await lookup(host, { all: true });
  return results.map((r) => r.address);
};
