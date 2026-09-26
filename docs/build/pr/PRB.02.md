# PRB.02 — Draft import: `fetcher`, `convert`, conversion preview

Implements `docs/tickets/18_PRB.02__import-fetcher-convert.md` — the beta's step 1 (paste/upload a real
manuscript). Builds the two ingestion services with their SSRF/isolation rules, the canonical Rhema Markdown
import normalizer, the §5.3 conversion preview, and imported-draft creation. The F41 split holds throughout:
**`fetcher` fetches and never parses; `convert` parses and never fetches.**

## Summary

- **`apps/fetcher`** — the only arbitrary-egress component, SSRF-hardened: an IP denylist (RFC1918, loopback,
  link-local incl. IMDS `169.254.169.254` / ECS `169.254.170.2` / `metadata.google.internal`, CGNAT, ULA, v6
  loopback/link-local, v4-mapped/v4-compatible/NAT64), DNS-then-IP checked on **every** redirect hop
  (rebind-proof) and the validated IP **pinned** for the connect (TOCTOU-proof); http(s)-only, ≤5 redirects,
  25 MB / 20 s caps, a content-type allowlist, robots, ≤1 req/s/host, an honest UA. It returns raw bytes and
  **parses nothing**. The client-side `fetcher` tool path (`fetchViaFetcher`) composes the per-run URL policy
  (`evaluateUrl viaFetcher:true`) + the SSRF guard + untrusted-wrapping (REQ-SPEC-25a, §12.8a).
- **`apps/convert`** — no network, no DB: content-type is **sniffed** from magic bytes (never trusts the
  client-asserted type); a ZIP (docx) is checked by a **decompression-ratio guard** (central-directory parse,
  no inflation) that refuses a zip-bomb before anything is decompressed; docx (mammoth→turndown), html
  (turndown), pdf (pdf.js text layer), txt, md → canonical Rhema Markdown; unconvertible spans are kept verbatim
  in `<!-- rhema:unconverted -->` blocks with anchored warnings.
- **`@rhema/markdown`** (new) — the canonical Rhema Markdown profile (research/9 §4): an **idempotent**
  normalizer (remark; no body H1, footnotes renumbered + trailed, no hard wraps, one blank line between blocks,
  NFC, smart quotes preserved), the structured count line, and the front-matter builder. This is REQ-DATA-9(d)'s
  import half.
- **Upload/serving** — a size-conditioned presigned-PUT seam to a quarantine prefix; uploaded bytes serve only
  from the cookieless `*.rhemausercontent.com` origin as `attachment`/`octet-stream` (REQ-ARCH-24).
- **`apps/api`** — `createImportedDraft` (v1 `origin=human_upload`, immutable markdown version via the content
  store) + import preview/create routes (conversion runs in `convert`, never `api`, via the `Converter` seam).
- **`apps/web`** — the §5.3 conversion preview: source-beside-converted, the count line, anchored warnings, and
  the two actions (Create and fix later / Fix now), plus the Conversion-notes card. SSR, progressive-enhancement.
- **`@rhema/contracts`** — the `ConversionResult` / warning / unconverted-block types + the `QUALITY_VERDICTS`
  enum.

## Design decisions

- **New `@rhema/markdown` package** houses the canonical normalizer (remark-based) so `convert`, the api draft
  path, and (later) the P1.02 editor share one idempotent profile; the ProseMirror schema + the full md↔PM
  round-trips (REQ-DATA-9 b/c) remain P1.02.
- **SSRF pinning**: the guard resolves + validates every hop and the live undici forwarder connects to the
  **validated IP** (custom `lookup`), closing the resolve-then-connect TOCTOU while keeping TLS SNI = hostname.
- **Decompression guard** parses the ZIP central directory directly (declared sizes) — it never inflates, so a
  bomb is refused up front; ZIP64-sized entries are refused conservatively.
- **PDF** is text-layer extraction only (pdf.js); LLM reconstruction of scanned/broken PDFs is P1.15 (a parse
  failure degrades to `unreadable`, never crashes).

## Security review

An independent fresh-context adversarial review attacked the SSRF + ingestion surface. Fixes landed for all
real findings: **TOCTOU DNS-rebinding** (the validated IP is pinned to the connect), the **decompression guard**
now bounds *real* inflation (`zlib maxOutputLength`) rather than trusting declared sizes, the **`<!-- rhema:
unconverted -->`** islands are entity-encoded (no `-->` breakout / latent XSS), **`wrapUntrusted`** uses a nonce
boundary, **import** is ordered against partial-failure + retries the `(project_id, n)` race, the fetch
**timeout** is a single overall budget, and `::/96` / bracketed-IPv6 literals are decoded. Confirmed-correct:
decimal/octal/hex IPv4 + userinfo normalization, the CIDR/v6 math, convert import-isolation, XSS-safe SSR preview.

## Verification

- `pnpm turbo build lint typecheck` → **105/105**. `pnpm test` → **1394 pass / 2 skip**, no regressions.
- New tests: `@rhema/markdown` 15 (idempotence + counts), `apps/fetcher` 52 (SSRF truth table + guard + tool +
  robots + rate-limit + service), `apps/convert` 10 (zip-bomb, 8k-word docx <20 s, unconverted blocks, round-trip
  incl. real PDF text extraction, serving/upload/no-DB), `apps/api` 3 (import), `apps/web` +8 (import flow).

## Requirement ids

REQ-ARCH-4 (amended), REQ-ARCH-22, REQ-ARCH-23 (amended), REQ-ARCH-24 (amended), REQ-DATA-9(d, import half),
REQ-INGEST-8 (pipeline half), REQ-INGEST-12, §5.3 preview (REQ-IDE-5 upload leg), REQ-SPEC-25(a).

## Acceptance criteria → evidence

| AC | Status | Evidence |
|---|---|---|
| AC1 SSRF suite (redirect + rebinding) | met | `apps/fetcher/src/ssrf.test.ts` (38), `fetch-guarded.test.ts` (11: pinned per-hop re-resolve, rebinding, IP-pin, caps) |
| AC2 convert no-net/no-DB + zip-bomb | met | `convert.test.ts` (bomb → DecompressionLimitError), `serving.test.ts` (no db/net/gcs dep) |
| AC3 usercontent attachment/octet-stream + cookieless | met | `serving.test.ts` |
| AC4 8k-word docx preview <20 s + counts | met | `convert.test.ts` (in-process; dev-measured leg = D-PRB.02-1) |
| AC5 unconverted blocks + anchored warnings + notes card | met | `convert.test.ts` + `apps/web/src/server.test.ts` |
| AC6 round-trip byte-stable (2nd pass) | met (docx/synth+real-PDF path); the SIX REAL PDFs = H2 (D-PRB.02-2) | `normalize.test.ts`, `convert.test.ts` |

## Deferrals (gate-pending, not fabricated)

- **D-PRB.02-1** — live ingestion infra + the live upload→convert→preview flow (Cloud Run services, VPC
  no-route assertion, quarantine bucket + presigned PUT, usercontent origin, dev-measured 20 s); rides the
  deploy + D-P0.01-7.
- **D-PRB.02-2** — the six REAL PDFs corpus (operator H2); synthesized fixtures + the pdf.js path prove the
  pipeline now.
- **D-PRB.02-3** — the Full-board fetcher tool wired into a live Editor run + `fetch_log` join (rides D-P0.08-1).
- PARTIAL-closes **D-P0.09-2** (REQ-DATA-9d import half, markdown level).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
