# BACKLOG — human-readable view

**Reconciled 2026-10-10 by SPAREC.1** (`stevevitali/sparec-1-backlog-readiness`) — the round-4 tail
pass, stacked on `stevevitali/spacap-3-capstone-closure` (`d5e5a3a`). Round-3 rows BL-01..BL-79 are
preserved verbatim except two validator-forced source-cell dedups (BL-78, BL-79 — recorded below);
round-4 rows are **BL-80..BL-84**, appended only. The machine form is `BACKLOG.csv`; every gathered
source id (DEFERRALS `OPEN`/`PARTIAL` rows, coverage-matrix `PARTIAL`/`MISSING` rows, and every live
ADR revisit trigger) appears in exactly one `sources` cell. `check-backlog.sh` result: **465
expected sources — complete + non-duplicating + verdict-consistent**.

## Matrix sums (recomputed 2026-10-17 by R5REC.1, 752 rows)

`check-backlog.sh` verdict — **368 expected sources: complete + non-duplicating +
verdict-consistent** (was 25 issues on entry; all repaired, detail in `readouts/R5REC.1.md`).

| Measure | Count |
|---|---|
| Engineering closed (MET + MET-DIFFERENTLY + MET-ENGINEERED) | **591 / 752** |
| Requirement satisfied (MET + MET-DIFFERENTLY only) | **573 / 752** |
| MET-ENGINEERED | 8 |

The six `met-with-owed-leg` stale verdicts were re-verdicted `MET-ENGINEERED(D-…)` this pass
(REQ-FND-5/6/7/8 + REQ-G1-4 → `D-CAP.2-1`; REQ-OPS-5 → the five OPEN preview/post-tip legs);
`REQ-ED-17` re-verdicted up to `MET` — D-SPA.25-1's T17 leg discharged green on pr-186
(VERIF.2). Prior round-4 sums (2026-10-10, 666 rows): eng 513, req 511 — superseded.

## Reconcile sweep — 2026-10-17 (R5REC.1)

**Status-cell normalization (REQ-MEM-1, zero-zombie sweep):** twenty DEFERRALS rows whose
leading token mis-stated the dated tail got a dated prepend preserving the original cell
verbatim (`Original cell:` convention — append-only). 16 → `DONE` on committed evidence
(D-OPS.1-2, D-MAINT.6-1, D-CAP.1-2, D-P0.06-3, D-P0.01-4, D-SPA.12-1/-13-1/-14-1/-15-1/
-17-1/-18-1/-19-1/-21-1/-22-1/-23-1/-25-1 — all ratified by their VERIF.1/VERIF.2/OPS.2/SEC.3
dated tails); 4 → `PARTIAL` where the tail records code-half-landed + live-leg-owed
(D-STB.5b-4 → D-FIX.1-3, D-STB.5b-5 → D-FIX.1-3, D-CAP.1-1 → D-CAP.2-2, D-P1.04-2 → the +30d
clock leg). Nothing was silently dropped; every not-reached obligation stays OPEN/PARTIAL with
its named carrier. New checker read: **DONE 193 · OPEN 68 · PARTIAL 29 · WONTFIX 41**.

**Backlog rows this pass:** BL-85 (new — BL38.1 residue: `prod:d5a74cc` stamp delete +
tombstoned-project purge verify at ~2026-10-30), BL-86 (new — REQ-G1-5's H8 operator-session
bundle, PARTIAL: 1/~12 items done). Sources appended into existing rows: BL-24 (D-R5OPS.1-1
first-finding cohort measure + D-R5OPS.1-2 CDN signed-URL repair + REQ-OPS-3), BL-29
(D-COST.1-1/-2/-3 + REQ-COST-5 — COST.1's billed-actuals/p95/out-of-class lever residuals),
BL-36 (REQ-OPS-7 — the nightly-golden driver, `GD-R5OPS.1-1` AWAITING), BL-74 (REQ-OPS-6 —
first scheduled-nightly green is merge-dependent), BL-05 (REQ-MEM-6/7/8 — spec amendments
routed to R5REC.2).

**ADR revisit-trigger sweep 2026-10-17:** ADR-104..109 states unchanged from the 10-10 read
(quiet); the only newly-fired trigger is **ADR-110's** round-5 economic posture — the executed
COST.1 levers landed inside the authorized class, the out-of-class set stays parked on BL-29.
No superseded ADRs.

**Correction 2026-10-17 (R5REC.2):** the "ADR-110" in the sweep line above was a
misreference — at that commit ADR-110 did not exist; the economic-posture trigger is
**ADR-082** (measured cost posture). ADR-110 is this run's new record — the delegated
click interceptor — and joins BL-84's watch set. (Same misreference stands in
`docs/build/runs/R5REC.1.md` — run ledgers are append-only; this note is the correction.)

