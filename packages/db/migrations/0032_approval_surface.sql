-- 0032_approval_surface.sql — P1.09 (§6.4/§5.11): two small columns the full approval surface needs.
--
-- 1) "user".dismissed_explainers — the one-time inline explainers' per-user dismissal state. The first
--    Approval a user ever sees carries the inline explainer (what it is, the do-nothing outcome, that a
--    parked run spends nothing); dismissing it (or seeing it once) records the verb here so it never
--    renders again — inline coaching, never a modal tour. Same pattern as app_theme (0027) /
--    project_group_by (0029) / consent_dont_ask_under (0031).
--
-- 2) runs.gate_overrides — the per-run deadline override (§6.4: "this run only"). Same shape +
--    validation as projects.approval_overrides (`approvalOverridesSchema`: lengthen/remove/add on
--    wait-defaults; never on spend/refusal kinds). resolveGatePolicy layers it OVER the project's
--    overrides; NULL = the run follows the project policy unchanged.

alter table "user" add column if not exists dismissed_explainers text[] not null default '{}';
alter table runs add column if not exists gate_overrides jsonb;
