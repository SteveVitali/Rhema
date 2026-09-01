-- 0005_drop_backlog.sql — the v0.3 BacklogItem removal (REQ-OBJ-7). Backlog rows become `source: 'agenda'`
-- revision obligations; the table is then dropped. This is the forward-only migration a real deployment runs
-- once; on a fresh schema it is a no-op transform (there are no backlog rows). The migration test seeds a
-- backlog row before this step and asserts the obligation appears with source='agenda' and the table is gone.

insert into revision_obligations (id, project_id, source, finding_id, severity, kind, title, state, opened_on_draft_id, created_by, created_at)
select
  b.id,                                   -- reuse the backlog id (stable reference)
  b.project_id,
  'agenda',
  null,
  'major',                                -- agenda items carry no finding severity; default to major (surfaces on the sheet)
  null,
  b.text,
  'open',
  b.opened_on_draft_id,
  jsonb_build_object('kind','system'),
  now()
from backlog_items b
on conflict (id) do nothing;

drop table backlog_items;
