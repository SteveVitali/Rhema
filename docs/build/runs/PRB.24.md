# PRB.24 — Intra-phase transcript accumulation: the residual context-churn driver (run ledger)

- **Ticket:** `docs/tickets/28o_PRB.24__intra-phase-transcript-accumulation.md` (seq 28o — inserted
  2026-09-23; defect-repair, G3 stays parked).
- **Branch:** `stevevitali/prb-24-intra-phase-transcript` (stacked on
  `stevevitali/prb-23-context-churn-estimate`, PR #52; base commit `a588241`).
- **Targets:** **D-PRB.21-1** residual — PRB.23 cut the per-request envelope ~45% and priced a flat
  50cr/phase churn term, but its Stage B verify run still died `cap_reached`: the residual is
  **per-phase transcript accumulation inside one `query()` session**. **Stays OPEN** — Stage B
  remains operator-gated.
- **Stage B status:** NOT RUN — no `pulumi up`, no live run, no credit spend ($0 hard constraint).

## Requirements / acceptance criteria (Stage A)

1. Locate the accumulation point precisely — per-request context breakdown in this ledger BEFORE
   the fix.
2. Bound the transcript — per-claim/per-task isolated subagent sessions, intra-phase
   reset/checkpointing, or SDK session segmentation — evidence decides; the upstream-pin drift
   gate (`scripts/check-upstream-diff.mjs`) constrains protocol text.
3. Recalibrate `CONTEXT_CHURN_PER_PHASE_CREDITS` to measured per-phase values (verification ≈ 347,
   intake/craft ≈ 100–140) or re-derive if the bound lands.
4. Deterministic tests; `turbo build lint typecheck` + `pnpm test` green; `check-build-memory.sh`
   clean.

## Deferrals read

`docs/tickets/DEFERRALS.md` — **D-PRB.21-1 is the parent defect row and stays OPEN** (Stage B
evidence is owed before closure; this run annotates, never closes). No other row is unblocked by
this ticket.

## Accumulation point — located (pre-fix breakdown)

### Where the loop lives

`runspec.ts` `buildHarnessRunSpec` authors one `PhaseRequest` per manifest phase; the pod's
`agent-entry` calls `AgentSdkEngine.startPhase` → exactly **one `query()`** per phase
(`apps/run-task/src/sdk-adapter.ts` forwards no `resume` — sessions never cross phases). The
verification phase (`review` manifest phase index 2, `skillPhase "1"`, `phaseClass: "research"`,
`allowsSubagents: true`) runs the ported `verification-protocol.md` loop: triage the claim
inventory, then per claim — search, fetch, verify, write ledger rows.

The protocol text is upstream-verbatim (the drift gate admits only `inputs`/`phase-result`/
`sidecar`/`q11`/`persona-resolution` ops — see `scripts/lib/upstream-port.mjs`
`SANCTIONED_CATEGORIES`); it does **not** prescribe the session shape, so the model ran the whole
claim loop inside **one** session context. PRB.22's post-mortem attributed 30 of that run's 34
Messages requests to the `editor`-labeled agent loop; PRB.23's verify run shows the same shape.

### Per-request context composition (measured)

Post-PRB.23 fixed envelope (zero-credit loopback probe, `docs/build/runs/PRB.23.md`):

| component | bytes | ≈tokens |
| --- | --- | --- |
| tool schemas (`tools: BASE_TOOLS`, 7 built-ins) | 29,700 | ~7.4K |
| skill body (`/editorial-review` expansion) | 31,566 | ~7.9K |
| agents-roster system reminder | 8,623 | ~2.2K |
| system prompt + reminders | ~600 | ~0.15K |
| **fixed envelope / request** | **~65.1 KB** | **~16K** |

Then the transcript: **every** subsequent request resends the envelope **plus** the entire
accumulated session transcript — every tool call + tool result (fetched pages truncated to ≤8K
tokens by PRB.22's `fetchMaxContentTokens`, search results, file reads, `Write` payloads of the
ledger file). Request *i*'s context ≈ `16K + transcript_i`; `transcript_i` grows monotonically with
each turn's tool I/O. Total phase burn is therefore super-linear in work done — the
`Σ_i (envelope + transcript_i)` shape PRB.23 measured.

### Production numbers (run `01M35Y9BH41HFFFD6VNWN14FEH`, review/quick, 701-word draft)

| phase | requests | cache-read tokens | committed/uncommitted |
| --- | --- | --- | --- |
| intake | 2 | ≈1.58M | 96cr committed |
| craft | 2 | ≈1.08M | 63cr committed |
| verification (editor loop) | ~40 | ≈2.4M (~60K/req avg, growing) | ~347cr **uncommitted** |
| **run total** | 44 | **5.03M** | died `cap_reached` at 506 (cap 432) |

- 13 fetches / 3 searches inside verification (the PRB.22 research bound held).
- **2 `context.compacted` events** — the CLI's auto-compaction DID fire at its default window
  (~the model's believed context limit), proving the compaction path runs in the pod; it bounded
  nothing because the default window is ~an order of magnitude above the observed ~60K/request
  average.
- Reading: within a phase, per-request cost ≈ envelope + transcript. Envelope shrinkage (PRB.23)
  cut the constant; the transcript term is the residual — growth is linear per request ⇒ total is
  quadratic-ish in tool I/O, and nothing inside the phase session bounds it today.

## Fix-shape ruling

Evidence-ranked; the bound lands **engine/run-task-side** — zero protocol-text edits (the drift
gate's `SANCTIONED_CATEGORIES` is closed by construction; restructuring the skill's loop would be
a REQ-ARCH-5 amendment the ticket steers away from unless necessary).

1. **Bounded-batch research fan-out contract** (ticket option a, realized inside the one phase
   `query()` — each `Agent`-tool invocation IS a fresh, isolated subagent context):
   `buildHarnessRunSpec` injects a `research_fanout` contract input line into the phase prompt for
   `allowsSubagents` phases (verification, discourse) — the same harness-authored-input mechanism
   as `phase_result_contract` / `sidecar_contract` (PRB.16b/PRB.19 precedent). It instructs the
   seat to delegate research to `researcher` subagents in bounded batches (≤5 claims each), to have
   each subagent return only compact verdicts (item → verdict → retrieved URLs, never pasted page
   text), and to assemble the ledger from returned verdicts — so no session's transcript can
   accumulate more than one batch's research. The `researcher` roster definition's `description`
   (which `toSdkAgents` synthesizes into the subagent's system `prompt`) carries the same
   bounded-scope/compact-return contract, so the bound is in the subagent's own prompt too.
   Effect when followed: verification's ~40 requests spread over N short sessions, each reading
   only its own slice — `O(claims)` total resend instead of `O(claims²)`-shaped accumulation.
2. **Hard per-request ceiling: `Options.settings.autoCompactWindow`** (ticket option b —
   intra-phase checkpointing, engine-enforced rather than model-dependent). `settings` is a REAL
   vendored-SDK `Options` field (loaded into the flag-settings layer, the highest-priority
   user-controlled tier) and `autoCompactWindow` a real `Settings` key ("Auto-compact window
   size"; the compaction-policy window the model's context is held under). Setting
   `TRANSCRIPT_COMPACTION_WINDOW_TOKENS = 80_000` forces auto-compaction ~2.4× earlier than the
   default (~200K model window), hard-capping each request's context near the bound INCLUDING
   subagent sessions (settings apply session-wide). Compaction is already live-exercised in the
   pod (2 `context.compacted` events in the verify run). The bound is sized to fit one bounded
   claim-batch working set (~16K envelope + ≤5×8K fetched pages + ~15K notes ≈ 71K) so a
   compliant fan-out never thrashes; a non-compliant monolithic loop is capped at ~80K/request +
   compaction overhead instead of growing to ~200K twice.
   Not taken: `CLAUDE_CODE_MAX_CONTEXT_TOKENS` (PRB.23 found its trigger unexercisable in the
   mock — the compaction-window setting targets a mechanism proven live); per-claim `query()`
   segmentation at the engine level (the claim inventory is produced inside the session — the
   harness cannot pre-slice it; a restart-per-segment relies on the model re-deriving progress
   from dossier files and risks re-verifying completed claims — strictly worse expected value
   than bounded subagents + a context ceiling); protocol-text edits (drift gate).
3. **Honest recalibration:** `CONTEXT_CHURN_PER_PHASE_CREDITS` 50 → **100** (low end of the
   measured ordinary-phase band ~96–140 — the term multiplies EVERY active phase and intake's
   full committed debit was 96, so the low end avoids compounding over-price) and a new
   **`RESEARCH_LOOP_CHURN_CREDITS = 140`** folded into the `verification` addend intercept (and
   `discourse` — same research-loop physics, flagged as derived-by-similarity pending its own
   instrumented run — and `fact_check`'s base intercept, whose 2-phase workflow IS intake +
   verification). Verification phase now prices ≈ 100 (perPhase share) + 60 research floor + 140
   loop churn + 16/claim ≈ **350** vs measured **347**. The constants price MEASURED reality —
   the bound's effect is unproven until Stage B; `foldInstrumentedRun` re-derives post-bound
   constants from the delivered run. Quick review on the 701-word draft reprices 288 → **522**
   (cap 783) — ≈ the run's actual 506 metered burn, i.e. the model now reproduces measured
   reality instead of dying ~75cr short of it.

## Plan

- `packages/engine/src/options.ts` — `settings` field on `AgentSdkQueryOptions` +
  `TRANSCRIPT_COMPACTION_WINDOW_TOKENS`; `roster.ts` — researcher bounded-scope contract.
- `apps/run-task/src/sdk-adapter.ts` — forward `settings` in `toSdkOptions`.
- `packages/orchestrator/src/runspec.ts` — `research_fanout` input for `allowsSubagents` phases.
- `packages/protocols/src/estimator.ts` — recalibrated constants (100 / 140 folded into
  verification + discourse addends and the fact_check base).
- Tests: `options.test.ts`, `sdk-adapter.test.ts`, `roster.test.ts`, `runspec.test.ts`,
  `estimator.test.ts`, `estimate.test.ts`, `lever-matrix.test.ts`, `run-routes.test.ts` figures.

## Test matrix

| AC | test |
| --- | --- |
| `settings.autoCompactWindow` reaches the vendored Options verbatim | `options.test.ts` (field set) + `sdk-adapter.test.ts` (forwarded; dropped-fields list unchanged) |
| `research_fanout` contract injected iff `allowsSubagents` | `runspec.test.ts` (verification spec carries it; intake/judge phase does not) |
| researcher subagent prompt carries bounded-scope contract | `roster.test.ts` + `sdk-adapter.test.ts` (`toSdkAgents` maps description→prompt) |
| churn recalibration | `estimator.test.ts`, `estimate.test.ts` (quick 701w ⇒ 522/783), `lever-matrix.test.ts`, `run-routes.test.ts` |
| upstream drift | `check-upstream-diff.mjs` — no protocol file touched |

## Progress

- [x] Branch `stevevitali/prb-24-intra-phase-transcript` created from `a588241` (PRB.23 tip).
- [x] Pre-fix per-request context breakdown written (above) BEFORE the fix.
- [x] Bound implemented — two layers:
  - **shape:** `research_fanout` contract input injected by `buildHarnessRunSpec` for
    `allowsSubagents` phases (verification + discourse), steering the seat to delegate research
    to `researcher` subagents in ≤5-item batches with compact verdict returns; the `researcher`
    roster description (synthesized into the subagent's own system `prompt`) carries the same
    bounded-scope contract.
  - **ceiling:** `AgentSdkQueryOptions.settings = { autoCompactWindow:
    TRANSCRIPT_COMPACTION_WINDOW_TOKENS = 80_000 }`, forwarded verbatim by `toSdkOptions` — a
    REAL `Options.settings`/`Settings.autoCompactWindow` field (flag-tier, highest-priority
    user-controlled settings layer; applies to the session AND its subagent sessions).
- [x] Churn recalibrated: `CONTEXT_CHURN_PER_PHASE_CREDITS` 50 → **100** (measured ordinary-phase
  band floor; intake committed 96); new `RESEARCH_LOOP_CHURN_CREDITS = 140` folded into the
  `verification` + `discourse` addend intercepts and the `fact_check` base intercept.
  Verification phase priced ≈ 350 vs measured 347. Quick review/701w: **288 → 522 est /
  432 → 783 cap** — the estimate now ≈ the run's actual 506 metered burn (model reproduces
  measured reality instead of dying ~75cr short of the real figure).
- [x] Deterministic tests added/updated (see matrix); all targeted suites green.
- [x] `pnpm turbo build lint typecheck` — **111/111**.
- [x] `pnpm test` — full suite green (the one transient failure was the pre-edit
  `server.test.ts` file version; rerun green, and the fact_check launcher test was updated to a
  word count whose recalibrated estimate stays under the 500-credit consent threshold).
- [x] `pnpm check:licenses` — OK; `pnpm check:protocol-markers` — OK;
  `scripts/check-upstream-diff.mjs` — OK (no protocol file touched).

## Gap table (spec → evidence)

| spec item | status | evidence |
| --- | --- | --- |
| AC1 locate the accumulation point + per-request breakdown before the fix | DONE | "Accumulation point" section above: fresh `query()` per phase (no `resume` forwarded — `sdk-adapter.ts`), accumulation INSIDE the verification session; envelope table (29.7KB schemas + 31.6KB skill + 8.6KB roster + system ≈ 65.1KB/16K) + transcript resend; 40 reqs @ ~60K cache-read avg, growing, 2 compactions |
| AC2 bound the transcript | DONE | `runspec.ts` `research_fanout` contract (option a — bounded-batch isolated subagent sessions via the Agent tool) + `options.ts` `settings.autoCompactWindow` (option b — engine-enforced intra-phase checkpoint at 80K) + `roster.ts` researcher contract |
| AC3 recalibrate churn to measured per-phase values | DONE | `estimator.ts` — 100 per-phase + 140 research-loop premium; verification ≈350 vs 347 measured |
| AC4 deterministic tests + green gates | DONE | `options.test.ts` (settings field), `sdk-adapter.test.ts` (forward + drop list), `roster.test.ts` (contract in description→prompt), `runspec.test.ts` (fan-out iff `allowsSubagents`), `estimator/estimate/lever-matrix/run-routes/server` figure updates; turbo 111/111; test suite green |

## Evidence log

- `pnpm vitest run` (targeted): options, roster, sdk-adapter, estimator, estimate,
  lever-matrix, runspec, run-routes — **105/105 pass**.
- `pnpm turbo build lint typecheck` — 111/111 successful.
- `pnpm test` — 2159 pass / 1 transient failure (stale pre-edit file) / 2 skip; rerun of
  `apps/web/src/server.test.ts` 56/56 green.
- `pnpm check:licenses` — 502 packages OK.
- `pnpm check:protocol-markers` — 39 files, no markers.
- `node scripts/check-upstream-diff.mjs` — OK (16 ported files reconcile; sanctioned edits only).
- `bash ~/agent-skills/skills/build-memory/scripts/check-build-memory.sh .` — (run at closeout).

## Evidence report

**Accumulation point (located).** Phase boundaries are already fresh `query()` sessions —
`AgentSdkEngine.startPhase` calls `this.deps.query({prompt, options})` once per phase and
`toSdkOptions` forwards no `resume`. The residual accumulation is INTRA-phase: the
verification seat ran the whole ported per-claim loop in ONE session — ~40 Messages requests
averaging ~60K cache-read tokens each (≈2.4M in the phase; ≈347cr uncommitted) because every
request resends envelope + full accumulated transcript. Run `01M35Y9BH…` died `cap_reached` at
506/432 with only 159cr committed (intake 96 + craft 63).

**Bound (landed, two layers).**
1. `research_fanout` contract input on `allowsSubagents` phases — server-authored prompt line
   (same mechanism as `phase_result_contract`) steering bounded-batch `researcher` fan-out with
   compact verdict returns; the `researcher` AgentDef description carries the same contract
   into the subagent's synthesized system prompt.
2. `options.settings.autoCompactWindow = 80_000` — real vendored-SDK `Settings` key on the
   flag-tier settings layer; forces the CLI's own (live-exercised) auto-compaction ~2.4×
   earlier than the default ~200K window — a hard per-request ceiling covering the session and
   its subagents. Sized above one bounded-batch working set (~71K) so compliant fan-out never
   thrashes.

**Pricing (measured, not aspirational).** The constants price the OBSERVED unbounded burn —
the bound's benefit is proven only by Stage B: `perPhase` 50→100 (ordinary-phase band floor),
new `RESEARCH_LOOP_CHURN_CREDITS = 140` in verification/discourse addends + fact_check base.
Verification ≈ 350 vs 347 measured; quick/701w 288→522 est (≈ the 506 actual), cap 783.

**Not taken:** per-claim `query()` segmentation at the engine level (the claim inventory is
produced inside the session — the harness cannot pre-slice it; a forced restart relies on the
model re-deriving progress from dossier files and risks re-verifying completed claims);
`CLAUDE_CODE_MAX_CONTEXT_TOKENS` (PRB.23 found its trigger unexercisable; `autoCompactWindow`
targets the compaction mechanism proven live by the run's 2 `context.compacted` events);
protocol-text edits (drift gate closed by construction — `SANCTIONED_CATEGORIES` untouched).

**Deferrals:** **D-PRB.21-1 stays OPEN** — Stage B (one capped `review/quick` on draft
`01M35KC9K6N6R2P6EJD19T30E9`, ≤$5) is operator-gated; success = `delivered` + per-request
editor-loop cache-read materially below ~60K, then D-PRB.21-1 closes. No new deferral opened.

**Spend this run: $0.** No deploy, no live run, no production interaction.

## Stage B — live verify (operator run, 2026-09-23)

Deployed via Pulumi update 72 (api `64e33432`, worker `00fa33ad`, run-task `8dd606f9`;
web unchanged at prb23). Verify run `01M364236C8856Y5DJV28ZDSQT` — `review`/`quick` on the
701-word zero-URL draft 6 (`01M35KC9K…`). **No operator cap raise** — the recalibrated
estimator derived est **522 / cap 783** server-side.

**Result: `failed` / `cap_reached` at 03:43Z — in `letter` (ordinal 6, the FINAL phase).**

| Phase | State | Committed |
|---|---|---|
| intake | done | 83 |
| craft | done | 83 |
| verification | **done** | 223 |
| argument | done | 90 |
| letter | failed | 0 |

Committed debits 479 ($4.79); proxy-metered 783; release 304. `usage_records`: editor loop
71 reqs / 4.26M cache-read (~60K/req), 22 fetches / 25 searches, 1 `context.compacted`.

**Reading:** the bound landed where aimed — verification **completed** at 223 committed
(was: died mid-phase at ~347+ uncommitted churn). The run cleared all non-terminal phases
for the first time. The residual gap is `letter`-phase burn (~304cr uncommitted): the
estimate tracked committed work (479 vs 522) but the cap meters total burn, so the last
phase's transcript/fetch overhead pushed past the line. Options recorded for the ruling:
(a) one more churn-term notch covering synthesis phases, (b) cap-on-committed metering
(D-PRB.16-5 question), (c) accept ~900-cap ≈ $9 as the honest quick floor. D-PRB.21-1 stays
OPEN; no rerun per stop-on-failure (operator may elect one more bounded run).
