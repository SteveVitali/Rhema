# STB.3 — Bounded live-run legs (run ledger)

- **Ticket:** `docs/tickets/54_STB.3__bounded-live-run-legs.md` — the paid live legs, cheapest-first,
  each under its own cap, combined ceiling **≤ $120**. OPS ticket — no product code changed; every
  defect observed is recorded as a finding, not fixed-and-rerun.
- **Branch:** `stevevitali/p1-22-launch-checks` (docs/ops only — the deployed prod tree remains
  `f3c7e13`, tag `stb2`, from the STB.2 follow-up deploy).
- **Spend headline:** committed ledger debits **451cr ($4.51)** · metered proxy burn **1,304cr
  ($13.04)** · SDK-side estimate/stream metering **601cr**. All far under the $120 ceiling.
- **Honesty note:** 8 of 10 launched runs ended `cancelled`/`failed`, mostly on three deployed
  product defects (§4). The ticket's stop-on-failure rule was followed — each dead leg is recorded
  here with its numbers; nothing was retried past its cap or quietly repaired.

## 1. Method

- Session: operator account's live session row via Cloud SQL IAP tunnel (`DB_URL` in `/tmp`, never
  committed); authed API calls through `integration/.scratch/api.mts` (newest prod session token →
  `__Host-rhema.session_token` cookie → `https://api.rhema.tools`); SSE via
  `integration/.scratch/sse.mts`; DB reads via `integration/.scratch/q.mts`; pod logs via `kubectl`
  on `gke_…_rhema-prod-run-task-gke-c13cb80` (us-central1-a, namespace `runs`); Cloud Logging via
  `gcloud logging read --project=rhema-507501`. Scratch helpers are untracked, not committed.
- Funding: house grant `01M3DC0S4E8ZEV6DBAPVCFREHD` — **12,000cr promo** (`source:admin`,
  `reason:house_credit`, 2026-09-25T22:47:16Z). A system `included:writer` grant of 2,000cr also
  landed at 00:05:21Z (entitlement, not operator spend).
- Every leg's committed figure is the `credit_ledger` `debit` rows; the metered figure is
  `usage_records{source:'proxy'}` (≈ `runs.spent_credits` after `reconcileRunSpend`). They are
  reported separately per leg, per the ticket's rules — the divergence is itself a finding (§4-F5).

## 2. Leg-by-leg disposition (cheapest-first per the ticket order)

