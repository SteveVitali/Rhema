<!--
  docs/round-6-draft-spec.md — round-6 specification, v0.2.

  STATUS: **RATIFIED v0.3 — operator sign-off 2026-10-20 ("Okay, I sign off v0.3." — LEDGER
  GATE DECISIONS `GD-RATIFY.R6`); decomposed the same day into manifest rows 176–208.**
  v0.3 (2026-10-20, same day) folds the batch-5 rulings: pen test deferred + agent review (ADR-112),
  $100 minimal golden cohort, BL-13 anchors, trial $50/day, exposure forensics, the acts
  pre-authorization, a public-domain Showcase, legal placeholders.
  v0.1 (2026-10-20, commit 196161a) scoped round 6 as "post-merge discharge". v0.2 (2026-10-20, same
  day) retargets it to a **public launch of rhema.tools with no remaining deferred work**, per the
  operator directive and the twelve batch-4 rulings (LEDGER § GATE DECISIONS ### Round 6), after an
  orchestrator critique found v0.1 could not reach launch. It edits no manifest row and closes no
  deferral. It authorizes nothing beyond the recorded rulings and the scoped `GD-DEPLOY.R6`
  pre-authorization.
-->

# Round 6 — public launch readiness — v0.3 (ratified 2026-10-20)

## 0. Status, authority, and what changed from v0.1

- **Ratified 2026-10-20** (`GD-RATIFY.R6`). `decompose-spec mode=extend` landed manifest rows
  176–208 the same day; `nextTicket` → R6ENG.1. (Was: "Unratified … until the operator signs off".)
- **Objective (operator, 2026-10-20, verbatim):** "by the end of this next orchestrate-build drive we
  have a fully production-ready public launch-ready deploy to rhema.tools, with no remaining deferred
  work."
- **Done means** (`GD-DONE.R6`, "Zero launch-blocking + owned"): round 6 closes with **zero
  launch-blocking OPEN rows**. Every other row is closed on evidence, WONTFIX by ruling, or converted
  to a dated, owned post-launch obligation with live alerting, read by the in-round post-launch
  ticket (§4.9). Nothing is carried silently.
- **Authority:** all operator rulings of 2026-10-19/20 (LEDGER § GATE DECISIONS — the legacy table's
  2026-10-20 rows and `### Round 6`), **ADR-111** (launch decoupled from G2; §17 exit row amended),
  and the dated §17 amendment in `docs/rhema-design-spec.md`.
- **Corrections to v0.1** (the orchestrator critique, 2026-10-20 — see census §8):
  1. v0.1 could not produce a launch. G2 was out of scope, but ADR-104 made it a hard launch
     gate. Resolved by ADR-111.
  2. §17 Phase-1 exit criteria were unaddressed. Amended by ADR-111.
  3. The money flips were missing: purchase open (`GD-BILL.3-1`), metered debit + notice, refund
     window, trial. All are now ruled.
  4. There were no legal/trust pages anywhere in `apps/` or `packages/`, and no restore or rollback
     drill had ever been rehearsed.
  5. The deploy was assigned to the operator, but the operator ruled that the agent deploys from
     the tip. That is now a scoped pre-authorization.
  6. The signed-URL code (v0.1's `R6POST.3`) sat after the deploy. It is now pre-deploy code
     (§4.1, REQ-POST-7).
  7. Nightly green was undeliverable under merge-later. It is now a merge row plus REQ-ENG-8.
  8. The worker soak (REQ-ENG-7) was mislabelled offline. It is a live preview soak.
  9. Three tickets exceeded the SWE-2 256k non-compacting budget and are now split.
  10. The census mislabelled `D-SLO.1-7/-8` and misclassified `D-SLO.1-5/-7/-8` as traffic-bound.
- **Posture facts (re-confirm at SETUP):**
  - **Prod serves `ffbb8ad`**, the ARMB.2 head — round 4's Arm-B tip deploy, so the SPA is live.
    The round-5 code (NAVC, the econ regime, the funded-window machinery, R5OPS drivers) is **not
    deployed**.
  - The ledger chain tip is `stevevitali/r5doc-2-agent-docs-refresh`. This planning branch merged
    it at `cc33845`.
  - `signupMode` is `open` on prod, but `purchaseMode` is `closed` and the trial and refund window
    serve `test_tenants` only, so a real user can sign up today and do nothing.
  - #170–#174 are merged; #175–#194 are open.

## 1. Goals

1. **Code complete before deploy:** the CI flake is gone; the SSE fix, RES.3 checkpointing,
   API-minted usercontent delivery, the metered-debit notice, the legal/trust pages and nightly
   provenance tolerance have all landed.
2. **The deployed tip is proven and recoverable:**
   - the agent deploys the tip under `GD-DEPLOY.R6`;
   - provenance is all-PASS;
   - the restore, rollback and playbook drills are rehearsed;
   - alerts reach a real operator sink;
   - HA and the worker right-size are in place.
3. **Every owed live leg is discharged on the deployed tip:** prod arms, posture stages, the funded
   wave (or an honest refusal), the golden validation on all four protocols, the operator's
   browser/money legs, and the guarded one-off writes.
4. **Launch-blocking externals are closed:** the pre-launch adversarial security review
   (REQ-SEC-3) has zero open criticals/highs, the RLS-exposure verdict is ruled (REQ-FOR-4), the
   launch content is signed off, and the legal text is approved.
5. **The launch is executed and watched:**
   - the operator merges and the nightly is green on `main` == prod;
   - `GATE-LAUNCH` passes;
   - the flips execute in their ruled order;
   - the launch + 14 d read closes or converts every cohort-bound row.
6. **Memory is reconciled:** capstone, accepted deviations, backlog/spec/integration reconcile and
   docs. `projectStatus` is updated by the closing run only.

## 2. Posture

- **Deploy:** `GD-DEPLOY.R6` (pre-authorization, expires GATE-ACCEPT.R6). Round-6 tickets that name
  the deploy as a production mutation may `pulumi up` stage `prod` with a chain-tip SHA (and the
  post-merge `main` HEAD) when **all** of these hold:
  - the preview shows zero replace/delete on stateful resources;
  - migrations pass the additive lint;
  - the monthly cost delta is ≤ $15 (the `GD-HA.R6` levers excepted);
  - `check-deploy-provenance` is all-PASS afterwards.

  Any failure pauses that deploy for the operator. Each code-changing ticket after the first deploy
  redeploys its own tip under the same terms.
- **Merges stay the operator's** (`mergePolicy: OPERATOR`). There are two in-round merge rows:
  **MERGE-1** before GATE-LAUNCH, so `main` == prod and the nightly can go green, and **MERGE-2**
  right after the launch-flip PR, so post-launch nightlies read the flipped SHA. The final sweep of
  tail PRs is the operator's closing act. REQ-ENG-8 keeps deploy-neutral (docs-only) merges from
  breaking nightly provenance.
- **Spend:**
  - funded wave: ≤ the ~$150 pinned-scope lifetime cap (`GD-ENV.R6`; $80.86 already measured);
  - showcase dossier run: must fit the remaining envelope or GATE-R6B pauses;
  - golden validation: **≤ $100 hard cap**, minimal four-protocol cohort (`GD-GOLDEN-CAP.R6`);
  - preview/posture/drill stacks: ≤ $8 each (VERIF.2 precedent), torn down and verified;
  - HA: +$37.75/mo (`GD-HA.R6`); worker right-size: −$26/mo (conditional).

  The pen-test vendor cost is the operator's (post-launch, ADR-112).
- **Operator-only, never agent:** merges; real-money charges (the operator's own purchase legs);
  creating or rotating third-party credentials; DNS changes beyond those the posture-stage ticket
  names; any target-relaxing ADR not already ruled; destroying stateful resources. The mechanical one-off acts in
  `GD-PREAUTH-ACTS.R6` (expires GATE-LAUNCH) execute without a pause once their dry-run matches the
  itemized scope and pre-state is captured; any other one-off prod write pauses for the operator.

## 3. REQ families

| family | cluster | nature |
|---|---|---|
| `REQ-ENG-*` | pre-deploy engineering | code/test/docs, CI-provable; ENG-7 is the one live-preview leg |
| `REQ-LCH-*` | launch surfaces + content + money readiness | code + research + operator approvals |
| `REQ-FOR-*` | prod forensics | read-only system-role prod reads, $0 |
| `REQ-WRT-*` | guarded one-off prod writes | dry-run → operator go → execute → verify |
| `REQ-DEP-*` | deploy, drills, infra posture | agent deploys under `GD-DEPLOY.R6` |
| `REQ-POST-*` | live verification on the deployed tip | $0 journey/evidence legs |
| `REQ-DISC-*` | funded + golden discharge | gated spend |
| `REQ-SEC-*` | pre-launch adversarial review + post-launch external pen test | agent review (LB) + operator procurement (PL, ADR-112) |
| `REQ-GO-*` | merge, nightly, launch gate, flips | the launch itself |
| `REQ-CLK-*` | clock-bound reads | dated |
| `REQ-WATCH-*` | post-launch read | launch + 14 d |
| `REQ-TAIL-*` | reconcile + capstone | tail=full |

REQ-ids are spec-stable and never reused. v0.1 ids are kept where their scope survives.

## 4. Requirements and acceptance criteria

### 4.1 REQ-ENG — pre-deploy engineering

- `REQ-ENG-1` **Mount-settle flake.** Replace bare/`!` selector access in `outline.dom.test.tsx`
  and `figures.dom.test.tsx` with mounted/settled `waitFor`, audit every `*.dom.test.tsx`, and
  commit the audit. Two consecutive green full-suite CI runs. (D-R5REC.1-1, BL-87)
- `REQ-ENG-2` **SSE finalize-path post-commit wakeup.** Close the publish/commit race that leaves
  terminal-batch events on the 10 s safety poll. Unit-pin the race; the live window re-read is
  REQ-POST-8. (D-SLO.1-6)
- `REQ-ENG-3` **RES.3 verification-phase checkpointing.** `phase<N>` checkpoints, the late-arrival
  contract, a retry-gate consult and budget isolation, with tests. No paid leg runs before it
  lands. (D-RES.3-1, BL-79)
- `REQ-ENG-4` **Project-reference drift.** The five `@rhema/*` packages gain their tsconfig
  references; the CIREP.1 check is green. (open finding)
- `REQ-ENG-5` **Guard-binding convention documented.** The system-role `JOURNEY_DATABASE_URL`
  binding convention is documented where the runbook/ADR is read; the live $0 read is REQ-FOR-3.
  (D-STB.5b-1 doc half, BL-72)
- `REQ-ENG-6` **Memory hygiene.**
  - Verify the BL-02 cell-shape sweep is clean.
  - Disposition the census §5 flags (BL-06, BL-80, BL-82, BL-74, the BL-24 injection-smoke half,
    the D-P1.22-2 injection half): flip with cited evidence or keep with a named residual.
  - Re-point the `REQ-FIX-BL22-T7DEST` coverage-matrix routing from `D-FIX.1-4` to `D-P1.04-2`.
- `REQ-ENG-7` **Worker right-size soak** (a **live preview leg**, not offline). On a `pr-<n>` stack
  at 0.5 vCPU/512Mi, reproduce `D-P0.15h-3`'s throttled cold-import failure mode. Green unlocks
  REQ-DEP-3's flip; red keeps the worker at 1 vCPU/1Gi with the soak as evidence. Tear the preview
  down. (D-COST.1-3 (a))
- `REQ-ENG-8` **Nightly provenance tolerance.** `journeys.yml` / the provenance assert accept
  `main` HEAD when the deployed SHA is an ancestor of HEAD and `git diff <deployed>..HEAD` touches
  only deploy-neutral paths (the committed allowlist — `docs/**` and build memory). Any other diff
  fails as today. Unit-pin both arms. (new — required for honest post-launch nightlies)

**AC (all ENG):** `pnpm turbo build lint typecheck`, `pnpm test`, all six `check:*`,
`check-build-memory` and `check-append-only` green; no deferral cell is edited without evidence.

### 4.2 REQ-LCH — launch surfaces, content, money readiness

- `REQ-LCH-1` **Legal/trust pages** (`GD-LEGAL.R6`).
  - Public SSR routes for Terms of Service, Privacy Policy, Refund Policy, Acceptable Use and
    Contact/Support, added to `SPA_PUBLIC_ROUTES` + `SPA_DOCUMENT_ROUTES` with footer links on
    every public page.
  - Text drafted from the spec's actual posture: data rights (§13.4 export/delete, 14-day grace),
    retention schedule, no-training statement and model-provider list, the §12.8 residual-risk
    sentence, credit/refund math (§14.4), never-cookies ingestion, contact path.
  - Each page carries a committed `approved: false` content flag; `GATE-LAUNCH` requires `true`,
    set only after the operator's verbatim approval.
  - DOM-contract, no-cookies and launch-surface lint all green; the pages make no efficacy claim.
- `REQ-LCH-2` **Launch content prep** (`GD-CONTENT.R6`, $0 research).
  - (a) **H4:** verify every seeded venue/outlet row against its live venue page and record the
    proposed `verified_at` stamps with the URL and the quoted cap.
  - (b) **H5:** a shortlist of Showcase essay candidates (≈2,000 words, Essay protocol, likely to
    carry a contradicted Tier-1 claim) — **public-domain only** (`GD-SHOWCASE.R6`), each with its
    public-domain basis cited and its candidate contradicted claims + modern sources listed.
  - (c) A proposed final sample-dossier content set.
  - The operator approves (a) and (c) and picks one (b) candidate in HUMAN-R6H2.
  - (D-P1.21-1, D-P1.17-1, D-PRB.01-2)
- `REQ-LCH-3` **Showcase dossier build** (paid).
  - A real Full-board run on the chosen public-domain essay on prod, inside the GATE-R6B envelope; the cap is
    declared from the estimator before dispatch.
  - Replace `SHOWCASE_FIXTURE` with the real bundle and get `assertShowcaseFixture` green
    (REQ-POS-3: ≥1 contradicted Tier-1 claim with its fetched URL).
  - Redeploy and seed; the Showcase-on-fresh-account leg is green. Final operator sign-off is a
    GATE-LAUNCH item.
  - (D-P1.17-1, D-P1.17-2 Showcase half)
- `REQ-LCH-4` **Apply the H4 stamps** once approved: `seedProtocols` sets
  `venue_table_verified_at`, and rendering shows verified, not stale. (D-P1.21-1)
- `REQ-LCH-5` **Money-flip readiness** (`GD-LAUNCH-MONEY.R6`; code only — nothing flips here).
  - (a) **The notice mechanism already exists** — `scripts/live/send-metered-notice.mjs` and
    `docs/ops/debit-mode-flip.md` step 0. Verify its copy against the charge-what-we-meter
    behaviour and the one estimator config (REQ-SPEC-32). Add a public-facing explanation where new
    users see it (pricing, run sheet). Run the notice **dry-run** against prod and record the
    recipient count. If it is > 0, the effective date (≥ 30 days after sending, per REQ-BILL-2 /
    ADR-014) is on the launch critical path, and the send is a HUMAN-R6H1 go.
  - (a′) Read the runbook's preconditions 1–2 on prod: `cap_calibration_reports` must have
    `adopted=true` rows for the cells that drive paid surfaces, with in-sample cap reach ≤ 10%. If
    they are unmet, record the gap and what REQ-DISC-1's measurements can contribute. **An unmet
    precondition at GATE-LAUNCH is a finding for an operator ruling — never flipped past.**
  - (b) Pricing, run-sheet and trial claims verified consistent with `pricing.json` and the
    estimator.
  - (c) Refund-policy copy matches the §14.4 refund math.
  - (d) A test proving the $50/day kill switch and the 1-concurrent trial cap hold under `everyone`.
  - (e) Every flip prepared as a one-line stage-fact diff with its ordered runbook in
    `docs/ops/launch-flips.md`.
  - (f) The launch-surface lint extended to the legal pages and the notice.

### 4.3 REQ-FOR — prod forensics (read-only, $0)

- `REQ-FOR-1` **Named-red SLO forensics.**
  - `D-SLO.1-5`: the two named failed runs (`phase_blocked`, `cap_reached`).
  - `D-SLO.1-7`: the four >5% proxy-vs-SDK attempts, attributed via `usage.reconcile`.
  - `D-SLO.1-8`: read the run-task egress-canary source against the `api/hello` and `?beta=true`
    denials.

  Each gets a verdict: defect (fix in this ticket if small, else a run-time insert) or by-design
  (an ADR proposal — any denominator or target semantic change **pauses for the operator**).
  The weekly windows then re-read in REQ-WATCH-1.
- `REQ-FOR-2` **`balance_divergence` classification** of the six included-bucket accounts
  (`expectedHeld=-3860`). Verdict test-tenant soak or real ledger defect; a defect is
  launch-blocking. (open finding, BL-24 family)
- `REQ-FOR-3` **Weekly paid-guard live re-proof** on the system-role DSN: a $0 read showing the
  `pg_roles` probe passes and the meter sums. (D-STB.5b-1 live half, BL-72)
- `REQ-FOR-4` **RLS-exposure forensics + disclosure** (`GD-EXPOSURE.R6`). Over the preserved
  window logs (`docs/build/logs/sec1-2-exposure/`, gitignored — 18,482 api+web entries,
  2026-09-17T05:26Z → 2026-10-01T02:51Z) joined to read-only prod tables (sessions, workspaces,
  personas, projects, runs):
  - For each of the three confirmed leak routes, decide whether any **real (non-`is_test`)**
    user received another real workspace's data.
  - Commit only aggregate, de-identified findings (counts, route, date range, verdict); never a
    log line or an identifier of a person.
  - **Verdict yes:** draft a plain notice to the affected users (what was exposed, when, the fix,
    contact). The operator approves its text in HUMAN-R6H2 before it is sent; the send is a named
    mutation.
  - **Verdict no:** sign off with the evidence summary.
  - Either way, D-SEC.1-2 closes with the residual-class sign-off recorded. Launch-blocking.
  - (D-SEC.1-2, BL-37)

### 4.4 REQ-WRT — guarded one-off prod writes

Each is a committed script: dry-run by default, `--execute` fail-closed, pre-state capture before
any write, one transaction, post-state verify. **Pre-authorized** by `GD-PREAUTH-ACTS.R6`: the
worker executes once the dry-run matches the itemized scope exactly; any mismatch voids it, and
that act pauses for the operator.

- `REQ-WRT-1` **GD-RES.2-1 "refund + relabel"**: refund `01M3EAAZG2…` (56cr) + `01M3SK62…`
  (340cr), and relabel the zero-coverage deliveries `unverified`. The test-tenant probes get no
  credit action. (D-RES.2-2, BL-75)
- `REQ-WRT-2` **D-BL38.1-1**: rewrite the `prod:d5a74cc` deployments id to the 40-char SHA. Closes
  when the `cleanup-bl38-residue.mjs --dry-run` observation is gone.
- `REQ-WRT-3` **D-P1.04-2 hand-date arm**: back-date one purpose-made, purge-exempt test
  tombstone's `deleted_at` by 30 d so the real `project.purge` destruction fires on the next sweep.
  The verify is REQ-CLK-3.

### 4.5 REQ-DEP — deploy, drills, infra posture

- `REQ-DEP-1` **Tip deploy** (`GD-DEPLOY.R6`).
  1. Stand up a `pr-<n>` preview of the tip and run the `paid:false` suite with
     `--expect-renderer spa` (VERIF.2 recipe); tear it down.
  2. Prod `pulumi preview` classified against the pre-authorization conditions; additive migration
     lint.
  3. `pulumi up`; `check-deploy-provenance --expect <tip>` all-PASS on web+api; `record-deployment`.
  4. Post-deploy smoke, plus the `git revert` + redeploy rollback recipe for this SHA written down.

  Any failed condition pauses.
- `REQ-DEP-2` **Readiness drills.**
  - (a) A PITR **restore drill**: restore to a scratch Cloud SQL instance, verify row counts and a
    tenant read, then destroy it. This is a named mutation that creates a new instance and never
    touches the live one; pre-authorized by `GD-PREAUTH-ACTS.R6`.
  - (b) A **rollback drill** on a preview: deploy N, revert to N−1, verify the markers.
  - (c) The **egress-denied playbook drill** (D-P1.22-2).
  - (d) **Alert delivery** to the real operator sink bound in HUMAN-R6H1. Each alert policy is
    proven to page.
  - (e) The on-call/incident runbook names the operator as responder and the paging path.
- `REQ-DEP-3` **Infra posture** (`GD-HA.R6`; the `D-COST.1-3` (a) ruling).
  - Cloud SQL REGIONAL and egress-proxy MIG×2, in any window before launch (pre-authorized —
    prod has no organic traffic to protect yet; announce the window in the PR).
  - The worker right-size flip **only if REQ-ENG-7 is green**.
  - `billing-read.mjs` recomputation plus §13.5 probes clean.

  (D-OPS.2-2, D-COST.1-3 (a)+(f))

### 4.6 REQ-POST — live verification on the deployed tip ($0)

Prerequisite: REQ-DEP-1 provenance all-PASS. Each leg's report is committed under
`docs/build/reports/`.

- `REQ-POST-1` **Prod SSR arm:** `--expect-renderer ssr` re-proof incl. the phone-UA uncapped pane,
  edit POST, seam conformance, clean observability and control legs. (D-SPA.6-1)
- `REQ-POST-2` **Signed-in session legs:** mailto, invite-accept (consuming the HUMAN-R6H1 invite —
  proves the shared throttle), `/r/:token` expiry, OAuth initiation. (D-OPS.1-1, D-SEC.2-1,
  D-PRB.01-1)
- `REQ-POST-3` **Deep-link restore** `…/v/<version>#f-<finding>`. (D-CAP.1-1)
- `REQ-POST-4` **Nightly green** — owned by REQ-GO-2.
- `REQ-POST-5` **Fixture-backed legs** after the HUMAN-R6H1 executes:
  - the T8 410 leg (D-FIX.1-1);
  - the `--entitlement` N5-family render probes (D-MAINT.3-1);
  - the export legs: import round-trip parity spot-check; the 7-day expiry 410 arm is REQ-CLK-6
    (D-P1.18-1).
- `REQ-POST-6` **Posture stages** (ruled "authorize both"). A domains-bearing `pr-<n>` stage (DNS
  records named as the ticket's production mutation) for N8/R10.keepalive. A Stripe test-mode stage
  (the `sk_test` key seeded by the operator in HUMAN-R6H1) for N9. Teardown verified.
  (D-SPA.24-1, D-SPA.16-1, D-SPA.20-1)
- `REQ-POST-7` **Usercontent delivery.**
  - Code (pre-deploy, §4.1 ticket set): API-minted GCS V4 signed URLs with
    `response-content-disposition=attachment` for non-allowlisted types and a short TTL; the
    tenant check happens before minting. A new ADR-113 amends the §13.3 usercontent-origin
    contract; edge-signing repair is not pursued.
  - Live (post-deploy): `usercontent-cdn-verify.mjs` re-pointed at the minted path. Unsigned →
    denied; signed → 200; tampered → denied; header leg — no `Set-Cookie`, attachment/octet-stream.

  (D-R5OPS.1-2, D-P1.22-2 usercontent half)
- `REQ-POST-8` **SSE window re-read** after REQ-ENG-2 is deployed: event-delivery p95 ≤ 2,000 ms on
  the next measurement window. (D-SLO.1-6)
- `REQ-POST-9` **Public funnel legs:** Lighthouse + axe on prod (hero LCP < 2.5 s, CLS < 0.05,
  reduced-motion), and the drop-zone → signup → ingest ≤ 20 s round-trip on a flagged account.
  The funnel metrics are REQ-WATCH-1's. (D-P1.17-2 agent half)

### 4.7 REQ-DISC — funded + golden discharge

- `REQ-DISC-1` **Funded wave re-attempt** behind GATE-R6B.
  - Gates: envelope ~$150 pinned-scope (ruled); `funded-window.mjs --dry-run` 9/9; deployed-tip
    provenance; `JOURNEY_FUNDED_STABLE_TAG` tenant seeded + purge-exempt; system-role DSN; REQ-ENG-3
    landed.
  - Ordering: T9 → launchers → riders → B19C last-and-conditional, with per-leg `CapOverrunError`
    armed. **Split into three tickets** along that ordering.
  - Covers D-CAP.2-1 + every census (b)-class row (D-FIX.1-2, D-P0.15-3, D-PRB.02-3, D-PRB.04-2
    live half, D-P1.10-1/-11-1/-12-1/-14-1/-19-1/-21-2, D-DEF.1-1, D-RES.1-1/-2/-3,
    D-CITE.1-2/-3/-5, D-ECON.2-2/-3/-4, D-STB.5b-3/-4/-5) plus the paid new-visitor journey; the
    ECON.1-4 cells it measures are folded.
  - **A refusal at bind is the finding** — reported, never spent past.
- `REQ-DISC-3` **Golden validation** (ADR-111 amended criterion).
  - **First, verify the cohort covers all four protocols.** The driver enumerates "all workflows on
    the default tier × the three fixture projects", and the P1.21 protocols 2–4 may have no fixture
    project. Add the missing protocol fixtures (with committed floors) before any paid dispatch.
  - **The cohort is minimal** (`GD-GOLDEN-CAP.R6`): one fixture per protocol × its primary Review
    workflow at default tier/rigor — 4 runs.
  - Estimate it; **if the estimate exceeds $100, pause for the operator** — never trim protocols
    silently. Hard cap $100.
  - Then one ≤ $100 run of `nightly-golden-driver.mjs` (`GOLDEN_BUDGET_RULING=approved` one-shot +
    measured `--scores`) on **all four protocols** at the launch-candidate SHA — after every
    protocol-affecting change, incl. REQ-ENG-3 and any REQ-SEC-3 fix.
  - Score floors are green.
  - Record the standing "re-run on protocol-affecting deploys" rule in `docs/ops/`.
  - (D-P0.15-4, BL-36)

(`REQ-DISC-2` and `REQ-DISC-4` from v0.1 are superseded by REQ-WRT-* / the pre-authorized
executes and REQ-DEP-3; their ids are retired, not reused.)

### 4.8 REQ-SEC, REQ-GO — security and the launch

- `REQ-SEC-3` **Pre-launch adversarial security review** (ADR-112; launch-blocking). On the
  deployed tip, with `is_test` tenants only:
  - **Code-against-controls read:** every item of `docs/security/pen-test-scope.md`'s controls
    list.
  - **Live tenancy/authz probes on every user-serving route:** BFF twins, the signed-URL mint,
    export/import, billing, voices, chat/outline (the classes that leaked) — two-tenant probe
    extensions plus planted foreign ids.
  - The §12.8 injection controls on the live surface; the usercontent and `__Host-` cookie
    posture; the money paths (purchase, refund, trial, metered settle — no double-spend, no free
    credit).
  - Classify each finding with `pen-test-findings-triage.md`'s severity scale. Fix criticals/highs
    in-ticket if small, else as run-time inserts; mediums/lows become owned obligations.
  - **Exit: zero open criticals/highs.** The review states it is not independent.
- `REQ-SEC-1` **External pen-test engagement — post-launch** (ADR-112; PL). The operator procures
  it using `pen-test-scope.md` + `pen-test-vendor-package.md`; the engagement completes ≤ 60 days
  after launch. Owner: operator · trigger: launch + 60 d. (D-P1.22-3, BL-35)
- `REQ-SEC-2` **External findings triage — post-launch** (PL): per
  `pen-test-findings-triage.md`; criticals/highs hotfixed under `GD-DEPLOY.R6`-equivalent terms.
  Lands as a run-time insert, or as the next round's first ticket if the report arrives after
  round 6 closes.
- `REQ-GO-1` **MERGE-1** (HUMAN): the operator merges #175 → the last pre-launch round-6 PR
  bottom-up.
- `REQ-GO-2` **Post-merge redeploy + nightly green.**
  - Redeploy `main` HEAD (tree-equal to the tip); provenance PASS.
  - The first scheduled `journeys.yml` nightly is green on `main` HEAD.
  - D-SPA.28-1's entry gate evidence; BL-74/BL-81 residuals.
  - (D-OBS.1-3, D-SPA.28-1)
- `REQ-GO-3` **GATE-LAUNCH** (operator gate; thresholds pre-registered — §6).
- `REQ-GO-4` **Launch flips** (`GD-LAUNCH-MONEY.R6`), in order, each verified live before the next:
  1. `debitMode` → metered, per `docs/ops/debit-mode-flip.md` — preconditions 1–4 hold, the notice
     effective date has been reached, and the step-3 verifies run within an hour;
  2. `purchaseMode` → open (GD-BILL.3-1);
  3. `REFUND_WINDOW_MODE` → open (D-DEF.4-3);
  4. trial audience → everyone with the kill switch verified (D-ACT.1-3).

  Then:
  - Post-flip smoke on a fresh non-test account (trial claim visible, purchase reaches Stripe;
    marked analytics-opt-out so it never pollutes the organic cohort).
  - Launch-surface lint green.
  - The monitoring watch is armed.
  - The ADR-008 "no public launch moment" bar is lifted by ADR-111; the public announcement
    itself is the operator's act, and any copy passes REQ-EVAL-19.
- `REQ-GO-5` **MERGE-2** (HUMAN): the operator merges the launch-flip PR promptly, so post-launch
  nightlies read the flipped SHA.

### 4.9 REQ-CLK, REQ-WATCH — dated reads and the post-launch read

- `REQ-CLK-1` ~2026-10-30: the `project.purge` fire for `01M3SK380GQX41RKMD4KVFB34Q`.
  (D-BL38.1-2)
- `REQ-CLK-2` The first Monday digest after the funded wave seeds T16 claims the stale-voice
  persona exactly once. (D-FIX.1-4)
- `REQ-CLK-3` The hand-dated tombstone's destruction is verified (REQ-WRT-3). (D-P1.04-2)
- `REQ-CLK-4` Billed actuals ≥ 24 h after the D-OPS.2-1 console flip, classes P1–P5 appended, and
  the export-vs-observed confirmation. (D-COST.1-1, D-OPS.1-3)
- `REQ-CLK-5` The admin-key `usage.reconcile` nightly runs green after HUMAN-R6H1 binds
  `ANTHROPIC_ADMIN_KEY`. (D-ECON.1-1, D-PRB.08-1)
- `REQ-CLK-6` The T8 export's 7-day expiry 410 arm. (D-P1.18-1 expiry half)
- `REQ-WATCH-1` **Launch + 14 d read** (`GD-WATCH.R6`), on the committed queries, organic
  non-test cohort only:
  - first-finding p50 ≤ 4 min — the ADR-111 post-launch target (D-R5OPS.1-1);
  - `import_preview_p95_s` plus the convert-svc min-scale decision (D-COST.1-2);
  - the weekly SLO windows (D-SLO.1-5/-7/-8, after REQ-FOR-1's verdicts);
  - ECON cells and cap calibration (D-ECON.1-3/-4, D-ECON.2-5/-6);
  - the lever-A/B restore re-check (D-ECON.2-7);
  - the funnel metrics (D-P1.17-2 remainder).

  A row with sufficient samples closes on evidence. A thin one converts to a standing alert-backed
  watch with a named owner and re-read date (`owner:`/`trigger:` cells).

### 4.10 REQ-TAIL — reconcile + capstone (tail=full)

- `REQ-TAIL-1` Capstone gap analysis (R6CAP.1) and closure + deviations draft (R6CAP.3) →
  GATE-ACCEPT.R6.
- `REQ-TAIL-2` Backlog reconcile:
  - BL-73 and BL-47/76/77/84 reclassified as roadmap/watch (`GD-ROADMAP.R6`).
  - The G2/H2 rows (D-P0.13-1/-3/-4/-5, D-P0.14-1/-2/-3, D-P0.15c-4, D-PRB.02-2; BL-40/43/44/45)
    re-homed to the ADR-111 post-launch research program with owner + trigger.
  - Owned post-launch obligations for D-P0.12-3 (matcher tuning on real dispositions), D-RES.2-3
    (fact_check class) and the parked cost levers (b)/(d).
  - `OPERATIONAL_READINESS.md` rewritten to the launched truth.
- `REQ-TAIL-3` Spec reconcile: the §13.3 usercontent amendment (ADR-113), the §17/ADR-111 fold
  check, and BL-05 fold-backs. *(Post-ratification note, 2026-11-11 — folded at `205_R6REC.2`:
  the §13.3 ADR-113 banner verified against the shipped mint code; the §17 amended exit row
  checked against the launch evidence (GATE-LAUNCH signed, golden green at the launch SHA,
  first-finding → `GD-WATCH.R6` watch); the ADR-112 pen-test posture recorded at §12.8 + §16.4;
  the REQ-BETA-19/-20 launch clauses folded in Appendix A.13; banner gate
  `docs/build/tools/check-adr-banners.mjs`.)*
- `REQ-TAIL-4` Integration plan for the round-6 stack and the final merge sweep runbook.
- `REQ-TAIL-5` The repo-docs and agent-docs refreshes. Then the closing run updates
  `projectStatus`/`lastCompleted`. **`DONE` only if GATE-ACCEPT.R6 is signed and zero
  launch-blocking rows remain.**

## 5. Ordering constraints

1. Phase A (pre-deploy): REQ-ENG-1..6/-8, REQ-POST-7 code, REQ-LCH-1/-2/-5, REQ-FOR-1..4,
   REQ-WRT-*.
   REQ-ENG-7's soak needs only a preview, so it can run in Phase A.
2. **HUMAN-R6H1 starts at ratification** and runs parallel to Phase A. It is short now: keys,
   sink, console flip, invite mint. External pen-test procurement may start any time; it is a
   post-launch obligation (ADR-112), not on the launch critical path.
3. REQ-DEP-1 after all Phase-A code has landed → REQ-DEP-2, REQ-DEP-3.
4. REQ-POST-* after REQ-DEP-1. HUMAN-R6H2 (browser/money legs + approvals) after REQ-DEP-1 and
   REQ-LCH-1/-2.
5. GATE-R6B → REQ-DISC-1 (three tickets) → REQ-LCH-3 (Showcase build, needs the HUMAN-R6H2
   essay pick) → REQ-LCH-4.
6. REQ-SEC-3 (pre-launch adversarial review) after the live legs and the Showcase build — it
   reviews the launch candidate. **REQ-DISC-3 golden after the last protocol-affecting change**
   (REQ-ENG-3, any REQ-SEC-3 fix).
7. MERGE-1 → REQ-GO-2 → **GATE-LAUNCH** → REQ-GO-4 → MERGE-2.
8. REQ-CLK-* fire at their dates wherever the chain is. REQ-WATCH-1 runs at launch + 14 d.
9. REQ-TAIL-* last.

## 6. Gates and HUMAN rows (pre-registered; a gate is a pause, not a block)

| row | kind | contents / thresholds |
|---|---|---|
| HUMAN-R6H1 | HUMAN (anytime; target: ratification day) | **Acts only — every judgment call was ruled 2026-10-20.** D-OPS.2-1 billing-export console flip. Bind a real alert sink (email/phone/webhook) for REQ-DEP-2(d). Seed the Stripe `sk_test` key in nonprod Secret Manager (REQ-POST-6). `ANTHROPIC_ADMIN_KEY` (D-ECON.1-1). Invite mint (D-SEC.2-1). *(Optional, post-launch clock: start external pen-test procurement — ADR-112.)* The guarded executes, writes, restore drill, notice send, DNS records and HA window are agent-executed under `GD-PREAUTH-ACTS.R6`; BL-13 is ruled (`GD-BL13.R6`). |
| HUMAN-R6H2 | HUMAN (post-REQ-DEP-1) | Browser/money legs: Google sign-in round-trip + 409 merge + revoked grant (D-MAINT.4-1); Stripe live round-trip + real-money purchase + Portal change-plan/pending-email (D-P1.16-1, D-BILL.3-1/-2 — flagged tenant, purchase allowlisted); Safari caret (D-EDIT.1-2); source editor (D-PRB.07-1); versions rail (D-P1.08-1); PUT override (D-P1.09-1); settings walk (D-P1.20-1); real-phone legs (D-P1.19-2); EventSource chip on a live run (D-PRB.04-2 browser half); leg-cap reconcile (BL-69). Approvals: legal text verbatim with the entity/jurisdiction/contact placeholders filled (REQ-LCH-1, `GD-LEGAL-DETAILS.R6`), H4 stamps (REQ-LCH-2a), sample dossier (REQ-LCH-2c), pick one public-domain essay (REQ-LCH-2b), and — only if REQ-FOR-4's verdict is yes — the exposure notice text. |
| GATE-R6B | GATE | Funded window open — envelope ~$150 pinned-scope (ruled) with the cumulative measured < cap and ≥ the declared remaining caps + the Showcase run estimate; dry-run 9/9; deployed-tip provenance; tenant + DSN; REQ-ENG-3 landed. |
| HUMAN-MERGE-1 | HUMAN | The operator merges the stack bottom-up through the last pre-launch PR. |
| **GATE-LAUNCH** | GATE | **All must hold:** (1) zero launch-blocking OPEN DEFERRALS rows — the launch-blocking set is every row the §7 accounting tags `LB`; (2) REQ-SEC-3 (pre-launch adversarial review) zero open criticals/highs; (3) REQ-LCH-1 `approved: true` on every page; (4) Showcase + sample dossier + H4 stamps signed off; (5) REQ-DISC-3 golden green on all four protocols at the launch-candidate SHA; (6) REQ-GO-2 nightly green on `main` == prod; (7) REQ-DEP-2 drills all PASS + alerts paging; (8) REQ-DEP-3 HA live; (9) REQ-FOR-2 has no ledger defect; (10) REQ-FOR-4 exposure verdict recorded and, if yes, the approved notice sent; (11) REQ-DISC-1 is complete or its refusal is dispositioned; (12) the launch-surface lint is green; (13) the `debit-mode-flip.md` preconditions 1–3 hold (calibration adopted with ≤ 10% cap reach, notice sent, effective date reached) — or the operator rules on the recorded gap. The operator's go is recorded verbatim. |
| HUMAN-MERGE-2 | HUMAN | The operator merges the launch-flip PR. |
| GATE-ACCEPT.R6 | GATE (tail) | The operator signs the round-6 accepted-deviations list. |

## 7. Row accounting (every census row → its home)

`LB` = launch-blocking (must be DONE or WONTFIX by ruling before GATE-LAUNCH). `PL` = an owned
post-launch obligation is allowed (closed by REQ-WATCH-1 or reclassified by REQ-TAIL-2).

| census class | rows → requirement (tag) |
|---|---|
| (f) engineering | D-R5REC.1-1 → ENG-1 (LB); D-SLO.1-6 → ENG-2 + POST-8 (LB); D-RES.3-1 → ENG-3 (LB); D-STB.5b-1 → ENG-5 + FOR-3 (LB) |
| (a) deploy-bound | D-SPA.6-1 → POST-1; D-OPS.1-1 → POST-2; D-CAP.1-1 → POST-3; D-OBS.1-3, D-SPA.28-1 → GO-2 (all LB) |
| (b) funded | the 23 rows → DISC-1 (LB: each closes on evidence, or the refusal at bind is dispositioned at GATE-LAUNCH (11)) |
| (c) posture | D-SPA.24-1, D-SPA.16-1, D-SPA.20-1 → POST-6 (LB) |
| (d) clock | D-BL38.1-2 → CLK-1; D-FIX.1-4 → CLK-2; D-P1.04-2 → WRT-3 + CLK-3; D-COST.1-1 → CLK-4 (PL — dated reads after launch are allowed; each has a fixed date) |
| (e) ruled/operator | D-P0.15-4 → DISC-3 (LB); D-R5OPS.1-2 → POST-7 (LB); D-RES.2-2 → WRT-1 (LB); D-BL38.1-1 → WRT-2 (LB); D-FIX.1-1 → pre-authorized mint + POST-5 (LB); D-FIX.1-3, D-STB.5b-4, D-MAINT.3-1 → pre-authorized seed + POST-5/DISC-1 (LB); D-SEC.2-1, D-PRB.01-1 → R6H1 + POST-2 (LB); D-SEC.1-2 → FOR-4 (LB); D-P1.22-3 → SEC-1/2 (PL — ≤ 60 d post-launch, ADR-112; the pre-launch gate is SEC-3); D-P1.22-2 → DEP-2(c) + POST-7 (LB); D-OPS.2-1 → R6H1 (LB); D-OPS.1-3 → CLK-4 (PL); D-OPS.2-2, D-COST.1-3 → DEP-3 + TAIL-2 for (b)/(d) (LB for (a)/(f)); D-ECON.1-1, D-PRB.08-1 → R6H1 + CLK-5 (PL); D-P1.16-1, D-BILL.3-1, D-BILL.3-2, D-MAINT.4-1, D-EDIT.1-2, D-PRB.07-1, D-P1.08-1, D-P1.09-1, D-P1.19-2, D-P1.20-1 → R6H2 (LB); D-P1.17-1, D-PRB.01-2, D-P1.21-1 → LCH-2/-3/-4 + R6H2 (LB); D-P1.17-2 → POST-9 + LCH-3 + WATCH-1 (LB except the funnel metrics, PL); D-P1.18-1 → POST-5 + CLK-6 (PL for the expiry arm); D-DEF.4-3, D-ACT.1-3 → GO-4 (closed by launch); D-ECON.2-7 → WATCH-1 (PL); D-RES.2-3 → TAIL-2 (PL — roadmap); **D-ECON.1-2, D-ACT.1-1 → WONTFIX by ruling (closed 2026-10-20)** |
| (g) cohort | D-SLO.1-5, D-SLO.1-7, D-SLO.1-8 → FOR-1 (LB: verdict + fix) + WATCH-1 (PL: window re-read); D-R5OPS.1-1, D-COST.1-2, D-ECON.1-3, D-ECON.1-4, D-ECON.2-5, D-ECON.2-6 → WATCH-1 (PL) |
| (h) strategic | the ten G2/H2/eval rows → TAIL-2 re-home to the ADR-111 research program (PL); D-P0.12-3 → TAIL-2 owned obligation (PL) |
| findings | balance_divergence → FOR-2 (LB); CIREP.1 → ENG-4 (LB); matrix routing → ENG-6 |
| backlog | every open BL row follows its D-children above; BL-13 → ruled `GD-BL13.R6` (closes at REQ-GO-4 with the metered flip); BL-73, BL-47/76/77/84 → TAIL-2 roadmap |

## 8. Cross-cutting invariants (every ticket re-checks)

- **Honest evidence.** No leg claims green without committed evidence plus provenance. A refusal
  or a red result is a finding, never re-labelled. Deferral cells flip only with evidence.
- **Claims bar.** No efficacy or superiority claim on any surface (REQ-EVAL-19,
  `COMPARATIVE_WAVE_MET = false`). ADR-111 changes the launch, not the claims.
- **Money truth.** Debits equal metered burn clamped at the cap once the metered flip lands
  (REQ-SPEC-32). Every user-visible price, duration or trial claim comes from the one config.
- **Tenancy.** The user-serving role cannot bypass RLS. A new tenant read extends the two-tenant
  probe. A signed-URL mint checks the tenant first.
- **Scoped authority.** Deploys only under `GD-DEPLOY.R6`'s conditions. One-off prod acts only
  under `GD-PREAUTH-ACTS.R6` (dry-run matches the itemized scope) or the operator's go. Spend only through the fail-closed guards (system-role DSN, cumulative +
  per-leg caps, ordering).
- **Secrets never** in any artifact; keys are bound by the operator (`provided: yes/no` only).
- **Cohort hygiene.** Every agent- or operator-created account is `is_test` or analytics-opt-out,
  so it never enters an organic cohort read.
- **Context budget.** Each ticket's working set fits a fresh SWE-2 (256k, non-compacting) run with
  rigor headroom. A worker that finds its ticket overflowing stops and requests a split.
- **Preview hygiene.** Every `pr-<n>` stack a ticket creates is destroyed, and its teardown is
  verified, in the same ticket.

## 9. Out of scope (explicit)

- **Executing the G2/H2 research program.** Re-homed post-launch by ADR-111; its rows are
  reclassified, not worked.
- **Launch claims of any efficacy or superiority.**
- **New product features or surfaces** beyond the legal/trust pages and the metered-debit notice,
  both of which launch requires.
- **The 1.x/Later roadmap** (BL-73) and the standing ADR watches (roadmap per `GD-ROADMAP.R6`).
- **Redis HA** (declined); levers (c) SQL f1-micro and (e) proxy micro/off (rejected); levers (b)
  GKE spot and (d) Redis removal (parked → post-launch roadmap obligations).
- **The public announcement or PR itself** — the operator's act.
- **The external pen-test engagement and its triage** — post-launch obligations with a ≤ 60-day
  clock (ADR-112); round 6 lands the pre-launch adversarial review instead.
