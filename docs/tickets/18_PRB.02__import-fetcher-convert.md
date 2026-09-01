# PRB.02 — Draft import: `fetcher`, `convert`, conversion preview

- **Sequence:** 18 of 50
- **Phase:** RB — Review beta
- **base_branch:** current checkout (stacked PR chain)
- **Depends on:** P0.01 (service scaffolds, quarantine buckets), P0.02 (draft/version model), PRB.01 (shell)
- **Run:** `implement-spec spec=docs/tickets/18_PRB.02__import-fetcher-convert.md`

## Goal
The beta's step 1 — paste/upload a real manuscript: the `fetcher` (network-only, no parsers) and
`convert` (no-network, no-DB) services with their SSRF/isolation rules, upload/paste →
canonical Rhema Markdown, the §5.3 conversion preview, and draft/version creation. Also the
client-side `fetcher` tool path runs use for Full-board Editor fetches and in-run link reads.

## Load
- Spec §12.1 (fetcher/convert service rows), §13.3 SSRF-and-conversion bullet verbatim
  (REQ-ARCH-22/23/24 amended: DNS-then-IP denylist pinned across redirects, IMDSv2 hop limit,
  quarantine presigned PUT, content-type sniff at conversion, `*.rhemausercontent.com` separate
  origin), §5.3 (conversion preview: source-beside-converted, count line, warnings with anchors,
  Create-and-fix-later vs Fix now, `<!-- rhema:unconverted -->` blocks), §9.5 upload rules (formats,
  caps, quality verdicts — the *sample* manager UI is PRB.10/P1.15; the pipeline is shared),
  §11.5/§11.6 (import normalizing first pass — REQ-DATA-9d's import half), §12.8(a) (Full-board
  fetcher routing for Editor fetches — wire the tool; policy from P0.05).

## In scope — deliverables
1. **`apps/fetcher`:** http(s)-only; DNS-then-IP denylist (RFC1918, loopback, link-local incl. IMDS
   and ECS credential endpoints, CGNAT, ULA) pinned across ≤5 redirects; 25 MB / 20 s caps;
   content-type allowlist; robots; ≤1 req/s/host; honest UA; quarantine-prefix-only task role;
   **parses nothing**; in-run "read this link" + Full-board Editor fetch path under the hook's URL
   policy (review 13 F41).
2. **`apps/convert`:** Fargate task, no network route, no DB; memory cap; decompression-ratio
   limit; quarantine bytes → canonical Rhema Markdown (md/docx/pdf/txt/html at beta); sniffed
   content types; conversion runs never in `api`.
3. **Upload path:** presigned PUT with size conditions to quarantine; serving only from the
   separate usercontent origin with `Content-Disposition: attachment` / octet-stream defaults.
4. **Conversion preview** per §5.3: side-by-side, count line, anchored warnings, two actions;
   warnings → a Conversion-notes card on the (beta) timeline + `[unconverted]` markers.
5. **Draft creation:** `v1 (imported)` / `origin=human_upload`; the normalizing first pass so
   REQ-DATA-9(b) idempotence holds post-import; word count + citation-span detection line.

## Out of scope
- Provider connectors (Substack etc. — P1.15). PDF LLM-reconstruction quality tiers beyond the
  basic TS pipeline (P1.15; keep the §9.5 quality verdict plumbing).
- The editor (PRB.07 CodeMirror; P1.02 Tiptap). Chat attachments (P1.11).

## Acceptance criteria
- [ ] SSRF suite: IMDS/ECS-credential/loopback/private targets denied incl. via redirect and DNS
      rebinding fixtures (REQ-ARCH-22). *(deterministic)*
- [ ] `convert` has no network route (SG/route assertion) and no DB credentials; a zip-bomb fixture
      is refused by the decompression limit (REQ-ARCH-23). *(deterministic)*
- [ ] Uploaded HTML served from the usercontent origin as attachment/octet-stream; cookieless
      origin asserted (REQ-ARCH-24). *(deterministic)*
- [ ] An 8k-word `.docx` renders its preview within 20 s with word count and citation spans
      (REQ-GROWTH-1's ingest half, measured in dev). *(deterministic)*
- [ ] Unconvertible spans land verbatim in `<!-- rhema:unconverted -->` blocks with anchored
      warnings; Create-and-fix-later produces the Conversion-notes card. *(deterministic)*
- [ ] Post-import round-trip: `markdown → PM-profile-normalized markdown` is byte-stable on the
      second pass for the six real PDFs + `.docx` fixtures (REQ-DATA-9d at the markdown level).
      *(deterministic)*

## Requirement IDs to satisfy and stamp in the PR
REQ-ARCH-4 (amended), REQ-ARCH-22, REQ-ARCH-23 (amended), REQ-ARCH-24 (amended), REQ-DATA-9 (d,
import half), REQ-INGEST-8 (format/caps, pipeline half), REQ-INGEST-12, §5.3 preview behavior
(REQ-IDE-5's upload leg for the beta), REQ-SPEC-25(a) (fetcher routing path exists).

## Cross-cutting invariants — re-check before opening the PR
- `fetcher` fetches and never parses; `convert` parses and never fetches (the F41 split).
- Never a cookie/credential fetch of user content (REQ-INGEST-5's rule applies platform-wide).
- See 00_MANIFEST.md § Cross-cutting invariants.

## Notes
This ticket **owns** the two ingestion services and the canonical-markdown import pass. PRB.10
(voice samples) and P1.15 (providers) reuse them; P1.02's editor consumes the same profile.
