# R6ENG.2 — SSE finalize-path post-commit wakeup — run ledger

- **Spec:** `docs/tickets/177_R6ENG.2__sse-finalize-wakeup.md` (manifest row 177, round 6 —
  Kind: ticket) — `implement-spec`; spec §4.1 `REQ-ENG-2`; DEFERRALS row `D-SLO.1-6`
- **Base:** `stevevitali/r6ci-1-ci-cost-phase-1` at **local** HEAD `4761fa3` (the R6CI.1
  boundary commit, deliberately unpushed per D8 — never reset to `origin/`)
- **Branch:** `stevevitali/r6eng-2-sse-finalize-wakeup` (PR base `stevevitali/r6ci-1-ci-cost-phase-1`;
  mergePolicy=OPERATOR — never merge)
- **Harness:** devin-desktop/swe-2-high/subagent · **Skills:** implement-spec + build-memory +
  self-review @ `~/agent-skills` (`e981ec5`)
- **Requirement ids stamped:** `REQ-ENG-2`
- **Live stage:** offline-only (the live window re-read is R6POST.1's `REQ-POST-8`)
- **Production mutations:** none · **Gate status:** none
- **Started:** 2026-10-21T01:38Z
- **Closed:** 2026-10-21T02:47Z — engineered; PR #197 (unmerged, OPERATOR)

## Deferrals read

`docs/tickets/DEFERRALS.md` read first (protocol — AGENTS.md). The ticket's own row is
**`D-SLO.1-6` (OPEN)** — `event_delivery_latency_p95_s` 2,238 ms vs ≤2,000 ms; diagnosis
verbatim: six terminal-batch samples where a run's last events rode the 10 s
`pollIntervalMs` safety poll instead of a fanout wakeup — a publish/commit wake race at
run end, not general slowness (all other 80 leg samples ≤110 ms; p50 34 ms). Its
"unblocked by" is *the next deploy carrying the wakeup fix*, and its verify column is
the post-deploy `slo_samples{signal:'event_delivery_ms', detail:'tail'}` re-read — that
live leg is `REQ-POST-8` / R6POST.1, explicitly out of scope here. **This run ships the
code half only; `D-SLO.1-6` stays OPEN with a dated note** (fix landed + the re-read
rides R6POST.1). No other OPEN row is unblocked by this ticket.

## Requirements

1. A post-commit wakeup on the finalize path, so the terminal batch's publish happens
   after its transaction commits (or an equivalent design that removes the race).
2. A deterministic test reproducing the race: without the fix, the terminal events
   arrive on the safety poll; with it, they arrive on a wakeup.
3. The live re-read recipe for `REQ-POST-8`, committed in this run ledger.

## Acceptance criteria

- [x] Race test fails on the pre-fix code and passes after *(deterministic · engineered)* — 12/15 red pre-fix → 15/15 green
- [x] No regression in the SSE replay/tail suites *(deterministic · engineered)* — 1,156/1,156 scoped
- [ ] Universal phase-gate AC: verification green; every new behaviour has a removing
  test; requirement ids stamped in the PR; non-verifiable legs are DEFERRALS rows;
  ADRs for owned decisions; BUILD_INDEX row + LEDGER advanced; operating clauses.

## Diagnosis (from the anchors)

`SqlEventWriter.append` (`packages/orchestrator/src/event-store.ts`) publishes the seq
**inside** the caller's uncommitted transaction (`publisher.publish` at step 4). A woken
SSE tail (`streamRunEvents`, `event-stream.ts`) pumps immediately and reads only
committed rows — it sees nothing, and when that batch was the run's LAST there is no
next publish to re-wake it, so the rows ride the 10 s safety poll. Mid-run batches are
masked: the next append's wakeup re-reads and catches the previous batch (p50 34 ms).
Terminal batches have no next publish — exactly the six-outlier pattern in D-SLO.1-6.

Run-end terminal commit sites (every path that lands a run's terminal transition +
event batch): `deliverRun` (delivery.ts — the completed path incl. the `run.deliver`
job), `finalizeRun`, `failRun`, `failStep` terminal leg (internal-api.ts), `cancelRun`
(cancel.ts), `resolveGate` stop→cancelled (gate-resolution.ts), `handleGateExpiry`
cancel/accept_partial (gate-expiry.ts), `reap` cancelling→cancelled (reaper.ts),
`sweepStrandedRuns` leg A provisioning→failed (stranded-sweep.ts), `provision`
launch-failed→failed (provision.ts).

## Plan

1. `event-store.ts`: `publishCommittedEventHighWater(deps, workspaceId, runId)` — reads
   the committed `run_event_seq.seq` in a fresh tenant tx AFTER the terminal commit
   resolves, then `eventPublisher.publish(runId, seq)`; best-effort (swallows — the
   safety re-poll stays the backstop; Redis is never a source of truth).
2. `OrchestratorDeps.eventPublisher?: RunEventPublisher` — propagates to every deps
   interface (`RunApiDeps`, `SseApiDeps`, `WorkerRunDeps`, …). Bound to the same
   `RedisRunEventBus` at `apps/api/src/server.ts` and `apps/worker/src/main.ts`.
   Unbound ⇒ no-op (tests, admin-cli — unchanged behavior).
3. Call the helper at each run-end site's post-commit point (the nine sites above,
   `deliverRun` only on a committed delivery — `failRun` covers its validation arm).