| Leg | Run / evidence | Terminal state | Committed | Metered (proxy) | Cap (est) | Verdict |
|---|---|---|---|---|---|---|
| 1. Outline promotion (D-P1.12-1) | `01M3DC1VYGJXM1G36TAR9D7F8W` | cancelled | **0** | 231cr | 945 (630) | **cap-under death → F1**: repeated `missing or unparseable .rhema/phase-result.json`; stopped 23:23Z |
| 2. Figure (D-P1.13-1) | `01M3DE92NJDA0RQKYTSH8M6S5Q` | **completed** | **60cr** | 58cr (+sdk_stream 60) | 300 (7) | **DELIVERED** — all 4 phases (data→spec→render→caption); SVG + dark SVG + **PNG** render committed; provenance.json; `run_finished` inbox + email fired |
| 3a. Chat turn (D-P1.11-1) | `01M3DEKKVQACD56GBS5GACYCKS` | failed | **0** | 43cr | 40 (15) | `cap_reached` — metered 43 over cap 40; `fetch_log` carries 2 `deny reason=cap` rows (the proxy brake fired live) |
| 3b. Research burst (D-P1.11-1) | `01M3DETHZ8ENTRTSXH3SJ6Y2FW` | cancelled | **0** | 98cr | 765 (510) | **F1** — same missing phase-result defect; stopped 23:47Z |
| 4. Ingestion (D-P1.15-1) | connections/discovered_items rows | n/a | **180cr** (visual-PDF) | — | ≤500 | **PARTIAL** — see §3-L4 |
| 5. Quick Voice (D-PRB.10-1) | — | skipped | — | — | ≤500 | SKIP per ticket rules — row already DONE via RCN.1 evidence |
| 6. Draft (D-P1.10-1, D-P0.15-3 residual) | `01M3DGGCZR2CWV99FJTN19VD2T` | cancelled | **73cr** | 218cr | 1068 (712) | **F3** — died at `sidecar_validates:structure`: `structure-plan.json` missing `sections[].anchor.{blockId,startOffset,endOffset}`; `approve_plan` edit leg never reached |
| 7. Notifications (D-P1.19-1) | inbox_items + notification_deliveries | n/a | 0 | — | ≤1000 | **PARTIAL** — see §3-L7 |
| 8. Full Profile (D-P1.14-1) | `01M3DJ5V3D99NCC8JSZGTPM17P` | cancelled | **0** | 182cr (185 proxy) | 420 (280) | **F1** — same phase-result defect; `approve_sample` never opened |
| 9. Memo / user-source (D-P1.21-2) | `01M3DKQR0TY6ADGV2D1RTJBVG5` | cancelled | **114cr** | 438cr | 1083 (722) | **F2** — user-source legs proven (§3-L9); died at `second_read_producer_checked` — pod logs show the hook denies `Agent` in the judge-class phase while the predicate expects an orchestrator-launched producer query (`secondReadProducerQueryId:null`, `expectedProducerQueryId:null`); no dossier |
| 10. Launch bundle (D-P1.22-2) | pod logs, Cloud Logging, SLO rows | n/a | 0 | — | ≤1500 | **PARTIAL** — see §3-L10 |
| 11. Review re-verify / expiry (D-PRB.16-4) | `01M3DQ59XW90DYHWTRAMP3XT7P` | cancelled | **0** | 0 | 300 (7) | **DONE** — `confirm_cost` gate `01M3DQ59YHTWKEJCYS2Z3R0CAD` (deadline 02:05:38Z, `on_expiry:cancel`): stranded-sweep `gate_rearmed` log lines 02:02–02:05 → `gate.expired` → `resolved` → `run.state_changed(cancelled)` 02:05:41Z; `run_cancelled_recovered` inbox row landed (visible_at = resolution) |
| Side: phase pin (D-P0.03-3) | `01M3DK07CYZZXM4Y6CDBHKK0C7` | **completed** | **24cr** | 27cr | 300 (7) | `inputs.phase="0"` froze — committed **only** phase-0 artifacts (`00-data.md`, `data.csv`, `provenance.json`); `.rhema/phase-result.json` written; run stopped before spec/render/caption |
| Side: stop path | `01M3DQ4A1080YTNETWV5G4N11K` | cancelled | **0** | 6cr | 300 | operator stop mid-flight — 22s to terminal; `run_cancelled_recovered` inbox row ("Run was cancelled by the system") |

**Totals:** committed **451cr = $4.51** (12 debit rows: run debits 60+73+24+114 = 271cr + the 180cr
visual-PDF ingestion debit). Metered proxy **1,304cr ≈ $13.04** (526 usage rows). SDK-side metering
601cr (estimate 330 + stream 271 — the provisional-estimate/pre-flight telemetry, not a charge).
Cumulative exposure ≪ $120 ceiling. Per-run `hold`/`release` rows net cleanly (e.g. review: hold 1083
→ debits 114 → release 969; outline: hold/release 945; zero-spend figure: 300/300).

## 3. Detail per non-trivial leg

### L2 — Figure (the clean win)
`01M3DE92NJDA0RQKYTSH8M6S5Q`: created 23:26:45Z → completed 23:30:26Z. Four phases, committed
artifacts incl. render assets (`render.png` via the resvg path + SVG + dark SVG), `provenance.json`,
caption; `notification_deliveries` `run_finished` sent + inbox row. Estimate said 7cr, delivered at
60cr metered (8.6× under-estimate — feeds the pricing-model residual, D-PRB.21-1 note).

### L4 — Ingestion (D-P1.15-1)
Real production rows: `connections` paste / upload / `substack_export` all `state:ok`;
`discovered_items` `state:included`; authentic upstream behavior observed (Substack ≤1 rps per-host
rate limiting, one upstream 404 for platformer.news). One priced visual-PDF reconstruction debited
**180cr** (`credit_ledger` `source:'ingest.reconstruct.visual'`, reason "sample reconstruction
(visual)", 23:59:05Z). **Residual:** the AC-I-A re-sync dedup leg (second sync on touched
`updated_at` → zero new versions) was not exercised → row stays PARTIAL.

