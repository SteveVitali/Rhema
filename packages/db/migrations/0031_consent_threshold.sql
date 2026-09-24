-- 0031_consent_threshold.sql — P1.06 (§5.6; REQ-BILL-4): the run sheet's "don't ask me to confirm runs
-- under N credits" pref lives on "user".consent_dont_ask_under. 0 = the pref is off (the §5.6 consent rule
-- — ask above 500 credits, or above 200 credits when the run is >25% of the spendable balance — applies
-- unmodified). The API write clamps at 1,000 (the spec's cap), so the wall always has room to bite above it.

alter table "user" add column if not exists consent_dont_ask_under int not null default 0;