4. Tests: `packages/orchestrator/src/finalize-wakeup.test.ts` (new) — the deterministic
   race pin + wakeup-vs-poll delivery attribution.
5. Docs: REQ-POST-8 re-read recipe (below), short ADR for the owned design choice,
   DEFERRALS `D-SLO.1-6` dated note (stays OPEN — live leg is R6POST.1).

### REQ-POST-8 live re-read recipe (committed for R6POST.1)

After the deploy carrying this fix:

1. Re-read the SLO sample class the diagnosis used:
   `select percentile_cont(0.95) within group (order by value_ms)
    from slo_samples where signal='event_delivery_ms' and detail='tail'`
   over a ≥50-sample post-deploy window (the same probe `slo.ts` ships — run it via the
   worker's SLO sweep or a system-role read).
2. Assert `event_delivery_latency_p95_s ≤ 2 000 ms` and, per run, the terminal-event
   sample (`max(value_ms)` on each completed run's last flush) < 2 s — the six-outlier
   shape (terminal flush ~poll latency, siblings ≤110 ms) must not recur.
3. Positive control: a terminal batch delivered by wakeup shows
   `maxDeliveryMs` ≈ publish→flush latency (tens of ms), not ~`pollIntervalMs`.
4. Green ⇒ flip `D-SLO.1-6` to DONE with the measured p95; red ⇒ the row stays OPEN
   with the measured gap + next lever named (never move the target without an
   operator-approved ADR).

## Test matrix

| # | case | arm |
|---|------|-----|
| T1 | `finalizeRun` on a `finalizing` run republishes the committed high-water AFTER commit (probe: publish with `inFlight===0`, seq = `run_event_seq.seq`) | the deterministic race pin — fails pre-fix |
| T2 | `failRun` `running→failed` — same post-commit republish | terminal variant |
| T3 | `cancelRun` `running→cancelled` — same | terminal variant |
| T4 | `failStep` terminal leg (`errorClass:"budget"` → cap_reached) — same | terminal-in-step-fail |
| T5 | `resolveGate` stop on a `waiting_gate` run → cancelled — same | gate-stop terminal |
| T6 | `handleGateExpiry` cancel arm → cancelled — same | timer terminal |
| T7 | `reap` `cancelling→cancelled` — same | reaper terminal |
| T8 | `deliverRun` happy path — same | the completed-run path (D-SLO.1-6's six) |
| T9 | SSE end-to-end: with the in-tx wakeup modelled LOST (the prod race), a tail attached pre-finalize still receives the terminal batch via the post-commit wakeup — `pollIntervalMs` disabled | "arrives on a wakeup" |
| T10 | without `eventPublisher` bound the SAME tail receives nothing until the pump/poll fires | "without the fix → the safety poll" |
| T11 | a throwing publisher never breaks `finalizeRun` | best-effort contract |
| T12 | `publishCommittedEventHighWater` unbound ⇒ no publish, no error | seam no-op |
| T13 | the republished seq equals the committed `run_event_seq.seq` | high-water truthfulness |

## Progress

- 2026-10-21T01:38Z — run opened; contract + spec §4.1 + D-SLO.1-6 + anchors read; branch
  created from local `4761fa3`. Plan + matrix recorded.
- 2026-10-21T01:41Z — **TDD red**: `finalize-wakeup.test.ts` written first, 12/15 cases
  fail on the pre-fix code (`expected +0 to be 1` — zero post-commit publishes on every
  run-end path; the two baseline arms pass: the poll-only delivery shape + best-effort).
- 2026-10-21T01:42Z — implementation landed: `publishCommittedEventHighWater` +
  `OrchestratorDeps.eventPublisher` + republish call sites on all twelve run-end
  terminal paths + api/worker `eventPublisher: bus` binding. **15/15 green.**
- 2026-10-21T01:44Z — regression: focused 11-file suite 168/168; scoped suites
  (`packages/orchestrator`, `apps/api`, `apps/worker`) **99 files / 1,156 tests / 0 fail**.
- 2026-10-21T01:45Z — audit pass 2: two further terminal paths found in
  `apps/worker/src/run-jobs.ts` (`handleRunCancel`, `completeCancellation`) — same
  republish added; a rollback/no-phantom-wakeup case added (15th test).
- 2026-10-21T01:50Z — ADR-116 written (post-commit republish vs deferred publish /
  LISTEN-NOTIFY / shorter poll); `adr-index.sh docs/adr` regenerated the README row;
  `D-SLO.1-6` dated note appended (stays OPEN — live leg is REQ-POST-8).
- 2026-10-21T01:5xZ — gates: `pnpm turbo build lint typecheck` **135/135**;
  `check:licenses` / `check:protocol-markers` / `check:no-cookies` / `check:spa-budget`
  / `check:spa-env` / `check:dom-contract` all green; eslint clean on the new file.

## Gap table (fresh contract re-read 2026-10-21)

| Contract line | Delivered | Evidence |
|---|---|---|
| "A post-commit wakeup on the finalize path… (or equivalent design that removes the race)" | **Yes** — `publishCommittedEventHighWater` republishes the committed `run_event_seq` high-water AFTER each run-end commit resolves, on all 12 terminal paths incl. `finalizeRun` + `deliverRun`; the race is removed because the wakeup can only fire once its rows are visible. | `event-store.ts` helper; call sites listed in §Call sites; ADR-116 |
| "without the fix, the terminal events arrive on the safety poll" | **Yes, deterministic** — the pre-fix run shows zero `inFlight===0` publishes (the race pin fails 12/15) and T10 proves the unbound-seam shape delivers only via `pollIntervalMs` (the verbatim D-SLO.1-6 shape). | `finalize-wakeup.test.ts` red run 2026-10-21T01:41Z |
| "with it, they arrive on a wakeup" | **Yes** — T9: in-tx wakeup modelled LOST + poll disabled ⇒ terminal batch still arrives (only the post-commit wakeup could deliver). | same file, T9 |
| "live re-read recipe for REQ-POST-8, committed in the run ledger" | **Yes** — §REQ-POST-8 live re-read recipe above (≥50-sample `detail='tail'` p95 ≤2 000 ms + per-run terminal <2 s + positive control). | this file |
| AC: race test fails pre-fix, passes post | **Yes** — 12/15 red pre-fix → 15/15 green post-fix. | Evidence log |
| AC: no regression in the SSE replay/tail suites | **Yes** — `event-stream.test.ts`, `sse-routes.test.ts`, `event-store.test.ts` green inside the 1,156-test scoped run; Last-Event-ID/exactly-once/density/internal-isolation untouched. | Evidence log |
| Out of scope respected (no SLO semantics/target change; no live measurement) | **Yes** — `slo.ts` untouched; D-SLO.1-6 target text unchanged (dated note only). | `git diff` scope |
| Invariant 10: events never carry prompt/private text | **Yes** — no payload changes; the wakeup carries `(runId, seq)` only; internal events still never stream. | unchanged `RUN_EVENTS`/event-stream paths |
| ADRs for owned decisions | **Yes** — ADR-116 (+ regenerated index row). | `docs/adr/` |
| Deferrals discipline | **Yes** — D-SLO.1-6 stays OPEN with dated note; no other OPEN row unblocked (verified: the row's verify column is a post-deploy live read). | `docs/tickets/DEFERRALS.md` |
| BUILD_INDEX + LEDGER + PHASE LOG | pending closeout commit (needs PR # + CI read) | — |
| ~200-line change budget | Code diff: +102/−6 source lines (+ ~20 comment lines); the size is driven by the 12 call-site comments — the mechanism is one 30-line helper. | `git diff --stat` |

## Evidence log

- **Red run (pre-fix), 2026-10-21T01:41Z:** `finalize-wakeup.test.ts` — 12 failed / 2 passed / 14 total.
  Every run-end path: `expected +0 to be 1` (no post-commit publish existed); the seam tests failed
  `publishCommittedEventHighWater is not a function`; T9 (wakeup delivery) `expected false to be true`.
- **Green run (post-fix):** 15/15 — incl. the added rollback case.
- **Regression:** 11-file focused suite 168/168; scoped `orchestrator+api+worker` 99 files / 1,156 / 0 fail.
- **Gates:** `pnpm turbo build lint typecheck` 135/135; all six `check:*` green; eslint clean.
- **Audit:** every `applyTransition` callsite reaching a terminal state enumerated (13 sites across
  8 files + 2 worker handlers) — all carry the republish; non-terminal transitions (queued, waiting_gate,
  cancelling, finalizing, provisioning, running, orphaned) deliberately do not (a later batch or the
  terminal republish covers them).
- **CI (code head, full):** `ci: pass #197@6179d4d` — run 39529812897, all seven legs
  (`fast-path` decide → full; `public-safe`, `contracts`, `typecheck / lint / unit`,
  `integration`, `images (build + scan, pin digests)`) + `ci-pass` anchor written →
  the docs closeout head is fast-path eligible.
- **CI (closeout head, FAST path):** `ci: pass #197@3a09735` — run 39535044829, 2m35s
  wall (`fast-path` decide → `mode: fast` on the `6179d4d` anchor; guards + committed
  `neutral-readers.txt` audit subset green; a fast run writes no anchor — the code
  head's `ci-pass` anchor covers this head's identical non-docs tree).

## Evidence report

- **Head SHAs:** code `6179d4d` (full CI pass, run 39529812897); closeout (see PHASE LOG).
- **PR:** #197, base `stevevitali/r6ci-1-ci-cost-phase-1` — **unmerged** (mergePolicy OPERATOR).
- **Deliverables:** REQ-ENG-2 satisfied — post-commit republish on every run-end terminal path
  (12 call sites) via `publishCommittedEventHighWater` + `OrchestratorDeps.eventPublisher`,
  bound to `RedisRunEventBus` in api + worker; deterministic race pin + wakeup-vs-poll
  attribution (15-test file, 12/15 red pre-fix); REQ-POST-8 live re-read recipe (above);
  ADR-116 + regenerated index; `D-SLO.1-6` dated note — stays OPEN (live leg is R6POST.1).
- **Verification:** scoped suites 99 files / 1,156 tests / 0 fail · turbo 135/135 · six
  check:* green · check-build-memory 0 violations (7 legacy warnings) · append-only OK
  vs `4761fa3` · boundary read on #197 verbatim above.
- **Spend:** $0 — offline-only; no prod/cloud contact; CI minutes only.
