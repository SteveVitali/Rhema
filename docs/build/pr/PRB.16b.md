# PRB.16b — Prod golden-path continuation: dossier-to-correspondence publish, terminal-failure finalize, spend reconcile

**Spec:** `docs/tickets/28g2_PRB.16b__prod-golden-path-continuation.md` (continuation of 28g /
PRB.16) · **Base:** `stevevitali/prb-16-prod-golden-path-verification` ·
**Stacked PR — do not merge (mergePolicy=OPERATOR).**

## What this PR is

The **Stage A** (PR-able) half of the PRB.16 continuation: the code fixes for the two live defects
the PRB.16 prod run surfaced (**LIVE FINDING 12** — the Revise author seat can't read the delivered
Review dossier; **LIVE FINDING 13** — cap-402 runs orphan/reaper-loop instead of finalizing) plus
the **`runs.spent_credits` carry-over** fix (terminal settles left it at 0 while `usage_records`
held the truth). The **Stage B** prod legs (deploy affected images → forced-cap assert → Revise
completion → Quick Voice → gate-EDIT → stragglers) are documented in
`docs/build/runs/PRB.16b.md` as they execute.

## Code changes

- **LIVE FINDING 12 — dossier published into `correspondence/<kind>/<ordinal>/`**
  (`packages/mirror/src/delivery.ts`). Review writes the dossier under `agents/editor/` — outside
  the Revise author seat's `correspondence/**` allowlist — and delivery only shipped
  `access-report.md`, so bootstrap honestly reported `status:"blocked"` (run `01M2S78CV6…`,
  cancelled). `runDeliveryTransaction` now selects the run's committed `produced_version_ids`
  joined to `agent:*` artifacts, filters to the dossier kind set
  (`CORRESPONDENCE_DOSSIER_KINDS` — letter/brief/claim-ledger/discourse/argument/craft/
  second-read/response/drafting-note/figure/companion/sidecar; working-memory kinds like
  research_note and voice_charter stay private), and writes each basename-de-duped file as a
  shared immutable `correspondence/<kind>/<ordinal>/<basename>` artifact version — **same
  content-addressed bytes** (`s3_key` reused, `parse_status` carried, no re-upload), appended to
  `correspondence_items.artifact_ids` and returned as `DeliveryResult.dossierVersionIds`. The
  `findings.json`/`rubric.json` twins are serialized into correspondence fresh (they live in
  `.rhema/`, never harvested); the claim-ledger JSON twin is deliberately NOT shipped — Path-B
  citation stripping makes the pod JSON non-authoritative (the delivered `claims`/`claim_sources`
  rows are the truth).
- **LIVE FINDING 13 — terminal phase failures finalize the run in the step-fail tx**
  (`packages/orchestrator/src/internal-api.ts` `failStep`). A pod dead on `402 cap reached` left
  the run `running` → heartbeat stale → `orphaned` → stranded-sweep re-enqueue → instant 402,
  looped (65/62 cr overspend on `01M2S7HAV0…`). `terminalPhaseFailure(errorClass, reason)`
  classifies the unrecoverable set — `budget` class or a cap-402 reason signature → `cap_reached`;
  `blocked` → `phase_blocked`; `replan` → `phase_replan` (declared back-edge, but the back-edge
  machinery has no live caller — every verdict reaches `failStep`, so a replan would hit the same
  loop; finalizing is the honest terminal). On `running`, the same transaction then transitions
  `running → failed` (`runs.failure = {code, message ≤500 chars, retryable:false}`), reconciles
  spend, releases the hold, revokes the credential; post-commit clears the heartbeat + queues the
  `run_terminal` notification. A terminal report on a non-`running` run records the step fact
  only — the cancel path owns that settle. `failStep` returns `{ok:true, terminal?}` —
  backward-compatible.
- **`runs.spent_credits` reconcile at every terminal settle** — new
  `packages/orchestrator/src/spend.ts` `reconcileRunSpend(tx, runId)`: sums `usage_records` by
  source — **`proxy` is the meter of record** (§12.7), `sdk_estimate` next (never summed with
  `sdk_stream` — same tokens), `sdk_stream`/`provider_report` last — then writes
  `greatest(spent_credits, usage)` (monotone, idempotent). Wired into: `failStep` terminal branch,
  `finalizeRun` (`cost.final` emits the max), `deliverRun`, `failRun` (covers hook
  `abort_failed_boundary`), `cancelRun`, gate `stop` resolution, gate-expiry `settleTerminal`
  (cancel + `completed_partial`), worker `settleTerminal` (cancel + completeCancellation), worker
  parked-sweep cancel, reaper `settle`, stranded-sweep leg A, provision launch-failure.

## Honestly open (Stage B, unchanged from the ticket)

- Prod deploy of the affected images (`api`, `worker`) then: forced-cap run asserting
  terminal-without-second-provision · Revise completion (bootstrap past 0.3/0.7, `approve_triage`
  resolved, `completed`/`delivered`, dossier rows under `correspondence/review/<ord>/`) ·
  Quick Voice ≥~150 cr · gate-EDIT round-trip · telemetry stragglers · spend fold-in assert.
- Operator-gated: Google OAuth click-through, magic-link email (Resend key still a placeholder —
  GATE DECISIONS 2026-09-17), in-browser EventSource run card, CodeMirror editor.
- None fabricated green; dated rows stay in `DEFERRALS.md`.

## Verify

`turbo build lint typecheck` green (111/111; 23/23 on the 4 touched packages post-sidecar) ·
`pnpm vitest run packages/mirror/src/delivery.test.ts packages/orchestrator/src` **332 pass / 45
files** (8 new: 1 F12 + 5 F13 + 2 spend) · `check-build-memory.sh .` clean · prod evidence in
`docs/build/runs/PRB.16b.md` as Stage B executes.
