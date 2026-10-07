// SEC.2 (ADR-040) — the throttle's client-IP derivation. Two rules, both load-bearing:
//
// 1. XFF is read as the PENULTIMATE hop, not the first. On the GCP external HTTPS LB the chain is
//    `<caller-supplied…>, <real client>, <lb frontend>` — the load balancer APPENDS the real client +
//    itself, so the second-to-last value is the LB-attested client. The first hop is caller-controlled
//    and must never key a security counter (it was the pre-SEC.2 bug: a forged first hop reset the
//    bucket). The rule holds only on surfaces reachable solely through the LB — both services pin
//    `INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER` on prod so the premise is infrastructural, not assumed.
//    A single-hop chain (no proxy appended anything) is the only caller claim available — it is used,
//    since refusing it would bucket every headerless caller together anyway.
//
// 2. `x-rhema-client-ip` + `x-rhema-internal-token`: the web service's server-side calls carry the real
//    client IP on `x-rhema-client-ip`, authenticated by a Google-signed OIDC ID token on
//    `x-rhema-internal-token` (audience = the api origin, `email` = the web service account — minted
//    ambiently from the metadata server, so no secret ever reaches web). The api trusts the stamped IP
//    ONLY when the token verifies; anything else falls back to rule 1. A direct caller can forge the
//    headers but not the token — the channel is unforgeable by construction.

/** The web→api internal-call headers (SEC.2, ADR-040). */
export const INTERNAL_CLIENT_IP_HEADER = "x-rhema-client-ip";
export const INTERNAL_IDENTITY_HEADER = "x-rhema-internal-token";

/**
 * The LB-attested client IP: the penultimate XFF hop (the hop the load balancer appended). A chain
 * with a single hop is used as-is (nothing appended — the caller's own claim is all there is);
 * absent ⇒ the shared `"unknown"` bucket, same as before.
 */
export function forwardedClientIp(xForwardedFor: string | undefined): string {
  const hops = (xForwardedFor ?? "")
    .split(",")
    .map((h) => h.trim())
    .filter(Boolean);
  if (hops.length === 0) return "unknown";
  return hops.length === 1 ? hops[0]! : hops[hops.length - 2]!;
}

/** Verifies an `x-rhema-internal-token` OIDC token (the api's live impl is a JWKS/JWT verify). */
export type InternalCallerVerify = (token: string) => Promise<boolean>;

/**
 * Resolve the throttle's client-IP key for one request: the stamped `x-rhema-client-ip` when the
 * accompanying internal token verifies; otherwise the penultimate XFF hop. A present-but-invalid
 * token is ignored (never fails closed — an expired token must not break signups), and a stamped IP
 * without a token is just another caller-supplied header — ignored.
 */
export async function resolveClientIp(
  headers: Pick<Headers, "get">,
  verify?: InternalCallerVerify,
): Promise<string> {
  const token = headers.get(INTERNAL_IDENTITY_HEADER)?.trim();
  const stamped = headers.get(INTERNAL_CLIENT_IP_HEADER)?.trim();
  if (token && stamped && verify) {
    try {
      if (await verify(token)) return stamped;
    } catch {
      // verifier failure (e.g. JWKS unreachable) ⇒ untrusted — fall through to the XFF rule.
    }
  }
  return forwardedClientIp(headers.get("x-forwarded-for") ?? undefined);
}
