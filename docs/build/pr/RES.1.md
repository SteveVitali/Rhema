# RES.1 — Review research restore: proxy root-cause, research floor, model×tool preflight

Fixes the 2026-09-30 Quick/Base Review regression (`01M3SK62YZST272B35CG12K6TW`, PR-Q1 / BL-56):
the run completed and charged while `web_search` never reached the model — 16/16 claims delivered
Unverifiable, the planted error caught only as recollection. **Stage B executed 2026-10-01:**
deployed to prod (`prod:7833ece`, chain-tip provenance); three live probes ran ($7.49 metered of
the ≤$10 cap) proving the fail-closed preflight live at $0 and restoring tool reach on BOTH tier
models — but the *Contradicted* verdict assertion is unmet (new defect BL-66: a re-run on a project
carrying a prior claim ledger ships the stale verdicts), and the N6 + Standard legs were cut by the
remaining cap (`D-RES.1-1` PARTIAL, `D-RES.1-2`/`-3` OPEN — evidence in `docs/build/runs/RES.1.md`).

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
(**still deferred** — `D-RES.1-2`: images deployed + H7 mailbox live; cut by the ≤$10 cap after the
probes consumed $7.49).

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

## Stage B (executed 2026-10-01 — $7.49 of the ≤$10 cap)

Deployed all nine images to prod under ADR-013 (zero-replace previews; updates through 99+;
provenance `prod:7833ece8c44706f6054a0167f9f3b1960e361149` on `/healthz` + the `deployments` row).
Three probes via `scripts/live/res1-probe.mjs` on the funded `test+jrn-a@rhema.tools` tenant:

- **Probe 1** `01M3VRDV9YKEAQKKQE7W2693KF` (on `prod:3ee862f`) — `failed/research_preflight_failed`
  in ~1 s: all four pairs HTTP 400 (missing `anthropic-version`; fixed `ccb3412`). **Live-proved
  the fail path:** zero debit rows, 945-cr hold fully released, `failure.alerted=true` — $0.00.
- **Probe 2** `01M3VT9R1MAVVKM3Q7RXCRY5RD` (on `prod:0552433`) — completed; preflight passed;
  8 searches/16 fetches but all-Unverifiable: claims=0 fallback bound + preflight burn + uncapped
  grant starved siblings (fixed `7833ece`) — $3.31.
- **Probe 3** `01M3VYSGV9XZ9RCWNP0CGDXQHD` (on `prod:7833ece`) — completed; **the fix works at the
  tool layer:** `claude-sonnet-5` 7 searches/16 fetches + `claude-haiku-4-5` 12 searches/7 fetches,
  `fetch_log` 304 rows hitting the right sources — but the delivered claims are 9/9 Unverifiable
  with notes **byte-identical to probe 2's ledger** — $4.17.

**New defect found (BL-66):** the pod mounts the project's prior `agents/editor/01-claim-ledger.json`
readwrite at the declared output path; run 3's delivered verdicts are run 2's bytes (no fresh ledger
artifact was written). A re-run on a project with a prior claim ledger can ship stale verdicts —
recorded for RES.2's *Unverified delivery* lane; the N6 journey leg is unaffected (fresh project).

**Cut by the cap (never overspend):** N6 Quick/Base essay Review (~$4.5 expected vs $2.51 remaining)
and the Standard/Base excerpt leg (~$5) — `D-RES.1-2`/`-3` stay OPEN with dated notes; N6 stays
`expected:red` in `packages/journeys/src/registry.ts`.
