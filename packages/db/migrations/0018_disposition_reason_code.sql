-- PRB.05 — REQ-BETA-6 one-tap reason codes persist on the disposition row so the card can show
-- the chip the human picked. Optional everywhere; the same value is also emitted on
-- `finding.disposed` (analytics). Additive, nullable, no backfill.
alter table dispositions
  add column if not exists reason_code text;
