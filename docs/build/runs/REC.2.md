# REC.2 — spec reconciliation (run ledger)

- **Spec:** `docs/tickets/90_REC.2__spec-reconciliation.md` (manifest row 90, round-3 tail)
- **Base:** `stevevitali/rec-1-backlog-and-readiness` @ `86b6510` (PR #111 open; tree verified clean at fork)
- **Branch:** `stevevitali/rec-2-spec-reconciliation` (mergePolicy=OPERATOR — never merge)
- **Harness:** devin-cli subagent (Cognition agentic coding CLI)
- **Skills:** reconcile-build @ `~/agent-skills` (mode=spec)
- **Started:** 2026-10-04
- **Closed:** 2026-10-04
- **Config:** docs-only reconcile; **Live stage: none**; metered spend **$0**; zero prod writes, zero deploys

## What this run did

Reconciled every landed ticket's deliverables against the canonical spec
(`docs/rhema-design-spec.md` — no `spec_src/` or `BUILD.sh` exists, so the spec file is edited
directly), tagged each in-spec / spec-implied / ticket-added, gave each a disposition, recorded
proposed amendments with exact target + anchor + before/after + tick state, and applied **only
the ticked amendments** — the three whose tick is a pre-existing operator GATE DECISIONS row.

### `docs/build/TICKET_VS_SPEC.md` — per-ticket tagging (new, 193 lines)

One row per shipped deliverable across every landed chain row in `BUILD_INDEX.md` (P0.01 #1 →
REC.1 #111, 117 index rows): deliverable, requirement ids or spec cites, tag, disposition.

Roll-up (deliverable rows): **in-spec ~130 · spec-implied ~45 · ticket-added ~11.** Dominant
ticket-added mechanisms, all dispositioned: citation-completeness rate + bounded backfill
(→ proposed REQ-VIS-12), the `CogsLevers` flag contract (→ proposed REQ-SPEC-34), the
fail-closed paid-verification spend guard (→ proposed REQ-SPEC-33), the turbo remote cache
(implementation detail), the MET-DIFFERENTLY ADR records (note in an appendix — already carried
on `CAPSTONE_CLOSURE.md`'s signature table; 88a_GATE-ACCEPT owns that tick), and the
build-process artifacts themselves (MAINT.1/MAINT.2/CAP.1/CAP.2/REC.1 — implementation details).

### `docs/build/SPEC_RECONCILIATION_PLAN.md` — the amendment ledger (new, 219 lines)

Every candidate amendment as its own row: target file, anchor, before text, after text, tick
state. **Three ticked (`[x]`), all applied. Eight unticked (`[ ]`), all proposed-only — nothing
applied.**

**Applied (tick = the operator GATE DECISIONS row the plan cites):**

- **R-1 — the 2026-09-15 G2 deferral recorded in §17** (tick: LEDGER GATE DECISIONS 2026-09-15
  `16c_GATE-G2` — "DEFERRED (operator decision) — proceed to Phase-B implementation now").
  Applied: a `⚑ Amendment — 2026-09-15` banner at the §17 benchmark row recording the suspension
  of "lift gate read before any UI spend beyond Phase 0" with the three standing bars unchanged
  (G2 stays a HARD pre-launch gate; no §16.4 claim ships until LIFT — REQ-EVAL-19; REQ-EVAL-16
  consequences apply retroactively — UI spend is at risk); the spec status line; the manifest
  amendment-log line; **ADR-104**.
- **R-2 — the 2026-09-23 early G3 read recorded in §17 + Appendix A.13** (tick: LEDGER GATE
  DECISIONS 2026-09-23 `28b_GATE-G3` — "PROCEED (operator decision — deliberate override of
  REQ-BETA-18's window)"). Applied: a §17 addendum banner recording the early read, the evidence
  used in lieu of partner data (live end-to-end prod, in-cap delivery, ~$7–10/review measured
  cost), and the recorded caveat (zero partner behavioral data — thresholds never evaluated; the
  cost finding would itself have been a pivot signal); the REQ-BETA-18 row marker; an Appendix
  A.13 addendum paragraph; the status line; the manifest line; **ADR-105**.
- **R-3 — manifest amendment-log retro line for the 2026-09-17 domain + database amendments**
  (tick: the spec already carries both banners; ADR-010 exists). Applied: manifest only — a
  `retro:` line under § Spec amendments applied backfilling the log entry the 2026-09-17 spec
  banners never got (`rhema.tools` apex/`api`/`usercontent` split + `__Host-` cookies; Cloud SQL
  `db-g1-small` for prod, AlloyDB stays dev/previews).

**Proposed, unticked — spec untouched for every one:** A-1 REQ-VIS-12 (citation-completeness as
a measured persisted rate + bounded backfill) · A-2 REQ-SPEC-34 (named COGS levers as
server-owned frozen run config) · A-3 REQ-SPEC-33 (paid-verification spend guard binds a system
role, fails closed) · A-4 note: the REQ-SPEC-8 restore condition's first measured read
(2026-10-04, $20.25 > $6 — NOT MET) · A-5 note: measured prod bill ≈$285.80/mo vs the ~$50/mo
target · A-6 note: edit-path semantics (ADR-048/049) · A-7 note: run-task confinement
(ADR-074…076) · A-8 a spec ADR appendix (Appendix G) or explicit pointer (the spec has no ADR
appendix — see below).

Requirement-id discipline: all three proposals mint **new** ids (REQ-VIS-12, REQ-SPEC-34,
REQ-SPEC-33 — REQ-SPEC-23/26/28 stay reserved per ADR-098); nothing renumbered.

### ADR-set comparison (plan §4)

Repo: `ADR-001…ADR-105` (ADR-104/105 added by this ticket) + the generated `docs/adr/README.md`
index regenerated via `adr-index.sh`. The spec has **no ADR appendix** — the §-level `⚑
Amendment` banners name their ADRs inline. Delta is dispositioned, not silently closed: the
spec↔ADR-sets difference is the dispositioned row + proposed amendment **A-8** (unticked).

## Verification

- `node docs/build/tools/check-append-only.mjs --base 86b6510` → **append-only OK** (PHASE LOG /
  GATE DECISIONS prefix-only, DEFERRALS cells untouched, contracts unmodified).
- `bash ~/agent-skills/skills/build-memory/scripts/check-build-memory.sh .` → **0 violations**,
  the same 8 pre-existing baseline warnings (manifest round banners, nextTicket-not-yet-landed,
  legacy live-verification values, oversized phase-log entries, old readouts, missing Harness
  headers on pre-BM-HARNESS-01 run ledgers).
- `bash ~/agent-skills/skills/build-memory/scripts/adr-index.sh docs/adr` → index regenerated;
  ADR-104/105 rows render correctly.
- No code changed → no `pnpm test`/turbo run owed (docs-only, per the ticket's no-live-stage,
  $0 config). No new DEFERRALS rows — every non-automatically-verifiable item is already carried
  on existing rows (BL-30 flag flip, D-CAP.2-2 deploy legs, etc.).

## Spend / live claims

**$0.** Zero prod writes, zero deploys, zero live legs, zero browser sessions. No live
verification is claimed anywhere in this ticket's artifacts — the run is a committed-docs
reconcile.

## Deviations

None beyond the two retro-fitted ADRs (104/105), which record decisions taken 2026-09-15 and
2026-09-23 that the ADR set never captured — the fold-back this ticket exists to do.
