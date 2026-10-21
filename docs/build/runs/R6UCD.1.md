# R6UCD.1 — API-minted signed usercontent URLs (+ ADR-113) — run ledger

- **Spec:** `docs/tickets/179_R6UCD.1__api-minted-usercontent-urls.md` (manifest row 179, round 6 —
  Kind: ticket) — `implement-spec`; spec §4.6 `REQ-POST-7` (code half); DEFERRALS rows
  **`D-R5OPS.1-2`** + **`D-P1.22-2`** (usercontent half); `docs/security/usercontent-csp-audit.md`;
  spec §13.3
- **Base:** `stevevitali/r6eng-3-res3-verification-checkpointing` at **local** HEAD `39f0e11`
  (the R6ENG.3 boundary commit, deliberately unpushed — never reset to `origin/`, which lacks it)
- **Branch:** `stevevitali/r6ucd-1-api-minted-usercontent-urls` (PR base
  `stevevitali/r6eng-3-res3-verification-checkpointing`; mergePolicy=OPERATOR — never merge)
- **Harness:** devin-desktop/swe-2-high/subagent · **Skills:** implement-spec + build-memory +
  self-review @ `~/agent-skills` (`e981ec5`)
- **Requirement ids stamped:** `REQ-POST-7`
- **Live stage:** offline-only (live probes ride R6POST.1)
- **Production mutations:** none — the additive IaC delta (user-content bucket CORS gains GET for
  the app origin) ships in the next deploy under `GD-DEPLOY.R6`; named in the PR.
- **Gate status:** none (contract ruled 2026-10-20 — "API-minted signed URLs")
- **Started:** 2026-10-21T04:46Z
- **Closed:** 2026-10-21 — `ci: pass #199@fd0183a` (code head `c13e37a` full green, run 39551122784;
  docs closeout head fast-path, run 39557060302). PR #199 OPEN, mergePolicy OPERATOR.

## Deferrals read

`docs/tickets/DEFERRALS.md` read first (protocol — AGENTS.md). Two rows name this ticket:

- **`D-R5OPS.1-2` (OPEN)** — the CDN-signed usercontent delivery path is nonfunctional (edge does
  not gate signatures; LB→bucket origin read denied — no objectViewer grant). The 2026-10-20
  operator ruling converted it from ruling-bound to an engineering leg: **API-minted GCS V4 signed
  URLs** (edge-signing repair not pursued). This run lands the code half; the live probes
  (unsigned→denied / signed→200 / tampered→denied / header leg) ride **R6POST.1** — the row
  becomes PARTIAL with a dated note (code leg landed, live verify still owed).
- **`D-P1.22-2` (PARTIAL)** — Stage-B bundle; leg (c)'s surviving usercontent residual (signed
  delivery + header check) is re-scoped by ADR-113 to the minted path — dated note appended;
  stays PARTIAL on its other legs.

No other OPEN row is unblocked by this ticket.

## Requirements (from the ticket)

1. A mint helper — the **owned shared decision** consumed by R6POST.1 + R6SECR.1: tenant check
   before minting; short TTL; `response-content-disposition=attachment` +
   `application/octet-stream` for non-allowlisted types; no cookie ever.
2. Every usercontent read path routed through it; the CDN signed-key path left inert.
3. `usercontent-cdn-verify.mjs` re-pointed at the minted path (unsigned→denied, signed→200,
   tampered or expired→denied, header leg).
4. ADR-113 amending the §13.3 usercontent-origin contract + dated §13.3 banner + ADR index regen.
5. The two-tenant probe extended to the mint route (invariant 13).

Out of scope: edge-signing/IAM repair (ruled); CDN removal (cost/infra decision — config stays).

## Acceptance criteria

- [x] Mint tests: foreign-tenant id → 404, no URL; allowlisted vs non-allowlisted disposition;
      TTL bound *(deterministic · engineered)* — `usercontent-routes.test.ts` 7/7, `upload.test.ts` 11/11
