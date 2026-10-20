# Decomposition prompt — round 6 (public launch readiness) — v0.3

*Invocation record for `decompose-spec mode=extend`. Run it **only after the operator signs off**
`docs/round-6-draft-spec.md` v0.3. Rewritten 2026-10-20 on `stevevitali/r6-planning-corpus` (which
merged the ledger tip `f893e85` at `cc33845`). v0.1 (`196161a`) scoped a discharge round; v0.2
retargets the round to the public launch (ADR-111; LEDGER § GATE DECISIONS ### Round 6). v0.3 folds
the batch-5 rulings: pen test post-launch + pre-launch agent review (ADR-112), the $100 golden
cohort, BL-13, `GD-PREAUTH-ACTS.R6`, exposure forensics, a public-domain Showcase, legal
placeholders. Nothing
below is ratified until sign-off.*

## Invocation

```
decompose-spec spec=docs/round-6-draft-spec.md mode=extend \
  ledger=true dispatch_target=subagent granularity=balanced \
  tickets_dir=docs/tickets tail=full
```

**Worker ceiling:** SWE-2 High, a **256k context window on a non-compacting subagent**. Every
ticket's working set must stay well under half of that: spec slice + code read + tests +
implement-spec's self-review/gap/verify passes. Size to M at most. The census's L/XL rows are split
below.

## Binding constraints

- **mode=extend:**
  - Open `### Round 6` in `docs/tickets/00_MANIFEST.md`; numbering resumes at **row 176**.
  - Fork from the current `chainTip` at SETUP (re-confirm; this planning branch carries the merged
    tip).
  - Never rename existing ticket files; append `## Plan extensions` + `## Spec amendments applied`
    lines (ADR-111 and the §17 banner, 2026-10-20, operator).
- **Contract sources:** `docs/round-6-draft-spec.md` v0.3 REQ ids (§4) and §7's row accounting.
  Tickets cite census row ids and spec §§; they never restate a landed design.
- **Authority:** the batch-4 rulings plus the scoped **`GD-DEPLOY.R6` pre-authorization** (expires
  GATE-ACCEPT.R6). Each ticket that deploys names `pulumi up prod` in its `Production mutations`
  block and cites `GD-DEPLOY.R6`'s conditions. The nine mechanical acts listed in **`GD-PREAUTH-ACTS.R6`**
  (REQ-WRT-*, T8 mint, BL-78 seed, the REQ-DEP-2(a) restore instance, the notice send, preview DNS
  records, HA) carry a `Gate status` item **pre-ticked by that row** (BM-GATE-09 — cite its id and
  conditions). Any other one-off prod write carries an unticked item, and the orchestrator pauses.
- **Never pre-answer a gate.** GATE-R6B, GATE-LAUNCH and GATE-ACCEPT.R6 are marker files with
  thresholds quoted from spec §6. No `decision` rows are written.
- **HUMAN rows are scheduled** with owner + target/trigger, and each dependent ticket lists the
  claims it withholds until its HUMAN row lands (BM-TICKET-05).
- **Skeletons** (BM-TICKET-03) where the body depends on something not yet known:
  - `R6WATCH.1` — the read set is fixed, but its thresholds per row are re-confirmed at launch.

  Everything else gets a full contract.
- **Honest accounting:**
  - The funded wave stays carried until it actually runs; a refusal at bind is the finding.
  - Deferral cells flip only with evidence; no secrets.
  - Cohort hygiene: every agent- or operator-created account is `is_test` or analytics-opt-out.
- **Out of scope (hard):**
  - the external pen-test engagement and its triage (post-launch, ADR-112 — `R6REC.1` records
    the ≤ 60-day obligation);
  - executing the G2/H2 program (re-homed by ADR-111);
  - any efficacy or superiority claim;
  - new features beyond the legal pages and notice surfacing;
  - BL-73 1.x;
  - Redis HA;
  - the rejected and parked levers;
  - the public announcement itself.

## Candidate ticket table (dependency-ordered; the decomposer may revise sizes and seams)

Phases follow spec §5. Rows marked ◆ are live (prod or preview); ★ means paid.

| # | id | scope (spec REQ) | kind | depends on | size |
|---|---|---|---|---|---|
| 176 | `R6ENG.1` | CI + provenance hygiene: ENG-1 mount-settle fix + sibling audit (2 consecutive green CI runs); ENG-4 tsconfig refs; ENG-5 guard-binding doc; ENG-6 BL-02 sweep + census §5 flags + matrix re-point; **ENG-8 nightly provenance tolerance** (`journeys.yml` + `check-deploy-provenance`) | implement | — | M |
| 177 | `R6ENG.2` | ENG-2 SSE finalize-path post-commit wakeup | implement | 176 | S |
| 178 | `R6ENG.3` | ENG-3 RES.3 verification checkpointing + budget-aware retry gate (protocol/orchestrator change) | implement | 177 | M |
| 179 | `R6UCD.1` | POST-7 code half: API-minted V4 signed-URL delivery (tenant check before mint, attachment disposition, TTL) + **ADR-113** (§13.3 amendment); no edge-repair | implement | 178 | M |
| 180 | `R6LGL.1` | LCH-1 legal/trust public SSR routes + footer + drafted text + `approved:false` flags + lints | implement | 179 | M |
| 181 | `R6MNY.1` | LCH-5 money-flip readiness: notice copy verify + new-user surfacing; ◆ notice dry-run recipient count + calibration precondition read (read-only prod); claim consistency; refund copy; kill-switch test; `docs/ops/launch-flips.md` | implement | 180 | M |
| 182 | `R6FOR.1` | ◆ FOR-1/-2/-3 read-only prod forensics ($0): named-red SLO verdicts (small fixes in-ticket; semantics → ADR proposal + operator pause), `balance_divergence` classification, weekly-guard live read | implement | 181 | M |
| 182a | `R6FOR.2` | ◆ FOR-4 RLS-exposure forensics over the preserved window logs (gitignored `docs/build/logs/sec1-2-exposure/`) + read-only prod joins → per-route real-user verdict; only de-identified aggregates committed; verdict yes → draft notice (sent only after HUMAN-R6H2 approval); D-SEC.1-2 sign-off | implement | 182 | S |
| 183 | `R6CNT.1` | LCH-2 content prep ($0 research): H4 venue verification evidence + proposed stamps; H5 **public-domain** essay shortlist (basis cited + candidate contradicted claims + modern sources); sample-dossier proposal | implement | 182a | M |
| 184 | `R6WRT.1` | ◆ WRT-1/-2/-3 guarded one-off writes: build dry-run-default scripts, capture pre-state, execute under `GD-PREAUTH-ACTS.R6` when the dry-run matches scope exactly (mismatch → pause), verify | implement | 183 | S |
| 185 | `R6SOAK.1` | ◆ ENG-7 worker right-size soak on a `pr-<n>` preview at 0.5 vCPU/512Mi (reproduce D-P0.15h-3); teardown verified | implement | 184 | S |
| 185a | `HUMAN-R6H1` | **Operator session 1 (start at ratification) — acts only:** billing-export console flip; alert sink; Stripe `sk_test` (nonprod); `ANTHROPIC_ADMIN_KEY`; invite mint. (Optional: start external pen-test procurement — post-launch clock.) | HUMAN | ratification | — |
| 186 | `R6DEP.1` | ◆ DEP-1 tip deploy under `GD-DEPLOY.R6`: preview suite on `pr-<n>` → prod preview classified → `pulumi up` → provenance → rollback recipe | implement | 185 (all Phase-A code landed) | M |
| 187 | `R6OPS.1` | ◆ DEP-2 drills: PITR restore to a scratch instance (pre-authorized), rollback drill on a preview, egress-denied playbook drill, alert-delivery proof, on-call runbook | implement | 186 + R6H1 sink | M |
| 188 | `R6INF.1` | ◆ DEP-3: SQL REGIONAL + proxy MIG×2 (pre-authorized, any window pre-launch — announce in the PR); worker flip iff 185 green; billing recompute + §13.5 probes | implement | 187 | S |
| 189 | `R6POST.1` | ◆ POST-1/-2/-3/-5/-7 live/-8/-9 prod arms ($0): SSR re-proof, signed-in legs + invite consume, deep-link, T8 410 + entitlement probes + export parity, usercontent signed-URL + header legs, SSE window re-read, Lighthouse/axe + drop-zone | implement | 188 + 184 + R6H1 invite | M |
| 190 | `R6POST.2` | ◆ POST-6 posture stages: domains-bearing `pr-<n>` (preview-subdomain DNS records pre-authorized; created + removed) for N8/R10.keepalive + Stripe test-mode stage for N9; teardown verified | implement | 189 + R6H1 `sk_test` | M |
| 190a | `HUMAN-R6H2` | **Operator session 2 (post-deploy):** browser/money legs (Google sign-in, Stripe live + real-money purchase + Portal, Safari, source editor, versions rail, PUT override, settings, real phone, EventSource chip, leg-cap reconcile) + approvals (legal text with the entity/jurisdiction/contact placeholders filled, H4 stamps, sample dossier, pick one public-domain essay, the exposure notice text only if R6FOR.2's verdict is yes) | HUMAN | 186 + 180 + 182a + 183 | — |
| 190b | `GATE-R6B` | Funded window open — thresholds per spec §6 (envelope headroom incl. the Showcase estimate, dry-run 9/9, provenance, tenant + DSN, 178 landed) | GATE | 189 | — |
| 191 | `R6FND.1` | ◆★ DISC-1 part 1: bind + T9 + launchers (the decomposer maps registry step ids from `packages/journeys/src/registry.ts` + `funded-window.mjs` ordering) | implement | 190b | M |
| 192 | `R6FND.2` | ◆★ DISC-1 part 2: riders + gate/edit legs + ECON measurement pairs | implement | 191 | M |
| 193 | `R6FND.3` | ◆★ DISC-1 part 3: B19C last-and-conditional + paid new-visitor journey + §5.6 census + D-CAP.2-1 carrier disposition | implement | 192 | M |
| 194 | `R6CNT.2` | ◆★ LCH-3/-4: Full-board run on the chosen public-domain essay → real Showcase bundle → `SHOWCASE_FIXTURE` swap + `assertShowcaseFixture`; H4 stamps applied; redeploy under `GD-DEPLOY.R6`; fresh-account Showcase leg | implement | 193 + R6H2 essay pick/approvals | M |
| 195 | `R6SECR.1` | ◆ SEC-3 **pre-launch adversarial security review** (ADR-112): code-against-controls read of `pen-test-scope.md`; live tenancy/authz probes on every user-serving route incl. the signed-URL mint + the classes that leaked; §12.8 injection; usercontent/cookie posture; money paths; triage-runbook severities; fix criticals/highs (run-time inserts if large); states non-independence | implement | 194 | M |
| 196 | `R6GLD.1` | ◆★ DISC-3: **minimal cohort** (one fixture per protocol × primary Review workflow, default tier/rigor — 4 runs; add missing protocol fixtures) → estimate (**pause if > $100**; hard cap $100) → one validation run at the launch-candidate SHA → floors green → standing re-run rule in `docs/ops/` | implement | 195 (last protocol-affecting change incl. any SEC-3 fix) | M |
| 196a | `HUMAN-MERGE-1` | Operator merges #175 → 196's PR bottom-up | HUMAN | 196 | — |
| 197 | `R6SWP.1` | ◆ GO-2: redeploy `main` HEAD (tree-equal) → provenance → first scheduled nightly green on `main` HEAD → D-SPA.28-1 + D-OBS.1-3 + BL-74/81 | implement | 196a | S |
| 197a | `GATE-LAUNCH` | The 13 pre-registered thresholds (spec §6) + the operator's go | GATE | 197 | — |
| 198 | `R6LCH.1` | ◆ GO-4: flips in order (metered per runbook → purchase → refund → trial everyone), each verified live; post-flip smoke on a fresh opt-out account; lint; watch armed | implement | 197a | M |
| 198a | `HUMAN-MERGE-2` | Operator merges 198's PR promptly | HUMAN | 198 | — |
| 199 | `R6CLK.1` | ◆ CLK-1..6 dated reads (purge ~10-30, Monday digest, hand-dated destruction, billed actuals + export confirm, admin-key reconcile, T8 7-day expiry) | implement | 198a (every read is post-hoc — job/delivery/ledger rows persist — so late placement in the linear chain is safe; each read asserts its date has passed) | S |
| 200 | `R6WATCH.1` | ◆ WATCH-1 at launch + 14 d: close on evidence or convert to owned alert-backed watches — **skeleton** until launch date fixes the window | skeleton→implement | 199 + launch + 14 d | M |
| 201–208 | tail | `R6CAP.1` → `R6CAP.3` → `GATE-ACCEPT.R6` → `R6REC.1` (TAIL-2 backlog/readiness incl. the G2/H2 re-home, roadmap reclass, owned obligations, the ADR-112 ≤ 60-day external pen-test obligation) → `R6REC.2` (TAIL-3 spec: ADR-113 §13.3 fold, ADR-112 security-row note, §17/ADR-111 check, BL-05) → `R6REC.3` (TAIL-4 integration + final sweep runbook) → `R6DOC.1` → `R6DOC.2` (TAIL-5; the closing run writes `projectStatus`) | capstone/reconcile/docs | 200 | S–M |

## Partition rationale (for the decomposer's Phase-4 review)

- **Why R6ENG.1 bundles five items:** all are CI/repo-hygiene with no shared runtime code and tiny
  diffs. ENG-8 is the only substantive one. Split ENG-8 out if the audit of ENG-1 is large.
- **Why the money work sits in one pre-deploy ticket (181):** the notice, claim consistency, refund
  copy and kill-switch test share the one pricing/estimator config decision. Splitting them would
  fragment that decision.
- **Why the funded wave is three tickets:** each part re-binds the guard (cumulative is
  lifetime-pinned, so the order holds across tickets) and fits 256k with per-leg evidence. A part
  that refuses at bind stops the remaining parts.
- **Why the Showcase build follows the funded wave (194):** it spends from the same envelope; the
  GATE-R6B headroom check includes its estimate.
- **Why the golden run is late (196):** the amended criterion is "at the launch SHA". Every
  protocol-affecting change (178, any 195 SEC-3 fix) must precede it, and a later protocol-affecting
  deploy re-runs it under the standing rule.
- **Why there are two merges:** MERGE-1 makes `main` == prod for the pre-launch nightly. MERGE-2
  makes post-launch nightlies read the flipped SHA. ENG-8 keeps docs-only merges from breaking
  provenance in between.
- **Shared decisions owned by the first ticket:**
  - the provenance-tolerance allowlist (176, consumed by 197/200);
  - the signed-URL mint helper (179, consumed by 189);
  - the `approved` content-flag shape (180, consumed by GATE-LAUNCH/194);
  - `docs/ops/launch-flips.md` (181, consumed by 198).
- **Why the security review (195) sits after the Showcase build:** it reviews the launch
  candidate, i.e. every surface that ships, including the signed-URL mint and the money paths
  exercised by the funded wave.
- **Run-time inserts are expected:** for R6SECR.1 findings and any R6FOR.1 defect too big to fix
  in-ticket — scoped `mode=extend`, suffix-letter files.

## Calendar realities (not dates — triggers)

- The external pen test is off the launch critical path (ADR-112). Its ≤ 60-day post-launch clock
  starts at launch.
- The metered-notice effective date is ≥ 30 days after sending **only if** the dry-run finds
  recipients (181 measures it).
- The ~2026-10-30 purge, the first Monday digest after the funded wave, and launch + 14 d are fixed
  by the clock.
