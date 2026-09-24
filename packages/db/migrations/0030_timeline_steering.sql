-- 0030_timeline_steering.sql — P1.05 (Timeline, run cards, live feed, walkthrough, run report; §5.5/§6.5).
--
-- Three additive, forward-only, nullable-safe columns on `runs`:
--
--   1. runs.pause_requested_at — the user's "Pause after this phase" marker (§6.5; REQ-GATE-12 amended).
--      Set by the session steering route while the run is `running`; honored by `commitStep` at the NEXT
--      phase boundary — the in-flight phase commits, the flag clears, `paused_at` stamps, and the run
--      transitions `running → waiting_gate` WITHOUT opening a gate row (a steering park, not an approval).
--
--   2. runs.paused_at — the steering-park marker that distinguishes a user pause from a gate wait. A
--      `waiting_gate` run with `paused_at` set shows Resume / Resume-with-note / Stop; a `waiting_gate`
--      run with an unresolved gate shows the approval card. Resume clears it and re-queues the run.
--
--   3. runs.walkthrough — the model-written round walkthrough (§5.5 D20; REQ-IDE-19 amended):
--      {status:'ready'|'failed', text?, model?, inputDigest?, attempts, generatedAt?, lastAttemptAt?,
--       lastError?}. Generated lazily — the delivered run's first card render (or the card's Retry)
--      enqueues `run.walkthrough`; one package-class metered call over a narrow delivered-artifact
--      whitelist, ≤200 words enforced mechanically. Never agent-prose-derived progress.

alter table runs
  add column if not exists pause_requested_at timestamptz;

alter table runs
  add column if not exists paused_at timestamptz;

alter table runs
  add column if not exists walkthrough jsonb;
