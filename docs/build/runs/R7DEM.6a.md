# R7DEM.6a — the guided tour on SPD + demo entry points + honesty copy

- **Ticket:** `docs/tickets/222_R7DEM.6a__guided-tour.md` (row 222, round 7 / R7a)
- **Branch:** `stevevitali/r7dem-6a-tour` (forked off `stevevitali/r7dem-5b-hub` @ `a273375c`)
- **Base:** `stevevitali/r7dem-5b-hub`
- **Harness:** devin-desktop/swe-2-high/subagent
- **Spend:** $0 — Stage A only (GD-PREVIEW.R7: no per-ticket preview; D-R7DEM.6a-1 carries Stage B → 224)
- **Opened:** 2026-11-04 (UTC, `date -u`)
- **Closed:** pending the CI boundary read

## Phase status

| Phase | Status |
|---|---|
| 0 setup + DEFERRALS scan | done — no OPEN row unblocked by 222 (D-P1.17-2 stays open per ticket Notes) |
| 1 plan + test matrix | done — below |
| 2 implement | done |
| 3 self-review | done — review pass fixed: dossier surface crash (`accessReport`), double-mount, smooth-scroll occlusion race, corpus-marker bundle leak, containment dynamic-lookup |
| 4 gap analysis vs ticket | done — deferred D-R7DEM.6a-1 for Stage B (matches ticket contract) |
| 5 verification (build/lint/typecheck/unit + local leg walk + ssr baseline) | done — below |
| 6 records + PR + ci read + ledger advance | pending |

## Plan

