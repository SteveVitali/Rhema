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

---

# R5CAP.3 — Capstone closure, round 5 (post-SPA disposition) — 2026-10-17

> **R5CAP.3 deliverable** (`docs/tickets/169_R5CAP.3__capstone-closure.md`). The round-5
> closure: every gap R5CAP.1 routed (`docs/build/reports/CAPSTONE_GAP_ANALYSIS_R5.md` §
> "Routings summary") is dispositioned here — fixed, deferred-with-compensating-control,
> or proposed as a signed-deviation candidate for `170_GATE-ACCEPT.R5`. Companion records:
> `docs/build/COVERAGE_MATRIX.csv` (752 ids; unchanged except the REQ-G1-1 evidence cite);
> `docs/build/runs/R5CAP.3.md`; the named DEFERRALS carriers in §R5.2/§R5.3.
>
> **Run mode: offline-only, $0.** No deploy, no prod contact, no prod mutations,
> mergePolicy OPERATOR. R5CAP.1 routed **nothing an offline ticket can fix** — every
> routed item binds an operator ruling/execution, a clock, an empty cohort, or a named
> in-chain ticket. Nothing below claims live verification that wasn't observed. The build
> is **NOT DONE** — the next chain row is the operator-signed `GATE-ACCEPT.R5` (row 170).

## R5.0 What landed this run — and the honest scope statement

Unlike SPACAP.3 (which carried one real code fix, G2), round 5's routed set contains **no
in-tree fixable item**:

- The three MISSING rows (REQ-MEM-6/7/8 — the `frontend-spa-spec.md` §7/§14 +
  `rhema-design-spec.md` supersession-banner fold-back) are assigned by the manifest's own
  decomposition to **R5REC.2** (row 172, the spec-reconciliation ticket). Landing them here
  would be scope creep against the decomposition, not a fix.
- The five PARTIAL rows each bind a live stage (merge/deploy, a preview posture class,
  prod IAM), an operator ruling, or an unspent budget — dispositions, not defects.
- The carried funded wave is an operator-ruled disposition (GD-FUNDED.1-1 CARRY), not
  unmet engineering.
- The small honest fixes the round produced already landed *inside* their owning tickets
  (NAVC.1's `/voices/`→`/v/` dead-link; FIX.1's leg repairs; VERIF.1's `randomUUID`→ULID
  seed fix; VERIF.2's F-VERIF.2-3 phone-dossier `[data-apply]` leak + F-VERIF.2-7 fetcher
  clock flake). Nothing was saved for the closure.

So this run is disposition-only by construction: **zero DEFERRALS flips, zero test
relaxations, zero fabricated closes** — and a drafted, unsigned deviations register.

## R5.1 Routed-gap dispositions (every R5CAP.1 routing, 1:1)

