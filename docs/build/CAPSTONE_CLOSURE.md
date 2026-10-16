# CAP.3 — Capstone closure

> **CAP.3 deliverable** (`docs/tickets/88_CAP.3__capstone-closure.md`). What was closed,
> what was consciously accepted, and the ACCEPTED-deviations list proposed for the
> operator's signature at `88a_GATE-ACCEPT__accepted-deviations.md`.
> Companion machine record: `docs/build/COVERAGE_MATRIX.csv`; run ledger:
> `docs/build/runs/CAP.3.md`; gap inventory: `docs/build/CAPSTONE_GAP_ANALYSIS.md` +
> `docs/build/COMPOSED_E2E_REPORT.md`.

**Run mode: offline-only.** Pulumi Cloud still 401s (D-CITE.1-1/D-ECON.2-1); no deploy
happened, no live journey ran, and nothing below claims live verification that wasn't
observed. Every code fix below carries a deterministic test that fails if the fix is
removed; every fix's **live re-verification leg is consolidated in D-CAP.3-1** and rides
D-CAP.2-2's post-deploy suite. The build is **NOT DONE** — the next chain row is the
operator-signed `GATE-ACCEPT`.

## 1. What was closed (code + deterministic test)

| D-id | Gap | Fix | Regression test | ADR |
|---|---|---|---|---|
| D-CAP.2-3 | Phone ≥44 px action-row rule dead — base `.ide .ide-actions a { min-height:24px }` declared after the `<768px` override, equal specificity ⇒ base wins at every width (measured 25 px on prod `b909fe9a`) | `packages/tokens/src/ide-css.ts` — base `.ide .ide-actions{, a}` rules moved before the media blocks; the 44 px phone rule is now the last equal-specificity declaration | `packages/tokens/src/tokens.test.ts` asserts ordering: base rules precede the `<768px` block, phone rule inside it, no later base wins | — |
| D-STB.5a-1 | Emailed export-token link 404s for every valid token — anonymous lookup ran on the RLS-scoped app pool against FORCE-RLS `account_exports` | `apps/api/src/account-export-routes.ts` — `AccountExportApiDeps.systemExec` (BYPASSRLS pool) serves the token-hash lookup + `downloaded_at` stamp; unbound ⇒ 503 `download_unavailable`, never a silent scoped-pool fallback. `index.ts` forwards `deps.systemExec` | `apps/api/src/account-export-routes.test.ts` — lookup executed on the system executor (spy), 503 when unbound, bogus token still 404 | ADR-090 |
| D-STB.5a-2 | `POST /account/import` 500s on every real import — `showcase` slug collides on `UNIQUE(workspace_id,slug)`, project skips, `artifacts` FK fails | `packages/archive/src/import.ts` — `resolveImportSlug` allocates a deterministic non-colliding slug (`base`,`base-2`,…) before insert; a candidate owned by the derived `*_imp_*` id = re-import dedupe; dependent rows map to the actually-inserted id | `packages/archive/src/archive.test.ts` — import into a slug-squatting workspace lands all projects + artifacts; re-import dedupes | ADR-091 |
| D-STB.5a-3 | `pgboss.job` unreachable by `rhema_app_login` — T7 had no app-role read path for the `project.purge` schedule | `packages/db/migrations/0058_pgboss_purge_probe.sql` — `public.rhema_project_purge_schedule(project_id)` SECURITY DEFINER (the one queue, schedule column only, `search_path=''`); `GRANT EXECUTE` to `rhema_app`; `stb5a.ts` T7 calls it, `42883`/`42501` fallback → owed | probe compiles + migration applies on migration-only test DBs (dynamic plpgsql — no pg-boss dependency at migrate time); T7 fallback tested | ADR-092 |
| D-STB.5b-1 | Weekly paid-guard reads $0 through RLS when bound to the app role — silently passes any week | `packages/journeys/src/spend-guard.ts` — probes `pg_roles` for `rolsuper OR rolbypassrls` before metering; non-bypass or absent pool ⇒ `withinCap:false`, `weeklyMeteredUsd:null`, reason names the system-DSN binding; refusal at `>=` cap. `cli.ts` binds `JOURNEY_DATABASE_URL` to `pg.Pool` for paid dispatch | `packages/journeys/src/spend-guard.test.ts` — non-bypass pool refused without issuing the meter query; under/at/over cap; proxy-source-only; ISO-week window | ADR-093 |
| D-STB.5b-2 | `ITERATION_CAPS.{audit,gapCheck}` declared with no consumer — cap unreachable by construction | `packages/mirror/src/attestation.ts` — `recordSubagentLaunch` counts the role's per-run `subagent_launches` rows and throws `IterationCapError` on the (cap+1)-th `fidelity-auditor`/`gap-analyst` launch before inserting | `packages/mirror/src/attestation.test.ts` — 3 land, 4th refuses with no row; per-run counting; uncapped roles unaffected | ADR-094 |
| D-CAP.1-1 | REQ-IDE-1's "deep link restores surrounding layout/context" clause had no verifying leg | Engineered half proven: `?focus=1`/`#finding-<id>` deep links land on the IDE host carrying model context + the anchor in SSR markup; layout restore is per-user client state (`paneStorageKey`) — the right decomposition, recorded in ADR-097 | `apps/web/src/server.test.ts` — deep-link SSR seam: IDE host + finding anchor served | ADR-097 |
| D-CAP.1-2 | REQ-BETA-5's "every surface emits" clause — audit coverage itself unverified | Reverse sweep: the test walks every emission idiom in the tree (`emit(session,"x.y")`, `event:"x.y"` mints/beacons) and asserts each emitted literal is catalogued + classified — an uncatalogued emission now fails the suite; the zero-uninstrumented-surface half stays a live leg (D-CAP.1-2 PARTIAL) | `packages/ledger/src/emission-audit.test.ts` — reverse emission sweep | ADR-096 |

