<!--
  docs/build/planning/2026-09-30_planning-ledger.md — round-3 re-planning ledger (decompose-spec mode=extend).
  The partition + per-ticket briefs from which docs/tickets/59…93 (+ 85a, 88a) were authored. Historical once the round is
  seeded: corrected by a dated note, never rewritten. Companion: 2026-09-30_decision-memo.md (options), the prod
  design review (reports/2026-09-30_prod-design-review.md), docs/build/BACKLOG.csv (65 rows).
-->
# Round 3 — planning ledger (2026-09-30)

## Decisions (operator, 2026-09-30)

| id | question | answer | by |
|---|---|---|---|
| D1 | Merge #48–#80 before round 3? | **No.** The operator merges later. Round 3 builds off the latest chain tip `stevevitali/stb-4-real-money-external`, and REC.3 writes the integration plan. | operator |
| D2 | Hotfix now, out-of-band? | **No.** Security and hotfixes are chain tickets (SEC.1, HOT.1 first) driven by orchestrate-build. | operator |
| D3 | Trial + pricing | **Keep the free trial review.** Pricing is Claude's judgment → **charge what we meter** (§14.1 restated; REQ-SPEC-32); the plan price anchors are unchanged and "what it covers" is recomputed from measured cost cards. The trial moves to **interim terms** tied to measured COGS (REQ-SPEC-8 amended), plus a COGS-reduction ticket (ECON.2) that restores the spec's trial terms when met. See ADR-014. | operator (keep trial) + Claude (pricing) |
| D4 | A review with zero successful fetches | **Fail-soft, honest, refunded:** preflight the web tools before any debit; a zero-fetch review delivers as *Unverified* with its research phases refunded and an ops alert (REQ-SPEC-31, ADR-015). | Claude (delegated) |
| D5 | G2 / H2 | **Stay deferred.** Not scheduled in round 3. G2 remains the HARD gate before §16.4 claims and public launch; the launch-surface lint keeps enforcing "no superiority claims". | Claude (delegated) |
| D6 | Round-3 spend envelope | ~~≤ $300~~ **revised the same day: hard ≤ $200, target ≤ $100** (see the Budget note) — originally **≤ $300 total live inference** across the round, within per-ticket caps (below), plus a weekly paid journey run ≤ $10/week once JOURNEY.1 lands (the nightly journey runs $0 legs only). See the standing authorization. | Claude (delegated) |
| D7 | Build-memory cleanup | **Yes** — MAINT.2 is an early chain row. | operator |
| — | Operator's own product feedback | **Skipped this round.** The agentic browser review (the `PR-*` findings) stands in. | operator |

**Standing authorization for round 3** (D6; revised after the Phase-4 review; the operator may veto by editing
LEDGER GATE DECISIONS). All dollar caps are measured on **proxy-metered cost** (what the platform pays), never on
debits.

*Pre-authorized:*
- live inference within each ticket's stated cap
- `pulumi up prod` of a chain-tip SHA whose `pulumi preview` shows **zero replace/delete on stateful resources**
  (Cloud SQL, buckets, Redis, secrets), whose migrations pass the **additive-migration lint** (no DROP, rename,
  type-narrowing, table rewrite or role change), and whose monthly cost delta is ≤ $15
- IaC-**generated** secrets for **new** roles only (never a rotation)
- OPS.1 creating and destroying **its own** `pr-<n>` stacks (a hard refusal on `stack=prod`)
- the weekly paid journey run (≤ $10, ≤ 300-word fixture); this authorization **ends when round 3 closes**

