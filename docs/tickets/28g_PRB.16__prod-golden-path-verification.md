# PRB.16 — Prod golden-path verification: one real user journey end-to-end on prod

> **Amended 2026-09-17:** the prod zone is **`rhema.tools`** only (the `rhema.app` /
> `rhemausercontent.com` pair referenced below is superseded — see the 28f amendment note): app on
> the `rhema.tools` apex, api on `api.rhema.tools`, the cookieless user-content origin on
> `[*.]usercontent.rhema.tools`.

- **Sequence:** inserted — runs **after `28f_PRB.15` (prod is deployed), before
  `28h_PRB.17`**. Sorts as `28g` (prod-launch round; § Plan extensions, **ADR-008**).
- **Phase:** LV — prod launch (the live-driving verification).
- **base_branch:** current checkout (stacked PR chain)
- **Depends on:** PRB.15 (the deployed prod stack — hard prerequisite), PRB.13 (open signup —
  the journey starts there), PRB.14 (the resilience/cost wiring under test), **HUMAN-H6**
  (auth secrets + OAuth consent + Resend domain — hard blockers if absent), and every PRB ticket
  whose surface a leg exercises.
- **Run:** `implement-spec spec=docs/tickets/28g_PRB.16__prod-golden-path-verification.md`
- **Gate status:** HUMAN-H6 + PRB.15 Stage B must hold; a missing prerequisite is a hard blocker.
- **Live stage:** **operator-gated** — Stage B on prod: real GCP + paid inference + real auth.
  A small Stage A writes any thin driver/assertion code the legs need (no spend).

> **This ticket is mostly Stage B live-driving on prod.** Each leg: **exercise the surface on prod,
> then assert from the rows/logs** — never from the happy-path code alone. A small Stage A
> (offline, PR-able) may write thin drivers/asserters a leg needs. **The autonomy contract is
> modified as in P0.15c–i and PRB.15: STOP for explicit operator authorization at each [OPERATOR
> GATE], and surface — never guess past — any missing prerequisite.** Leg count is high: if the run
> risks overflowing a fresh context, **split it at run time per orchestrate-build §2.4** — a
> `28g2`-style continuation carrying the un-run legs is an authorized move (record it in the ledger
> + manifest § Plan extensions).

## Goal
Prove the **paying-user journey actually works on prod** — sign in, import a manuscript, estimate,
run a real Review end-to-end, read the delivered dossier, triage it, edit the source, revise,
export — asserting every live surface leg from real rows/logs, and closing every DEFERRALS row a
prod run genuinely proves (leaving honestly-unproven ones OPEN with a dated note).