- [x] usercontent/CSP audit tests stay green (no `Set-Cookie`, `__Host-` posture) *(deterministic)* — `usercontent-csp.test.ts` 10/10
- [x] ADR-113 + §13.3 banner landed; ADR index regenerated *(deterministic)*
- [x] universal phase-gate AC *(agentic)* — CI green end-to-end (`#199@fd0183a`)

## Plan

Design (recorded before code; ADR-113 lands with it):

- **The wire:** the api mints GCS **V4 GET** signed URLs (`storage.googleapis.com/<bucket>/<key>`)
  via IAM `signBlob` — same mechanism as `/import/presign` + the account-zip `exportPresign`.
  `response-content-disposition` + `response-content-type` are signed query params, so GCS serves
  the §13.3 header contract without any proxy. The CDN/backend-bucket path stays deployed but
  inert (no code relies on it; removal is a separate cost decision).
- **Shared vocabulary** (`@rhema/contracts` `upload.ts` — the §13.3 wire module):
  `USERCONTENT_RENDERED_TYPES` (the image allowlist — now the single source; `apps/convert`'s
  `RENDERED_ALLOWLIST` re-derives), `userContentResponsePolicy(contentType)` →
  `{contentType, contentDisposition}` (allowlist → inline+own-type, else octet-stream+attachment),
  `USERCONTENT_URL_TTL_SECONDS = 300`, `parseConvertedKey`, `userContentKeyOwner` (tenant-declaring
  prefixes only).
- **Binding** (`@rhema/live-clients` `ingest.ts`): `createGcsV4UserContentSigner(bucket)` →
  `signGet({key, expiresSeconds, responseType, responseDisposition})` — the thin cloud seam.
- **Routes** (`apps/api/src/usercontent-routes.ts`): `GET /usercontent/sign?key=&type=` —
  session-authed; the key's own tenant segment must equal the session workspace else 404 (uniform
  not_found — `ingest-originals/<sha>` carries no tenant segment and is not generically mintable);
  `type` is the requested render type, allowlist-clamped. Returns `{url, expiresAt}`.
- **Read path re-pointed:** `GET /voices/:id/samples/:itemId/raw` — the `original_key` leg
  (user-content bucket, tenant proven by the RLS-scoped row) mints + **302s** to the signed URL
  when the signer is bound; the blob proxy remains only as the unbound-seam fallback (tests) and
  for the `original_sha256` content-store leg (canonical bytes, different trust class).
- **Probe:** two-tenant probe binds a fake signer + gains an explicit mint leg (foreign
  quarantine/converted keys → 404, no `url`; own key → 200).
- **Verify script:** mints via `gcloud storage sign-url --impersonate-service-account=<api SA>`
  with the response-* params — the same signBlob class the api uses — then probes unsigned /
  unsigned-at-the-api-mint-route (401) / signed / tampered / expired; PASS only on the header
  contract.
- **IaC:** `data.ts` user-content CORS gains `GET` (app origin only — additive, ships under
  GD-DEPLOY.R6; needed only by browser `fetch()` readers like pdf.js); `compute.ts` comment marks
  the CDN path inert; `stages.ts` marks `user-content-signing-key` inert; `PROD-BRINGUP.md` §6
  gets a retired banner; the census's `repair-cdn-delivery.mjs` row gets a retired note (the
  script never existed — do not create it, do not delete history).

## Test matrix

| AC | test | file |
|---|---|---|
| foreign-tenant id → 404, no URL | sign route w/ `quarantine/<other-ws>/x`, `converted/<other-ws>/x.json`, `ingest-originals/<sha>` → 404, no `url` | `apps/api/src/usercontent-routes.test.ts` |
| allowlisted vs non-allowlisted disposition | `?type=image/png` → inline+image/png; `?type=text/html`/absent → attachment+octet-stream | same |
| TTL bound | signer called with `expiresSeconds ≤ 300`; `expiresAt` inside bound | same |
| unauth → 401; unbound signer → 503 | same | same |
| every read path through the mint | `/raw` original_key leg → 302 to minted URL; sha-fallback still proxies | `ingest-routes.test.ts` |
| probe extension | foreign mint → 404; own mint → 200 | `integration/src/two-tenant-probe.ts` |
| CSP/cookie posture unchanged | `usercontent-csp.test.ts` green; allowlist parity between `servingHeadersFor` + `userContentResponsePolicy` | `packages/security-checks` |