## 2. What was consciously accepted or re-deferred (with compensating controls)

| D-id | What remains | Why it's accepted/deferred | Compensating control |
|---|---|---|---|
| D-STB.5b-3 | `fetchViaFetcher` live leg — the `fetcher` grant is `holdout-calibrator`-only | The narrow grant IS the §12.6 least-privilege design (ADR-095); review-side fetches transit the egress proxy (`fetch_log` attribution) — the same controls on the served path. The live leg needs a `profile_voice` run (paid). | `fetch_log` `kind='fetch'` rows land + are asserted by B18A; the leg rides D-CAP.2-1's funded window; grant surface unchanged |
| D-CAP.3-1 (new) | Live re-verify of all 8 CAP.3 fixes on the deployed tip (T3/T7/P1 legs + two-role guard re-read) | No deploy this run — journey legs only verify deployed code; D-CAP.2-2 is the gate | Each fix is seam-tested; legs are $0 registry steps that run automatically in the post-deploy suite |
| D-CAP.3-2 (new) | `completed_partial` step-state semantics (D-STB.5b-2 residual) | `completed_partial` is a RUN state only; adding a step state is a spec-shaped product decision CAP.3 can't take unilaterally | The cap itself is enforced + attested at the launch ledger; B17's `audit-iteration-cap` assert names it verbatim |
| D-CAP.2-1 | All 21 `paid:true` steps + the paid new-visitor journey incl. N5 | Weekly spend guard refused pre-dispatch ($58.08 ≥ $5); ISO-week reset 2026-10-05 + a funded window | Guard now fails closed (ADR-093) — a paid leg can never slip past a blind binding again |
| D-CAP.2-2 | Full JOURNEY.1 suite at the chain tip | Environment-blocked: Pulumi Cloud 401 is an operator act | Suite already ran green-or-xfail vs deployed `b909fe9a`; image pins committed in `Pulumi.prod.yaml`; D-CAP.3-1 rides this |
| D-OBS.1-2 / D-OBS.1-3 | Worker `run` log-level drop + N4/N9 substrate drift (EST.1/ACT.1 selectors, BILL.3 stale fixture) | Live-log + live-run remediation; the drift re-confirmed on the CAP.2 suite | Named in every compose run; red legs are classified, never silently skipped |
| D-SLO.1-5..8 | Measured SLO breaches (run_success 80%/wk, event p95 2238 ms, 4 proxy-vs-sdk divergent runs, egress denials) | Real-traffic remediations, each gated on a code lever or an evidence read; none is a measurement fix | Corrected probes landed (ADR-056); weekly readout exists (ADR-057); targets NOT re-based — breaches stand |
| D-EDIT.1-2 | Live edit/undo leg | Journey leg on deployed code | Engineered coverage in place |
| D-DEF.4-1 / D-DEF.4-3 | Fortress-loop conformance harness + full conformance suite | Harness improvements are follow-on engineering | The recorded-readback contract holds |
| D-CITE.1-*, D-ECON.2-* | Citation-completeness deploy + COGS lever legs | Same Pulumi 401; images pinned | Each lever pre-registered (ADR-086/087) — legs are runs, not decisions |
| D-OPS.* | Billed-actuals/cost rows | Need the billing export + operator data | Estimates are instrumentation-backed; actuals legs are ledgered |
| D-RES.*, D-DEF.1-*, D-ECON.1-*, D-ACT.1-*, D-EDIT.*, D-OBS.* (historical PARTIAL/OPEN) | Their named legs | Untouched by CAP.3 — carried verbatim | Each row already carries its proxy + unblock condition |
| HUMAN H7 (`85a_HUMAN-H7`) | Round-3 operator legs: test mailbox, notice timing, exposure review, test-data cleanup, live Stripe, admin key, pen test, golden budget, H3 revisit, BL-20 ruling, BL-24, real devices | Human-only, by definition | Operator owns them; each is a named item on the H7 ticket, not hidden here |
| D5 — G2/H2 | The §18 eval program rides gate G2 + the H2 corpus (six real PDFs — D-PRB.02-2) | Corpus is a human deliverable; the eval gate precedes it | Pipeline proven on synthesized fixtures; the real-PDF normalizer leg is filed |

