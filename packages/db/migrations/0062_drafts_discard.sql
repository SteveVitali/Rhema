-- 0062 — R7WRITE.1b (REQ-WRITE-7 → REQ-SYNC-4): the discarded-version marker + comment draft ref.
-- Versions are append-only: a discarded fork keeps its number forever (never reused, never deleted);
-- `discarded_at`/`discarded_by` mark it and history renders "v(N+1) · discarded".
-- `guidance.draft_id` lets an anchored inline_comment (Comment, REQ-WRITE-2) resolve to the draft
-- its selection anchored on, so the Page's margin card reads it back.
alter table drafts add column discarded_at timestamptz, add column discarded_by jsonb;
alter table guidance add column draft_id text;