| routed item | R5CAP.1 verdict | disposition | evidence / carrier |
|---|---|---|---|
| REQ-OPS-3 CDN-signed usercontent delivery | PARTIAL → `deferral:D-R5OPS.1-2` | **deferred → deviation row 7** | `reports/2026-10-15_R5OPS.1/usercontent-cdn-verify.json` — signed/unsigned/corrupted probes all GCS `AccessDenied` 403; config verified (`enableCdn`+`USE_ORIGIN_HEADERS`+`signedUrlKeyNames=[rhema-tools-key]`); repair = a delivery-contract ruling + origin-read grant (out-of-band, owner-bound) |
| REQ-OPS-6 first scheduled nightly green | PARTIAL → BL-01/H8 merge sweep + D-SPA.28-1/D-OBS.1-3 | **deferred → deviation row 9** | `journeys.yml` cron `5 6 * * *` exists; scheduled `github.sha` = `main` HEAD ≠ the chain tip — cannot read green on unmerged code; named owner = the operator's merge sweep |
| REQ-OPS-7 nightly golden | PARTIAL → **GD-R5OPS.1-1 AWAITING** + D-P0.15-4 | **deferred → deviation row 8** | `scripts/live/nightly-golden-driver.mjs` landed fail-closed (`--execute` refuses without `GOLDEN_BUDGET_RULING=approved` + a measured `--scores`); absent-manifest exit-0 marked NON-EVIDENCE. **The ~$150–300/night ruling stays an open operator item — flagged, never answered here.** |
| REQ-COST-5 + the paused lever set | PARTIAL → `deferral:D-COST.1-3` | **deferred → deviation row 10** | `reports/2026-10-16_COST.1/` — class-A executed ($285.80→$198.32 list-price); the out-of-class set (worker right-size+soak, GKE spot/0, SQL micro, Redis, proxy MIG, HA) needs per-lever rulings; `docs/ops/redis-degradation-analysis.md` bounds the dangerous one |
| REQ-G1-5 operator bundle remainder | PARTIAL → H8 checklist (named owner) | **deferred → deviation row 11** | `docs/tickets/150_HUMAN-H8__operator-session-bundle.md` — one item discharged (`rhema-nonprod-resend-api-key` seeded 2026-10-16, delegated); ~12 items stay operator-owed, every row named-owned |
| REQ-MEM-6/7/8 spec fold-back | MISSING → **R5REC.2** (row 172) | **deferred to named in-chain ticket → deviation row 13** | manifest row 172 owns the §7 mechanism amendment + §14 dated defect block + supersession-banner clause; lands immediately after this gate |
| §5.6 funded wave + F-row executions | dispositioned-carried → **D-CAP.2-1** | **carried → deviation row 6** | `reports/2026-10-16_funded-env/` — attempted at bind, pinned-scope cumulative $80.86/2,430 rows ≥ ~$60, refusal recorded, $0 spent; GD-FUNDED.1-1 ruled CARRY; REQ-FND-7 drivers committed for every non-registry item |
| REQ-NAVT-5 keepalive leg | MET-ENGINEERED(D-SPA.24-1) | **deferred → deviation row 5** | marker minted (`page-mount.tsx`); R10.keepalive committed `paid:false` `expected:"red"` — needs a domains-bearing stage (collab wire is domains-only) |
| the 10 other MET-ENGINEERED carriers | NAVC-18/ECON-4 landed substance | **deferred → deviation rows 5/12** | REQ-OPS-4→D-R5OPS.1-1, REQ-COST-1→D-COST.1-1, REQ-COST-6→D-COST.1-2, REQ-FIX-T8→D-FIX.1-1, REQ-FIX-T15/T16→D-FIX.1-2+D-CAP.2-1, REQ-FIX-BL22-T7DEST→D-FIX.1-4, REQ-FIX-BL78-5B4/5B5/M31→D-FIX.1-3 — §R5.2 |

**Result: zero R5CAP.1 routings left undecided** — every row reads fixed (none required),
deferred-with-compensating-control, or a named deviation row.

## R5.2 The honestly-owed carrier census (re-owed, verbatim)

Every OPEN row the contract names was re-read this run and is re-owed with a dated note on
its DEFERRALS cell. None was closeable by an offline ticket; none was fabricated.

