-- 0038_account_export.sql — P1.18 (REQ-ACCT-3; §13.4): the whole-account export zip's job + link
-- state. One row per "Export everything" run: the worker builds the zip, stores the bytes
-- content-addressed in the workspace's object bucket (`s3_key`), and updates the row to `ready`
-- with the emailed link's token HASH (the token itself only ever rides the email — REQ-ARCH-30's
-- discipline: the row keeps sha256, never the secret). `expires_at` is minted when the link is
-- created (7 days out, ACCOUNT_EXPORT_LINK_TTL_MS); the download route gates on it. Re-import
-- idempotency needs no table — the importer derives deterministic row ids (packages/archive).

create table if not exists account_exports (
  id text primary key,
  workspace_id text not null references workspaces,            -- tenant key (RLS)
  user_id text not null references "user"(id),
  kind text not null default 'account_zip' check (kind in ('account_zip')),
  status text not null default 'building' check (status in ('building','ready','failed')),
  sha256 text,                                                 -- the zip's content hash (s3_key tail)
  bytes int,
  s3_key text,                                                 -- content-store key the zip lives under
  token_sha256 text,                                           -- emailed link token — hash only
  error text,
  created_at timestamptz not null default now(),
  ready_at timestamptz,
  expires_at timestamptz,
  downloaded_at timestamptz
);
create index if not exists account_exports_ws_idx on account_exports (workspace_id, created_at desc);

alter table account_exports enable row level security;
alter table account_exports force row level security;
create policy tenant_isolation on account_exports
  using (workspace_id = current_tenant()) with check (workspace_id = current_tenant());
grant select, insert, update on account_exports to rhema_app;
