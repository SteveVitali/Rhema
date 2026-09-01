# PRB.10 — Optional inline Quick Voice

- **Sequence:** 26 of 50
- **Phase:** RB — Review beta
- **base_branch:** current checkout (stacked PR chain)
- **Depends on:** P0.03 (bootstrap-persona port), P0.08 (persona runs), PRB.02 (upload pipeline), PRB.03 (sheet)
- **Run:** `implement-spec spec=docs/tickets/26_PRB.10__quick-voice.md`

## Goal
The beta's "optional inline Quick Voice" (§17 beta row): minimal voice creation (name +
description + uploaded/pasted samples), the `profile_voice` Quick-tier run, the status pill, and
the voice line on the run sheet — so Revise can bind a measured register without any of the full
Voices surface.

## Load
- Spec §9.2 (creation sheet — beta subset: upload/paste only, no publication linking; Quick Voice
  needs ≥1 sample; the AUP one-liner + Mode metadata REQ-PERSONA-27), §9.3 (pill states that can
  occur at beta: never-built / building / untested / seed-changed / samples-changed; one pill, one
  function — REQ-PERSONA-13/14), §9.5 (Connection→DiscoveredItem→Sample for uploads/pastes;
  include/omit; quality verdicts — REQ-INGEST-1/4/7/8/10), §9.6 (No-voice default = ad-hoc voice,
  labeled in the drafting note; a never-built voice usable with the hint — REQ-PERSONA-17/20;
  the soft lock barely binds at beta since Draft is absent, but the API rule REQ-DATA-32 holds),
  §12.6 (persona mounts; hold-outs n/a for Quick).

## In scope — deliverables
1. **Creation sheet (beta subset):** name (+optional byline), optional description, upload/paste
   samples via PRB.02's pipeline into the sample model (REQ-INGEST-1), Quick Voice estimate
   refreshed ≤500 ms on sample changes (REQ-PERSONA-3), Mode selector as metadata + the one-line
   AUP notice (REQ-PERSONA-27), `Create and build` → `profile_voice{tier: quick}` run through the
   run sheet's estimate path.
2. **Pill + minimal detail:** one pill function over the snapshot facts (REQ-PERSONA-14 property
   test across the beta-reachable states); a minimal voice page: seed editor (plain markdown,
   hash-recomputed on save → *Description changed* live), samples list with include/omit, the
   agent-drafted description marked until edited (REQ-PERSONA-4), run history rows.
3. **Run-sheet voice line:** linked voice with pill + optional "Update voice first (≈N cr)" chained
   action; a stale/untested voice never blocks (REQ-PERSONA-17); delivered notes record the
   profile snapshot date.
4. **Project link:** voice picker on project creation/settings (No voice default, ad-hoc labeled);
   `projects.persona_profile_snapshot_id` pinning; REQ-DATA-32 API shape honored.

## Out of scope
- Full Profile, calibration, hold-outs, staleness states 5/7, Update-voice scope routing
  (REQ-SPEC-27), publication connectors, composites, house styles, the Voices workspace surface —
  P1.14/P1.15.
- Trial voice limits (P1.16).

## Acceptance criteria
- [ ] Quick Voice build end-to-end in dev: ≥1 uploaded sample → run → profile artifacts →
      **Untested voice** pill (neutral tone) (§9.2 table). *(agentic, asserted from rows)*
- [ ] Pill property test: beta-reachable state × surface renders identical strings from one
      fixture snapshot (REQ-PERSONA-14 / AC-P-A subset). *(deterministic)*
- [ ] Seed edit recomputes the hash and flips the pill live; the agent-drafted seed is marked until
      first user edit (REQ-PERSONA-4; §9.3 seed-hash rule J9). *(deterministic)*
- [ ] A never-built / stale voice never blocks a run; the drafting/revision note records the
      snapshot date (REQ-PERSONA-17). *(deterministic)*
- [ ] Derived profile artifacts reject API writes (405; `editMode: none`) — AC-P-C subset
      (REQ-PERSONA-7 / REQ-VIS-8). *(deterministic)*
- [ ] No cookie/session-token input exists anywhere in the connection UI or schema (AC-I-B grep
      applies from day one). *(deterministic)*

## Requirement IDs to satisfy and stamp in the PR
REQ-PERSONA-2 (subset), REQ-PERSONA-3, REQ-PERSONA-4, REQ-PERSONA-13/14 (beta states),
REQ-PERSONA-17, REQ-PERSONA-20, REQ-PERSONA-27, REQ-INGEST-1, REQ-INGEST-4, REQ-INGEST-10,
REQ-INGEST-7/8 *consumed halves only* (owners: 7 → P1.15, 8 → PRB.02), REQ-DATA-32 (API shape),
REQ-VIS-8 (correction path stub: seed-edit only at beta; owner P1.14).

## Cross-cutting invariants — re-check before opening the PR
- Nothing in the profile is secret *from* the user; hiding is simplicity/hold-out/method-IP —
  no method text surfaces (§9.1; SS class).
- Never "writes like you" copy (banned string). Mode gates nothing (Q-11).
- See 00_MANIFEST.md § Cross-cutting invariants.

## Notes
P1.14/P1.15 grow this into the full Voices + ingestion surface; everything here (sample model,
pill function, snapshot pinning) is the permanent substrate.
