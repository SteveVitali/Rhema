# PRB.21 — Live-use defect pass: concurrent-run guard + import-preview latency (run ledger)

- **Ticket:** `docs/tickets/28l_PRB.21__live-use-defect-pass.md` (seq 28l — inserted 2026-09-22,
  manifest § Plan extensions; defect-repair, G3 stays parked).
- **Branch:** `stevevitali/prb-21-live-use-defect-pass` (stacked on
  `stevevitali/prb-20-live-ingestion-upload-path`, PR #49).
- **Closes:** **D-PRB.20-1** (no concurrent-run guard → parallel runs + parallel holds).

Two defects surfaced in the first day of real operator use on prod: a second run click could
spawn a duplicate run + duplicate hold (D-PRB.20-1's live evidence: 4 `review/quick` runs on
`my-first-project` in 11 s, 2,184 cr held of a 2,500 balance), and the import preview held the
browser request open for the ~2.5–4 min a cold convert Job takes.

## Requirements / acceptance criteria

1. At most ONE non-terminal run per project (conservative beta ruling made in-ticket). A second
   `POST /projects/:id/runs` → **409 `run_in_progress`** carrying the active run id — never a
   second run row, never a second hold. Check-then-insert must not race (row lock or unique
   index). Idempotent replay of the SAME key still dedupes to the live run.
2. The run sheet renders an in-progress state (link to the active run's surface) instead of the
   Run affordance; the POST handles 409 by re-rendering that state, never an error page.
3. The import preview stops looking like a hang: bounded pending response + retry, reusing the
   same quarantine key; concurrent/retry previews must never launch a second `jobs:run`.
4. Deterministic tests for all of it; `turbo build lint typecheck` + `pnpm test` green.
5. Stage B: `pulumi up` the new api/web images; headless live verify (409 + single-hold assert;
   upload → pending preview → create); D-PRB.20-1 closed with evidence; build memory clean.

## Stage A — implementation

### Orchestrator (`packages/orchestrator`)

- `state-machine.ts` — `TERMINAL_RUN_STATES` (`completed`, `completed_partial`, `failed`,
  `cancelled`) + `NON_TERMINAL_RUN_STATES` derived as the complement of `RUN_STATES` — the one
  place the active-run set is defined (guard, project list, tests all share it).
- `run-creation.ts` — inside `createRun`'s transaction, for project-scoped creates:
  `select id from projects where id = $1 for update` serializes same-project creation; the
  idempotency-memo check runs FIRST (a replay of this submission returns its live run deduped,
  not a 409), then `state = any(NON_TERMINAL_RUN_STATES)` finds an active run → the whole
  creation rolls back (`CreationRollback`) — no run row, no memo claim, no hold — returning
  `{ ok:false, reason:"run_in_progress", activeRunId }`. Project-less runs (persona builds)
  bypass the guard.

### API (`apps/api`)

- `run-routes.ts` — the typed result maps to `409 {error:"run_in_progress", runId}`;
  `insufficient_balance`/`account_suspended`/`model_profile_rejected` mappings unchanged.
- `editor-routes.ts` — the editor's run-create path surfaces the same 409 shape.
- `project-list.ts` — each project row carries `activeRun {runId,state}` (latest non-terminal
  run, shared NON_TERMINAL set) so the sheet can render the state without a second query.
- `import.ts` — `preview` accepts `waitMs` (caller budget, clamped to `IMPORT_PREVIEW_WAIT_MS`
  = 25 s — inside the LB backend timeout): a still-converting key answers
  `202 {pending:true, quarantineKey}` instead of holding the socket. `import/create` runs the
  same bounded preview; still-pending → `409 {error:"conversion_pending", quarantineKey}`.
- `voice-routes.ts` — adopts the shared run-state set where it listed states inline.

### Converter client (`packages/live-clients/src/ingest.ts`)

`preview(key, {waitMs})` — read the `converted/<ws>/<id>.json` cache first (idempotent hit);
then the `converting/<ws>/<id>.json` marker (TTL 15 min): a fresh marker means someone else owns
the in-flight execution — poll THAT execution name, never launch a second. Only when no marker
exists does the caller atomically claim it (`save` with `ifGenerationMatch:0` — a precondition
conflict = a concurrent claimer; reread + join) and then `jobs:run` once. Poll the **Execution**
resource; `Completed` is terminal only at `status True|False` or with `completionTime`. The
`waitMs` soft deadline returns `null` (pending) — the marker + execution survive for the next
call to join. The marker clears on success, failure, stale execution, or missing output.

### Web (`apps/web`)

- `data.ts` — `previewImport` sends `waitMs:20000` and maps 202 → a `pending` outcome (the same
  quarantine key rides through every retry — no re-upload, no re-presign).
- `server.ts` — `GET /p/:project/import/preview?qk=…` renders the converted preview or a pending
  page; `POST /p/:project/run` catches api `409 run_in_progress`, refreshes the project row, and
  re-renders the sheet's in-progress state (never an error page).
- `pages.tsx`/`page-data.ts`/`render.tsx`/`copy.ts` — the pending page (auto-refresh via
  `<meta http-equiv="refresh" content="5">`, `autoRefresh` document flag), the sheet's
  in-progress block linking `/p/:slug/review/:runId`, all copy in `copy.ts`. Progressive
  enhancement preserved — zero client JS.

### `packages/api-client`

`ProjectRow.activeRun`, `previewImport` returns the pending union + `waitMs` passthrough.

### Tests (deterministic)

- `run-creation.test.ts` — second create while active → `run_in_progress` + ONE run row + ONE
  hold; `awaiting_consent` also blocks; same-key replay dedupes (no 409); create allowed after
  the active run goes terminal; project-less runs unaffected.
- `run-routes.test.ts` — 409 shape `{error,runId}`.
- `import.test.ts` — 202 pending under the wait bound; create → 409 `conversion_pending`.
- `ingest.test.ts` — marker claim conflict joins the existing execution (no second `jobs:run`);
  stale marker reclaims; soft deadline returns null; marker cleanup paths.
- `server.test.ts`/`data.test.ts`/`project-list.test.ts` — pending page + poll route, 409 sheet
  re-render, `activeRun` DTO, `waitMs` wire field.

## Stage B — live results (2026-09-22, prod)

- **Build:** `gcloud builds submit` (build `e60c45d6-8104-40b9-9208-a5cbb1604163`, tag `prb21`)
  → api `sha256:6f7f6b7f0d9d…` + web `sha256:3db3597d33ac…`, pinned in `Pulumi.prod.yaml`
  `serviceImages` (worker/fetcher/convert/export/collab pins untouched).
- **Deploy:** `pulumi preview` → 6 updates (api + web templates; `-scaling` diffs on
  collab/export/fetcher/worker confirmed **pre-existing drift** — identical preview with the
  PRB.21 diff stashed). `pulumi up` **update 69** → api rev `rhema-prod-api-e745ce0-00034-swf`,
  web rev `rhema-prod-web-72f1683-00010-k4l`.

### Headless live verify (all green)

- Unauthenticated `POST /projects/:id/runs`, `POST /import/presign`, `GET /projects` → **401**.
- **Concurrent create** (two parallel POSTs, distinct idempotency keys, `my-first-project`):
  A → **201** run `01M359HNKJ4VQ5YZA4PQZW0SXJ` `queued`; B → **409**
  `{error:"run_in_progress", runId:"01M359HNKJ4VQ5YZA4PQZW0SXJ"}`.
- **DB assert (over the IAP tunnel):** exactly ONE new run row; exactly ONE `credit_ledger`
  `hold` (36 cr, `hold:<runId>#topup`); after `PATCH /runs/:id` cancel → `cancelled` +
  `release` 36 cr. No second hold ever landed.
- **`activeRun` surfaced:** `GET /projects` row shows `{runId, state:"queued"}` while a run is
  live; the web sheet GET renders "in progress on this project." + a `/p/my-first-project/
  review/<runId>` link and **zero submit buttons** (verified with run `01M359TVSZNP60PG9F8S0BXCG4`,
  then cancelled — hold 36/release 36).
- **Import pending path:** `POST /import/presign` → 200 (`quarantine/<ws>/01M359K8T31C8PSSC2TGVQQPE2`,
  `maxBytes` 26214400); signed `PUT` → 200; `import/preview {waitMs:20000}` → **202
  `{pending:true}` in 21.2 s** (vs PRB.20's 246 s opaque hold); `import/create` while pending →
  **409 `conversion_pending`** in 26 s; 4 more polls (~20 s each) → **200** with the strict
  `ConversionResult` (`sourceFormat:md`, `quality:clean`, counts/warnings) — cold Job ~2.7 min
  wall; re-preview → **200 in 181 ms** (converted-object cache); `import/create` → **201**,
  draft `01M359SMBXQERPSQH2ZG5G433N` (n=4, `human_upload`) in 545 ms.
- **No duplicate executions:** exactly ONE `rhema-prod-convert-125dbd4` execution
  (`-b6vqw`, created 19:31:12Z → completed 19:33:51Z, succeeded) served 6 preview calls + the
  early create — the marker claim/join held across every retry.
- **Marker hygiene:** `converting/<ws>/` empty after completion (marker cleared);
  `converted/<ws>/<id>.json` present.
- Web `GET /p/my-first-project/import/preview?qk=…` → 200 in ~1 s rendering the ready state
  (cached path).

**Spend:** $0 inference — both verify runs were cancelled within seconds (no run-task work
committed); conversion is pure CPU. Verify session row + DB helper removed; tunnel closed.

## Green gate

`pnpm turbo build lint typecheck` **111/111** · `pnpm test` **275 files / 2121 pass** (1 skip;
the `lever-matrix` "<100 ms" perf assertion flaked once at ~166 ms under full-suite load —
passes isolated, pre-existing, unrelated) · `pnpm check:licenses` clean ·
`pnpm check:protocol-markers` clean · `check-build-memory.sh .` 0 violations.

## Deferral dispositions

- **D-PRB.20-1 → DONE** — the concurrent-create 409 + single-hold asserts above are its
  close-test, live on prod.
- No new deferrals opened.
