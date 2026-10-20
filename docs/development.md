# Development — CI cadence policy (R6CI.1, ADR-115)

How CI runs are consumed in round 6 under the docs-only/same-tree fast path. The mechanism
is ADR-115; this page is the *policy* — when a full run is owed and when a fast-path pass
discharges a boundary read.

## What runs where

| event | mode | why |
| --- | --- | --- |
| `pull_request`, a valid `ci-pass-<h>` anchor whose recorded head is an ancestor **and** every path changed since it is `fast-path-paths.txt`-eligible (same-tree or pure-neutral descendant) | **fast** — gitleaks + `check:no-cookies` + the `neutral-readers.txt` subset; every job still concludes `success` | the head provably cannot change the product or a CI verdict |
| `pull_request`, anything else | **full** — the five-leg pipeline + `ci-anchor` upload | code, workflow, `.gitleaks.toml`, boundary-tool paths, ambiguous diff, or no valid anchor → full, always |
| `push` to `main` | **full**, always | D5: `main` never reuses a PR pass |
| `workflow_dispatch` (`gh workflow run ci.yml --ref <branch>`) | **full**, always | the dispatch is the forcing function; a dispatch on a PR branch attaches its checks to that head SHA |
| `journeys.yml` schedules | **paused** until R6SWP.1 (D7) — `workflow_dispatch` stays | no ticket consumes the nightly/weekly signal; the WIF variables are unset (15/15 auth failures) |

## When a FULL run is owed (D4 — per gate + per deploy SHA, never per ticket)

One green full run, read by `ci-boundary`, is required at:

- **each round-6 gate** — GATE-R6B, GATE-LAUNCH, GATE-ACCEPT.R6;
- **each deploy SHA** — R6DEP.1, R6SWP.1, R6CNT.2's redeploy, R6LCH.1's flip deploys.

A per-ticket boundary read accepts a **fast-path pass** at that head. If a gate or deploy
needs a full run and the tip hasn't had one, dispatch it:
`gh workflow run ci.yml --ref <branch>` → wait for green → proceed.

**Guard:** never add a per-ticket full-run requirement. The October profile (~5 full PR runs
per ticket at ~58 billed min) shows that cadence cancels the fast path's savings — the whole
point of phase 1.

## Reading a fast-path head

A fast-path verdict means: *this head's non-docs content is bit-identical (arm A) or
pure-neutral-descendant (arm B) to a tree a full green run already verified, and every path
changed since the anchor's recorded head touches only
`scripts/ci/fast-path-paths.txt`-eligible paths.* Every job prints a
`CI-FAST-PATH` notice and a step-summary line naming fast vs full; the `ci-boundary` read
sees the same required checks green at the head.

## What is NOT allowed

- `main`-push reuse of any PR pass (D5).
- Phase-2 levers until the measured delta lands — `D-R6CI.1-1` (D6): PGlite template clone,
  `unit` sharding / job-graph change, shared image builder.
- Per-image scoping on code heads (a scoped PR once skipped a broken image build — Episteme).
- `[skip ci]` — leaves the boundary pending.
- Widening `fast-path-paths.txt` or the anchor contract without a new ADR.
