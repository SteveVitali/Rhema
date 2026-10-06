# SLO.1 — Prod SLO remediation: honest probes, then the §13.5 targets met on prod

- **Sequence:** 75 (round 3) · **Phase:** round 3 — launch readiness · **Kind:** ticket · **Tag:** ops
- **base_branch:** current checkout (the chain tip the previous round-3 row left; stacked PR)
- **Depends on:** OBS.1, JOURNEY.1, RES.2
- **Scope (one line):** fix the §13.5 probe definitions that mis-measure (run start, gate resume, event delivery, autosave, mirror errors, success rate, proxy-vs-SDK), then remediate the real latency and success gaps until the §13.5 targets hold on prod, and make REQ-ARCH-34's weekly review operational. Any re-basing of a target is an operator-paused ADR; infra deltas > $15/month pause.
- **Spec §§:** 13.5 (SLO table, alerts, playbooks, REQ-ARCH-34), 12.4 (provision step 4: warm pool, launch attempts, p95 ≤ 45 s), 12.5 (SSE delivery, REQ-ARCH-13), 12.7 (proxy vs SDK cross-check), 5.10 (autosave)
- **REQ coverage:** REQ-ARCH-13 (primary), REQ-ARCH-34 (primary); touched REQ-ARCH-32 (egress-denied signal), REQ-ARCH-35 (cross-check semantics) (stamp in the PR)
- **Absorbs (backlog):** BL-07 (PR-R2; X-f8-prod-slos-red, X-slo-probe-gaps, OF-stb3-live-findings F8)
- **Run:** `implement-spec spec=docs/tickets/75_SLO.1__prod-slo-remediation.md`
- **Gate status:** pauses for the operator under the REVISED standing authorization: **any ADR that relaxes a spec target** (SLO re-basing, e.g. the `proxy_vs_sdk` ± 2% row); **infra cost deltas > $15/month** (a warm pod pool, min GKE nodes, a larger worker floor); **one-off prod data writes** (only if a probe fix needs a historical backfill). Additive migrations and a clean-preview `pulumi up` are pre-authorized.
- **Live stage:** Stage A: code + tests ($0). Stage B: deploy, then bounded runs to sample the corrected signals (chat turns for run start; one Review under *Wait for me at each* for gate resume), plus a 7-day prod read — ≤ $10 metered.


> **Amended 2026-09-30 (operator — round-3 spend limit: hard ≤ $200, target ≤ $100):** this ticket's Stage B metered spend cap is **≤ $10** (was ≤ $20); aim for ≈ $5. Run legs cheapest-first and stop once the acceptance evidence suffices; where a leg plan below sums past the new cap, drop the lowest-priority legs and record each dropped leg as a `D-SLO.1-<n>` row (never overspend). The orchestrator pauses the chain when round-3 cumulative metered spend reaches $100 and hard-stops at $200 (LEDGER GATE DECISIONS 2026-09-30, D6 revised).

## Goal
Every §13.5 SLO read red on prod, and it still does after DEF.1–3. The live worker logged at 2026-09-30
17:07Z:

`[slo] violation` — `run_start_latency_p95_s` 473 (target 45; alert > 90), `gate_resume_latency_p95_s` 270
(60; > 120), `event_delivery_latency_p95_s` 6.0 (2; > 5), `proxy_vs_sdk_cost_runs_over5pct_1h` 1

STB.3 F8 had run start p95 3,080 s, success 66.7%, gate resume 443 s and event delivery 105.9 s. RCN.1
measured the *first-start* p95 at ≈ 57 s (n = 15), which already says the probe mixes transitions.

Some of the red is mis-measurement. The code shows at least:
- **Run start.** `runs.started_at` is **overwritten** on every `provisioning → running` (heartbeat,
  `packages/orchestrator/src/internal-api.ts` ~218–229). The probe (`packages/orchestrator/src/slo.ts` ~36–41)
  computes `started_at − created_at`, so every resumed run counts its whole gate wait as "start latency".
- **Gate resume.** The probe (~53–58) measures `resolved_at − opened_at`, which is the **human's** decision time,
  not the §13.5 resume latency (decision → the run running again).
- **Event delivery.** `slo_samples.event_delivery_ms` (`apps/api/src/sse-routes.ts` ~116–128) is the max
  append→flush per flush batch. Flushes that *replay* old events on (re)connect, and quiet-period gaps, land in
  the sample (BL-07 note).
- **Autosave.** `autosave_save_ms` is sampled only on the legacy `POST …/editor/:draftId/save`
  (`apps/api/src/editor-routes.ts` ~368–400). The Page saves through collab's `onStoreDocument`, which samples
  nothing, so the signal measures a path users no longer take once EDIT.1 lands.
- **Mirror errors.** `mirror_errors_10m` = 1 is unexplained. The probe (~67–75) counts every `engine.error` and
  `boundary.violation` internal event.
- **Success rate.** The probe (~43–50) drops **all** cancels, while §13.5 excludes only *user* cancels. Test
  tenants (JOURNEY.1) and *Unverified* deliveries (RES.2) must also never count as successes.

Fix the measurements first, **without** moving a target. Then remediate what is really slow until the targets
hold.

