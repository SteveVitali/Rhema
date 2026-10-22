# ADR-115: CI fast path — docs-only/same-tree heads reuse a full green verdict via a repo-wide anchor

- **Status:** Accepted
- **Date:** 2026-10-20
- **Ticket:** R6CI.1 (operator insert 176a; rulings D1–D9)
- **Requirement ids:** none — operator-inserted improvement ticket (the contract's Authority
  block is the requirement record)
- **Spec:** `docs/tickets/176a_R6CI.1__ci-cost-phase-1.md`; `.github/workflows/ci.yml`;
  `scripts/ci/{lib/fast-path.mjs,decide-fast-path.mjs,write-anchor-payload.mjs,
  fast-path-paths.txt,neutral-readers.txt}`

## Context

The October Actions profile: 18,023 billed minutes, **44 % on docs-only heads** (78 % of PR
minutes since 10-14); a full run ≈ 58 billed / ≈ 52 wall-clock minutes across the five-job
pipeline. Every ledger-only push paid the same full price as a schema migration. PR artifact
caches are not shared across PRs, so even a head *bit-identical in every non-docs path* to a
head a full run just verified could not see that verdict through any cache — a new PR's first
run always ran full.

`scripts/deploy-neutral-paths.txt` (ADR-114) already names what cannot change the deployed
artifact: `docs/` and `.gitleaks.toml`. The fast path needs the narrower predicate — cannot
change the product **or a CI verdict** — which is a strict subset, because some docs redefine
what the boundary itself reads.

## Decision

### The trust model

A `pull_request` head may run the **fast path** — gitleaks + `check:no-cookies` + the
committed docs-reader subset, nothing else — only when every one of these holds:

1. **Event gate.** `pull_request` only. `push`/`main` runs are always full (operator ruling
   D5 — `main` never reuses a PR pass); `workflow_dispatch` runs full so a dispatch remains
   the honest way to force a full boundary.
2. **Gate (b) — the delta since the anchor is all-eligible.** For every candidate,
   `gh api …/compare/{anchor_head}...{head}` (three-dot, from the API — never
   `fetch-depth`) must return, be untruncated (`files[] < 300`), have
   `merge_base_commit == anchor_head` (true ancestry), and every
   `filename`/`previous_filename` must match `scripts/ci/fast-path-paths.txt`. The anchor's
   green run already covered everything up to its head, so only the *delta* needs proof —
   the whole-PR-diff reading was rejected in Episteme ADR-0534 (it can never fast-path a
   docs closeout on a code PR). A code, workflow, `.gitleaks.toml`, or boundary-tool path
   in the delta → the anchor cannot vouch, *even when its tree hash matches*.
3. **An anchor proves equivalence** — either arm:
   - **Same-tree (arm A):** the artifact's `<h>` equals this head's *non-docs tree hash* —
     sha256 over the sorted `git ls-tree -r HEAD` listing with eligible paths stripped (the
     checked-out merge tree: what a run actually tests). The hash binds the merge-tree
     content, so gate (b) + ancestry are the whole check — no base-context check needed.
   - **Pure-neutral descendant (arm B):** the name doesn't match, so the base context must
     also be preserved (`payload.base_sha ==` this PR's base for PR-produced anchors; for
     branch-run anchors with no `base_sha`, the PR base must be an ancestor of head so the
     merge tree *is* the head tree).

**Fail-closed everywhere:** any error, ambiguity, missing field, invalid JSON, unresolvable
run, or unmatched check → `mode=full`. The `fast-path` job emits one verdict consumed by
every job via `needs.fast-path.outputs.mode`; every pre-existing step is gated
`mode == 'full'`; jobs keep their names and conclude `success` with a `CI-FAST-PATH`
notice + step-summary line (required checks stay green — Episteme ADR-0534 precedent).

### The anchor contract (`ci-pass-<h>`)

- **Producer:** the `ci-anchor` job — `needs:` every leg — uploads `ci-pass-<h>` only when
  the *full* run concluded green, on any event (PR, push, dispatch). Payload:
  `{mode:"full", run_id, head_sha, non_docs_tree:<h>, base_sha?}` — `base_sha` recorded for
  pull_request producers, absent for branch runs.
