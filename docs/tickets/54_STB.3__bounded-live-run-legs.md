# STB.3 — Bounded live-run legs (inference-capped)

- **Sequence:** 54 · **Phase:** post-P1 closeout · **Tag:** ops
- **base_branch:** `main` (post-merge). No new code expected — if a leg surfaces a defect, that
  defect is a NEW ticket; this ticket does not fix-and-rerun.
- **Depends on:** STB.1 + STB.2 (deployed, read-verified stack). Some legs also want RCN.1's
  sharpened scopes.
- **Scope (one line):** the paid live legs — one real run per surface, cheapest-first, each with
  its own hard cap and a combined ceiling.
- **Spec §§:** 6.2 (each workflow's live row), 12.2 (the live estimate-vs-actual check per leg).
- **REQ coverage:** per row; the combined deliverable is the instrumented-live evidence that turns
  the P1 Stage A work into exercised truth.
- **Run:** `implement-spec spec=docs/tickets/54_STB.3__bounded-live-run-legs.md`
- **Gate status:** operator-gated spend. Combined ceiling **≤ $120** worst case; each leg has its
  own cap below. Stop-on-failure per leg: a cap death ends that leg, is recorded, and does not
  block the next leg.
- **Live stage:** this ticket IS the paid live work.

## Goal

Exercise each P1 workflow live exactly once at its declared cap, producing the evidence each
deferral row needs and the instrumented numbers the estimator wants. Cheap legs first so the
expensive ones run against a warm, verified platform.

## Leg order + caps (cheapest first)

| Leg | Row(s) closed | Cap | What it proves |
|---|---|---|---|
| Outline promotion | D-P1.12-1 | ≤$3 | interview → outline → Approve-plan → promoted draft |
| Figure run | D-P1.13-1 | ≤$3 | one real visualize + container resvg render check |
| Chat turn + research_burst | D-P1.11-1 | ≤$5 | one real chat turn + one bounded research run; conduit + URL policy on the wire |
| Ingestion | D-P1.15-1 | ≤$5 | real Substack discover→confirm→fetch + export-zip + one priced visual-PDF |
| Quick Voice build | D-PRB.10-1 | ≤$5 | ≥1 sample → `profile_voice{tier:quick}` → snapshot + Untested surfaces |
| Draft run | D-P1.10-1 | ≤$10 | instrumented Draft incl. Approve-plan structured edits (the D-P0.15-3/D-P0.15k-2 residual half) |
| Notifications | D-P1.19-1 | ≤$10 | live notify/badge/quiet-hours/signed-action legs (reuse an open gate if one exists) |
| Full Profile build | D-P1.14-1 | ≤$15 | instrumented calibrator run + hold-out leak audit + `approve_sample` |
| Memo run | D-P1.21-2 | ≤$15 | user-source deny on the wire end-to-end |
| Launch bundle | D-P1.22-2 | ≤$15 | injection-control smoke + one playbook drill + first-finding ≤4-min telemetry |
| Review quick re-verify | D-PRB.16-4, D-PRB.21-1 residual | ≤$10 | stranded-gate re-arm/expiry path if a deadline gate exists; live cap-math datapoint |

**Combined ceiling: ≤$120.** Legs run sequentially, cheapest-first. SSE feed consumption
(D-PRB.04-2a) and per-finding obligation chips get their live evidence "for free" during any of
these runs — record it when it happens.

## Rules

- **Stop-on-failure per leg.** A `cap_reached` death → record the phase/committed/metered numbers,
  mark the leg's row as `partial — cap_reached at N`, move to the next leg. No retries without
  operator authorization.
- **No cap raises mid-leg.** Derived caps only, unless the operator explicitly approves a raise
  (the PRB.24/25 precedent).
- **Metered vs committed reported separately** per leg, every time.
- **Each leg's own deferral row closes only with live evidence** — dossier URL, run id, event rows.

## Acceptance

- **AC1** — every leg attempted in order; each has a terminal disposition (delivered ≤ cap /
  cap_reached / skipped-with-reason).
- **AC2** — total spend ≤ $120, reported per-leg + cumulative.
- **AC3** — rows closed only on real evidence; partials stay open with the failure mode named.

## Verify

- Run-by-run evidence in `docs/build/runs/STB.3.md`; `check-build-memory.sh .` clean; LEDGER
  PHASE LOG + BUILD_INDEX row.
