<!--
  docs/round-6-draft-spec.md — round-6 DRAFT specification.

  STATUS: **DRAFT — unratified — pending operator sign-off.**
  This is a planning artifact commissioned 2026-10-19/20 on branch
  `stevevitali/r6-planning-corpus` (off chain tip `d8bfebc`). It does NOT ratify round 6, edits no
  manifest row, opens/closes no deferral, schedules no deploy, and authorizes no spend. Every
  operator-owned quantity is marked ⚑ operator — no amount is invented here.
-->

# Round 6 — post-merge discharge + residual engineering — DRAFT

## 0. Status and authority

- **Unratified.** Round 6 exists only if the operator signs off on this spec; `nextTicket` remains
  `(chain exhausted)` and the manifest (rows 1–175 landed) is untouched by this document.
- **Predecessor ruling recorded:** the 2026-10-19/20 operator posture — "I'll merge the stack later.
  For now, we work off the latest chain tip. You should just deploy from the chain tip later on." —
  is ledgered in `docs/build/LEDGER.md` PHASE LOG (2026-10-20 entry: merge later, deploy from tip,
  corpus commissioned). Merge sweep stays `mergePolicy: OPERATOR`; production remains `ffbb8ad`
  until the operator acts.
- **What round 6 is:** discharge and verification of the 98 open/partial deferral rows + open
  backlog/finding items censused in `docs/research/r6_open_work_census.md` — i.e., proving landed
  code true on live stages, running carried live legs, executing operator-gated substrates, and a
  small set of in-tree repairs. **What it is not:** new product construction, new features, new
  surfaces, or marketing/efficacy claims.

## 1. Goals

1. Zero open engineering-fixable items in-tree (mount-settle flake, SLO head-fix, RES.3
   checkpointing, dep-drift, guard-binding convention).
2. Every merge+deploy-bound prod arm discharged on the deployed tip with provenance-matched
   evidence (`check-deploy-provenance --expect <tip>` all-PASS first).
3. The carried funded wave executed or honestly re-refused — never described as run without legs.
4. Every clock-bound item verified at its date; every operator-gated item either discharged in the
   operator session or re-parked with a dated ruling.
5. Memory reconciled: flagged backlog rows dispositioned (flip or named residual), capstone closure
   appended, ledger state updated by the closing run — not by this spec.

## 2. Posture — deploy from the tip

- Work branches continue off the **latest chain tip** (`d8bfebc` at census time — re-resolve at
  ratification). Deploy legs assume the operator's merge sweep + deploy of that tip to prod;
  nothing here performs either act.
- Preview `pr-<n>` stages remain available via `scripts/live/preview-stack.mjs` where a leg is
  preview-scoped; the nonprod Resend secret is already seeded (2026-10-16).
