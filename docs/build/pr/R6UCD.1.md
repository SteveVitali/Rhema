# R6UCD.1 — API-minted GCS V4 usercontent URLs after a tenant check (REQ-POST-7, ADR-113)

Stacked on `stevevitali/r6eng-3-res3-verification-checkpointing` ·
`mergePolicy: OPERATOR` — **do not merge; the operator merges the chain
bottom-up.** Offline-only ticket; $0; no live stage; zero prod contact.
`implement-spec spec=docs/tickets/179_R6UCD.1__api-minted-usercontent-urls.md`
— manifest row 179, depends on 178_R6ENG.3. ADR-113.

**Requirement ids stamped:** REQ-POST-7

## The defect this closes (`D-R5OPS.1-2`)

The §13.3 user-content delivery was wired to a Cloud CDN backend bucket behind
`usercontent.rhema.tools`, edge-signed with an operator-installed
`rhema-tools-key`. The R5OPS.1 verify run proved it **configured-but-dead**:
`enableCdn` + `USE_ORIGIN_HEADERS` + the key name all verified via `gcloud`,
yet signed, unsigned, and corrupted fetches alike answered the GCS origin's
`403 AccessDenied` — the edge cannot sign for a private origin it cannot read
(no LB→bucket objectViewer grant). The 2026-10-20 operator ruling: **change
the contract to API-minted GCS V4 signed URLs** — edge-signing/IAM repair not
pursued; CDN earns its keep only at scale.

## What