## Load (read these — do not re-read others)
- Spec §13.5 (SLO table verbatim; playbooks; REQ-ARCH-34), §12.4 step 4 (warm pool, "3 launch attempts",
  p95 ≤ 45 s), §12.5 (batches ≤ 250 or 2 s; replay semantics), §12.7, §16.3 #6 / §12.9 G19 row (the
  warm-pool → microVM escalation)
- `packages/orchestrator/src/slo.ts` (all signals), `packages/orchestrator/src/internal-api.ts` ~210–230 (heartbeat)
  and ~930–990 (gate open, park, expiry scheduling), `packages/orchestrator/src/gate-resolution.ts` (resume enqueue),
  `packages/orchestrator/src/transition.ts`
- `apps/worker/src/main.ts` ~170–240 (GKE launcher cold build, eager-warm, timeouts) and the `slo.probe` sweep
- `apps/api/src/sse-routes.ts` ~95–140, `packages/orchestrator/src/event-stream.ts` (`streamRunEvents`, `onFlush`,
  poll interval), `apps/collab/src/extension.ts` (`onStoreDocument`)
- `infra/pulumi/compute.ts` ~380–425 (worker min/max instances, `cpuIdle`, startup boost), `infra/pulumi/monitoring.ts`
- Evidence: `docs/build/runs/STB.3.md` §4 F8 + §5; `docs/build/runs/DEF.3.md` §5–§6 (the `egress_denied_10m` sub-leg);
  `docs/build/runs/RCN.1.md` (first-start p95); DEFERRALS rows D-P0.15-5, D-PRB.16-5, D-P1.22-1, D-DEF.3-1
- OBS.1's structured logging and request/trace ids (consumed)

## In scope — deliverables
1. **Probe definitions made honest** (REQ-ARCH-13, BL-07 X-slo-probe-gaps). Each §13.5 row measures what its
   text says, with an additive migration where a timestamp is missing (e.g. a per-transition record, or a
   first-start column).
   - Run start = each `queued → running` transition's own latency, first starts and resumes each measured from
     their own `queued`.
   - Gate resume = gate resolution → the run `running` again.
   - Event delivery = live-tail latency only (replay flushes excluded).
   - Autosave sampled on the collab store path.
   - Mirror errors = delivery/mirror failures (the unexplained 1 identified and classified).
   - Success = completed ÷ (completed + failed + system-cancelled), excluding user cancels, test tenants and
     *Unverified* deliveries.
   - The missing `egress_denied_10m` evidence leg from D-DEF.3-1 is recorded.
   - Each definition change gets a test that fails on the old query.
2. **Proxy-vs-SDK diagnosis** (§12.7, REQ-ARCH-35). Find why the flagged run diverged by > 5% (e.g. server-tool
   or attempt accounting present on one side only; D-PRB.16-5's by-design divergence; ECON.1's metered debit).
   Make the probe compare like with like (same attempts). The ± 2% target itself changes only through an
   operator-paused ADR.
3. **Run-start remediation** (§12.4 step 4). With the probe honest, measure the phases of a start:
   - the queue pickup
   - the worker's GKE launcher (the cold `@kubernetes/client-node` path, `main.ts` ~176–190)
   - node scale-up and image pull
   - pod → first heartbeat

   Remove the dominant cost with levers that stay ≤ $15/month (e.g. the job-pickup cadence, the launcher
   warm-path, image-pull caching, pod spec). A warm pod pool or pinned nodes above $15/month is written up with
   its measured benefit and cost and **paused** for the operator. G19 is the named escalation if the pool misses.
4. **Gate-resume remediation.** Resume is a relaunch, so it shares item 3's path. Add whatever is resume-specific
   (the decision → enqueue hop, the stranded re-arm) until p95 ≤ 60 s.
5. **Event-delivery remediation** (REQ-ARCH-13). If live-tail p95 is still > 2 s after the probe fix, find
   whether the Redis fan-out fails to wake the tail (falling back to the poll interval) or run-task batching
   dominates, and fix the route. Nothing buffers on the route (REQ-ARCH-13).
6. **Success rate** (the weekly ≥ 97% target). Classify the failures in the trailing window (defect-killed, cap
   deaths, system cancels). Fix what belongs to the platform and hand the rest to its owner (e.g. cap deaths →
   ECON.1 caps).
7. **REQ-ARCH-34 made operational.**
   - A weekly SLO review artifact: a worker weekly summary line and dashboard section over 7-day windows,
     including ONB.1's `import_preview_p95_s`.
   - The rule that an open breach on a surface is recorded in LEDGER OPEN FINDINGS and blocks feature tickets
     touching that surface until it is green.

   The mechanism is the owned decision.
8. **Stage B.** Deploy. Sample the corrected signals with bounded runs:
   - ~10 chat turns for start latency
   - one ≤ 300-word Review under *Wait for me at each*, approved promptly at each gate, for resume latency
   - SSE tails for delivery

   Then read 7 days of the prod probe, organic traffic included. The runs are measured by run id; the test
   tenants' exclusion from the probe stays as it is.

