# ONB.1 — Text import in ≤ 20 s, a held draft that survives until consumed, faithful imports

- **Sequence:** 71 (round 3) · **Phase:** round 3 — launch readiness · **Kind:** ticket · **Tag:** ux
- **base_branch:** current checkout (the chain tip the previous round-3 row left; stacked PR)
- **Depends on:** ACT.1
- **Scope (one line):** the text-format (md/txt/html/docx) import preview reaches p95 ≤ 20 s (today 3.5–5.6 min for a 1,003-word .md — the convert Cloud Run Job's cold start) with `convert`'s isolation intact; the landing-held draft (IndexedDB `rhema-hold`) persists across page loads until it is consumed into a project or discarded; import fidelity (the H1 title, relative figure paths that 404); the `import_preview_p95_s` §13.5 SLO signal probed and alerting.
- **Spec §§:** 15.1 (drop-zone behaviour: IndexedDB ≤ 10 MB, ingested within 20 s), 15.3 (a hero-dropped file wins precedence), 5.3 (the conversion preview + warnings), 9.5 (canonical Markdown — no body H1, title in front-matter; quality verdicts), 12.1 (the `convert` row — no network, no DB), 13.3 (conversion only in `convert`), 13.5 (SLO row added 2026-09-30), Appendix A.9 note (REQ-GROWTH-1 amended)
- **REQ coverage:** REQ-GROWTH-1 (amended; primary), REQ-ARCH-23, REQ-ARCH-4 (convert has no network), REQ-ARCH-34 (the new SLO row), REQ-INGEST-7 (the unresolved-figure warning) (stamp in the PR)
- **Absorbs (backlog):** BL-60 (PR-R4), BL-64 (PR-R5)
- **Run:** `implement-spec spec=docs/tickets/71_ONB.1__import-latency-and-held-draft.md`
- **Gate status:** an infra cost delta > $15/month pauses for the operator (a warm convert path costs money — measure it in the preview); replacing or deleting the convert Job or the user-content bucket is a stateful change → paused; any ADR that relaxes the 20 s target pauses; no backfill of already-imported drafts (a one-off prod data write); the journey legs need JOURNEY.1's test mailbox (HUMAN-H7)
- **Live stage:** Stage A: code + tests ($0). Stage B: deploy (pre-authorized if the preview shows no stateful replace/delete and a ≤ $15/mo delta) + preview-only imports on a test tenant + the N1/N3 journeys ($0 inference)

## Goal
REQ-GROWTH-1 promises a hero drop that is held client-side until signup and ingested into a new project within 20 s.
On 2026-09-30 neither held (PR-R4):
- **Import latency.** A 1,003-word `.md` took **3.5–5.6 min** to "convert", with the copy "a cold start can take a few
  minutes". The convert Cloud Run Job's cold executions run ~2.5–4 min (PRB.20/21's own measurement).
- **The held draft.** A landing-held draft attached only on the *first* post-login view. Any later visit showed "Your
  held file is here — upload it to start" over an empty file input, and Continue answered "Upload a file or paste the
  text."
- **Import fidelity (PR-R5).** The H1 came back as an H2. Imported drafts reference relative figure paths
  (`figure_1_five_questions.png` …) that 404 on the Page.

REQ-GROWTH-1 is amended so that 20 s is a §13.5 SLO (`import_preview_p95_s` ≤ 20 for text formats) and a held draft
persists until consumed. This ticket makes both true, and journey steps N1 and N3 green.

## Load (read these — do not re-read others)
- `docs/build/planning/2026-09-30_planning-ledger.md` — row 71, § Journey step registry (N1, N3), the standing
  authorization (the $15/mo cost-delta line).
- `docs/build/reports/2026-09-30_prod-design-review.md` — PR-R4, PR-R5.
- `docs/build/LEDGER.md` PHASE LOG rows for PRB.20 and PRB.21:
  - the convert Job's live topology and cold-execution timings
  - the 202-pending + meta-refresh poll
  - the `converting/` dedupe marker
- ADR-016 (journeys); ADR-017 (pool rule for any new read).
- Spec §15.1 drop-zone paragraph, §5.3 conversion preview, §9.5 canonical Markdown, §12.1 `convert` row, §13.3
  "conversion runs only in `convert`", §13.5 SLO table, the Appendix A.9 note.
- Code (anchors — re-confirm at build time):
  - `apps/web/src/client/landing.ts`:
    - ~15–29 (`HOLD_DB = "rhema-hold"`, `HoldRecord.claimed`)
    - ~88 `markClaimed`
    - ~164–192 the claim island: it calls `markClaimed()` **immediately after hydrating the file input, before any upload
      succeeds**, and never deletes the bytes.
    - The built bundle is `apps/web/public/landing.js`.
  - `apps/web/src/pages.tsx` ~1061–1066 (the `data-held` form + notice); `apps/web/src/copy.ts` ~173 (`convertingFmt`
    "a cold start can take a few minutes"), ~2102/2120 (held copy).
  - Import path:
    - `apps/api/src/import.ts` ~36 `IMPORT_PREVIEW_WAIT_MS` 25 s, ~251/272
    - `apps/web/src/data.ts` ~192 (20 s wait)
    - `apps/web/src/server.ts` ~5247 `IMPORT_PREVIEW_POLL_SECONDS`
    - `packages/live-clients/src/ingest.ts` ~343 `createConvertJobPreview` (`jobs:run` → Execution poll → readback)
  - `infra/pulumi/compute.ts` ~352–380: the convert **Job** (gcsfuse `/usercontent` mount, SA writes `converted/` only,
    no `vpcAccess`). Re-verify the claimed "no network route": a Cloud Run workload without `vpcAccess` still has default
    internet egress.
  - `apps/convert/src/` (`main.ts`, `convert.ts`, `converters.ts`, `sniff.ts`, `decompression-guard.ts`,
    `serving.test.ts`); `packages/markdown/src/normalize.ts` ~8–24 `demoteHeadings` (the canonical "no body H1 — title
    lives in front-matter" rule; the demotion itself is by design).
  - SLO:
    - `packages/orchestrator/src/slo.ts` (`SLO_SIGNALS`; `slo_samples` from migration 0042)
    - `infra/pulumi/monitoring.ts` ~33–47 `SLO_ALERT_SIGNALS`

## In scope — deliverables
1. **A fast text-format convert path** (REQ-GROWTH-1, REQ-ARCH-23/4). **Owned decision → ADR.** Options include:
   - a warm `convert` Cloud Run *service* (min instances) serving md/txt/html/docx previews
   - a slimmer image with startup CPU boost and pre-warmed executions
   - an equivalent

   Two limits bind: text formats must reach p95 ≤ 20 s including the idle-cold case, and the measured cost delta must
   be ≤ $15/mo. Whatever the topology, `convert` keeps §12.1/§13.3's properties, each with a test:
   - no DB credential
   - **no egress route**, proven by an egress probe
   - memory cap, decompression-ratio limit, content sniffing
   - an SA that writes `converted/` only
   - never inside `api` or `fetcher`

   PDFs and the visual tier stay on the existing Job.
2. **Honest pending UX:** the preview page states a real expected wait for the format, and the "cold start can take a
   few minutes" copy goes. Polling and the 202-pending contract are unchanged unless the ADR changes them.
3. **The held draft persists until consumed** (REQ-GROWTH-1 amended).
   - The claim island re-hydrates the file input on **every** load while a hold exists.
   - The hold is deleted, bytes included, only when the server confirms the project was created from it: a
     token-matched `data-held-consumed` marker on the success page, or an equivalent.
   - The user sees an explicit "Discard held file" control.
   - Where `DataTransfer` is unavailable, the notice says exactly what to do. It never shows an empty input under "your
     held file is here".
   - The hold carries no account binding off-device, and a pre-auth beacon still never carries bytes or filename.
4. **Import fidelity** (PR-R5). **Owned decision → ADR.**
   - The demoted H1 becomes the draft's title: front-matter `title`, and the project-title default when none was
     typed. The Page renders it as the title, not as a body H2. Voice samples keep §9.5's canonical form.
   - A relative image reference whose file was not part of the import is never emitted as a live URL. It becomes a
     preview warning ("figure_1_five_questions.png wasn't included — add it or remove the reference", REQ-INGEST-7
     `partial` verdict) plus an inert placeholder, so the Page makes no 404 request.
5. **The `import_preview_p95_s` signal** (§13.5 row; REQ-ARCH-34):
   - the api records presign→preview-ready latency per text-format import into `slo_samples`, excluding JOURNEY.1 test
     tenants
   - an `SLO_SIGNALS` probe (p95 over the window; breach > 40 s for 30 min)
   - the alert policy in `monitoring.ts`
   - a line in `docs/ops/slo-review.md`

## Out of scope
- `/app/new` shell styling: **UX.2**. The edit path and `/v/working`: **EDIT.1**. Other SLOs: **SLO.1**. The Showcase
  seed and dossier: **HOT.1**.
- PDF / scanned / visual-tier conversion latency: not a text format; the SLO row excludes it.
- Re-importing or rewriting already-imported drafts (e.g. `my-first-project` v1's figure links): a one-off prod data
  write; the operator's call via HUMAN-H7.
- Figure upload and management: P1.13 (existing); this ticket only stops dead links.

## Acceptance criteria
- [ ] The text formats convert through the new path in a local harness run of the fixtures (1,003-word `.md` planted-error
      essay, `.txt`, `.html`, `.docx`). Each security property of deliverable 1 is asserted by a test, including an
      egress attempt that fails. *(deterministic)*
- [ ] Landing island (jsdom/fake-indexeddb):
      - a hold survives sign-in and two further `/app/new` loads with the file input populated each time
      - it is deleted only after a matching consumed marker
      - Discard deletes it

      Re-introducing claim-on-attach fails the test. *(deterministic)*
- [ ] An imported `.md` with an H1 yields a draft whose title equals the H1 with no body H2 duplicate. A voice-sample
      import keeps its canonical form. *(deterministic)*
- [ ] A `.md` with `![](figure_1.png)` yields a preview warning and an inert placeholder, and the rendered Page issues
      zero requests for `figure_1.png`. *(deterministic)*
- [ ] `import_preview_p95_s` is probed from `slo_samples`, excludes test tenants, and has an alert policy (IaC test).
      *(deterministic)*
- [ ] Live on prod, test tenant, preview-only (no project rows): ≥ 20 text-format imports, including ≥ 3 after ≥ 15 min
      idle, reach **p95 ≤ 20 s**. Per-import timings, the measured monthly cost delta, and an egress probe from the new
      convert path are recorded in the run ledger. *(agentic — live, $0)*
- [ ] **Journey step N1 green** on the deployed stage via the JOURNEY.1 harness: a draft dropped on the landing is held
      across the magic-link sign-in and two later page loads, with the file attached each time. Flip the expected-red
      flag and commit screenshots. *(agentic — live, $0)*
- [ ] **Journey step N3 green:** the held draft becomes a project whose conversion preview renders in ≤ 20 s. Flip the
      expected-red flag and commit screenshots. *(agentic — live, $0)*
- [ ] verification green; every new behaviour has a test that fails if it is removed; requirement ids stamped in the PR; anything not automatically verifiable is a `DEFERRALS.md` row with its compensating control; ADRs written for every deviation and owned decision; `BUILD_INDEX.md` row and `LEDGER.md` advanced. *(agentic — the universal phase-gate AC)*

## Requirement IDs to satisfy and stamp in the PR
REQ-GROWTH-1 (amended), REQ-ARCH-23, REQ-ARCH-4, REQ-ARCH-34 (the new SLO row), REQ-INGEST-7.

## Cross-cutting invariants
- **#2** TypeScript only; licence allowlist for any new converter dependency.
- **#10** Telemetry and SLO samples carry durations and format kinds, never draft text or filenames.
- **#12** REQ-SPEC-29: N1 and N3 are proven by walking them, and the deployed provenance is recorded as the chain-tip
  SHA.
- **#13** REQ-SPEC-30: the SLO probe runs on the system executor with aggregate-only output. The latency write happens
  on the user-serving path under the tenant's scope.
- **#14** The preview's wait copy is truthful.

## Notes
- **Owned decisions → write ADRs:**
  - the fast convert topology. If it changes §12.1's "Job per batch" shape, the ADR records it as a deviation with
    every isolation property preserved. That is not a relaxed target.
  - the H1→title rule and the unresolved-figure handling
  - the held-draft consumed handshake
- **Cost:** the measured cost delta decides whether the deploy is pre-authorized. Above $15/mo, stop at Stage A plus a
  costed ADR and pause for the operator.
- **Privacy:** a shared device keeps the hold until it is consumed or discarded. Make Discard prominent, and never
  upload the hold for an account that did not act on it.
- **DEFERRALS rule:** anything not verifiable at build time, or blocked on HUMAN-H7, becomes a `D-ONB.1-<n>` row. So
  does a cost delta needing the operator.
