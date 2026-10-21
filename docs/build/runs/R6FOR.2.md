# Run ledger — R6FOR.2 (RLS-exposure forensics + disclosure verdict; D-SEC.1-2)

- **Spec:** `docs/tickets/182a_R6FOR.2__rls-exposure-forensics.md` (manifest row 182a; spec `docs/round-6-draft-spec.md` §4.3 REQ-FOR-4)
- **Base:** `5b09e35` (stevevitali/r6for-1-prod-forensics)
- **Branch:** `stevevitali/r6for-2-rls-exposure-forensics` · PR base: `stevevitali/r6for-1-prod-forensics` (OPERATOR merge policy)
- **Config:** full rigor — ledger, self-review, gap-analysis, tests, live verification (prod read-only, $0), evidence report
- **Harness:** devin-desktop/swe-2-high/subagent
- **Started:** 2026-10-21T16:0xZ (session continuation; script work began under the prior thread)

## Deferrals read

- `D-SEC.1-2` OPEN — HUMAN-H7 RLS-exposure-period review (0026-apply vs first-deploy dates, switch timestamp, residual-class sign-off). **Owned by this ticket → closed.**
- `D-R6FOR.1-1` OPEN — ADR-119 implementation; explicitly out of scope, untouched.
- `D-SEC.1-1` DONE — the Stage-B role switch (gives every exposure row its end date).
- GD-EXPOSURE.R6 — "Preserve now + rule": preservation done 2026-10-20; this ticket runs the forensics pass. Yes → notify plainly (HUMAN-H11 approval + named send); no → sign off with evidence.

## Requirements

