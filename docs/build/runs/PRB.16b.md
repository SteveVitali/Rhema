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

### Continuation fixes F14–F20 (landed pre-Stage-B; prod evidence owed)

Landed across `3081f7c`/`bd6c23e`/`d9e8402` and earlier commits this leg; details:

- **F14** — `runs.agent_instance_id` unset at run creation → hydration defaulted every run to the
  `editor` seat (wrong mount policy for persona-builder + Revise author runs). Fixed at run creation.
- **F15** — Revise triage declared `response_ledger_one_row_per_finding` but never computed it, and
  the sidecar contract wasn't surfaced to the agent → the live agent emitted `rows` not `entries`.
  Fixed: oracle computes the predicate; prompt carries `sidecar_contract` + `phase_result_contract`
  (exact `{"status":"done"}` semantics).
- **F16** — `consumeGuidance` had no caller → run-scope guidance never delivered at phase boundaries.
- **F17** — `commitStep` retry minted a fresh `step_id` after `ON CONFLICT` → `gates.step_id` FK
  violation orphaned the run. Fixed: `INSERT … ON CONFLICT … RETURNING id`; reuse the persisted id.
- **F18** — fresh Revise launch crashed on undefined `modelProfile`; fixed `{ tier: "base" }`.
- **F19** — `approve_triage` gates opened without `artifact_version_id` → structured gate card +
  overlay path unreachable. Fixed: bind the produced response-ledger version at gate open.
- **F20** — agent-authored response-ledger JSON sidecar was skipped at harvest (derived-`.rhema`
  filter) → never persisted, couldn't merge with user dispositions. Fixed: persist sidecar JSON
  twins as versions.

## Stage B — live evidence

**In progress (2026-09-18)** — deployed images: `api@9ea59171` (F21+F23), `run-task@7c8e745c`
(F22+F24), worker `RUN_TASK_IMAGE_DIGEST` pinned to the same (Pulumi update 41). `worker` + a second
`api` build (`f25-d9e8402`, F25) in flight at this writing.

### New live defects found this leg (all fixed in-tree, tests green)

- **F21 — wire-string `deadlineAt` crashes every deadline-bearing gate open** (`internal-api.ts`
  `commitStep`). `CommitNext.gate.deadlineAt` is a `Date` pod-side but crosses the JSON commit body as
  an ISO STRING; `openGate`'s `deadlineAt.toISOString()` threw `TypeError`, rolling the commit tx
  back. Every deadline kind (`approve_sample`, `approve_cutlist`, `approve_plan`, `confirm_cost`,
  `resume_partial`, `refusal`) was uncommittable pod→server; wait kinds (`approve_triage`,
  `deadlineMs: null`) never carried the field — which is why Revise gates worked and Quick Voice did
  not (live: `01M2T65W…` census committed 2 versions then 500'd opening `approve_sample`). Fix:
  coerce `string → Date` at the commitStep funnel; malformed degrades to `null` (wait semantics).
- **F22 — the harvest never read the persona root** (`work-reader.ts` `readWorkRoots` +
  `harness-main.ts`). `readWorkDir(cwd)` walked only `/work/project`; a persona-builder agent writing
  `profile/**` to its CANONICAL mount (`/work/personas/<id>/`) produced zero harvestable output →
  `artifact_present` failed → zero-output phase (live: QV att-1 exited `success` twice with nothing).
  Persona-root files now fill keys the project walk misses; project wins collisions (fresh agent
  output over the stale mounted input).
- **F23 — the skill's `persona`/`personas_dir` args were never passed** (`runspec.ts` inputs). The
  prompt carried `personaId=` but the ported skill declares `persona`/`personas_dir`, and
  `conventions/personas.md` (which pins `/work/personas/<id>`) is not shipped in `/app/skills` — the
  att-1 agent never resolved the corpus dir. The spec now pins `persona=<id>` +
  `personas_dir=/work/personas` (the same `resolveSeatRoots` derivation as the hook/materializer).
- **F24 — the oracle can't see a sidecar at its versioned-twin path** (`work-reader.ts` `resolveKey`
  versioned-basename fallback). Revise `01M2T6D3…` att-1+2's triage agent wrote
  `agents/author/ledgers/v1-response-ledger.json` directly (skipping `.rhema/`); the `v1-` prefix
  defeated exact/suffix/template/basename matching → `sidecar_validates` +
  `response_ledger_one_row_per_finding` failed on BOTH sub-runs despite a valid ledger. A literal
  basename still wins; `v\d+-<basename>` is the last resort.
- **F25 — `gate:<id>` is an illegal pg-boss queue name; deadline-gate expiry never armed**
  (`orchestrator/queue.ts` + `worker/main.ts`). `assertObjectName` rejects `:`, so the post-commit
  `scheduleGateExpiry` send threw AFTER the commit tx had already opened the gate → the pod marked
  the committed step `failed` (contradictory state) and no expiry/reminder jobs existed. The design
  also never registered a `gate:*` consumer. Fix: single legal queue `gate.expiry` (gate id rides the
  payload + singleton key) + a real worker consumer.

### Live log (2026-09-18, UTC)

- `12:03` QV `01M2T65W…` att-1: census agent exits `success` twice, zero output — `/work/project`
  held only `manifest.md` (F22/F23: persona mount + corpus never reached). Census failed
  `artifact_missing` → requeue.
- `12:20` att-2: agent wrote `profile/*` under `/work/project` (wrong root — accidentally the right
  harvest path) + `status:"complete"`; commit 500'd — **F21** first observed
  (`deadlineAt.toISOString` TypeError in `openGate`). att-3 same.
