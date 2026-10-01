# PRB.20 — Live ingestion: the browser upload → quarantine → convert → preview path

> **Inserted 2026-09-22** (manifest § Plan extensions). The prod golden path surfaced the hole: a
> signed-in user with a real manuscript hit `/p/<slug>/import` → **500 "import is not wired live
> yet (D-PRB.02)"** — `apps/web/src/data.ts` `previewImport`/`createImport` are `notWired` stubs.
> Every deterministic half already exists (the convert pipeline, the quarantine seams, the IAM);
> this ticket lands only the live bindings. Until it ships, manuscripts enter prod only via the
> operator content-store insert used on `my-first-project` (draft `01M34Z3C51V3W4G69G454PCHG0`).

- **Sequence:** inserted — runs **after `28j_PRB.19`, before `29_P1.01`**. Sorts as `28k`.
- **Phase:** LV — prod launch (finish legs).
- **base_branch:** current chainTip at dispatch (the PRB.19 branch — stacked PR chain).
- **Depends on:** PRB.15 (the prod stack + user-content bucket + convert Job + prefix IAM),
  PRB.02 (the deterministic convert/upload seams).
- **Run:** `implement-spec spec=docs/tickets/28k_PRB.20__live-ingestion-upload-path.md`
- **Gate status:** no new credentials needed (GCP is provisioned; the presign uses the api SA's
  IAM signing). Stage B is a live deploy + one real upload — **no inference spend**.
- **Live stage:** Stage A is the real work (bindings + tests); Stage B is a bounded prod verify.

## Goal
Close **D-PRB.02-1**: a signed-in user uploads a manuscript in the browser, it lands in the
`quarantine/` prefix of the user-content bucket via a presigned PUT, the convert Job produces a
§5.3 preview, and `import/create` writes draft 1 — all on prod.

## Load
- `docs/tickets/DEFERRALS.md` — **D-PRB.02-1** (the authoritative deferral: live ingestion infra +
  the live upload→convert→preview flow; note the `*.rhemausercontent.com`→`usercontent.rhema.tools`
  amendment).
- `apps/convert/src/upload.ts` — `presignQuarantinePut`, `SignedUrlProvider`, `quarantineKey`,
  `MAX_UPLOAD_BYTES` (25 MB).
- `apps/api/src/import.ts` — `/projects/:id/import/preview` + `/import/create` (exist; need a live
  `deps.converter`); check `voice-routes.ts` ~line 388 — the same `quarantineKey` seam rides the
  voice-sample path.
- `apps/web/src/data.ts` — `previewImport`/`createImport` are `notWired` (~line 256); the web
  routes `/p/:slug/import[/preview|/create]` exist (`server.ts` ~446).
- `infra/pulumi/iam.ts` ~line 98 — the quarantine prefix IAM already exists: the fetcher SA is
  `objectCreator` conditioned to `quarantine/`; the convert Job SA is bucket-read-only.
- `infra/pulumi/compute.ts` ~line 470 — the convert Cloud Run **Job** (per-batch, no network, no
  DB; prints the preview JSON to stdout).
- `apps/convert/src/main.ts` — the job contract: `convert <input> [output.md]` → preview JSON on
  stdout.

## In scope — Stage A (code + tests, PR-able)
1. **`SignedUrlProvider` live impl.** GCS V4 presigned PUT for `quarantine/<ws>/<uploadId>` on the
   user-content bucket. Cloud Run signs via the IAM Credentials API (`iamcredentials:signBlob` on
   the api SA — add `serviceAccountTokenCreator` self-iam in Pulumi if absent) or the metadata
   signing path; document the choice. Bound expiry + size condition per `upload.ts`.
2. **Presign endpoint on the api.** Session-authed route returning `{url, key, requiredHeaders}`
   for the caller's workspace (membership-checked; the key embeds `workspaceId` so a user can never
   presign into another tenant's prefix).
3. **`Converter` live impl.** `preview(quarantineKey)` must invoke the convert Job against the
   quarantined object and return the `ConversionResult`. The Job's SA is bucket-**read**-only, so
   the result path needs a design decision: objectCreator on a `converted/` prefix (clean — Job
   writes `converted/<key>.{md,json}`, api reads it), or stdout/log readback. Pick, implement,
   and note the IAM change in Pulumi if the Job needs a write grant.
4. **Web binding.** Replace the `notWired` stubs: `previewImport` = presign → browser/web PUT to
   the signed URL → `POST /projects/:id/import/preview {quarantineKey}`; `createImport` →
   `POST …/import/create`. The pasted-text path may skip quarantine if the api accepts inline text —
   check the route contract before deciding.
5. Deterministic tests: the presign route (membership scoping, key shape, size bound), the
   Converter impl behind a fake Job-runner, the web flow with a stubbed provider.
   `turbo build lint typecheck` + `pnpm test` green.
6. **Pulumi diff**: only what the bindings need (SA `signBlob`, maybe a `converted/` write grant,
   the Job env args). No new buckets/services.

## In scope — Stage B (live on prod, no inference spend)
7. `pulumi up prod` with the new api + web images (+ any IAM diff). Confirm `pulumi preview` shows
   no unexpected resources before applying.
8. **Headless live verify**: presign a real upload → PUT a markdown file → `import/preview` →
   `import/create` on the operator's project; assert the draft/artifact/version rows + the GCS
   objects (quarantine readback + converted output).
9. Assert the §13.3 posture holds live: the convert Job's no-network profile, quarantine objects
   serve only via `usercontent.rhema.tools` with the attachment/octet-stream policy.
10. Close **D-PRB.02-1** in DEFERRALS.md with the live evidence; update the run ledger +
    BUILD_INDEX + PHASE LOG; `check-build-memory.sh .` clean.

## Acceptance
- A real browser-shaped upload works end-to-end on prod (headless curl sequence is acceptable
  proof; the operator's browser click-through is the leg's polish, not its gate).
- D-PRB.02-1 → DONE with row/log evidence.
- No new OPEN rows without a `D-PRB.20-*` id + owner.

## Out of scope
- P1.* skeletons (G3-parked), the six-real-PDFs corpus (D-PRB.02-2 — human H2 deliverable),
  merges (OPERATOR policy), project-create UI (P1.04), the add-credits affordance gap.
