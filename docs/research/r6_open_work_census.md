<!--
  docs/research/r6_open_work_census.md — the post-round-5 residual-work census.
  Commissioned by the operator 2026-10-19→20: "if there's work left to do we should make sure it's
  fully accounted for and specced/researched/ticketed/etc. for a future orchestrate-build drive
  continuation." This file is a research artifact only: it edits no DEFERRALS cells, opens/closes
  no rows, and schedules no live action. Compiled 2026-10-20 from the chain tip d8bfebc
  (branch stevevitali/r6-planning-corpus off stevenvitali/r5doc-2-agent-docs-refresh).
-->

# R6 open-work census — every owed row, one accountable home

**Status of this document:** research corpus, unratified. The round-6 drive itself is drafted in
`docs/round-6-draft-spec.md` (**DRAFT — unratified — pending operator sign-off**) and decomposed by
`docs/decomposition-prompt-r6.md`. Nothing here merges, deploys, or spends.

## 0. Counting method (reproducible)

`docs/tickets/DEFERRALS.md` is the authoritative source. Rows are `|`-delimited; the **status cell is
the last cell** of each `D-*` row. Effective status follows the R5REC.1 normalization rule (BM-VERDICT-01
grammar): the **first canonical status token** (`OPEN`, `PARTIAL`, `DONE`, `WONTFIX`) found in the cell,
scanned in order — a leading stale token followed by a dated `**DONE —` tail still resolves `DONE` only
if a canonical token appears first in cell order (R5REC.1 already normalized every cell so the first
token IS the ratified disposition; bare/decorated compounds like `DONE-code` were rewritten then).

Reproduce the count:

```bash
node -e '
const fs=require("fs");
const lines=fs.readFileSync("docs/tickets/DEFERRALS.md","utf8").split("\n");
const KW=["OPEN","PARTIAL","DONE","WONTFIX"];
const counts={OPEN:0,PARTIAL:0,DONE:0,WONTFIX:0};
for(const l of lines){
  if(!l.startsWith("|"))continue;
  const cells=l.split("|").slice(1,-1).map(c=>c.trim());
  if(cells.length<3||!/^D-/.test(cells[0]))continue;
  const s=cells[cells.length-1];
  let status=null;
  for(const kw of KW){const re=new RegExp("(^|[^A-Z0-9-])"+kw+"([^A-Z]|$)");if(re.test(s)){status=kw;break;}}
  counts[status]++;
}
console.log(counts);'
```

Output at `d8bfebc` (2026-10-20): **OPEN 69 / PARTIAL 29 / DONE 193 / WONTFIX 41 = 332 physical rows**
(one row per `D-*` id; no duplicated ids — verified by id-uniqueness sort).

**Discrepancy reconciliation.** The round-5.2 capstone census (`docs/build/CAPSTONE_CLOSURE.md` §R5.2)
recorded **68 OPEN** at 2026-10-15. The +1 is `D-R5REC.1-1` (CI mount-settle flake), appended by
R5REC.1 on 2026-10-19 — after that census. 68 + 1 = 69: reconciled, no drift. The 29 PARTIAL rows are
the post-normalization survivors (each carries a dated tail splitting landed halves from owed halves);
the 41 WONTFIX + 193 DONE are out of scope for this census. Earlier double-count suspicion (a parser
that treats a leading `OPEN` + later `DONE` tail as two rows) does not apply: every cell now leads with
its canonical token, and id-uniqueness holds.

**Counting convention for this census:** units are **deferral rows** (`D-*` ids). A row that needs two
different unblocks is assigned one **primary** unblock class (the nearer/outer gate) with secondary
prerequisites noted; a row is never counted twice. BACKLOG rows (`BL-*`) and ledger OPEN-FINDINGS items
are counted separately in §3–§4 as carriers/homes — most BL rows are containers whose substance is
already a counted `D-*` row; a BL row with no surviving open D-child is flagged individually.

## 1. Unblock classes

| class | name | meaning |
|---|---|---|
| (a) | merge+deploy-bound | the leg verifies only on a deployed tip; the operator merge sweep + a `pulumi up` of the tip (or a green nightly thereafter) is the sole blocker |
| (b) | envelope-ruling-bound | the leg runs inside the carried funded wave: fresh spend-envelope ruling (GD-FUNDED.1-1 already CARRY) + deployed tip + `JOURNEY_FUNDED_STABLE_TAG` tenant + system-role DSN |
| (c) | posture-stage-bound | the leg needs a purpose-built stage posture (domains-bearing stage for collab N8/R10.keepalive; Stripe-bearing stage for N9 billing) |
| (d) | clock-bound | wall-clock only: tombstone+30d, weekly digest cron, billing-export lag; nothing else to build |
| (e) | operator-ruling-bound | an operator act/ruling/purchase/credential is the blocker (incl. operator browser legs on deployed code) |
| (f) | engineering-fixable now | in-tree code/docs/test work; no live dependency to implement |
| (g) | cohort/traffic-bound | measurement needs organic traffic/admissible evidence; no synthetic probe authorized or schedulable |
| (h) | strategic-deferred | intentionally outside the round-6 discharge corpus (G2/H2 program, 1.x scope, standing watches) |