**Round-4 + upstream rows unchanged:** BL-01..BL-84 preserved; the round-5 additions are
BL-85/BL-86 only.

**Verdict-consistency repair (this pass, ADR-109):** `check-backlog.sh` flagged two `MET` rows
citing OPEN legs (`met-with-owed-leg`). The honest BM-VERDICT-01 verdict —
`MET-ENGINEERED(D-…)` — existed in the documented grammar but the in-repo gate
(`check-coverage-matrix.test.mjs`) still enforced a pre-parameterized five-bare-value set, which is
exactly what forced MAINT.3's dishonest `MET` revert on REQ-SPEC-31. The gate now validates the
full grammar, and both rows carry their honest verdicts: `REQ-SPEC-31` →
`MET-ENGINEERED(D-RES.1-2)` (N6 dossier leg rides the funded window), `REQ-ED-17` →
`MET-ENGINEERED(D-SPA.25-1)` (T17 preview leg rides the Resend-secret unblock). Requirement
satisfied drops to the honest **511/666**; engineering closed is unchanged at 513.

## Status-parse audit (checker-canonical read)

The checker tokenizes each DEFERRALS status cell on `[^A-Z-]` and reads the *first canonical
keyword anywhere* (`OPEN|PARTIAL|DONE|WONTFIX|ACCEPTED-SKELETON`). 2026-10-10 read: **DONE 116,
OPEN 168, PARTIAL 35, ACCEPTED-SKELETON 1** — 203 owed rows, every one homed on an open backlog row.
`D-OBS.1-3` was invisible to the gather (a literal `|` inside `cells[rig|tier|toggles]` truncated
the last-cell read); a dated status-hygiene note restores a canonical `OPEN` at the cell tail and
its single home is BL-74. `D-P0.06-3`/`D-P0.08b-3` stay carried on BL-02 — mid-text `open` tokens
the validator can never move past (REC.1 precedent: dated notes, not rewrites).

