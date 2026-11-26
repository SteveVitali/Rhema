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

## Pass 2 — live re-verification surfaced two second-layer defects (PR #430)

- 2026-11-26 — Manual single-leg verification against prod `bf5650ea` (the merged #429 fix
  running from this worktree's dist) surfaced what the unit legs could not:
  (a) `/bff/p/<slug>/timeline` is a **demo-only twin — 404s for tenants**, so the pass-1
  helper's premise was wrong even authenticated; and the leg picked the sidebar's first
  project (`untitled-2`), which carries no review — only `showcase` held
  `latestReviewRunId: 01M8B8FZYDHW5WEB17DHRNCTCF`. Discovery now scans the `/bff/app`
  project-list rows — the dossier-card fact the sidebar itself derives from —
  preferring the picked project's own review, else the first row carrying one, and
  navigating THAT row's dossier (`dossierTargetFromProjectList` → `{slug, runId}`).
  (b) The dossier's named `FilterSelect` exemption (`findings-desk.tsx`, the R7KIT.3d /
  RV-36 no-JS GET-form sev/kind/disp selects) was never mirrored in `U4_SURFACES`' exempt
  containers — the live probe flagged all 3 selects as false violations.
  `[data-findings-filters] select` added to the dossier `exempt` list, mirroring the
  lint-level `{file, component}` exemption.
- Verify: `u4-discovery.test.ts` 4/4 (preferred-slug own review · any-row fallback with its
  own slug · null/absent → `null` honest arm) · journeys typecheck/lint/`turbo build` green.
- **Live verification PASS** — `U4.controls` against prod `bf5650ea` from this branch's
  dist: dossier probed at `/p/showcase/review/01M8B8FZYDHW5WEB17DHRNCTCF`, provenance
  match, $0 (`/tmp/u4-verify3/report.json`). Tonight's 06:05Z nightly verdict on a main
  carrying this SHA stays owed → D-R6FIX.54-1.

Closed: 2026-11-26T19:50Z