## 3. Round-3 note items (for the GATE-ACCEPT signature)

- **HUMAN-H7 items still open** — `85a_HUMAN-H7__round3-operator-legs.md`: test mailbox,
  notice timing, exposure review, test-data cleanup, live Stripe, admin key, pen test,
  golden budget, H3 revisit, BL-20 ruling, BL-24, real devices. None closeable by CAP.3.
- **D5 (G2/H2 deferred)** — the §18 eval program + the H2 six-real-PDF corpus ride gate G2
  and human H2 respectively; `D-PRB.02-2` is OPEN (human-owned).
- **Interim trial terms (ADR-014)** — still in force: one Standard Review on Base, word cap
  derived from measured cost cards under the provisional $15-list absorbed ceiling, daily
  trial-COGS kill switch; §14.3 terms return by configuration when the Appendix A.9
  condition is met. CAP.3 changes nothing about it — listed for signature.
- **SLO re-basing ADR** — **none was written, deliberately.** SLO.1's corrected probes
  (ADR-056) + weekly readout (ADR-057) stand; the D-SLO.1-5..8 breaches are remediations of
  measured reality, not re-basings — the targets stay where the spec put them.

## 4. ACCEPTED-deviations list — proposed for operator signature at GATE-ACCEPT

> CAP.3 does not sign these. Each row is a deviation the closure **proposes** the operator
> accept; signature happens at `88a_GATE-ACCEPT__accepted-deviations.md`.