## Progress

- 2026-10-21 — Phase 0/1: anchors read (account-export presign pattern, import/ingest routes,
  compute backend bucket + urlmap, verify script, two-tenant probe, §13.3 + the audit doc,
  R6POST.1/R6SECR.1 tickets). `repair-cdn-delivery.mjs` confirmed never-written (census row 214
  only). Plan recorded above.
- 2026-10-21 — Phase 2/3 implemented + self-reviewed: contracts mint vocabulary
  (`USERCONTENT_RENDERED_TYPES`, `userContentResponsePolicy`, `USERCONTENT_URL_TTL_SECONDS=300`,
  `parseConvertedKey`, `userContentKeyOwner`, `UserContentSigner`, `mintUserContentUrl` — TTL
  clamped, allowlist-clamped); live binding `createGcsV4UserContentSigner` (v4 GET +
  `responseDisposition`/`responseType` signed params, `@google-cloud/storage` 7.22/8.x supports
  both — verified in `file.d.ts`); `GET /usercontent/sign` (tenant-declaring keys only; unauth→401,
  unbound→503, foreign/malformed/tenant-less→404 no-url); `/raw` `original_key` leg → 302 when the
  seam is bound (proxy stays as the unbound fallback + the `original_sha256` content-store leg);
  probe extended (fake signer + foreign mint legs + own-mint sanity); verify script re-pointed
  (unauth mint→401 / unsigned→403 / signed→2xx+headers / tampered + genuinely-expired→denied /
  `--cookie` mints through the real route); CORS +GET (additive, GD-DEPLOY.R6); `img-src` admits
  the GCS origin so allowlisted images can actually render; CDN path commented inert in
  compute/iam/secrets/stages/PROD-BRINGUP; ADR-113 + §13.3 banner + CSP-audit amendment + census
  retired-note + ADR index regen; DEFERRALS `D-R5OPS.1-2` → PARTIAL (code leg landed, live verify
  rides R6POST.1), `D-P1.22-2` leg (c) re-scoped to the minted path.
