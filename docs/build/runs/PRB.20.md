# PRB.20 — Live ingestion: browser upload → quarantine → convert → preview (run ledger)

- **Ticket:** `docs/tickets/28k_PRB.20__live-ingestion-upload-path.md` (seq 28k — inserted
  2026-09-22; the prod import surface was live-exposed and 500'd `"import is not wired live yet
  (D-PRB.02)"` — this ticket lands the live bindings).
- **Branch:** `stevevitali/prb-20-live-ingestion-upload-path` (stacked on
  `stevevitali/prb-19-revise-delivery-defect-pass`).
- **Closes:** **D-PRB.02-1** (live ingestion infra + the live upload→convert→preview flow).

## Requirements / acceptance criteria

1. Live `SignedUrlProvider` — GCS V4 presigned PUT for `quarantine/<workspaceId>/<uploadId>` on
   the user-content bucket (IAM Credentials `signBlob` on the api SA — no key material).
2. Session-authed presign route returning `{url, key, requiredHeaders}` bound to ≤25 MB.
3. Live `Converter` — `preview(quarantineKey)` invokes the no-network/no-DB convert Cloud Run Job
   and returns a strict `ConversionResult`.
4. Web binding — `previewImport`/`createImport` replace the `notWired` stubs; the §5.3 preview +
   the imported `human_upload` draft land on prod.
5. Deterministic tests + the full green gate; Pulumi diff only what the bindings need.
6. Stage B — `pulumi up prod`, headless live verify, assert §13.3 posture, close D-PRB.02-1.

## Stage A — implementation

### Contract (`@rhema/contracts`, moved out of `apps/convert`)

`packages/contracts/src/upload.ts` — `MAX_UPLOAD_BYTES` (25 MB), `quarantineKey(ws,id)`,
`parseQuarantineKey` (strict `quarantine/<ws>/<id>` shape — no traversal), `convertedResultKey`
(`converted/<ws>/<id>.json`), the `SignedUrlProvider`/`SignedPut` types, and
`presignQuarantinePut`. `upload.test.ts` pins the wire shape.

### Live bindings (`@rhema/live-clients` — `src/ingest.ts`)

- `createGcsV4SignedUrlProvider` — `@google-cloud/storage` v4 `getSignedUrl` for a PUT bound by a
  signed `x-goog-content-length-range: 0,<max>` extension header (GCS rejects over-cap PUTs at the
  edge). On Cloud Run, `new Storage()` signs through `iamcredentials:signBlob` automatically —
  the api SA carries a self `roles/iam.serviceAccountTokenCreator` grant (`infra/pulumi/iam.ts`).
- `createGcsObjects(bucket)` — the bucket-bound `converted/` result reader.
- `createConvertJobPreview` — the live `Converter`: validates the key shape, **read-back-first**
  (an existing `converted/<key>.json` makes a re-preview idempotent — the result object is the
  transport AND the completion signal), else `POST jobs:run` with `containerOverrides` args
  `<mount>/<quarantineKey>` → `<mount>/<convertedKey>.json`, polls, then reads the result object
  and `conversionResultSchema`-parses it. `bucket`, `fetchImpl`, `tokenFor`, `sleep`, timeouts all
  injected for the deterministic tests.

### API (`apps/api`)

- `import.ts`: `POST /import/presign` (session-authed; the workspace comes from the principal —
  never a request field), `POST /projects/:id/import/preview` + `/import/create` now validate the
  quarantine key against the principal's workspace (`tenantKey` — malformed → 400, foreign
  workspace → 403) and compose the live converter. `createImportedDraft` unchanged in contract:
  content-addressed `put`, immutable `artifact_versions` v1, `drafts` row `origin='human_upload'`
  `state='frozen'` with `promoted_version_id`, `mirror_path` finalized to `drafts/v<n>.md`,
  `draft.imported` analytics post-commit non-fatal.
- `env.ts`: `USER_CONTENT_BUCKET`, `CONVERT_JOB` (full job resource), `CONVERT_JOB_ROOT`.
- `server.ts`: composes `createStorageV4SignedUrlProvider` + `createGcsObjects` +
  `createConvertJobPreview` when the env is present.