| # | Deviation | What deviates | Why it is sound | Compensating control | Sign-off |
|---|---|---|---|---|---|
| 1 | Phone-`web`-carries-inputs for REQ-MOBILE-3 | Clause written against the mobile app; MVP satisfies it on responsive web | Spec amendment (SPEC.20 era); P1/R4 journey legs green; app banner is 1.x | Phone controls ≥44 px are journey-asserted (P1) — the CAP.3 CSS fix restores the dead rule | ☐ operator |
| 2 | Proposal cards for REQ-DATA-28 | Proposal cards land edits; Yjs suggestion marks deferred to 1.x | Same approval semantics; lighter MVP mechanism (ADR-099) | `proposal.ts` + collab extension tested | ☐ operator |
| 3 | `usercontent.rhema.tools` for REQ-ARCH-24 | Subdomain of the single zone, not a separate registrable domain | 2026-09-17 domain amendment; `__Host-` host-only cookies preserve the isolation property (ADR-101) | Cookie-scope enforced + tested at the auth layer | ☐ operator |
| 4 | Boundary attestation sources for REQ-ARCH-20 | Hydration manifest + proxy log + launch records are the attestation; audit is secondary | Records exist because the run happened — non-circular (ADR-100) | `subagent_launches` now also carries cap enforcement (ADR-094) | ☐ operator |
| 5 | Signed email actions Open/Wait-only for REQ-MOBILE-10 | The clause's lock-screen surface doesn't exist; rule applied to signed email links | Same intent on the surface that exists (ADR-103) | Signed links carry open/wait intents only; mutating actions need a session | ☐ operator |
| 6 | Reserved REQ-SPEC rows (5/23/26/28) | Reserved ids merged into their targets; matrix rows exist for completeness | Clauses live under the named target ids (ADR-098) | Id-completeness check stays exhaustive (474 rows) | ☐ operator |
| 7 | Fetcher grant stays `holdout-calibrator`-only | BL-18a's "through `fetchViaFetcher`" review-leg is unreachable by construction | The narrow grant IS §12.6 least privilege; the egress-proxy path carries the same controls (ADR-095) | `fetch_log` attribution asserted; live leg rides the D-PRB.02-3 paid chain | ☐ operator |
| 8 | `completed_partial` step-state owed | BL-17a's AC describes a step state that doesn't exist; cap enforced at launch ledger instead | The cap is real + tested; the step-state shape is a product decision, not a defect (ADR-094, D-CAP.3-2) | `IterationCapError` attested; B17 assert names the finding verbatim | ☐ operator |
| 9 | Emission audit's bound | REQ-BETA-5's "every surface" verified structurally (catalogue side) only; silent surfaces need a live exercising leg | A surface that emits nothing leaves no trace — only a driven leg can find it (ADR-096) | Uncatalogued emission now fails at the type/sweep level; leg routed to D-CAP.2-2's suite | ☐ operator |
| 10 | Layout restore = per-user client state | REQ-IDE-1's clause decomposed: SSR carries context+anchor; layout restores from `paneStorageKey` | A link sharer's layout must not be forced on the recipient (ADR-097) | SSR seam test asserts context+anchor; live walk rides D-CAP.2-2 | ☐ operator |
| 11 | Live verification outstanding for every CAP.3 fix | All 8 fixes verified at build-time only; live legs (T3/T7/P1 + guard re-read) ride D-CAP.3-1 post-deploy | No deploy was possible (Pulumi 401); journey legs can only verify deployed code | Every fix is seam-tested; the suite re-runs T3/T7/P1 automatically on the deployed tip | ☐ operator |
| 12 | Whole tail's live/deploy obligations | D-CAP.2-1 paid steps, D-CAP.2-2 chain-tip suite, D-SLO.1-5..8, D-OBS.1-2/-3, CITE.1/ECON.2 deploys, D-EDIT.1-2, D-DEF.4-*, OPS cost rows, H7, D5/G2/H2 | Each is operator-, live-window-, or human-gated — none is closable offline, none is forgotten | Every row is ledgered in DEFERRALS.md with its unblock condition; the spend guard now fails closed | ☐ operator |
| 13 | Interim trial terms (ADR-014) still in force | §14.3's terms remain superseded while measured COGS exceeds the bound | The interim terms are the honest position under measured cost cards | Daily trial-COGS kill switch + config return path both in code | ☐ operator |

