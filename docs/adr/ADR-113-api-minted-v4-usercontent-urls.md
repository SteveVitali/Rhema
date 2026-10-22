# ADR-113: User-content is served by API-minted GCS V4 signed URLs after a tenant check, not edge-signed CDN URLs

- **Status:** Accepted
- **Date:** 2026-10-21
- **Ticket:** R6UCD.1 (REQ-POST-7; DEFERRALS `D-R5OPS.1-2`, `D-P1.22-2`)
- **Requirement ids:** REQ-POST-7, REQ-ARCH-24 (as amended), REQ-SPEC-30 (invariant 13)
- **Spec:** `docs/rhema-design-spec.md` §13.3 (the user-content serving contract — amended by this
  ADR's dated banner); `docs/security/usercontent-csp-audit.md`;
  `docs/tickets/179_R6UCD.1__api-minted-usercontent-urls.md`

## Context

The §13.3 user-content serving contract — a private bucket, a cookieless delivery origin,
`Content-Disposition: attachment` + `application/octet-stream` for every non-allowlisted type —
was wired to a Cloud CDN backend bucket behind `usercontent.rhema.tools`, signed at the edge
with an operator-installed `rhema-tools-key`. That path was verified live under `D-R5OPS.1-2`
(`scripts/live/usercontent-cdn-verify.mjs`): the CDN config verified (enableCdn +
USE_ORIGIN_HEADERS + the key name) but **every** fetch — signed, unsigned, corrupted — answered
the GCS origin's `403 AccessDenied`. The CDN edge cannot sign for a private origin it cannot
read: the LB's service identity never held an objectViewer grant on the bucket, so the edge
verified the signature and then failed the origin read. The path was nonfunctional by design,
and on 2026-10-20 the operator **ruled its repair out** (no objectViewer grant, no edge-signing
IAM work) and changed the contract: *"API-minted signed URLs"*.

Meanwhile the api already mints GCS V4 signed URLs successfully in two places — the
`/import/presign` PUT (quarantine uploads) and `exportPresign` (account-export GETs) — via IAM
`signBlob` on the api service account, which holds `roles/storage.objectAdmin` on the
`user-content` bucket (`infra/pulumi/iam.ts` `api-rw-usercontent`). The replacement uses that
proven mechanism.

## Decision

1. **Delivery mechanism.** User-uploaded bytes are served by short-lived **GCS V4 signed GET
   URLs on `storage.googleapis.com`**, minted by the api after a tenant check
   (`mintUserContentUrl` in `packages/contracts/src/upload.ts` — the one mint decision, consumed
   by this ticket's routes and by R6POST.1/R6SECR.1). `USERCONTENT_URL_TTL_SECONDS = 300` bounds
   every mint; a caller can only tighten it, never extend it.
2. **The serve contract rides the signature.** The v4 `response-content-type` +
   `response-content-disposition` query params are signed into the URL, so GCS serves the §13.3
   policy verbatim regardless of stored object metadata: allowlisted image types
   (`USERCONTENT_RENDERED_TYPES` — now the single allowlist; `apps/convert`'s
   `RENDERED_ALLOWLIST` re-derives from it) inline as themselves, everything else
   `application/octet-stream` + `attachment`. `X-Content-Type-Options` cannot ride a GCS signed
   URL, so the attachment disposition carries the no-render guarantee on this path.
3. **The tenant check precedes signing, in two shapes:**
   - `GET /usercontent/sign?key=&type=` mints only for keys that declare their tenant —
     `quarantine/<workspaceId>/<id>` + `converted/<workspaceId>/<id>.json`
     (`userContentKeyOwner`) — and only when the key's segment equals the session workspace.
     Foreign, malformed, and tenant-less keys all answer a uniform `not_found` with **no URL**
     (the signer is never asked).
   - Row-owned keys that carry no tenant segment (`ingest-originals/<sha256>`) are minted only
     through a tenant-scoped row resolve: `GET /voices/:id/samples/:itemId/raw` resolves the
     sample under the session's RLS scope (foreign rows are invisible → 404) and then 302s to
     the minted URL.
   - Both shapes are probed: the two-tenant probe (`integration/src/two-tenant-probe.ts`)
     asserts foreign mint keys → 404/no-url and that the signer is never invoked for them
     (invariant 13, REQ-SPEC-30).
4. **The CDN path is inert, retained.** The backend bucket, `usercontent.*` host rule,
   `user-content-signing-key` secret, and its `api-signs-usercontent` secret grant stay
   deployed but nothing reads them — removal is a separate cost/infra decision (CDN caching
   may still matter at scale). No code emits `usercontent.rhema.tools` URLs.
5. **Verification.** `scripts/live/usercontent-cdn-verify.mjs` is re-pointed at the minted path:
   unauthenticated mint → 401, unsigned object GET → 403, signed GET (minted either through the
   real route with a session cookie, or via `gcloud storage sign-url
   --impersonate-service-account` — the identical signBlob primitive) → 2xx with the §13.3
   headers, tampered-signature → denied, expired-lifetime → denied. It reads no secret
   material — the retired path's CDN key read is gone entirely. Live execution rides R6POST.1.

## Consequences

- **Good:** delivery actually works — the mint path is the same signBlob primitive already
  proven by import presign + account exports; no new IAM, no key material, no origin-read
  grant needed; the cookieless guarantee is structural (the URL host is `googleapis.com`,
  outside every `rhema.tools` cookie scope); the serve policy is tamper-proof (it is *signed
  into* the URL, not applied by a mutable layer); the two-tenant probe now covers the mint.
- **Costs:** a served object URL carries a 5-minute credential — long enough to start a fetch,
  short enough to bound a leak; a browser `fetch()` of a minted URL is a CORS read on
  `googleapis.com`, so the `user-content` bucket's CORS block gains `GET` (additive IaC under
  GD-DEPLOY.R6); `/raw` returns a 302 the api-client `download()` helper follows transparently;
  GCS cannot emit `X-Content-Type-Options`/`CORP`/`Cache-Control` — those headers exist only on
  the legacy origin-header path (`servingHeadersFor`), which no served URL reaches now.
- **Neutral:** signed URLs are bearer URLs within their TTL — acceptable because TTL is short,
  objects are non-renderable downloads, and the check happens *before* minting (a URL minted
  for tenant A's own key reveals nothing tenant B could not already get by minting it
  themselves; minting B's key is refused outright).

## Alternatives considered

- **Repair the edge-signed CDN path** (grant the LB's identity objectViewer + keep
  `rhema-tools-key`): ruled out by the operator 2026-10-20 — adds a broad read grant for a
  mechanism with no advantage over v4 URLs, and keeps a second signing secret alive.
- **Proxy user bytes through the api** (the `/raw` fallback's old shape): works but burns Cloud
  Run bandwidth on every byte served, keeps large fetches inside request timeouts, and keeps
  the bytes inside the session-scoped surface rather than on a cookieless origin.
- **Mint `usercontent.rhema.tools` URLs that also verify at the CDN edge:** the worst of both —
  still needs the denied origin read.
- **Longer TTLs / signed cookies:** buys convenience at the cost of a longer-lived credential;
  300 s matches the quarantine-PUT bound and the pdf.js fetch window.

## Revisit trigger

Revisit if (a) CDN caching becomes cost-relevant at scale — the inert infrastructure is
retained precisely for a future "CDN in front of minted URLs" revisit, which would need only
the origin-read repair, not the retired edge-signing contract; (b) a serving need arises that
`response-content-*` cannot express (e.g. per-request `Cache-Control`), which argues for a
thin cookieless proxy origin instead; or (c) TTL telemetry shows the 300 s bound breaking real
pdf.js sessions.
