# implement-spec ledger — PRB.02 (draft import: fetcher, convert, conversion preview)

- **Spec:** docs/tickets/18_PRB.02__import-fetcher-convert.md
- **Base commit:** 4c91bf8 (PRB.01 close, PR #29 — chain tip `stevevitali/prb-01-beta-shell-and-invites`)
- **Branch:** stevevitali/prb-02-import-fetcher-convert
- **Config:** full (all rigor phases on)
- **Context:** Phase 0 exited (G1 PASSED); G2 deferred. Standing: no efficacy/marketing claims, no pricing page.

## Deferrals read
- **D-P0.09-2 (OPEN)** — REQ-DATA-9(b)/(c)/(d) round-trips. The **(d) import half** (markdown→PM-profile-
  normalized markdown byte-stable on 2nd pass after the import normalizing pass) is **PRB.02's** per the row.
  PRB.02 can PARTIAL-close it (the markdown-level normalizer idempotence on the fixtures); the full md↔PM
  round-trip (b full / c) rides the P1.02 editor schema. The md-twins corpus lives in `@rhema/protocols`.
- **D-P0.01-7 (OPEN)** — Pulumi/GCP IaC includes `fetcher`/`convert` Cloud Run; the live VPC no-network-route
  for convert + the quarantine bucket + usercontent origin are deploy-gated (like PRB.01's live legs).
- Nothing else newly unblocked by PRB.02.

## Requirements (stamp in PR)
- REQ-ARCH-4 (amended), REQ-ARCH-22 (fetcher SSRF rules), REQ-ARCH-23 (amended — convert no-net/no-DB +
  decompression limit), REQ-ARCH-24 (amended — usercontent origin attachment/octet-stream, presigned PUT,
  sniff-at-conversion), REQ-DATA-9(d, import half), REQ-INGEST-8 (format/caps pipeline half), REQ-INGEST-12
  (SSRF guard, redirect/size limits, honest UA, ≤1 req/s/host, robots), §5.3 preview behavior (REQ-IDE-5 upload
  leg), REQ-SPEC-25(a) (fetcher routing path exists).

## Acceptance criteria
- AC1 — SSRF suite: IMDS/ECS-credential/loopback/private denied incl. via redirect + DNS-rebinding (REQ-ARCH-22). *(det)*
- AC2 — convert has no network route (SG/route assertion) + no DB creds; zip-bomb refused by decompression limit (REQ-ARCH-23). *(det)*
- AC3 — uploaded HTML served from usercontent origin as attachment/octet-stream; cookieless origin asserted (REQ-ARCH-24). *(det)*
- AC4 — an 8k-word .docx renders its preview within 20 s with word count + citation spans (REQ-GROWTH-1 ingest half, measured in dev). *(det)*
- AC5 — unconvertible spans → `<!-- rhema:unconverted -->` blocks with anchored warnings; Create-and-fix-later → Conversion-notes card. *(det)*
- AC6 — post-import round-trip: markdown → PM-profile-normalized markdown byte-stable on 2nd pass for the six real PDFs + .docx (REQ-DATA-9d markdown level). *(det)*

## Cross-cutting invariants
- `fetcher` fetches, never parses; `convert` parses, never fetches (F41 split).
- Never a cookie/credential fetch of user content (REQ-INGEST-5 platform-wide).

## Plan

**Build order (each group tests-alongside, keep green):**
1. **`@rhema/contracts`** — `domain/conversion.ts`: `QUALITY_VERDICTS` enum (clean/reconstructed/partial/
   unreadable/empty), `conversionWarningSchema` (reuses `anchorSchema`), `conversionResultSchema` (sourceFormat,
   markdown, warnings[], unconvertedBlocks[], counts {words,footnotes,citationSpans,tables,figures}, quality,
   qualityNotes[]).
2. **`@rhema/markdown`** (new pkg) — the canonical Rhema Markdown profile (research/9 §4): `normalizeMarkdown`
   (remark + gfm + frontmatter + fixed stringify: no hard wraps, 1 blank line between blocks, NFC, demote body
   H1→H2, footnote renumber) → **idempotent**; `wordCount`; `detectCounts` (footnotes `[^n]`, citation-like
   spans `[@k]`/bracketed-numeric/URL, tables, figures); `buildFrontMatter`; `assembleImportedDoc`.
3. **`apps/fetcher`** — SSRF: `isBlockedIp` (RFC1918/loopback/link-local incl IMDS 169.254.169.254 + ECS
   169.254.170.2/metadata.google.internal, CGNAT 100.64/10, ULA fc00::/7, v6 loopback/link-local/unspecified);
   `assertPublicHost` (DNS-then-IP, all resolved IPs); `fetchGuarded` (http(s)-only, ≤5 redirects re-validated
   per hop = rebind-proof, 25MB/20s caps, content-type allowlist, honest UA, robots, ≤1 req/s/host); Hono
   service + entrypoint; `fetchViaFetcher` tool path (composes `evaluateUrl{viaFetcher:true}` + SSRF + untrusted
   wrapping — REQ-SPEC-25a). Parses nothing.
4. **`apps/convert`** — `sniff` (magic bytes: PK→docx, %PDF→pdf, <html→html, else txt/md); `decompressionGuard`
   (zip entry ratio + total cap → refuse zip-bomb); converters docx(mammoth→turndown)/html(turndown)/pdf(pdfjs
   text)/txt/md → `{markdown,warnings,unconverted}`; `convertBytes` → normalize → `ConversionResult`;
   `servingHeadersFor` (attachment/octet-stream unless rendered allowlist); `presignQuarantinePut` seam. No
   network, no DB.
5. **`apps/api`** — import routes (`POST /projects/:id/import/preview` via injected `Converter` seam; `POST
   .../import/create` → draft v1 `origin=human_upload` + version bytes via `ContentStore` + normalizing pass +
   counts) + a `createImportedDraft` helper.
6. **`apps/web`** — `/p/:project/import`: upload form → §5.3 preview (source-beside-converted, count line,
   anchored warnings, Create-and-fix-later / Fix now) → create; Conversion-notes card copy. SSR + progressive
   enhancement, lint-clean copy.

**Deferred (live/deploy — DEFERRALS D-PRB.02-*):** live presigned PUT to GCS quarantine + convert Cloud Run Job
+ usercontent origin serving + VPC no-network-route assertion for convert + the dev-measured 20s (measured
in-process here); the **six REAL PDFs** corpus (operator H2 — synthesized fixtures prove the normalizer +
pipeline; AC6 docx-half + normalizer idempotence proven now).

## Test matrix
- **AC1** (`apps/fetcher/src/ssrf.test.ts`): `isBlockedIp` truth table (IMDS/ECS/loopback/RFC1918/CGNAT/ULA/v6);
  `fetchGuarded` denies a direct private target, a redirect→private target (pinned per hop), and a
  DNS-rebinding fixture (host resolves public then private); allows a public target; enforces http(s)-only, the
  25MB/20s caps, content-type allowlist, robots, ≤1 req/s/host; emits a `FetchLogRow`.
- **AC2** (`apps/convert`): a zip-bomb `.docx` fixture is refused by `decompressionGuard`; convert imports no
  `@rhema/db`/network client (dependency + import assertion); the package.json has no db/pg dep.
- **AC3** (`apps/convert/src/serving.test.ts`): `servingHeadersFor('text/html')` → `Content-Disposition:
  attachment` + `application/octet-stream`; a rendered-allowlist type keeps its type; the origin config is
  cookieless (no Set-Cookie).
- **AC4** (`apps/convert`): an 8k-word `.docx` fixture → `convertBytes` returns markdown + counts (words≈8000,
  citationSpans>0) in <20s (measured); word count within tolerance.
- **AC5** (`apps/convert`): a fixture with an unconvertible span → a `<!-- rhema:unconverted -->` block in the
  markdown + an anchored `conversionWarning`; the ConversionResult carries the Conversion-notes payload.
- **AC6** (`@rhema/markdown` + `apps/convert`): `normalizeMarkdown(normalizeMarkdown(x)) === normalizeMarkdown(x)`
  byte-for-byte over the fixture corpus (synthesized docx/txt/html/md + a born-digital PDF fixture + the three
  real-project markdown twins); import→normalize is stable on the 2nd pass.
- **Integration** (`apps/api`): `createImportedDraft` creates `drafts` v1 `origin=human_upload` + an
  `artifact_versions` row (sha/bytes/wordCount/mediaType) via `ContentStore` on PGlite; the stored markdown is
  normalized (2nd-pass stable).
- **Web** (`apps/web`): the import route SSR-renders source-beside-converted, the count line, anchored warnings,
  both actions; copy lints clean (Appendix D.2).

## Progress
- Phase 0–1: context + agents mapped surfaces; branch cut; ledger seeded; plan + matrix recorded; baseline 102/102.
- Phase 2 implemented (all green): `@rhema/contracts` conversion types; `@rhema/markdown` (new pkg: normalizer
  idempotence + counts + front-matter, 15 tests); `apps/fetcher` (SSRF suite + guard + tool + robots + rate-limit
  + service, 52 tests incl. IP pinning + ::/96 hardening); `apps/convert` (sniff + zip-bomb guard + docx/pdf/html/
  txt/md converters + convert + serving + upload, 10 tests, real PDF text extraction); `apps/api` import (3);
  `apps/web` §5.3 preview UI (import flow, +8 web tests); `@rhema/ui` conversion components.
- Green gate 105/105; full suite 1389 pass / 2 skip; no regressions.
- Self-review hardening (pre-review): added TOCTOU IP-pinning in the undici forwarder + `::/96` embedded-v4 +
  trailing-dot host normalization.
- Next: fresh-context adversarial review (running) → gap close → PR + close.

## Gap table
(re-read ticket 18_PRB.02 fresh; every requirement + AC mapped)

| item (spec §) | status | evidence | notes |
|---|---|---|---|
| AC1 SSRF suite (IMDS/ECS/loopback/private denied incl. redirect + rebinding) | met | `apps/fetcher/src/ssrf.test.ts` (38: full IP truth table incl. v4-mapped/v4-compat/NAT64); `fetch-guarded.test.ts` (11: direct-private, redirect→private pinned per hop, DNS-rebinding, IP-pin, caps, scheme) | + TOCTOU IP-pinning + ::/96 hardening beyond the literal AC |
| AC2 convert no-network/no-DB + zip-bomb refused | met | `apps/convert/src/convert.test.ts` (zip-bomb → DecompressionLimitError); `serving.test.ts` (package declares no db/pg/undici/gcs/redis dep) | live VPC no-route assertion = D-PRB.02-1 (deploy) |
| AC3 usercontent origin attachment/octet-stream + cookieless | met | `apps/convert/src/serving.test.ts` (`servingHeadersFor('text/html')`→octet-stream+attachment, no Set-Cookie; USERCONTENT_ORIGIN cookieless separate domain) | live origin/CDN resource = D-PRB.02-1 |
| AC4 8k-word .docx preview <20s + word count + citation spans | met | `apps/convert/src/convert.test.ts` (make8kWordDocx → <20s, words 7–9k, citationSpans>0, no body H1) | "measured in dev" leg = D-PRB.02-1 (measured in-process here) |
| AC5 unconverted spans → `<!-- rhema:unconverted -->` + anchored warnings + Conversion-notes card | met | `convert.test.ts` (iframe → unconverted block + anchored warning); `apps/web/src/server.test.ts` (preview renders count line + warnings + notes card + two actions) | — |
| AC6 import round-trip byte-stable on 2nd pass (six PDFs + docx) | met (docx+synth); PARTIAL (six real PDFs) | `packages/markdown/src/normalize.test.ts` (idempotence corpus); `convert.test.ts` (docx/html/txt/md/pdf 2nd-pass stable + real PDF text extraction) | the SIX REAL PDFs are operator H2 corpus → D-PRB.02-2; PARTIAL-closes D-P0.09-2 (import half) |
| Deliverable 1 fetcher (SSRF, ≤5 redirects, 25MB/20s, allowlist, robots, ≤1/s/host, honest UA, parses nothing, tool path) | met | all fetcher modules + tests; `fetchViaFetcher` composes `evaluateUrl{viaFetcher}` + SSRF + untrusted wrap | REQ-SPEC-25a path exists |
| Deliverable 2 convert (Fargate/Cloud-Run Job shape, no net/DB, memory+decompression cap, sniffed types, never in api) | met | convert modules; sniff never trusts asserted type; no db/net dep | live Job deploy = D-PRB.02-1 |
| Deliverable 3 upload path (presigned PUT + size cond; serve from usercontent origin) | met (code) | `upload.ts` presign seam (size-clamped, content-type unbound) + `serving.ts` | live GCS signed URL + origin = D-PRB.02-1 |
| Deliverable 4 conversion preview (§5.3 side-by-side, count line, warnings, two actions, notes card, `[unconverted]`) | met | `@rhema/ui` ConversionPreview + ConversionNotesCard; web import route + SSR test | live upload wiring (browser→quarantine→convert) = D-PRB.02-1 |
| Deliverable 5 draft creation (v1 imported/human_upload + normalizing pass + word/citation line) | met | `apps/api/src/import.ts` `createImportedDraft` (PGlite test: human_upload v1 + immutable md version + counts) | — |
| Out of scope NOT built (Substack/providers P1.15, editor PRB.07/P1.02, chat attachments P1.11, PDF LLM tiers) | met | none present; PDF converter is text-layer only (LLM reconstruction deferred) | — |
| Cross-cutting: fetcher fetches/never parses; convert parses/never fetches (F41) | met | fetcher returns raw bytes (no parse); convert has no net dep | — |
| Cross-cutting: never a cookie/credential fetch of user content | met | fetch-guarded sends only UA/accept (no cookie/auth); usercontent origin cookieless | — |

## Evidence log

**5.1/5.2 unit + integration (deterministic):**
- `@rhema/markdown` 15 (normalizer idempotence corpus + counts + assembleImportedDoc).
- `apps/fetcher` 54: `ssrf.test.ts` (39 — full IP truth table incl. v4-mapped/v4-compat/NAT64 + bracketed/dotted
  literal + rebinding host); `fetch-guarded.test.ts` (13 — direct-private, redirect→private pinned, DNS
  rebinding, IP-pin passthrough, caps, scheme, wrapUntrusted breakout); `service.test.ts` (robots, rate-limit,
  service handler + 403/429).
- `apps/convert` 10: zip-bomb refused by REAL inflation bound (1 MB cap over a 6 MB-inflating docx), 8k-word
  docx <20 s + counts, unconverted blocks (entity-encoded) + anchored warnings, round-trip stable on docx/html/
  txt/md/pdf incl. real PDF text extraction, serving headers, presign, no-DB purity.
- `apps/api` 3 (createImportedDraft + import routes on PGlite); `apps/web` +8 (import flow SSR).
- **Green gate:** `turbo build lint typecheck` 105/105. **Full suite:** `pnpm test` 1394 pass / 2 skip, no regressions.

**5.3 live:** the ingestion services' live surface (fetcher/convert on Cloud Run, quarantine GCS, usercontent
origin, the browser upload flow, dev-measured 20 s) is deploy-gated → **D-PRB.02-1** (gate-pending, not
fabricated). The SSRF guard, decompression bound, converters, normalizer, and preview render are proven
deterministically in-process; a born-digital PDF is really parsed by pdf.js in-test.

## Self-review (Phase 3/4.3) — fresh-context adversarial review + fixes
An independent fresh-context Staff-Engineer review attacked the SSRF + ingestion surface. Disposition:
- **PRE-EMPTED (fixed before the review returned):** TOCTOU DNS-rebinding (**B1**) → the validated IP is now
  **pinned** for the connect (undici custom `lookup`); IPv4-compatible `::/96` (**S6**) → embedded-v4 decoded;
  bracketed/dotted IPv6 literals → stripped so `net.isIP` recognises them.
- **FIXED (from the review):**
  - **S1** decompression guard trusted declared sizes → rewritten to REALLY inflate each entry with a hard
    `zlib maxOutputLength` budget (cannot be fooled by an under-declared central-directory size).
  - **S2** `<!-- rhema:unconverted -->` blocks didn't escape `-->` (latent stored-XSS + round-trip break) →
    the raw island is HTML-entity-encoded (recoverable, inert, comment-safe).
  - **S3** `wrapUntrusted` breakout via `</document>` → per-fetch **nonce boundary** + the closing token is
    defanged in content.
  - **S4** import not atomic + `n` race → null-head ordering (no dangling ref on partial failure) + `n`-retry
    on the `(project_id, n)` unique collision.
  - **S5** per-hop timeout + drain outside try → a single **overall deadline** across hops + the body drain is
    inside the try (abort → clean `timeout`).
  - **N1** convert `start` pointed at a missing `server.js` → real `main.ts` job entrypoint (`node dist/main.js`).
- **ACCEPTED (documented):** N2 (robots/redirect hops skip the rate limiter — beta politeness), N3 (nested
  footnote-def edge in the normalizer — real fixtures put defs at root). Review **confirmed correct**: decimal/
  octal/hex IPv4 + userinfo + trailing-dot normalization, the CIDR/v6 prefix math, convert import-isolation, the
  SSR preview is XSS-safe (React-escaped `<pre>`, no dangerouslySetInnerHTML), the import column/param mapping +
  frozen⇒promoted invariant.

## Evidence report

**All six ACs met deterministically; the live ingestion legs are gate-pending (D-PRB.02-1), not fabricated.**

| AC | Evidence |
|---|---|
| AC1 SSRF suite (redirect + rebinding) | `apps/fetcher` ssrf(39)+guard(13): IP truth table, redirect→private pinned per hop, DNS rebinding, IP-pin, caps, scheme; TOCTOU-pinned live path |
| AC2 convert no-net/no-DB + zip-bomb | `convert.test.ts` (real-inflation bound refuses the bomb), `serving.test.ts` (no db/net dep) |
| AC3 usercontent attachment/octet-stream + cookieless | `serving.test.ts` |
| AC4 8k-word docx preview <20 s + counts | `convert.test.ts` (in-process; dev measurement = D-PRB.02-1) |
| AC5 unconverted blocks + anchored warnings + notes card | `convert.test.ts` + `apps/web/src/server.test.ts` |
| AC6 round-trip byte-stable (2nd pass) | `normalize.test.ts` + `convert.test.ts` (docx/html/txt/md/pdf); six REAL PDFs = H2 (D-PRB.02-2) |

**Gaps found + closed:** the fresh-context review found 6 real correctness/security defects (S1–S6/B1) — all
fixed with tests (3 pre-empted, 3 from the review); 2 accepted-and-documented (N2/N3) + N1 fixed.

**Deviations/deferrals:** no spec deviation (the F41 split + Cloud-Run-Job shape follow §12.1). Gate-pending:
D-PRB.02-1 (live ingestion infra + upload flow), D-PRB.02-2 (six real PDFs = H2), D-PRB.02-3 (Full-board fetcher
tool in a live run). PARTIAL-closes D-P0.09-2 (import half, markdown level).