*Still pauses for the operator:*
- any real-money charge
- creating or rotating any third-party credential (Stripe, Anthropic, Google, Resend, the test mailbox)
- destroying or replacing a stateful resource
- DNS changes
- `signup.mode` flips
- infra cost deltas > $15/month
- **database role changes** (SEC.1's switch)
- **one-off prod data writes** (backfills, grants, deletes)
- **changes to what users are charged**: ECON.1's metered-debit flip, ACT.1's trial terms going live, BILL.3
  re-opening purchase
- **creating Stripe live-mode products, prices or webhooks**
- **any ADR that relaxes a spec target** (e.g. SLO re-basing)
- anything a ticket's Gate status lists

## Spec changes this round (applied via the amendment protocol, 2026-09-30; revised after the Phase-4 review)

**New:**
- **REQ-SPEC-29** — user-journey acceptance (JOURNEY.1; §13.5)
- **REQ-SPEC-30** — tenant isolation in depth (SEC.1; §11.4 / §13.3)
- **REQ-SPEC-31** — research integrity (RES.1; §12.8 / §8.4)
- **REQ-SPEC-32** — cost truthfulness (ECON.1 / EST.1 / ACT.1; §14.1 / §14.4 / §15.2)

**Amended (notes; original text preserved):**
- **REQ-SPEC-8** — interim trial terms: Standard rigor on Base, with a word cap **derived from measured cost cards**
  under a provisional $15-list ceiling (ACT.1)
- **REQ-VIS-9** — reconciled with ADR-006 Path B and REQ-SPEC-31
- **Appendix D.2** — *Unverified* (a run-level delivery label) is reserved, distinct from the claim verdict
  `unverifiable`
- **REQ-IDE-13** — the sheet shows and changes the model tier within plan rules (EST.1)
- **REQ-SPEC-1** — gate labels derive from the same defaults table; informational never blocks (RUN.1)
- **REQ-GROWTH-1** — the 20 s import becomes a §13.5 SLO signal; the held draft persists until consumed (ONB.1)

ADRs: ADR-013 (round-3 scope + D1/D5/D6/D7), ADR-014 (charge what we meter + interim trial + tier control),
ADR-015 (research integrity, refines ADR-006), ADR-016 (browser-journey acceptance), ADR-017 (tenant isolation
in depth).

## Sizing + conventions

- **Sizing:** `dispatchTarget: subagent` (hard one-window ceiling), so every ticket is sized to fit one fresh
  `implement-spec` context with rigor headroom.
- **Stage split:** tickets follow the house Stage A (code + tests, PR) / Stage B (deploy + live legs within cap)
  pattern. Stage B acceptance uses the JOURNEY.1 harness once it has landed.
- **Chain:** every row forks from the previous row's branch (stacked PRs, `mergePolicy: OPERATOR`).
  `base_branch: current checkout`.

## The partition (revised after the Phase-4 review — see its record below)

| # | file | id | scope (one line) | absorbs (BL / PR) | REQ (primary owner **bold**) | cap (metered) |
|---|---|---|---|---|---|---|
| 59 | `59_SEC.1__tenant-isolation-in-depth.md` | SEC.1 | split the DB roles: the user-serving pool (`DATABASE_URL`) → a non-BYPASSRLS role; `SYSTEM_DATABASE_URL` keeps the bypass for system sweeps only; the suite runs as the user role; a lint stops user-route code importing the system pool; audit of system-pool call sites; two-tenant probe; rollback; emit the list of RLS-only user queries exposed since `0026_system_bypassrls` (2026-09-17) for H7 | BL-08 (PR-S1) | **REQ-SPEC-30**, REQ-DATA-4, REQ-ARCH-30 | $0 — role switch operator-paused |
| 60 | `60_HOT.1__prod-hotfix-pack.md` | HOT.1 | dossier 500 + contract tests over the Showcase seed and older evidence shapes; `/assets/page.js` route + the bundle↔route parity test; the Quiet-group affordance; the digest `runs.finished_at` query; LB request logging on; a `claims` config that hides the false "first review included" / "≈N loops" lines until their owners re-enable them; deploy incl. the STB.4 Stripe fixes | BL-52(a), BL-53(a), BL-54, BL-65(O1, O3-logging), BL-09 (fixes) | **REQ-POS-3**, REQ-GROWTH-11, REQ-IDE-4, REQ-SPEC-29 (parity half) | $0 |
| 61 | `61_JOURNEY.1__browser-journey-acceptance.md` | JOURNEY.1 | Playwright journeys (`packages/journeys`) with a per-step owner + an expected-red flag (each owning ticket turns its step green); sessions via the **real magic-link flow into an operator-provisioned test mailbox** (no minted tokens); test tenants flagged, excluded from SLOs and the trial kill switch, and auto-purged; nightly $0 + weekly paid (≤ 300-word fixture); the deploy-provenance ↔ chain-tip check | BL-32 (automatable half) | **REQ-SPEC-29**, REQ-ARCH-39 | ≤ $10 |
| 62 | `62_MAINT.2__build-memory-hygiene.md` | MAINT.2 | LEDGER OPEN FINDINGS/RETURN PASS cleanup + size cut, § Plan extensions backfill (09-22…09-26), stale DEFERRALS flips per BACKLOG.md § Stale rows + the BL-49 flips, the prod test-data inventory for H7 | BL-02, BL-49, BL-38 (inventory) | — | $0 |
| 63 | `63_RES.1__review-research-restore.md` | RES.1 | diagnose + fix `web_search` never reaching the model (suspect: the PRB.22 run-wide budget exhausted by earlier phases/subagents, `handler.ts` ~350–371); **own the research floor** (verification is never starved); the preflight of every model × server-tool pair the run uses (incl. the Haiku subagent) before any debit; a ≤ $1 single-phase probe fixture on the planted-error essay | BL-56 (PR-Q1) — diagnosis/fix half | **REQ-SPEC-31** (preflight + floor), REQ-VIS-9, REQ-SPEC-11 | ≤ $15 |
| 64 | `64_RES.2__unverified-delivery-and-refund.md` | RES.2 | *Unverified* delivery defined on verification's coverage of checkable claims; the platform-fault refund (a new class, carved out of REQ-SPEC-24(6)'s failed-only rule; re-verification is a new run); label on card/dossier/email; ops alert; excluded from SLO success; the D.2 vocabulary; trial entitlement restored when the trial review is Unverified (hook for ACT.1) | BL-56 — delivery/refund half | REQ-SPEC-31 (delivery half), **REQ-IDE-18**, REQ-IDE-25 | ≤ $5 |
| 65 | `65_BILL.3__credit-purchase-path.md` | BILL.3 | run-sheet Add credits (CSP `form-action` vs the Stripe redirect); billing top-up/subscribe "no checkout URL"; the pending-checkout email that no job sends; the billing failure-state integration tests; a live checkout page reached (no charge). Re-opening purchase is operator-paused | BL-51 (PR-J2), BL-09 (email item) | **REQ-BILL-16**, REQ-BETA-15, REQ-GROWTH-13 (half) | $0 |
| 66 | `66_ECON.1__charge-what-we-meter.md` | ECON.1 | the root cause of committed-vs-metered (632 vs 1,625); rigor presets conform to §6.5 (Quick ran discourse + second read — PR-E6); instrumented cost cards (workflow × rigor × tier × size) → the estimator refit → caps (REQ-BILL-7) in a **durable** calibration store; `debitMode = metered` behind a flag, shipped **with** the calibrated caps, the flip operator-paused and preceded by paid-account notice; the F5 settlement live proof; the admin-key reconcile leg (H7-gated) | BL-13 (debit/calibration), BL-14, BL-10 (F5 proof) | **REQ-SPEC-32(a)**, **REQ-BILL-7**, REQ-SPEC-24, REQ-ARCH-35 | ≤ $40 |
| 67 | `67_EST.1__one-estimate-everywhere.md` | EST.1 | every pre-run figure (protocol cards, Timeline chip, run sheet, post-confirm, palette, pricing page cost cards, landing figures) from the one calibrated estimator; tier control (REQ-IDE-13 amended; `normalizeTier` at `server.ts` ~5058); correct "why this estimate" + claim count; duration ranges; the estimate route's 400 on a bad `modelTier`; the lever-matrix flake | BL-57 (PR-E1/E3), BL-58 (PR-E2), BL-11(a), BL-12 | **REQ-SPEC-32(b)**, **REQ-IDE-13**, REQ-BILL-1/5, **REQ-GROWTH-4** | ≤ $10 |
| 68 | `68_RPT.1__live-meter-and-run-report.md` | RPT.1 | the live meter from provisional usage; the run report reconciled (spent = Σ debits; seat split = metered; real phase durations; per-request detail); the Showcase run out of usage history | BL-57 (PR-E4/R3) | **REQ-BILL-9**, REQ-BILL-6, REQ-GROWTH-11 (usage half) | ≤ $5 |
| 69 | `69_SEC.2__signup-admission-and-throttle.md` | SEC.2 | `signup.mode` + the invite field on signup/login (not first under open mode); a shared Redis throttle store across instances; live enforcement exercised | BL-23 | **REQ-BETA-19** (note), REQ-GROWTH-15 (throttle half) | $0 |
| 70 | `70_ACT.1__trial-entitlement.md` | ACT.1 | the trial entitlement (the sheet shows *Included*) at Standard/Base with a word cap derived from ECON.1's post-RES.1 cost cards under the provisional $15 ceiling (zero cap deaths at that cap); the first-spend unlock checks (REQ-GROWTH-10); the daily trial kill switch, 1 concurrent, Base-only; **owner of the claim render model** (trial/landing/pricing claims + the pricing-page content defects); trial go-live operator-paused | BL-50 (PR-J1), BL-62 (PR-U6 content half) | **REQ-SPEC-8**, **REQ-GROWTH-10**, **REQ-GROWTH-15**, REQ-SPEC-32(b) (claims half) | ≤ $20 |
| 71 | `71_ONB.1__import-latency-and-held-draft.md` | ONB.1 | text import ≤ 20 s p95 (convert cold start); the held landing draft persists until consumed; import fidelity (H1, relative figures); the `import_preview_p95_s` signal | BL-60 (PR-R4), BL-64 (PR-R5) | **REQ-GROWTH-1**, REQ-ARCH-23 | $0 |
| 72 | `72_EDIT.1__edit-path.md` | EDIT.1 | editing a locked version forks to v(N+1) without confirm (no 404); `/v/working` resolves to the editable head; the Page editor mounts + saves in a real browser; `my-first-project` recoverable. **No working copies** (1.x) | BL-53(b,c) (PR-J4) | **REQ-IDE-32**, REQ-DATA-21, REQ-DATA-14, REQ-IDE-43 | $0 |
| 73 | `73_RUN.1__run-and-chat-defects.md` | RUN.1 | chat turn 502 + Send occlusion; gate labels from the defaults table (the informational Approve-scope never blocks); the walkthrough job failure | BL-55 (PR-J6), BL-59 (PR-R1), BL-52(b) | **REQ-SPEC-1**, REQ-GATE-1, **REQ-CHAT-9**, REQ-CHAT-14 | ≤ $5 |
| 74 | `74_OBS.1__observability.md` | OBS.1 | the api `PassThrough` listener leak; structured error logs for unhandled route errors (no user/prompt text); 5xx error reporting on top of HOT.1's LB logs | BL-65 (O2, O3-reporting) | REQ-VIS-11, REQ-ARCH-13 (instrumentation half) | $0 |
| 75 | `75_SLO.1__prod-slo-remediation.md` | SLO.1 | run-start p95 (473 s), gate-resume (270 s), event delivery, success rate; probe-definition fixes; §13.5 targets met — any re-basing is an operator-paused ADR | BL-07 (PR-R2) | **REQ-ARCH-13**, **REQ-ARCH-34** | ≤ $20 |
| 76 | `76_UX.1__copy-ia-brand.md` | UX.1 | "private beta" copy under open mode, the build-jargon sweep, hide unbuilt workflows, the inbox count/noise, per-page titles/meta/OG/favicon, a single h1, the `/showcase` route, a branded magic-link email | BL-61 (PR-U1–U4), BL-63 (PR-U8/U9) | **REQ-SPEC-2** (copy half), REQ-IDE-41 | $0 |
| 77 | `77_UX.2__layout-responsive.md` | UX.2 | `/app/new` shell styling, pricing phone overflow (layout half), the phone project action row / synced overlay / tap targets, a WCAG pass on touched surfaces | BL-62 (PR-U5, PR-U6 layout half, PR-U7) | **REQ-MOBILE-3**, **REQ-SPEC-20**, REQ-IDE-42 | $0 |
| 78 | `78_DEF.4__ledger-integrity-refund-window.md` | DEF.4 | reconcile write ordering + held≥0 validate parity + the nightly balance recheck; the scoped second-read guidance; the §14.4 user refund window / cancel-with-partials (merged BILL.2) reusing RES.2's refund plumbing — platform-fault refunds don't count toward the user refund limit | BL-10 (minus F5), BL-11(b), BL-30 | **REQ-SPEC-24**, REQ-BILL-3 | ≤ $5 |
| 79 | `79_SEC.3__run-task-confinement.md` | SEC.3 | distroless run-task image with vendored applets + a tight AppArmor profile replacing `Unconfined`; a live privsep check | BL-26 | **REQ-SPEC-10** | ≤ $10 |
| 80 | `80_OPS.1__preview-stages.md` | OPS.1 | `dev` full stack + one `pr-<n>` preview up/destroy (never `prod`) | BL-25 | **REQ-ARCH-38** | ≤ $20 infra |
| 81 | `81_OPS.2__iac-drift-cost-cache.md` | OPS.2 | manual prod changes into IaC/runbook, Cloud Run scaling drift, measured monthly bill vs target + HA pre-plan, self-hosted Turbo cache | BL-27, BL-28, BL-29 | **REQ-ARCH-39** | $0 |
| 82 | `82_CITE.1__citation-completeness.md` | CITE.1 | fetch-then-cite reliability / delivery-time backfill so Path B strips rarely; a measured citation-completeness rate (before ECON.2, so COGS is measured on the final pipeline) | BL-15 | **REQ-VIS-9**, REQ-IDE-25 | ≤ $15 |
| 83 | `83_ECON.2__cogs-reduction.md` | ECON.2 | named levers — transcript bounds, verification fan-out, per-phase model routing, skill-text caching, research above RES.1's floor — with **non-regression ACs** (the planted error still Contradicted; REQ-SPEC-31 coverage holds; CITE.1 completeness not reduced; the second read kept); re-derive the cost cards; the REQ-SPEC-8 restore flip (operator-paused) | BL-13 (churn half) | **REQ-SPEC-32(c)** | ≤ $40 |
| 84 | `84_STB.5a__headless-live-legs.md` | STB.5a | the $0 headless legs on the journey harness | BL-21, BL-22 | per row | $0 |
| 85 | `85_STB.5b__bounded-paid-live-legs.md` | STB.5b | the paid bounded legs | BL-16–19 | per row | ≤ $40 |
| 85a | `85a_HUMAN-H7__round3-operator-legs.md` | HUMAN-H7 | the operator legs (**start now**; placed before the tail so GATE-ACCEPT reads it): exposure review (SEC.1's list), test-data cleanup (MAINT.2's inventory), live-mode Stripe, admin key, pen test, nightly-golden budget, H3 revisit, real-device checks, the research-burst product ruling (BL-20), the launch-verification remainder (BL-24), the JOURNEY.1 test mailbox, the paid-account notice timing | BL-20, BL-24, BL-32–39 | — | — |
| 86–93 | CAP.1 · CAP.2 · CAP.3 · 88a GATE-ACCEPT · REC.1 · REC.2 · REC.3 · DOC.1 · DOC.2 | tail | the standard v2 tail (`build-memory/templates/tail/`) | BL-01, BL-03–06, BL-47 | capstone ids | CAP.2 ≤ $15 |

