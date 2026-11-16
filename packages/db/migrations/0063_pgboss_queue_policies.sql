-- 0063_pgboss_queue_policies.sql — RH-18 (270_R6OPS.4): the singletonKey dedupe was INERT.
--
-- Every `singletonKey` send in the tree intends send-time dedupe ("a duplicate/replay is a no-op"),
-- but pg-boss 12's singleton unique indexes are policy-gated (job_i1 `short`/created, job_i2
-- `singleton`/active, job_i3 `stately`/state, job_i6 `exclusive`/created+retry+active — verified
-- against pg-boss@12.30.0 `plans.js`), and every queue was created `policy='standard'` — under
-- which a keyed send NEVER conflicts. Worse: `create_queue` is `ON CONFLICT DO NOTHING` and
-- `updateQueue` omits `policy`, so code alone cannot flip an existing queue — this migration is
-- the prod half; the matching `createQueue { policy: 'exclusive' }` declarations in
-- `apps/api/src/server.ts` + `apps/worker/src/main.ts` cover fresh databases.
--
-- `exclusive` = at most ONE job per singleton key across created/retry/active — the "at most one
-- armed job" contract the send sites document (`run.start`'s double-provision guard, the
-- `stripe:`/`stripe-event:` webhook replay guard, `deliver:`/`notify:*`/`gate.expiry:*`, the
-- `project.purge:`/`account.hard-delete:` delayed arms, `account.export:`/`ingest:*`/
-- `reconstruct:*`/`voice.purge:*`). `short` dedupes only `created`, `singleton` throttles `active`
-- while still queueing the duplicate, `stately` allows one created AND one active — none of them
-- is send-time dedupe.
--
-- Guards: `to_regclass('pgboss.queue')` — pg-boss owns its schema and migration-only test
-- databases (PGlite) never carry it. `policy` is stamped onto each job row at insert, so
-- pre-existing `standard` jobs keep old semantics; only new inserts dedupe. Keyless jobs are
-- untouched by policy (they share the coalesce('') slot — every send on these queues is keyed).

do $$
begin
  if to_regclass('pgboss.queue') is not null then
    update pgboss.queue
       set policy = 'exclusive'
     where name in (
             'run.start', 'run.resume', 'run.cancel', 'run.deliver', 'run.finalize',
             'gate.expiry', 'figure.render', 'notify', 'stripe.event',
             'account.export', 'account.hard-delete', 'project.purge',
             'ingest.sync', 'ingest.reconstruct', 'voice.purge'
           )
       and policy is distinct from 'exclusive';
  end if;
end $$;