- Decisions taken inside the design (all within the ticket's contract): (a) `expiresAt` is the
  signer's epoch-ms stamp, serialized verbatim; (b) foreign + malformed + missing keys share the
  one `not_found` (uniform, no oracle); (c) `converted/<ws>/<id>.json` mint-eligible alongside
  quarantine (same tenant-declaring shape; needed for the probe's second prefix + R6SECR.1's
  review surface); (d) `/raw` 302 (not a JSON DTO) so both the api-client `download()` helper and
  a bare `<a href>` work — verified `download()` follows redirects + reports octet-stream either
  way; (e) `X-Content-Type-Options`/`CORP`/`no-store` cannot ride a GCS signed URL — named as a
  consequence in ADR-113 (the attachment disposition carries the no-render guarantee).

## Gap table

| Ticket deliverable | Landed | Evidence |
|---|---|---|
| mint helper — owned shared decision | `mintUserContentUrl` + `UserContentSigner` + `userContentKeyOwner` + `USERCONTENT_URL_TTL_SECONDS` in `@rhema/contracts` (upload.ts); live impl `createGcsV4UserContentSigner` | `upload.test.ts` (11), `usercontent-routes.test.ts` (7) |
| tenant check before minting | key-declared (`/usercontent/sign`) + row-resolved (`/raw`) shapes | route tests + two-tenant probe mint leg |
| short TTL | 300 s bound; clamp in the helper; signer-observed assert | `upload.test.ts` clamp leg; route test `expiresSeconds ≤ 300` |
| attachment + octet-stream for non-allowlisted | signed `response-content-*` params via `userContentResponsePolicy` | `upload.test.ts` policy legs; route test dispositions |
| no cookie ever | URL host is `storage.googleapis.com`; mint route sets no Set-Cookie (asserted) | route test `set-cookie` null |
| every usercontent read path routed | `/raw` re-pointed (the only user-serving byte path); import preview/create are server-side JSON; account-export zips are the artifacts bucket (own P1.18 contract); worker reads are server-side | `/raw` 302 test; census in this ledger |
| CDN signed-key path inert | nothing reads it (no env binding ever existed); comments mark inert in compute.ts/iam.ts/secrets.ts/stages.ts/PROD-BRINGUP.md; removal noted as the separate cost decision | source-scan: `grep user-content-signing-key` hits only comments/tests |
| verify.mjs re-pointed | unsigned→403, unauth mint→401, signed→2xx+§13.3 headers, tampered→denied, expired→denied, `--cookie` mints through the real route | `usercontent-cdn-verify.test.mjs` (8) + `--dry-run` plan |
| ADR-113 + §13.3 banner | landed + index regenerated | `docs/adr/ADR-113-…md`; `docs/rhema-design-spec.md` §13.3 + header line |
| two-tenant probe extended | foreign quarantine/converted mint → 404/no-url + signer never invoked; own mint sanity | `two-tenant-probe.ts` mint leg (probe green) |
| `repair-cdn-delivery.mjs` marked | never existed → census row marked retired-unwritten; not created | `r6_open_work_census.md` note |

## Evidence log

- `pnpm vitest run packages/contracts/src/upload.test.ts` — 11/11 (policy, owner-parse, mint+clamp).
- `pnpm vitest run apps/api/src/usercontent-routes.test.ts` — 7/7 (401/503/404-no-url/200+TTL+dispositions).
- `pnpm vitest run apps/api/src/ingest-routes.test.ts` — 9/9 (incl. the `/raw` 302 mint leg).
- `pnpm vitest run integration/src/two-tenant-probe.test.ts` — 1/1 (findings:[] + mint legs).
- `pnpm vitest run apps/convert/src/serving.test.ts packages/security-checks/src/usercontent-csp.test.ts` — 15/15.
- `pnpm vitest run scripts/live/usercontent-cdn-verify.test.mjs` — 8/8; `node --check` + `--dry-run` OK.
- `pnpm vitest run apps/api` — 45 files / 555 tests green; `apps/web/src/server.test.ts` 113/113.
- `pnpm vitest run infra/pulumi/data.test.ts` — 6/6 (PUT+GET CORS legs).
- `pnpm turbo run lint typecheck` on the touched set — 53/53 tasks.
- `pnpm check:no-cookies` / `check:spa-env` / `check:protocol-markers` / `check:licenses` — all OK.
- `node docs/build/tools/check-append-only.mjs --base 39f0e11` — append-only OK.
- `bash …/check-build-memory.sh .` — 0 violations (7 pre-existing warnings).

## CI pass log

- **2026-10-21** — first head `d1b67cc`: `public-safe` **failed** — gitleaks `generic-api-key` on
  the test literal `key: "quarantine/ws1/img"` (`upload.test.ts`; same fixture class as the already-
  allowlisted `quarantine/ws1/up1`). Fix: the test now uses the allowlisted literal; the history was
  amended (`d1b67cc` → **`c13e37a`**, force-pushed on the unmerged branch — a fix-on-top commit could
  not help because gitleaks scans every commit in the PR range).
- **2026-10-21 — `c13e37a` FULL GREEN** (run `39551122784`): fast-path 22s · typecheck/lint/unit
  44m27s · public-safe 38s (gitleaks clean — zero findings) · contracts 28s · integration 4m7s ·
  images 11m35s · **ci-pass anchor written** (`ci-pass-45e97cab81a9…`).
- **2026-10-21 — `fd0183a` fast-path green** (run `39557060302`, the docs closeout head):
  same-tree anchor on `c13e37a`, delta all-eligible — every leg's fast-path verdict green in
  ~2.5 min wall. **`ci: pass #199@fd0183a`.**

## Evidence report

All ticket ACs discharged deterministically; the live probes (unsigned → 403 at the origin,
signed → 2xx + header contract, tampered + expired → denied against the real minted path on the
deployed tip) ride **R6POST.1** under `D-R5OPS.1-2` (stays PARTIAL). PR #199 OPEN — mergePolicy
OPERATOR; the operator merges the chain bottom-up.
