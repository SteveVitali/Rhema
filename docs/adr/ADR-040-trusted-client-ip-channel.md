# ADR-040: The client-IP key is the LB-attested penultimate XFF hop, or the web's OIDC-stamped `x-rhema-client-ip` — never the caller-controlled first hop

- **Status:** Accepted
- **Date:** 2026-10-02
- **Ticket:** SEC.2
- **Requirement ids:** REQ-BETA-19, REQ-GROWTH-15, REQ-ARCH-30 (no secret reaches web)
- **Spec:** §13.3, §15.3
- **Consumes:** nothing deferred — but it is the fix for the forged-first-hop defect SEC.2 names

## Context

Two facts made the old derivation untrustworthy:

1. **`clientIp` read the FIRST `x-forwarded-for` hop** — pure caller claim. A forged first hop
   reset the throttle bucket per request (unlimited attempts from one client).
2. **Web-mediated calls collapse the bucket.** `POST /signup` and the auth sends arrive at the api
   from the *web service's* egress — without a trusted channel the api either buckets every web
   user together (one user rate-limits the world) or trusts a header any direct caller can forge.

The GCP external HTTPS LB gives us the premise for the direct-caller half: it appends
`<real client>, <lb frontend>` to whatever XFF the caller supplied, so the **penultimate** hop is
always the LB-attested client. That premise is only true on surfaces reachable *solely* through
the LB — a direct `run.app` hit appends nothing trustworthy.

## Decision

- **`resolveClientIp` (contracts):** trust `x-rhema-client-ip` only when the accompanying
  `x-rhema-internal-token` verifies; otherwise take the **penultimate** XFF hop (single hop ⇒ used
  as-is; absent ⇒ the shared `unknown` bucket). An invalid/absent token never fails closed — it
  just falls back to the XFF rule.
- **The stamp is a Google OIDC ID token, not a secret.** Web mints it ambiently from the Cloud Run
  metadata server (`audience` = `INTERNAL_AUTH_AUDIENCE` = the api origin — the REQ-ARCH-30
  sweep forbids *any* secret env on web, so the credential had to be the service's own identity).
  The api verifies offline: RS256 against Google's JWKS (cached 6h, kid-miss refetches once),
  `iss ∈ accounts.google.com`, `aud` = the configured audience, `exp` live, and `email` = the web
  runtime SA (`INTERNAL_CALLER_SA` — plain deploy config, not a secret). Any failure resolves
  `false` — never throws into the request path.
- **Web's minter** (`internal-token.ts`) caches to `exp−60s`, negative-caches a miss for 60s, and
  times out at 2s — a metadata outage degrades to the XFF rule, it never stalls a request.
- **The proxy re-stamps, never relays.** `authProxy` strips inbound `x-rhema-client-ip` /
  `x-rhema-internal-token` (a browser can send them — they're meaningless without a valid token,
  but the relay doesn't forward claims it didn't make) and stamps the *resolved* browser IP
  itself, so the OAuth callback and magic-link verify legs key the real caller too.
- **Prod web ingress tightens to `INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER`** (api already was) so
  the penultimate-hop premise is infrastructural — direct run.app hits, where the rule's premise
  fails, are unreachable. Non-prod keeps `ALL` (no LB in front there; the stamp is the channel
  anyway, and dev posture accepts the weaker rule).

## Consequences

- **Positive:** a forged first hop provably cannot move the bucket (tests: rotating forged hops
  stay in one bucket; two distinct stamped IPs bucket independently). The trusted channel needs
  zero secrets — nothing to store, rotate, or leak on web.
- **Negative / accepted:** the api depends on Google's JWKS being fetchable for the stamped path
  (a JWKS outage degrades to penultimate-XFF — still correct, just web-mediated callers share the
  web egress... no: the XFF the api sees on web→api calls is still the GCP-attested chain, so
  fallback buckets web-mediated calls on the *web instance's* IP — degraded but finite, and the
  same collapse the old code had permanently). Prod web is unreachable except via the LB — any
  ops/debug flow that hit run.app directly must go through the LB or IAP now.

## Alternatives considered

| Option | Why it lost |
|---|---|
| Shared secret header on web | REQ-ARCH-30's secrets sweep forbids *any* secretKeyRef/plaintext secret env on web — and a copied secret is one leak away from a forged-everything channel. The OIDC token is the service identity itself: ambient, rotating, audience-bound. |
| Keep trusting first-hop XFF | The defect SEC.2 exists to fix. |
| API reads a web-attested JWT it mints itself (Macaroons-style) | Inverts the direction — web can't mint, so the api would have to issue per-request credentials to web; strictly more machinery than the metadata server gives for free. |
| Trust `X-Cloud-Trace-Context`/other GCP headers | Those attest trace identity, not caller identity; none carry the client IP. |

## Revisit trigger

Reopen if a second first-party caller needs the channel (the `INTERNAL_CALLER_SA` pin assumes one
caller), if web moves off Cloud Run (metadata mint is the mechanism), or if GCP's XFF semantics
change (the penultimate rule is a platform invariant, not a universal one — non-GCP deployments
must re-derive it).