### L7 — Notifications (D-P1.19-1)
Live-verified tonight: `inbox_items` rows for **every** terminal transition — `run_finished`
(figure, 23:30 + 00:50), `run_failed` (chat, 23:34), `run_cancelled_recovered` ×6 (stops +
expiry-cancel — the expiry row surfaced with `visible_at` = resolution time); `notification_deliveries`
`sent` for `run_finished`, `run_failed`, `spend_gate` (the confirm_cost gate-open email, 02:02:01Z).
Earlier in the session: signed email action 303 → consumed → 410 on replay; a `/api/action` deep
link answered 404 (dead-link finding, §4-F9). **Residual (stays PARTIAL):** quiet-hours deferral
assert, a Decisions-row obligation transition, stale-voice group-3 row, badge/?gate= click-through.

### L9 — Memo user-source deny (D-P1.21-2)
Fixture: project `stb-3-memo-fixture` (`01M3DKP9JTTE29ZPRMNW9GK54R`) — upload → quarantine → real
convert Job (`conversion_pending` ~4 min cold start) → `quality:clean`, no warnings. Run
`01M3DKQR0TY6ADGV2D1RTJBVG5` froze `urlPolicy{userSourceDomains:["stb3-internal.example.invalid"],
fetchUserDataForbidden:true}` into run inputs. Proven live:
- **Mount:** pod file listing shows `user_sources/01-internal-risk-register.md` read-only inside
  `/work` (kubectl logs, pod `run-01m3dkqr…-a4`);
- **No transit:** `fetch_log` carries **zero** rows for the user-source host — the agent never
  attempted the fetch (the frozen policy was honored upstream of the proxy, so leg (b)'s
  deny-on-attempt/403/pause row is **unexercised**, not failed — `pause_signals` is empty);
- **Verdicts:** the committed `agents/editor/.rhema/01-claim-ledger.json` carries
  `verdict:"verified_against_user_source"`, `sourceCheck:"matches_citation"`, note "Matches
  user_sources/01-internal-risk-register.md verbatim ('Queue drain rated P2'). Checked against local
  file text only; the register's own URL was not fetched (fetchUserDataForbidden) and is not
  cited." — plus honest `unverifiable` verdicts where no source covered a claim.
The run then died at `second_read` on the **producer-query predicate** (F2) — intake/craft/
verification committed (34+32+48cr debits), no dossier delivered. Row stays PARTIAL.

### L10 — Launch bundle (D-P1.22-2)
- **(a) pod privsep — corroborated, not literal.** Run pods persist post-termination
  (`run-01m3dkqr…-a3/a4/a5`, `run-01m3dq4a…-a1`). Pod spec: `fsGroup:10001`, caps
  `SETUID/SETGID/SYS_ADMIN/SYS_CHROOT`, `readOnlyRootFilesystem`, SA `run-task-ksa` (the RBAC-bound
  launcher). Logs show the two-process privsep split (`[harness]` credential injector →
  `http://127.0.0.1:<port> → http://10.8.16.4:8443`; `[agent-entry]` phases) and **zero `setresgid`
  EPERM** — consistent with the agent running as uid 10002 after the `setpriv` drop (D-P0.15f-1's
  existing DONE stands; the entrypoint does not print a literal `uid=` line, so the assert stays
  indirect).
- **Hook enforcement live:** `[hook] Bash deny / — path escapes the sandbox root`, `Bash deny
  /dev/null`, `Glob deny /work/project — recursive operation over the root`, `Glob deny
  /work/project/agents — read outside the seat namespace`, `Agent deny second-reader /
  general-purpose — Agent calls are not permitted in a judge-class phase` — the seat/namespace
  boundary is enforced on the live pod.
- **(b) canary egress-denied→pause — NOT exercised.** `pause_signals` has 0 rows; no canary was
  planted. The only real egress denies were the SDK `/api/hello` probe hitting a non-allowlisted
  endpoint (28 rows across the night — F7).
- **(e) SLO drill — live.** `[slo] violation` entries reach Cloud Logging on a 5-min cadence on six
  signals (§5). The log-metric `rhema_slo_violations` + AlertPolicies are armed (STB.2); whether the
  alert *channel* paged is not asserted here.
- **(f)** first-finding ≤4 min — needs real signups; not measurable tonight.

## 4. LIVE FINDINGS (deployed product/accounting defects — new-ticket material, NOT fixed here)