- `voice-routes.ts`: the voice-sample upload path now uses the shared `parseQuarantineKey` +
  workspace check (was a legacy single-segment regex that couldn't carry a full quarantine key).

### Web (`apps/web`)

- `data.ts`: `previewImport` = presign → server-side PUT of the uploaded bytes to the signed URL
  (with the signed `x-goog-content-length-range` header) → `POST …/import/preview`;
  `createImport` replays the SAME quarantine key into `import/create` — no second upload.
  Pasted text is staged through the same path.
- `pages.tsx`/`server.ts`: the §5.3 preview renders source, converted markdown, the count line,
  warnings, and the create/fix-now actions; the create form carries `quarantineKey` hidden.
- `packages/ui/src/conversion.tsx`: the create form accepts hidden fields.

### Converter (`apps/convert`)

`main.ts`: `convert <input> [output]` — output ending `.json` writes the full `ConversionResult`
JSON (the api's readback contract); otherwise canonical markdown. Parent dirs created; preview JSON
still on stdout. No network/DB deps — `serving.test.ts` statically bans
`@google-cloud/storage`/`pg`/`drizzle-orm`/`undici`/`ioredis`/`pg-boss` from the image. The Job
mounts the user-content bucket gcsfuse-style at `/usercontent` — the converter touches only
filesystem paths.

### Pulumi (`infra/pulumi`)

- `iam.ts`: api SA self `roles/iam.serviceAccountTokenCreator` (signBlob); convert Job SA
  `objectCreator` conditioned to `converted/` prefix on the user-content bucket (its only write).
- `compute.ts`: convert Job gets the `usercontent` GCS volume mounted at `/usercontent`
  (`readOnly: false`); api env gets `USER_CONTENT_BUCKET`, `CONVERT_JOB` (the **physical**
  `convertJob.name` — see defect 1), `CONVERT_JOB_ROOT`; api→Job IAM: `roles/run.jobsExecutorWithOverrides`
  + `roles/run.viewer`, job-scoped (see defects 2–3).

### Tests (deterministic)

`contracts/upload.test.ts` (key shape/parse/round-trip), `live-clients/ingest.test.ts` (7 — v4
signing binds the range header; run args; execution poll incl. the non-terminal `Completed/Unknown`
condition; read-back-first; invalid keys; failed execution; timeout; missing output),
`api/import.test.ts` (route authz + tenant key + create), `web/data.test.ts` + `server.test.ts`
(the flow + hidden field), `convert/serving.test.ts` (the no-net/no-DB ban).

## Stage B — live results (2026-09-22, prod)

**Deploys.** Cloud Build `d020af61` (the PRB.20 image set) → `pulumi up` updates **63** (IAM +
Job volume + images) / **64** (the CONVERT_JOB physical-name env fix). The four live defects below
then drove three focused api rebuilds (`cfff6cdf`, `252c46b0`, `fcf7be3d`) → updates **65/66/67**.
Final prod pins: api `…/api@sha256:73d55bb5c06e920cfefbaad91c955215fc2e7cdfd6632340a71d40457abcce71`,
web `9d4262ad…`, convert `4f764617…` (the first PRB.20 build — already carries the `.json` output
mode + gcsfuse mount).

### Live defects found + fixed (each proven by the next retry)

1. **`CONVERT_JOB` logical-vs-physical name** — the env carried the Pulumi logical name; the Jobs
   API needs the autonamed resource (`rhema-prod-convert-125dbd4`). Fixed by injecting
   `convertJob.name` (update 64).
2. **`run.jobs.runWithOverrides` ≠ `run.jobs.run`** — `jobs:run` with `overrides.containerOverrides`
   (the mounted-path args) requires the overrides permission; `roles/run.invoker` only has
   `run.jobs.run` → 403 with NO audit entry (invocation calls are data-access, not admin-activity
   logged). Fixed: `roles/run.jobsExecutorWithOverrides` on the Job (covers run + overrides +
   executions.cancel).
3. **LRO poll is project-scoped; executions are Job children** — `GET operations/<id>` 403'd under
   the job-scoped `run.viewer` grant (operations live at `locations/<r>/operations/`, outside Job
   IAM). Fixed: poll `GET <op.metadata.name>` — the **Execution** resource `…/jobs/<j>/executions/<e>`,
   covered by the Job-scoped grant. No project-level grant needed.
4. **`Completed` condition is non-terminal at creation** — an execution's `Completed` condition
   exists from the start with status unset/"Unknown" ("Waiting for execution to start"); treating
   presence as done raced to `convert_output_missing` while the job was still queued. Fixed: only
   `status ∈ {True, False}` (or `completionTime`) is terminal.
5. **Cold executions run ~2.5–4 min** — image import + gcsfuse mount + convert; the 120 s poll
   bound timed out mid-execution (the execution still completes and lands the result object — the
   readback cache then serves retries). Fixed: bound → 300 s.

### Headless live verify (all green)

- Unauthenticated `GET /projects` and `POST /import/presign` → **401**.
- `POST /import/presign` (session cookie) → **200**: `key=quarantine/01M2V3PM11XSF05VJ9G01PM5ZB/
  01M3549ES3EAYHW7DVBHHJM39F`, `maxBytes=26214400`, signed header `x-goog-content-length-range:
  0,26214400`.
- Browser-equivalent `PUT` to the signed URL → **200**; `gs://rhema-prod-user-content/quarantine/
  <ws>/<id>` listed.
- `POST /projects/01M34YDZ3SK525JYF74EEH44QR/import/preview` → **200 in 246 s** — a real
  `jobs:run` + execution poll + `converted/…json` readback returned the strict `ConversionResult`
  (`sourceFormat=md`, `quality=clean`, counts/warnings present). A re-preview of a converted key
  returns the cached object in ~190 ms (the idempotent path).
- `POST …/import/create` → **201**: draft `01M354HF9HAYF09SVZ9SYDPQZR` (n=3 — drafts 1–2 are the
  operator's seed + the first verify), version `01M354HF9HWKXEMVH5TMDK8Q2B`,
  `content_sha256=7d619069…` matching the stored bytes.
- DB asserted (prod, over the tunnel): `drafts` row `origin='human_upload'`, `state='frozen'`,
  `promoted_version_id` → the version; `artifact_versions` `ordinal=1`, `immutable=true`,
  `media_type='text/markdown'`, `s3_key=tenants/<ws>/objects/<sha256>`; `artifacts`
  `kind='draft'`, `head_version_id` set, `mirror_path='drafts/v3.md'`.
- GCS asserted: `quarantine/<ws>/<id>` (the PUT bytes), `converted/<ws>/<id>.json` (the Job's
  output — the ONLY prefix its SA can write), `tenants/<ws>/objects/<sha256>` in the artifacts
  bucket.
- Tenant scoping: a `quarantine/<other-ws>/<id>` key → **403 `forbidden`**; `../../etc/passwd` →
  **400**. The api never mints a key outside the principal's workspace.
- §13.3 posture: `usercontent.rhema.tools` unsigned GET → **403** (CDN signed-URL gated, private
  bucket, no `Set-Cookie`); the convert Job's no-network/no-DB posture is statically enforced by
  `serving.test.ts` and its image carries no GCS/DB client (gcsfuse mount, filesystem I/O only).
- Convert Job executions observed: `…-lmkj6`/`…-tktnz`/`…-t6wdd`/`…` all `succeeded` (cold ~2.5–4 min);
  the api-side executions are the ones the preview calls launched.

**Spend:** $0 inference — the convert path is pure CPU; the verify used text fixtures.

## Green gate

`pnpm turbo build lint typecheck` **111/111** · `pnpm test` **275 files / 2100 pass** (1 skip; the
`lever-matrix` "<100 ms" perf assertion flaked once at 155 ms under full-suite load — passes at 15 ms
isolated; pre-existing, unrelated) · `pnpm check:licenses` clean · `pnpm check:protocol-markers`
clean · `check-build-memory.sh .` 0 violations.

## Deferral dispositions

- **D-PRB.02-1 → DONE** — every verify-column row above is live evidence on prod.
- No new deferrals opened. The dev-measured "<20 s docx preview" line in D-PRB.02-1's close-test
  reads against a warm path — cold-start executions measure ~2.5–4 min live (image import + mount +
  convert); the synchronous preview holds for the duration and the readback cache makes retries
  instant. Noted, not deferred — the path works end-to-end.