| carrier | what it still owes | its unblock |
|---|---|---|
| D-CAP.2-1 | all 21 `paid:true` legs + §5.6 census items | a fresh operator envelope ruling (re-epoch / raise / carry — GD-FUNDED.1-1) |
| D-SPA.24-1 | N8 + R10.keepalive collab-wire preview legs | a domains-bearing stage |
| D-SPA.16-1 / D-SPA.20-1 | N9's billing/run-sheet legs | a Stripe-bearing stage (`stripe_unconfigured` on previews) |
| D-FIX.1-1 | T8's 410 expired-token arm | operator runs `mint-t8-export.mjs` + binds `JOURNEY_T8_EXPORT_TOKEN` |
| D-FIX.1-2 | T15/T16 live halves (`paid:true`) | the carried funded wave |
| D-FIX.1-3 | BL-78 substrate executions + probes | operator `--execute` (prod writes) + the B19B-riding ~$1 probe |
| D-FIX.1-4 | T16's digest-claim half | the weekly Monday cron — clock-bound |
| D-OPS.1-1 | signed-in preview legs (session/paid) | deployed tip or test-tenant sessions on non-prod |
| D-SPA.6-1 | the prod SSR `--expect-renderer` arm | the merge/deploy of the marker-bearing tip |
| D-COST.1-1 | billed-actuals before/after | D-OPS.2-1 console flip + ~24 h populate |
| D-COST.1-2 | `import_preview_p95_s` re-probe | real preview-import samples (cohort empty) |
| D-COST.1-3 | the six paused lever classes | an explicit ruling per lever/class (+ worker soak) |
| D-SLO.1-5..8 | the four named-red SLOs | real-traffic remediations; targets never re-based |
| D-BL38.1-1 | the `prod:d5a74cc` short-sha stamp | operator fix-shape ruling (rewrite / re-stamp / accept) |
| D-BL38.1-2 | `01M3SK38…` purge verify | ~2026-10-30 tombstone+30d — clock-bound |
| D-R5OPS.1-1 | first-finding ≤4-min query | organic (non-test) signups — cohort empty |
| D-R5OPS.1-2 | the CDN origin-read repair | delivery-contract ruling + the IAM/deploy arm |
| D-SPA.28-1 | cleanup-wave entry gate | all flips merged + ≥1 nightly green |
| D-OBS.1-3 | first scheduled nightly green on the deployed SHA | the merge sweep — `github.sha` = `main` HEAD post-merge |
| D-OPS.2-1 | the BigQuery billed-actuals export | operator console flip + ~24 h populate (H8-bundle item) |
| D-P0.15-4 | live nightly golden + manifest | GD-R5OPS.1-1 ruling + a live engine + cohort |

## R5.3 ACCEPTED-deviations list — proposed for operator signature at GATE-ACCEPT.R5

> R5CAP.3 does not sign these. Each row is a deviation the closure **proposes** the
> operator accept; signature happens at `170_GATE-ACCEPT.R5` (readout
> `docs/build/readouts/GATE-ACCEPT.R5.md` + a GATE DECISIONS row — both operator-written).

