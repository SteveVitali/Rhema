-- 0033_chat.sql — P1.11 (§7.1): the Assistant seat's chat surface.
--
-- 1) threads: the §7.1 additions. `is_default` marks the project's undeletable "Project chat"
--    thread (created with the project; the API refuses delete on it). `pins_key` + `created_at`
--    complete the per-thread file set: threads/<id>/{session/, brief.md, pins.json} —
--    `session_store_key`/`brief_key` already exist (0002); `pins_key` names the pins.json blob.
--    `created_at` is the ordering the Desk's thread list needs.
--
-- 2) agent_types: the assistant-shaped fields (§7.1 row) as columns — `denies` (the read-deny
--    globs), `default_thread_tier` ('base'), and the hard per-turn budgets (40 credits /
--    5 searches / 10 fetches). Nullable on existing rows; the assistant row is stamped here so
--    an already-seeded database gets the budgets (the code seed's `on conflict do nothing`
--    insert would otherwise leave them NULL).

alter table threads
  add column if not exists is_default boolean not null default false,
  add column if not exists pins_key text,
  add column if not exists created_at timestamptz not null default now();

alter table agent_types
  add column if not exists denies text[] not null default '{}',
  add column if not exists default_thread_tier text,
  add column if not exists per_turn_credits integer,
  add column if not exists per_turn_searches integer,
  add column if not exists per_turn_fetches integer;

update agent_types set
  denies = array['agents/author/**','!agents/author/ledgers/**','agents/editor/**','agents/persona_builder/**','HOLDOUT-*'],
  default_thread_tier = 'base',
  per_turn_credits = 40,
  per_turn_searches = 5,
  per_turn_fetches = 10
where key = 'assistant';