**Excluded from round 3 (recorded, not dropped):**
- BL-31 (matcher-3 tuning) needs H2 adjudication data → round 4.
- BL-40–45 (H2/G2) stay deferred (D5).
- BL-46 is accepted.
- BL-48/49 are closed; the BL-49 flips are executed by MAINT.2.

**Budget:** Σ caps ≈ $255 inference + $20 infra, within the $300 D6 envelope.

> **Amended 2026-09-30 (operator — D6 revised):** the round-3 limit is **hard ≤ $200, target ≤ $100** (metered, infra
> included). Per-ticket Stage B caps (hard / target): JOURNEY.1 5/3 (weekly paid journey ≤ $5/week) · RES.1 10/5 ·
> RES.2 3/2 · ECON.1 30/15 · EST.1 5/3 · RPT.1 3/1 · ACT.1 12/6 · RUN.1 3/2 · SLO.1 10/5 · DEF.4 3/1 · SEC.3 5/3 ·
> OPS.1 15/8 infra · CITE.1 10/5 · ECON.2 30/15 · STB.5b 25/12 · CAP.2 10/5 — Σ hard ≈ $179 + ≤ $20 of weekly
> journeys; Σ targets ≈ $91 + ~$10. Each capped ticket carries a dated note: legs cheapest-first, stop when the
> evidence suffices, dropped legs become DEFERRALS rows. **Round-level control:** at every ticket boundary the
> orchestrator sums the round's metered spend from the PHASE LOG; at ≥ $100 it sets `pauseRequested: true` for the
> operator; it never starts a leg that could pass $200.

