# R6FIX.2 — F-R6H11-2 (run-task image lacks vendored SDK) + F-R6H11-1 (collab restore convergence)

Insert row (operator-directed findings work; no manifest file) · stacks on
`stevevitali/r6h11-auto-legs` · mergePolicy: **OPERATOR** (never self-merges).

**Honest headline: both R6H11 live findings are root-caused and fixed in code with deterministic
tests — all fixture/engineered-verified; the live re-proofs are honestly owed post-deploy (prod
still serves `e04a8c8` and its no-SDK run-task image; no prod mutation this run). $0 spent.**

## Per-finding verdicts

| Finding | Verdict | Evidence |
|---|---|---|
| **F-R6H11-1** — restore apply converges stored head but not the live collab doc; reconnects resurrect removed text | **FIXED in code** — convergent tombstoned write + `y_epoch` + converge seams | api `version-routes.test.ts` +3 restore legs; collab 3 new tests incl. real-socket reconnect |
| **F-R6H11-2** — deployed `run-task` image `sha256:c7cf69c6…` ships no vendored agent SDK; **no run can execute on prod** | **FIXED in code** — fail-closed Dockerfile gate + context/image-contents asserts | Dockerfile `ALLOW_PLACEHOLDER_SDK`; `image-set.yaml` `_ALLOW_PLACEHOLDER_SDK` + post-build uid-10002 probe; privsep docker test green on the real image |

## Root causes (confirmed, not suspected)

**F-R6H11-2.** The vendored SDK (`apps/run-task/vendor/claude-agent-sdk*/`) is gitignored
operator-held state — only `README.md` is committed. The `e04a8c8` image set was built by
`gcloud builds submit` from a **clean detached worktree** (`/private/tmp/rhema-e04a8c8`; its
`vendor/` held only the README — confirmed on disk). `.gcloudignore` correctly allows `vendor/`
through — the context simply had nothing to upload. The Dockerfile's placeholder contract
WARNING'd and built anyway → `sha256:c7cf69c6…` shipped with no engine. Nothing changed in the
Dockerfile between `80db0d5` and `e04a8c8` — **the build context changed** (populated checkout →
SDK-less worktree). **Evidence-correctness:** provenance stayed green because
`check-deploy-provenance` compares `/healthz` `build.gitSha` on api+web — a SHA-parity check is
not an image-contents check; the gate had a gap and this PR closes it in the build path itself.

**F-R6H11-1.** `POST …/restore-points/:rp/restore` wrote the correct restored artifact head AND
replaced `live_docs.y_state` — but with a **fresh-doc** update (`markdownToUpdate`: new item ids,
zero tombstones). Two resurrection paths: (a) a loaded collab runtime's in-memory `Y.Doc` was
never reconciled, so the next debounced `onStoreDocument` re-persisted the pre-restore items over
the write; (b) a replica holding the pre-restore items (a synced client's Y.Doc / y-indexeddb)
merged its unknown items back in on its next sync — the stored state never recorded the deletions
relative to the replica's items. Both legs were observed on prod (`y_state` contained the
restored-away text while `md_sha256` was the restored sha; a fresh browser context rendered it).

## What changed

**1. Convergent restore (F-R6H11-1).**

- `packages/db` migration **0059**: `live_docs.y_epoch bigint not null default 0` — the
  out-of-band-replace signal (additive, metadata-only default).
- `@rhema/editor` `replaceDocContent(doc, markdown)` — one `updateYFragment` diff transaction:
  unchanged blocks keep their Y items (cursors/anchors hold); removed items **tombstone**.
- `apps/api` restore route — builds the new `y_state` by diffing the restored markdown over the
  **stored** state (not a fresh doc) and bumps `y_epoch` in the same statement.
