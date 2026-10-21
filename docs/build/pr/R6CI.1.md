# R6CI.1 — CI cost phase 1: docs-only/same-tree fast path, full-run cadence, nightly pause

Stacked on `stevevitali/r6eng-1-ci-provenance-hygiene` · `mergePolicy: OPERATOR` —
**do not merge; the operator merges the chain bottom-up.** CI/Actions surface only;
$0 expected spend; no live stage, no cloud, no secrets, no repo settings.
`implement-spec spec=docs/tickets/176a_R6CI.1__ci-cost-phase-1.md` — manifest row 176a,
operator run-time insert between R6ENG.1 and R6ENG.2.

**Requirement ids stamped:** none — operator-inserted improvement ticket; the contract's
Authority block is the requirement record (stamped verbatim below).

## Authority (operator rulings, 2026-10-20 — verbatim)

- **D1 (insert + slot):** "Insert 176a first" — the insert lands between R6ENG.1 (closed,
  PR #195) and R6ENG.2 (not yet dispatched).
- **D2 (implementer):** "This chain implements" — dispatched by orchestrate-build like any
  row.
- **D3 (workflow edits):** "Approve" — phase-1 edits to `.github/workflows/ci.yml` as
  scoped; **plus** the journeys.yml schedule pause per D7. No new action, secret, runner,
  repo setting, variable or cloud resource. Workflow `permissions:` keys are within scope.
- **D4 (full-run cadence):** "Per gate + per deploy SHA" — one full CI run required at
  each round-6 gate (GATE-R6B, GATE-LAUNCH, GATE-ACCEPT.R6) and at each deploy SHA
  (R6DEP.1, R6SWP.1, R6CNT.2's redeploy, R6LCH.1's flip deploys); never required per
  ticket.
- **D5 (main reuse):** "No" — `push`/`main` runs are always full.
- **D6 (phase 2):** "Later, after measurement" — PGlite template clone, `unit` sharding /
  job-graph change, shared image builder are a possible future insert, gated on this
  ticket's measured delta.
- **D7 (journeys nightly):** "Pause schedule until R6SWP.1" — the `schedule:` trigger in
  `.github/workflows/journeys.yml` is commented out (pauses **both** crons: nightly +
  weekly `--paid`); `workflow_dispatch` stays.
- **D8 (push batching):** "Yes, batch ledger pushes" — no ledger-only push to an open-PR
  branch after a boundary confirm; ledger notes carry into the next ticket's push. (This
  ticket demonstrates it: the ledger closeout rides the docs-only head.)
- **D9 (self-hosted runner):** "No."

## What

- **Fail-closed fast path (ADR-115).** A new `fast-path` job computes one verdict per
  head: sha256 over the `git ls-tree -r HEAD` listing with
  `scripts/ci/fast-path-paths.txt`-eligible paths stripped (the committed allowlist =
  `deploy-neutral-paths.txt` minus `.gitleaks.toml`, `docs/build/tools/**`,
  `docs/build/record_policy/**` — "can't change the product **or a CI verdict**"), then
  the repo-wide `ci-pass-<h>` artifact set via the Actions API. A PR head runs the fast
  path only when a `mode:"full"`-produced, green-run anchor exists whose recorded head is
  an ancestor **and** every path changed since it (compare API — never fetch-depth) is
  eligible — either arm A (same tree hash) or arm B (pure-neutral descendant with the base
  context preserved). Any error/ambiguity → full. `scripts/ci/lib/fast-path.mjs` is pure;
  `scripts/ci/fast-path.test.mjs` is the 32-case AC matrix.
- **Always-run guards + the docs-reader subset.** `gitleaks` and
  `pnpm check:no-cookies` run on *every* head (a docs diff can contain a secret / change
  `docs/openapi.*`); on fast heads the committed audit `scripts/ci/neutral-readers.txt`
  (five verified test files whose verdicts read deploy-neutral content) runs as one step.
- **Anchor contract.** The new `ci-anchor` job (`needs:` all legs) uploads
  `ci-pass-<non_docs_tree>` `{mode:"full",run_id,head_sha,non_docs_tree,base_sha?}` only on
  green full runs (any event — PR, push, dispatch); fast runs never write anchors, and a
  `mode != "full"` payload is poison to the verifier (`runs/{id}` must exist and conclude
  success; `run_id` must match the artifact's own run; name hash must equal
  `non_docs_tree`). `actions: read` at workflow level + inside `public-safe`'s narrowing.
