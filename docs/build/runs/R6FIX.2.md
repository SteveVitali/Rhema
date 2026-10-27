# R6FIX.2 — F-R6H11-2 (run-task image lacks vendored SDK) + F-R6H11-1 (collab restore convergence) — run ledger

- **Spec:** the task brief (findings work — no manifest ticket). Authorization: GD-REMAINING.R6 +
  GD-LCH-GO.R6 blanket approval.
- **Base:** `stevevitali/r6h11-auto-legs` @ `3e6f35c` (pushed tip).
- **Branch:** `stevevitali/r6fix-2-runtask-sdk` · mergePolicy=OPERATOR — never merge.
- **Harness:** devin-desktop/swe-2-high/subagent · **Skills:** implement-spec +
  build-memory + self-review @ `~/agent-skills`
- **Started:** 2026-10-27T05:30Z · **Closed:** 2026-10-27T07:2xZ
- **Live stage:** none — no prod mutations this run; the fixes ride the next deploy
  (R6LCH.1's launch deploy carries this branch's tip). Live re-proof owed post-deploy.

## Deferrals read

`docs/tickets/DEFERRALS.md` read first (protocol). Rows in scope:

- **D-PRB.04-2** — the browser `EventSource` half is discharged (R6H11); the in-phase
  meter-tick re-drive stays owed until the fixed run-task image deploys → dated tail note.
- **D-P1.08-1** — versions-rail deferral the restore defect was found under → dated tail note.

## Requirements

1. **F-R6H11-2 root-cause + fix.** Diagnose why the deployed `run-task` image
   `sha256:c7cf69c6…` lacks the vendored agent SDK (intake fails ~1 s `infra`; zero real
   runs since `e04a8c8`). Fix the root cause, not the symptom.
2. **Deploy-gate assert** so a no-SDK image can never ship silently again — a cheap
   deterministic assert (image-contents check / context check) at the deploy gate's
   checklist (image-set build + PROD-BRINGUP/INTEGRATION_PLAN §R4.8).
3. **Evidence-correctness note** — the `e04a8c8` deploy shipped a broken image despite
   green provenance; record the gate gap.
4. **F-R6H11-1 root-cause + fix.** Restore apply writes the stored head correctly but the
   live collab `y_state` doesn't converge — reconnects resurrect removed text. Fix so a
   restore converges the live doc for all connected clients. Deterministic test:
   restore apply → y_state converged → reconnect sees restored content.
5. Verify: `pnpm turbo build lint typecheck` touched packages + `pnpm test` touched +
   the image-build path's own tests; `check-build-memory.sh .` 0 violations;
   `check-append-only.mjs --base c1f20f5` OK.
6. Records: this ledger + `docs/build/pr/R6FIX.2.md` + PR + BUILD_INDEX row 227 +
   LEDGER (finding updates — F-R6H11-2/-1 resolved-in-code with re-proof owed; PHASE LOG;
   `nextTicket` stays `196a_HUMAN-H12`) + dated GATE-LAUNCH note.
7. Push; `ci-boundary.sh --ledger docs/build/LEDGER.md --ticket R6FIX.2 --json docs/build/logs/ci-R6FIX.2.json`.

## Acceptance criteria

- [x] Root causes named precisely with evidence (not "suspected").
- [x] `docker build`/`gcloud builds submit` of a run-task image whose context lacks the
      vendored SDK **fails** unless a placeholder is explicitly requested; the built
      image's SDK paths are asserted before push. *(engineered)*
- [x] Restore apply converges the live collab doc: stored `y_state` carries the restored
      content with tombstones for removed items; a loaded collab runtime converges rather
      than flushing stale state; a reconnecting client sees restored content. Deterministic
      test proves all three. *(fixture-verified; live re-proof owed post-deploy)*
- [x] Green gate + CI pass at head.
- [x] "Fix landed, live re-proof owed post-deploy" recorded honestly in LEDGER/GATE-LAUNCH.

## Plan

### Root causes (established at Phase 0)

- **F-R6H11-2:** the vendored SDK is gitignored operator-held state
  (`apps/run-task/vendor/claude-agent-sdk*/` — only `README.md` is committed). The
  `e04a8c8` image set was built by `gcloud builds submit` from a **clean worktree**
  (`/private/tmp/rhema-e04a8c8`, vendor/ = README only — confirmed on disk). The
  Dockerfile's placeholder-build contract WARNINGs but succeeds → the pushed
  `sha256:c7cf69c6…` has no SDK → the provenance gate (gitSha parity on api+web
  `/healthz`) stayed green — it never inspected run-task contents. Nothing in the
  chain `80db0d5`→`e04a8c8` changed the Dockerfile/vendoring — the build *context*
  changed (main checkout → SDK-less worktree).