- **F1 — Missing/unparseable `.rhema/phase-result.json` (seat/phase-result defect).** Killed the
  outline (`01M3DC1V`, 231cr metered), research_burst (`01M3DETH`, 98cr) and profile_voice
  (`01M3DJ5V`, 182cr) legs — ~511cr of platform-absorbed burn, 0 committed debit. The phase-result
  contract worked fine in other phases (second_read wrote a valid `{"status":"done"}`); the failing
  class appears to be the earlier seat phases of these workflows. **Needs a defect ticket.**
- **F2 — `second_read_producer_checked` can never pass on this build (memo review at least).** Pod
  logs across all three retries (`a3`/`a4`/`a5`): `[hook] Agent deny second-reader — Agent calls are
  not permitted in a judge-class phase`, then harness facts
  `{"secondReadProducerQueryId":null,"expectedProducerQueryId":null}` — the hook denies the agent's
  producer `Agent` call AND the orchestrator never launched/recorded an expected scoped query, so
  the predicate fails on every attempt. ~438cr metered across retries on one run; review delivery
  via the memo protocol is dead-ended on prod. (Earlier delivered review `01M36663…` under the
  default protocol succeeded — may be protocol-config-specific.) **Needs a defect ticket.**
- **F3 — Draft `sidecar_validates:structure`.** `structure-plan.json` was emitted without
  `sections[].anchor.{blockId,startOffset,endOffset}` — the produced sidecar does not validate
  against its declared schema → the run died (218cr metered / 73 committed). **Needs a defect ticket.**
- **F4 — `credit_balances.held = −897` on the `topup` bucket.** `GET` usage level-0 reports
  `heldCredits:-897` (spendable 15974, suspended false, clawbackDebt 0). The append-only
  `credit_ledger` nets cleanly per run (all holds released/debited), and the ledger-derived topup
  position (holds 9152 − releases 5670 − debits 3662 = −180) doesn't even match the counter — the
  denormalized `held` column has drifted (double-decrement or missing increment somewhere in the
  debit/release path). **Accounting finding → ticket;** spendable math currently unaffected because
  available and held are independent columns, but a negative hold is a lie.
- **F5 — Committed vs metered divergence on non-completed runs.** `runs.spent_credits` is reconciled
  to metered truth at terminal settle, but the ledger posts debits only at phase boundaries
  (≈ `sdk_stream`). Cancelled/failed runs therefore commit nothing of their in-flight burn: outline
  231/0, research 98/0, profile 182/0, chat 43/0, draft 218/73, review 438/114. Night-long total:
  **451 committed vs 1,304 metered** — platform-absorbed ≈853cr. This is the live driver of the
  `proxy_vs_sdk_cost_runs_over5pct_1h` SLO violations. Policy question (charge vs absorb on
  cancel/fail) + estimator transparency → the pricing-model residual on D-PRB.21-1 stays alive.
- **F6 — `estimate_cache` can never fill: seams unbound.** `buildApiDeps` (`apps/api/src/server.ts`)
  never binds `estimateCache` or `claimPrePass`, so every `POST /projects/:id/estimates` is
  `provisional:true` and no row is ever persisted — `estimate_cache` remains 0 rows after 10
  estimate calls tonight. D-PRB.03-1's "only new traffic populates it" premise is wrong — the write
  path is unwired on prod. **Binding defect → ticket.**
- **F7 — SDK `/api/hello` probe denied by the run allowlist (noise → real SLO trips).**
  `fetch_log`: `deny — endpoint api.anthropic.com/api/hello is not on the run allowlist` on every
  run (28 rows tonight). The proxy correctly enforced; the vendored SDK's health probe just isn't in
  the allowlist — but each deny counts toward `egress_denied_10m`, so the alert fires on healthy
  traffic. **Either allowlist the probe or exclude it from the denied-signal → ticket.**
