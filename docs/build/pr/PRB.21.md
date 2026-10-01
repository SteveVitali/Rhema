# PRB.21 — Live-use defect pass: concurrent-run guard + import-preview latency

Stacked on #49 (`stevevitali/prb-20-live-ingestion-upload-path`). Ticket:
`docs/tickets/28l_PRB.21__live-use-defect-pass.md`. Run ledger:
`docs/build/runs/PRB.21.md`. **Closes D-PRB.20-1.**

Day-one operator use on prod surfaced two defects: (1) a second run click on a project with an
active run spawned a duplicate run **and a duplicate credit hold** (4 `review/quick` runs in
11 s → 2,184 cr of a 2,500 balance held); (2) the import preview synchronously held the browser
request for the ~2.5–4 min a cold convert Job takes — indistinguishable from a hang.

## What lands

- **One active run per project (beta ruling).** `createRun` now takes a `select … for update`
  lock on the project row inside its transaction, checks the idempotency memo first (a replay
  of THIS submission still dedupes to its live run), then rejects any second create while a
  run is non-terminal — the whole insert rolls back: no run row, no memo, **no second hold**.
  The api answers `409 {error:"run_in_progress", runId}`. `NON_TERMINAL_RUN_STATES` is derived
  once from `RUN_STATES` \ `TERMINAL_RUN_STATES` so guard, list, and tests share one definition.
- **The sheet shows the truth.** Project rows carry `activeRun {runId,state}`; the run sheet
  renders an in-progress state with a link to `/p/:slug/review/:runId` instead of the Run
  affordance, and a 409 on POST re-renders that state — never an error page.
- **Bounded import preview.** `import/preview` accepts `waitMs` (clamped ≤ 25 s): a
  still-converting upload answers `202 {pending:true, quarantineKey}`; `import/create` while
  pending answers `409 conversion_pending`. The web polls the same route (meta-refresh pending
  page, no client JS) reusing the same quarantine key.
- **One conversion, ever.** A `converting/<ws>/<id>.json` marker (15-min TTL) is claimed
  atomically (`ifGenerationMatch:0`); a claim conflict joins the existing Cloud Run Job
  execution rather than launching another. The `converted/<id>.json` object stays the durable
  completion signal + retry cache. Marker clears on success/failure/stale.

## Live evidence (prod, Pulumi update 69)

- Two parallel creates → **201** + **409 `run_in_progress`** (same run id); DB: one run row,
  one 36-cr hold, released on cancel.
- Sheet renders "in progress on this project." + review link, zero submit buttons.
- Preview: **202 in 21 s** cold (was a 246-s hang in PRB.20's verify); `create` while pending →
  **409**; poll → **200**; re-preview **181 ms** cached; `import/create` → **201** draft n=4.
- Exactly **one** convert Job execution across 6 polls + 1 create — no duplicate `jobs:run`.

## Verify

`turbo build lint typecheck` 111/111 · `pnpm test` 275 files / 2121 pass (one pre-existing
`lever-matrix` timing flake, green isolated) · `check:licenses` + `check:protocol-markers`
clean · `check-build-memory.sh` 0 violations.

**Do not merge** — merge policy is operator-controlled; the chain stacks on #49.