- **F-R6H11-1:** `POST …/restore` (`apps/api/src/version-routes.ts`) replaces
  `live_docs.y_state` wholesale with a fresh Y.Doc's update (new item ids). Two holes:
  (a) a loaded collab runtime keeps its in-memory doc — the next debounced
  `onStoreDocument` flushes the PRE-restore state back over the write; (b) a client
  holding pre-restore items (Y.Doc/IndexedDB) syncs against the fresh state → its
  unknown items merge back in → resurrection. The stored state itself never recorded
  the deletions relative to the clients' items.

### Fix design

- **F-R6H11-1 — convergent restore.** (1) migration `0059`: `live_docs.y_epoch bigint
  not null default 0` — the out-of-band-replace signal. (2) `@rhema/editor`
  `replaceDocContent(doc, markdown)` — `updateYFragment` diff-apply (the same mechanism
  the block-patch path uses) so removed items tombstone. (3) api restore route applies
  the restore onto the STORED y_state (not a fresh doc) + bumps `y_epoch`.
  (4) collab `DocRuntime.yEpoch` + `convergeReplacedDoc(tx, rt, doc)` — reads the epoch
  inside the store tx; on mismatch applies the stored update into the in-memory doc
  (broadcasting the delete+insert to every connected client) instead of flushing stale
  state. Checked at the top of `storeDocument` + `markRestorePoint` scoped txs and on
  `beforeSync` type-0 (a fresh attach's SyncStep1 — reconnects converge before their
  first sync reply). No client change needed — tombstones + inserts converge replicas.
- **F-R6H11-2 — fail-closed vendoring.** (1) Dockerfile `ARG ALLOW_PLACEHOLDER_SDK=0`:
  missing vendor trees fail the build unless the arg is explicitly `1`.
  (2) `image-set.yaml`: pre-build context assert (the uploaded context == what the
  Dockerfile sees) gated by `_ALLOW_PLACEHOLDER_SDK`, + a post-build image-contents
  probe (`docker run --entrypoint /nodejs/bin/node` asserting the SDK paths) before
  push. (3) CI `images` job + `privsep.docker.test.ts` opt in explicitly.
  (4) runbook + INTEGRATION_PLAN §R4.8 + vendor README record the contract.

## Test matrix

| AC | Test |
|----|------|
| restore converges stored state | api `version-routes.test.ts`: restore apply → `y_epoch` bumped; stored `y_state` merged into a stale replica converges to restored markdown (no resurrection) |
| loaded runtime converges, doesn't clobber | `collab.test.ts`: out-of-band epoch-bumping write → `storeDocument` → stored `y_state` renders restored content; stale replica merge sees tombstoned items |
| reconnect sees restored content | `collab.test.ts`: `beforeSync` type-0 converges the loaded doc before the sync reply; real-provider reconnect leg if the seam allows |
| no-SDK build fails closed | image-set yaml lint/shape test if one exists (`infra/config/cloudbuild.test.ts`); Dockerfile arg shape reviewed; CI job diff verified |
| migrations additive | `check-additive-migrations --files 0059…` + `schema-parity.test.ts` |

## Progress

- **Phase 0 (2026-10-27T05:30Z):** branch `stevevitali/r6fix-2-runtask-sdk` forked at
  `3e6f35c`; DEFERRALS read; findings + ledger read; this ledger seeded.
- **F-R6H11-2 root cause (confirmed on disk):** `e04a8c8`'s image-set submit ran from
  `/private/tmp/rhema-e04a8c8` — a clean detached worktree whose
  `apps/run-task/vendor/` held only `README.md` (the SDK trees are gitignored
  operator-held state, so no fresh clone/worktree carries them). `.gcloudignore`
  correctly *allows* vendor/ through the upload filter — the context simply had
  nothing to upload. The Dockerfile's placeholder contract then WARNING'd and
  built anyway; `sha256:c7cf69c6…` shipped with no engine. `80db0d5`'s image
  carried the SDK because that build ran from the operator's populated checkout —
  nothing changed in the Dockerfile between them; the **context** changed.
  Provenance stayed green: `check-deploy-provenance` compares `/healthz`
  `build.gitSha` on api+web — it never inspects run-task contents.
- **F-R6H11-1 root cause:** `POST …/restore-points/:rp/restore` wrote the correct
  artifact head AND replaced `live_docs.y_state` with a **fresh-doc** update
  (`markdownToUpdate` — new item ids, zero tombstones). Two distinct resurrection
  paths: (a) a loaded collab runtime's in-memory doc was never reconciled, so the
  next debounced `onStoreDocument` re-persisted the pre-restore items over the
  write; (b) a replica holding the pre-restore items (a synced client's Y.Doc /
  y-indexeddb) merges its unknown items back in on its next sync — the stored
  state never recorded the deletions relative to the replica's items.
