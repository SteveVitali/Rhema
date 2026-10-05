# RCN.1 — run ledger (deferral reconciliation, post-CAPSTONE)

## Spec / Base / Branch / Config
- Spec: `docs/tickets/51_RCN.1__deferral-reconciliation.md` (Sequence 51 — the audit row that
  opens the post-CAPSTONE Stage-B wave, manifest rows 51–55)
- Base / branch: `stevevitali/p1-22-launch-checks` @ `145ff7b` (chain tip at dispatch; PR #76 is
  the open PR on this branch — its lifecycle state is not asserted here)
- Type: audit / docs / ledger-only. **$0.** No code, no deploys, no inference, no new live calls.
- Production era under audit: **PRB.25-era prod** (the P1 chain is *not* deployed). Consequently
  P1-era rows can only be confirmed open + owner-tagged; PRB-era rows could be closed on
  prod evidence; P0.15-era rows closed where post-G1 prod runs supplied the missing live legs.

## Method

1. Re-parsed `docs/tickets/DEFERRALS.md` with the *last* table cell as Status (the file's table
   sections have heterogeneous column counts; first keyword of that cell is the status).
   Baseline at `145ff7b` (HEAD): **146 rows — 72 OPEN, 9 PARTIAL, 63 DONE, 2 ACCEPTED-SKELETON.**
   That 81-row OPEN+PARTIAL count is the same population CAPSTONE reported (~84 not cleanly DONE,
   of which 3 were Hx gate rows absorbed into their owning rows).
2. Read the evidence ledgers for everything later than CAPSTONE's cut: `runs/PRB.16.md`,
   `runs/PRB.16b.md`, `runs/PRB.17.md` … `runs/PRB.25.md`, `runs/P0.15k.md`,
   `docs/phase0-exit-readout.md`, `readouts/CAPSTONE.md`, plus read-only prod DB queries via the
   IAP tunnel (`127.0.0.1:15433`) and `kubectl` against `rhema-prod-run-task-gke-c13cb80`.
3. For each of the 81 starting OPEN/PARTIAL rows: locate directly citable evidence (run id, table
   rows, gate/job rows, commit, ledger entry) or confirm the residual is still real. Append a
   dated `2026-09-25 (RCN.1)` note to the Status cell — append-only, rows never deleted.
4. Also swept **DONE-first rows whose prose still said "OPEN for live"** (stale live halves that
   would misrepresent state to the first-keyword parser): verified whether the live leg later
   landed and either discharged it (with citation) or kept the honest residual.

## Production evidence relied on (all pre-existing, read-only)

- Delivered prod runs: review `01M36663QG1ZJ7VEZ036Y54NSG` (quick; 5 phases committed +
  `correspondence_items` delivery; spent 720cr of cap 1100; `approve_scope` gate
  `01M366J7BBXQEMRGZ37T1MR3M2` resolved), review `01M2RGNK9PWKN5M34343GXZC16` (6 phases),
  profile_voice `01M2TB91FESCXYATTB7J8QBGW` (→ `persona_profiles` `01M2TCXM06G14PQJPKM19HW3Y9`),
  fact_check `01M2TZ8E1ARR8SMGKD4GKT162K`, revise `01M2T6D3B32AVXHCQH73ZGJGBD`, plus
  `01M2VDHN2…`; cancelled run `01M2TNKY0KDBGCQPHWG5QWVRNN` (stranded-gate expiry fixture);
  `cap_reached` run `01M364236…` (died at exactly cap 783).
- Table counts on prod: `fetch_log` — 3,089 `inference` / 2,337 `fetch` / 240 `search` rows;
  `usage_records` ×2,434 (`source='proxy'`; 104 for `01M36663…`); `usage.tick` ×93;
  `run.state_changed` ×439; `step.finished` ×89; `gate.opened` ×45 / `gate.resolved` ×43;
  sidecar `artifacts` ×16 (9 kinds); `access_log` ×1,539 (allow/deny incl. `/app/skills/**`
  and seat-namespace denials; 25 allow / 41 deny on `01M2TRYC9…`); `dispositions` ×19
  (4 user rows w/ `reason_code`); `artifact_versions` `created_by='user'` ×19;
  `session` ×28; `signup.completed{method:"magic_link"}` ×2; `estimate_cache` 0 rows;
  `invites`/`invite_redemptions` empty.