## 5. Verdict & verification record

- Deterministic: focused suites green — `spend-guard.test.ts` (8), `tokens.test.ts` (19),
  `archive.test.ts` (4), `account-export-routes.test.ts` (6), `attestation.test.ts` (6),
  `emission-audit.test.ts`, `server.test.ts` deep-link leg. Full `pnpm test` +
  `turbo build lint typecheck` recorded in `runs/CAP.3.md`.
- Coverage matrix: REQ-ACCT-3 AT-RISK-INTEGRATION → **PARTIAL** (code repaired, live legs
  routed to D-CAP.3-1); REQ-IDE-1, REQ-BETA-5, REQ-DATA-20, REQ-ARCH-21 stay PARTIAL with
  updated evidence + ADR refs; nine previously-ADR-less MET-DIFFERENTLY rows now carry
  ADR-098…ADR-103.
- Deferral ledger: 8 routed rows flipped PARTIAL with CAP.3 evidence (code landed, live leg
  consolidated); D-CAP.2-2 annotated unchanged-open; new rows D-CAP.3-1/-2 appended.
- **Build state: IN_PROGRESS.** `nextTicket` → `88a_GATE-ACCEPT__accepted-deviations.md`.
  Nothing is merged; nothing is claimed DONE.

---

# SPACAP.3 — Capstone closure, round 4 (frontend SPA migration) — 2026-10-10

> **SPACAP.3 deliverable** (`docs/tickets/142_SPACAP.3__capstone-closure.md`). The round-4
> closure for the composed SPA chain: every gap SPACAP.1 routed
> (`docs/build/reports/CAPSTONE_GAP_ANALYSIS_SPA.md` §5, G1–G5) is either fixed in code or
> dispositioned here as a signed-deviation candidate for `GATE-ACCEPT.SPA`. Companion records:
> `docs/build/COVERAGE_MATRIX.csv` (192 SPA rows — 174 MET / 12 MET-DIFFERENTLY / 6 PARTIAL,
> unchanged this run); `docs/build/runs/SPACAP.3.md`; the SPACAP.2 runbook
> `docs/build/reports/SPACAP.2_COMPOSED_VERIFICATION.md`; DEFERRALS rows `D-SPACAP.2-1..4`,
> `D-SPACAP.3-1`.
>
> **Run mode: offline-only, $0.** No deploy, no prod mutations, `mergePolicy: OPERATOR`. Every
> live leg below verifies deployed code only and is owed to the deployed tip via the runbook's
> §3.1 cadence — nothing here claims live verification that wasn't observed. The build is
> **NOT DONE** — the next chain row is the operator-signed `GATE-ACCEPT.SPA`.

## R4.1 What landed this run (the one code fix — G2)

SPACAP.1 §4.5 found the round-4 chain's one real composed-path divergence (LOW): the server's
Page-family document arms force SSR on `isPhoneRequest(c) || row.showcase === true`
(`server.ts` — five GETs), while the boot map replicated only the phone leg
(`deviceClass === "phone" && doc.pageMount === true`, `spa-shell.ts`). `row.showcase` is row
data the request-scoped boot payload cannot see, so on desktop the map marked all five
Page-family routes `"spa"` even for showcase projects — an in-SPA navigation to
`/p/<showcase-slug>` mounted the SPA Page where a document load would have served the
forced-SSR read-only document.

