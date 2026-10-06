-- 0045_user_serving_role.sql — SEC.1 (REQ-SPEC-30, REQ-DATA-4 strengthened; ADR-017/ADR-018).
--
-- The user-serving role split. Since 0026 made `postgres` BYPASSRLS, every pool pointed at it ran
-- tenant-blind in prod (the STB.2 dossier leak + the 2026-09-30 /voices leak). This migration creates
-- the dedicated user-serving LOGIN member of `rhema_app` and aligns the group's grants with the
-- audited user-serving surface. It ALTERS NO EXISTING ROLE: `rhema_app` keeps its attributes (NOLOGIN
-- NOBYPASSRLS NOSUPERUSER — 0001); `postgres` keeps BYPASSRLS for the documented system pool.
--
--   (a) `rhema_app_login` — NOLOGIN NOBYPASSRLS NOSUPERUSER member of `rhema_app` (inherits the
--       group's whole grant surface, so the grant decision lives in ONE place). LOGIN + password are
--       enabled ONLY in the Stage-B operator window:
--           alter role rhema_app_login login password '<the IaC-generated secret>';
--       A NOLOGIN role cannot connect — this migration is safe to ship ahead of the window (HOT.1's
--       deploy may carry it inert if the window slips).
--   (b) Missing grants the user pool needs (discovered by running the suite as the role):
--       - slo_samples: the api writes autosave/SSE-delivery samples inside its tenant tx (0042);
--       - acquisition_events: the pre-auth funnel beacon inserts through the raw client (0037).
--   (c) Revoked grants — tables user-serving code must not reach (all writes/reads ride the system
--       pool or the proxy's own role):
--       - pause_signals: proxy→worker transport (0041) — written by the egress proxy, drained by the
--         worker's pause sweep; nothing user-serving touches it;
--       - stripe_events: the webhook intake rides the api's system exec (billing-routes deps);
--       - deployments: deploy bookkeeping — only integration/record-deployment.ts writes it
--         (operator creds), nothing user-facing reads it;
--       - estimator_config / estimator_fits: the weekly estimator refit is a system sweep.
--
-- The pinned per-table grant map lives in packages/security-checks/src/rls-catalog.test.ts
-- (USER_ROLE_GRANTS) — a table landing without a grant decision fails the census.

-- (a) the user-serving LOGIN member. NOLOGIN until the Stage-B window sets the password.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'rhema_app_login') then
    create role rhema_app_login nologin nobypassrls nosuperuser nocreatedb nocreaterole;
  end if;
end
$$;
grant rhema_app to rhema_app_login;

-- (b) the grants 0027–0044 never gave rhema_app — both are writes user-serving code performs.
grant insert on slo_samples to rhema_app;
grant insert on acquisition_events to rhema_app;

-- (c) revocations: system-only tables the group never should have been granted.
revoke all on pause_signals from rhema_app;
revoke all on stripe_events from rhema_app;
revoke all on deployments from rhema_app;
revoke all on estimator_config from rhema_app;
revoke all on estimator_fits from rhema_app;

-- (d) `rhema_revoke_run_credentials` — the ONE proxy-table write a user-initiated transaction
--     legitimately performs: POST /runs/:id/stop and the Page's 'Cancel run to edit' run the
--     cancel cascade (state + events + hold release + credential revocation) inside the USER
--     pool's tenant transaction. SECURITY DEFINER keeps that atomic without granting the role a
--     shred of proxy_credentials access: the function only sets revoked_at, and only when the
--     caller's tenant context is the run's own workspace or the system scope (__system__ /
--     unset — the system pool's exec seams). A user-scoped tx therefore cannot revoke another
--     tenant's credential through this function even though the definer bypasses RLS.
--     Minting is NOT definable — proxy_credentials/proxy_allowlists INSERTs stay system-pool-only
--     (provision's deps.systemTxRunner; see docs/security/tenancy-audit.md).
create or replace function public.rhema_revoke_run_credentials(p_run_id text, p_at timestamptz)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.proxy_credentials pc
     set revoked_at = p_at
   where pc.run_id = p_run_id
     and pc.revoked_at is null
     and (
       current_setting('app.tenant_id', true) is null
       or current_setting('app.tenant_id', true) = '__system__'
       or exists (
         select 1 from public.runs r
          where r.id = pc.run_id
            and r.workspace_id = current_setting('app.tenant_id', true)
       )
     );
$$;
revoke all on function public.rhema_revoke_run_credentials(text, timestamptz) from public;
grant execute on function public.rhema_revoke_run_credentials(text, timestamptz) to rhema_app;