## Operator prerequisites (hard blockers if absent — HUMAN-H6 + PRB.15 Stage B)
- **Prod is up** (PRB.15 Stage B done: stack live, migrations run, TLS on `rhema.app` +
  `*.rhemausercontent.com`, the proxy the sandbox's only egress).
- **Auth + email live:** Google OAuth consent screen published for the prod domain; the OAuth
  client + Resend sending domain + secrets in Secret Manager (D-P0.01-3's prerequisites).
- **A stated live budget** — a real Review + a Revise + a Quick Voice + a second_read-enabled run
  are paid inference (per-run `max_usd` guards apply).

## Load
- **`docs/tickets/DEFERRALS.md`** — the rows each leg discharges (named per leg below; read each
  row's **How to verify** cell — that IS the assertion).
- `docs/phase0-exit-readout.md` + the P0.15c–k run ledgers (`docs/build/runs/`) — how the dev live
  legs were driven (the same act on prod).
- The surfaces: `apps/api` (auth/invite/estimates/triage/export routes), `apps/web` (login,
  signup, sheet, dossier, editor, export), `apps/fetcher`/`apps/convert`/`apps/export`,
  `@rhema/orchestrator` (the run lifecycle), `apps/egress-proxy` (`fetch_log`/`usage_records`),
  `@rhema/findings-core` + `@rhema/obligations` (the reads the dossier asserts).

## In scope — Stage A (offline, PR-able; thin drivers/asserters only, no spend)
1. Any **live-driver / assertion helpers** the legs need (a prod smoke script that walks the
   journey and queries the asserting rows — patterned on `integration/src/live-exit-driver.ts` /
   `live-prepare-fixture.ts`); unit-test the asserters on fixtures. **No prod calls.**

## In scope — Stage B ([OPERATOR GATE]d; each leg = exercise on prod → assert from rows/logs)
2. **[OPERATOR GATE — live] Auth e2e (D-P0.01-3).** A real **Google** sign-in AND a **magic-link**
   sign-in complete on prod.
3. **Open-signup + tenant scoping (D-PRB.01-1, D-PRB.01-3 — as amended).** With
   `signup.mode:'open'`, a no-invite signup creates the account (the invite machinery still
   enforced when a cohort runs invite-gated); `GET /projects` returns only the principal's
   workspace under FORCE-RLS (the tenant-scoped `db` binding asserted on the live api).
4. **Ingest (D-PRB.02-1).** Upload → quarantine → `convert` Job → preview: the `convert` subnet
   has no NAT/default route + no DB creds; a presigned quarantine PUT uploads a docx; the preview
   lands <20 s; the object serves cookieless from `*.rhemausercontent.com` as
   `attachment`/`octet-stream`.
5. **Fetcher tool in a live run (D-PRB.02-3).** A Full-board Review's Editor fetch routes through
   `fetchViaFetcher` (per-URL policy + untrusted wrap) and `fetch_log` carries run/agent/url/
   status/bytes.
6. **Estimate live (D-PRB.03-1/2/3).** `POST /projects/:id/estimates` returns the provisional
   figure; the Haiku pre-pass refines ≤5 s and writes `estimate_cache`; a repeat short-circuits; a
   `run.estimated` row lands; **zero** new `runs` rows. The web sheet shows the DRAFT's real
   word/claim counts (not a query default) and the obligation scope line ("N open obligations…").
7. **The Review + the dossier (D-PRB.04-1).** A real Review runs to `delivered`; the dossier route
   renders the letter, the claim ledger (fetched-✓ chips joined to the real proxy log), second
   read, rubric, findings, the trust chip (from the real `access_report`), the obligation summary —
   all from delivered rows.
8. **Live SSE + obligation chips (D-PRB.04-2 + D-P0.08b-1/-2/-3).** Two SSE clients on one run both
   get fan-out; a forced disconnect + `Last-Event-ID` replays exactly-once; the LB holds the
   connection past the ping cadence (D-P0.08b-1); a rolled-back append publishes nothing, a
   committed batch publishes its high-water seq once post-commit (D-P0.08b-2); the
   `run_event.delivery_ms` metric is emitted and p95 ≤ 2 s (D-P0.08b-3); a blocking finding shows
   its obligation-state chip.
9. **Triage + telemetry (D-PRB.05-1).** A disposition POST carries `by_actor user` + `reason_code`;
   approve-triage writes the merged `actor:"user"` overlay; a Revise consumes `inputs.pretriage`
   with no agent row overwriting a user row; a `finding.disposed` event lands.
10. **Source editor (D-PRB.07-1).** `/p/:project/edit/:draftId` on a reviewed frozen head: type →
    fork to `v(N+1) human_revision` + the URL rebase; findings rail re-anchors; the lock banner +
    Cancel-run release; a note lands as `guidance`; "Revise using your edits" queues the revise
    with `manualRevision` + `mootedFindingIds`.
11. **Quick Voice (D-PRB.10-1).** A `profile_voice{tier:quick}` run builds the package phase →
    `persona_profiles` row + derived artifacts; the pill reads **Untested voice** on all surfaces.
12. **Export (D-PRB.11-1).** `/p/:slug/export` POST → real docx download that opens in Word with
    real footnotes; the AI-use statement downloads; with the runner unset the api answers 503
    `export_not_wired`.
13. **Iteration cap (D-P0.09-3).** Force a 4th audit/gap iteration in a live run → the step ends
    `completed_partial` with the artifact retained.
14. **Scoped second read (D-P0.15h-5).** A `second_read`-ENABLED run: the phase commits with
    `second_read_producer_checked` green — produced by the orchestrator-launched input-scoped
    query, the marker written, `subagent_launches` recording it.
15. **Live gate-EDIT (D-P0.15-3 / D-P0.15k-2).** Resolve a review's `approve_scope` with
    `action:'edit'` + a valid overlay `edits` → `overlayVersionIds` created and the next phase's
    materialized `/work` reflects the edit.
16. **Citation legs re-verified (D-P0.15i-1, D-P0.15i-2 — both code-fixed/done on dev; re-prove on
    prod).** A `second_read=false` Review DELIVERS on prod with `cited⇒fetched` green (Path B
    stripping where needed — ADR-006); a standard-rigor run does NOT wedge in a subagent phase.
17. **SSE server-tool fetch rows (D-P0.07-5).** A live run's streaming response yields real
    `fetch_log` `fetch`/`search` rows from the SSE parse (the recorded-fixture leg is done; this is
    the live confirmation).
18. **The live-straggler rows a prod run exercises** — read each row's *How to verify* and close
    what is **genuinely proven**: e.g. **D-P0.15h-2** (a denied out-of-namespace write logged —
    hook enforcement is a TRUE zero), **D-P0.15h-4** (single-pod phase advance without EACCES),
    **D-P0.03-1** (each ported skill's `sidecar:true` run validating — revise/fact_check/
    profile_voice where exercised). Leave whatever is not proven OPEN with a dated note — **never
    fabricate**.

## Out of scope
- The money legs — the real/test Stripe purchase, the Usage & Cost reconcile, the >2% alert, the
  admin CLI, the PRB.14 live halves (sweep recovery, refund→resume, breaker cap, parked sweep,
  ±2%): all `28h_PRB.17`.
- The deploy itself — `28f_PRB.15` Stage B. The benchmark/enclave/pilot/corpus rows (D-P0.13-*,
  D-P0.14-*) — H2/G2. The nightly golden run (D-P0.15-4), matcher-3 tuning (D-P0.12-3), the six
  real PDFs (D-PRB.02-2 — H2 corpus), Substack-flavoured md (D-PRB.11-2 — spec decision) — all
  stay.
- The REQ-BETA-18 gate readout — G3 stays parked (ledger § GATE DECISIONS).

## Acceptance criteria
- [ ] Every Stage-B leg above is **exercised on prod and asserted from rows/logs** — each
      DEFERRALS row it names flipped to DONE with prod evidence, or left OPEN with a dated note
      saying what was not proven. *(live)*
- [ ] The one real user journey — sign-in → import → estimate → run → dossier → triage → edit →
      revise → export — completes end-to-end on prod. *(live)*
- [ ] No §16.4 efficacy/marketing claim and no marketing surface is created or implied by any leg.
      *(deterministic + review)*
- [ ] verification green; every new behaviour has a test that fails if it is removed; requirement
      ids stamped in the PR; anything not automatically verifiable is a `DEFERRALS.md` row with its
      compensating control; ADRs written for every deviation and owned decision; `BUILD_INDEX.md`
      row and `LEDGER.md` advanced. *(agentic — the universal phase-gate AC)*

## Requirement IDs to satisfy and stamp in the PR
REQ-BETA-14/15 (the open-signup exercise), REQ-PROD-15 (telemetry through the legs), REQ-SPEC-10
(attestation from server-side facts — the asserts read rows), REQ-VIS-9 (cited⇒fetched on prod),
REQ-ARCH-13 (the delivery-SLO metric leg), REQ-OBJ-6 (obligation chips), the DEFERRALS rows named
per leg.

## Cross-cutting invariants — re-check on the LIVE system
- Attestation derives only from server-side facts — every assert reads a row/log, never the UI's
  claim (REQ-SPEC-10).
- Money: the proxy is the meter of record; no leg spends outside the stated budget; nothing is
  billed silently (REQ-SPEC-11/24).
- Telemetry carries ids/template text, never prompt/tool/user content (REQ-VIS-11).
- See 00_MANIFEST.md § Cross-cutting invariants.

## Notes
This is a **verification** ticket — the code exists; legs assert it. Where a leg needs a small
bind (a read endpoint, a thin driver), write it in Stage A. If the leg count overflows the
context, split per orchestrate-build §2.4 and record it — a `28g2`/`PRB.16b` continuation is an
authorized insert. `second_read` opt-in (leg 14) is the first full-7-phase live run — budget for
it explicitly.
