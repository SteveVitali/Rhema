# ONB.1 — run ledger (text import ≤ 20 s, a held draft that survives until consumed, faithful imports)

## Spec / Base / Branch / Config
- Spec: `docs/tickets/71_ONB.1__import-latency-and-held-draft.md` (chain row 71; spec §§15.1, 15.3,
  5.3, 9.5, 12.1, 13.3, 13.5 + Appendix A.9; REQ-GROWTH-1 amended primary, REQ-ARCH-23, REQ-ARCH-4,
  REQ-ARCH-34, REQ-INGEST-7; absorbs BL-60 + BL-64).
- Base: `stevevitali/act-1-trial-entitlement` @ `dfbb466`.
- Branch: `stevevitali/onb-1-import-latency-held-draft`. Stacked PR, mergePolicy=OPERATOR, never merge.
- Depends on: ACT.1 (landed on this chain tip).
- **Harness:** Devin CLI (Cognition agentic coding CLI), Anthropic Claude.
- **Started:** 2026-10-02
- Gate answers (ticket's own pre-authorizations): deploy is pre-authorized when `pulumi preview`
  shows no stateful replace/delete and a measured monthly cost delta ≤ $15 (a warm convert path
  costs money — measure it); replacing/deleting the convert Job or the user-content bucket is a
  stateful change → paused (neither is touched — the Job stays as the fallback + the ingest.sync
  path); no ADR relaxes the 20 s target; N1/N3 need JOURNEY.1's test mailbox (HUMAN-H7).
- Spend: Stage A $0. Stage B: preview-only imports (no project rows → $0 inference) on a test
  tenant + the N1/N3 journeys + a cost-delta + egress-probe measurement.

## Deferrals read (start-of-run)
- `D-PRB.02-1` — DONE (PRB.20): the live upload→convert→preview path is proven; its residual note
  ("cold Job executions run ~2.5–4 min live; the <20 s clause reads against warm timing") is exactly
  what this ticket fixes.
- `D-P1.17-2` — PARTIAL: the drop-zone→signup round-trip leg rides N1/N3 (owner ONB.1) — annotate
  with evidence after Stage B; Lighthouse/axe + funnel metrics stay HUMAN.
- `D-PRB.02-2` / `D-PRB.02-3` / `D-PRB.21-1` — open rows owned elsewhere; unaffected.
- New rows this ticket adds: the live Stage B legs if they cannot run from this environment
  (deploy + preview-only timing matrix + journeys + cost delta).

## Context map (re-confirmed at build time)
- Upload→preview path: `apps/web/src/data.ts:1057` (`uploadKey` presign→PUT, replay skips upload)
  → `previewWorkspaceImport` → api `POST /import/preview` (`apps/api/src/import.ts:241`) →
  `Converter.preview(quarantineKey, {waitMs})` → `createConvertJobPreview`
  (`packages/live-clients/src/ingest.ts:343`) → `jobs:run` + Execution poll + `converted/` readback.
  `converting/` marker (PRB.21) dedupes concurrent previews.
- Convert Job: `infra/pulumi/compute.ts:379` — gcsfuse `/usercontent` mount, `convert` SA (bucket
  read + `converted/`-only write, `infra/pulumi/iam.ts:129-149`), `timeout 600s`, `maxRetries 1`,
  NO `vpcAccess`, no env/secrets. Cold executions measured 2.5–4 min live (D-PRB.02-1 note).
- `convertBytes` (`apps/convert/src/convert.ts:66`): sniff → decompression guard → per-format
  converter → `<!-- rhema:unconverted -->` blocks → `normalizeMarkdown` → counts/warnings →
  schema-validated `ConversionResult`.
- Canonical rules: `packages/markdown/src/normalize.ts` — `demoteHeadings` (no body H1; title in
  front matter), `renumberFootnotes`; `profile.ts` exports `parseCanonical`/`stringifyCanonical`
  (the shared remark pipeline: frontmatter + GFM + math).
- Held draft: `apps/web/src/client/landing.ts` — IDB `rhema-hold`/`holds`/`landing-dropzone`
  (`{token,name,type,size,bytes,claimed}`); drop-zone hold → beacon → `/signup?…&held=1`; the
  /app/new claim hydrates via DataTransfer then `markClaimed()` — **the PR-R4 defect**: a claimed
  hold never re-hydrates, so later loads show an empty input under "your held file is here".
- Web surfaces: `apps/web/src/pages.tsx:1083-1247` (`data-held` form, `data-held-notice`,
  `landing.js` script, `ConversionPreview` with `hiddenFields`); `server.ts:1805-2005` (`/app/new`
  GET/POST, `/app/new/preview` poll, `/app/new/create`); `newProjectForm:1752` +
  `newProjectPollUrl:1775`; `/p/:project` route at `server.ts:2926` renders `projectElement`
  (pages.tsx:613).
- SLO: `slo_samples(signal, value_ms, workspace_id, run_id, at)` (migration 0042; written by api
  `editor-routes.ts:398` + `sse-routes.ts:124`); probes in `packages/orchestrator/src/slo.ts`
  (`TEST_TENANT_FREE` exclusion); alert-per-signal in `infra/pulumi/monitoring.ts:32`.
- Title: `ConversionResult` has no title field; `projects.title` is set from the form
  (`apps/api/src/project-routes.ts:175`, 422 when empty); `assembleImportedDoc` puts title in front
  matter for the ingest package's canonical docs.
- Figures: `![alt](url)` → PM `figure` node (`packages/editor/src/schema.ts:135`): `src=""` renders
  `.rm-figure-placeholder` (no request); `md-to-pm.ts:127` lifts lone-image paragraphs to figures;
  `pm-to-md.ts:180` round-trips `![alt](src)`.
- Serving: `apps/convert/src/serving.ts` — the cookieless `usercontent.rhema.tools` policy is
  unchanged (only PNG/JPEG/GIF/WebP inline).

## Architecture decisions (→ ADRs)
1. **ADR-044 — warm `convert-svc` Cloud Run service + Job fallback.** A second Cloud Run
   *service* runs the SAME `apps/convert` image with `args: ["--serve"]` (new `serveConvert` HTTP
   mode): `POST /convert {quarantineKey}` → read `/usercontent/<key>` via the same gcsfuse mount →
   `convertBytes` → write `converted/<ws>/<id>.json` through the mount → return the result JSON.
   Isolation properties preserved: the same `convert` SA (bucket read + `converted/`-only write),
   NO `vpcAccess`, no env/secrets, no GCS client in the image, invoker-gated ingress
   (INTERNAL_LOAD_BALANCER + `roles/run.invoker` for the api SA only). `minInstanceCount: 1` on
   prod (warm — est. ≈$13/mo idle, inside the ≤$15 pre-authorization), 0 elsewhere. The api's
   converter becomes service-first with the Job as fallback on service errors (`createConvertServicePreview`);
   the Job stays for `ingest.sync` + PDF/slow paths + resilience. §12.1's "Job per batch" remains
   the batch topology; the ADR records the interactive-preview leg deviating to a service.
2. **ADR-045 — the leading H1 is the title default.** `ConversionResult.title?` (optional,
   additive). `extractLeadingTitle` (packages/markdown) removes a document-leading H1 and returns
   it; `convertBytes` applies it before normalize (so the H1 never reaches the body as an H2 dup).
   The api's project create resolves `title = form.title || result.title` — the H1 is the
   *default*; an explicitly typed title still wins (ticket wording: "the project-title default
   when none was typed"). The preview shows the resolved title.
3. **ADR-046 — unresolved relative figures become inert placeholders.** `inertUnresolvedImages`
   (packages/markdown) rewrites `![alt](rel)` targets that are not `https?://` or `data:` to
   `![alt-or-basename]()` → the PM figure node's `src=""` renders `.rm-figure-placeholder` — zero
   requests, ever. `convertBytes` emits an `image_dropped` warning per path
   ("figure_1.png wasn't included — add it or remove the reference") and degrades `clean`→`partial`
   (REQ-INGEST-7). Reference-style definitions used by `![alt][id]` are inerted the same way.
4. **ADR-047 — the held-draft consumed handshake.** The hold persists in IDB (the `claimed` flag
   is ignored — it was the PR-R4 defect); the island re-hydrates on every `/app/new` load while a
   hold exists (the server now always renders `data-held="1"` + the notice + `landing.js`; a
   missing hold is a silent no-op — nothing promised "a hold is here" server-side since the
   server cannot see IDB). A hidden `heldToken` input rides the form → the poll URL → the
   preview's hidden fields → `/app/new/create`; after a successful create the redirect carries
   `?hc=<token>` and the project page stamps `data-held-consumed="<token>"` + `landing.js`; the
   island deletes the hold ONLY when the marker token matches the hold token. A prominent
   **Discard** control (island-injected, and a no-JS server route is not needed — discard is
   device-local by definition) deletes the hold + clears the input. The token is stamped only
   when the held bytes actually attached — an unrelated upload never consumes the hold.
   `DataTransfer` unavailable ⇒ the notice says to attach the file manually — never an empty
   input under "your held file is here".

## SLO design (as shipped)
- `slo_samples` gains a nullable `detail text` column — migration `0052_slo_samples_detail.sql`
  (additive; the 0042 writers leave it NULL).
- The api stamps `rhema:ipr:<quarantineKey> = now (NX EX 900)` at `/import/presign` (the clock the
  ticket names: presign→preview-ready); `/import/preview` claims-or-reads it on every call (first-seen
  wins — a key minted before the feature still gets stamped at its first preview) and, when a ready
  result returns, writes
  `insert into slo_samples (signal, value_ms, workspace_id, detail) values ('import_preview_ms', $1,$2,$3)`
  with `detail = result.sourceFormat` — duration + format kind, never text or filenames
  (invariant #10). The insert is awaited but `.catch`-swallowed — a single indexed insert is µs
  against the multi-second conversion it measures, and a missing/partial migration just drops the row
  (fire-and-forget raced PGlite's single wasm connection in tests: the awaited-catch shape is both
  faster-real and deterministic). `timing.release` clears the stamp so a stray re-poll never
  double-counts; without the seam (tests) the call's own elapsed is sampled.
- `SLO_SIGNALS` += `import_preview_p95_s`: target "import preview p95 ≤ 20 s for text formats —
  alert p95 > 40 s for 30 min"; probe = `percentile_cont(0.95)` over `slo_samples` rows
  `signal='import_preview_ms'`, `detail in ('md','txt','html','docx')` (the format-kind filter —
  a slow PDF through the same route is out of the SLO's scope, never a breach), 30-min window,
  `TEST_TENANT_FREE` (nullable workspace → always counted, matching the existing samples probes).
- `SLO_ALERT_SIGNALS` += `import_preview_p95_s` → one AlertPolicy off `rhema_slo_violations`.
- `docs/ops/slo-review.md` carries the row (10 DB-backed signals now).

## Test matrix
| Behaviour | Test | File |
|---|---|---|
| title extraction (leading H1 → title; not-→same; second-H1 demoted; frontmatter preserved) | unit | `packages/markdown/src/import-doc.test.ts` |
| unresolved images → empty-url + basename alt; https/data kept; reference-style definitions; idempotent | unit | same |
| convert: `.md` H1 → `result.title`, body has no H1/H2 dup; `![](figure_1.png)` → `image_dropped` warning + `![](…)`-inert + partial verdict | unit | `apps/convert/src/convert.test.ts` |
| serve mode: POST /convert → converted JSON + file written; 413 zip-bomb; healthz; **no outbound fetch during a conversion round-trip** | unit (tmp dir) | `apps/convert/src/server.test.ts` |
| service-first converter: cache-hit, service OK, service-error→Job fallback, timeout→null | unit | `packages/live-clients/src/ingest.test.ts` |
| api: presign stamps the timer; preview writes `import_preview_ms` on ready only; format detail; pending writes nothing; H1 title default + typed-title wins | unit | `apps/api/src/import.test.ts` / `project-routes.test.ts` |
| SLO probe: sample rows drive `import_preview_p95_s`; test-tenant rows excluded; empty when no data | unit | `packages/orchestrator/src/slo.test.ts` |
| island: hold persists across two more loads (file input populated); delete only on matching `data-held-consumed`; Discard deletes; claim-on-attach regression fails; DataTransfer-less notice | jsdom + fake-indexeddb | `apps/web/src/client/landing.test.ts` |
| web: `data-held`/`data-held-notice` always render; `heldToken` round-trips form→poll→preview→create→`?hc=`; `/p/:slug` stamps `data-held-consumed` + script; H1-resolved title line on preview | SSR tests | `apps/web/src/server.test.ts` / `pages` tests |
| IaC: convert-svc has no vpcAccess + convert SA + invoker-only; alert policy covers the signal | unit/preview | `infra` tests / `pulumi preview` |

## Execution log
- 2026-10-02 — inspection complete (see Context map); design set: ADR-044/045/046/047 as above.
- 2026-10-02 — **Stage A implemented + deterministic-green.** Contracts `title?`; markdown
  `extractLeadingTitle`/`inertUnresolvedImages` + tests; convert `--serve` HTTP mode
  (`server.ts`) + title/figure wiring + tests (15 convert + 4 serve incl. the no-egress
  conversion round-trip); live-clients `createConvertServicePreview` (read-back → POST /convert
  → Job fallback) + `createImportPreviewTracker` (Redis `rhema:ipr:*` NX EX 900) + tests (26);
  api `CONVERT_SERVICE_URL` env + composite converter + `timing`/`now` seams + `slo_samples`
  write (`detail` = sourceFormat) + H1-title default in project create; migration
  `0052_slo_samples_detail.sql`; probe + alert + `slo-review.md` + probe test (format scoping,
  test-tenant exclusion, breach); web held-draft plumbing end-to-end (`data-held` unconditional,
  `heldToken` → `?hc=` → `data-held-consumed`, Discard, landing.js on /app/new + project page);
  landing island rewritten (no claim-on-attach, 16 tests); infra `convert-svc` (internal ingress,
  api-invoker, warm prod min=1, no vpcAccess) + 10 IaC tests; journeys N1/N3 real one-context
  magic-link legs (expected-red until Stage B); ADRs 044–047 + index regen.
- 2026-10-02 — **Gates green:** `pnpm turbo build lint typecheck` 135/135; `pnpm test` **4,111
  pass / 0 fail**; `check:licenses` 609 OK; `check:protocol-markers` OK; `check-build-memory`
  0 violations. Fixes along the way: the slo_samples insert moved from fire-and-forget to
  awaited-catch (PGlite wasm crash under a racing insert — real prod is a pool, but the awaited
  single insert is µs anyway); additive-migrations expected-file list +0052; converting-state
  copy made format-honest (`convertingFmt`/`convertingSlowFmt`/new `convertingUnknownFmt` via
  `convertingCopy` — "cold start can take a few minutes" removed per deliverable 2); a live-clients
  lint unused-var; `_name` test arg.
- 2026-10-02 — **`pulumi preview` on prod: gate-clean.** +3 create (`rhema-prod-convert-svc`,
  `rhema-prod-api-invokes-convert-svc`, `rhema-prod-slo-import-preview-p95-s` AlertPolicy),
  ~6 update (api `template` — the `CONVERT_SERVICE_URL` env — plus the pre-existing `-scaling`
  normalization noise on api/web/worker/collab/fetcher/export), **0 replace, 0 delete** — the
  convert Job and the user-content bucket are untouched. **Cost delta est. ≈$13/mo** (one warm
  min-instance: 1 vCPU idle ≈$6.48 + 1 GiB ≈$6.48 at $0.0000025/unit-s over a 30-day month) —
  inside the ≤$15 pre-authorization, cutting close enough that Stage B MUST record the measured
  figure. Preview link: `rhema/prod/previews/d841b2bc-7068-4643-8d41-d72e56882597`.
- 2026-10-02 — **Stage B NOT executed further.** A bare `pulumi up` is NOT safe-cheap here: the
  stack pins image DIGESTS, and `convert-svc` would boot the pre-ONB.1 convert image — which has
  no `--serve` mode — i.e. a crash-looping revision. The honest deploy order is: Cloud Build the
  new images → pin digests → apply migration `0052` (IAP tunnel) → `pulumi up` → provenance +
  `deployments` row → the ≥20 preview-only timing imports (≥3 after ≥15 min idle) → measured cost
  delta + live egress probe → N1/N3 journeys (mailbox exists; flagged test tenant) → flip the
  registry flags + commit screenshots. All of it is operator/environment work beyond this
  session's reach → `D-ONB.1-1`, `D-ONB.1-2` in `docs/tickets/DEFERRALS.md`.
- 2026-10-02 — **Closeout.** PR **#93** opened (`gh`, stacked on ACT.1's branch, OPERATOR merge
  policy); `docs/build/pr/ONB.1.md` is the body; BUILD_INDEX row 99; LEDGER advanced
  (nextTicket → EDIT.1, chainTip → `stevevitali/onb-1-import-latency-held-draft`); DEFERRALS
  gains the ONB.1 section; `check-build-memory` 0 violations.

## Stage B — executed 2026-10-02/03 (continuation)

Deploy order was the one Stage A recorded (build → pin → migrate → preview → up), and it earned
its keep immediately:

- **Lockfile fix first.** The first Cloud Build at `d7c739c` failed in the api image:
  `ERR_PNPM_OUTDATED_LOCKFILE` — `unist-util-visit` had moved into
  `packages/markdown`'s direct deps without a lockfile refresh. `pnpm install` regenerated it;
  committed as **`a3bcde6`** (`ONB.1: lockfile — unist-util-visit is a direct @rhema/markdown
  dep`). The deploy target is therefore `a3bcde659828b5f7397a58978d74e1572ffb9378`, not
  `d7c739c`.
- **Images.** `gcloud builds submit` on the subset config
  (`integration/.scratch/cloudbuild-onb1.yaml`, tag `onb1`) built api/web/worker/convert at
  `a3bcde6`; digests pinned in `infra/pulumi/Pulumi.prod.yaml` `serviceImages:` (api
  `6ce04ab3…`, web `17412062…`, worker `e7564619…`, convert `fb62d206…`; fetcher/export/collab/
  egress-proxy/run-task unchanged).
- **Migration.** `0052_slo_samples_detail.sql` applied through the IAP tunnel
  (`rhema-prod-proxy-h6fc` → `127.0.0.1:15433`) via `scripts/live/prod-migrate-seed.mjs`:
  prior max 0051 → `[migrate] 52 migrations recorded`; protocol seed no-op.
- **Pulumi.** Preview: 2 create (`rhema-prod-convert-svc`, `rhema-prod-api-invokes-convert-svc`)
  / 6 update / **0 replace / 0 delete**; est. ≈$13/mo ≤ $15. `pulumi up` — **update 114 caught
  a real defect live:** the first `convert-svc` revision create 400'd on the `PORT` env —
  Cloud Run reserves+injects `PORT`, it is not settable. Fixed in `compute.ts` (env now
  `CONVERT_ROOT` only; `serveConvert` already defaults `process.env.PORT ?? 8080`; the
  IaC test now asserts the absence), then **update 115** succeeded (23:50:37→23:52:19Z, 2
  create / 6 update / 0 replace / 0 delete).
- **Provenance.** `check-deploy-provenance.mjs --expect a3bcde6…` **PASS** on
  `api.rhema.tools` + `rhema.tools` (both `/healthz` report `build.gitSha=a3bcde6…`); an
  unauthenticated request to the convert-svc URL returns 404 (internal ingress + invoker-only,
  as designed). `deployments` row `prod:a3bcde6…` recorded 23:52:38Z with the full digest map,
  `protocols_version 0.4.0+ec61156725a895ab`, `rate_table_version 2026-10-02`.

### Timing matrix (preview-only, flagged test tenant, $0 inference)

Harness `integration/.scratch/onb1-preview-timing.mts`: for each leg, POST `/import/presign`
→ PUT bytes → POST `/import/preview` (`waitMs` 25 s) until `ready`; elapsed = presign-start →
ready response — the same clock `import_preview_ms` records server-side. Tenant
`test+jonb1tm@rhema.tools` (`is_test=true` verified via `/session`); **preview-only — no
`/import/create`, zero project rows, $0 inference**.

| # | fmt | bytes | elapsed (client) | server `import_preview_ms` | notes |
|---|-----|-------|------------------|----------------------------|-------|
| 0–16 | md/txt/html/docx ×≈4 | 461–8,409 | 544–1,097 ms | 420–893 ms | batch 1, 23:53:54–23:54:05Z; incl. `planted-error-essay.md` (893/476 ms cold-ish first leg) |
| 17–20 | txt/html/docx/md | 461–8,409 | 612–922 ms | 477–741 ms | batch 2, **≥15.5 min idle** (00:09:45–00:09:47Z) — warm min=1 held, no cold start |

- **n = 21 ≥ 20**, all four formats, planted-error essay included, **4 legs ≥ 3 after ≥15 min
  idle**. Client-observed: min 544 ms, max 1,097 ms, **p95 = 922 ms**. Server-side
  `slo_samples` over the timing tenant: 21 rows, min 420, max 893, **p95 = 736 ms** — both
  clocks ≪ **20 s** target.
- `converted/<ws>/<id>.json` objects landed for every leg via the service's gcsfuse mount (the
  SA's converted-only write grant exercised); Cloud Run request logs show all `POST /convert`
  HTTP 200 on `rhema-prod-convert-svc-a3874fc` and **zero Job executions** for the batch — the
  service-first path, not the fallback.
- SLO-probe shape over non-test tenants (last 30 min): **0 rows** — `is_test` exclusion is
  live, the flagged traffic cannot pollute `import_preview_p95_s`.
- Honest notes: the txt fixture's content sniffs as `md` server-side (`sourceFormat=md` on the
  txt legs — the detector keys on content, not extension; the `txt` format coverage is via the
  file-extension path on the planted-essay-derived text); html legs return `quality=partial`
  (the intentionally-unresolved relative `<img>` → `image_dropped` warning — the fidelity leg
  working live); converted md bodies carry **no** leading H1 (extracted to `title`).

### Egress probe (live, no-network claim)

Batch-1 html legs embedded three canary URLs (webhook.site) as `<link>`, `<script>`, `<img>`
src. Through the real conversion round-trip on `convert-svc`: **0 recorded requests**. A
separate manual control request to the same canary recorded 1 hit — the canary itself was
functional; the converter made no outbound request (matches `server.test.ts`'s no-egress
round-trip). `compute.ts` ships no `vpcAccess` and no egress-proxy env on the service.

### Measured cost delta

Cloud Monitoring `run.googleapis.com/container/billable_instance_time` on
`rhema-prod-convert-svc`: ≈**208 active instance-seconds** in the post-deploy window (17
conversions + startup) — the metric reads active-rate time only (idle min-instance time bills
under the separate idle SKU, confirmed against the always-on worker which under-reads the same
way). Active component at that sustained rate ≈ $0.3/mo; realistic bursty preview traffic ≈
cents. Idle component is the deterministic documented bound — min=1 × (1 vCPU + 1 GiB) ×
$0.0000025/unit-s × 2,592,000 s/mo = **$12.96/mo**. **Measured delta ≈ $13.2/mo ≤ $15** —
consistent with the preview estimate.

### Journeys N1 + N3 (live, keyless DWD mailbox, $0)

`pnpm rhema-journeys` against prod at provenance `a3bcde6` (journey run printed
`FLIP N1 [ONB.1]` / `FLIP N3 [ONB.1]`, `provenance match · spend $0 ≤ $5`):

- **N1** — draft dropped on `/` → held in `rhema-hold` IndexedDB → real magic-link sign-in
  (same browser context) → two later `/app/new` loads, file attached each time. 10,246 ms,
  `ready-to-flip` → `N1.png`.
- **N3** — held draft → project; conversion preview ≤20 s (549 ms `import_preview_ms` row on
  the journey tenant `01M3ZGNYCB5TC3` at 23:55:13Z); `?hc=` consumed-marker handshake removed
  the hold. 12,675 ms, `ready-to-flip` → `N3.png`.
- Report + screenshots: `docs/build/reports/2026-10-03_ONB.1-n1n3/report.json`, `N1.png`,
  `N3.png` — committed. `registry.ts` flipped N1 + N3 `expected:"red"→"green"` **after** the
  live passes.

### Stage-B closeout

- `D-ONB.1-1` → **DONE** (deploy, migration 0052, provenance, 21-leg timing p95 922/736 ms,
  measured ≈$13.2/mo, egress probe 0 hits — all live evidence above).
- `D-ONB.1-2` → **DONE** (N1 + N3 green on prod, flags flipped, screenshots committed).
- No genuine residual remains open under ONB.1; the only outstanding work is OPERATOR-owned
  (PR #93 review/merge — merge policy OPERATOR, never merged from the build env).
