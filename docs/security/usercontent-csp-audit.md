# User-content origin + CSP audit (P1.22 W4; REQ-ARCH-24 amended; §13.3)

Written down, then asserted. Executable leg: `packages/security-checks/src/usercontent-csp.test.ts`.

## The origins

| Origin | Serves | Cookies |
|---|---|---|
| `rhema.tools` (web) | the SSR app | `__Host-` auth cookies |
| `api.rhema.tools` (api) | JSON surface | `__Host-` auth cookies |
| `usercontent.rhema.tools` (+ `*.usercontent.rhema.tools`) | user-content GCS bucket objects | **none — ever** |

The user-content host is a **sibling subdomain** of the app zone — the isolation is not a registrable-
domain gap, it's a cookie-shape contract:

1. The user-content origin emits **no `Set-Cookie` on any response** (`USERCONTENT_ORIGIN.setsCookies ===
   false`; asserted across every content type, rendered or not).
2. Every auth cookie is a host-only `__Host-` cookie — `Secure`, `Path=/`, `HttpOnly`, **no `Domain=`**
   attribute — so a sibling subdomain can neither receive nor shadow it. A planted same-named
   `Domain=rhema.tools` cookie is rejected by the browser's `__Host-` rules; the audit re-asserts the rule
   itself (the plant fails the contract) plus every cookie the real auth flow emits.

## The serving policy (`apps/convert/src/serving.ts`)

- **Rendered inline:** `image/png`, `image/jpeg`, `image/gif`, `image/webp` — the closed allowlist.
- **Everything else** (`text/html`, `image/svg+xml`, `application/javascript`, `application/pdf`,
  `text/plain`, unknown/empty): `Content-Type: application/octet-stream` + `Content-Disposition:
  attachment` — a download, never a render, regardless of sniffing (`X-Content-Type-Options: nosniff`).
- Every response: `Cross-Origin-Resource-Policy: same-site`, `Cache-Control: private, no-store`.
- **Quarantine objects** (PRB.20): upload presigns write only `quarantine/<workspaceId>/<uploadId>` keys
  (tenant-bound, traversal-proof, ≤ 25 MB); reads serve only through this same bucket+origin — the same
  `servingHeadersFor` policy applies, so a quarantined HTML payload can never render.

## The CSP (asserted per response, not per design)

- **web** (`apps/web/src/server.ts`): per-request nonce stamped into every `<script>` tag of HTML
  responses; `script-src 'self' 'nonce-…'`; `style-src 'self' 'unsafe-inline'` (hand-authored `style=`
  attributes are pervasive and style cannot exfiltrate); `img-src 'self' https://usercontent.rhema.tools
  data:`; `connect-src 'self'`; `font-src 'self'`; `object-src 'none'`; `frame-ancestors 'none'`;
  `base-uri 'self'`; `form-action 'self'`; `nosniff` + `Referrer-Policy` alongside. Non-HTML responses
  pass through untouched. Multi-valued `Set-Cookie` survives the header clone verbatim.
- **api** (`apps/api/src/index.ts`): `default-src 'none'; frame-ancestors 'none'` + `nosniff` on **every**
  response including errors — the api is never a browsing context.
- **usercontent**: no CSP needed — nothing renders (allowlisted images inline; all else downloads), and no
  cookie scope exists to steal.

## Residual (named, not hidden)

- `style-src 'unsafe-inline'` is a deliberate Scope trade — CSS-in-HTML attributes; styles cannot
  exfiltrate but a stray `expression()`-era browser is not a target anyway.
- The nonce middleware marks *every* script tag — DOM injection defenses (escaping) remain the real
  control for user text inside pages; CSP is the second layer.
- Live response-header verification against prod objects is **Stage B** (operator-gated).

---

## ⚑ Amendment — 2026-10-21 (R6UCD.1 / ADR-113): delivery moved to API-minted v4 URLs

The origins table above keeps the `usercontent.rhema.tools` row for history, but the delivery
mechanism is now the api's **GCS V4 signed GETs on `storage.googleapis.com`** (minted after a
tenant check — `GET /usercontent/sign`, or the tenant-scoped row resolve behind
`/voices/:id/samples/:itemId/raw`). The isolation properties this audit asserts are unchanged
and now hold by construction:

- **No `Set-Cookie` ever** — the served URL lands on `googleapis.com`, outside every
  `rhema.tools` cookie scope; the mint route itself sets no cookie either.
- **Non-allowlisted → attachment + octet-stream** — bound *into the signature* via the v4
  `response-content-type` / `response-content-disposition` params (GCS serves them verbatim;
  `X-Content-Type-Options` cannot ride a signed URL, so the attachment disposition carries the
  no-render guarantee on this path — `userContentResponsePolicy` in
  `packages/contracts/src/upload.ts` is the single decision; the convert-side
  `servingHeadersFor`/`RENDERED_ALLOWLIST` re-derive from the same allowlist).
- **Cookieless sibling-origin posture** — `usercontent.*` CDN infrastructure is deployed but
  inert (ADR-113 §4); nothing emits those URLs. CSP `img-src` keeps the `usercontent` admission
  for now (harmless while inert; tightening it is cosmetic).