- `12:37` run parked `waiting_gate` at `resume_partial` (re-enqueue budget exhausted, 3 census
  fails). Revise `01M2T6D3…` att-1: bootstrap+research committed (101+148 cr); triage failed —
  **F24** (agent wrote `v1-response-ledger.json` twin, oracle couldn't resolve).
- `12:52` F21–F24 deployed (api `9ea59171`, run-task `7c8e745c`). `resume_partial` resolved
  `approve` → att-4 (new image): census committed 2 versions + 65 cr, `approve_sample` OPENED
  (id `01M2T9J2…`, F21 verified live) — then the post-commit `scheduleGateExpiry` send 500'd on the
  illegal `gate:<id>` queue name (**F25** first observed); pod's post-500 `failStep` overwrote the
  committed step row to `failed`.
- `13:0x` operator repair (documented): restored `steps.state='done'` for the tx-committed census
  (produced_version_ids + 65 cr debit had already landed); resolved `approve_sample` `approve` →
  queued att-5 → close_reading.
- Revise att-2 (old image `e9dca4e7`) re-failed triage on F24 → att-3 on `7c8e745c`.
- `13:10` F25 deployed (Pulumi update 43): api `e4e9fd78`, worker `8bd2e9c2`; `pgboss.queue` shows
  `gate.expiry`; worker consuming (`auth.mail` traffic observed).
- `13:20` QV-1 `01M2T65W…` att-5: `close_reading` committed (110 cr; in-pod retry recovered a
  `phaseResult=null` first pass). Committed phase-result flags carried for human review: persona-root
  `profile/` write denied `EACCES` (agent fell back to `/work/project`), corpus 5380-vs-2-files
  discrepancy unresolved, sample appears template-assembled, `conventions/personas.md` unreachable.
- `13:21` QV-1 hit run cap mid-`voice` — **live cap terminalization assert**: proxy `402 run … has
  reached its cap of 788 credits` → `error_during_execution` → terminal `failed`/`cap_reached`
  (`retryable:false`, `ended_at` set). Attempt-5 credential `revoked_at` = settle instant; residual
  hold `release 613` posted; `spent_credits` reconciled to proxy truth `794` (vs committed debits
  175 — failed-attempt proxy burn folded into spent, released against committed debits only; see
  Spend ledger). No att-6 provisioned.
- `13:25` Revise `01M2T6D3…` att-3 triage committed (115 cr) — **F24 live**: `v1-response-ledger.json`
  twin resolved by the oracle. `approve_triage` opened `01M2TB3J…` with
  `artifact_version_id=01M2TB3J73GZGAXCPPM897AC8Q` — **F19 live**. The agent-authored
  `v1-response-ledger.json` persisted as version `01M2TB3HYVTSET5AJP31MTA0G0` — **F20 live**.
- `13:3x` Gate-EDIT leg: recorded 2 user dispositions (`accept`+`applied` on finding ord 8; `defer`
  on ord 5) via `POST /projects/:id/findings/:fid/disposition`; `POST …/gates/:gid/decide
  {"action":"edit"}` → `resolved:true`, `overlayVersionIds=[01M2TBETMPY… md, 01M2TBETT6… json]`.
  Merged sidecar fetched from `rhema-prod-artifacts`: 19 `entries`, user dispositions (incl. the two
  new + 4 earlier PRB.16-leg rows on the same correspondence) overriding agent proposals → run
  `queued` att-4 (revise phase reads the merged versions — hydration under observation).
- `13:36` QV-2 `01M2TB91FESCXYATTB7JQ8RBGW` (fresh, cap 788): census committed 66 cr →
  `approve_sample` `01M2TBQQ…` opened cleanly — **F25 live**: `pgboss.job` holds a `created`
  `gate.expiry` job `{gateId: 01M2TBQQ…, workspaceId}` (post-commit send no longer 500s). Resolved
  `approve` → att-2 queued (close_reading).

Operator-gated (unchanged): Google OAuth click-through, magic-link email (Resend placeholder),
in-browser EventSource run card, CodeMirror editor.

## Spend ledger

| Leg | Run | usage_records Σ credits | Notes |
|-----|-----|--------------------------|-------|
| (handoff) | — | — | ≈$19.8 remaining of $50 |
| Stage A | — | 0 | code-only this session |
| Stage B — QV-1 (failed, cap) | `01M2T65W5PZ3174FPVFNQRVKZS` | proxy 794 / sdk_stream 412 / committed debits 175 | `spent_credits` reconciled 794; hold release 613 (vs committed 175) |
| Stage B — QV-2 (in flight) | `01M2TB91FESCXYATTB7JQ8RBGW` | proxy 137 / committed 66 @13:36 | census + approve_sample only so far |
| Stage B — Revise (in flight) | `01M2T6D3B32AVXHCQH73ZGJGBD` | proxy 1351 / sdk_stream 364 / committed 364 @13:31 | bootstrap 101 + research 148 + triage 115 |
| Stage B — earlier session runs | `01M2T29P94…` `01M2T2BGRT…` `01M2T3P30S…` `01M2SH38…` | see PRB.16 ledger | folded at final reconcile |

Reconcile note (2026-09-18): the QV-1 settle released the hold against **committed debits**
(788 − 65 − 110 = 613) while `spent_credits` was reconciled to **proxy truth** (794). The 619 cr
delta is proxy-metered burn on attempts that never committed a step — the workspace is not
charged it via `credit_ledger` debits (only `usage_records` records it). Whether that's the
intended accounting (cap enforcement vs invoiced spend) is a product decision; flagged, not
silently resolved.
