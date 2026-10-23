# R6FOR.2 — RLS-exposure forensics + disclosure verdict (REQ-FOR-4; closes D-SEC.1-2)

Stacked on `stevevitali/r6for-1-prod-forensics` · `mergePolicy: OPERATOR` —
**do not merge; the operator merges the chain bottom-up.** Spec:
`docs/tickets/182a_R6FOR.2__rls-exposure-forensics.md` (manifest row 182a, round 6;
`docs/round-6-draft-spec.md` §4.3 REQ-FOR-4). All production access was **read-only** —
system-role `postgres` over the IAP tunnel, `BEGIN READ ONLY`, tunnel closed after;
**$0 spend, no sends, no prod writes.** Committed report (de-identified aggregates only):
`docs/build/reports/2026-10-21_R6FOR.2/exposure-forensics.md`.

**Requirement ids stamped:** REQ-FOR-4

## Verdict — YES, and HUMAN-H11 approval is owed

The forensics pass answers `GD-EXPOSURE.R6`'s question — *did any real (non-`is_test`) user's
data reach another real workspace during 2026-09-17 → 2026-10-01?* — with **yes**:

| route | events | window |
|---|---|---|
| `GET /voices` (persona list) | 206 | 09-22T16:17Z → 10-01T02:02Z |
| `GET /voices/:id` family | 31 | 09-22T18:10Z → 10-01T01:27Z |
| `GET /projects/:id` (residual bucket A) | 8 | 10-01T00:27Z → 01:26Z |
| `GET /projects/:id/chat…` (`loadProject`) | 4 | 10-01T00:27Z → 01:26Z |
| `GET /projects/:id/review/:runId/dossier` | 3 | 09-25T20:49Z → 22:09Z (pre-fix) |
| cross-tenant writes (voices-connections ×2, projects ×1, runs-gate ×1) | 4 candidates | 09-25 → 09-26 |
| `GET /runs/:id`, `GET|POST /billing/…`, outline, chat-write | 0 | — |

Plus **1 unresolved-possible** request (unattributable bucket — counted honestly, not in the
252). **Materiality:** every identified requester/owner is an operator/staff-controlled
account (internal `rhema.tools` mailboxes incl. the SEC.1 probe tenants + the operator's own
consumer-mail account); zero external users existed in the window — the verdict stays `yes`
because the contract keys on `is_test`, not on staff-vs-external.

**→ Per the yes branch: a plain-language notice is drafted at
`docs/build/reports/2026-10-21_R6FOR.2/notice-draft.md` — clearly labelled DRAFT. HUMAN-H11
approval is owed; the send is a named mutation and was not performed.**

## What landed

- `scripts/live/rls-exposure-forensics.mjs` — committed, reproducible analysis: classifies all
  16,931 preserved-window request entries into route families; resolves path ids → owner
  workspaces via read-only prod tables; attributes requesters (bucket-modal over resolvable
  ids + web↔api BFF pairing + session corroboration); emits de-identified aggregates
  (`real-ws-N` pseudonyms). Full-window residual coverage: bucket-A id routes (`/projects/:id`,
  `/runs/:id`, `/billing/*`), write variants, and the four confirmed leak families.
- `scripts/live/rls-exposure-forensics.test.mjs` — 12 unit tests (classification, owner
  resolution, attribution, fix boundaries, verdict outcomes).
- `docs/build/reports/2026-10-21_R6FOR.2/exposure-forensics.md` — the de-identified report:
  per-route verdicts, pairwise requester→owner counts, method, limits.
- `docs/build/reports/2026-10-21_R6FOR.2/notice-draft.md` — **DRAFT, UNSENT** (HUMAN-H11).
- `docs/build/readouts/2026-10-21_R6FOR.2-d-sec-1-2.md` — residual-class sign-off readout;
  the operator's verbatim verdict-words slot is preserved (not invented).
- `docs/tickets/DEFERRALS.md` — **D-SEC.1-2 → DONE** with dated evidence; `D-R6FOR.1-1`
  untouched (out of scope).

## Method limits (stated in the report)

Session `ip_address` is mostly blank and log IPs don't overlap session IPs, so requester
attribution is inferential (bucket-modal + BFF pairing); the 4 write candidates come from the
operator-automation IP pool and are more likely same-owner writes misattributed — reported as
candidates. `is_test` is the only real/test boundary — staff probe tenants through the real
signup funnel count as real.

## Verification

- `pnpm turbo build lint typecheck` — 135/135 tasks OK
- `pnpm test` — 508 files / 5,978 tests / 0 fail (4 skipped)
- Script unit tests — 12/12; live run over prod system-role DSN (IAP tunnel, SELECT-only)
- Six `check:*` gates green; gitleaks clean; manual PII sweep over the diff recorded
- `check-build-memory.sh` 0 violations · `check-append-only.mjs --base 5b09e35` OK
- CI: **`ci: pass #203@d4fb949`** code head (run 39648055347, all seven legs + `ci-pass` anchor); closeout head `1a74994` all-seven green (run 39656453334) — boundary JSONs under `docs/build/logs/`

## Out of scope honored

No notice sent (named mutation, HUMAN-H11) · no change to preserved logs · no raw logs
committed · D-R6FOR.1-1 not touched · no prod writes · $0 spend.