- Provenance discipline is unchanged: a "prod" leg is only prod when `build.gitSha` matches the
  deployed tip; the scheduled nightly can only go green after the chain lands on `main` AND prod
  carries that HEAD (D-OBS.1-3's recorded structural dependency).

## 3. REQ-id families (proposed)

| family | cluster | nature |
|---|---|---|
| `REQ-ENG-*` | in-tree engineering repairs | code/test/docs work, offline, CI-provable |
| `REQ-POST-*` | post-merge prod-arm verification | deployed-tip journey/evidence legs |
| `REQ-DISC-*` | operator-gated discharge | funded wave, guarded executes, posture stages |
| `REQ-CLK-*` | clock-bound verification | dated reads/sweeps |
| `REQ-TAIL-*` | reconcile + memory hygiene | backlog dispositions, capstone tail, ledger |

(Names are proposals; the ratifying session may renumber. Round-5 namespacing precedent: REQ-ids
are spec-stable, never reused.)

## 4. Clusters and acceptance criteria

### REQ-ENG-* — engineering repairs (offline; no live dependency)

- `REQ-ENG-1` mount-settle: `outline.dom.test.tsx` delete's cited refusal + all bare/`!` selector
  accesses replaced with mounted/settled `waitFor`; sibling `*.dom.test.tsx` audit committed;
  two consecutive green full-suite CI runs. (D-R5REC.1-1, BL-87)
- `REQ-ENG-2` SSE head-fix: post-commit wakeup on the finalize path (or equivalent) cutting the
  ~3s agent-completion delivery gap; in-tree proof + measurement-window re-read recipe committed.
  (D-SLO.1-6)
- `REQ-ENG-3` RES.3 contract: verification-phase `phase<N>` checkpointing + late-arrival contract +
  retry-gate consult + budget isolation; protocol change lands with tests; no paid leg may run
  before it. (D-RES.3-1, BL-79)
- `REQ-ENG-4` project-reference drift: the five `@rhema/*` packages gain their tsconfig references;
  `CIREP.1` check green. (open finding)
- `REQ-ENG-5` guard-binding convention: the system-role `JOURNEY_DATABASE_URL` binding convention
  documented where the runbook/ADR reads it; `$0` read re-proof recipe committed. (D-STB.5b-1, BL-72)
- `REQ-ENG-6` memory hygiene: BL-02 cell-shape sweep verified clean; flagged backlog rows (BL-06,
  BL-74, BL-80, BL-82, BL-24/22 partial flags) dispositioned — flipped with evidence or re-parked
  with a named residual. (R6TAIL-adjacent)

**AC:** `pnpm turbo build lint typecheck` + `pnpm test` + all six `check:*` green; two consecutive
full-suite CI greens post-ENG-1; no deferral cell edited without evidence.

### REQ-POST-* — post-merge prod-arm verification (gated on deployed tip)

Prerequisite: operator merge sweep + tip deploy; `check-deploy-provenance --expect <tip>` all-PASS.

- `REQ-POST-1` prod SSR arm: `--expect-renderer ssr` re-proof incl. phone-UA uncapped pane + edit
  POST + seam conformance + clean observability + control legs. (D-SPA.6-1)
- `REQ-POST-2` signed-in session legs: mailto/invite-accept/`/r/:token` expiry/OAuth initiation on
  prod (or preview where scoped). (D-OPS.1-1)
- `REQ-POST-3` deep-link restore: `…/v/<version>#f-<finding>` lands the host with `?view=findings` +
  anchor scroll, verified in the deployed suite. (D-CAP.1-1)
- `REQ-POST-4` nightly green: first scheduled `journeys.yml` nightly on `main` HEAD with
  provenance match + zero unexpected failures. (D-OBS.1-3, BL-74 residual)
- `REQ-POST-5` forensics read: `balance_divergence` classification of the six included-bucket
  accounts (system-role read; authorized posture only). (open finding, BL-24 family)
- `REQ-POST-6` posture stages: domains-bearing stage for D-SPA.24-1's N8/R10.keepalive legs;
  Stripe-bearing stage for D-SPA.16-1/-20-1's N9 legs. (class c — needs ⚑ operator stage/stripe
  posture; may be deferred by ruling)
- `REQ-POST-7` CDN repair leg **only after** the CDN delivery-contract ruling (⚑ operator):
  signed-URL key + origin-read grant per `scripts/live/repair-cdn-delivery.mjs`, then the
  signed-delivery legs re-run. (D-R5OPS.1-2, D-P1.22-2 residual)

**AC:** each leg's report committed under `docs/build/reports/`; provenance match; $0 spend for
free legs; no leg claims green without its committed evidence.

### REQ-DISC-* — operator-gated discharge

- `REQ-DISC-1` funded wave re-attempt: gates — **fresh envelope ruling ⚑ operator** + deployed tip +
  `JOURNEY_FUNDED_STABLE_TAG` tenant + system-role DSN; `funded-window.mjs --dry-run` 9/9 before any
  dispatch; ordering T9 → launchers → riders → B19C last-and-conditional; per-leg `CapOverrunError`
  armed. Covers D-CAP.2-1 + the 21 paid steps + every (b)-class row in the census. **If the bind
  refuses again, the refusal is the finding** — reported, not spent past.
- `REQ-DISC-2` guarded substrate executes: `mint-t8-export.mjs --execute` (D-FIX.1-1),
  `seed-bl78-fixtures.mjs --execute` + `--entitlement` (D-FIX.1-3, D-STB.5b-4, D-MAINT.3-1) —
  operator-authorization-gated prod writes; rollback lines executed or recorded.
- `REQ-DISC-3` golden run: **after** `GD-R5OPS.1-1` answers (⚑ operator) — nightly golden on a live
  stage + score-floor gate + exit-readout flip. (D-P0.15-4, BL-36)

### REQ-CLK-* — clock-bound verification

- `REQ-CLK-1` ~2026-10-30: `project.purge` fire for tombstoned `01M3SK380GQX41RKMD4KVFB34Q`
  verified in job table + tenant list. (D-BL38.1-2)
- `REQ-CLK-2` first Monday post-window: weekly digest claims the seeded stale-voice persona exactly
  once (`notification_deliveries` count = 1; second tick writes none). (D-FIX.1-4)
- `REQ-CLK-3` destruction half: purge-exempt tombstone's real +30d fire — or the operator hand-date
  arm. (D-P1.04-2)
