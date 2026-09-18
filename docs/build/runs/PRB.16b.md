# PRB.16b — prod golden-path continuation (run ledger)

- **Ticket**: `docs/tickets/28g2_PRB.16b__prod-golden-path-continuation.md` (continuation of 28g / PRB.16).
- **Branch**: `stevevitali/prb-16b-golden-path-continuation`, stacked on `stevevitali/prb-16-prod-golden-path-verification` (PR #44 base `c35d40f`).
- **Constraints**: never merge · never print secrets · never fabricate green · modest caps (~$19.8 of $50 remained at handoff) · headless legs before browser legs.

## Scope

Stage A (code, PR-able):
1. **F12** — delivery writes only `access-report.md` into `correspondence/<kind>/<ordinal>/`; the
   letter/findings/rubric/claim-ledger/notes stay under `agents/editor/`, outside the Revise author
   seat's allowlist → bootstrap self-reports `blocked`. Fix: publish the produced dossier into the
   shared `correspondence/<kind>/<ordinal>/` tree at delivery.
2. **F13** — a run whose pod dies on `402 cap reached` (or whose phase-result is terminally
   `blocked`) stays `running` → heartbeat stale → `orphaned` → stranded-sweep re-enqueues → same
   instant failure, looped 3+. Fix: terminal phase failures finalize `failed` + release hold +
   revoke credential inside the step-fail transaction.
3. **`runs.spent_credits` carry-over** — canceled/failed runs leave `spent_credits` at 0 while
   `usage_records` holds the truth. Fix: reconcile the field at every terminal settle.

Stage B (prod legs, headless first): forced-cap terminalization assert · Revise completion ·
Quick Voice ≥~150 cr · Gate-EDIT round-trip · stragglers · spend reconcile. Browser legs are
operator-assisted (verbatim steps in the final report); Resend stays a placeholder → deferred.

## Stage A — implementation notes (LANDED, all green; prod assert still owed)

### F12 — dossier published into `correspondence/<kind>/<ordinal>/` (`packages/mirror/src/delivery.ts`)

- New step 5b inside `runDeliveryTransaction` (before the draft freeze): selects the run's committed
  `steps.produced_version_ids` joined to `artifacts` where `namespace like 'agent:%'`, filters to the
  dossier kind set (`CORRESPONDENCE_DOSSIER_KINDS` — editors_letter, piece_brief, claim_ledger,
  discourse_report, argument_notes, craft_notes, second_read, response_letter, response_ledger,
  drafting_note, figure, companion_doc, sidecar), de-dupes by basename (shallowest mirror path wins),
  and writes each as a `correspondence/<kind>/<ordinal>/<basename>` **shared, immutable** artifact
  version — the same content-addressed bytes re-pointed (`s3_key` reused; no re-upload), `parse_status`
  carried. `correspondence_items.artifact_ids` gains the new version ids; `DeliveryResult` returns
  `dossierVersionIds`.
- Working-memory kinds (research_note, source_note, voice_charter, briefs/plans, drafts) stay private —
  the kind filter is the boundary: the editor's private research never ships (asserted in test).
- The `findings.json`/`rubric.json` twins are serialized into correspondence too — they live in
  `.rhema/` which is never harvested (`isDerived`), so no artifact exists to copy; they are written
  fresh via `persistHarvest` from the verbatim-persisted sidecars. The claim-ledger JSON twin is
  deliberately NOT shipped: Path-B citation stripping makes the pod's JSON non-authoritative — the
  delivered `claims`/`claim_sources` rows are the cited⇒fetched truth.
- Convention note: path shape is `correspondence/<kind>/<ordinal>/` — the ticket's wording and the
  existing `access-report.md` convention (not upstream's `vN-review/`). A cross-draft collision at the
  same ordinal shares one artifact row with successive versions — identical to the access-report's
  pre-existing semantics; the item's `artifact_ids` keep per-delivery correctness.
- Test: `delivery.test.ts` "publishes the agent-namespace dossier into shared
  correspondence/<kind>/<ordinal>/ (F12)" — dossier .md copies + findings.json land shared+immutable
  with the same sha/s3_key; the private `research_note` is NOT copied; `artifact_ids` updated.

### F13 — terminal phase failures finalize the run in the step-fail tx (`internal-api.ts` `failStep`)

- `terminalPhaseFailure(errorClass, reason)` classifies the unrecoverable set:
  - `cap_reached` — `errorClass === "budget"` (the engine's 402 subtype) OR the reason matches the
    cap-402 signature (`reached its cap` / `cap reached` / `cap of N credits` / bare `402` — the proxy
    is the only 402 source in the run path; the SDK error lands folded into reason as `infra`).
  - `phase_blocked` — `errorClass === "blocked"` (the phase-result self-report, e.g. the dossier-
    visibility block that produced the honest `status:"blocked"` on `01M2S78CV6…`).
  - `phase_replan` — `errorClass === "replan"`. **Design decision:** `replan` is a declared back-edge,
    but the back-edge machinery (`recordReplan`, `reopenApprovePlan`) has NO live caller — the harness
    sends every non-complete verdict to `failStep`, so a replan verdict would hit the identical
    orphan/reaper loop F13 kills. Finalizing `failed` is honest (the run genuinely cannot proceed);
    when back-edge wiring lands it must intercept the verdict BEFORE `failStep`, making this branch
    unreachable for replan anyway.
- On a terminal class with the run in `running`, the SAME transaction now: `running → failed`
  (`reason` = the terminal code; `runs.failure` = `{code, message ≤500 chars, retryable:false}`),
  `reconcileRunSpend`, hold release (`release:<runId>` idempotency), credential revocation. Post-commit:
  heartbeat cleared + `run_terminal` notification queued (the `failed`-only outcome).
- Guard: only `fenceRow.state === "running"` transitions — a `cancelling` run's late step-fail records
  the step fact and lets the cancel path own the settle (`cancelling → failed` has no edge).
- `failStep` now returns `{ok:true, terminal?: string}` — backward-compatible (the route passes it
  through; the harness client ignores the field).
- Tests: 5 new cases in `internal-api.test.ts` — cap-402 reason (`infra` + folded 402 message),
  `budget` class, `blocked` class, non-terminal `infra` stays `running`, terminal report on a
  no-longer-`running` run records-only (the stale-attempt 409 path is pre-existing coverage).

### `runs.spent_credits` reconcile — `packages/orchestrator/src/spend.ts`

- `reconcileRunSpend(tx, runId)`: sums `usage_records` by source — **`proxy` is the meter of record**
  (§12.7); `sdk_estimate` stands in next (the crosscheck's SDK side — never summed with `sdk_stream`,
  they measure the same tokens); `sdk_stream`/`provider_report` last. Writes
  `spent_credits = greatest(spent_credits, usage)` — monotone, idempotent — and returns the figure.
- Wired at **every** terminal settle:
  - `failStep` terminal branch (F13)
  - `finalizeRun` — `cost.final` emits `max(args.spentCredits, reconciled)`
  - `deliverRun` (orchestrator `delivery.ts`) — same for the dossier path's `cost.final`
  - `failRun` (covers `handleHookControl abort_failed_boundary`)
  - `cancelRun` (orchestrator cancel)
  - gate `stop` resolution (`gate-resolution.ts`)
  - gate-expiry `settleTerminal` (covers `cancel` and `accept_partial` → `completed_partial`)
  - worker `settleTerminal` (`run.cancel` direct + `completeCancellation`)
  - worker parked-sweep cancel (`ledger-jobs.ts`)
  - reaper `settle` (`cancelling → cancelled`)
  - stranded-sweep leg A (`provisioning → failed`)
  - provision launch-failure (`provisioning → failed` after 3×)
- Tests: `cancel.test.ts` — proxy rows fold at the cancelled edge (41+24 → 65); proxy wins over an
  `sdk_stream` twin (999 ignored → 65).

### Green gate

- `pnpm turbo build lint typecheck` — 111/111 (pre-sidecar-twin change); post-change
  `turbo lint typecheck` on the 4 touched packages — 23/23.
- `pnpm vitest run packages/mirror/src/delivery.test.ts packages/orchestrator/src`
  — 332 tests green (8 new: 1 F12 dossier-publication + 5 F13 terminalization + 2 spend-reconcile).
- Note: `turbo` cache was cleared mid-run — the machine disk hit 100% (41 MiB free); retry succeeded.

## Stage B — live evidence

**Not yet executed** — the affected images (`api`, `worker`; `run-task` unchanged) must be deployed to
prod first, then: forced-cap run asserting terminal-without-second-provision, Revise completion
(bootstrap past 0.3/0.7 → `approve_triage` → `completed`/`delivered` + dossier rows under
`correspondence/review/<ord>/`), Quick Voice ≥~150 cr, Gate-EDIT, stragglers, spend fold-in.

Operator-gated (unchanged): Google OAuth click-through, magic-link email (Resend placeholder),
in-browser EventSource run card, CodeMirror editor.

## Spend ledger

| Leg | Run | usage_records Σ credits | Notes |
|-----|-----|--------------------------|-------|
| (handoff) | — | — | ≈$19.8 remaining of $50 |
| Stage A | — | 0 | code-only this session |