- REQ-FOR-4: committed reproducible analysis script over preserved logs + read-only prod joins; per-route verdict (real non-test user received another real workspace's data — count + date range); de-identified aggregates only; yes → draft notice for HUMAN-H11; D-SEC.1-2 closed with residual-class sign-off in a readout.
- ~250 changed-line budget; $0 spend; zero prod writes; zero sends; secrets never; PII never in committed files.

## Plan

1. Preserve inputs confirmed: `docs/build/logs/sec1-2-exposure/` (18,482-entry window + 444-entry leak subset, gitignored/local-only).
2. `scripts/live/rls-exposure-forensics.mjs`: classify every window request → owner resolution via prod tables → requester attribution (bucket-modal over resolvable ids + BFF pairing) → per-family verdict vs fix boundaries.
3. Unit tests; live run over the real preserved files + prod read-only DSN.
4. De-identified report + HUMAN-H11 draft notice + D-SEC.1-2 readout; DEFERRALS row closed.

## Progress

- Branch cut at `5b09e35`; DEFERRALS/LEDGER/GD-EXPOSURE.R6/`rls-exposure-since-0026.md` read; route anchors re-confirmed vs pre-fix shapes.
- Script landed + unit tests (12) green; live run over prod system-role DSN (IAP tunnel, `BEGIN READ ONLY`, tunnel closed): **anyYes=true**.
- Extended to a **full-window scan** (16,931 request entries) covering residual bucket-A families (`projects-id`, `runs-id`, `billing-*`) + write variants; census-only classes (`list-route`, `user-keyed`, `public-page`, `non-app`) verified against the exposure doc's claims (`listProjectStates` carries `workspace_id = $1` explicitly).

## Verdict (REQ-FOR-4)

**YES** — real non-`is_test` workspaces' data was served to other real workspaces' sessions:

| route | verdict | events | window |
|---|---|---|---|
| `GET /voices` | yes | 206 | 09-22T16:17Z → 10-01T02:02Z |
| `GET /voices/:id` family | yes | 31 | 09-22T18:10Z → 10-01T01:27Z |
| `GET /projects/:id/chat…` | yes | 4 | 10-01T00:27Z → 01:26Z |
| `GET /projects/:id` (residual) | yes | 8 | 10-01T00:27Z → 01:26Z |
| dossier | yes | 3 | 09-25T20:49Z → 22:09Z |
| `POST /voices/:id/connections` + `POST /projects/:id/…` + `POST /runs/:id/gates/…` | yes (write) | 4 candidates | 09-25 → 09-26 |
| runs-id / billing / outline / chat-write / billing-write | no | 0 | — |

unresolved-possible: 1. **Materiality: every involved account is operator/staff-controlled** (internal `rhema.tools` mailboxes incl. the SEC.1 probe tenants + the operator's consumer-mail account); zero external users existed in the window. Verdict stays `yes` per the contract's `is_test` boundary → **HUMAN-H11 notice approval owed; the send is a named mutation and was NOT performed.** Draft: `reports/2026-10-21_R6FOR.2/notice-draft.md`.

## Gap table

| requirement / AC | verdict | evidence |
|---|---|---|
| REQ-FOR-4 — reproducible committed analysis script (logs + read-only prod joins: sessions/workspaces/personas/projects/runs; requester attribution; real-vs-test split; aggregates only) | met | `scripts/live/rls-exposure-forensics.mjs` + `…test.mjs` (12 tests); live run over prod system-role DSN — output is aggregate-only (`real-ws-N` pseudonyms). |
| REQ-FOR-4 — per-route verdict w/ count + date range + method limits | met | `reports/2026-10-21_R6FOR.2/exposure-forensics.md` §Per-route verdicts + §Limits (1 unresolved-possible, 4 weak-attribution write candidates, attribution limits stated). |
| Verdict yes → drafted plain notice for HUMAN-H11 (what/when/fix/contact), flagged, unsent | met | `reports/2026-10-21_R6FOR.2/notice-draft.md` — STATUS: DRAFT banner, named-mutation note, approval block. No send. |
| D-SEC.1-2 closed, residual-class sign-off in a readout | met | DEFERRALS row → DONE w/ dated evidence; `readouts/2026-10-21_R6FOR.2-d-sec-1-2.md` (operator's verbatim-words slot preserved — not invented). |
| Zero PII in committed output (gitleaks + manual sweep recorded) | met | aggregates + `real-ws-N` only; sweep + gitleaks recorded in Evidence log. |
| universal phase-gate AC | met | green gate + checks below; REQ-FOR-4 stamped in PR; BUILD_INDEX/LEDGER advance in closeout. |
| ~250 changed lines | deviation | +1,133/−1 — script+tests 731, docs ~400 (report/notice/readout/run-ledger/PR body); recorded honestly. |

## Evidence log

- **`ci: pass #203@d4fb949`** — code head full green (run 39648055347, all seven legs + `ci-pass` anchor; boundary JSON `docs/build/logs/ci-R6FOR.2.json`, head-bound to `d4fb949`).
- `pnpm turbo build lint typecheck` → **135/135 tasks OK** (all cached).
- `pnpm test` → **508 files, 5,978 tests passed** (4 skipped) — incl. `scripts/live/rls-exposure-forensics.test.mjs` (12 tests).
- `pnpm check:licenses` OK (822 pkgs) · `check:protocol-markers` OK (251 files) · `check:no-cookies` OK (257 files) · `check:spa-budget` OK · `check:spa-env` OK (115 srcs/146 artifacts) · `check:dom-contract` OK.
- **Live run** (prod system-role DSN via IAP tunnel, `BEGIN READ ONLY`, tunnel closed): `anyYes: true` — 252 confirmed cross-tenant reads + 4 write candidates + 1 unresolved-possible over 16,931 request entries; full-window census in the report.
- **gitleaks** `dir` over the new files: zero findings in the diff (the only hits repo-wide were pre-existing untracked local scratch — `.env`, cookie scratch — never staged).
- **Manual PII sweep over the diff:** swept for IPs / emails / ULIDs / names — scrubbed the test fixture's real-prod ULIDs to visibly-synthetic `01M*F0SYNTH…` ids + doc-range IPs (TEST-NET-2/3); the only remaining addresses are the localhost tunnel endpoint (`127.0.0.1`, same precedent as R6FOR.1's report) and the org's own `security@rhema.tools` contact in the notice draft.
- **Self-review (two passes).** P1 — full re-read of the script: found + fixed `/billing/usage` misclassification (user-keyed bucket-D glance, not a bucket-A id route); confirmed `voices-write`/`chat-write` verdict paths, fix-boundary math (22:14+15m=22:29Z dossier, 01:54+15m=02:09Z SEC.1), and that `unresolved-test-only` can't inflate `unresolved-possible`. P2 — gap table re-checked against the ticket afresh; report numbers re-derived from the final JSON (billing-id 146 / user-keyed 369 post-fix); de-identification re-checked across all committed files.
- **Size:** +1,133/−1 changed lines vs ~250 — **deviation**, recorded honestly (analysis script 579 + tests 152 + report/readout/notice/PR-body/run-ledger ≈ 400 docs).

## Evidence report

`docs/build/reports/2026-10-21_R6FOR.2/exposure-forensics.md` + `notice-draft.md` (committed, de-identified).

**Spend:** $0 (read-only forensic queries; no sends, no paid legs, no inference).