| # | Deviation | What deviates | Why it is sound | Compensating control | Covering row | Sign-off |
|---|---|---|---|---|---|---|
| 1 | Intent-preload ships **none** | REQ-NAVM-7's delegated `pointerover`/`focusin` preload + `PRELOAD_SAFE` allowlist is deferred, unscheduled | The spec itself defers it (§2.6): blanket intent-preload is unsafe — fuzzy `**` non-document GETs can side-effect (A5-F3); doc-nav parity keeps clicks correct without it | `defaultPreload:"intent"` removed + the deferral documented at `spa/main.tsx:58`; a named follow-up owns pin-verified `preloadRoute` coverage | follow-up ticket (unnamed; deviation records the deferral) | ☐ operator |
| 2 | Phone contract boundary **ratified**: dossier stays SPA at phone width | A naive reading of "phone → SSR" would force-SSR the dossier; the contract is narrower — REQ-ED-12 forces SSR only on the five Page-family GETs | Live-verified on `ffbb8ad` (VERIF.1): `/p/:p/review/:runId` is sole-renderer SPA (SPA.27); `spa` + `data-device="phone"` IS the correct verdict; the leg was corrected to reject SSR there | `data-ssr-cause`/`data-device` markers asserted live — phone `/p/showcase/v/working` still serves `ssr`+`ssr-cause="phone"` (`reports/2026-10-15_VERIF.1-thin-legs/`) | D-SPA.28-1 thin-leg evidence; `runs/VERIF.1.md` | ☐ operator |
| 3 | Paid-leg caps computed **levered-expected** | §5.3 caps assume the post-§5.2 `testCheapRoute` arm (Haiku), with unlevered-measured as the fallback bound where a leg opts out | Q-ECON.e ratified the is_test server-default posture + explicit opt-outs; every opt-out leg (N6/R4/B19C — `testCheapRoute:false`, the model judgment IS the assert) carries its own full-tier cap | `JourneyStep.capUsd` on all 21 paid rows; `finishLeg` enforces `meteredUsd ≤ capUsd` — overrun = run-failing `cap_overrun` + window pause; uncapped legs refuse dispatch (exit 2/3) | `registry.ts` cap column; `runner.ts` enforcement | ☐ operator |
| 4 | NAVC-18 freshness **asymmetry** by design | `projectPageQuery` gains `staleTime: PAGE_SESSION_IDLE_TTL_MS` while dossier/run-report/run-sheet twins deliberately keep `staleTime: 0` | The mark-read/view twins' GETs ARE the read receipt — a nonzero staleTime would silently skip a mark-read per open; the spec records the trade-off per surface (REQ-NAVT-4 ordering honored) | `queries.ts:1270` vs `:860/:965/:1062`; per-twin census in `runs/NAVC.3.md`; warm-return zero-twin-GET pinned by R10 on pr-186 | `runs/NAVC.3.md`; `journey:R10` | ☐ operator |
| 5 | Posture-bound preview residuals **honestly re-owed** | 5 of VERIF.2's 44 `paid:false` legs cannot run on a preview: N8/R10.keepalive (collab wire is domains-only), N9 (`stripe_unconfigured`), T8 (operator mint), D-OPS.1-1/D-SPA.6-1 residuals | Preview posture genuinely cannot carry them; VERIF.2 re-owed rather than fabricate — 39/44 green, zero posture violations, every residual named | `expected:"red"` owed-reporting can never silently pass; each row carries its verbatim recipe + named stage prerequisite | D-SPA.24-1; D-SPA.16-1; D-SPA.20-1; D-FIX.1-1; D-OPS.1-1; D-SPA.6-1 | ☐ operator |
| 6 | The funded wave stays **carried** — $0 spent | The 21-leg `paid:true` wave + §5.6 census items did not execute: the PASSED window refused at bind ($80.86 cumulative ≥ ~$60); operator ruled CARRY (GD-FUNDED.1-1) | The regime is mechanically fail-closed and was exercised end-to-end — dsn/cumulative/headroom/caps/ordering/tenant/exclusions all measured; refusal is the system working, not a gap | `reports/2026-10-16_funded-env/`; REQ-FND-7 drivers committed for every non-registry item; unblock = a fresh envelope ruling | D-CAP.2-1 + constituent carriers (D-FIX.1-2/-3 paid halves; stream-F rows) | ☐ operator |
| 7 | CDN-signed usercontent delivery is **configured but nonfunctional** | Q-CDN's "verify leg only" arm assumed the signed path worked; the leg found it does not — `AccessDenied` 403 signed/unsigned/corrupted alike | Config verified (`enableCdn`+`USE_ORIGIN_HEADERS`+`signedUrlKeyNames`); the defect is LB→private-bucket origin read denied — out-of-band IAM/contract work, honestly surfaced | `usercontent-cdn-verify.mjs` re-run recipe committed; the named ruling chooses the delivery contract (edge-signed vs api-minted) + the origin-read grant | D-R5OPS.1-2; `usercontent-cdn-verify.json` | ☐ operator |
| 8 | Golden-run budget ruling stays **AWAITING** | The ~$150–300/night nightly-golden spend (⚑ Q-GOLDEN) was never ruled; the live golden + manifest stay deferred | The driver landed fail-closed — `--execute` refuses without `GOLDEN_BUDGET_RULING=approved` + measured `--scores`; the absent-manifest exit-0 is marked NON-EVIDENCE, so nothing can fabricate a green | `nightly-golden-driver.mjs` + pin; GD-R5OPS.1-1 sits in GATE DECISIONS as an open operator item — flagged here, not answered | D-P0.15-4; GATE DECISIONS 2026-10-15 | ☐ operator |
| 9 | First nightly green + the prod layer owe to the **merge sweep** | The scheduled nightly can't read green on unmerged code (`github.sha` = `main` HEAD ≠ chain tip); prod still serves pre-chain `ffbb8ad` — every round-5 verdict rests on staging-verified (pr-186) or committed-tree evidence | Merge order is operator-owned (BL-01/H8); no round-5 REQ required prod deployment — the spec's live legs were explicitly preview/prod-arm routed where owed | VERIF.1's `ffbb8ad` SHA-exact pass + VERIF.2's preview wave are the recorded proxies; D-SPA.28-1's nightly clause + D-OBS.1-3 carry the first green | D-SPA.28-1; D-OBS.1-3; BL-01/H8 | ☐ operator |
| 10 | The ~$50/mo target is **unmet** — $198.32 stands | H9's class authorization covered only scale-to-zero/consolidation; the remaining ~$145 needs the paused redesign classes | Honestly reported, never smoothed: class-A executed inside the ruling ($285.80→$198.32 list-price, before/after committed); every paused lever is a stage-fact flip + `pulumi up` behind its own ruling | `docs/ops/redis-degradation-analysis.md` bounds the Redis design change; the `rhema-prod-budget-50` alert still fires on actuals; billed-actuals reconciliation waits D-OPS.2-1 | D-COST.1-1/-2/-3; `reports/2026-10-16_COST.1/` | ☐ operator |
| 11 | The H8 operator bundle is **partial** | ~12 items stay operator-owed: merge sweep, invite mint, Stripe live verify, admin key, pen test, exposure review, BL-13/68, BL-30/75, BL-50/51, BL-41/42, D-OPS.2-1, D-MAINT.4-1, cite1-cap-recon | Only the Resend seed discharged (delegated, seeded 2026-10-16 — `rhema-nonprod-resend-api-key` v1); the rest are human/operator acts no worker can perform | `projectStatus` stays IN_PROGRESS; every row is named-owned (the H8 checklist + the census table — none unowned, none floating) | `150_HUMAN-H8` checklist; REQ-G1-5 census row | ☐ operator |
| 12 | Clock-, cohort-, and ruling-bound residuals | T7 destruction (~30 d clock), D-BL38.1-2 purge verify (~2026-10-30), T16 digest claim (weekly cron), first-finding ≤4-min (no organic signups), `import_preview_p95_s` (zero samples), billed actuals (D-OPS.2-1 console flip), `prod:d5a74cc` fix-shape ruling, the four named-red SLOs | Each is owed on a clock, an empty cohort, or a ruling — not on engineering; every row carries its proxy + verbatim verify recipe | Fire dates ledgered; queries/scripts committed read-only or guarded; D-SLO.1-5..8 targets never re-based — the reds stand | D-FIX.1-4; D-BL38.1-1/-2; D-R5OPS.1-1; D-COST.1-2; D-COST.1-1; D-SLO.1-5..8 | ☐ operator |
| 13 | Spec fold-back lands **after** this gate | REQ-MEM-6/7/8 (the `frontend-spa-spec.md` §7/§14 + `rhema-design-spec.md` banner amendments) are MISSING at signature time | The manifest assigns them to R5REC.2 (row 172 — the next-but-one chain row); the signed deviations do not conceal the gap, they schedule it | Named owner + decomposed contract; the round-5 ADR lands with it | manifest row 172 (`172_R5REC.2__spec-reconciliation.md`) | ☐ operator |
| 14 | The whole honestly-owed tail stays OPEN as tracking | Every carrier in §R5.2 + the wider DEFERRALS corpus (D-OPS.2-1, D-MAINT.4-1, historical rows) | Per the GATE-ACCEPT.SPA precedent: scoped OPEN rows are dispositioned by the signatures — tracking items carrying unblock conditions, not gate-blocking | Every row is ledgered in DEFERRALS.md with proxy + unblock + verify recipe; dated re-owal notes appended this run | §R5.2 census; `docs/tickets/DEFERRALS.md` | ☐ operator |

