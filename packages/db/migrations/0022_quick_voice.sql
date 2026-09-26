-- 0022_quick_voice.sql — PRB.10 (optional inline Quick Voice; §9.3, §9.6; REQ-PERSONA-17/20).
--
-- The delivered note's voice facts: §9.3 requires the delivered drafting/revision note to record the
-- profile snapshot date it was written against, and §9.6 requires an ad-hoc (No-voice) piece to be
-- labeled ad-hoc — never persisted as a voice. The run's FROZEN inputs already carry
-- `voice {mode, personaId, snapshotId, snapshotAt}` (server-resolved at creation); the delivery
-- transaction stamps the same facts on the correspondence row so the note's header never re-derives
-- them from mutable persona state. Additive, nullable, no backfill.

alter table correspondence_items
  add column if not exists persona_profile_snapshot_id text,
  add column if not exists persona_snapshot_at timestamptz,
  add column if not exists voice_mode text;            -- 'linked' | 'ad_hoc' (REQ-PERSONA-20 label)