**1. The one shared mint decision** (`packages/contracts/src/upload.ts` — the
§13.3 wire module, consumed by this ticket's routes and by R6POST.1/R6SECR.1):
- `UserContentSigner` — the cloud port (`signGet({key, expiresSeconds,
  responseType, responseDisposition})`); the live binding is
  `createGcsV4UserContentSigner` (`@rhema/live-clients`, same IAM `signBlob`
  mechanism the import PUT presigner and the account-zip `exportPresign` use —
  the api SA already holds `objectAdmin` on the bucket).
- `mintUserContentUrl` — applies `userContentResponsePolicy` (allowlisted
  image types → `inline` + their own type; **everything else → `attachment` +
  `application/octet-stream`**) and clamps the TTL to
  `USERCONTENT_URL_TTL_SECONDS = 300`. The serve contract is signed INTO the
  URL via `response-content-type` / `response-content-disposition`, so GCS
  emits it verbatim regardless of stored object metadata.
- `userContentKeyOwner` / `parseConvertedKey` — which keys declare their
  tenant (`quarantine/<ws>/<id>`, `converted/<ws>/<id>.json`); everything else
  (`ingest-originals/<sha>` etc.) can only be minted through a row resolve.
- `USERCONTENT_RENDERED_TYPES` is now the single allowlist — `apps/convert`'s
  `RENDERED_ALLOWLIST` + `servingHeadersFor` re-derive from it.

**2. Two tenant-check shapes:**
- `GET /usercontent/sign?key=&type=` (session-gated) — mints only keys whose
  own tenant segment equals the session workspace; foreign, malformed,
  missing, and tenant-less keys all answer a **uniform `not_found` with no
  URL** (the signer is never asked); unbound seam → 503; unauth → 401. The
  `type` claim is allowlist-clamped — a bogus claim can only ever tighten to
  octet-stream+attachment.
- `GET /voices/:id/samples/:itemId/raw` — its `original_key` leg
  (`ingest-originals/<sha>` on the user-content bucket) now resolves the row
  under the session's RLS scope (foreign rows are invisible → 404) and then
  **302s to the minted URL**. The byte proxy stays only as the unbound-seam
  fallback + for the `original_sha256` content-store leg. The api-client
  `download()` helper follows the 302 transparently (no client change —
  verified the returned media type is unchanged).

**3. The CDN path is inert, retained** — the backend bucket, host rule,
`user-content-signing-key` secret and its `api-signs-usercontent` grant stay
deployed but nothing reads them (no env binding ever existed); comments mark
them inert in `compute.ts`, `iam.ts`, `secrets.ts`, `stages.ts`, and
`PROD-BRINGUP.md` §6's `add-signed-url-key` step is retired. `repair-
cdn-delivery.mjs` never existed — the census row is marked retired-unwritten.
CDN removal is the separate cost/infra decision (ADR-113 §4).

**4. Verify re-pointed** (`scripts/live/usercontent-cdn-verify.mjs`) — reads
**zero** secret material (the old CDN-key Secret-Manager read is gone):
unauth mint route → 401, unsigned object GET → 403, signed GET → 2xx with
`attachment` + `application/octet-stream` + no `Set-Cookie`, tampered
signature → denied, genuinely expired (1-second window) → denied. `--cookie
"name=value"` mints through the REAL route (proving the session gate +
signBlob live); otherwise `gcloud storage sign-url
--impersonate-service-account=<api SA>` exercises the identical primitive.
Live execution rides **R6POST.1** (POST-7 legs).

**5. Probe extended** — the two-tenant probe binds a recording fake signer
and asserts foreign `quarantine`/`converted` mint keys → 404/no-url **and
that the signer is never invoked for them**, plus an own-key mint sanity
(TTL bound + §13.3 params). Invariant 13 (REQ-SPEC-30).

**6. Docs** — ADR-113 (context/decision/consequences/alternatives + revisit
trigger); dated 2026-10-21 banner in `docs/rhema-design-spec.md` §13.3 (+ the
header amendments line); the `usercontent-csp-audit.md` amendment note; ADR
index regenerated.

## Additive IaC (ships under `GD-DEPLOY.R6`, named per the ticket)

- `infra/pulumi/data.ts`: the `user-content` bucket's CORS block gains `GET`
  (+ `Content-Disposition`/`Content-Length`/`Accept-Ranges`/`Content-Range`
  exposed headers) — a browser `fetch()` of a minted URL (e.g. the quality
  drawer's pdf.js leg) is a CORS read on `storage.googleapis.com`. Same
  explicit origins, never a wildcard; `data.test.ts` asserts the bound.
- `apps/web/src/server.ts`: `img-src` additionally admits
  `https://storage.googleapis.com` — the host an allowlisted image is
  actually served from now (connect-src already admitted it for the PUT leg).

## Deferrals delta

- `D-R5OPS.1-2` OPEN → **PARTIAL** — the engineering leg landed here; the
  live verify probes ride R6POST.1 (dated note appended).
- `D-P1.22-2` stays PARTIAL — leg (c)'s usercontent residual re-scoped to the
  minted path (dated note appended).
- No new deferral rows — the remaining live half is already carried.

## Evidence (deterministic)

- `usercontent-routes.test.ts` (7): 401/503/404-no-url for foreign +
  malformed + tenant-less keys (signer never asked); own quarantine +
  converted keys → 200 `{url, expiresAt}`; `expiresSeconds ≤ 300`; octet-
  stream+attachment default, `image/png` → inline, `image/svg+xml` stays a
  download; no `Set-Cookie`.
- `upload.test.ts` (11): policy arms, owner-parse, mint binds the signed
  params, TTL clamp on an oversized ask.
- `ingest-routes.test.ts` (9): the `/raw` `original_key` leg 302s to the
  minted URL with the §13.3 params when the seam is bound; unbound-seam proxy
  fallback still green.
- `two-tenant-probe` — `findings:[]`, `ownDataSanity:[]` including the new
  mint legs.
- `usercontent-cdn-verify.test.mjs` (8) — the re-pointed contract pinned by
  source scan; `--dry-run` plan verified.
- `serving.test.ts` (5) + `usercontent-csp.test.ts` (10) green — the §13.3
  policy + `__Host-` posture unchanged.
- `apps/api` suite — 45 files / 555 tests; `apps/web` server tests 113;
  `infra/pulumi/data.test.ts` 6; turbo lint+typecheck 53/53 on the touched
  set; `check:no-cookies`/`check:spa-env`/`check:protocol-markers`/
  `check:licenses` all OK; build-memory 0 violations; append-only vs
  `39f0e11` OK.

## AC layers

- Mint tests (foreign→404 no URL; allowlist vs non-allowlist; TTL bound) —
  **required: engineered → achieved: engineered**.
- usercontent/CSP audit green (no `Set-Cookie`, `__Host-` posture) —
  **required: engineered → achieved: engineered**.
- ADR-113 + §13.3 banner + index — **required: engineered → achieved:
  engineered**.
- Universal phase-gate AC — agentic; CI read + recorded in the run ledger.