## R5.4 Note items for the signature (not deviations — open operator facts)

- **GD-R5OPS.1-1 is still AWAITING.** The ~$150–300/night golden-run budget ruling
  (⚑ Q-GOLDEN) is an open operator item carried into this register as deviation row 8 —
  R5CAP.3 records it; the operator answers it.
- **GD-FUNDED.1-1 was ruled CARRY** — the funded legs' unblock is a *future* envelope
  ruling (re-epoch `FUNDED_ROUND_SINCE`, raise `FUNDED_WINDOW_CAP_USD`, or continue
  carrying). Not a fix, not a defect — a named unblock.
- **`projectStatus` stays IN_PROGRESS.** REQ-G1-5 is PARTIAL (the H8 bundle remainder) and
  the carried/open rows of §R5.2 remain ledgered on BACKLOG.csv — the CURRENT STATE close
  rule ("DONE only when every open row has a landed disposition") is met only in the
  weaker sense R5CAP.1 recorded: every row has a *landed disposition* (named deferral,
  named ticket, or named owner). DONE requires the operator's own closure pass.

## R5.5 Verdict & verification record

- Deterministic: `pnpm turbo build lint typecheck` + `pnpm test` green (docs-only diff —
  counts recorded in `runs/R5CAP.3.md`); `check-build-memory.sh .` 0 violations;
  `check-append-only.mjs --base ddbd2e7` clean; `check-coverage-matrix` green.
