# R6SWP.1 — post-merge nightly sweep (run ledger)

- **Spec:** `docs/tickets/197_R6SWP.1__post-merge-nightly.md` (manifest row 197, REQ-GO-2 /
  REQ-POST-4; gate pre-ticked by `GD-DEPLOY.R6` per the ticket header).
- **Normative loads:** `docs/tickets/DEFERRALS.md` (D-OBS.1-3, D-SPA.28-1 — the GO-2 nightly
  legs); LEDGER GATE DECISIONS `GD-MERGE-SWEEP.R6` (sweep discharged, `main` @ `0039850`
  contains chain tip `7413b17`), `GD-THRESH6.R6` (threshold 6 dispositioned as
  nightly-on-deployed-SHA; the literal `main`==prod arm lands post-launch-deploy — this run
  attempts it anyway as pre-staged evidence), `GD-DEPLOY.R6` (deploy conditions);
  `.github/workflows/journeys.yml`; `scripts/deploy-neutral-paths.txt` (the R6ENG.1/ADR-114
  allowlist); `docs/build/readouts/GATE-LAUNCH.md` threshold 6; BACKLOG BL-74/BL-81.
- **Base:** `origin/main` @ `9c90b00` (the HUMAN-H12 merge-sweep tip — all PRs #195–#224
  landed; prod serves `dc3a8f6`, so `main` ⊋ deployed until the launch deploy R6LCH.1).
- **Branch:** `stevevitali/r6swp-1-post-merge-nightly`
- **Harness:** devin-desktop/swe-2-high/subagent · **Skills:** implement-spec + build-memory
  + self-review @ `~/agent-skills` (`e981ec5`)
- **Requirement ids stamped:** REQ-GO-2 REQ-POST-4
- **Started:** 2026-10-27T14:38Z · **Closed:** (at close)
- **Live stage:** prod (read-only — the suite drives real prod surfaces; no prod mutation).
- **Production mutations (this ticket's named scope):** `pulumi up --stack prod` of `main`
  HEAD was **conditionally** named (deliverable 1: only if the `main`-vs-deployed diff is
  deploy-neutral under the R6ENG.1 allowlist) and **did not fire** — the diff carries
  non-neutral code (see below), so the deploy arm's own precondition is false. The
  `workflow_dispatch` of `journeys.yml` on `main` is the only prod-touching act.
- **Dispatch:** `gh workflow run journeys.yml --ref main` → run **40523029148**
  (stage=`prod` default, `paid=false` default → $0 legs only, `steps=""` → full registry;
  `github.sha` = `9c90b00f…` = `JOURNEY_EXPECT_SHA`).
- **Deploy-neutral verdict (deliverable 1's precondition):** `dc3a8f6` IS an ancestor of
  `9c90b00` (`git merge-base --is-ancestor` ✓), but `git diff dc3a8f6..9c90b00` carries
  non-allowlisted paths — `apps/run-task/src/work-reader.ts`,
  `packages/orchestrator/src/spend.ts`, `packages/protocols/{manifests,src,skills}`,
  `packages/contracts/src/sidecars.ts`, `infra/pulumi/Pulumi.prod.yaml`, `.gitleaks.toml` —
  so the drift arm cannot pass and no redeploy is authorized. Honest posture: `main` ⊋
  deployed until R6LCH.1.
- **ci:** (at close)

## Deferrals read

`docs/tickets/DEFERRALS.md` read first (protocol). Rows in this ticket's blast radius:

- **D-OBS.1-3** — nightly JOURNEY.1 green on the deployed SHA; its own recorded verifier is
  "a scheduled nightly report with `provenance == deployments.sha == github.sha == main
  HEAD`" — merge-dependent, still impossible while prod trails `main`. This run's dispatch
  is the substitute evidence; dated tail owed.
- **D-SPA.28-1** — REQ-SEQ-10 entry gate (all flips merged AND ≥1 nightly green since the
  last flip). The merge half is now satisfied (sweep discharged); the nightly-green half
  still wants the literal arm. Dated tail owed.
- BL-74 / BL-81 dispositions — BACKLOG rows naming these debts; dated dispositions owed.

## Requirements

1. Diff `main` HEAD vs deployed SHA under the R6ENG.1 allowlist; redeploy only if
   deploy-neutral (precondition false → no deploy; recorded).
2. `workflow_dispatch` of `.github/workflows/journeys.yml` on `main` — the substitute arm
   (never satisfies the "scheduled" claim; recorded which); poll to completion; per-leg
   pass/red-owed census vs the registry.
3. Restore the R6CI.1-paused `schedule:` block (the workflow's own marker names R6SWP.1 as
   the restorer — required for the literal arm to ever land post-launch-deploy).
4. DEFERRALS dated tails on D-OBS.1-3 + D-SPA.28-1 (dispatch-substitute evidence + what
   remains for the literal arm); BL-74/BL-81 dispositions.
5. GATE-LAUNCH threshold-6 dated note (run URL + verdict).
6. Records: this ledger + `pr/R6SWP.1.md` + PR + BUILD_INDEX row 231 + LEDGER
   (`nextTicket → 197a_GATE-LAUNCH` if the sweep lands).
7. Verify: `check-build-memory.sh .` 0 violations; `check-append-only.mjs --base 9c90b00`
   OK; `ci-boundary.sh --json docs/build/logs/ci-R6SWP.1.json`.

## Acceptance criteria

- [ ] Prod `/healthz` = `main` HEAD *(live-executed)* — **cannot hold yet** (main ⊋
      deployed until R6LCH.1; recorded honestly; carried by the threshold-6 literal arm)
- [ ] A scheduled nightly is green on `main` HEAD with a provenance match
      *(live-executed)* — same carry; this run supplies the dispatch-substitute arm
- [ ] Universal phase-gate AC *(agentic)*

## Plan

1. Branch off `origin/main`; dispatch `journeys.yml` on `main`; poll.
2. Restore the schedule block in `journeys.yml` (code change this ticket owns).
3. On completion: read per-leg results; census pass/owed/fail vs `registry.ts`;
   root-cause any new-layer failure (fix on-branch if owed) or record the honest blocker.
4. Records per the requirements list.

## Test matrix

Docs/workflow-only change — the dispatched run is the test (live evidence). Gates at
close: `check-build-memory.sh .` (+ `--staged`), `check-append-only.mjs --base 9c90b00`,
the journeys workflow YAML parse (the restored block is verbatim the pre-pause shape).

## Progress

- 2026-10-27T14:38Z — branch cut at `9c90b00` (origin/main, the merge-sweep tip).
  `gh workflow run journeys.yml --ref main` → **run 40523029148** dispatched
  (workflow_dispatch; `github.sha`=main HEAD; inputs default: stage=prod, paid=false,
  full registry — $0 legs only).
- 2026-10-27T14:39Z — deploy-neutral verdict computed: `dc3a8f6` ancestor-of `9c90b00` ✓
  but the diff is non-neutral (code + infra paths) → deliverable-1 deploy arm does not
  fire; `main` ⊋ deployed recorded.
- 2026-10-27T14:4xZ — `journeys.yml` `schedule:` block restored verbatim (the R6CI.1
  marker's named action for this ticket); both crons (`5 6 * * *` nightly $0,
  `35 4 * * 1` weekly paid) live again on merge.
- (polling run 40523029148 …)

## Gap table

(at close — every requirement + AC with layer + evidence)

## Evidence log

- Run `40523029148` (https://github.com/SteveVitali/Rhema/actions/runs/40523029148) —
  details at completion below.

## Evidence report

(at close)