- Stranded-gate expiry: gate `01M2TNKY14HSP3ESJH8Y1NK8HW` (`confirm_cost`, `resolved_at` null,
  `deadline 2026-09-25T16:29:27.443Z`, `on_expiry='cancel'`) — **5 `pgboss.job` `gate.expiry`
  jobs completed at the deadline** (started 16:29:29–16:29:37Z); run already operator-cancelled
  (16:34:43Z, `spent=0`), so expiry action was a correct no-op.
- Stripe: live webhook `we_1UH99C2MLe3ETP9Sk4UQBKXs` (signed `evt_prb18_sigcheck_1` → 200);
  Payment Link `plink_1UH99P2MLe3ETP9SR1zL2jAW`; two real operator purchases granted —
  `credit_ledger` `grant/topup` 2,500cr `stripe_ref=pi_3UIWBo2MLe3ETP9S18uvOm9f` (16:05Z) and
  `pi_3UIaAy2MLe3ETP9S1wcbO4PC` (20:20Z) on 2026-09-22; `topup.purchased` +
  `wtp.recorded{source:"purchase"}` analytics rows.
- Operator account `01M2V3PM0WYEPXH26NA2J9BRWB` (workspace `01M2V3PM11XSF05VJ9G01PM5ZB`,
  billing `01M2V3PM1133TPH4M8H0T8CSEE`): Google click-through landed 2026-09-22T15:24Z
  (`account(provider_id='google')` row; `email_verified=true` on both users).
- Auth click-throughs (PRB.18/PRB.19 ledgers): `redirect_uri_mismatch` on the Google leg was
  resolved by the operator (GCP console registration); Resend domain verified → magic-link
  delivered + clicked, authed `/voices`/`/export`/disposition legs proven headlessly.
- `pg_class`: `projects`/`runs` `relrowsecurity=true, relforcerowsecurity=true` on prod.
- `runs.inputs`: `->>'sidecar'` and `->>'phase'` are null on every prod run (pin legs never sent).

## Per-row disposition — every row OPEN or PARTIAL at `145ff7b` (81 rows)

Legend: **→DONE** flipped with citation; **→PARTIAL** sharpened to named residuals; **OPEN**
confirmed open with owner; **HUMAN** human/operator-owned.