- **Verifier:** lists artifacts repo-wide (they cross PRs — that is the point), fetches
  each candidate's `runs/{id}` (`conclusion == "success"` required) and payload
  (`mode == "full"` required, `run_id` must equal the artifact's own run, `non_docs_tree`
  must equal the name's hash). A fast run **never writes an anchor** — a `mode != "full"`
  payload is poison; a same-named invalid candidate short-circuits to full rather than
  resolving "which one". Needs `actions: read` — declared at workflow level and kept inside
  `public-safe`'s existing job-level narrowing.

### Neutral vs check-neutral — the carve-outs

`fast-path-paths.txt` = `deploy-neutral-paths.txt` minus:

| exclusion | why a docs-only verdict cannot skip it |
| --- | --- |
| `.gitleaks.toml` | its edit must be *scanned*, not skipped — gitleaks itself runs on every head |
| `docs/build/tools/**` | `check-append-only.mjs` / `ci_boundary.*` redefine what a boundary read checks — a diff there cannot vouch for itself |
| `docs/build/record_policy/**` | `ci_required.txt` redefines which checks the boundary requires |

### The always-run set (never gated)

- `gitleaks` — a docs diff can *contain* a secret.
- `pnpm check:no-cookies` — it reads `docs/openapi.{yaml,json}`; a docs diff can change the
  ingestion surface.
- `scripts/ci/neutral-readers.txt` — the committed, build-time-audited list of test files
  whose verdicts read deploy-neutral paths (the recorded grep + hand dispositions live in
  the file header; the mechanical leg is re-run by `scripts/ci/fast-path.test.mjs`).
  Package-resident entries import workspace code whose exports resolve through `dist/`, so
  the fast head first builds the subset owners' dep closures
  (`turbo build --filter=@rhema/security-checks... --filter=@rhema/journeys...`) — a
  remote-cache hit in seconds because a fast head's non-docs tree is identical to the
  anchored head's by construction (2026-10-21 addendum, learned on the hosted proof).

### Cadence, concurrency, dispatch

- **D4:** a *full* run is required at each round-6 gate (GATE-R6B, GATE-LAUNCH,
  GATE-ACCEPT.R6) and each deploy SHA — never per ticket. Per-ticket boundary reads accept
  a fast-path pass. Policy lives in `docs/development.md` + manifest operating rule 10.
- `workflow_dispatch` (no inputs) added; a dispatch on a PR branch attaches its checks to
  that head SHA — the forcing function for gates/deploys between pushes.
- Concurrency pinned to `ci-${{ github.event_name == 'pull_request' && github.ref ||
  github.sha }}` — PRs keep `refs/pull/N/merge` cancellation; push/dispatch group per-SHA
  so queued `main` merges stop cancelling each other.
- **D7:** both `journeys.yml` schedules (nightly + weekly `--paid`) are commented out with
  a dated `R6SWP.1` restore marker; `workflow_dispatch` stays live. R6SWP.1 owns the first
  scheduled-nightly green.

## Consequences

- Expected ≈ −40–55 % billed minutes on the round-6 mix (44 % docs-only share ≈ 58 → 3–5
  min per head); measured delta is `D-R6CI.1-1`, read after three tickets of CI history.
- The first run of any ticket touching `ci.yml` is full *by rule* — this PR demonstrates:
  code head → full + anchor upload; docs head → fast.
- A scoped per-image fast path was explicitly **not** adopted (Episteme lesson: a scoped
  PR once skipped a broken image build); per-image scoping on code heads stays out.
- Phase-2 levers (PGlite template clone, `unit` sharding, shared image builder — D6) are
  gated on the measured delta.
- Widening `fast-path-paths.txt` or the anchor contract is a new ADR, not a drive-by edit.
- New always-run guards on fast heads (`pnpm install` in `unit` + `public-safe`'s guard
  steps) keep a fast head at ≈3–5 min — never add a per-ticket full-run requirement, or the
  savings cancel.

## Alternatives considered

- **Skip-CI / `[skip ci]` on docs heads:** rejected — leaves `ci-boundary` pending (zero
  checks is not green), and a docs diff can still contain a secret.
- **Job-level `if:` skips:** rejected — required checks would report skipped/pending and
  break branch protection; every job must conclude `success`.
- **Diff-only fast path (no anchor):** rejected — a PR whose base moved could produce an
  untested merge tree; the tree hash is the ground truth, the delta diff is the gate.
- **Whole-PR-diff eligibility (PR base…head):** rejected (Episteme's rejected alternative
  (b)) — sound, but it can never fast-path a docs closeout push on a code PR, which is the
  point. The gate binds the delta since the anchor instead.
- **`fetch-depth: 0` + local git diff:** rejected — the compare API needs no depth and
  cannot be tricked by a shallow or partial clone.
- **Trusting artifact names alone:** rejected — names are attacker/bug-forgeable; the
  verifier binds name ↔ payload ↔ producing run's success.

## Revisit trigger

Reopen when (a) `D-R6CI.1-1`'s measurement shows the delta under −20 % billed (phase 2
justifies itself or the path costs more than it saves), (b) a false-fast verdict is ever
observed (a head that changed a non-docs verdict while classified fast — the carve-outs and
the anchor contract get re-examined, not patched), (c) R6SWP.1 restores the journeys
schedules (the D7 pause ends by definition), or (d) GitHub's artifact retention (90d) or
compare-API truncation semantics change under the verifier.