**Resolution (spec's option (a), ADR-108):** each of the five Page-family BFF twins ships
`project.showcase: true` when the row carries it; each of the five leaf routes consults the
shared `twinForcesSsr(twin)` predicate (`spa/states.tsx`) and hands off through `SsrHandoff` —
the same document-load seam the phone leg takes. The client's effective predicate now mirrors
the server's verbatim: **the boot map owns the phone leg; the twin owns the showcase leg.**
Forced-SSR remains a server verdict in both directions; the BFF aggregates' existing
`readOnly: true` / `collabWsUrl`-withheld posture is kept verbatim as belt-and-braces.

**Regression pins (removal-detecting, all green this run):**

- `renderer-overrides.test.ts` SPACAP.3 block — counts the verbatim two-leg document arms (5),
  the surviving boot-map phone leg (1), the twin `showcase` emissions (5), and asserts the
  five leaf `twinForcesSsr` consults by filename. Drop any leg and a count fails.
- `editor.dom.test.tsx` — a showcase twin drives `navigateDocument` on all five leaf routes;
  a non-showcase twin never does (the fix cannot over-trigger).
- `server.test.ts` — every Page-family twin emits `project.showcase: true` for a showcase row
  and omits the field otherwise.

Files: `apps/web/src/spa/queries.ts`, `apps/web/src/server.ts`, `apps/web/src/spa/states.tsx`,
the five `apps/web/src/spa/routes/_authenticated/p.$project.*.tsx` leaves.

## R4.2 Routed-gap dispositions (G1–G5)

| # | Severity | Disposition | Record |
|---|---|---|---|
| G1 | HIGH (process) | **closed-by-runbook** | SPACAP.2's `docs/build/reports/SPACAP.2_COMPOSED_VERIFICATION.md` §3 is the operator-facing merge/deploy sequence the finding asked for: the 15-segment bottom-up cadence (each flip deploy → marker curls + `--expect-renderer spa` surface leg → ≥1 nightly green before the next segment), the cleanup wave held behind the `editor` bake (segment 15), Arm B (the recorded tip-deploy fallback: inert-signal reads + compressed-but-not-skipped legs + rollback = `git revert` of cleanup commits). Live execution is ledgered — `D-SPACAP.2-1..4`. Nothing further to fix in code; the ordering hazard is now an operator runbook with per-segment verify gates. |
| G2 | LOW (code) | **fixed** | §R4.1 + ADR-108. Twin-flagged `project.showcase` + `twinForcesSsr` → `SsrHandoff` on all five Page-family leaves; parity/removal pins above. The live re-verify leg is `D-SPACAP.3-1`. |
| G3 | MED | **deviation-candidate** | REQ-VFY-8's written flip procedure (leg A's `x-rhema-renderer`/`?ssr=1` pin + flag-off arm) was deleted by SPA.28 under the spec's own sunset clause and never ran live. The amended procedure is recorded: `D-SPA.28-2` (DONE — every affected row carries its dated amendment) + the runbook's surviving `--expect-renderer spa` leg and revert-of-cleanup rollback. The live legs themselves stay ledgered: every `D-SPA.*-1` preview two-leg (OPEN behind `D-MAINT.6-1`) and the `D-SPAF.*-2` prod legs (folded into `D-SPACAP.2-1`). |
| G4 | MED | **deviation-candidate** | Owed free journey steps still `expected:"red"`: R6F, T12F, T13F, T17. Their first prod legs are folded into `D-SPACAP.2-1` (a pass reports `ready-to-flip`; the owner flips `registry.ts` green with the report); preview legs `D-SPA.*-1`/`D-SPA.25-1` stay separately owed behind `D-MAINT.6-1`. Compensating control: a red step can never silently pass — the registry treats `expected:"red"` as owed-reporting, and every owed step names its deferral. |
| G5 | MED | **deviation-candidate** | Journey-level axe (the P1 family) — the spec's authoritative a11y gate — has no green live leg. Same unblock as G4: the signed-in legs sit behind `D-MAINT.6-1` → the `D-SPA.*-1` preview runs and `D-SPACAP.2-1`'s composed suite. Compensating control: component-level axe already runs on the interactive-manifest subset in dom tests (layout-dependent rules off), so no component ships axe-unchecked; the gap is the journey-level leg only. |

## R4.3 The six PARTIAL coverage rows — dispositioned