## Shared decisions and their owners (the fragmentation guard)

| decision | owner | consumers |
|---|---|---|
| the user-serving vs system DB roles + "never use the system pool from a user route" | SEC.1 | every later ticket touching SQL |
| the bundle↔route parity test; the `claims` visibility config | HOT.1 | JOURNEY.1 (asserts parity); ACT.1 / EST.1 (turn claims back on) |
| browser journeys: location, test-user sessions, the step-owner / expected-red registry | JOURNEY.1 | every later Stage B turns its steps green |
| the research floor + the preflight | RES.1 | RES.2, CITE.1, ECON.2 (may only cut above the floor) |
| the platform-fault refund class (the ledger reason code + the REQ-SPEC-24(6) carve-out) | RES.2 | DEF.4 (refund window), ACT.1 (trial restore) |
| debit mode + cost cards + the calibration store + cap derivation | ECON.1 | EST.1, RPT.1, ACT.1, ECON.2 |
| the one estimator API for surfaces | EST.1 | ACT.1 (claims), UX.1 |
| the claim render model (trial/landing/pricing claims) + the entitlement config | ACT.1 | UX.1, ECON.2 (restore flip) |
| structured error logging | OBS.1 | SLO.1 |

## Journey step registry (JOURNEY.1 owns the format; each step starts expected-red until its owner turns it green)

