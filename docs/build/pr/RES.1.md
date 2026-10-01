# RES.1 — Review research restore: proxy root-cause, research floor, model×tool preflight

Fixes the 2026-09-30 Quick/Base Review regression (`01M3SK62YZST272B35CG12K6TW`, PR-Q1 / BL-56):
the run completed and charged while `web_search` never reached the model — 16/16 claims delivered
Unverifiable, the planted error caught only as recollection. **Stage A only ($0); the ≤$10 Stage-B
live legs are operator-gated deferrals (`D-RES.1-1..3`).**

Ticket: `docs/tickets/63_RES.1__review-research-restore.md` (chain row 63, round 3).
Base: `stevevitali/maint-2-build-memory-hygiene` @ `30ff7e3` (stacks on PR #84).
Merge policy: **OPERATOR — do not merge.**

## Root cause (prod evidence in `docs/build/runs/RES.1.md`)

PRB.22's bound computed `used = max(historyCount, trackerMetered)` at admission. Four parallel
Haiku subagent requests were each admitted at `used=0` and forwarded `max_uses=12`; the provider
executed 28 searches / 26+ fetches against budgets of 12/28 — 2.3× overshoot in one wave. Once
metered totals crossed, `ensureServerWebTools` dropped the tools for **every** later request,
starving the tail of verification and all of `discourse`. Folded-in defects: bare `tool_use`
blocks logged `allow` + counted as `used` without executing; no in-flight reservation; no floor;
no preflight. Hypotheses (b) deploy-diff, (c) tier-specific, (d) missing webTools — all refuted
with evidence.

## What changed

- **`apps/egress-proxy`** — `ResearchUsageTracker` gains committed totals + in-flight reservations
  (`reserve`/`inflight`/`release`, TTL expiry); executed-only history extraction
  (`server_tool_use`/`web_*_tool_result` only — a bare `tool_use` no longer mints an `allow` row or
  counts `used`). `ensureServerWebTools` takes `{floorEligible, bypassBudget}` admission; lowercase
  bare-name client tools join the strip set (the real server tool is injected). `PHASE_CLASS_HEADER`
  read per request, never forwarded; reservations released on meter/forward/stream failure.
- **`packages/orchestrator`** — `authorResearchFloor` (pure, claims × rigor × budgets) with
  `RESEARCH_FLOOR_SHARE = 0.5` + a named guard test; `authorWebToolPolicy`/`authorAssistantWebToolPolicy`
  author `searchFloor`/`fetchFloor` (chat_turn/figure carry none); `authorResearchPreflight` authors
  the roster × enabled-tools pair manifest with canonical provider `type` variants; `buildHarnessRunSpec`
  carries `researchPreflight` only for runs with an active `phaseClass:"research"` phase;
  `terminalPhaseFailure` maps `research_preflight_failed` (one-tx terminal settle — hold released,
  zero debit, probe burn absorbed); `stranded-sweep` leg D pages exactly one ID-only ops alert
  (`failure.alerted` send-then-mark dedupe); `OrchestratorDeps.alert` seam (method-signature so the
  worker's narrower `AlertSink` stays assignable); `runspec.ts` added to the audited system-pool
  boundary.
- **`apps/run-task`** — the credential injector stamps `x-rhema-phase-class` from the manifest's
  `phaseClass` per request (agent-supplied copies dropped); `research-preflight.ts` probes every
  `model × tool` pair through the run's OWN egress proxy (forced `tool_choice`, `max_uses: 1`, 30 s
  cap; pass requires a REAL `web_*_tool_result` block — the incident's 2xx-without-execution shape
  fails `no_tool_result`); `runCommitLoop` probes once per pod before the first phase (resume = fresh
  pod = re-probe); an unbound seam fails closed.
- **Probe** — `packages/journeys/fixtures/planted-error-{essay,excerpt}.md` (the recovered 1,029-word
  incident essay, LoC "1850"→1800 plant, + 267-word excerpt); `integration/src/research-probe.ts`
  (`driveResearchProbe` + pure `evaluateProbeEvidence`), `-live.ts` env entrypoint,
  `scripts/live/res1-probe.mjs` runner, `research-probe.test.ts` recorded-response twin.
- **Docs** — ADR-021 (floor + reservations + trusted phase identity), ADR-022 (preflight protocol),
  ADR-023 (probe shape); `docs/tickets/DEFERRALS.md` gains the `D-RES.1-{1,2,3}` Stage-B rows.

## Requirement ids

REQ-SPEC-31 (primary — (1) preflight, (2) research floor) · REQ-VIS-9 · REQ-SPEC-11 (preflight burn
is metered through the proxy) · REQ-ARCH-31 (read-only prod diagnosis) · REQ-SPEC-29 step N6
(**deferred** — `D-RES.1-2`, needs the deployed images + the H7 test mailbox).

## Verification

`pnpm turbo build lint typecheck` 135/135 · `pnpm test` 3,782 pass / 4 skip / 405 files ·
`check:licenses` 609 · `check:protocol-markers` 45 · `check-upstream-diff` 22 files reconcile (no
skill-text edits) · `check-build-memory` 0 violations · incident regression suite:
`handler.test.ts` RES.1 block (bare `tool_use` no longer counts, parallel grants bounded, floor
eligibility, preflight bypass, header never forwarded, bare-name alias stripped + injected),
`outbound-limits.test.ts` reservations, `url-policy.test.ts` floor admission, `allowlist.test.ts`
floor guard + full-tier preflight matrix, `research-preflight.test.ts`, `harness-loop.test.ts`
(gating + fail-closed + resume re-probe), `internal-api.test.ts` terminal settle,
`stranded-sweep.test.ts` leg D, `runspec.test.ts` research-gated manifest, `pod-loop.test.ts`
seam over real api routes.

## Stage B (deferred — D-RES.1-{1,2,3})

No `pulumi up` from the build env; no stage runs this branch's images until deploy. Owed, ≤$10
metered total, cheapest-first: ≤3 live probes (≤$3) via `scripts/live/res1-probe.mjs`, JOURNEY.1 N6
Quick/Base Review on the full essay (≤$7), one Standard/Base excerpt Review (≤$5). Each leg's
asserts and compensating deterministic coverage are in `docs/tickets/DEFERRALS.md`.
