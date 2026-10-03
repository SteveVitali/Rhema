# ADR-063: Honest Inbox rows — the waiting count IS the rendered Needs-you rows, partials say "stopped early", recoveries collapse without re-badging

- **Status:** Accepted
- **Date:** 2026-10-03
- **Ticket:** UX.1
- **Requirement ids:** REQ-IDE-41, REQ-IDE-2 (badge rule kept)
- **Spec:** §5.11, §5.9

## Context
The design review found the Inbox printing "Waiting on your call: 0" above gate rows whose copy said
"waiting on you", many repetitive "Run recovered" rows, and rows naming no project. Two decisions
were owned: whether partial-results rows count in the heading, and how recovery noise collapses.
The §5.11 badge rule (open approvals + decisions only) is REQ-IDE-2's and must be kept.

## Decision
The heading's count is `blocked.length` — the exact rows the Needs-you section renders — so the
number can never disagree with the list below it (the rail badge keeps REQ-IDE-2's open-approvals +
decisions semantics). A `completed_partial` run maps to the `run_finished` row with `partial: true`,
rendering "stopped early — the kept results are ready": it is a finished-deliverable event row
(unread group), stays mail-suppressed, never claims "finished", and never enters the waiting count.
The resume-partial DECISION rows that do say "waiting on you" are real `kind:"blocked"` gate rows, so
they count — copy and count now agree by construction. The recovery row is reworded to "Run stalled —
restarted automatically", keeps its per-run collapse key, and gains `keepReadOnRepeat`: a repeat
orphan-requeue upserts the collapsed row (title/body stay current) without resetting `read_at`, so a
crashy run produces one unread row, ever. Every row joins `projectTitle` from the read model and
renders a project-meta line (account-level rows legitimately carry none).

## Consequences
Count, sections, and rows agree by construction rather than by two code paths kept in sync; recovery
notices stay informational without crying wolf; and the "run_finished" title never lies about a
partial deliverable.

## Alternatives considered
- Counting partials as waiting rows: rejected — the partial run is DONE; its kept results are an
  informational deliverable, and the resume decision is a real gate row counted when it exists.
- Suppressing recovery rows entirely: rejected — a restarted run is a real event the reader may want
  to see once; the collapse + keep-read change keeps exactly that.
- Deleting recovered rows on success: rejected — history stays honest (the run did stall); the row
  simply never re-badges.

## Revisit trigger
A new event class that collapses per key but wants repeat-badge behavior — `keepReadOnRepeat` is
opt-in per event type, so the default (re-badge on repeat) remains the general rule.