> **2026-10-01 (JOURNEY.1):** this table is now **historical** — the live registry is committed code at
> `packages/journeys/src/registry.ts` (`STEP_REGISTRY`), which records id, journey, assertion, owner,
> `expected` (`red`/`green`), and `paid` per step, plus the runner's flip semantics. Keep the table
> below as the design record; do not edit it to track flips — flip the code row.

| step | journey | what is asserted (visible text / actionable control) | owner |
|---|---|---|---|
| N1 | new visitor | the landing drop-zone holds a dropped draft across sign-in and later page loads | ONB.1 |
| N2 | new visitor | signup/sign-in via a real magic link into the test mailbox; the invite field is not the first field under open mode | JOURNEY.1 (form: SEC.2) |
| N3 | new visitor | the held draft becomes a project with its preview in ≤ 20 s | ONB.1 |
| N4 | new visitor | the sheet's estimate/duration agree with the protocol card, the Timeline chip and the pricing cost card for the same draft | EST.1 |
| N5 | new visitor | the trial Review shows *Included* and runs to delivery without a cap death | ACT.1 |
| N6 | new visitor | the delivered dossier shows ≥ 1 fetched-✓ claim, and the planted error is *Contradicted* with its source | RES.1 |
| N7 | both | a dossier renders, including the Showcase dossier | HOT.1 |
| N8 | both | editing a locked version forks to v(N+1) and the edit saves (sync pill) | EDIT.1 |
| N9 | new visitor | Add credits / Buy / Choose Writer reach a Stripe-hosted page (no charge) | BILL.3 |
| R1 | returning | the project list shows the user's projects (Quiet expandable, visibly) | HOT.1 |
| R4 | returning | a chat turn answers; Send is clickable at 1440×900 and at phone width | RUN.1 |
| R5 | returning | an export downloads | JOURNEY.1 (baseline) |
| R6 | returning | the run card's meter moves during a phase; the run report's spent = Σ debits | RPT.1 |
| R7 | returning | an informational gate does not block; labels match behaviour | RUN.1 |
| P1 | phone | project page / run sheet / pricing without horizontal overflow; primary actions are buttons ≥ 44 px | UX.2 |
| C1 | both | landing/pricing/trial claims equal the entitlement config and the estimator | ACT.1 (copy: UX.1) |
| X1 | two tenants | no foreign rows on `/voices`, `/usage`, project list, dossier, Inbox (API probe + journey) | SEC.1 |

