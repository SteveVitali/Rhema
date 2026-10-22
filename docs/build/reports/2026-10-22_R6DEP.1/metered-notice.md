# R6DEP.1 — metered-notice send evidence (counts only — no recipient PII)

Executed 2026-10-22T~09:4xZ **after** the prod deploy + provenance all-PASS (GD-PREAUTH-ACTS.R6
item; R6MNY.1's read measured recipients>0 on 2026-10-21).

- Dry-run re-read (same system-role DSN over the IAP tunnel, `EFFECTIVE_DATE=2026-12-01`):
  `recipients=2` — identical scope to R6MNY.1's 2026-10-21 measurement (reason classes:
  `topup`, `subscription+topup`). Count and scope unchanged ⇒ send authorized.
- `--send` result: `delivered 2 emails, 2 inbox rows` (both `inbox:"written"`, both
  `emailLeg:"sent"`).
- `EFFECTIVE_DATE=2026-12-01` — 40 days after the send (≥30-day notice bound honored).
- Template: verbatim `packages/ledger/src/metered-notice.ts` copy (subject
  "An update to how runs charge credits — effective 2026-12-01"), asserted claim-by-claim in
  `metered-notice.test.ts`; `APP_ORIGIN=https://rhema.tools`.
- The debit-mode flip itself is NOT performed — R6MNY.1 precondition reads 1–2 UNMET
  (`cap_calibration_reports` 0 rows, admissible `cost_observations` 0) and stays gated per
  `docs/ops/launch-flips.md` flip 1.
- IAP tunnel closed after the send.