- Deferral ledger: **zero flips** — 21 contract-named rows re-owed with dated notes
  (carriers verbatim); no row was closeable offline; none fabricated.
- Coverage matrix: the REQ-G1-1 row's evidence/owning tickets now cite this closure
  (`R5CAP.3`); the 752-id union otherwise unchanged.
- ADRs: none — no owned decision this run (the deviations register drafts; the operator
  decides at row 170).
- **Build state: IN_PROGRESS.** `nextTicket` → `GATE-ACCEPT.R5` (row 170 — an operator
  gate). Nothing is merged; nothing is claimed DONE.

## §R7 — the list GATE-ACCEPT.R7 signs (drafted by 251_R7CAP.1, 2026-11-08)

Round 7 has no CAP.3; this section is the acceptance-list draft produced by R7CAP.1
(`docs/build/reports/CAPSTONE_GAP_ANALYSIS_R7.md`). The operator signs this list — or
rules each item — at 252_GATE-ACCEPT.R7.

### (a) Deployed + coverage posture signed as round-7 close

Prod serves `e578a767` (provenance all-PASS web+api); both phase deploys ran under
GD-DEPLOY.R7 with deployments rows + CDN invalidations; preview spend ≈$14/$20.
Coverage: 135/135 round-7 REQ ids verdicted — 111 MET · 18 MET-ENGINEERED · 1 PARTIAL ·
3 MISSING→routed (252/253/254) · 1 N/A (REQ-WRITE-3→BL-97). Finding map: 0 unmapped.
Deferral census: no round-7 OPEN row without owner+date.

### (b) Deferrals accepted into the tail

| row | what is owed | owner |
|---|---|---|
| bespoke-capture bundle (~30 rows: D-R7KIT.1-1, D-R7COPY.0-1/-1b-1/-1c-1, D-R7SHELL.1b-1/-1c-1, D-R7TALK.1b-1, D-R7HOME.1-1/-2b-1, D-R7WRITE.1a-1, D-R7KIT.3{a,a2,b,c2,d,f,e,1a,2a,1b,4b,5b,6a,6b}-1, D-R7RO.2-1, D-R7DEM.5-1/-4-1, D-R7SHELL.2-1, D-R7RELOAD.1-1, D-R7TALK.1a-1/-1a-2, D-R7WRITE.1b-1) | bespoke Stage-B captures beyond the green leg board | 253_R7REC.1 sweep |
| D-R7DEM.2c-1 | parseDraftLedgerSections Roman-numeral fix | 253 → BL-100 |
| D-R7TOUR.2-1 (prod arm) | D2.tour prod flip once the F-9 asset-class defect is fixed | the F-9 insert |
| D-R7DEP.2-2 | F-10…F-14 product defects (credit copy, P1 links, axe, select, checkbox) | post-round defect insert |

### (c) Deviations + waivers for signature

- REQ-KIT-5: R7KIT.3a declared +15.3 kB vs the ≤15 kB allowance — honest declaration, ruling owed.
- `U3.stopgap` superseded by `U3.occlusion` (R7a-era surface retired by R7b).
- D2.tour's prod red is an asset-parity class (hero mp4 served 206 correctly), not tour code.
- The one authorized paid U6 dispatch failed HTTP 402 (unfunded identity; metered $0.00; paused per GD-UX-PAIDLEG.R7) — paid re-dispatch authority is the operator's ruling.
- HUMAN-H16 produced no F-R7UX-* rows — waived as skipped/undispositioned unless the operator rules otherwise.
- Env-bound Stage-B legs recorded (`JOURNEY_DATABASE_URL`, unexpired token, pre-existing magic-link loop).
- GD-DEPLOY.R7 + GD-UX-PAIDLEG.R7 expire at this signature.
