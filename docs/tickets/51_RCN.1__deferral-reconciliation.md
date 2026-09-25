# RCN.1 — Deferral reconciliation (post-CAPSTONE)

- **Sequence:** 51 · **Phase:** post-P1 closeout · **Tag:** ops
- **base_branch:** `stevevitali/p1-22-launch-checks` (chain tip — lands on the existing PR #76
  branch; no new PR).
- **Depends on:** CAPSTONE (row —) complete.
- **Scope (one line):** audit every OPEN row in `docs/tickets/DEFERRALS.md` against evidence that
  already exists (delivered prod runs, landed live legs, deploys, code that shipped later), flip
  provable rows to DONE with citations, and sharpen the scope of rows that remain genuinely open.
- **Spec §§:** — (this is a build-hygiene ticket, not spec work).
- **REQ coverage:** none directly; it tightens the evidence map for every row it touches.
- **Run:** `implement-spec spec=docs/tickets/51_RCN.1__deferral-reconciliation.md`
- **Gate status:** $0 — read-only audit. No deploy, no inference, no live calls.
- **Live stage:** none. This ticket IS the audit; the rows it cannot close feed STB.1–STB.4.

## Goal

The CAPSTONE readout counts ~74 OPEN deferral rows, but many were written before later work landed
— e.g. the delivered `review/quick` run `01M36663QG1ZJ7VEZ036Y54NSG` (prod, `completed`,
2026-09-25), the PRB.18 live auth/billing legs (Google sign-in VERIFIED, Resend magic-link
delivered, live Stripe checkout → grant asserted), and the P0.15h/i live engine legs that the
delivered run effectively superseded. This ticket makes the ledger honest: every OPEN row gets a
disposition — **DONE (with evidence)**, **still-open (sharpened scope)**, or **superseded-by**
(named row) — so the remaining Stage B tickets (52–55) execute only work that is actually undone.

## Load-bearing context

- The full deferral table: `docs/tickets/DEFERRALS.md` (rows grouped by ticket section).
- Live evidence already on record:
  - `docs/build/runs/PRB.24.md` / `PRB.25.md` — delivered review run + cost measurements.
  - `docs/build/LEDGER.md` `returnPass` note — PRB.18 operator legs landed 2026-09-22
    (Google sign-in, Resend magic-link, live Stripe checkout → `grant(topup)` 2500 cr).
  - `docs/build/readouts/CAPSTONE.md` — the 470-row REQ table + the grouped deferral list.
  - `docs/phase1-exit-readout.md` — the §17 criterion-by-criterion readout.
- Prod evidence endpoints: run `01M36663QG1ZJ7VEZ036Y54NSG` dossier at
  `https://rhema.tools/p/my-first-project/review/01M36663QG1ZJ7VEZ036Y54NSG`; the deployed prod
  stack is still PRB.25-era (P1 chain is unmerged).

## In scope

1. Read every OPEN row in `DEFERRALS.md` top to bottom (74 rows at dispatch).
2. For each row, check whether existing evidence already satisfies it:
   - production DB state where the row is checkable via the IAP tunnel (port 15433)
   - committed code/tests that landed after the row was written
   - the delivered-run artifacts and prior run ledgers
3. Close only rows the evidence genuinely proves; record the citation in the row's Status cell
   (`DONE (2026-…, RCN.1): <evidence>`). Append-only per build-memory rules — edit the Status cell,
   never delete the row.
4. For rows that stay open, tighten the scope text where the row is now stale (e.g. lists machinery
   that since landed, or cites a supplanted plan). A dated `Note:` line under the row is the
   append-only way to do this.
5. Emit the net result: rows closed, rows sharpened, rows confirmed still-open (grouped by the
   STB.* ticket that owns each).

## Out of scope

- Executing any Stage B leg (that is STB.1–STB.4).
- Closing HUMAN rows (H2/H4/H5 et al.) — those belong to the operator; mark them as `HUMAN-owned,
  cannot close in this ticket`.
- Modifying landed ticket files or rewriting history rows (append-only).

## Acceptance

- **AC1** — every OPEN row at run start has an explicit disposition recorded (DONE w/ evidence,
  sharpened note, or confirmed-open under its owning STB.* ticket).
- **AC2** — no row is closed without a citable artifact (commit, run id, table row, prior ledger
  entry). Rows whose only evidence is "the code exists" stay open if the row demands live proof.
- **AC3** — the reconciliation report lands in `docs/build/runs/RCN.1.md` with a per-row
  disposition table.

## Verify

- `bash ~/agent-skills/skills/build-memory/scripts/check-build-memory.sh .` — 0 violations.
- `pnpm test` need not re-run for a docs-only change; run it anyway if any source file is touched.
- Consistency sweep: `grep -c '| OPEN' docs/tickets/DEFERRALS.md` before/after — report the delta
  honestly.
