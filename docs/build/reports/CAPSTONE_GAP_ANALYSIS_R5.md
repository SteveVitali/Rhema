# CAPSTONE GAP ANALYSIS — Round 5 (post-SPA disposition)

**Ticket:** R5CAP.1 (manifest row 168) · **Branch:** `stevevitali/r5cap-1-capstone-gap-analysis`
· **Base:** `stevevitali/funded-1-funded-window-wave` @ `e683c34` · **Date:** 2026-10-16
· **Harness:** devin-desktop/swe-2-high/subagent
**Normative loads:** `docs/post-spa-disposition-spec.md` (ratified 2026-10-15 — the contract);
`docs/research/r5_g1_dispositions.md` (the disposition census of record); `docs/build/
COVERAGE_MATRIX.csv`; `docs/build/BACKLOG.csv`; `docs/tickets/DEFERRALS.md` (effective
statuses).
**Independence (BM-VERDICT-01):** every verdict below was formed from the spec text + the
composed tree (code, tests, committed evidence) + the census BEFORE consulting any run
ledger's self-report. Run-ledger claims were reconciled afterwards; discrepancies are
findings, never smoothed.

## Verdict grammar

`MET` — the requirement's own layer reached with cited evidence · `MET-ENGINEERED(D-id)` —
engineering landed and unit/dom-verified; a live leg is owed on a named OPEN deferral ·
`MET-DIFFERENTLY` — satisfied by a different-but-ratified mechanism (ruling named) ·
`PARTIAL` — substance landed, a remainder is owed and routed · `MISSING` — not landed,
routed to a named closing ticket · `AT-RISK-INTEGRATION` — landed but its proof depends on
an unmerged/inaccessible surface. "Dispositioned-carried" is a valid verdict context this
round: the funded wave was attempted and mechanically refused ($80.86 ≥ ~$60), the operator
ruled **CARRY** (GD-FUNDED.1-1) — funded items are judged on their machinery, and the owed
execution is carried on named rows, not silently unmet.

## §0–§11 — section-level judgments