## Phase-4 adversarial review (2026-09-30)

A fresh-context critique ran over the first partition. **Verdict:** "not sound as written; sound with revisions."
All 17 findings were accepted except #1 (a race: the spec notes and ADR-015 were written while the reviewer read).
The revisions applied above are:
- **The ECON.1 debit flip:** it now ships behind a flag together with the calibrated caps, and the flip is
  operator-paused with prior notice to paid accounts.
- **The trial:** Standard/Base, with a word cap derived from post-RES.1 cost cards. It no longer uses Quick, which
  §6.5 defines without second read or discourse.
- **SEC.1:** re-scoped to the role split, with the rollback and the exposure list.
- **The splits:** RES.1 → RES.1 + RES.2; EST.1 → EST.1 + RPT.1; STB.5 → STB.5a + STB.5b. BILL.2 merges into DEF.4.
- **The research floor:** owned by RES.1. CITE.1 now runs before ECON.2, and ECON.2 has named levers plus
  non-regression ACs.
- **EDIT.1:** re-cited to REQ-IDE-32/REQ-DATA-21, with no working copies.
- **Ordering:**
  - LB logging moves into HOT.1.
  - HOT.1 hides the false claims.
  - MAINT.2 moves after JOURNEY.1.
  - H7 moves before the tail.
- **JOURNEY.1:** step owners with expected-red flags, a real magic-link test mailbox (operator-provisioned), test
  tenants flagged and auto-purged, and a ≤ 300-word paid fixture.
- **Ownership moves:**
  - pricing-page content and the first-spend unlock checks go to ACT.1
  - the invite field goes to SEC.2
  - the pending-checkout email goes to BILL.3
  - the prod-shape contract tests go to HOT.1
- **REQ ownership:** one primary owner per REQ id.
- **D4 sharpened:** coverage-based, with a new refund class, a vocabulary entry and a REQ-VIS-9 reconciliation.
- **The standing authorization:** tightened, as the section above records.

The record is also summarised in `docs/tickets/00_MANIFEST.md § Decomposition decisions` (round 3).
