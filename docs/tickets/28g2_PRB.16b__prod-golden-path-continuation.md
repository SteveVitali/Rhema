# 28g2 — PRB.16b · prod golden-path continuation

> **Continuation of `28g_PRB.16__prod-golden-path-verification.md`** (authorized split per
> orchestrate-build §2.4 + the 28g spec's own note). PRB.16 proved the golden path's read/write
> surfaces live on prod — dossier bind, dispositions + `finding.disposed`, editor fork/note/
> revise-queue, SSE fan-out/replay, export docx + AI-use, estimate + `run.estimated`. The legs
> below remain because they are blocked by **three live findings** or by **human prerequisites** —
> they are carried here verbatim, with their evidence pointers in `docs/build/runs/PRB.16.md`.
>
> Same constraints: **never merge, never print secrets, never fabricate green.** Every leg is
> exercised on prod and asserted from rows/logs. Modest caps only — ≈ $19.8 of the $50 envelope
> remained at handoff.

## Blocking live findings (fix first — Stage A, PR-able)

### LIVE FINDING 12 — revise author seat cannot see the delivered dossier
`SEAT_MOUNTS` correctly gives the author `correspondence/**` read access, but delivery
(`packages/mirror/src/delivery.ts`) only writes `access-report.md` into
`correspondence/<kind>/<ordinal>/`. The letter/findings/rubric/claim-ledger stay under
`agents/editor/` — outside the author's allowlist — so `respond-to-review` bootstrap self-reports
`status:"blocked"` ("Dossier not delivered to the author seat"; prod log 2026-09-18 03:12Z, run
`01M2S78CV6JQJ7TXFVA4XSXZ9P`). Same wall previously hit on dev (D-P0.15-2 note).
**Fix:** at delivery, also persist the dossier artifacts (editors-letter, findings, rubric,
claim-ledger, discourse/argument/craft notes) into `correspondence/<kind>/<ordinal>/` in the
`shared` namespace — or extend the revise runspec to mount the prior review's `agent:editor`
dossier artifacts read-only for the author seat. Assert the bootstrap then proceeds past 0.3/0.7.

### LIVE FINDING 13 — cap-dead runs never finalize (orphan/reaper loop)
A run whose pod dies on `402 cap reached` stays `running`; heartbeat goes stale → `orphaned` →
stranded-sweep `queued_reenqueued` → new pod → instant 402 → repeat (both `01M2S7HAV0MQQP4K4QXHXH0KBJ`
and `01M2S78CV6JQJ7TXFVA4XSXZ9P` looped 3+ times, spend crept past cap: 65/62 cr). Also: a phase
that self-reports `status:"blocked"` is logged as `failed` with the same re-queue loop.
**Fix:** in the worker's phase-failure path, when the failure is a cap-402 (or the phase result is
terminally `blocked`), finalize the run `failed`/`cap_reached` + release the hold + revoke the
credential in one tx — never leave it for the reaper. Assert via a forced-cap run that it reaches
terminal state without a second provision.

### (carry-over) `runs.spent_credits` stays 0 on cancelled runs
`usage_records` holds the truth (verified 214/378/65 cr) but `runs.spent_credits` never updated on
the cancel path — reconcile on finalization or document it as a display-only field.

## Remaining live legs (Stage B, prod)

1. **Complete a Revise run** — after FINDING 12: modest cap, `pretriage` entries survive the agent
   triage (no agent row overwrites a `actor:"user"` row), `approve_triage` gate resolved live,
   run reaches `completed`/`delivered`, `persona`/dossier rows asserted. (D-PRB.05-1 rest,
   D-PRB.07-1 rest.)
2. **Quick Voice build completion** — cap ≥ ~150 cr this time: 4 quick phases, `persona_profiles`
   row + derived artifacts, **Untested voice** pill on the live surfaces. (D-PRB.10-1.)
3. **Gate-EDIT round-trip** — resolve a live gate `action:"edit"` + valid overlay `edits`;
   `overlayVersionIds` created, next phase reads the edited file. (D-P0.15-3 / D-P0.15k-2.)
4. **Browser legs (operator-assisted)** — Google OAuth click-through on `rhema.tools`, magic-link
   email delivery (needs a REAL Resend key — still a placeholder secret → HUMAN), in-browser
   `EventSource` run-card render, CodeMirror editor legs. (D-P0.01-3, D-PRB.04-2a, D-PRB.07-1a.)
5. **Telemetry/stragglers** — live `[hook]` deny row in `access_log` (D-P0.15h-2), same-pod phase
   advance confirmation (D-P0.15h-4), scoped `second_read` (D-P0.15h-5), sidecar `parseStatus=ok`
   on a completing run (D-P0.03-1), SSE server-tool fetch rows (D-P0.07-5), iteration-cap
   `completed_partial` (D-P0.09-3), fetch byte-receipts gap (kind=fetch rows carry no status/bytes
   — decide: extend audit rows or accept decision-level), `estimate_cache`/Haiku refine leg
   (D-PRB.03-1), SLO metric (D-P0.08b-3), beta-report (D-PRB.12-1 → may move to PRB.17).
6. **Spend reconcile** — fold this session's ~$4.67 into the running total; keep under the $50 cap.

## Evidence so far (do not re-prove)
`docs/build/runs/PRB.16.md` — every proven leg lists the run id / row / timestamp. DEFERRALS rows
already carry dated 2026-09-18 notes; only flip a row with NEW prod evidence.