All six are verification-procedure requirements; every mechanism requirement is MET. Each
keeps `PARTIAL` (honest: the live leg is owed), now carrying its named covering rows.

| Req | What remains unproven | Compensating control in place now | Covering DEFERRALS rows |
|---|---|---|---|
| REQ-VFY-6 | The authoritative journey-level axe (P1 family) has no green live leg | Component-axe dom tests cover the interactive-manifest subset (layout rules off); a component cannot ship axe-unchecked | D-MAINT.6-1 → the `D-SPA.*-1` preview legs → D-SPACAP.2-1 (P1 steps inside the composed suite) |
| REQ-VFY-8 | The per-surface flip procedure's live legs never ran; leg A's pin machinery is deleted post-SPA.28 | `--expect-renderer spa` assert unit-pinned (`surface-gates.test.ts` totality, `runner.test.ts`); amended recipe recorded verbatim (D-SPA.28-2 DONE; runbook §3.1/§3.2) | D-SPA.6-1; every `D-SPA.*-1` preview two-leg; `D-SPAF.*-2` prod legs folded into D-SPACAP.2-1 |
| REQ-VFY-10 | Owed free steps R6F / T12F / T13F / T17 still `expected:"red"` | `expected:"red"` is owed-reporting, never passable; each step names its deferral row; the ready-to-flip path is defined | D-SPA.21-1, D-SPA.22-1, D-SPA.25-1 (preview legs); D-SPACAP.2-1 (first prod legs → ready-to-flip) |
| REQ-SEQ-7 | No surface's two-leg preview gate ran; no rollback drill was exercised live | Rollback arms recorded verbatim per flip (`D-SPAF.*-3`); stage-fact reverts are revert-by-construction; post-cleanup rollback = `git revert` (D-SPA.28-2 amendments) | All 15 `D-SPA.*-1` + `D-SPA.*-2`; D-SPA.6-1 (the preview rollback drill) |
| REQ-SEQ-9 | The "flag off → SSR serves the same DOM contract" live evidence | The DOM contract itself is pinned in-repo: `check:dom-contract` + `spa.dom.test.tsx` hold both renderers to one contract; post-SPA.28 the flag-off state no longer exists by design (sunset) | `D-SPA.*-2` rollback drills (amended); D-SPA.28-2 |
| REQ-SEQ-10 | No nightly-green bake has run — prod still serves the pre-chain ancestor | Activation-order gate is encoded, not hoped: §3.1's per-segment cadence + 14 `D-SPAF.*-4` rows + the cleanup wave's entry gates (`D-SPA.26-1/-27-1/-28-1`); nightly is committed CI | `D-SPAF.1-4` … `D-SPAF.14-4`; `D-SPA.26-1/-27-1/-28-1` |

## R4.4 ACCEPTED-deviations list — proposed for operator signature at GATE-ACCEPT.SPA

> SPACAP.3 does not sign these. Each row is a deviation the closure **proposes** the operator
> accept; signature happens at `GATE-ACCEPT.SPA`.