## Out of scope
- The structured logging and trace ids themselves: **OBS.1** (consumed).
- The test-tenant flag and its exclusion plumbing: **JOURNEY.1**. *Unverified* delivery and its SLO exclusion:
  **RES.2**. This ticket keeps both intact.
- The `import_preview_p95_s` signal and its remediation: **ONB.1**.
- Cap calibration and cap deaths: **ECON.1**.
- The distroless run-task image: **SEC.3** (a later start-latency lever; note the expected gain).
- Paging a human: **HUMAN-H7** (BL-24).
- The G19 microVM spike: not in round 3; it is the recorded escalation.

## Acceptance criteria
- [ ] Each corrected probe (run start, gate resume, event delivery, autosave, mirror errors, success rate,
      proxy-vs-SDK) has a PGlite test that fails on the pre-fix query. Each keeps its §13.5 target and alert
      threshold unchanged, and the probe code carries its definition. *(deterministic)*
- [ ] Migrations pass the additive-migration lint (no DROP, rename, narrowing, rewrite or role change). No
      historical backfill runs without the operator pause. *(deterministic)*
- [ ] The run ledger attributes run-start latency per stage (queue pickup, launcher, node and image, pod → first
      heartbeat) from the bounded runs, with the levers applied and their measured effect. *(agentic)*
- [ ] Prod, over the corrected probes after deploy:
      - `run_start_latency_p95_s` ≤ 45
      - `gate_resume_latency_p95_s` ≤ 60
      - `event_delivery_latency_p95_s` ≤ 2
      - `mirror_errors_10m` = 0 on healthy traffic
      - run success ≥ 97% over the trailing week (≥ 95% daily)
      - `proxy_vs_sdk` 0 runs > 5%

      Or, for any row still red: a `D-SLO.1-<n>` row naming the measured gap, the lever, its monthly cost, and
      the operator pause it waits on. Never a changed target without an operator-approved ADR. *(agentic)*
- [ ] The mirror-errors "1" and the proxy-vs-SDK divergent run are each explained in the run ledger with their
      event or usage rows. *(agentic)*
- [ ] The REQ-ARCH-34 weekly review exists (summary line + dashboard + the LEDGER rule) and produced its first
      readout from prod. *(agentic)*
- [ ] The nightly JOURNEY.1 run is green on the deployed SHA, and deployed provenance equals this ticket's
      chain-tip SHA (REQ-SPEC-29). Metered spend ≤ $10. *(agentic)*
- [ ] verification green; every new behaviour has a test that fails if it is removed; requirement ids stamped in the PR; anything not automatically verifiable is a `DEFERRALS.md` row with its compensating control; ADRs written for every deviation and owned decision; `BUILD_INDEX.md` row and `LEDGER.md` advanced. *(agentic — the universal phase-gate AC)*

## Requirement IDs to satisfy and stamp in the PR
REQ-ARCH-13 (primary), REQ-ARCH-34 (primary); touched REQ-ARCH-32, REQ-ARCH-35; REQ-SPEC-29 (provenance).

## Cross-cutting invariants
- 00_MANIFEST invariant **7**: the proxy is the meter of record. A probe change never redefines which side is
  truth.
- Invariant **10**: SLO samples and log lines carry ids and numbers only.
- **12 / REQ-SPEC-29**: provenance at close; the journey is regression evidence for the run path.
- **13 / REQ-SPEC-30**: `probeSlos` runs on the documented **system pool** (an allowlisted intentional
  cross-tenant aggregate); no probe runs on a user request.
- **14 / REQ-SPEC-32** and REQ-SPEC-31: *Unverified* and test-tenant runs never inflate success, and a probe fix
  never hides a real failure class.
- Standing authorization (ADR-013): target relaxations and > $15/month deltas pause.

## Notes
- **Owned decisions (write an ADR):**
  - (1) the corrected probe definitions, one ADR covering all rows, stating that no target moved
  - (2) the REQ-ARCH-34 weekly-review mechanism
  - (3) the run-start lever set and, if needed, the warm-pool proposal with its cost for the operator
- A **target** relaxation is a separate operator-paused ADR (e.g. `proxy_vs_sdk` ± 2% after D-PRB.16-5), never
  folded into (1).
- **Consumed:**
  - OBS.1: structured logs and trace ids (shared-decision owner)
  - JOURNEY.1: the test-tenant flag
  - RES.2: *Unverified* excluded from success
  - ONB.1: `import_preview_p95_s`
  - SEC.1: the system-pool rule for `probeSlos`
- **Anchors to re-confirm at build time:**
  - `slo.ts` ~36–160
  - `internal-api.ts` ~218–229 and ~930–990
  - `sse-routes.ts` ~116–128
  - `editor-routes.ts` ~368–400
  - `apps/worker/src/main.ts` ~176–190
  - `compute.ts` ~405–421
- **DEFERRALS:**
  - Annotate the LEDGER OPEN FINDINGS F8 entry and the BACKLOG X-rows' evidence.
  - D-P0.15-5 is DONE; cite its 57 s first-start as the baseline.
  - Any row not green by close becomes `D-SLO.1-<n>` with its compensating control (the alert policy still
    fires).
