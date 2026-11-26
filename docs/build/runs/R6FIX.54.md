# Run ledger — 336_R6FIX.54 (U4.controls dossier runId discovery)

Harness: devin-cli/swe-2-high (direct implementation, no subagent — small surgical fix)

- 2026-11-26 — Ticket written from the 06:23Z nightly's U4 failure (run `45767836181`):
  `dossier (/p/jrn-…/review/): landed the NotFound leaf`. Diagnosis in-session: the leg's
  runId discovery used a bare Node `fetch` (anonymous → the tenant twin 401s) AND parsed a
  flat `twin.runs[]` shape the TimelineDto never returns (`rounds[].runs[].card.state` +
  `ungrouped[]`). `runId=""` for the leg's whole life → the dossier surface navigated
  `/p/<slug>/review/` (NotFound leaf — control-clean) and passed vacuously until
  315_R6FIX.44's h1 guard (merged 2026-11-24) made it fail honestly. The
  `path.includes(":runId")` owed-run guard was dead code — the replace consumed the literal
  first.
- 2026-11-26 — Fix landed on `stevenvitali/r6fix-54-u4-dossier-rundiscovery`: `page.request.get`
  (browser-context session) + `dossierRunIdFromTimeline` in `u4-probe.ts` (real twin shape;
  first `completed` else first) + the owed-run guard moved before substitution.
- Verify: `u4-discovery.test.ts` 4/4 · journeys typecheck/lint green · `turbo build
  --filter=@rhema/journeys...` green.
- Live verdict rides the 06:05Z nightly post-merge → D-R6FIX.54-1.

Closed: 2026-11-26T17:05Z