- **Implementation:** migration 0059 `live_docs.y_epoch`; `@rhema/editor`
  `replaceDocContent(doc, md)` (updateYFragment diff — unchanged blocks keep
  items/anchors, removed items tombstone); api restore route diffs over the
  STORED y_state + bumps `y_epoch` in the same statement; `DocRuntime.yEpoch` +
  `convergeReplacedDoc` at the top of `storeDocument` / `markRestorePoint` /
  `beforeSync` (SS1 only) — each persistence/sync seam reconciles against storage
  FIRST, inside its own scoped tx; a canonical-markdown equality check covers
  out-of-band writes that share no item history.
- **F-R6H11-2 fix:** Dockerfile `ARG ALLOW_PLACEHOLDER_SDK=0` — missing vendor
  trees exit 1 unless the caller opts in; `image-set.yaml`
  `_ALLOW_PLACEHOLDER_SDK:"0"` + pre-build context assert + post-build
  image-contents probe (`docker run` → `setpriv` → uid-10002 `node -e` asserting
  `sdk.mjs` readable + `claude` executable) before push; CI `images` job +
  `privsep.docker.test.ts` opt in explicitly; runbook + INTEGRATION_PLAN §R4.8 +
  vendor README updated.
- **Self-review:** two passes — mechanical (hook ordering, y-protocols type
  codes, operator-precedence audit of the Dockerfile `&&`/`||` chain, pg Buffer
  handling, fork re-home epoch reset) + design/staff (found the probe's X_OK on a
  non-executable library file → R_OK/X_OK split; found the no-shared-history
  convergence edge → canonical-markdown fallback added; found the stale-replica
  test initially built a divergent doc — corrected to a synced replica; found +
  reverted unrelated prettier reflow on 4 drifted files — minimal diffs kept).

## Gap table

| AC | Status | Evidence |
|----|--------|----------|
| No-SDK build fails closed; opt-in placeholder only | engineered — Dockerfile gate exits 1; image-set context+contents asserts | `apps/run-task/Dockerfile:33,67-78`; `infra/cloudbuild/image-set.yaml` `_ALLOW_PLACEHOLDER_SDK` + build loop |
| Built image's SDK asserted before push | engineered — `docker run` uid-10002 probe | image-set.yaml build step (post-build, pre-push) |
| Restore apply writes convergent y_state + epoch | verified — api test | `version-routes.test.ts` "CONVERGENT y_state + bumps y_epoch" |
| Loaded runtime converges, never flushes stale | verified — collab tests (incl. no-shared-history edge) | `collab.test.ts` F-R6H11-1 tests |
| Reconnect sees restored content on the wire | verified — real HocuspocusProvider over a socket | `collab.test.ts` "real provider … reconnects and converges" |
| Provenance-gap recorded | done — finding entry + this ledger + PROD-BRINGUP §2b | LEDGER F-R6H11-2 |
| Live re-proof on prod | **OWED post-deploy** — no prod mutation this run | rides the next deploy's image set |

**Residual (recorded, bounded):** a `live_docs` row whose stored `y_state` is
*empty* while a runtime is loaded (row created at seed before the first store)
would make the api's tmp-doc base empty → a fresh-doc update with no shared
history. `convergeReplacedDoc`'s canonical-markdown fallback covers it (stale
items tombstone on converge); stored-empty + loaded-runtime overlap is a ~2 s
debounce window in practice.

## Evidence log

- `pnpm turbo build lint typecheck` — **135/135** tasks green.
- `pnpm vitest run` touched paths — collab 23/23 · api version-routes 14/14 ·
  editor/db/run-task full files **323/323** (incl. `privsep.docker.test.ts` —
  real production-image build with `ALLOW_PLACEHOLDER_SDK=1`, all privsep
  checks PASS).
- `node scripts/check-additive-migrations.mjs --files …/0059…` — additive, pass.
- `infra/config` tests (cloudbuild/provenance/runbook/stages) — 49/49.
- CI boundary — **two reads, honestly recorded:** head `0dcb34a` read **FAIL**
  (`typecheck / lint / unit`, run 40457832512 — the `--newer-than 0044` census in
  `check-additive-migrations.test.mjs` listed 0045..0058 and did not expect the new
  0059; 515 pass / 1 fail). Fixed by pinning `0059_live_docs_y_epoch.sql` in the
  census expectation (`d889969` — the census is intentionally a real-file list).
  Re-read at `d889969` → **PASS** (run 40462016176 — all seven legs + `ci-pass`
  anchor; record `logs/ci-R6FIX.2.json`). PR #221 green, unmerged (OPERATOR).
- New tests: api "the apply writes a CONVERGENT y_state + bumps y_epoch — a stale
  replica merges tombstoned"; collab "an out-of-band restore converges the loaded
  doc" (incl. no-shared-history edge), "beforeSync converges … SS1 (type 0) and
  leaves SS2 alone", "a real provider holding pre-restore state reconnects and
  converges".

## Evidence report

Both findings root-caused and fixed in code with deterministic tests; no prod
mutation — the fixes ride the next deploy, live re-proof owed post-deploy.

