# R6FOR.2 — RLS-exposure forensics + disclosure verdict (D-SEC.1-2)

- **Sequence:** 182a of 208 · **Phase:** round 6 · **Kind:** ticket
- **base_branch:** current checkout
- **Depends on:** 182_R6FOR.1
- **Run:** `implement-spec spec=docs/tickets/182a_R6FOR.2__rls-exposure-forensics.md`
- **Gate status:** none for the forensics. **If the verdict is yes**, the notice text needs the
  operator's approval (HUMAN-H11) and its send is a named mutation — pause there.
- **Live stage:** local reads of the preserved logs + prod read-only joins (system-role DSN,
  `BEGIN READ ONLY`); $0
- **Production mutations:** none (the notice send, if any, happens after approval — a named
  mutation in the PR)
- **Size budget:** ~250 changed lines (script + de-identified report)

## Goal
Decide from evidence whether any real (non-`is_test`) user's data reached another real workspace
during the 2026-09-17 → 2026-10-01 RLS-only window, then act on `GD-EXPOSURE.R6`: yes → notify
those users plainly; no → sign off with evidence.

## Load
- `docs/round-6-draft-spec.md` §4.3 REQ-FOR-4; LEDGER `GD-EXPOSURE.R6`; DEFERRALS **D-SEC.1-2**;
  `docs/security/rls-exposure-since-0026.md` (the confirmed leak routes and residual classes).
- **Preserved evidence (gitignored, local only):** `docs/build/logs/sec1-2-exposure/`
  `window-all-api-web.json` (18,482 entries, 2026-09-17T05:26Z → 2026-10-01T02:51Z) +
  `leak-route-requests.json` (444).
- Anchors (re-confirm): `apps/api/src/voice-routes.ts`, `apps/api/src/dossier-routes.ts`,
  `apps/api/src/chat-routes.ts`, `apps/api/src/outline-routes.ts` (pre-fix shapes via `git log`).

## In scope — deliverables
1. A committed analysis script that reads the local logs plus read-only prod tables (sessions,
   workspaces, personas, projects, runs) and attributes each leak-route request to a
   requester workspace and the workspaces whose rows it could have returned.
2. A verdict per route: whether a real user received another real workspace's data; how many;
   which date range. **Commit only de-identified aggregates** — never a log line, email, name, or
   identifier of a person.
3. **Verdict yes:** a drafted plain notice (what was exposed, when, the fix, contact) for HUMAN-H11
   approval. **Verdict no:** an evidence-summary sign-off.
4. D-SEC.1-2 closed with the residual-class sign-off recorded (the operator's verdict words go in a
   readout).

## Out of scope
- Sending any notice before approval; any change to the preserved logs; committing raw logs.

## Acceptance criteria
- [ ] The script is reproducible over the preserved files; aggregates committed; zero PII in the repo (gitleaks + a manual sweep recorded) *(live-executed)*
- [ ] Verdict recorded per route, with method limits stated (e.g. a request logged without a principal) *(deterministic)*
- [ ] verification green; every new behaviour has a test that fails if it is removed; requirement ids stamped in the PR; anything not automatically verifiable is a `DEFERRALS.md` row with its compensating control; ADRs written for every deviation and owned decision; `BUILD_INDEX.md` row and `LEDGER.md` advanced; operating clauses met — dates from the clock, PR checks read and recorded, AC layers stated, no living-record pins, protected records only appended, gate words verbatim, harness in the run-ledger header. *(agentic — the universal phase-gate AC)*

## Requirement IDs to satisfy and stamp in the PR
REQ-FOR-4

## Cross-cutting invariants
- Manifest invariant 13 (tenancy) + round-6 spec §8 (secrets never; cohort hygiene).

## Operating clauses
- Cited from `docs/tickets/00_MANIFEST.md § Operating rules`.
