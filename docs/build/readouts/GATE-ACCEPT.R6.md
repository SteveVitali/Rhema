<!--
  docs/build/readouts/GATE-ACCEPT.R6.md (BM-INDEX-03) — gate readout for the round-6
  milestone `203_GATE-ACCEPT.R6__accepted-deviations.md`. The operator signs (or rules
  each row of) the §R6 accepted-deviations list drafted by `202_R6CAP.3` in
  `docs/build/CAPSTONE_CLOSURE.md` §R6. This skeleton is the handoff — the gate worker
  fills the Signature block with the operator's verbatim words at the session.
-->
# GATE-ACCEPT.R6 — round-6 accepted-deviations sign-off — SIGNED

Status: SIGNED

> An operator or authorized human record supplies the decision; an agent must not sign or
> assume silence is approval. `202_R6CAP.3` drafted this skeleton — nothing below is a
> ruling.

## What is presented (the §R6 draft, verbatim class)

- **(a) Deployed + coverage posture** — prod serves the launched tree (`4938b8e`+
  lineage, provenance all-PASS at every deploy); GATE-LAUNCH SIGNED 2026-10-27 (11/13 MET
  + 2 ruled); launch executed 2026-10-28T04:0xZ with flips 2–4 live-verified.
  Coverage: 56/56 round-6 REQ ids verdicted (37 MET · 2 MET-DIFFERENTLY ·
  3 MET-ENGINEERED · 8 PARTIAL · 4 MISSING-routed · 2 N/A-retired); §7 accounting
  complete — 0 unhomed OPEN/PARTIAL; finding map 0 unmapped; REQ-WATCH-1 read executed at
  launch+14.6 d (`GD-WATCH.R6`; evidence on PR #314's branch).
- **(b) Deferrals accepted into the tail** — every OPEN/PARTIAL carrier stands
  homed (`CAPSTONE_CLOSURE.md` §R6.2): the 11 `GD-WATCH.R6` standing watches
  (owner `operator` · trigger `slo.review.weekly` · re-read `2026-11-25T04:0xZ`), the
  clock carriers, the 23 (b)-class funded rows OPEN un-waived, the BL-106 nine →
  204/205, the REQ-TAIL-2 re-homes → 204, the operator-leg residuals, and
  `D-P1.22-3` (pen test, launch+60 d ≈ 2026-12-28).
- **(c) Deviations for signature** — the **12 rows** of
  `docs/build/CAPSTONE_CLOSURE.md` §R6.3: launch without the G2 LIFT read (ADR-111);
  the §17 amendments (first-finding post-launch target + minimal golden cohort); the
  external pen test post-launch (ADR-112); the refused ~$150 funded wave carried;
  flip 1 parked ≥2026-12-01 (`GD-THRESH13.R6`); the authored Showcase fixture
  (ADR-121); the ~$210–257/mo floor vs the ~$50 target (`GD-HA.R6`); the four unmet
  clock reads (CLK-1/-2/-4/-5); the operator-leg residuals; the traffic-bound
  measurements → standing watches; the engineering/spec carries → 204–208; and the
  whole honestly-owed tail OPEN as tracking.

## Signature (the gate worker fills this block at the session)

- **Operator verbatim:** "sign it. And let's get these open PR's merged into main in order, and then I want you to sketch the remaining and deferred work"
- **Per-row ruling:** all 12 §R6.3 rows **accepted as drafted** (the verbatim instruction signs the list whole; no row ruled otherwise, none sent back)
- **GATE DECISIONS row:** `GD-ACCEPT.R6` — signed 2026-11-11; recorded in `docs/build/LEDGER.md` GATE DECISIONS
- **Date / session:** 2026-11-11 ~18:5xZ, this session

## Effect of the signature (drafted — confirmed at the session)

- `GD-DEPLOY.R6` **expires** per its own terms ("expires: GATE-ACCEPT.R6").
- `204_R6REC.1` / `205_R6REC.2` / `206_R6REC.3` / `207_R6DOC.1` / `208_R6DOC.2`
  unblock (they assume the signed list — `00_MANIFEST` § The chain).
- Scoped OPEN rows are dispositioned **as tracking items** per the GATE-ACCEPT precedent
  (R5/SPA/R7): carrying unblock conditions, not gate-blocking — the 203 ticket's own
  DEFERRALS rule (no round-6-scoped OPEN row blocks unless it lacks either a signed
  deviation or an owned post-launch obligation).
- `REQ-TAIL-1`'s matrix verdict flip (PARTIAL → MET) lands with PR #315's merge or
  `204_R6REC.1`'s reconcile — recorded in §R6.4, not silently claimed.
- All PRs remain unmerged — `mergePolicy: OPERATOR` is untouched; the stack merges
  bottom-up on the operator's act, never the agent's.
