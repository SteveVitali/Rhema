# PRB.20 — Live ingestion: the browser upload → quarantine → convert → preview path

Stacked on #48 (`stevevitali/prb-19-revise-delivery-defect-pass`). Ticket:
`docs/tickets/28k_PRB.20__live-ingestion-upload-path.md`. Run ledger:
`docs/build/runs/PRB.20.md`. **Closes D-PRB.02-1.**

Prod exposed `/import` with `notWired` stubs — a signed-in user uploading a manuscript hit
`500 "import is not wired live yet (D-PRB.02)"`. This lands the live bindings end-to-end:
**browser upload → workspace-scoped GCS quarantine → the no-network/no-DB convert Cloud Run Job →
the §5.3 preview → a frozen `human_upload` draft.**

## What lands

- **`@rhema/contracts`** — the upload contract moves here (`MAX_UPLOAD_BYTES` 25 MB,
  `quarantineKey`/`parseQuarantineKey`/`convertedResultKey`, `SignedUrlProvider`,
  `presignQuarantinePut`) so api/web/convert share the one wire shape.
- **`@rhema/live-clients`** (`src/ingest.ts`) — `createGcsV4SignedUrlProvider` (v4 signed PUT bound
  by `x-goog-content-length-range`; on Cloud Run the client signs via `iamcredentials:signBlob` —
  no key material on the service) and `createConvertJobPreview` (`jobs:run` with mounted-path
  container args → poll the Execution → read `converted/<key>.json` back; read-back-first makes
  re-previews idempotent — the result object is the transport AND the completion signal).
- **`apps/api`** — `POST /import/presign` (session-authed; workspace from the principal), and
  `import/preview` + `import/create` validate the key tenant (`parseQuarantineKey` + workspace
  match — malformed 400, foreign 403) then compose the live converter. `createImportedDraft`
  unchanged: content-addressed markdown, immutable v1, frozen `human_upload` draft, `draft.imported`
  analytics. `voice-routes.ts` rides the same shared key parser.
- **`apps/web`** — `previewImport` presigns + PUTs the bytes through the web server (session cookie
  never leaves the api origin) then posts the quarantine key to preview; `createImport` reuses the
  same key — no second upload. The §5.3 preview carries `quarantineKey` hidden into create
  (`@rhema/ui` conversion form gained hidden fields).
- **`apps/convert`** — `main.ts` writes full `ConversionResult` JSON when the output path ends in
  `.json`; the Job mounts the user-content bucket gcsfuse-style at `/usercontent` (no
  `@google-cloud/storage` in the image — `serving.test.ts` bans it).
- **Pulumi** — api SA self `serviceAccountTokenCreator` (signBlob); Job SA `objectCreator` on
  `converted/` only; the Job's `/usercontent` volume; api env `USER_CONTENT_BUCKET` /
  `CONVERT_JOB` (the **physical** job name) / `CONVERT_JOB_ROOT`; api→Job
  `roles/run.jobsExecutorWithOverrides` + `roles/run.viewer`, job-scoped.

## Stage B — verified live on prod (2026-09-22)

Presign 200 → signed PUT 200 → `import/preview` **200** (a real `jobs:run` + execution poll +
readback, 246 s cold) → `import/create` **201** — draft `01M354HF9HAYF09SVZ9SYDPQZR`
`origin='human_upload'` `state='frozen'`, immutable `artifact_versions` v1
(`sha 7d619069…`, `media_type text/markdown`), artifact head + `drafts/v3.md` mirror. GCS asserted:
`quarantine/`, `converted/` (the Job's only writable prefix), and the content-addressed object.
Tenant checks: foreign-workspace key → 403, traversal → 400; `usercontent.rhema.tools` unsigned →
403 cookieless. $0 inference.

Four live defects surfaced and were fixed + redeployed en route (each proven by the next call):
`run.jobs.runWithOverrides` isn't in `run.invoker` (→ `run.jobsExecutorWithOverrides`); the LRO
`operations/` poll needs project scope while Executions are Job children (→ poll
`op.metadata.name`); the `Completed` condition exists non-terminally at creation (→ only
`True`/`False`/`completionTime` is terminal); cold executions run ~2.5–4 min (→ poll bound 300 s).

## Tests

Deterministic: `contracts/upload` (key shape/round-trip), `live-clients/ingest` (7 — signed range
header, run args, execution poll incl. non-terminal `Completed/Unknown`, read-back-first, tenant +
shape rejections, timeout, missing output), `api/import`, `web/data` + `web/server`, the
`serving.test.ts` no-net/no-DB ban.

**Green gate:** `turbo build lint typecheck` 111/111 · `vitest` 275 files / 2100 pass (the
`lever-matrix` perf assertion flaked once under full-suite load — passes isolated; pre-existing) ·
`check:licenses` + `check:protocol-markers` clean · `check-build-memory.sh` 0 violations.
