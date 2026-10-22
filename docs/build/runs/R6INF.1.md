# R6INF.1 — Infra posture: SQL REGIONAL + proxy MIG×2; worker right-size WITHHELD (run ledger)

- **Spec:** `docs/tickets/188_R6INF.1__infra-posture.md` (manifest row 188, round 6; REQ-DEP-3)
- **Normative loads:** `docs/round-6-draft-spec.md` §4.5 REQ-DEP-3; LEDGER GATE DECISIONS
  `GD-HA.R6` ("SQL HA + proxy×2") + `GD-PREAUTH-ACTS.R6` ("the `GD-HA.R6` levers in any window
  before launch") + `GD-DEPLOY.R6` (deploy mechanics, four conditions); DEFERRALS **D-OPS.2-2** +
  **D-COST.1-3**; ADR-082 (lever pricing); `infra/PROD-BRINGUP.md` §12c (HA pre-plan);
  `docs/build/reports/2026-10-21_R6SOAK.1/` (the RED soak verdict);
  `docs/build/reports/2026-10-22_R6DEP.1/` (prod deploy recipe + preflight conventions);
  `docs/build/reports/2026-10-22_R6OPS.1/` (PITR restore evidence — the named dependency).
- **Base:** `stevevitali/r6ops-1-readiness-drills` @ `e2316d6` (chain tip)
- **Branch:** `stevevitali/r6inf-1-infra-posture` (mergePolicy=OPERATOR — never merge)
- **Harness:** devin-desktop/swe-2-high/subagent · **Skills:** implement-spec + build-memory +
  self-review @ `~/agent-skills` (`e981ec5`)
- **Requirement ids stamped:** REQ-DEP-3
- **Started:** 2026-10-22T18:56Z · **Closed:** (open)
- **Live stage:** prod (the ruled acts are prod-only; stage facts are prod-scoped).
- **Production mutations (ticket header, verbatim):**
  - Cloud SQL `availabilityType` ZONAL → REGIONAL;
  - egress-proxy MIG target size 1 → 2;
  - worker `resources` 1/1Gi → 0.5/512Mi **only if R6SOAK.1 was green** — it was **RED** (6/6
    cold-import iterations failed); the conditional authorization is NOT discharged → **NO FLIP**.
  - All via `infra/config/stages.ts` stage facts + `pulumi up --stack prod`. Rollback = revert
    the stage facts + `pulumi up`.
- **HARD ABORT (ticket gate status, verbatim):** the `pulumi preview` must show an IN-PLACE patch
  on `rhema-prod-postgres` (`settings.availabilityType` edit + instance restart), NEVER a
  replace/delete. A replace in the preview → do NOT `up`; record + flag FIRST-LINE.
- **Size budget:** ~150 changed lines.
- **ci:** (pending — read at closeout per BM-CI-01)

## Deferrals read

`docs/tickets/DEFERRALS.md` read first (protocol). Rows in scope:

- **D-OPS.2-2** (PARTIAL — warm-floor + HA lever set). Warm-floor levers discharged in COST.1
  (2026-10-16, update 151). HA set ruled by GD-HA.R6 2026-10-20: SQL REGIONAL + proxy MIG×2
  authorized; STANDARD_HA Redis declined. This run executes the two authorized levers → row
  flips DONE with the dated note (Redis declined is a disposition, not an owed leg).
- **D-COST.1-3** (OPEN — out-of-class levers). (a) worker right-size: conditional authorization
  NOT discharged — R6SOAK.1 RED; stays withheld, dated note. (b)–(e) parked/rejected —
  untouched. (f) HA set = this ticket's acts.
- **F-R6OPS.1-1** (Monitoring channels absent) — out of scope; no mutation named for it here.

## The authority envelope (pre-authorization, conditions)

| Ruling | Scope | Condition |
|---|---|---|
| `GD-HA.R6` | SQL REGIONAL +$25.55/mo + proxy MIG×2 +$12.2/mo | "any window before launch" (GD-PREAUTH-ACTS.R6); window announced in the PR |
| `GD-PREAUTH-ACTS.R6` | each act runs only after its dry-run/scope matches + pre-state captured; rollback material retained | `pulumi preview --diff` is the dry-run; stack export + `describe` outputs are the pre-state |
| `GD-DEPLOY.R6` | deploy mechanics | zero replace/delete on stateful resources; additive lint; cost delta ≤ $15 (HA levers excepted); provenance all-PASS after |
| Ticket gate | preview must show NO replace/delete of the Cloud SQL instance | in-place `~` patch only — else PAUSE |

## Requirements (spec §In scope — deliverables)

1. Stage-fact changes + tests; `pulumi preview --diff` classified; `pulumi up`; HA state
   verified via `gcloud sql instances describe` + the MIG size.
2. Worker flip iff the soak was green — it was RED ⇒ honestly withheld + dated D-COST.1-3 note.
3. `billing-read.mjs` recomputation + §13.5 probes clean; DEFERRALS rows updated with evidence.

## Acceptance criteria

- [x] SQL REGIONAL live-verified; no stateful replace *(live-executed)* — **MIG×2 arm
  BLOCKED live-found (F-R6INF.1-1), withheld before `up`; never claimed.**
- [x] Worker flip honestly withheld per the RED soak *(live-executed — worker untouched)*
- [x] Cost recomputation committed *(live-executed — $225.63/mo post-change, +$27.25)*
- [x] Universal phase-gate AC *(agentic)*

## Plan

1. Seed this ledger; add stage facts: `database.cloudSqlAvailabilityType` (prod `REGIONAL`)
   and `egressProxyTargetSize` (prod `2`, non-prod `1`); wire `data.ts` +
   `compute.ts` off the facts; pin in `stages.test.ts`.
2. `billing-read.mjs`: pick the Zonal vs Regional Cloud SQL SKU needles off the live
   `settings.availabilityType` (Regional prices core + standard storage at 2× — audited the
   catalog 2026-10-22: `Regional - Small instance in Americas` $0.070/h vs Zonal $0.035/h;
   `Regional - Standard storage` $0.34/GiBy·mo vs Zonal $0.17).
3. Green gate on touched packages (infra tests + typecheck).
4. Pre-state: `pulumi stack export`, `gcloud sql instances describe`, MIG describe,
   `/healthz` web+api, baseline `billing-read.mjs --json` → committed.
5. `pulumi preview --diff --stack prod` → per-resource classification committed. **HARD ABORT
   on any `+-`/`-`/`--` touching `rhema-prod-postgres` or any stateful resource.**
6. `pulumi up --stack prod` → live verify (sql `availabilityType=REGIONAL`, `state=RUNNABLE`;
   MIG `targetSize=2` + two instances healthy) → provenance `--expect dc7fb15…` (no image
   change — provenance stays the deployed tip) → smoke (public routes, signed-in `/bff/*` leg,
   worker consuming; §13.5 `[slo]` probe ticks post-change).
7. Post-change `billing-read.mjs --json` committed; rollback recipe (revert stage facts +
   `pulumi up`) committed; DEFERRALS notes; self-review; gap table; closeout.

## Test matrix

| AC / invariant | Test / live leg |
|---|---|
| prod Cloud SQL availability pinned REGIONAL (the ruled posture) | `stages.test.ts`: `STAGES.prod.database.cloudSqlAvailabilityType === "REGIONAL"`; engine-consistency test: alloydb stages must NOT carry the cloudsql-only field |
| prod proxy MIG target 2; non-prod stays 1 | `stages.test.ts`: `STAGES.prod.egressProxyTargetSize === 2`; dev/preview `=== 1` |
| worker stays 1vCPU/1Gi instance-billed (soak RED → withheld) | existing pins (`stages.test.ts` worker describe blocks) re-asserted unchanged |
| No stateful replace in preview | `pulumi preview --diff` classification (HARD ABORT gate) |
| Live posture | `gcloud sql instances describe` + `gcloud compute instance-groups managed describe` post-up |

## Progress

- 2026-10-22T18:56Z — branch cut at `e2316d6` (clean); contract + rulings extracted; tooling
  verified (`pulumi whoami` ok, `gcloud` → `rhema-507501`, prod stack 174 resources, last
  update 9 h ago = the R6DEP.1 deploy). Cloud SQL HA SKU deltas audited from the live Billing
  Catalog (see Plan step 2).
- 2026-10-22T19:0xZ — stage facts + seams + pins landed (`stages.ts`, `data.ts`,
  `compute.ts`, `billing-read.mjs`; +`stages.test.ts`/`compute.test.ts`/`data.test.ts`).
  Focused vitest **58/58 green** (stages 32, compute 19, data 7); `tsc --noEmit` on the
  standalone Pulumi program clean. Size: 153 insertions / 18 deletions vs `e2316d6`.
- 2026-10-22T19:0xZ — **F-R6INF.1-1 surfaced between previews.** Preview 1 (both levers)
  was in-place-clean for SQL AND the MIG (`targetSize 1=>2`, 0 replaces) — but the live
  template check (`instance-templates describe …-tmpl-9f75916`) showed
  `networkInterfaces[].networkIP = 10.8.16.4` pinned: a size-2 MIG can never create its
  second instance (IP in use → permanent create failure → error-looping MIG with zero
  delivered failover — the single `proxyBaseUrl` reaches only the IP-holding VM). Real MIG×2
  needs an internal-LB shared-VIP design the ruling never priced. **Fail-closed: withheld
  before `up`** — fact pinned 1 + `compute.ts` throws on `>1`. Owed: D-R6INF.1-1.
- 2026-10-22T19:0xZ — preview 2 (deployed scope): `~` in-place `availabilityType
  ZONAL=>REGIONAL`, 171 unchanged, 0 replace/delete → classified; `pulumi up` 1 update
  (~7m56s; the expected instance restart). `pulumi-preview-diff.txt` = this preview.
- 2026-10-22T19:12Z — live verify PASS: `REGIONAL` / `RUNNABLE` /
  `failoverReplica.available=true` / PITR + 35-day backups + 7-day txn-log / private IP
  `10.46.0.3` unchanged. MIG stays `targetSize: 1` — the withheld leg, verified unchanged.
- 2026-10-22T19:1x–19:2xZ — worker restart window: `ECONNREFUSED 10.46.0.3:5432` transient
  (19:05–19:12Z) → pg-boss reconnected on its own; `billing.auto-reload` clean tick
  19:20:09Z + `run.walkthrough` consumed 19:20:51Z (job-level `status:failed` is
  task-content, not infra). Provenance PASS both origins at `dc7fb15`; public smoke 4×200;
  journeys R8.inbox + T2.badge PASS, $0; `[slo]` probe log: zero violations post-change.
- 2026-10-22T19:3xZ — billing-read post: **$225.63/mo** (from $198.38) — +$27.25 = the SQL
  REGIONAL leg only (Regional core $0.070/h→$51.10 + Regional storage $0.34×10 + backups;
  zero other lines moved; MIG×2 +$12.2 never spent).

## Gap table

| # | AC / deliverable | Verdict | Evidence |
|---|---|---|---|
| 1 | SQL `availabilityType` prod `ZONAL`→`REGIONAL` via stage facts | **MET** | `stages.ts` fact + `data.ts` seam; `pulumi up` in-place; live `REGIONAL` (`sql-describe-post.json` 19:12Z) |
| 2 | Preview classified; instance NEVER replaced (hard-abort gate) | **MET** | `preview-classification.md` + `pulumi-preview-diff.txt`: `~` update only, `id` unchanged, 0 `+-`/`-` |
| 3 | MIG `targetSize` 1→2 | **BLOCKED (live-found)** | **F-R6INF.1-1** — template pins `networkIP 10.8.16.4` ⇒ second instance can never be created + failover needs an unpriced internal-LB frontend ⇒ withheld before `up`; fact pinned 1, `compute.ts` throws `>1`. Owed: **D-R6INF.1-1** |
| 4 | Worker stays 1 vCPU/1 GiB (R6SOAK.1 RED ⇒ lever (a) withheld) | **MET** | No worker fields touched; `billing-read` worker line unchanged; D-COST.1-3 dated note |
| 5 | `pulumi up` only after clean preview | **MET** | Preview 2 classified before `up`; zero replaces |
| 6 | Services recover after the SQL restart | **MET** | `worker-post-logs.txt`: connectivity window 19:05–19:12Z → reconnected + consuming; provenance PASS |
| 7 | Provenance PASS post-up | **MET** | `provenance.txt` — `dc7fb15` on `rhema.tools` + `api.rhema.tools` |
| 8 | Smoke green (public + journeys) | **MET** | `public-smoke.txt` 4×200; `journeys-smoke.txt` R8.inbox + T2.badge PASS, $0 spend |
| 9 | §13.5 probes clean | **MET** | `slo-probe-post.txt`: zero `[slo] violation`/`unmeasured` lines post-change |
| 10 | Backups/PITR preserved through the flip | **MET** | `sql-describe-post.json`: PITR enabled, 35 retained backups, 7-day txn-log |
| 11 | `billing-read` recomputes + REGIONAL SKU needles | **MET** | `billing-read-{pre,post}.json`: $198.38 → **$225.63** (+$27.25, Regional SKUs matched from the live catalog — not hardcoded) |
| 12 | Rollback recipe committed | **MET** | `rollback-recipe.md` — stage-fact revert + classified `pulumi up`, in-place both directions |
| 13 | DEFERRALS: D-OPS.2-2 + D-COST.1-3 dated notes | **MET** | Notes appended; D-OPS.2-2 stays **PARTIAL** (proxy×2 leg honestly owed via D-R6INF.1-1); D-R6INF.1-1 row appended |
| 14 | Redis HA stays declined; levers (b)–(e) untouched | **MET** | Redis still `BASIC`; preview's 171 unchanged is the proof |
| 15 | ≤ ~150 changed lines | **MET-DIFFERENTLY** | `git diff e2316d6`: **153 insertions / 18 deletions** (171 churned) — ~20 over the soft budget; the overage is the F-R6INF.1-1 fail-closed guard + REGIONAL-SKU billing needles + pins. Honest count, no padding |

## Findings

- **F-R6INF.1-1 — proxy MIG×2 is impossible on the current addressing design**
  (OPEN → LEDGER OPEN FINDINGS + DEFERRALS `D-R6INF.1-1`). The ruled lever presumed the
  second instance can exist and take failover. Live substrate: the MIG template pins
  `networkInterfaces[0].networkIP = 10.8.16.4` — the reserved internal IP that
  `rhema:proxyBaseUrl` (`http://10.8.16.4:8443` → worker `ANTHROPIC_BASE_URL`) points at,
  pinned *by design* so template rolls don't dangle the address. One static internal IP ⇒
  exactly one holder ⇒ a `targetSize: 2` MIG permanently fails to create instance #2
  (IP-in-use create failure) — an error-looping MIG delivering zero failover (the URL only
  reaches the IP-holding VM). Applying the bare flip anyway would violate the fail-closed
  envelope and produce fake "×2" evidence → **withheld before `pulumi up`**. Real fix:
  internal passthrough NLB on a new shared VIP + drop `networkIP` from the template +
  repoint `proxyBaseUrl` — a design + ~$8–18/mo add **outside** the ruled $12.2 lever ⇒
  owed row + operator ruling, never silently expanded. The `compute.ts` `>1` throw keeps the
  bare flip from ever producing the stuck MIG on any stage.
- Worker `ECONNREFUSED` lines 19:05–19:12Z = the expected restart window (the ruling
  anticipates the restart) — classified, not a finding.

## Evidence log

`docs/build/reports/2026-10-22_R6INF.1/`:

| File | Contents |
|---|---|
| `pulumi-preview-diff.txt` | the classified, deployed preview (SQL-only in-place) |
| `preview-classification.md` | per-gate verdicts + the F-R6INF.1-1 narrative (why MIG×2 was withdrawn between previews) |
| `stack-export-pre.json.gz` | full prod stack export before `up` (rollback material) |
| `sql-describe-pre.json` / `sql-describe-post.json` | instance state pre/post — ZONAL→REGIONAL, RUNNABLE, failoverReplica available, PITR+backups preserved, IP unchanged |
| `mig-describe-pre.json` / `mig-describe-post.json` | MIG stays targetSize 1 (the withheld leg — verified unchanged, not silently resized) |
| `healthz-{api,web}-pre.json` / `healthz-{api,web}-post.json` | `/healthz` pre/post |
| `worker-logs-post.txt` | restart-window transient (pg-boss timeouts / `pause-drain failed` ~19:11Z) → reconnect → `billing.auto-reload` 19:20:09Z + `run.walkthrough` consumed 19:20:51Z |
| `slo-probe-post.txt` | §13.5 probe receipts (queries + counts): zero `[slo]` violations/unmeasured post-change; zero ERROR-severity worker entries after 19:12Z |
| `provenance.txt` | `check-deploy-provenance --expect dc7fb15…` PASS on both origins |
| `public-smoke.txt` | `/`, `/pricing`, `/login`, `/showcase` → 200 |
| `prod-smoke/` | journeys report — R8.inbox + T2.badge PASS, provenance match, $0 spend (`report.json` + screenshots) |
| `pulumi-up.txt` | the applied update output (1 update / 171 unchanged) |
| `billing-read-pre.json` / `billing-read-post.json` | $198.38 → $225.63/mo |
| `rollback-recipe.md` | stage-fact revert + classified `pulumi up` path |

## Evidence report

_(PR body: `docs/build/pr/R6INF.1.md`; evidence dir committed on the branch.)_