## 2. The 98 open/partial deferral rows

Class legend as §1. "Vehicle" = the proposed round-6 home (`R6*` candidate ids per
`docs/decomposition-prompt-r6.md`), `operator-only`, or `stays tracking` on a named carrier.

### (h) strategic-deferred — outside the discharge corpus (10 rows)

| row | owes (verbatim-faithful) | vehicle |
|---|---|---|
| D-P0.12-3 | matcher-3 floor-tuning on the live scorer + §12.1-rubric conjunct in the Run-rounds stall/Converge checks — tuning needs real-project dispositions to calibrate | stays tracking → BL-31; future tuning ticket when corpus data exists |
| D-P0.13-1 | live §18.4 enclave blob store: mirror paths read/write a REAL bucket + the per-object retention/expiry proof (`retention_expires` ≥ §18.6 x2 floor enforced + verified) | stays tracking → BL-43 (evals program) |
| D-P0.13-3 | corpus commissioning human step: ≥24 (target 30) commissioned drafts + two annotating editors + senior adjudicator + the A6 human-editor arm + the A1 steelman | stays tracking → BL-40 (H2) |
| D-P0.13-4 | pilot-wave n-fixing on REAL variance: pilot the wave-runner on N such that pooled s.d. + Welch on pilot data yield n≥32-equivalent power | stays tracking → BL-44 |
| D-P0.13-5 | real `@rhema/evals` package swapped in via RHEMA_EVALS_PATH + drift re-cert + wave runner + records | stays tracking → BL-43 |
| D-P0.14-1 | live arm executors (Claude-cli + Edit CLI + Aider) — the three non-harness arms | stays tracking → BL-43 |
| D-P0.14-2 | workshop UI: browser CRUD for questions/arms/campaigns + wave console | stays tracking → BL-43 |
| D-P0.14-3 | live LLM judge end-to-end — composite ≠ heuristic proxy | stays tracking → BL-43 |
| D-P0.15c-4 | live dev-set pilot wave: 5–10 real runs + contamination attestation + pre-reg record — operator gate (real infra + paid inference), scheduled into G1→G2 | stays tracking → BL-44 |
| D-PRB.02-2 | six REAL research PDFs through the real fetcher → convert | stays tracking → BL-40 (H2 §18 corpus item) |

### (f) engineering-fixable now (4 rows)