| Row | Start → End | Disposition — evidence or owner |
|---|---|---|
| D-P0.01-3 | OPEN → **DONE** | Google sign-in completed end-to-end (operator browser 2026-09-22T15:24Z, PRB.19); magic-link delivered+clicked; prod `session` ×28, `signup.completed{method:"magic_link"}` ×2. |
| D-P0.01-4 | ACCEPTED-SKELETON (unchanged) | Confirmed carried — self-hosted turbo cache; STB.1 audits while inside Pulumi state. |
| D-P0.01-6 | ACCEPTED-SKELETON (unchanged) | Confirmed carried — `/20` subnet sizing; STB.1 audits while inside Pulumi state. |
| D-P0.03-1 | OPEN → **DONE** | 16 `artifacts(kind='sidecar')` across all four ported skills on delivered prod runs; the enforcing oracle's failure mode was observed pre-fix. |
| D-P0.03-2 | OPEN | Confirmed open — `inputs->>'sidecar'` null on every prod run (absent-flag leg never exercised). Owner **STB.3**. |
| D-P0.03-3 | OPEN | Confirmed open — `inputs->>'phase'` null on every prod run (pin never sent). Owner **STB.3**. |
| D-P0.06-3 | OPEN | Re-deferred (P1.22 already logged): distroless rebuild is post-launch ops; compensating controls enumerated; pen-test exercises them → **STB.4 Leg B** context, owner ops. |
| D-P0.07-5 | (DONE-first) → **DONE** clarified | Live SSE fixture discharged: prod `fetch_log` server-tool rows ×2,337 fetch / 240 search + `usage_records` metering — exactly the rows this AC asks for, emitted by the streaming parse on live traffic. |
| D-P0.08-2 | (DONE-first) → **DONE** clarified | Provisional-credit rendering live: `usage.tick` ×93 ascending `spentCredits` (79→149→382→466→586 on `01M36663…`); ±2% cross-check residual ruled via D-PRB.16-5 precedent. |
| D-P0.08b-2 | OPEN | Confirmed open → **STB.2** (read-only: second subscriber sees post-commit high-water seq). |
| D-P0.08b-3 | OPEN | Confirmed open → **STB.2** (emit `run_event.delivery_ms`, then read on the monitoring surface; same class as D-P1.22-1). |
| D-P0.09-3 | OPEN | Confirmed open — max `steps.attempt` 12 on prod but no `completed_partial` ever observed. Owner **STB.3** opportunistic (a fidelity iteration >3× inside a bounded leg). |
| D-P0.10-2 | (DONE-first) → **DONE** clarified | Stranded-run sweep live-proven: `gate.expiry`/`stranded-sweep` pgboss jobs completed at deadline on `01M2TNKY…`. |
| D-P0.11-1 | (DONE-first) → **DONE** clarified | Credit-ledger call-sites exercised live: holds/releases/refunds/adjustments on prod `credit_ledger`; `01M2TZ8E…` release 247, `01M2TZSM…` release 104 observed. |
| D-P0.12-3 | OPEN | Confirmed open — matcher/rubric tuning needs the real-project disposition corpus (`dispositions` ×19 incl. 4 user rows is a start). Owner: a tuning follow-up ticket (construction, not STB). |
| D-P0.13-1 | OPEN | Confirmed open — owner: the evals/enclave program (rides H2 corpus). |
| D-P0.13-3 | OPEN | **HUMAN** (H2 — corpus commissioning + two-editor/senior-adjudicator engagements). |
| D-P0.13-4 | OPEN | Confirmed open — owner: evals program (real variance + arm executors; rides pilot wave). |
| D-P0.13-5 | OPEN | Confirmed open — owner: evals program (`@rhema/evals` private checkout). |
| D-P0.14-1 | OPEN | Confirmed open — owner: evals program (real arm executors need real model calls). |
| D-P0.14-2 | OPEN | Confirmed open — owner: evals program (workshop UI is a new build, §17). |
| D-P0.14-3 | OPEN | Confirmed open — owner: evals program (cross-family judge calls + calibration vs H2 subset). |
| D-P0.15-2 | PARTIAL → **DONE** | All 4 workflows folded live (`estimatorsAreProvisional()=false`; scales 2.34/48.2/…); the authoritative-figure question is a D-PRB.16-5-class ruling, recorded. |
| D-P0.15-3 | PARTIAL | Stays PARTIAL — gate RESOLUTION live-proven (43 `resolved_at`; `run.approval_*` ×29/28; PRB.16b structured edit committed), but the *edit materialized into the next phase's `/work`* assert rides **STB.3**'s Draft leg (D-P1.10-1). |
| D-P0.15-4 | OPEN | **HUMAN** — nightly golden-run budget (~$150–300/night) is operator-owned + ops cadence wiring. |
| D-P0.15-5 | OPEN → **DONE** | Queued→running p95 **≈57 s, n=15** measured on prod (`created_at` → first `to:'running'`); above the 45 s SLO — that finding carries to D-P1.22-1/D-P0.08b-3. |
| D-P0.15b-1 | PARTIAL | Stays PARTIAL — click-throughs landed (Google + magic-link, PRB.19); migrate+seed on live AlloyDB; residual = `pr-test` full-stack up/destroy → **STB.1**. |
| D-P0.15b-2 | OPEN → **PARTIAL** | Operator-gate legs landed on prod (SDK + engine bring-up + paid runs delivered); residuals carried by D-P0.03-2/-3 (pin legs → STB.3). |
| D-P0.15b-3 | OPEN → **PARTIAL** | Run legs landed (3 delivered reviews + revise + fact-check + voice); residuals = pilot wave/arm executors/σ_d (evals, H2) + structured gate-edit leg (STB.3). |
| D-P0.15b-4 | OPEN → **PARTIAL** | Most G1-scoped rows now DONE; residuals = D-P0.15-4 (HUMAN budget) + measured phase0-exit-readout refresh + operator G1-ready flag (HUMAN). |
| D-P0.15c-1 | PARTIAL → **DONE** | Prod full stack deployed (PRB.15, 107 resources), migrate+seed on live AlloyDB, delivered runs end-to-end. |
| D-P0.15c-2 | PARTIAL | Bring-up proven on prod (inference ×3,089, `predicatesPassed=true` steps, 16 sidecars, cap-402 `01M364236…`, credential-boundary denies); residual = the `phase:"N"` + `sidecar:true` pin asserts → D-P0.03-2/-3 (STB.3). |
| D-P0.15c-3 | OPEN → **PARTIAL** | Commit/deliver loop + `usage.tick` live-proven; `proxyVsSdk ±2%` superseded by D-PRB.16-5; residuals = D-P0.15-3 (STB.3) + D-P0.15d-2 (structural). |
| D-P0.15c-4 | OPEN | Confirmed open — owner: evals program (six real arms + trained matchers; needs H2 + pilot-spend gate). |
| D-P0.15c-5 | OPEN → **PARTIAL** | p95 now measured (D-P0.15-5); residuals = D-P0.15-4 + measured readout rewrite + operator G1 flag (HUMAN). |
| D-P0.15c-6 | (DONE-first) → **DONE** clarified | `RUN_SPEC`/work materialization live-proven — pod-model path ran 40+ runs; `steps.result.sdkSubtype` populated. |
| D-P0.15c-7 | (DONE-first) → **DONE** clarified | Wire legs discharged — proxy meters+caps+logs every request (`cap_reached` at exactly 783). |
| D-P0.15c-8 | (DONE-first) → **DONE** clarified | All prod inference egressed only via the proxy (metered rows + deny rows; no direct-egress path). |
| D-P0.15d-2 | OPEN | Confirmed open and **structural** — no production call path discards a committed phase, so `refundPhases` has no honest caller; owner: a future cancel-with-partials path / §14.4 refund window. |
| D-P0.15d-3 | (DONE-first) → **DONE** clarified | Provisional-credit figure landed — `usage.tick` ×93 ascending on prod. |
| D-P0.15d-4 | (DONE-first) → **DONE** clarified | Same-pod commit/deliver loop ran live repeatedly (`01M36663…` 5 phases; `01M2RGNK9…` 6). |
| D-P0.15e-1 | (DONE-first) → **DONE** clarified | Worker runs always-on on prod — launched every run-task Job; consumes `run.reap`/`stranded-sweep`/mail/stripe per `pgboss.job`. |
| D-P0.15e-2 | (DONE-first) → **DONE** clarified | SDK→proxy path proven live (3,089 metered inference rows only exist via the proxy traversal). |
| D-P0.15e-3 | (DONE-first) → **DONE** clarified | Cloud-Run worker → GKE Job launch works live (option-(b) metadata-token topology is the live one). |
| D-P0.15e-4 | (DONE-first) → **DONE** clarified | Konnectivity leg live-verified today — `kubectl logs`/`get pods` work against `rhema-prod-run-task-gke-c13cb80` (previously "No agent available"). |
| D-P0.15f-1 | OPEN → **DONE** | Privsep live-proven without the bundle — every post-fix prod run launched the agent as uid 10002; `access_log` ×1,539 can only exist under the hook boundary; no `setresgid` EPERM anywhere. |
| D-P0.15f-2 | OPEN → **DONE** | Credential-injector path proven by metering itself — `usage_records source='proxy'` ×2,434 (104 on `01M36663…`); unstamped requests 403 `egress.denied`. |
| D-P0.15h-2 | OPEN → **DONE** | §12.6 hook invoked+enforcing+auditing live — `access_log` ×1,539 incl. path-escape, seat-namespace, and `Agent`-class denies. |
| D-P0.15h-4 | PARTIAL → **DONE** | Same-pod multi-phase advance post-`umask(0o000)` proven (`01M36663…` 5 phases in one pod). |
| D-P0.15h-5 | OPEN | Confirmed still unwired at chain tip — `expectedProducerQueryId` has no writer in `packages/`/`apps/`; scoped-query launch + `.rhema/second-read.json` write is new construction. Owner: a focused P-series fix ticket; live verify rides **STB.3**. |
| D-P0.15h-8 | (DONE-first) → **DONE** clarified | Server-side web research proven on prod — delivered runs carry real fetch/search trails. |
| D-P0.15i-1 | PARTIAL → **DONE** | Completes-delivered leg observed — `01M36663…` ran all phases to `completed` (and `01M2RGNK9…` earlier). |
| D-P0.15i-2 | (DONE-first) → **DONE** clarified | Path-B outcome proven end-to-end — claim ledgers land `claims`×20/`claim_sources`×11; unfetched citations stripped/downgraded per ADR-006. |
| D-P0.15k-1 | (DONE-first) → **DONE** clarified | Instrumented folds proven on all 4 workflows live; `INSTRUMENTED_OVERRIDES` durability caveat stands (process-local; worth a look during STB.1 smoke). |
| D-PRB.01-1 | OPEN → **PARTIAL** | Google+magic-link legs landed; residual = invite *enforcement* (`invites`/`invite_redemptions` empty — `check`/`consume` never ran against a real invite) → **STB.2** ($0 leg). |
| D-PRB.01-2 | OPEN | **HUMAN** (H3 — final content selection + operator sign-off). |
| D-PRB.01-3 | OPEN → **DONE** | Tenant-scoped session→principal bind landed `86fd5ff`; prod `pg_class` `relrowsecurity`/`relforcerowsecurity` armed on `projects`/`runs`. |
| D-PRB.02-2 | OPEN | **HUMAN** (H2 — the six real PDFs are the operator's persona corpus). |
| D-PRB.02-3 | OPEN | Confirmed open — `fetch_log` join half is proven infrastructure; missing piece = a live **Full-board** Editor run through `fetchViaFetcher` → **STB.3**. |
| D-PRB.03-1 | OPEN → **PARTIAL** | Estimate path live (`run.estimated` ×22); residual = `estimate_cache` empty (persisted estimate never written) + `ClaimPrePass` Haiku refine unobserved → **STB.2**. |
| D-PRB.03-2 | OPEN | Confirmed open → **STB.2** (sheet resolves live word/claim counts). |
| D-PRB.03-3 | OPEN | Confirmed open → **STB.2** (live obligations read feeding `scopeLine`). |
| D-PRB.04-1 | OPEN → **PARTIAL** | Dossier exists on prod (`rhema.tools/p/my-first-project/review/01M36663…`; unauth GET 302→`/login` correct); residual = authed render assert → **STB.2**. |
| D-PRB.04-2 | OPEN | Confirmed open, split: `EventSource` browser leg rides **STB.3** runs; obligation-chip join → **STB.2** code leg. |
| D-PRB.07-1 | OPEN → **PARTIAL** | Substrate proven (19 user-authored `artifact_versions`; block-granularity `provenance_maps`); residual = the browser CodeMirror session — **HUMAN** click-through during STB.2/STB.3 attendance. |
| D-PRB.08-1 | PARTIAL | Stays PARTIAL — (a) fully closed (two real Stripe-originated grants landed: `pi_3UIWBo…`, `pi_3UIaAy…`, `topup.purchased` analytics); residual (b) Anthropic admin-key reconcile → **STB.4 Leg C**. |
| D-PRB.10-1 | OPEN → **DONE** | Quick Voice build ran end-to-end on prod → `persona_profiles` `01M2TCXM06G14PQJPKM19HW3Y9` (`corpus_size_at_build=5380`, `calibration_status='untested'`) + 9 artifacts. |
| D-PRB.11-2 | OPEN | Confirmed open → **STB.2** ("include if trivial" call on the deployed surface). |
| D-PRB.13-1 | OPEN | Confirmed open — `IpEmailThrottle` still in-memory; prod wires `rhema:redisUrl` → **STB.2** (topology assess + Redis counter impl). |
| D-PRB.13-2 | OPEN → **DONE** | Self-serve legs landed on prod for `01M2V3PM0W…`: `signup.completed` analytics, `account(provider_id='google')`, `email_verified`, Stripe grants ×2. |
| D-PRB.16-4 | PARTIAL | Stays PARTIAL — scheduling AND consumption now proven (5 `gate.expiry` jobs completed at `deadline_at` on gate `01M2TNKY14HSP3ESJH8Y1NK8HW`); residual = an expiry firing on a *live* gate driving a real cancel transition → **STB.3**'s review-quick leg. |
| D-PRB.21-1 | (DONE-first) → **DONE** clarified | Stays DONE (`01M36663…` delivered under the derived cap); residual pricing-model question is new scope — rides STB.3's metered-vs-committed data. |
| D-P1.01-1 | OPEN | Confirmed open (P1 code not deployed; prod is PRB.25-era) → **STB.2** deploy-verify, $0. |
| D-P1.01-2 | OPEN | Confirmed open → **STB.2**. |
| D-P1.03-1 | OPEN | Confirmed open → **STB.2** (the WSS verify). |
| D-P1.04-1 | OPEN | Confirmed open → **STB.2**. |
| D-P1.04-2 | OPEN | Confirmed open → **STB.2** (small code leg — the `project.purge` enqueue call-site — + sweep verify). |
| D-P1.05-1 | OPEN | Confirmed open → **STB.2** (read-only asserts over already-delivered runs). |
| D-P1.06-1 | OPEN | Confirmed open → **STB.2**. |
| D-P1.07-1 | OPEN | Confirmed open → **STB.2** (over the delivered dossier). |
| D-P1.08-1 | OPEN | Confirmed open → **STB.2**. |
| D-P1.09-1 | OPEN | Confirmed open → **STB.2** (migration 0032 applies at the STB.1 deploy). |
| D-P1.10-1 | OPEN | Confirmed open → **STB.3** (bounded Draft run; also exercises the D-P0.15-3 gate-edit residual). |
| D-P1.11-1 | OPEN | Confirmed open → **STB.3** (one real chat turn + one `research_burst`). |
| D-P1.12-1 | OPEN | Confirmed open → **STB.3** (one real promotion ≤$3). |
| D-P1.13-1 | OPEN | Confirmed open → **STB.3** (one real visualize ≤$3). |
| D-P1.14-1 | OPEN | Confirmed open → **STB.3** (one instrumented Full Profile ≤$15). |
| D-P1.15-1 | OPEN | Confirmed open → **STB.3** (≤$5 ingestion leg). |
| D-P1.16-1 | OPEN | Confirmed open → **STB.4 Leg A** (real-money Stripe round-trip; operator hard gate). |
| D-P1.17-1 | OPEN | **HUMAN** (H5 decides the showcase essay). |
| D-P1.17-2 | OPEN | Confirmed open → **STB.2** (deploy-verify + Lighthouse/axe). |
| D-P1.18-1 | OPEN | Confirmed open → **STB.2** (export job + account-zip legs, $0 inference). |
| D-P1.19-1 | OPEN | Confirmed open → **STB.3** (live notify/badge/quiet-hours legs ≤$10). |
| D-P1.19-2 | OPEN | Confirmed open → **STB.2** (~375 px smoke, $0). |
| D-P1.20-1 | OPEN | Confirmed open → **STB.2** (settings legs on a throwaway account, $0). |
| D-P1.21-1 | OPEN | **HUMAN** (H4 — real venue-table `verified_at` stamps). |
| D-P1.21-2 | OPEN | Confirmed open → **STB.3** (protocol seed + one bounded Memo ≤$15). |
| D-P1.22-1 | OPEN | Confirmed open → **STB.2** (small instrumentation code legs, land-if-small else keep open). |
| D-P1.22-2 | OPEN | Confirmed open, split → **STB.2** (SLO dashboard / usercontent headers / backup+PITR / pause-transport asserts) + **STB.3** (injection-control smoke + playbook drill). |
| D-P1.22-3 | OPEN | **HUMAN** (external procurement) → **STB.4 Leg B** produces vendor artifacts + triages findings. |

## Tally

- **Starting non-DONE (at `145ff7b`): 81** rows (72 OPEN + 9 PARTIAL).
- **Closed to DONE this pass: 13** — D-P0.01-3, D-P0.03-1, D-P0.15-2, D-P0.15-5, D-P0.15c-1,
  D-P0.15f-1, D-P0.15f-2, D-P0.15h-2, D-P0.15h-4, D-P0.15i-1, D-PRB.01-3, D-PRB.10-1, D-PRB.13-2.
- **Sharpened to PARTIAL: 9** — D-P0.15b-2/-3/-4, D-P0.15c-3/-5, D-PRB.01-1, D-PRB.03-1,
  D-PRB.04-1, D-PRB.07-1 (each names its residual + owner).
- **Confirmed open with owner: 59** — mapped below.
- **DONE-first rows re-annotated** (status stayed DONE; stale "OPEN for live" prose discharged or
  honestly qualified): D-P0.07-5, D-P0.08-2, D-P0.10-2, D-P0.11-1, D-P0.15c-6/-7/-8,
  D-P0.15d-3/-4, D-P0.15e-1/-2/-3/-4, D-P0.15h-8, D-P0.15i-2, D-P0.15k-1, D-PRB.21-1.
- **Final file state: 146 rows — 76 DONE, 14 PARTIAL, 54 OPEN, 2 ACCEPTED-SKELETON.**
  Every non-DONE row now carries an owner (STB.1–4, HUMAN, ops, evals program, or a named
  future-ticket/structural note). No row was deleted; no row was closed on code existence alone.

## Remainder map (the genuinely-open 68)

- **STB.1** (merge/deploy/smoke): D-P0.15b-1 (`pr-test` full-stack residual) + the two
  ACCEPTED-SKELETON infra-hardening audits (D-P0.01-4 turbo cache, D-P0.01-6 subnet sizing).
- **STB.2** ($0 read-only verifies): D-P0.08b-2, D-P0.08b-3, D-PRB.01-1 (invite leg),
  D-PRB.03-1/-2/-3, D-PRB.04-1, D-PRB.11-2, D-PRB.13-1, and the P1 UI/read-only rows
  D-P1.01-1, D-P1.01-2, D-P1.03-1, D-P1.04-1, D-P1.04-2, D-P1.05-1, D-P1.06-1, D-P1.07-1,
  D-P1.08-1, D-P1.09-1, D-P1.17-2, D-P1.18-1, D-P1.19-2, D-P1.20-1, D-P1.22-1; plus the read-only
  half of D-P1.22-2 and the code leg of D-PRB.04-2.
- **STB.3** (bounded live legs ≤$120 combined): D-P0.03-2, D-P0.03-3, D-P0.09-3 (opportunistic),
  D-P0.15-3 residual, D-PRB.02-3, D-PRB.16-4 residual, D-P0.15h-5 (verify half; construction
  needs a P-series fix ticket first), D-P1.10-1, D-P1.11-1, D-P1.12-1, D-P1.13-1, D-P1.14-1,
  D-P1.15-1, D-P1.19-1, D-P1.21-2, and the injection/playbook half of D-P1.22-2; the
  D-PRB.07-1 browser-edit click-through is human-attended during STB.2/STB.3.
- **STB.4** (real-money/external, operator-gated): D-P1.16-1 (Leg A Stripe round-trip),
  D-P1.22-3 (Leg B pen test), D-PRB.08-1 residual (Leg C admin-key usage reconcile);
  D-P0.06-3's compensating controls are exercised by Leg B but the row itself is an ops
  re-deferral.
- **HUMAN-owned (cannot close here):** D-P0.13-3 (H2), D-PRB.02-2 (H2), D-PRB.01-2 (H3),
  D-P0.15-4 (operator budget), D-P1.17-1 (H5), D-P1.21-1 (H4), D-P1.22-3 (procurement decision);
  D-PRB.07-1's residual is a human click-through.
- **Non-STB construction/evals rows (named, not silently dropped):** D-P0.12-3 (matcher/rubric
  tuning follow-up), D-P0.13-1, D-P0.13-4, D-P0.13-5, D-P0.14-1, D-P0.14-2, D-P0.14-3,
  D-P0.15c-4 (all the evals program / H2 corpus dependency), D-P0.15d-2 (structural — no honest
  caller for `refundPhases` today), D-P0.15h-5 (needs a P-series fix ticket before its STB.3
  verify). The four roll-up PARTIAL rows (D-P0.15b-2/-3/-4, D-P0.15c-3/-5 — five rows) resolve
  when their named residuals resolve.

## Deviations / notes

- D-PRB.16-4 stays PARTIAL rather than DONE on purpose: expiry-job scheduling and consumption
  are proven, but an expiry that *transitions* a live gate to cancelled was never observed
  (the fixture run was already operator-cancelled). That residual is exactly STB.3's job.
- D-P0.15-2's leading status is DONE because both substantive halves (fold machinery live on all
  four workflows + the cross-check finding recorded) are discharged; the "which figure is
  authoritative" question is a product/accounting ruling (D-PRB.16-5 precedent), not a missing
  leg.
- P1-era rows were NOT closed on branch-code evidence: prod is PRB.25-era and the P1 chain is
  undeployed; they are confirmed open under STB.2/STB.3/STB.4.
- No secrets were written to any surface; spend $0; no code changed.