- `REQ-CLK-4` billed-actuals read ≥24h after the D-OPS.2-1 console flip; classes P1–P5 appended.
  (D-COST.1-1; gated on operator flip)
- `REQ-CLK-5` measurement-window re-reads: D-SLO.1-5/-7/-8 verdict refresh on real-traffic evidence
  as windows elapse. (class g — may stay tracking past round 6)

### REQ-TAIL-* — reconcile + capstone tail

- `REQ-TAIL-1` backlog dispositions per REQ-ENG-6's flag list.
- `REQ-TAIL-2` spec-reconciliation residue: BL-05 fold-backs (G2/G3/H3 overrides, ADR lineage) —
  docs-only.
- `REQ-TAIL-3` round-6 capstone: CLOSURE entry, coverage-matrix refresh where legs landed, ledger
  PHASE LOG, `projectStatus`/`lastCompleted` updated by the closing run only.

## 5. Ordering constraints

1. `REQ-ENG-*` first — pure offline, unblocks nothing but is unblocked by nothing.
2. **Operator gate** (§6) before anything live.
3. Merge sweep + tip deploy (operator) → `REQ-POST-*`.
4. Envelope ruling + deployed tip + tenant → `REQ-DISC-1` funded wave; B19C last-and-conditional.
5. Clock items at their dates regardless of ticket order.
6. Cleanup wave (D-SPA.28-1 / SPA.28 residual) only after REQ-POST-4's green nightly.
7. `REQ-TAIL-*` last.

## 6. Required operator gates (all ⚑ operator; none guessed past — a gate is a pause, not a block)

| gate | question | unblocks |
|---|---|---|
| spec sign-off | ratify/revise this draft | the round itself |
| deploy authorization | merge sweep + `pulumi up` of the tip (ordered activation per BL-01/BL-81; segments per `INTEGRATION_PLAN.md` §R5 — record the executed order in the run) | REQ-POST-* |
| envelope ruling | fresh funded-window cap (~$60 prior bound is stale — refused at $80.86 pinned-scope) — **amount ⚑ operator, never invented** | REQ-DISC-1 |
| golden ruling | `GD-R5OPS.1-1` — nightly golden budget (~$150–300/night question) | REQ-DISC-3 |
| CDN ruling | delivery-contract repair posture (signed-URL key + origin-read grant) | REQ-POST-7 |
| lever rulings | out-of-class levers (worker right-size, Cloud SQL HA, the three in-class COST levers) | D-OPS.2-2, D-COST.1-3 |
| session items | H8 remainder per BL-86 checklist (invite mint, Stripe live-mode, admin key, pen test, exposure review, pricing/entitlement rulings, refund ruling, Google sign-in leg, leg-cap reconcile, browser session) | all (e)-class rows |
| posture rulings | domains-bearing stage, Stripe-bearing stage (may be deferred — legs stay owed honestly) | class (c) rows |
| misc rulings | `GD-RES.2-1` retro refund/relabel; D-ECON.1-2 cap input; D-RES.2-3 coverage class; D-DEF.4-3 go-live; D-ACT.1-3 flip; D-BL38.1-1 stamp shape; D-ECON.2-7 restore | respective rows |

## 7. Out of scope (explicit)

- **G2 wave-1 LIFT + the H2 corpus program** (D-P0.13-*, D-P0.14-*, D-P0.15c-4, D-PRB.02-2;
  BL-40/43/44/45) — strategic-deferred; the hard gate before §16.4 marketing claims and public
  launch is unaffected.
- **New feature work / new surfaces** — none. Every ticket in the decomposition is discharge,
  verification, repair, or operator execution.
- **Marketing / efficacy claims** — forbidden until G2 reads; no copy leg in this corpus touches them.
- **Spec-scheduled 1.x / Later scope** (BL-73's 33 MISSING rows) — parked by design, not forgotten.
- **Standing watches** (BL-47, BL-76, BL-77, BL-84) — stay open as tracking items; they are not
  round-6 work.

## 8. Honest-accounting invariants carried into round 6

- The funded wave is **carried, never described as run**: bind refused 2026-10-16 (cumulative
  $80.86 ≥ ~$60, tenant missing, 0 legs, $0 spent).
- No secret in any artifact; system-role DSNs bind over the IAP tunnel inside authorized runs only.
- Provenance discipline: SHA-matched deploys only; `workflow_dispatch` provenance never satisfies a
  "deployed tip" assert.
- Deferral cells flip only with evidence; flagged rows dispositioned by a reconcile pass, not silently.