The lazy seam `apps/web/src/spa/demo-tour.ts` (221's boundary, `demo-effects.tsx` owns the
`import()`) becomes the real tour engine. Tour state rides the URL — `?tour=<stepId>` (declared
`urlparam` in the DOM-contract demo bucket). The engine is plain DOM (no React): a
`MutationObserver` on `<html>`'s `data-nav-count`/`data-route`/`data-mounted` stamps re-syncs the
coach mark on every client nav; `?tour=` on the public `/demo/<essay>/…` URL names the step;
the coach mark's Next/Back/Exit are `<a>` hops through the click interceptor (client navs inside
the demo namespace; exits carry `data-spa-native`). Never auto-starts: the overlay renders only
while `?tour=` is present. Esc exits to free roam (navigates to the same path minus the param);
←/→ page steps while active, skipping editable/input targets and modifier chords; the bindings
attach only while a tour step is active so they never collide with `dispatchIdeKey` (no arrow
chords exist; Esc is margin/findings-scoped — the tour's Esc stops propagation when it acts).

Step schema (this ticket owns it, REQ-TOUR-2):
`{id, route, target, targetValue?, placement, copyKey, advance:"next"|"click-target",
aside?: {copyKey, href}}`. Recorded extensions beyond the spec's five keys: `targetValue`
(selects `[<hook>="<value>"]` — e.g. `[data-finding="Major 1"]`, `[data-move-ordinal="2"]`),
and `aside` (a second link inside the coach mark — the S-6 "What a contradicted claim looks like"
side card and step 8's "then the response letter" hop).

Quote mechanism (recorded choice): **pinned COPY literals + a test against the committed real
corpus** — never a runtime snapshot/corpus import into the SPA chunk (the bundle grep bans
snapshot bytes in `public/spa`). `demo-tour-steps.test.ts` reads
`packages/demo-corpus/corpus/structure-of-political-difference/**` at each pinned file:line and
asserts every quoted COPY fragment is verbatim and every count is snapshot-derived.

## The 11 steps → routes/targets (pinned at build time)

| # | id | route | target | mechanism |
|---|---|---|---|---|
| 1 | `published` | `""` (essay root) | `data-version-chip` (Published head, v5 origin imported) | entry: doc nav |
| 2 | `v1` | `/v/1` | `data-page-root`/`data-pm-host` (Page at v1, title quote `drafts/v1.md:1`) | client nav |
| 3 | `verdict` | `/review/v1-review` | `[data-letter-section="verdict"]` (editors-letter.md:11) | client nav |
| 4 | `one-thing` | `/review/v1-review` | `[data-finding="The one thing"]` (editors-letter.md:13) | client nav |
| 5 | `two-readers` | `/review/v1-review` | `[data-finding="Major 1"]` (editors-letter.md:34; origin both — second-read `05-second-read.md:13`) | client nav |
| 6 | `claims` | `/review/v1-review` | `[data-claim="22"]` (C23a, `01-claim-ledger.md:147`; summary `:7–8`) + aside → GM III16 | client nav |
| 7 | `figure` | `/figures` | `[data-figure-row="figure_2_ches_correlations_v2"]` (v1.md:70 → v2.md:148) | client nav |
| 8 | `responses` | `/a/agents--author--ledgers--v1-response-ledger.md` | `data-page-host` (raw rows F1:28, F23:50, F31:58, F42:69 verbatim) + aside → response letter | client nav |
| 9 | `what-changed` | `/v/1/diff/2` | `[data-move-ordinal="2"]` (M2 discharges F1, v1-response-ledger.md:120; §III `v2.md:114`) | client nav |
| 10 | `writer-edit` | `/v/2/diff/3` | `data-what-changed` (v2→v3 writer-directed, not reviewed → Published) | client nav |
| 11 | `cta` | `""` | `data-page-root` (Bring your draft → `/signup?src=demo` / New project when `boot.demo.signedIn`) | client nav; CTA doc nav |

Entry CTA: `DEMO_TOUR_ENTRY_HREF` gains `?tour=published` (contracts demo.ts — the hub's hero
CTA already carries it; `DEMO_TOUR_FIRST_STEP` pins the first step id).

## Corpus file:line pins (verified verbatim 2026-11-04 vs `packages/demo-corpus/corpus/structure-of-political-difference/`)

| beat | pin | verified |
|---|---|---|
| Verdict quote | `correspondence/v1-review/editors-letter.md:11` | ✓ "…zero contradicted claims; your own statistical exercise *reproduces from the raw data*" |
| the one thing | `correspondence/v1-review/editors-letter.md:13` | ✓ |
| Major issue 1 | `correspondence/v1-review/editors-letter.md:34` | ✓ |
| Second-read Objection 1 | `correspondence/v1-review/05-second-read.md:13` | ✓ |
| claim-ledger summary | `correspondence/v1-review/01-claim-ledger.md:7–8` | ✓ |
| C23a | `correspondence/v1-review/01-claim-ledger.md:147` (row: T2→T1 Misleading in context; quote `:148`; evidence `:150`; ordinal 22 in the dossier) | ✓ |
| Figure 2 | `drafts/v1.md:70` → `drafts/v2.md:148` | ✓ |
| v1 title | `drafts/v1.md:1` | ✓ "# Politics Has Five Questions" |
| §III | `drafts/v2.md:114` | ✓ "## III. Why Five, and Not Fifty" |
| M2 discharges F1 | `agents/author/ledgers/v1-response-ledger.md:120` + `what-changed/v1-v2.json` moveOrdinal 2 hunk → `## III. Why Five, and Not Fifty` | ✓ |
| F1 `:28` adapt · F23 `:50` constraint honored · F31 `:58` escalate→resolved · F42 `:69` defer (flagged) | same ledger | ✓ |
| side card target | GM `dossier/v2-review.json` claim III16 (ordinal 10, contradicted, tier 1) → `/demo/the-governable-mind/review/v2-review#data-claim` | ✓ |

## Test matrix

- unit: steps→DOM-contract hooks + routes→DEMO_ROUTE_IDS + copyKeys resolve; verbatim quote pins
  vs corpus files; counts derived (24 claims/27 entries, 22 verified… from the snapshot/ledger);
  entry hrefs are doc-nav (`data-spa-native`) and resolve `/demo`.
- DOM: non-modal (no focus trap, no auto-start without `?tour`, Esc exits + free roam, ←/→,
  reduced-motion), counter, placement non-occlusion (mock rects), the demo notice + import-rule
  labels on every tour route, overlay inside allowlist (no non-GET).
- lint: FUNNEL_SCOPE `/^demo\./` + PROMISE_SCOPE demo keys; a planted efficacy phrase fails;
  launch-surface + copy containment green.
- leg: `D2.tour` body locally at 1440/1024/390, per-step screenshots, step stays `expected:"red"`.
- public-ssr-baseline: local before/after capture; only the enumerated deltas.

## Evidence report

**F-R7DEM.6a-1 (found-and-fixed this run, Stage A):** the demo dossier surface crashed on the
real corpus (`TypeError: <undefined>.subagents` — the replayed dossier twin carries no
`accessReport`; `buildTrustChip` read it unconditionally). The fix is honest, not fabricated:
`accessReport` is now optional and `LetterView` renders no trust chip when the record has none
("not recorded"). Without this the tour's dossier stops could not render — no prior leg caught
it because the recording proxy asserts coverage/non-4xx, never surface content.

**Verification run:**
- `pnpm turbo build` — green (46 tasks).
- `pnpm exec vitest run apps/web/src packages/contracts/src packages/ui/src` — 1900 pass / 0 fail.
- `packages/security-checks/src/launch-surface.test.ts` — 123 pass (new `demo.*` FUNNEL/PROMISE scope
  lints the whole COPY table clean).
- `pnpm check:dom-contract` / `check:spa-budget` / `check:spa-env` / `check:protocol-markers` — all OK.
- `pnpm --filter @rhema/web|@rhema/journeys|@rhema/ui|@rhema/contracts lint` — clean; typecheck clean.
- `packages/journeys/src/demo-tour-legs.local.test.ts` — the REAL `D2.tour` body locally vs
  `demoDataSource`, all 11 steps at 1440/1024/390; 33 screenshots → `reports/2026-11-04_r7dem-6a-tour/`.
- `public-ssr-baseline` before/after: `reports/2026-11-04_r7dem-6a-public-ssr-baseline-before/`
  (base worktree `a273375c`) + `-after/` + `COMPARE.md` — only the enumerated demo-entry deltas,
  same warnings, all renderer markers `ssr`.
- `registry.test.ts`/`runner.test.ts` — `D2.tour` joined the REAL_BODIES arm; still `expected:"red"`.

**Commits:** `e3d60228` (implementation+evidence), `5a185883` (records), `62934efc` (dom-contract fix), `02f5a3f7` (aside/cta test fix).
**CI at head `02f5a3f7`:** run `41869030183` in progress at record time — prior reads: `41852045588` canceled (superseded by records push), `41852315133` fail at `check:dom-contract` (two violations — literal `tour` urlparam token + `data-demo-tour-aside` unasserted — fixed in `62934efc`, locally re-verified), `41857215112` fail at `pnpm test` on `demo-tour.dom.test.tsx` (double-mount of the engine in one test — fixed in `02f5a3f7`, locally 11/11). Boundary record `logs/ci-R7DEM.6a.json` written on conclusion.

**Deferrals:** opened `D-R7DEM.6a-1` (Stage-B → 224). Closed none. `D-P1.17-2` stays open per
the ticket note. **Operator asks:** none beyond the ordinary OPERATOR merge gate.