| # | Deviation | What deviates | Why it is sound | Compensating control | Covering row | Sign-off |
|---|---|---|---|---|---|---|
| 1 | REQ-VFY-8's flip procedure amended post-deletion | Leg A's `x-rhema-renderer`/`?ssr=1` pin + flag-off arm were deleted by SPA.28 before any live leg ran | The deletion is the spec's own sunset (REQ-SEQ-4); the amended single-leg recipe (`--expect-renderer spa` + rollback-by-revert) verifies the same property | Renderer assert unit-pinned; `D-SPA.28-2` amended every affected recipe verbatim | `D-SPA.*-1`; `D-SPAF.*-2` → `D-SPACAP.2-1` | ☐ operator |
| 2 | REQ-SEQ-9's flag-off DOM-parity legs unexecutable | "Flag off" no longer exists post-cleanup — by design | The DOM contract both renderers serve is pinned by `check:dom-contract` + dom tests; the sunset removed the state, not the contract | The checker fails the build on contract drift; the amend notes are on every affected row | `D-SPA.*-2` (amended); `D-SPA.28-2` | ☐ operator |
| 3 | REQ-VFY-10's owed free steps still `expected:"red"` | R6F, T12F, T13F, T17 have no green run | Owed-reporting cannot silently pass; the first prod legs are folded into the composed suite with a defined ready-to-flip path | Registry semantics + `SURFACE_GATES` totality test; each step names its row | `D-SPA.21-1/-22-1/-25-1`; `D-SPACAP.2-1` | ☐ operator |
| 4 | REQ-VFY-6's journey-level axe leg still owed | The spec's authoritative a11y gate (P1 family) has component-axe coverage only | Component-axe already covers the interactive-manifest subset; the journey leg adds layout/real-browser reach, not a new contract | Dom-axe runs per component in the suite; the live leg's recipe is recorded | `D-MAINT.6-1` → `D-SPA.*-1` → `D-SPACAP.2-1` | ☐ operator |
| 5 | REQ-SEQ-7's rollback drills never exercised live | Every `D-SPAF.*-3` arm is recorded-not-exercised (deliberately non-destructive) | A destructive drill on live prod flaps real users; the arms are revert-by-construction while flags exist and `git revert` + redeploy after | Per-flip recorded recipes; the preview drill (`D-SPA.6-1`) exercises the same path harmlessly | All `D-SPAF.*-3`; `D-SPA.*-2`; `D-SPA.6-1` | ☐ operator |
| 6 | REQ-SEQ-10's nightly pacing unproven until deploys run | No flip is deployed; no bake has run; prod serves the pre-chain ancestor | The gate binds activation order through the §3.1 runbook — pacing is a cadence the operator follows, not code that could have been written | 14 `D-SPAF.*-4` rows + cleanup entry gates; nightly CI committed | `D-SPAF.*-4`; `D-SPA.26-1/-27-1/-28-1` | ☐ operator |
| 7 | G2's fix verified at build-time only | The showcase handoff's live legs (document GET `data-renderer="ssr"`, in-SPA handoff, non-showcase control) owe their runs to the deployed tip | No deploy was possible this run ($0, mergePolicy OPERATOR); every leg is deterministic-tested and the recipe is recorded verbatim | `D-SPACAP.3-1` names all three legs; the parity pins fail if the fix is removed | `D-SPACAP.3-1` | ☐ operator |
| 8 | The whole live tail | `D-SPACAP.2-1..4` + every `D-SPA.*-1/-2` preview leg gate on the ordered merge/deploy + `D-MAINT.6-1` | Each is operator-, deploy-, or secret-gated — none closable offline, none forgotten | Every row is ledgered with its verbatim recipe + unblock condition; prod provenance is honestly recorded (pre-chain ancestors) | `D-SPACAP.2-1..4`; `D-SPA.*-1/-2`; `D-MAINT.6-1` | ☐ operator |

## R4.5 Verdict & verification record

- Deterministic: `renderer-overrides.test.ts` (7 — incl. the 4 parity legs), `server.test.ts`
  (113 — incl. the showcase-twin legs on all five twins), `editor.dom.test.tsx` (22 — incl. the
  five handoff legs + non-showcase control). Full gate results in `runs/SPACAP.3.md`.
- Coverage matrix: unchanged by construction — the six PARTIAL rows stay PARTIAL (their live
  legs are owed, now fully dispositioned); G2's fix changes code, not a verdict (the divergent
  posture was already BFF-enforced; the row is REQ-ED-12, MET).
- Deferral ledger: `D-SPACAP.3-1` appended (the G2 live re-verify); all `D-SPACAP.2-*`/`D-SPA.*`
  rows carried verbatim; `D-SPA.28-2` remains DONE.
- ADRs: ADR-108 (the twin-flagged handoff — the only owned decision this run).
- **Build state: IN_PROGRESS.** `nextTicket` → `GATE-ACCEPT.SPA`. Nothing is merged; nothing
  is claimed DONE.
