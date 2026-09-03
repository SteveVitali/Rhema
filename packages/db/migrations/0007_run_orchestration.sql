-- 0007_run_orchestration.sql — the run-orchestration additive DDL (P0.08, §12.4).
--
-- Forward-only, additive extensions only (never a rename — REQ-IDE-50). Three concerns:
--   (1) run creation idempotency memo: the 24-h `(billing_account, key) -> run_id` map (REQ-SPEC-16;
--       review 13 F34). The client mints `idempotency_key` at sheet open; the server stores it here so a
--       duplicate `POST /runs` (double click, retried request) returns the SAME run row (AC5).
--   (2) the per-project writer lock: `projects.active_writer_run_id` is the conditional-update column the
--       §12.4 concurrency rule uses ("one writer-run per project … held across gates" — REQ-RUN-17).
--   (3) the richer per-run proxy allowlist + credential resolution shape (D-P0.07-3). The 0002 tables
--       `proxy_allowlists`/`proxy_credentials` were minimal (`hosts[]` / id+run_id). The egress proxy's
--       `RunContextResolver` (apps/egress-proxy/src/context.ts) needs the full allowlist (endpoints, models,
--       URL policy, cap) and enough attribution to build a `RunContext` WITHOUT reading the RLS-protected
--       `runs` row — so the orchestrator denormalizes the resolved context onto the credential at mint time.
--       These proxy tables are deliberately NOT under RLS (0004), so the system proxy resolves any run's
--       credential; keeping the resolver off the tenant-scoped tables avoids an RLS chicken-and-egg.
--
-- The event store (`run_events` + daily partitions + the internal-row split) is intentionally NOT created
-- here — it is owned by P0.08b. P0.08 defines the `EventWriter` interface its transitions call; P0.08b backs
-- it with the partitioned store.

-- (1) idempotency memo — one run per (billing_account, idempotency_key); 24-h TTL enforced in application
-- code (a swept-or-checked `created_at`), the unique constraint makes the duplicate insert a no-op/return.
create table run_idempotency (
  billing_account_id text not null references billing_accounts,
  idempotency_key text not null,
  run_id text not null references runs on delete cascade,
  created_at timestamptz not null default now(),
  primary key (billing_account_id, idempotency_key));
create index on run_idempotency (created_at);

-- (1b) the reaper's per-step re-enqueue budget (§12.4 resumability): ≤2 re-enqueues per step, the third opens
-- resume_partial. Reset to 0 when a phase commits (a fresh phase gets a fresh budget).
alter table runs add column resume_count int not null default 0;

-- (2) per-project writer lock (§12.4; REQ-RUN-17). Null = no active writer. The orchestrator claims it with a
-- conditional update `set active_writer_run_id = $run where active_writer_run_id is null` and releases it at a
-- terminal state; a second writer whose update affects 0 rows stays queued with the holder's id (AC4).
alter table projects add column active_writer_run_id text;

-- (3a) richer allowlist (D-P0.07-3). `hosts[]` (0002) stays for back-compat; the proxy consumes the richer
-- shape. `endpoints` = [{host, pathPrefix}]; `models` = the model ids this run may request; `url_policy` =
-- {blockedDomains, allowedDomains?, knownDomains?, novelDomainCap?} (§12.6 URL policy at the proxy).
alter table proxy_allowlists add column endpoints jsonb not null default '[]';
alter table proxy_allowlists add column models text[] not null default '{}';
alter table proxy_allowlists add column url_policy jsonb not null default '{}';
alter table proxy_allowlists add column cap_credits int;

-- (3b) credential resolution. The credential SECRET is never stored — only its hash (looked up on resolve).
-- `context` denormalizes the RunContext attribution the proxy needs (runId, role, workspace/billing ids,
-- provider, modelTier, rateTableVersion, capCredits …) so the resolver never touches the RLS `runs` row.
-- `attempt` + `expires_at` + `revoked_at` (0002) implement rotation-per-attempt and revocation-at-terminal
-- (REQ-ARCH-11 amended, REQ-SPEC-11): a credential is minted per attempt and revoked when the run ends.
alter table proxy_credentials add column credential_hash text;
alter table proxy_credentials add column attempt int not null default 1;
alter table proxy_credentials add column allowlist_id text;
alter table proxy_credentials add column expires_at timestamptz;
alter table proxy_credentials add column context jsonb;
create unique index on proxy_credentials (credential_hash);
create index on proxy_credentials (run_id, attempt);