- `apps/collab` — `DocRuntime.yEpoch` recorded at load; `convergeReplacedDoc(tx, rt, doc)` runs
  at the top of `storeDocument` and `markRestorePoint` (inside their scoped txs, before any
  `y_state` write) and on `beforeSync` **type-0 only** (a fresh attach's SyncStep1 — the reply is
  computed after the converge, so reconnects get tombstones, not resurrected text; SS2/updates
  ride the debounced store's check instead of a db read per keystroke). The converge applies the
  stored update — which broadcasts the delete+insert to every **connected** client, so active
  clients converge live — and a canonical-markdown equality check covers out-of-band writes that
  share no item history (belt: reprojected fragment-diff replace). No client change needed.

**2. Fail-closed vendored-SDK gate (F-R6H11-2).**

- `apps/run-task/Dockerfile` — `ARG ALLOW_PLACEHOLDER_SDK=0`; a missing
  `vendor/claude-agent-sdk/` or `vendor/claude-agent-sdk-linux-x64/claude` **exits 1** with the
  remediation in the message unless the caller explicitly opts into a placeholder image.
- `infra/cloudbuild/image-set.yaml` — `_ALLOW_PLACEHOLDER_SDK:"0"` (operator-overridable
  substitution); **pre-build context assert** (the uploaded context is what the Dockerfile sees —
  a clean worktree fails BEFORE building, with the populate-the-SDK instructions inline) and a
  **post-build image-contents probe**: `docker run` the built image, `setpriv` to uid 10002, and
  assert `sdk.mjs` is readable + `claude` is executable by the agent uid — **before push**, so a
  broken image can never reach the registry again.
- `.github/workflows/ci.yml` images job + `apps/run-task/src/privsep.docker.test.ts` pass
  `ALLOW_PLACEHOLDER_SDK=1` explicitly (CI checkouts never carry the SDK — the opt-in is the
  deliberate-placeholder contract).
- `infra/PROD-BRINGUP.md` §2b (the gate + remediation), `INTEGRATION_PLAN.md` §R4.8, and
  `apps/run-task/vendor/README.md` record the contract — including *why* a clean worktree can't
  build the real image.

## Honestly owed (live re-proofs)

- A `run-task` image **built from a checkout carrying the vendored SDK** and deployed — the
  launch deploy (R6LCH.1's window) must carry this branch's tip; prod still serves the no-SDK
  `e04a8c8` image until then.
- Restore-apply live re-proof on prod (converged `y_state` + a reconnect seeing restored
  content); the in-phase meter-tick leg stays owed on **D-PRB.04-2** until the fixed image
  deploys.

## Deferral / finding updates

- **LEDGER**: F-R6H11-1 + F-R6H11-2 → RESOLVED-IN-CODE (re-proof owed); `chainTip` →
  `stevevitali/r6fix-2-runtask-sdk`; `nextTicket` stays `196a_HUMAN-H12`.
- **DEFERRALS**: dated tails on **D-PRB.04-2** (unblock landed in code; meter-tick re-drive owed
  post-deploy) + **D-P1.08-1** (F-R6H11-1 resolved-in-code).
- **GATE-LAUNCH** threshold-1 dated note (both findings fixed in code; launch requires a
  vendored-SDK run-task build+deploy).

## Verification

- `pnpm turbo build lint typecheck` — **135/135** green.
- Vitest touched paths — **323/323**: collab 23 (incl. 3 new F-R6H11-1 legs — PGlite out-of-band
  convergence, beforeSync SS1/SS2 contract, real-provider reconnect over a socket) · api
  version-routes 14 (incl. the convergent-apply tombstone assert) · editor/db/run-task full ·
  `privsep.docker.test.ts` builds the real production image (placeholder opt-in) — all privsep
  checks PASS.
- `check-additive-migrations --files …/0059…` — additive pass · `infra/config` tests 49/49.
- `check-build-memory.sh .` — 0 violations · `check-append-only.mjs --base c1f20f5` — OK.
- CI: `docs/build/logs/ci-R6FIX.2.json` (boundary read recorded in the run ledger).

Run ledger: `docs/build/runs/R6FIX.2.md`.