- **F8 — SLO breaches observed (instrumentation working as designed):** `run_start_latency_p95_s`
  = **3080s** vs target ≤45s/alert >90s; `gate_resume_latency_p95_s` = **443s** vs ≤60s/>120s;
  `run_success_rate_24h_pct` = **66.7%** vs ≥95% (tonight's defect-killed runs dominate);
  `proxy_vs_sdk_cost_runs_over5pct_1h` (F5); `egress_denied_10m` (F7); `mirror_errors_10m` =1.
  Also `slo_samples.event_delivery_ms` p95 = **105,905ms** (max 176,814ms, p50 57ms, n=13) — the
  append→flush path is intact but p95 is dominated by quiet-period batch gaps. None of these are
  green; all are real measurements, not suppressed.
- **F9 — `/api/action` deep-link dead (observed in the notifications leg).** The signed action
  round-trip itself worked (303 → consumed → 410 replay), but the generic `/api/action` URL surface
  answered 404. Confirm the intended route or remove the link → ticket.
- **F10 — chat_turn cap overrun is small but real.** Metered 43 vs cap 40 — the proxy denied with
  `reason=cap` (2 rows) and the run died `failed` (cap deaths land `failed`, not `cancelled`), but
  ~3cr slipped past the clamp before the brake. Worth a line in the cap-enforcement ticket.

## 5. SLO / ops telemetry captured tonight (all real)

| signal | evidence |
|---|---|
| `slo_samples.event_delivery_ms` | n=13 — min 8ms, p50 57ms, p95 105,905ms, max 176,814ms |
| `slo_samples.autosave_save_ms` | n=1 — **328ms** on `POST /projects/:id/editor/:draftId/save` (draft v2 fork, `sync:"synced"`) |
| `[slo] violation` log entries | every 5 min: run_start p95 3080s, gate_resume p95 443s, success_rate 66.7%, proxy_vs_sdk>5%, egress_denied 2, mirror_errors 1 |
| `stranded-sweep` worker logs | `gate_rearmed` ×4 for gate `01M3DQ59YHTWKEJCYS2Z3R0CAD` (02:02:27→02:05:21) then `gate.expiry → resolved{cancel}` 02:05:41 + two `already_resolved` idempotent no-ops |
| `pause_signals` | 0 rows — quiet (no canary planted) |
| `estimate_cache` | 0 rows — see F6 |
| `credit_balances` | daily 0/0, included 2000/0, promo 11739/0, topup 2235/**−897** — see F4 |

## 6. Deferral dispositions (full detail in `docs/tickets/DEFERRALS.md`)

**Closed on tonight's evidence:** D-P1.13-1 (figure e2e incl. PNG render), D-P0.03-3 (phase pin —
proven for `phase:"0"`; the stop-after-N + phase-result contract is demonstrated; a mid-phase pin
skipping earlier phases is the same mechanism and is noted as a cheap residual), D-PRB.16-4 (live
deadline expiry → cancel transition + stranded re-arm), D-P0.08b-3 (instrumentation verified live —
the *values* are red and recorded under F8, not waived).

**Partials (named residual):** D-P1.11-1, D-P1.15-1 (AC-I-A re-sync owed), D-P1.19-1, D-P1.21-2
(deny-on-attempt leg unexercised + review delivery blocked by F2), D-P1.22-2 ((b) canary pause +
(f) signups owed).

**Still open (failed legs — defect-named, not waived):** D-P1.12-1 (F1), D-P1.10-1 (F3 +
D-P0.15-3 residual), D-P1.14-1 (F1), D-PRB.03-1 (F6 root cause), D-PRB.04-2a (browser EventSource
still unobserved — SSE transport+replay proven via `sse.mts`), D-P0.08b-2 (no second-subscriber
isolation leg), D-P0.03-2 (no absent-sidecar run launched — every prod run emits sidecars
unconditionally), D-P0.15-3 (approve_plan structured edit never reached), D-P1.07-1 (own-tenant
dossier still owed — the memo review produced none), D-P1.22-2(b)(f).

## 7. Acceptance check vs the ticket

- **AC1 — every leg attempted in order, terminal disposition:** outline→figure→chat→research→
  ingestion→(voice skipped per rules)→draft→notifications→profile→memo→launch-bundle→expiry —
  10 runs, all `completed`/`failed`/`cancelled`; ingestion + notifications + launch-bundle legs ran
  against live rows without runs of their own. ✔
- **AC2 — total spend ≤ $120:** committed **$4.51**, metered **$13.04** — reported per-leg and
  cumulative, committed and metered kept separate. ✔
- **AC3 — rows closed only on real evidence:** four rows closed (run IDs + artifact/event rows
  cited); every partial carries its failure mode or residual; every failed leg names its defect.
  No defect was repaired and rerun inside the ticket. ✔