| row | owes | vehicle |
|---|---|---|
| D-R5REC.1-1 | mount-settle test flake: replace bare/`!`-asserted selector access in `outline.dom.test.tsx` (delete's cited refusal + 3 call sites) + `figures.dom.test.tsx` sibling with mounted/settled `waitFor`; audit every `*.dom.test.tsx` sibling; **two consecutive green full-suite CI runs** | R6ENG.1 (offline) |
| D-SLO.1-6 | agent-completion SSE delivery — permanent head fix (post-commit wakeup on the finalize path, or another design change cutting ~3s); verify over the next measurement window | R6ENG.1 head-fix + R6POST.1 window re-read |
| D-RES.3-1 | protocol-level fix: verification-phase checkpointing (`phase<N>` checkpoints, late-arrival contract) + retry-gate consult + budget-isolation | R6ENG.1 (or own ticket if it grows) |
| D-STB.5b-1 | weekly paid-guard `JOURNEY_DATABASE_URL` binding — `auth_headers`→`bypass_ok` refactor landed; **live re-proof + the documented system-DSN binding convention still owed** (BL-72) | R6ENG.1 (convention doc; the $0 read is a dry-run) + R6POST.1 live read |

### (a) merge+deploy-bound prod arms (5 rows)

| row | owes | vehicle |
|---|---|---|
| D-SPA.6-1 | prod SSR arm — `--expect-renderer ssr` re-proof on the phone-UA IDE-doc GETs incl. uncapped pane + edit POST + seam-conformance + clean-observability + control-legs | R6POST.1 (post-deploy suite) |
| D-OPS.1-1 | signed-in preview journey legs — mailto (dev-degraded), invite-accept, `GET /r/:token` expiry, OAuth initiation | R6POST.1 (prod legs at tip; secret already seeded — VERIF.2 proved the machinery on pr-186) |
| D-OBS.1-3 | named-deploy evidence — clean N4/N9 sweep + **first scheduled nightly green on the deployed tip** | R6POST.1 / R6CLK.1 (nightly is merge+cron-bound) |
| D-SPA.28-1 | cleanup-wave entry gate — all gates landed + flag-machinery deleted + ≥1 green nightly post-cleanup | R6SWP.1 (gated on R6POST.1 nightly) |
| D-CAP.1-1 | browser half — REQ-IDE-1 layout-restore deep-link `…/v/<version>#f-<finding>` lands the host w/ `?view=findings` + anchor scroll | R6POST.1 (rides the post-deploy suite; suite infra DONE via D-CAP.2-2) |

### (b) envelope-ruling-bound — the carried funded wave (23 rows)

All gated on: **fresh envelope ruling (operator ⚑)** + deployed tip + `JOURNEY_FUNDED_STABLE_TAG` tenant
+ system-role `JOURNEY_DATABASE_URL`. The 2026-10-16 bind **refused** (pinned-scope cumulative $80.86 ≥
~$60, tenant missing, zero legs, $0 spent). Ordering inside the wave: T9 → launchers → riders → B19C
last-and-conditional (`scripts/live/funded-window.mjs --dry-run`).

| row | owes | vehicle |
|---|---|---|
| D-CAP.2-1 | the carrier: 21 `paid:true` registry steps + the paid new-visitor journey on the deployed tip | R6FND.1 |
| D-FIX.1-2 | T15's live gate click + T16's stale-voice seed (4/6 legs already green on `ffbb8ad`; T15/T16 paid halves owed) | R6FND.1 |
| D-P0.15-3 | live gate-edit round-trip — the B19-class structured-edit leg (a real `gate.approve_plan` etc. lands as next-phase `*_human_edits`) | R6FND.1 (B19 family) |
| D-PRB.02-3 | fetchViaFetcher **Full board** leg — the real editor_fetch through the proxy on ≥1 paid run | R6FND.1 (D-STB.5b-3's profile_voice leg covers it) |
| D-PRB.04-2 | EventSource **browser** live-feed leg + obligation-state chip render on a live run (transport half proven) | R6FND.1 (R6/R7 legs) or R6H operator browser |
| D-P1.10-1 | `POST /runs/:id/gates/:kind` **structured `approve_plan`** live leg — the gate consumes a real edit map | R6FND.1 (BL-19) |
| D-P1.11-1 | plan-card + turn-result sidecar asserts — a real launcher with returned `implementation_plan` + `turn_result` rows | R6FND.1 (B19A/B20A per BL-20) |
| D-P1.12-1 | free-tier e2e promotion — a real prosemanuscript project promoted through the Free pipeline | R6FND.1 |
| D-P1.14-1 | `approve_sample` gate on a paid voice build + calibration buttons round-trip | R6FND.1 (B19C — last-and-conditional) |
| D-P1.19-1 | T15 `?gate=` click-through + T16 stale-voice persona seeded half (substrates engineered by FIX.1) | R6FND.1 via D-FIX.1-2/-4 |
| D-P1.21-1-side | — | (see (e): venue-table is H4) |
| D-P1.21-2 | memo-protocol run with a real `user_sources` fetch — B18B deny leg | R6FND.1 (B18B) |
| D-DEF.1-1 | `research_burst` real fetch→`source_list`/`distill` leg + summary-visible assert | R6FND.1 via `bl20-legs.mjs` |
| D-RES.1-1 | passing-verdict probe on a fresh project (post-BL-66 fix) — RES.1's stage-B probes never delivered a Contradicted verdict | R6FND.1 (~$3-class probe) |
| D-RES.1-2 | N6 planted-error leg — planted severed source flagged through the UI + partial-credit verdict | R6FND.1 |
| D-RES.1-3 | Standard/Base excerpt-visibility leg — source_url/policy fetch real | R6FND.1 |
| D-CITE.1-2 | live probe legs: search-synthesis evidence+score leg, `citation-fetch` L1 | R6FND.1 |
| D-CITE.1-3 | live probe legs: network L2, transport §6-B assertions | R6FND.1 |
| D-CITE.1-5 | ADR-086 measured-rate read — real per-query $ under the caching pre-pass + vendor residency audit | R6FND.1 |
| D-ECON.2-2 | L5 (llm_calls−1) vs L1 (cache) measurement pair | R6FND.1 |
| D-ECON.2-3 | L4 (search-cache) vs L1 pair | R6FND.1 |
| D-ECON.2-4 | L2 (per-seed compact) vs L1 pair | R6FND.1 |
| D-STB.5b-3 | fetchViaFetcher leg on a profile_voice holdout-calibrator with `externalResearch:enabled` | R6FND.1 (also covers D-PRB.02-3) |
| D-STB.5b-5 | mooted-obligation 500 fix — B19B-class live leg: re-defer a mooted obligation → 200, no second obligation | R6FND.1 via D-FIX.1-3 substrate |

### (c) posture-stage-bound (3 rows)

| row | owes | vehicle |
|---|---|---|
| D-SPA.24-1 | N8/R10.keepalive collaboration live legs — need a domains-bearing preview/prod posture (collab WS + domains env) | R6POST.1 stage-B posture (collab domains stage) |
| D-SPA.16-1 | N9 billing walk — needs a Stripe-bearing stage (real sk/webhook + sub fixture) | R6POST.1 posture stage |
| D-SPA.20-1 | N9 — same Stripe-bearing posture | R6POST.1 posture stage |

### (d) clock-bound (4 rows)

| row | owes | vehicle |
|---|---|---|
| D-BL38.1-2 | inventory row-5 verify: tombstoned review-test project `01M3SK380GQX41RKMD4KVFB34Q`'s `project.purge` fires ~2026-10-30 (tombstone+30d) | R6CLK.1 |
| D-FIX.1-4 | T16 digest-claim half — next Monday weekly-digest cron claims the seeded stale-voice persona exactly once | R6CLK.1 (first Monday post-window) |
| D-P1.04-2 | `+30d` destruction half of the purge leg (schedule half DONE at T7); a real tombstone never survives the 26h nightly purge — needs a purge-exempt tombstone or the operator hand-date | R6CLK.1 (or operator hand-date → (e) shortcut) |
| D-COST.1-1 | billed-actuals read ~24h/one billing period **after** the D-OPS.2-1 console flip lands | R6CLK.1 — gated on (e) D-OPS.2-1 first |

### (g) cohort/traffic-bound (9 rows)

| row | owes | vehicle |
|---|---|---|
| D-SLO.1-5 | run success-rate 80%/wk — armed at `ffbb8ad`, needs the next real measurement window (weekly digest/organic runs; nightly test-tenant alone may suffice) | stays tracking → R6CLK.1 window re-read |
| D-SLO.1-7 | funnel page-load p95 — needs real traffic (x5 synthetic=7864ms, floor-unprovable) | stays tracking → BL-07 watch |
| D-SLO.1-8 | run-round e2e — needs the head fix shipped + a measurement window | R6ENG.1 ships fix; R6CLK.1 re-read |
| D-ECON.1-3 | per-bucket cap calibration on the durable contract — needs admissible organic samples | stays tracking → BL-68 |
| D-ECON.1-4 | unmeasured TCO cells — need organic traffic or an authorized measuring wave | R6FND.1 feeds some cells; residual stays tracking → BL-68 |
| D-ECON.2-5 | lever-B restore — conditional: reopens only if counted-fold evidence resurfaces | stays tracking (conditional watch) |
| D-ECON.2-6 | lever-A top-up decision math refit — needs admissible folds | stays tracking → BL-69 residual |
| D-R5OPS.1-1 | first-finding p50 across ≥20 organic non-test first-runs (synthetic cohort measured p50=460s; the organic cohort is the row's target) | stays tracking → BL-24 family; re-read when traffic exists |
| D-COST.1-2 | import_preview_p95 — no admissible samples in window; organic import or authorized probe | stays tracking → BL-29 |

### (e) operator-ruling-bound (40 rows)

Grouped by the ruling/session that unblocks them.

**Golden-budget ruling `GD-R5OPS.1-1` (⚑ operator, ~$150–300/night question):**
| D-P0.15-4 | nightly golden run on a live stage + score-floor + exit-readout flip — seeded family armed, mainstage blocked on the nightly infra line | R6H gate answer → R6FND-post golden ticket (BL-36) |

**CDN delivery-contract ruling (⚑ operator — signed-URL key + origin-read grant posture):**
| D-R5OPS.1-2 | CDN signed-delivery chain is nonfunctional at `ffbb8ad` (unsigned→403, signed→503); repair = signed-URL key generation + origin-read IAM, driver at `scripts/live/repair-cdn-delivery.mjs` | R6POST.1 after ruling |

**Out-of-class cost levers (⚑ operator — outside H9's pre-authorized classes):**
| D-OPS.2-2 | worker right-size + Cloud SQL HA — re-auth the class or land the named levers | operator-only; levers execute in a future window |
| D-COST.1-3 | the three in-class levers ruled or parked | operator-only |

**Billing-export console flip + measured read:**
| D-OPS.2-1 | GCP console: `rhema-507501` → billing export → enable `rhema_cost_export` dataset | operator-only (H8 checklist) |
| D-OPS.1-3 | billing-export spend confirmation vs observed burn (needs export populated → clock after flip) | R6CLK.1 after flip |

**Operator write/execution authorizations (guarded scripts, `--execute`):**
| D-FIX.1-1 | T8 410 arm — run `mint-t8-export.mjs --execute`, bind `JOURNEY_T8_EXPORT_TOKEN` | operator-only execute; leg rides R6POST.1 suite |
| D-FIX.1-3 | BL-78 defect substrates — run `seed-bl78-fixtures.mjs --execute` on the flagged tenant; the three probes then ride | operator-only execute + R6FND.1 B19B leg |
| D-STB.5b-4 | defer-on-mooted 500 fix — T14-class live leg via the FIX.1 seed | rides D-FIX.1-3's execute |
| D-MAINT.3-1 | entitled-tenant render probes — `--entitlement` seed arm via D-FIX.1-3, then N5-family render probes | rides D-FIX.1-3 + R6POST.1 |
| D-BL38.1-1 | `prod:d5a74cc` short-SHA stamp — operator picks: rewrite in place / delete+re-stamp / accept | operator-only ruling |

**H8 session-bundle remainder (`BL-86`; each an operator act, several with a live leg):**
| D-SEC.2-1 | real invite mint + consumed + gated signup proves shared throttle | R6H (BL-23) |
| D-PRB.01-1 | same invite leg (D-SEC.2-1 is the residual carrier) | rides D-SEC.2-1 |
| D-P1.16-1 | live-mode Stripe round-trip — real `sk_test_`/`sk_live`, hosted Checkout/Portal, 3DS/Radar, Tax | R6H (BL-33) |
| D-BILL.3-1 | real-money purchase e2e — real `checkout.session.completed` → `grant(topup)` | R6H (BL-51) |
| D-BILL.3-2 | Portal change-plan + set_pending_email leg post-purchase | R6H |
| D-PRB.08-1 | residual: anthropic admin-key reconcile (a/d already DONE live) | rides D-ECON.1-1 |
| D-ECON.1-1 | real `ANTHROPIC_ADMIN_KEY` → reconcile green | R6H (BL-34) |
| D-ACT.1-1 | real ASN scorer credential → email-activity binding | R6H |
| D-MAINT.4-1 | Google sign-in: interactive round-trip + 409 merge + revoked-grant legs (rapid-POST smoke DONE) | R6H — unblocked by tip deploy (BL-82 residual) |
| D-EDIT.1-2 | live Safari/WebKit leg — canvas caret walking | R6H browser session (BL-32) |
| D-PRB.07-1 | live source-editor exercise — mode-switch guard + typed round-trip | R6H browser session (BL-32) |
| D-P1.08-1 | versions-rail browser legs — obligation-count note + ⌘S restore | R6H (BL-32) |
| D-P1.09-1 | PUT override + standing-note lifecycle + dismiss-persistence + gate-card mount browser legs | R6H (BL-32) |
| D-P1.19-2 | phone-width interactive legs on a real ~375–390px viewport | R6H |
| D-P1.20-1 | settings-leg browser walk on a throwaway account (email/quiet/delete) | R6H (BL-32) |
| D-P1.17-2 | Lighthouse/axe + drop-zone→signup + Showcase fresh-account + funnel metrics | R6H + (g) note |
| D-SEC.1-2 | H7 RLS exposure-window access review + disclosure decision | R6H (BL-37) |
| D-P1.22-3 | external pen test — procurement + findings triage | R6H (BL-35) |
| D-P1.21-1 | H4 venue-table verification — real `verified_at` on every row | R6H (BL-41) |
| D-PRB.01-2 | H5 — sample dossier content sign-off | R6H (BL-42) |
| D-P1.17-1 | H5 showcase essay — licensed Essay-protocol essay ≥1 contradicted Tier-1 | R6H (BL-42) |

**Product rulings owed:**
| D-RES.2-2 | `GD-RES.2-1` — zero-coverage retro refund/relabel ruling | operator-only (BL-75) |
| D-RES.2-3 | `fact_check` Unverified coverage class — future ticket defines it; spec ruling | operator ruling → future ticket |
| D-ECON.1-2 | Quick findings cap — "all findings" promise needs an upstream input (P1.04 max-claims or operator cap) | operator ruling → config |
| D-ECON.2-7 | restore BOTH levers A+B unconditionally — explicitly deferred pending evidence | operator ruling (was paused by operator) |
| D-ACT.1-3 | trial everyone-flip — decision on record, flag semantics shipping | operator ruling (BL-50) |
| D-DEF.4-3 | refund-window go-live ruling — rules live (flags + §14.4 math), policy un-ratified | operator-only (BL-30) |

**Mixed live/operator residuals:**
| D-P1.18-1 | residual export legs — import round-trip parity spot-check + 7-day expiry 410 arm (the T8 mint is D-FIX.1-1's operator leg) | rides D-FIX.1-1 + R6CLK.1 |
| D-P1.22-2 | launch-verify remainder — injection-control pause smoke (ran at R5OPS.1 — see flag §5) + playbook drill + usercontent signed-URL header leg (CDN-bound → D-R5OPS.1-2) | R6H + D-R5OPS.1-2 |
| D-OPS.1-3 | (listed under billing-export above) | — |

## 3. BACKLOG open rows — accounting (54 open + 2 accepted)

Every open `BL-*` row maps to counted D-rows and/or a named vehicle. Rows whose listed children are
all discharged but which remain `open` are flagged in §5 (the census never edits cells).

| BL row | substance / children | class | vehicle |
|---|---|---|---|
| BL-01 | merge sweep + ordered activation (§R5 segments; tip-deploy posture per 2026-10-19 ruling) | e | operator-only |
| BL-02 | status-cell normalization residue (cell-shape repair) | f | R6TAIL.1 |
| BL-05 | REC.2 spec reconciliation tail (G2/G3/H3 fold-backs, ADR-007/012 lineage, REQ-MEM-6..8) | f | R6TAIL.1 |
| BL-06 | DOC.1/DOC.2 docs refresh — R5DOC.1+R5DOC.2 landed | f | **flag §5** — likely dischargeable; verify rides R6TAIL.1 |
| BL-07 | SLO remediation — D-SLO.1-5..8 | f+g | R6ENG.1 (head fix) + stays tracking |
| BL-13 | unit economics — ~$7–10 metered vs $20/mo Writer; ruling | e | R6H (H8 item) |
| BL-18 | fetch-policy live legs — D-PRB.02-3, D-P1.21-2 | b | R6FND.1 |
| BL-19 | workflow gate/finalize legs — D-P1.10-1/-11-1/-12-1/-14-1, D-P0.15-3 | b | R6FND.1 |
| BL-20 | research_burst + plan-card asserts — D-DEF.1-1, D-P1.11-1 | b | R6FND.1 |
| BL-22 | headless legs residual — T7 dest (D-P1.04-2→d), T8 (D-FIX.1-1→e), T15/T16 (→b) | mixed | R6FND.1 + R6CLK.1 |
| BL-23 | signup admission — shared-throttle live leg residual D-SEC.2-1 | e | R6H |
| BL-24 | launch-verify remainder — injection smoke (**likely discharged by R5OPS.1's REQ-OPS-1 PASS — flag §5**) + playbook drill + CDN headers + first-finding cohort + balance-divergence classification | e+g | R6H + stays tracking |
| BL-25 | non-prod residual — D-OPS.1-1 (a), D-OPS.1-2 WONTFIX'd, D-OPS.1-3 (e) | a+e | R6POST.1 + R6H |
| BL-29 | cost posture — D-COST.1-1..3, D-OPS.2-1/-2 | e+d | R6H + R6CLK.1 |
| BL-30 | refundPhases go-live — D-DEF.4-3 | e | operator-only |
| BL-31 | matcher-3 floor tuning — D-P0.12-3 | h | stays tracking |
| BL-32 | operator browser session — D-PRB.04-2 (browser leg), D-PRB.07-1, D-P1.08-1/-09-1/-19-2/-20-1 | e | R6H |
| BL-33 | live-mode Stripe — D-P1.16-1, D-BILL.3-1/-2 | e | R6H |
| BL-34 | admin-key reconcile — D-ECON.1-1 | e | R6H |
| BL-35 | pen test — D-P1.22-3 | e | R6H |
| BL-36 | nightly golden — D-P0.15-4, GD-R5OPS.1-1 | e | R6H gate |
| BL-37 | exposure review — D-SEC.1-2 | e | R6H |
| BL-39 | H3 partner program + ADR-008 triggers | h | stays tracking |
| BL-40 | H2 corpus — D-P0.13-3, D-PRB.02-2 | h | stays tracking |
| BL-41 | H4 venue verification — D-P1.21-1 | e | R6H |
| BL-42 | H5 showcase/dossier — D-P1.17-1, D-PRB.01-2 | e | R6H |
| BL-43 | eval bindings — D-P0.13-1/-5, D-P0.14-1..3 | h | stays tracking |
| BL-44 | pilot wave — D-P0.13-4, D-P0.15c-4 | h | stays tracking |
| BL-45 | G2 wave-1 LIFT — hard gate before §16.4 claims | h | stays tracking — explicitly outside corpus |
| BL-46 | accepted (partner-deal rider) | — | accepted |
| BL-47 | standing ADR revisit-trigger watch | h | stays tracking (watch) |
| BL-50 | trial everyone-flip — D-ACT.1-3 | e | R6H |
| BL-51 | real-money purchase — D-BILL.3-1 | e | R6H |
| BL-56 | fact-check research floor — D-RES.1-1/-2/-3 | b | R6FND.1 |
| BL-66 | stale claim-ledger re-probe — D-RES.1-1 passing-verdict leg | b | R6FND.1 |
| BL-67 | CITE probes — D-CITE.1-2/-3/-5 (D-CITE.1-1/-4 closed: deploy done, measured deferral WONTFIX) | b | R6FND.1 |
| BL-68 | ECON.1 residual — D-ECON.1-2/-3/-4 | e+g | R6H + stays tracking |
| BL-69 | ECON.2 residual — D-ECON.2-2..7 (incl. leg-cap reconciliation H8 item) | b+e | R6FND.1 + R6H |
| BL-70 | CAP.1 residuals — D-CAP.1-1 browser leg | a | R6POST.1 |
| BL-71 | CAP.2/CAP.3 live legs — residual = D-CAP.2-1 paid steps (D-CAP.2-2/-3-1 DONE; D-CAP.3-2/-3 remain upstream items) | b | R6FND.1 |
| BL-72 | spend-guard convention — D-STB.5b-1 | f | R6ENG.1 + R6POST.1 |
| BL-73 | spec-scheduled 1.x — 33 MISSING matrix rows (18 mobile + rest) | h | stays tracking |
| BL-74 | OBS.1 evidence — D-OBS.1-3 nightly (**soak leg DONE; N4 selector fixed — flag §5**) | a | R6CLK.1/R6POST.1 |
| BL-75 | RES.2 residual — retro ruling D-RES.2-2 + historical zero-coverage scan | e | R6H + read-only scan vehicle |
| BL-76 | product/UX revisit-trigger watch | h | stays tracking |
| BL-77 | infra/security/process revisit-trigger watch | h | stays tracking |
| BL-78 | funded-window defect repairs — D-STB.5b-4/-5, D-MAINT.3-1 via D-FIX.1-3 | e+b | R6H execute + R6FND.1 |
| BL-79 | RES.3 re-execution drain — D-RES.3-1 | f | R6ENG.1 |
| BL-80 | non-prod Resend secret — **seeded 2026-10-16; preview legs ran green on pr-186 — flag §5** | e | R6H tail (likely dischargeable) |
| BL-81 | 15-segment activation cadence — per-surface flips done; residual = tip deploy + cleanup gate | a | operator merge + R6SWP.1 |
| BL-82 | post-tip composed verification — all legs DONE except D-MAINT.4-1 | e | **flag §5** — residual is one H8 leg |
| BL-83 | accepted (REDO leg mooted by ADR-108) | — | accepted |
| BL-84 | round-4 ADR revisit-trigger watches (ADR-104 etc.) | h | stays tracking |
| BL-85 | BL38.1 residue — D-BL38.1-1 (ruling) + D-BL38.1-2 (clock) | e+d | R6H + R6CLK.1 |
| BL-86 | H8 bundle — ~11 remaining operator items | e | R6H |
| BL-87 | mount-settle flake — D-R5REC.1-1 | f | R6ENG.1 |

## 4. Ledger OPEN-FINDINGS accounting

| finding | carrier / status | class | vehicle |
|---|---|---|---|
| CI mount-settle flake (outline/figures dom) | D-R5REC.1-1 / BL-87 | f | R6ENG.1 |
| slo-e2e flakes (SSE delivery + run-round e2e) | D-SLO.1-6/-7/-8 / BL-07 | f+g | R6ENG.1 + tracking |
| `balance_divergence` new alert kind — six included-bucket accounts, classification owed (homely to BL-24 family; likely test-tenant soak) | no D-row | a | R6POST.1 read-only forensic leg (system-DSN read post-deploy authorization) |
| CIREP.1 dep-vs-reference drift — five `@rhema/*` packages missing tsconfig project references | no D-row | f | R6ENG.1 |
| R4 F3 / run-ledger cross-references | run-ledger schema updated (R5REC.1) | — | closed by R5REC.1 |
| GATE decisions `GD-R5OPS.1-1` (golden), `GD-RES.2-1` (retro), `GD-FUNDED.1-1` (CARRY — needs fresh envelope before re-attempt) | ledger GATE DECISIONS | e | operator rulings listed in spec §6 |

## 5. Flags — possibly dischargeable rows (flagged, NOT flipped)

Per the commission: cells are never edited here. These look dischargeable by their own dated evidence —
each needs a status-flip ticket or R5REC.1-family reconcile pass, not silent closure:

1. **BL-06** — DOC.1/DOC.2 refresh: R5DOC.1 + R5DOC.2 both landed green (lastCompleted R5DOC.2).
2. **BL-80** — the blocking secret was seeded 2026-10-16 and the preview-legs family ran green on pr-186 (VERIF.2); residual = zero unless the row intends more preview surfaces.
3. **BL-82** — every listed leg (D-SPACAP.2-1..4, D-SPACAP.3-1) is DONE on `ffbb8ad`; sole residual = D-MAINT.4-1 (one H8 browser leg).
4. **BL-74** — soak leg DONE (0 warnings full 24h window) and N4 PASS'd at `ffbb8ad` (ARMB.2 count-probe fix); residual = only D-OBS.1-3's scheduled-nightly green.
5. **BL-24 (partial flag)** — the canary-injection pause smoke ran live under R5OPS.1 (`canary-pause.mjs --execute` → REQ-OPS-1 PASS, pause row read, audit row, $0); the row's own text still lists it as open. Remainder (playbook drill, CDN headers, cohort) keeps the row open either way.
6. **D-P1.22-2 (partial flag)** — same overlap: its injection-control half may be discharged by the R5OPS.1 leg; playbook drill + CDN-signed-header leg remain.

## 6. Class totals (deferral rows)

| class | rows | count |
|---|---|---|
| (a) merge+deploy-bound | D-SPA.6-1, D-OPS.1-1, D-OBS.1-3, D-SPA.28-1, D-CAP.1-1 | 5 |
| (b) envelope/funded-bound | D-CAP.2-1, D-FIX.1-2, D-P0.15-3, D-PRB.02-3, D-PRB.04-2, D-P1.10-1, D-P1.11-1, D-P1.12-1, D-P1.14-1, D-P1.19-1, D-P1.21-2, D-DEF.1-1, D-RES.1-1, D-RES.1-2, D-RES.1-3, D-CITE.1-2/-3/-5, D-ECON.2-2/-3/-4, D-STB.5b-3, D-STB.5b-5 | 23 |
| (c) posture-stage-bound | D-SPA.16-1, D-SPA.20-1, D-SPA.24-1 | 3 |
| (d) clock-bound | D-BL38.1-2, D-FIX.1-4, D-P1.04-2, D-COST.1-1 | 4 |
| (e) operator-ruling-bound | D-P0.15-4, D-PRB.01-1, D-PRB.01-2, D-PRB.07-1, D-PRB.08-1, D-P1.08-1, D-P1.09-1, D-P1.16-1, D-P1.17-1, D-P1.17-2, D-P1.18-1, D-P1.19-2, D-P1.20-1, D-P1.21-1, D-P1.22-2, D-P1.22-3, D-SEC.1-2, D-RES.2-2, D-RES.2-3, D-BILL.3-1, D-BILL.3-2, D-ECON.1-1, D-ECON.1-2, D-SEC.2-1, D-ACT.1-1, D-ACT.1-3, D-EDIT.1-2, D-DEF.4-3, D-OPS.1-3, D-OPS.2-1, D-OPS.2-2, D-ECON.2-7, D-FIX.1-1, D-FIX.1-3, D-STB.5b-4, D-MAINT.3-1, D-MAINT.4-1, D-R5OPS.1-2, D-BL38.1-1, D-COST.1-3 | 40 |
| (f) engineering-fixable now | D-R5REC.1-1, D-SLO.1-6, D-RES.3-1, D-STB.5b-1 (+ CIREP.1 finding) | 4 +1 finding |
| (g) cohort/traffic-bound | D-SLO.1-5, D-SLO.1-7, D-SLO.1-8, D-ECON.1-3, D-ECON.1-4, D-ECON.2-5, D-ECON.2-6, D-R5OPS.1-1, D-COST.1-2 | 9 |
| (h) strategic-deferred | D-P0.12-3, D-P0.13-1, D-P0.13-3, D-P0.13-4, D-P0.13-5, D-P0.14-1..3, D-P0.15c-4, D-PRB.02-2 | 10 |
| **total** | | **98** |

## 7. Surprises / notes for the operator

- **D-SPACAP.2-* are NOT open.** The commission listed them as merge+deploy-bound examples; VERIF.1
  discharged all four + D-SPACAP.3-1 on `ffbb8ad` (2026-10-15). The true post-merge residual is
  D-SPA.28-1's cleanup gate + D-OBS.1-3's nightly green.
- **REQ-FIX-BL22-T7DEST routing quirk:** `COVERAGE_MATRIX.csv` routes it to `deferral:D-FIX.1-4`, but
  D-FIX.1-4's row text owns the T16 digest-claim half while the T7 destruction half's substance sits in
  D-P1.04-2 (PARTIAL) and BL-22's residual list. Both homes are counted; a future reconcile row should
  re-point the matrix routing.
- **Funded wave never ran.** The bind refused (pinned-scope $80.86 ≥ ~$60 cap; tenant missing). Any
  re-attempt needs a *fresh* envelope ruling, a deployed tip, and `JOURNEY_FUNDED_STABLE_TAG` — GD-FUNDED.1-1's
  CARRY disposition is preserved, not executed.
- **First nightly green is structurally merge-bound:** the scheduled `journeys.yml` nightly checks out
  `main` HEAD and pins `JOURNEY_EXPECT_SHA` to it — no run can prove tip-deployed provenance until the
  operator's merge sweep lands the chain on main AND a deploy follows.
- **Prod baseline is still `ffbb8ad`** (pre-chain); every (a)-class leg assumes the operator's
  deploy-from-tip act.