**Closed vs carried this pass:** nothing flipped — the run was offline-only at $0 with no deploy
and no operator secret; every owed row is carried with an unchanged status and a named unblock.
(D-SPA.28-2 closed in its own ticket's pass — recipe amendments applied at SPA.28.)

---

## Rows by landing

### Round-4 activation (the new spine — ordered)

| Row | Owes | Sources of note |
|---|---|---|
| BL-81 | **The 15-segment bottom-up activation cadence** (SPACAP.2 runbook §3.1): per-surface prod legs — markers/inert-escape curls (`D-SPAF.*-1`), per-flip `--expect-renderer spa` journey legs (`D-SPAF.*-2`), rollback-arm verifies (`D-SPAF.*-3` — `git revert` + redeploy is the arm; no flag exists post-SPA.28), nightly-green bakes (`D-SPAF.*-4`, REQ-SEQ-10) — plus cleanup-wave entry gates `D-SPA.26-1/-27-1/-28-1` | 59 sources — all 56 `D-SPAF.*` + the three cleanup gates; landing: runbook §3.1 |
| BL-82 | **Post-tip composed verification** (SHA-matched only): full suite `--expect-renderer spa` (D-SPACAP.2-1), two-tenant BFF probe (D-SPACAP.2-2), public-SSR regression diff vs committed baseline (D-SPACAP.2-3 — baseline captured green 2026-10-10), zero-CSP walk (D-SPACAP.2-4), G2-fix live leg (D-SPACAP.3-1), MAINT.4 OAuth legs (D-MAINT.4-1) | 6 sources; landing: deployed tip after segment 15 |
| BL-80 | **Non-prod Resend secret + preview legs**: operator seeds `rhema-nonprod-resend-api-key` in `rhema-507501` (NOT_FOUND on every probe through SPA.25) → `preview-stack.mjs` + CI images → session mint (D-MAINT.6-1 — flips D-OPS.1-1 + D-SPA.6-1), all `D-SPA.*-1` preview two-legs + `D-SPA.25-1` (T17), all `D-SPA.*-2` preview drills (23-2/24-2 mooted by the flag deletion — revert+redeploy survives) | 29 sources; landing: operator secret seed |
| BL-83 | **GATE-ACCEPT.SPA signed deviations** (status `accepted`, tracking not gate-blocking): REQ-VFY-8 (flip procedure amended after deletion), REQ-SEQ-9 (flag-off parity legs unexecutable), REQ-VFY-10 (free steps stay `expected:"red"` — ready-to-flip inside BL-82's run), REQ-VFY-6 (journey axe leg owed), REQ-SEQ-7 (rollback drills never live), REQ-SEQ-10 (nightly pacing unproven until deploys) | 6 PARTIAL matrix rows; re-verifiable arms ride BL-81/82 |
| BL-84 | **ADR revisit watches**: ADR-104 (G2 deferred), ADR-105 (G3 early-PROCEED), ADR-106 (TanStack+Vite binding), ADR-107 (forever-SSR island set), ADR-108 (showcase twin handoff), ADR-109 (verdict grammar), ADR-110 (delegated click interceptor — 2026-10-17, R5REC.2) | 7 sources; standing sweep |

### Operator rulings & operator-held deploys (the binding constraints on launch — unchanged)

| Row | Owes | Sources of note |
|---|---|---|
| BL-01 | Integrate round-2 + round-3 + round-4 stacked PRs; diff deployed tree vs merged main (prod runs unmerged code — now also pre-chain by 150+ commits) | X-prs-48-80-unmerged; X-prod-tree-vs-main-diff — landing **REC.3**; the round-4 chain folds into the same bottom-up merge (BL-81) |
| BL-13 | Unit-economics/pricing ruling: ~$7–10 metered per quick review vs $20/mo plan; metered-flip + paid-account notice | D-PRB.21-1, ADR-038, X-unit-economics |
| BL-29 | Billed-actuals export confirm (D-OPS.2-1, D-COST.1-1) + import_preview_p95 re-probe (D-COST.1-2) + out-of-class levers: worker right-size + GKE/SQL/proxy/Redis/HA (D-COST.1-3, REQ-COST-5 soak spec) + warm-floor/HA levers (D-OPS.2-2); measured $285.80→$198.32 list (update 151) vs ~$50 target | ADR-010, ADR-082 |
| BL-30 | Refund-window go-live ruling (D-DEF.4-3) + R9 refund journey leg (D-DEF.4-1) | ADR-024/071/072 |
| BL-50 | `GD-ACT.1-1` everyone-flip ruling (D-ACT.1-3) + ASN/IP risk-scorer binding (D-ACT.1-1) | ADR-019/042/043, REQ-GROWTH-10/-15 |
| BL-51 | `GD-BILL.3-1` re-open ruling + real-money/hosted Portal/pending-email legs (D-BILL.3-1/-2) + OBS.1 fixture re-point | ADR-027/028/029, REQ-BILL-14, REQ-BETA-15 |
| BL-67 | `pulumi up` CITE.1 pins (D-CITE.1-1) → probe legs L1/L2/N11 + ADR-086 rate read (D-CITE.1-2..5) | REQ-IDE-25, ADR-006/083–086 |
| BL-68 | Metered-debit flip + notice; cap calibration on durable store (D-ECON.1-3); unmeasured cells (D-ECON.1-4); Quick findings cap (D-ECON.1-2) | REQ-BILL-7, REQ-SPEC-32, ADR-005/014/031–036/038 |
| BL-69 | `pulumi up` ECON.2 (D-ECON.2-1) → lever pairs + refit + REQ-SPEC-8 restore re-check | OF-econ2-restore-read, ADR-087 |
| BL-71 | `pulumi up` → 21 paid registry steps + paid journey (D-CAP.2-1), full JOURNEY.1 suite (D-CAP.2-2), CAP.3 live legs (D-CAP.3-1), phone-44px re-proof (D-CAP.2-3); the CAP.2-routed PARTIAL rows | REQ-ACCT-3, REQ-DATA-20, ADR-020/088/089 |
| BL-75 | `GD-RES.2-1` retro refund/relabel ruling + zero-coverage scan + fact_check label extension | ADR-025/026 |
| BL-79 | RES.3 research-budget retry-drain fix (ledger-skeleton-first + budget-aware retry gate) — **sources dedup'd this pass**: ADR-021/ADR-024 stay homed on BL-56/BL-30 | D-RES.3-1, X-res3-leg1a-retry-drain; REQ-SPEC-31 |

### Round-4 funded window (weekly guard; unchanged from the 10-04 read)

| Row | Owes |
|---|---|
| BL-07 | Named SLO breaches D-SLO.1-5/-6/-7/-8 |
| BL-16 | Skill-input pin legs B16 |
| BL-17 | Engine-invariant legs B17 + ADR-094 |
| BL-18 | Fetch-policy legs B18A/B + REQ-ARCH-21/REQ-SPEC-25 |
| BL-19 | Workflow-gate/finalize legs B19A/B |
| BL-21 | Dossier headless legs T11–T13 |
| BL-22 | Residual account/export legs + clock legs (T8, T7 bounded probe) + ADR-103 |
| BL-25 | D-OPS.1-1 (non-prod signed-in legs — now concretely gated on BL-80's Resend secret + preview stack), D-OPS.1-2, D-OPS.1-3 + ADR-077–080 |
| BL-31 | Matcher-3 floor tuning + rubric conjunct (needs H2 data) |
| BL-56 | RES.1 residual legs (D-RES.1-1..3 — N6 gates REQ-SPEC-31's MET-ENGINEERED → MET flip) |
| BL-66 | Stale claim-ledger mount live re-verify |
| BL-72 | Spend-guard integrity: live re-proof + system-role binding convention (D-STB.5b-1, ADR-093) |
| BL-78 | MAINT.3 funded-window repairs' **live legs** on the deployed tip + the N9 reseat prod write (operator-paused) — **sources dedup'd this pass**: D-OBS.1-3's single home is BL-74; the reseat arm stays in this row's title scope |

### HUMAN gates (operator-held prerequisites — unchanged)

| Row | Needs |
|---|---|
| BL-20 | Thread-local question-routing product ruling — **H7 ruling + ≤$5** |
| BL-23 | Real prod invite consumed by a live signup — **H7** |
| BL-24 | Canary-injection pause smoke, alert-channel page, CDN signed-URL headers + the R5OPS.1 residuals (CDN signed-URL repair D-R5OPS.1-2, organic-cohort first-finding measure D-R5OPS.1-1, REQ-OPS-3) — **H7** |
| BL-86 | **H8 operator-session bundle** — 1/~12 items done (Resend seed DONE); merge sweep + the operator-held rows stay owed (REQ-G1-5) — **H8** |
| BL-32 | Interactive browser/device legs + Safari/WebKit N8 CSP walk — **H7, $0** |
| BL-33 | Live-mode Stripe re-verify — **H7, ≤$50 real money** |
| BL-34 | Real admin/org-scoped key → usage.reconcile — **H7** |
| BL-35 | External pen-test procurement + triage — **H7, money** |
| BL-36 | Nightly golden run + score-floor gate + the fail-closed driver (REQ-OPS-7) — **H7, ~$150–300/night; `GD-R5OPS.1-1` AWAITING** |
| BL-37 | Cross-tenant exposure-window review + disclosure — **H7** |
| BL-39 | H3 partner-program deferred scope — **H7** |
| BL-40 | H2 corpus — **H2, ~$100 k** |
| BL-41 | H4 venue-table real `verified_at` stamps — **H4** |
| BL-42 | H5 showcase essay + dossier sign-off — **H5** |

### GATE-G2 (hard gate before public launch / §16.4 claims — unchanged)

| Row | Owes |
|---|---|
| BL-43 | Live eval-program bindings |
| BL-44 | Pilot wave on real variance |
| BL-45 | G2 wave-1 LIFT read |

### Reconcile / docs tail

| Row | Landing |
|---|---|
| BL-02 | round-4 + upstream `agent-skills` patch — validator-stuck status cells (D-P0.06-3, D-P0.08b-3; D-OBS.1-3's embedded-pipe truncation now joins the class), check-backlog parser, PHASE-LOG rotation |
| BL-05 | **R5REC.2** — fold G2/G3/H3 overrides + ADR deviations into the spec + land REQ-MEM-6/7/8's spec amendments |
| BL-06 | **closed 2026-10-20 (R6ENG.1 census §5 disposition)** — DOC.1 #114/`20e29ec` (incl. the phase1-exit-readout dated correction), DOC.2 #115, tail refresh R5DOC.1 #193 + R5DOC.2 #194 all landed green |
| BL-87 | **closed 2026-10-20 (R6ENG.1)** — `settled()`/`SETTLE_TIMEOUT` + `data-mounted` gates on all 15 router-mount dom tests + the `*After` posts-gating root cause; verify clause met: two consecutive green CI unit legs (runs 39465573137 + 39472603332) + 25/25 local |
| — | **R5REC.2** (next in chain) — whatever the ledger's `nextTicket` names after this pass |

### Watch rows (per-trigger, evaluated at each sweep)

| Row | Scope |
|---|---|
| BL-47 | GATE-ACCEPT standing triggers (ADR-001/002/003/011/013/015/016/017) |
| BL-76 | Product/UX-surface triggers (ADR-044–052, 059–061, 063–070, 099, 102) |
| BL-77 | Infra/security/process triggers (ADR-040, 073–076, 081, 090–092, 098, 100) |
| BL-84 | Round-4 + retro-fitted triggers (ADR-104–109; +110 added by R5REC.2) — **added this pass** |

### Accepted / time-based / spec-scheduled

| Row | Note |
|---|---|
| BL-46 | G3 early read on zero partner data — ACCEPTED 2026-09-23 |
| BL-74 | OBS.1 evidence windows: 24 h soak + first nightly JOURNEY.1 on deployed SHA (**D-OBS.1-3 — now sole home**; still owed: reseat write + clean N4/N9 sweep) + N4 selector-drift fix + ADR-053 + REQ-OPS-6 (first scheduled-nightly green is merge-dependent) |
| BL-85 | BL38.1 residue — `prod:d5a74cc` short-sha stamp delete (operator write) + tombstoned-project purge verify ~2026-10-30 — **added this pass** |
| BL-73 | 33 MISSING spec-scheduled 1.x/Later rows + REQ-OBJ-9/-14 — REC.2 confirms the schedule |
| BL-83 | GATE-ACCEPT.SPA's eight signed deviations → the six PARTIAL matrix rows (status `accepted`) — **added this pass** |

### Closed (landed — record only)

BL-03, BL-04, BL-08..BL-12, BL-14, BL-15, BL-26..BL-28, BL-38, BL-48, BL-49, BL-52..BL-55, BL-57..BL-65
(BL-38 closed 2026-10-15 — BL38.1 prod residue cleanup: draft v7 + `prod:82179e1` deleted live,
review account + LAD projects already hard-deleted by the scheduled pipeline; findings
`prod:d5a74cc` + the row-5 purge verify → D-BL38.1-1/-2).

---

## Themes

1. **Everything owed is one of three unblocks.** Round 4 distilled the tail to: (a) the operator's
   ordered merge/deploy cadence (BL-81 → BL-82, the whole live-verification tail), (b) the
   `rhema-nonprod-resend-api-key` seed (BL-80 + BL-25's preview legs), and (c) the unchanged
   funded-window/rulings/HUMAN path (BL-01..BL-79). Nothing is silently owed — every one of the
   203 checker-parsed owed rows has a named home, owner class, and unblock.
2. **Rollback changed shape mid-flight.** SPA.28 deleted the flag machinery, so every rollback
   recipe written against `rhema:spaSurfaces`/`?ssr=1`/`x-rhema-renderer` is either inert or
   re-armed as `git revert` + redeploy (D-SPA.28-2's amendments, BL-81's arm, BL-83's REQ-SEQ-7/-9).
   The ops runbook carries the post-migration procedure (`infra/PROD-BRINGUP.md` §13).
3. **Forced SSR is a code verdict.** Phone UA and `showcase: true` (BFF twin, ADR-108) force SSR at
   the request path; the SPA mirrors via `twinForcesSsr`. No configuration can flip it — which is
   the posture REQ-SEQ-9's accepted deviation records.
4. **Deterministic ≠ live.** The whole round-4 stack is test-pinned but prod-verified nothing:
   provenance is honestly pre-chain (web `6ebb1cb`, api `0acd16d`), `/bff/app` 404s, markers are
   absent. BL-82 holds every live leg behind `check-deploy-provenance` on the tip.
5. **The grammar drift is repaired.** The in-repo matrix gate now validates BM-VERDICT-01's
   parameterized verdicts (ADR-109), so an owed leg can never hide inside a `MET` row again —
   `met-with-owed-leg` is structurally prevented, not just checked for.
6. **Build-memory hygiene is real debt.** Validator-stuck cells (D-P0.06-3, D-P0.08b-3,
   D-OBS.1-3's pipe-truncation class) stay on BL-02 — dated notes, never rewrites, under
   append-only rules.

## ADR revisit-trigger sweep — 2026-10-10

Same rule as the 10-04 sweep: every `## Revisit trigger` read; **quiet** / **fired-answered** /
**dormant**; no fired-unanswered, no superseded ADRs. The ADR-001..ADR-103 states are unchanged from
the 2026-10-04 read except where a round-4 landing answered one — called out below the new rows.

| ADR | State | Evidence read |
|---|---|---|
| ADR-104 | quiet | No H2 corpus; no §16.4 claim proposed; no launch proposal — G2 stays deferred (BL-40/43/44/45) |
| ADR-105 | quiet | No partner telemetry; H3 dormant (BL-39); margin ruling still operator-held (BL-13) — REQ-BETA-18's window stays skipped (BL-46 accepted) |
| ADR-106 | quiet | Hybrid split intact — public funnel stays SSR (BL-82's D-SPACAP.2-3 regression proves it), BFF stays in `apps/web`, TanStack maintained |
| ADR-107 | quiet | Forced-SSR Page family unchanged — `page`/`ide` islands retained; `outline` retired as recorded |
| ADR-108 | quiet | Forced-SSR surface is still exactly `phone \|\| showcase`; the twin-flag shape holds — G2 fix verified in-repo, live leg on BL-82 |
| ADR-109 | quiet | No BM-VERDICT-01 vocabulary change; grammar gate green with the two re-verdicted rows |

Round-4 resolutions of older triggers (fired-answered since the 10-04 read): **ADR-012** — the
auth'd surfaces DID move to client-owned rendering (the SPA shell supersedes its Hono-SSR premise;
the lineage is ADR-106's amendment of ADR-007/012 — carried on BL-05 for REC.2). **ADR-096** — the
exercised-surface leg rides BL-82's composed run instead of the round-3 window. Every other row in
the 10-04 sweep table stands as written.

## Risk-register review — 2026-10-10

The project maintains **no standalone risk register**; the live risk surfaces are the LEDGER **OPEN
FINDINGS** list and `docs/security/`. Round-3 surfaces unchanged and still homed (BL-01/07/20/35/37/
38/51/67/69/72/74); the round-4 additions:

| Open finding / risk surface | Home |
|---|---|
| Wrong-order activation jumps all-SSR→all-SPA with flag rollback already deleted | BL-81 (15-segment cadence + Arm B fallback in runbook §3.1) |
| Post-cleanup rollback is revert+redeploy, never exercised live | BL-83 (REQ-SEQ-7 accepted) + `infra/PROD-BRINGUP.md` §13 recipe |
| `rhema-nonprod-resend-api-key` NOT_FOUND — every preview leg blocked | BL-80 (+BL-25's D-OPS.1-1) |
| All round-4 claims deterministic-only until the tip deploys | BL-82 (SHA-matched provenance gate) |
| Six verification-coverage gaps signed but not re-verifiable | BL-83 (accepted) |
| `MET`-row cites-an-OPEN-leg class could recur | ADR-109 grammar gate (closed in-repo this pass) |

Spec-register deferred rows: the 33 `MISSING` matrix rows are all spec-scheduled 1.x/Later scope —
parked on BL-73; REC.2 confirms the schedule during spec reconciliation.