- **Job shape.** Every job keeps its name and concludes `success`; each prints a
  `CI-FAST-PATH` notice + a step-summary line distinguishing fast from full.
- **`workflow_dispatch`** (no inputs — `gh workflow run ci.yml --ref <branch>`); the
  cadence policy lands in `docs/development.md` + manifest Operating rule 10: full run per
  gate + per deploy SHA, never per ticket; `main` never reuses a PR pass.
- **Concurrency** pinned to
  `ci-${{ github.event_name == 'pull_request' && github.ref || github.sha }}`,
  `cancel-in-progress: true` — PR cancellation preserved; queued `main` merges stop
  cancelling each other.
- **Duplicate tests.** `contracts`' `vitest run packages/contracts packages/db` + its
  `pnpm --filter … build` dropped (root `pnpm test` covers `packages/**`); the
  `integration` DATABASE_URL/Docker legs stay.
- **`--maxWorkers` measurement (AC3) — VERDICT: DROP.** Unit-leg vitest under
  `--minWorkers=1 --maxWorkers=2`: **40m41s** (run 39508570350) — green but the slowest
  of four reads (prior unflagged `pnpm test` legs on #195: 40m47s / 32m45s / 27m05s).
  Not "green + faster" → `pnpm test` restored (the tail is per-file PGlite workers can't
  split). Numbers + reasoning in `docs/build/runs/R6CI.1.md`.
- **journeys pause (D7).** Both crons (`5 6 * * *` nightly, `35 4 * * 1` weekly `--paid`)
  commented out with a dated `R6SWP.1`-restore marker; `workflow_dispatch` unchanged.

## Interpretation note (operator-facing)

Contract gate (b) — "every changed path `base…head` matches that list" — is implemented
as the delta **since each candidate anchor's recorded head**, matching the Episteme
ADR-0534 precedent this ticket mirrors (its rejected alternative (b): the whole-PR diff
"never fast-paths a closeout commit on a code PR — misses the goal"). The hosted-proof
sequence requires the docs-only closeout on this code-bearing PR to fast-path, which only
the delta reading permits. Recorded in ADR-115 + the run ledger.

## Hosted proofs (this PR is the demonstration)

1. **Code heads → full runs.** `9871f9f` (run 39508570350, 52m, all seven jobs green)
   and `75e9faf` (run 39515554971 — the `--maxWorkers` revert + the two dispatch-leg
   fixes). Anchors `ci-pass-f8d415d7…` and `ci-pass-a2cfd72d…` live (`expired=false`).
   Boundary: `ci: pass #196@75e9faf`.
2. **Docs-only head → fast path.** The ledger closeout push: jobs conclude `success`
   with `CI-FAST-PATH` notices; guards + subset ran; minutes-scale duration; no anchor
   written. *(recorded verbatim in `docs/build/runs/R6CI.1.md` once the head lands)*
3. **`workflow_dispatch` pre-flight → GREEN.** First attempt (run 39508572358 @
   `9871f9f`) triggered fine (no 422 → `D-R6CI.1-2` unwritten) but surfaced **two
   pre-existing latent legs** a PR-only graph never exercised: gitleaks scans full
   history on non-PR events and flagged the `journey2026stb5a` citeproc-key fixture
   literal (`.gitleaks.toml` now pins it — same class as the two existing fixture
   entries); the contracts migration lint's `git fetch … --depth=1` left
   `origin/main...HEAD` without a merge base on `BASE=main` (fetch is now unbounded;
   the job's checkout was already `fetch-depth: 0`). Both fixes verified by run
   **39515615073** @ `75e9faf` — all seven jobs green incl. `ci-pass anchor`.

## Test plan

- `pnpm exec vitest run scripts/ci/fast-path.test.mjs` — 32/32 (classifier arms, allowlist
  semantics, anchor producer/verifier rules, poison, ambiguity, workflow pins, audit
  re-run).
- Docs-reader subset locally: 45/45 (`check-coverage-matrix`, `deferral-status-parity`,
  `observability`, `secrets-manifests`, `journeys/registry`).
- `pnpm check:no-cookies`; `turbo build lint typecheck` 135/135; `check:dom-contract`;
  `check-upstream-diff`; `compute-protocols-version`; `check:licenses`;
  `check:protocol-markers`; `check:spa-budget`; `check:spa-env` — all green.
- Hosted: `ci-boundary` reads + artifact listing + `CI-FAST-PATH` notices at each head.