| spec § | substance | verdict | evidence / routing |
|---|---|---|---|
| §0 constraints | nav workstream in-scope; eval track OUT; cost-first before window; operator owns merges + rulings | MET — honored in the composed round | manifest rows 150–175; mergePolicy=OPERATOR held on every close |
| §1 evidence index | the 22 verified findings the spec rests on | MET — absorbed | each finding maps to a landed repair below (interceptor, registry fix, guard exclusion, UA fix…) |
| §2 nav mechanism | REQ-NAVM-1..10 | **10/10 MET** | table below |
| §3 verification contract | REQ-NAVT-1..8 | **7/8 MET, 1 MET-ENGINEERED** | NAVT-5 → D-SPA.24-1 |
| §4 dormant machinery | REQ-NAVC-16..23 | **8/8 MET** | table below |
| §5 test economics | REQ-ECON-1..13, REQ-FND-1..8 | **13/13 + 8/8 MET** | the window itself was attempted + refused — regime held end-to-end |
| §5.6 funded-leg census | 21 registry paid legs + non-registry items | dispositioned-carried | GD-FUNDED.1-1 CARRY on D-CAP.2-1; drivers committed (REQ-FND-7) |
| §6 fixtures | REQ-FIX-* (11 ids) | **4 MET, 7 MET-ENGINEERED** | D-FIX.1-1..4 carriers |
| §7 ops residuals | REQ-OPS-1..7 + REQ-COST-1..6 | OPS: 2 MET + 1 MET-DIFFERENTLY + 1 ME, 3 PARTIAL · COST: 3 MET + 2 ME, 1 PARTIAL | tables below |
| §8 memory hygiene | REQ-MEM-1..10 | **7 MET, 3 MISSING→routed** | MEM-6/7/8 → R5REC.2 (row 172) |
| §9 stream V | V-1 composed pass · V-2 preview wave · V-3 literal closes | MET | VERIF.1 (#174) · VERIF.2 (#186) · HYGIENE.1 DROP closes (#172) |
| §10 register | every ruling taken as recommended at ratification | MET — all rulings landed: Q-ECON.f → GATE-R5F; Q-ALERT → Path A; Q-CDN → verify leg; Q-DROP → literal closes; Q-5 → BL38.1 dry-run→confirm→apply; Q-GOLDEN → GD-R5OPS.1-1 **AWAITING** (flagged) | GATE DECISIONS |
| §11 decomposition | stream order + boundary | MET | chain history (C+E → A → D → B → V → F) |

## REQ-NAVM — delegated interception (spec §2; owner NAVC.1 #175, NAVC.5 #176, NAVC.4 #179)

| id | verdict | evidence (file:line / test) |
|---|---|---|
| REQ-NAVM-1 | **MET** (engineered; staging-verified via R10 on pr-186) | `apps/web/src/spa/nav-intercept.ts:127-131` one bubble-phase `document` listener; installed by `mountSpa` only (`spa/main.tsx:88`), never `createSpaRouter` — the 14 router-direct dom suites stay un-intercepted |
| REQ-NAVM-2 | **MET** | the §2.1 ordered pipeline verbatim at `nav-intercept.ts:43-120` — closest → defaultPrevented → button → modifiers → contenteditable → target/download/`data-spa-native` → fail-closed origin → hash-only skip → `getMatchedRoutes` + `**` predicate → stub membership → `preventDefault`+navigate |
| REQ-NAVM-3 | **MET** | push-only commit `router.navigate({href})` (`nav-intercept.ts:116-119`); no `replace` emission; `resetScroll` never overridden |
| REQ-NAVM-4 | **MET** | `RELOAD_STUB_IDS` = the three `/_authenticated/` route ids verbatim (`nav-intercept.ts:32-36`) matched by generated route id → `navigateDocument`; `spaRouteFor` never consulted |
| REQ-NAVM-5 | **MET** | `spaRuntime.replace` + `replaceDocument` (`spa/dom.ts:15,36-37`); `SsrHandoff` calls `replaceDocument` (`spa/states.tsx:37`) — the transient commit is eaten, the Back-loop closed; `navigateDocument`/`replaceDocument` share the one `spaRuntime` seam; 16 suites migrated to the seam (NAVC.5) |
| REQ-NAVM-6 | **MET** | interceptor consults no renderer verdict — grep-verified: no `surfaces`/`deviceClass`/`isSpaEnabled`/`twinForcesSsr`/`spaRouteFor` reference in `nav-intercept.ts`; `postProjectHandoff`'s beforeLoad POST fires identically on intercepted entry |
| REQ-NAVM-7 | **MET** | no preload ships — `main.tsx:58` documents the deferred `pointerover`/`focusin` + `PRELOAD_SAFE` allowlist as a separate-ticket follow-up (deviation candidate for GATE-ACCEPT.R5) |
| REQ-NAVM-8 | **MET** | `data-spa-native` manifest row (`dom-contract.ts:278`) + emitters on all three non-document GETs: `/usage.csv` (`surfaces/usage.tsx:105`), `data/export/download` (`surfaces/settings.tsx:872`), `export/ai-use/{md,docx}` (`surfaces/export.tsx:404,406`); interceptor skip at `nav-intercept.ts:71` + test. SSR emits none of those anchors (grep-verified) — the "both renderers" clause is vacuous on SSR; documented "inert on SSR" in the manifest |
| REQ-NAVM-9 | **MET** | interceptor adds zero scroll/focus/title logic — HeadManager (`spa/head.tsx`) + router defaults own title/h1-or-hash focus/announce/`data-route`/`data-mounted` |
| REQ-NAVM-10 | **MET** | `hashchange` listener in `ide/controller.ts:1127` runs the same hash consumer — the native-fragment gap compensated; pin test `ide-chrome.dom.test.tsx:712` |

Also landed under the stream: the §2.8 pre-existing dead-link defect — `state-map.ts:130,246`
now emit `/v/<personaId>` (was `/voices/<personaId>`; fixed in NAVC.1, commit `3a29d31`).

## REQ-NAVT — the verification contract (spec §3; owners NAVC.2 #177, NAVC.4 #179, VERIF.2 #186)

| id | verdict | evidence |
|---|---|---|
| REQ-NAVT-1 | **MET** (staging-verified) | `data-nav-count="0"` on EVERY served document — SSR (`render.tsx:86`) + shell (`spa-shell.ts:217`); HeadManager increments once per committed push/replace/pop, never hydration (`head.tsx:51-59`); monotone-count assertion ran live on pr-186 (R10, VERIF.2 `gates2/`) |
| REQ-NAVT-2 | **MET** | `data-mounted` removed while `isLoading`, re-stamped on resolution (`head.tsx:79-88`) — honest pending semantics |
| REQ-NAVT-3 | **MET** | `settleClientNav`/`settleDocumentNav` + `SettleScope.documentLoads`; the document-response watcher is unconditional (O2-F20 un-gate — `runner.ts:214-293`, pinned `runner.test.ts:279-318`) |
| REQ-NAVT-4 | **MET** (staging-verified) | R10 leg: `/app` → click `/p/:slug` → click `a[data-edit-source]` → `/v/working` → Back; monotone `data-nav-count`, `documentLoads===1`, warm-return zero twin GET inside NAVC-18's freshness window. `paid:false`, flipped `red→green` on the first live leg — pr-186 @ `e7b21aec` (registry.ts:277-288; VERIF.2 `gates/` + `gates2/` evidence) |
| REQ-NAVT-5 | **MET-ENGINEERED(D-SPA.24-1)** | `data-page-session="<bootNonce>.<seq>"` minted per registry entry on `[data-page-root]` (`spa/page-mount.tsx:331`, `page-sessions.ts:51`); R10.keepalive leg committed `paid:false`, `expected:"red"` — the first live leg needs a domains-bearing stage (the collab wire is domains-only; previews serve the static read view) → named carrier D-SPA.24-1 |
| REQ-NAVT-6 | **MET** | mechanism pinned both directions; `settleNav` stays mechanism-agnostic; no existing leg flips mechanism silently (`settle.ts`, `runner.test.ts` pin set) |
| REQ-NAVT-7 | **MET** | dom-contract rows `data-nav-count` all-documents (`dom-contract.ts:127`) + `data-page-session` editor-conditional (`dom-contract.ts:1345`) landed with emitters + assertions same-PR |
| REQ-NAVT-8 | **MET** | `spa/intercept.dom.test.tsx` — 19 synthetic-click tests over the real `routeTree`: every A1/A2 decision row (foreign origin, `?1`-hash, fuzzy `**` non-document GETs, stub ids, modifiers, contenteditable, `data-spa-native`) + the mid-`beforeLoad` `reloadDocument` redirect history-slot pin (OQ1, `:427` — resolved under `router-core@1.171.33`, the engine beneath the spec-pinned `react-router@1.170.40`) + `navKey` semantics |

## REQ-NAVC-16..23 — dormant-machinery obligations (spec §4; owners NAVC.3 #178, NAVC.4 #179)

*(The spec's own renumbering rules out REQ-NAVC-7..15 — A5's collision was merged into
REQ-NAVM-7 or renumbered to 16..23 — and declares REQ-NAVC-24 nonexistent. The matrix/checker
honor that verbatim.)*

| id | verdict | evidence |
|---|---|---|
| REQ-NAVC-16 | **MET** | scroll contract verified both directions: router `scrollRestoration` owns restore/top-on-push (`spa.dom.test.tsx:516-532` — `history.scrollRestoration==="manual"` + real scrollTop asserts); the three `resetScroll:false` navs enumerated + pinned (`[`,`]` stepping, `?focus=1`, `?triage` — `ide-chrome.dom.test.tsx:736-789`); `.ide-page` inner-scroller handled (`spa.dom.test.tsx:517`); hash-target-over-h1 focus precedence (`spa.dom.test.tsx:328`) |
| REQ-NAVC-17 | **MET** | registry invariants incl. the §1 defect's verbatim cure — generation check `entries.get(key)===entry` (`page-sessions.ts:253-259`) + `release` no-op on map miss (`:171-186`); HELD entries never destroyed cross-leaf (`transitions.dom.test.tsx:392`); `page-sessions.test.ts` unit suite |
| REQ-NAVC-18 | **MET** | per-surface Query freshness policy driven by mark-read twins: `projectPageQuery` `staleTime=PAGE_SESSION_IDLE_TTL_MS` (`queries.ts:1270`); the mark-read twins keep deliberate `staleTime:0` with the parity decision documented (`queries.ts:860,965,1062`); landed before R10 (R10's warm-return assert depends on it — NAVC.3 merged before NAVC.4 in the stack) |
| REQ-NAVC-19 | **MET** | keymap semantics under real client navs — `⌘⇧T`/`[`/`]` commit through `navigate({resetScroll:false})`, never re-mount (`ide-chrome.dom.test.tsx:736-789`) |
| REQ-NAVC-20 | **MET** | per-document boot (one boot instance across every client hop — `transitions.dom.test.tsx:491`); 30 s session re-verify (`sessionQuery staleTime 30_000`, `queries.ts:89`); 401 → `/login` document nav (`bff.ts`); `refetchType:"none"` load-bearing (`main.tsx:48`) |
| REQ-NAVC-21 | **MET** | head/settle contract: pending semantics (NAVT-2), same-title re-announce clear-then-set + replace-commit parity (`spa.dom.test.tsx:343,368`), hash-target-over-h1 focus (`:328`), generic-title parity |
| REQ-NAVC-22 | **MET** | transition-level testing: StrictMode + real router hops, `published`-flag wrong-projectId window, SSE reconnect churn (one live EventSource), stale `<html data-project>` (`transitions.dom.test.tsx:339-505`) |
| REQ-NAVC-23 | **MET** | server-owned boundaries as tested acceptance: `reloadDocument` stubs → `navigateDocument` (`intercept.dom.test.tsx:298`); `/login`/external/binaries stay native (`:316`); `SsrHandoff` arm under interception; the mid-`beforeLoad` reloadDocument-redirect history-slot semantics pinned (`:427-445`) |

## REQ-ECON — the test-economics regime (spec §5; owners R5ECON.1 #180, R5ECON.2 #181, R5ECON.3 #182)

| id | verdict | evidence |
|---|---|---|
| REQ-ECON-1/2/3 | **MET** | `CogsLevers.testCheapRoute` resolves all four phase classes' main-context to `claude-haiku-4-5` (`apps/api/src/cogs-levers.ts` — is_test-double-gated; `resolveCogsLevers` honors it only on `workspaces.is_test`) |
| REQ-ECON-4 | **MET** | the served model is recorded verbatim — selects carry `u.model` (proxy-priced) + the frozen tier together ("both truths" suites: cogs-levers tests 192/196) |
| REQ-ECON-5 | **MET** | rollups/estimates join the frozen `input_snapshot` or read `usage_records.model` — never infer served model from `model_tier` (`timeline-routes.ts:901` + the ECON-4/5 selects) |
| REQ-ECON-6 | **MET** | seed pollution excluded: `SEED_SPEND_EXCLUSION_SQL` inside the one shared scope `FLAGGED_PROXY_SPEND_SCOPE` (`spend-guard.ts:19-24` — `w.is_test AND u.source='proxy' AND NOT req_jrn_%`) consumed by weekly AND cumulative queries (`funded-window.mjs` pins flagged-tenant `source='proxy'` — the O2-F11 no-filter defect closed); `window-plan.ts:257` checklist row |
| REQ-ECON-7 | **MET** | `finishLeg` asserts `meteredUsd ≤ capUsd`; `cap_overrun` is a distinct verdict that fails the run AND pauses the window (`runner.ts:82-85,165-189,333,368`) |
| REQ-ECON-8 | **MET** | operator `--paid` requires a system-role DSN — the guard probes `pg_roles` and refuses a blind app-role read (`spend-guard.ts:86-98`); the no-db attestation applies only to scheduled CI |
| REQ-ECON-9 | **MET** | §5.3 caps verbatim in the registry (`JourneyStep.capUsd` on all 21 paid rows — `window-plan.ts`, `registry.ts`); paid dispatch refuses uncapped legs + missing/short `--headroom` (`cli.ts` exit 2 / `funded-window.mjs` exit 3; floor $0.50 on riders) |
| REQ-ECON-10 | **MET** | `COGS_LEVERS_TEST` is_test-scoped server default (`env.ts:198,309`; Q-ECON.e ratified) |
| REQ-ECON-11 | **MET** | per-leg `testCheapRoute:false` opt-out channel, honored is_test-only + never freezable off-test (`cogs-levers.ts:20-22`; `dom-contract.ts` `cogsLevers` row — BFF forwards, api resolves is_test-only); mandatory for B19C, candidate-excluded for N6/R4 |
| REQ-ECON-12 | **MET** | resolved arms freeze into BOTH `inputs.cogsLevers` and `input_snapshot.cogsLevers` (`cogs-levers.ts:5-6`; `run-routes.ts:941-980`) |
| REQ-ECON-13 | **MET** | Q-ECON.d ratified: entitlement/Included `source='proxy'` rows count toward the guards — the shared scope excludes only the `req_jrn_` seed marker, not entitlement spend (`spend-guard.ts:21`) |

## REQ-FND — the funded-window regime (spec §5 + r5_f1; owners R5ECON.3 #182, FUNDED.1 #187)

| id | verdict | evidence |
|---|---|---|
| REQ-FND-1 | **MET** | guard composition = ISO-week flagged-tenant proxy spend AND cumulative `sum(list_cost_usd)` vs `FUNDED_WINDOW_CAP_USD` ($60) + `--headroom` pre-flight (`funded-window.mjs:109-113,259-268`; `window-plan.ts`) — exercised live at bind 2026-10-16 ($80.86 measured, refusal recorded) |
| REQ-FND-2 | **MET** | system-role `JOURNEY_DATABASE_URL` bound + `pg_roles` probe (`funded-window.mjs`; `spend-guard.ts:86-98`); app-role binding fails closed verbatim — exercised live (IAP tunnel, `rolsuper\|rolbypassrls` probe PASS) |
| REQ-FND-3 | **MET** | every paid leg declares `capUsd`; overrun → `cap_overrun` divergence + window pause (REQ-ECON-7/9 chain); uncapped paid steps refuse dispatch |
| REQ-FND-4 | **MET** | entitlement spend counts — shared scope has no entitlement carve-out (Q-ECON.d ratified; `spend-guard.ts:21`) |
| REQ-FND-5 | **MET** | funded-tenant machinery + convention committed: `funded-tenant.mjs` (dry-run-first, `JOURNEY_FUNDED_STABLE_TAG`, house-grant, purge-freshness arm behind `--execute`); the FUNDED.1 probe honestly read jrn-a reaped → provisioning deliberately not executed under a refused window |
| REQ-FND-6 | **MET** | prerequisite-scarce consolidation landed: T15 `ridingOpenGate` (rides B19A/B's `JOURNEY_FUNDED_HOLD_GATE` arm), T16 seeded `persona_profiles` (Q-ECON.g), R9 `ridingRefundTargets` (§14.4-eligible probes, launches only the shortfall) |
| REQ-FND-7 | **MET** | committed drivers for every non-registry paid item: `bl20-legs.mjs` (BL-20 research_burst/chat), `lever-pair.mjs` (ECON.2 OFF/ON pairs), `cite1-leg.mjs` + `cite1-citation-scan.mjs`/`cite1-evidence.mjs` (ADR-086), `res1-probe.mjs`, `res2-unverified-scan.mjs` (BL-75 adjudication support), `mint-t8-export.mjs` (T8), `seed-bl78-fixtures.mjs` (BL-78), `funded-tenant.mjs` (tenant prep) |
| REQ-FND-8 | **MET** | the gate held end-to-end: no funded run until the operator ruled envelope/tenant/duration → GATE-R5F PASSED (2026-10-16) → the window attempted and the mechanical guard refused all dispatch ($80.86 ≥ $60) → operator ruled CARRY (GD-FUNDED.1-1). $0 spent; the wave stays dispositioned-carried on D-CAP.2-1 — a future envelope ruling is the named unblock |

## REQ-FIX — fixture + owed-leg substrate (spec §6; owner FIX.1 #173)

| id | verdict | evidence |
|---|---|---|
| REQ-FIX-P1D | **MET** (live-verified) | real mobile `userAgent` constant `IPHONE_USER_AGENT` (`steps.ts:1654,1703`) — Chromium emits `sec-ch-ua-mobile: ?1` natively; `data-device="phone"` asserted before the bulk count; `[data-apply]` extension per Q-1. P1.dossier reported `ready-to-flip` on `ffbb8ad` (VERIF.1) — harness fix proven against live prod |
| REQ-FIX-T17 | **MET** (live-verified) | leg-side wait per Q-T17 — awaits `[data-page-view]` doc content before the source toggle (`steps.ts:2762-2766`); T17 `ready-to-flip` on `ffbb8ad` + PASS on pr-186 (D-SPA.25-1 DONE) |
| REQ-FIX-T12F | **MET** (live-verified) | response-status capture + attach-wait — repaint lag can no longer masquerade as a missing notice (`stb5a.ts:1245,1411`); T12F `ready-to-flip` on `ffbb8ad` |
| REQ-FIX-T13F | **MET** (live-verified) | seeded `{replacement}` suggestion shape + resolvable `findings.anchor` on the V2 working head, pinned in `assertShowcaseFixture`; T13F `ready-to-flip` on `ffbb8ad` |
| REQ-FIX-T8 | **MET-ENGINEERED(D-FIX.1-1)** | guarded backdated-mint recipe per Q-T8 (`scripts/live/mint-t8-export.mjs` — hand-dates ONE `account_exports` row, fixture-only); operator execution + the `JOURNEY_T8_EXPORT_TOKEN` binding owed on the named row |
| REQ-FIX-T15 | **MET-ENGINEERED(D-FIX.1-2;D-CAP.2-1)** | seeded open-gate substrate (`seedOpenApprovalGate` + `JOURNEY_FUNDED_HOLD_GATE` hold/resume arm, `stb5a.ts:1714-1752`) — the `?gate=` focus leg is `paid:true` and rides the window's deliveries; owed under the CARRY (D-CAP.2-1) |
| REQ-FIX-T16 | **MET-ENGINEERED(D-FIX.1-2;D-CAP.2-1)** | seeded `persona_profiles` substrate (Q-ECON.g — `stb5a.ts:1869-1892`); the paid build leg owed under the CARRY |
| REQ-FIX-BL22-T7DEST | **MET-ENGINEERED(D-FIX.1-4)** | clock-owed ~30 d destruction half; the tombstone+30d `start_after` machinery re-verified at `ffbb8ad` (T7 PASS); fire date ledgered on the named row |
| REQ-FIX-BL78-5B4 | **MET-ENGINEERED(D-FIX.1-3)** | `--mooted` substrate scripted + guarded (`seed-bl78-fixtures.mjs` — stale-chip `obligation_findings` edge + `open→mooted` flip); execution + the ~$1 probe riding B19B owed |
| REQ-FIX-BL78-5B5 | **MET-ENGINEERED(D-FIX.1-3)** | `--entitlement` substrate (flagged-tenant `trial_state='trial_active'` + verbatim `PRICING.trial.entitlement` row) scripted + guarded; execution owed |
| REQ-FIX-BL78-M31 | **MET-ENGINEERED(D-FIX.1-3)** | the entitled-tenant `Included`-shape substrate committed in the same driver; probes owed |

## REQ-OPS — ops residuals (spec §7; owners R5OPS.1 #183, VERIF.2 #186)

| id | verdict | evidence / routing |
|---|---|---|
| REQ-OPS-1 | **MET** (live-executed) | canary pause smoke PASS on prod (`scripts/live/canary-pause.mjs --execute`: synthetic `runs`+`pause_signals` claimed by `drainPauseSignals` → `waiting_gate` + `refusal` gate + paired events; rollback residue 0 — `reports` + `canary-pause.json`) |
| REQ-OPS-2 | **MET-DIFFERENTLY** | Q-ALERT ruling: Path A receipts satisfy — `ops_alert_received` POSTs land 200 at the catcher every ~5 min (recorded on D-P1.22-2); the `rhema:opsAlertWebhookUrl` NotificationChannel stays documented-optional, declined by the ruling |
| REQ-OPS-3 | **PARTIAL → routed** | config verified (`enableCdn`+`USE_ORIGIN_HEADERS`+`signedUrlKeyNames`) but signed-URL delivery is nonfunctional (LB→private-bucket origin read denied, `AccessDenied` 403 signed/unsigned/corrupted alike) → **`deferral:D-R5OPS.1-2`** (repair recipe ledgered; ⚑ Q-CDN ruled verify-leg-only — the repair is out-of-band IAM/origin work) |
| REQ-OPS-4 | **MET-ENGINEERED(D-R5OPS.1-1)** | the ≤4-min measurement query committed verbatim (`first-finding-latency.mjs` `FIRST_FINDING_QUERY`, is_test/opt-out excluded, `BEGIN READ ONLY`); execution waits for organic signups per the spec's own schedule → named row |
| REQ-OPS-5 | **MET** (staging-verified) | the preview-leg wave executed behind the Resend seed: `preview-stack.mjs` recipe → mailbox-minted session (`N2`/`N2.invite` PASS — real Resend link → session cookie) → `--invite-code` legs asserting `data-renderer`/`data-ssr-cause` only; 39/44 `paid:false` legs green on owned pr-186; the posture-bound residuals are named (N8/R10.keepalive→D-SPA.24-1, N9→D-SPA.16-1/-20-1, T8→D-FIX.1-1, D-OPS.1-1/D-SPA.6-1) — `reports/2026-10-16_verif2/` |
| REQ-OPS-6 | **PARTIAL → routed** | first scheduled-nightly green is merge-dependent (`github.sha` = `main` HEAD ≠ the chain tip); the nightly cron exists (`journeys.yml` `5 6 * * *`) but cannot read green on unmerged code → **BL-01 / H8 merge sweep** (named owner = operator); tracked on D-SPA.28-1's nightly clause + D-OBS.1-3 |
| REQ-OPS-7 | **PARTIAL → routed** | the nightly-golden driver landed fail-closed (`nightly-golden-driver.mjs` — `--execute` refuses without `GOLDEN_BUDGET_RULING=approved` + measured `--scores`; absent-manifest exit-0 marked NON-EVIDENCE); the ~$150–300/night budget ruling is **GD-R5OPS.1-1 — still AWAITING OPERATOR RULING** (honest flag; named owner = operator) → `deferral:D-P0.15-4` carries the live golden + manifest |

## REQ-COST — prod cost posture (spec §7 renumbered; owner COST.1 #185 under the H9 ruling)

| id | verdict | evidence / routing |
|---|---|---|
| REQ-COST-1 | **MET-ENGINEERED(D-COST.1-1)** | billing-read before/after committed on the list-price meter: $285.80 → **$198.32/mo** (`billing-read.mjs` before 01:21Z / after 01:36Z, `reports/2026-10-16_COST.1/`); billed-actuals reconciliation awaits D-OPS.2-1's export → named row |
| REQ-COST-2 | **MET** (live-executed) | convert-svc `cpu-throttling:"false"` live-vs-IaC drift **reverted + codified** — `cpuIdle` is now an explicit stage fact so a billed-posture divergence can never sit split again (`pulumi up` update 151) |
| REQ-COST-3 | **MET** | `cfg.cloudRun` posture block in `stages.ts` (min/max + `cpuBilling` + `resources` as test-asserted facts; `compute.ts` consumes verbatim — posture ternaries gone) |
| REQ-COST-4 | **MET** | `docs/ops/redis-degradation-analysis.md` — `RedisHeartbeatStore` has NO fallback → Redis removal is a design change, never a COST.1 lever |
| REQ-COST-5 | **PARTIAL → routed** | worker right-size engineered as a stage fact + soak spec; execution paused out-of-class under H9's class authorization → **`deferral:D-COST.1-3`** (also carries GKE posture, SQL tier, proxy-MIG, Redis, HA — each needs its own ruling) |
| REQ-COST-6 | **MET-ENGINEERED(D-COST.1-2)** | §13.5 SLO re-verify executed post-`up` (probe ticks green; the standing empty-cohort `run_success_rate_24h_pct` violation pre-dates the change); `import_preview_p95_s` unreadable — zero samples → named row |

**Posture honesty (standing finding, not a REQ failure):** $198.32/mo is ~4× the ~$50
target — class-A levers necessary not sufficient; the remaining ~$145 needs the paused
redesign classes under explicit rulings (D-COST.1-3). Reported, never expanded.

## REQ-MEM — memory/spec hygiene (spec §8; owners HYGIENE.1 #172, R5REC.2 row 172)

| id | verdict | evidence / routing |
|---|---|---|
| REQ-MEM-1 | **MET** | status-cell normalization — 96 flips via `tools/deferral-status-normalize.mjs`, `--verify` 106/106; G1 ALREADY-DONE rows read the ratified disposition with tails verbatim |
| REQ-MEM-2 | **MET** | committed scripted pre-census `tools/deferral-status-census.mjs` (+ `deferral-status.mjs`); ran before edits; `reports/2026-10-14_deferral-census.{txt,json}` |
| REQ-MEM-3 | **MET** | upstream parser flipped positional at `agent-skills@e981ec5` (3 sites) + `v2-positional-status` fixture; repo pin `scripts/deferral-status-parity.test.mjs` — 0 disagreements on all 320 rows + 7 synthetic cells |
| REQ-MEM-4 | **MET** | PHASE-LOG rotation convention documented (`docs/build/README.md` + in-heading note) + applied — `## PHASE LOG — Round 5` region opened; oversized-entry warning reclassified to older regions |
| REQ-MEM-5 | **MET** | BUILD_INDEX `ARMB.2` row backfilled (seq 177) + ID/evidence naming convention in README |
| REQ-MEM-6 | **MISSING → routed** | `frontend-spa-spec.md` §7 mechanism amendment unlanded (grep-verified — no interceptor mechanism named in §7) → **R5REC.2** (manifest row 172, the named closing ticket) |
| REQ-MEM-7 | **MISSING → routed** | `frontend-spa-spec.md` §14 dated defect block (no-interception shipped + Q-scope-1 + NAVC/NAVM/NAVT refs) unlanded → **R5REC.2** |
| REQ-MEM-8 | **MISSING → routed** | `rhema-design-spec.md` supersession-banner settled-mechanism clause + settle-contract `data-nav-count` extension unlanded → **R5REC.2** (lands with the round-5 ADR) |
| REQ-MEM-9 | **MET** | REQ-IDE-20/-21 matrix anchors `§5.3` → `§6.6` (register-section truth) |
| REQ-MEM-10 | **MET** | BL-73 recorded spec-verified — dated DEFER note on BACKLOG.csv (stays `open` as the DEFER-class record, not a close) |

## REQ-G1 — the completeness check itself (census §Spec requirements)

| id | verdict | evidence |
|---|---|---|
| REQ-G1-1 | **MET** | THIS report — the census keyed on *effective* status (first canonical token + dated late notes per `tools/deferral-status-census.mjs`); every round-5 REQ id judged; the DECOMPOSE/OPERATOR completeness tables below — zero unmapped, zero unowned |
| REQ-G1-2 | **MET** | HYGIENE.1 discharged the zombie/DONE-first class (96 normalized flips; 41 DROP rows → literal `WONTFIX` closes per Q-DROP); no round-5 ticket re-emitted discharged work — FIX.1 carried only genuinely-owed substrate |
| REQ-G1-3 | **MET** | stream-V decomposed into exactly the 3 shapes the census demands: (i) VERIF.1 — the `ffbb8ad` SHA-exact composed pass (BL-82 + D-SPA.28-1 thin legs + D-SPACAP.2-*/3-1 + D-CAP.1-2, all green on the deployed SHA, $0); (ii) VERIF.2 — the preview-leg wave behind the Resend secret; (iii) nothing for mooted drill families — literal per-row DROP closes instead (Q-DROP) |
| REQ-G1-4 | **MET** | the stream-F gate held end-to-end: fresh-window prerequisites committed (tenant machinery, system DSN, exclusions live first) → GATE-R5F ruled the window open → the attempt mechanically refused → CARRY. No funded run without a ruling; the regime is dispositioned-carried, not bypassed |
| REQ-G1-5 | **PARTIAL → routed** | the single-session bundle ran one item: `rhema-nonprod-resend-api-key` seeded (H8 checklist ✔ 2026-10-16, delegated). The other ~12 items stay operator-owed — merge sweep (BL-01/BL-81), BL-23, BL-33, BL-34, BL-35, BL-37, BL-13/68, BL-30/75, BL-50/51, BL-41/42, D-OPS.2-1, D-MAINT.4-1, X-cite1-leg-cap-recon → **H8's unticked checklist is the named owner** (the census table + H8 row 150 record owner=operator for every row; none unowned). `projectStatus` stays IN_PROGRESS until each is ruled or owner-dispositioned |

## Disposition-census completeness check (REQ-G1-1/4/5)

Method: every DECOMPOSE row in `r5_g1_dispositions.md` traced to a landed ticket or a named
deferral; every OPERATOR row traced to a ruling or a named owner. Sources: BACKLOG.csv,
DEFERRALS.md effective statuses, GATE DECISIONS, the composed git history.

### DECOMPOSE rows — all landed or named

| census row(s) | stream | landed / named |
|---|---|---|
| BL-02 memory hygiene | E | **HYGIENE.1 #172 landed** |
| BL-05 REC.2 reconciliation | E | named → R5REC.2 (row 172, pending in chain) |
| BL-06 docs refresh | E | named → R5DOC.1/R5DOC.2 (rows 174/175, pending) |
| BL-07 SLO remediation (D-SLO.1-5..8) | D | **R5OPS.1 #183** — BL-07 classified self-resolved test-traffic artifact (evidence `bl07-classification.md`); the four breach rows stay OPEN as named residuals |
| BL-18/19 fetch+gate legs | F | **FUNDED.1 attempted → CARRY** on D-CAP.2-1 (registry legs B18A/B, B19A–C declared + capped) |
| BL-20 research_burst/chat (D-P1.11-1, D-DEF.1-1) | F | **driver committed** `bl20-legs.mjs` (REQ-FND-7); execution carried under CARRY |
| BL-22 account/export residuals (D-P1.18-1, D-P1.19-1, D-P1.04-2) | C | **FIX.1 #173** — substrates landed; T8→D-FIX.1-1, T15/T16→D-FIX.1-2, T7-dest→D-FIX.1-4; D-P1.18-1/D-P1.04-2 carry DONE halves |
| BL-24 launch-verif remainder | D | **R5OPS.1 #183** — OPS-1 live PASS, OPS-2 Path A, OPS-3 finding→D-R5OPS.1-2, OPS-4→D-R5OPS.1-1 |
| BL-25/80 preview legs | A | **VERIF.2 #186** (H8 seed done) — 39/44 green; residuals named on D-SPA.*/D-OPS.1-1 |
| BL-29 prod cost posture | D | **COST.1 #185** — class-A levers live ($285.80→$198.32); out-of-class → D-COST.1-3; D-OPS.2-2 → PARTIAL |
| BL-36 nightly golden (D-P0.15-4) | D | **R5OPS.1 #183** driver landed fail-closed; budget ruling **GD-R5OPS.1-1 AWAITING** — flagged |
| BL-38 prod residue | D | **BL38.1 #184 live-executed** (dry-run→confirm→apply, 3 deletes, post-verify green); findings → D-BL38.1-1/-2 |
| BL-56/66/67/69/71/79 funded items (D-RES.1-1..3, D-PRB.02-3, D-CITE.1-2/-3/-5, D-ECON.1-3/-4, D-ECON.2-2..4/-6, D-RES.3-1) | F | drivers committed (REQ-FND-7); execution **carried under CARRY** — D-CAP.2-1 + constituent rows stay OPEN |
| BL-70 CAP.1 residuals (D-CAP.1-1) | C | engineered half verified (PARTIAL); T15-carrier live leg owed — rides the funded wave → carried |
| BL-72 spend-guard convention (D-STB.5b-1) | D | fail-closed tripwire landed (PARTIAL); the documented system-role convention lives in the R5ECON.1 contract + `spend-guard.ts` + refusal messages; live re-proof rides the funded wave → carried |
| BL-74 nightly green | D | merge-dependent → named owner BL-01/H8 (D-OBS.1-3, D-SPA.28-1 nightly clause) |
| BL-78 residuals (D-STB.5b-4/-5, D-MAINT.3-1) | C | **FIX.1** — `seed-bl78-fixtures.mjs --mooted/--entitlement` substrates → D-FIX.1-3; probes ride B19B → carried |
| BL-81 merge stack | A | OPERATOR-class (BL-01) — H8 bundle |
| BL-82 composed verification | A | **VERIF.1 #174** — `ffbb8ad` SHA-exact pass green |
| D-SPA.28-1 thin legs | A | **VERIF.1** — 4/4 verify legs green; residual nightly-green clause → merge-dependent |
| D-SPACAP.2-1..4 + D-SPACAP.3-1 | A | **VERIF.1** — all DONE on `ffbb8ad` |
| D-CAP.1-2, D-CAP.2-2 ($0 half) | A | **VERIF.1** — DONE (composed suite = the live exercising leg) |
| D-SPA.6/12..24-1 preview legs | A | **VERIF.2** — 13 DONE; 5 honestly-owed re-OPEN with named carriers (D-OPS.1-1, D-SPA.6-1, D-SPA.16-1, D-SPA.20-1, D-SPA.24-1) |
| D-SPA.25-1 (T17) | C→A | **DONE** (VERIF.2, pr-186 PASS) |
| stream-F deferrals (D-P0.15-3, D-P1.10-1, D-P1.12-1, D-P1.14-1, D-P1.21-2, D-STB.5b-3, D-ECON.1-3/-4) | F | all declared on FUNDED.1's wave plan; **carried** under CARRY on their existing rows |

**Every DEFER row** (BL-31/39/40/41/42/43/44/45/47/73/76/77/84; D-P0.06-3, D-P0.12-3,
D-P0.13-*, D-P0.14-*, D-P0.15c-4, D-PRB.02-2, D-ECON.1-2, D-ECON.2-5/-7, corpus rows) —
spec-§0-enumerated, stays OPEN/deferred by name. **ALREADY-DONE + DROP rows** — discharged
by HYGIENE.1's normalization (96 flips, verify 106/106).

### OPERATOR rows — all ruled or named-owned

| row | status |
|---|---|
| BL-01/BL-81 merge sweep | **named owner — H8 checklist (unticked)** |
| BL-80 Resend seed | **RULED — done** 2026-10-16 (`rhema-nonprod-resend-api-key` v1; value never printed) |
| BL-23 invite mint | **named owner** — H8 checklist + `seed-invite` machinery proved on pr-186 (`prv-186-test` minted live) |
| BL-33 Stripe live verify · BL-34 admin key · BL-35 pen test · BL-37 exposure review · BL-13/68 flip · BL-30/75 rulings · BL-50/51 · BL-41/42 · D-OPS.2-1 export · D-MAINT.4-1 · X-cite1-cap-recon | **named owner — H8 checklist** (unticked; census table is the named-owner record) |
| H9 cost posture | **RULED** — (a) keep ~$50 target; class-level lever auth |
| GATE-R5F window | **RULED — PASSED** |
| GD-FUNDED.1-1 envelope | **RULED — CARRY** |
| GD-R5OPS.1-1 golden budget | **AWAITING — flagged** (the driver is fail-closed; named owner = operator; does NOT block `projectStatus` beyond the standing D-P0.15-4 row, but it IS an open operator item and is called out for the operator here) |

**Completeness result: zero unlanded-untracked DECOMPOSE rows; zero unowned OPERATOR rows.
`projectStatus` stays IN_PROGRESS** — the open rows all carry landed dispositions (named
deferrals, named tickets, or a named human owner), which is exactly what REQ-G1-1's close
rule measures.

## Reconciliation vs run-ledger self-reports (BM-VERDICT-01)

| claim | my verdict | disposition |
|---|---|---|
| FUNDED.1: "window attempted+refused, wave carried" | agrees — independently re-measured the checklist artifact (`checklist-dryrun.txt`: 7/9 pass, cumulative $80.86 ≥ $60, tenant absent) | MET/carried |
| VERIF.2: "39/44 green; 5 honestly-owed with named carriers" | agrees — the 5 residual rows (D-OPS.1-1, D-SPA.6-1, D-SPA.16-1, D-SPA.20-1, D-SPA.24-1) carry dated re-owed notes naming posture-bound carriers | MET/carried |
| COST.1: "$285.80→$198.32; ~4× target; out-of-class paused" | agrees — committed before/after billing-reads + post-up inventory verified in `reports/2026-10-16_COST.1/` | MET / PARTIAL for COST-5 |
| NAVC.1 stamped `REQ-NAVC-13` in its close | the id is spec-declared nonexistent (absorbed into REQ-NAVM-8/§2.7) — a naming-drift nit in the commit message + ledger, not a substance gap; the substance (opt-out hook) is landed | noted; no action |
| HYGIENE.1: "0 parser disagreements" | agrees — `deferral-status-parity.test.mjs` present + green; the two-parser *design* divergence the spec cites (E-F1/2/3) is upstream-fixed, not repo-hidden | MET |
| R5OPS.1: "GD-R5OPS.1-1 AWAITING" | agrees — the ruling is genuinely unruled; flagged above as an open operator item, not counted against `projectStatus` beyond D-P0.15-4 | flagged |
| D-P0.03-2-style mixed cells (leading DONE, mid-cell OPEN prose) | effective-status rule (first canonical token + dated late notes) applied — no row re-judged by stale mid-cell tokens | consistent |

**Discrepancies surfaced: none blocking.** The nav family's "MET" rests on staging-verified
evidence (pr-186), not prod — recorded honestly: prod still serves pre-chain `ffbb8ad`;
the merge sweep is the named owner for the production layer, and no round-5 REQ requires
prod deployment to be satisfied (the spec's live legs were explicitly preview/prod-arm
routed where they were owed).

## Routings summary (nothing floats)

| verdict | item | routed to |
|---|---|---|
| PARTIAL | REQ-OPS-3 CDN signed delivery | DEFERRALS **D-R5OPS.1-2** (repair recipe) |
| PARTIAL | REQ-OPS-6 nightly green | BL-01/H8 merge sweep (named owner) + D-SPA.28-1/D-OBS.1-3 |
| PARTIAL | REQ-OPS-7 nightly golden | **GD-R5OPS.1-1** (AWAITING — operator) + D-P0.15-4 |
| PARTIAL | REQ-COST-5 + paused lever set | **D-COST.1-3** |
| PARTIAL | REQ-G1-5 bundle remainder | **H8 checklist** (named owner = operator) |
| MISSING | REQ-MEM-6/7/8 spec fold-back | **R5REC.2** (row 172 — lands in this chain) |
| carried | whole §5.6 funded wave + F-row executions | **D-CAP.2-1** (GD-FUNDED.1-1 CARRY — future envelope ruling named) |
| deviation candidates for GATE-ACCEPT.R5 (row 170, R5CAP.3 drafts) | deferred intent-preload allowlist (NAVM-7); mark-read-parity freshness trade-off (NAVC-18); unlevered-vs-levered cap basis (ECON-9); posture-bound owed legs (OPS-5 residuals); CARRY disposition of the funded wave | named for the operator's sign-off |
