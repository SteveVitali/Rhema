# COST.1 — Production cost-posture levers (run ledger)

- **Spec:** `docs/tickets/164_COST.1__prod-cost-posture.md` (manifest row 164, round 5 —
  **expanded at run time** from `Kind: skeleton` per `decompose-spec mode=extend`, scoped to
  the ratified HUMAN-H9 ruling)
- **Normative loads:** `docs/build/readouts/HUMAN-H9.md` (ruling (a) — ~$50 target stands,
  cold floors/consolidation, **class-level lever authorization**); `docs/research/
  r5_d1_cost-levers.md` (D1-F1..F7 lever inventory + open questions);
  `docs/post-spa-disposition-spec.md` §7 BL-29; `docs/tickets/DEFERRALS.md` D-OPS.2-1/-2;
  `docs/rhema-design-spec.md` §13.5 (the SLO table REQ-COST-6 re-verifies)
- **Base:** `stevevitali/bl38-1-prod-residue-cleanup` tip @ `6cd03dd` (+ orchestrator memory
  commits `cbcecad`, `5631d5d`)
- **Branch:** `stevevitali/cost-1-prod-cost-posture` (mergePolicy=OPERATOR — never merge)
- **Harness:** devin-desktop/swe-2-high/subagent · **Skills:** implement-spec + build-memory @
  `~/agent-skills` (`e981ec5`)
- **Requirement ids stamped:** REQ-COST-1 REQ-COST-2 REQ-COST-3 REQ-COST-4 REQ-COST-5 REQ-COST-6
- **Authorization:** H9 class-level — **Class A scale-to-zero/cold floors** and
  **Class B consolidation** execute without further pause; everything else PAUSES
  (`D-COST.1-3`). Prod mutations ONLY via `pulumi up` with provenance.
- **Started:** 2026-10-16T01:18Z · **Closed:** —
- **PR:** — · **ci:** —

## Deferrals read

`docs/tickets/DEFERRALS.md` read first (protocol). Rows in blast radius:
- **D-OPS.2-1** (billing-export console flip — operator-owed via H8, OPEN): gates
  REQ-COST-1's *billed-actuals* before/after. Per the H8 deferral rule the ticket is not
  blocked — the recomputation (`billing-read.mjs`) is the honest proxy; a new D-COST.1-1
  names the measured read.
- **D-OPS.2-2** (warm-floor lever execution + HA levers, OPEN): this ticket IS its
  execute ticket (ADR-082's revisit trigger fired on H9 ruling-(a)). Executed subset lands
  with live evidence; the remainder (worker right-size + HA set — both out-of-class under
  H9) forwards to D-COST.1-3 → row flips PARTIAL.
- **D-SLO.1-5..8** context only — REQ-COST-6's re-verify reads the same probe surface.

## Requirements (from the expanded contract)

1. **REQ-COST-1** — execute authorized warm-floor levers; `billing-read.mjs` before/after
   each `up`; billed-actuals read → D-COST.1-1 (blocked by D-OPS.2-1).
2. **REQ-COST-2** — convert-svc `cpu-throttling:"false"` divergence codified-or-reverted in
   the same `up`: **revert** (explicit `cpuBilling:"request"` stage fact).
3. **REQ-COST-3** — min-instance/CPU-billing facts from `compute.ts` ternaries →
   `stages.ts` posture block, test-asserted.
4. **REQ-COST-4** — Redis degradation analysis, all consumers
   (`docs/ops/redis-degradation-analysis.md`).
5. **REQ-COST-5** — worker right-size engineered as stage fact + soak-leg spec; execution
   PAUSED out-of-class → D-COST.1-3.
6. **REQ-COST-6** — §13.5 re-verify post-lever: probe state + public-origin cold-start
   measurements; measured `import_preview` re-probe → D-COST.1-2 if the window is empty.

## Acceptance criteria

See the expanded ticket's checklist (per-service posture block test-asserted · preview shows
only authorized updates zero stateful replace/delete · `pulumi up` provenance · billing-read
before/after committed · Redis analysis committed · §13.5 re-verify · out-of-class paused ·
green gate + ledger advanced + D-OPS.2-2 dispositioned).

## Lever-class map (H9 ruling-(a) — the scoping table)

**Class A (scale-to-zero / cold floors) — EXECUTED via `pulumi up`:**
convert-svc `cpuIdle`→request-billed (−$42.12, the REQ-COST-2 drift revert) ·
export+fetcher+api+web+collab min 1→0 (−$48.60). **Class B (consolidation)** — none
executed (all real consolidation candidates are design changes → paused).
**Kept warm deliberately:** worker min=1 instance-billed (forbidden to zero — all
pg-boss consumers/crons die at 0); convert-svc min=1 request-billed (the
`import_preview_p95_s` ≤20 s floor IS the service's purpose — zeroing rides the live
re-probe, D-COST.1-2). **Paused out-of-class → D-COST.1-3:** worker right-size, GKE node
spot/zero-scale (design), SQL db-f1-micro (prod-readiness), Redis removal (design),
proxy sizing (fail-closed egress), HA levers (cost-increasing, anti-ruling-(a)).
**Resolved by read:** the 2nd external IPv4 = Cloud NAT auto-IP — no lever (D1-Q2).

## Plan

1. `stages.ts`: `CloudRunServicePosture` + `cfg.cloudRun` block (the REQ-COST-3 fact
   move) — prod: api/web/collab/export/fetcher min 0 (class A), worker min1/max3/
   `cpuBilling:"instance"`, convertSvc min1/max4/`cpuBilling:"request"` (the REQ-COST-2
   codified revert); non-prod postures unchanged from today's effective shape.
2. `compute.ts`: services loop + convert-svc consume `cfg.cloudRun` verbatim — min/max
   instance counts, `cpuIdle` from `cpuBilling`, per-service `resources` (limits/boost)
   only where the posture declares them.
3. Tests: `stages.test.ts` pins the posture facts incl. the forbidden-to-zero worker pin +
   the convert-svc request-billed pin; `compute.test.ts` updated for posture consumption.
4. `docs/ops/redis-degradation-analysis.md` — REQ-COST-4.
5. Verify: focused vitest → `pnpm turbo build lint typecheck` → `pnpm test` → six `check:*`.
6. Deploy (class A only): `pulumi preview --diff` (must show ONLY the lever updates) →
   `pulumi up` with provenance → post-reads (`gcloud` inventory, `billing-read.mjs` after,
   public-origin cold-start curls, worker `[slo]` log lines).
7. DEFERRALS: D-OPS.2-2 → PARTIAL w/ evidence; open D-COST.1-1/-2/-3.
8. Closeout: PR body, BUILD_INDEX row, LEDGER advance (nextTicket → VERIF.2, chainTip →
   cost-1), append-only + check-build-memory, `gh pr create`, push.

## Test matrix

- `stages.test.ts`: prod posture = scale-to-zero floors on the five request-billed
  services; worker min=1 `instance`-billed (the forbidden-to-zero invariant — fails if any
  future edit zeros or request-bills the worker); convert-svc min=1 `request`-billed (the
  codified revert); non-prod floors unchanged (worker min 1, rest 0); collab max=1
  everywhere (single-writer).
- `compute.test.ts`: the posture consumption pins — `minInstanceCount`/`maxInstanceCount`
  read `cfg.cloudRun.services[…]`/`cfg.cloudRun.convertSvc`; `cpuIdle` emitted iff
  `cpuBilling === "instance"` on services and explicitly `true` on convert-svc.
- Live legs: `pulumi preview --diff` gate → `pulumi up` → `gcloud` inventory assertions →
  `billing-read.mjs` after → cold-start curls on `rhema.tools` + `api.rhema.tools/healthz`
  → `gcloud logging read` for `[slo]` lines.

## Progress

- 2026-10-16T01:18Z — context loaded: ticket (skeleton), DEFERRALS (D-OPS.2-1/-2),
  r5_d1_cost-levers, §7 BL-29, HUMAN-H9 readout, AGENTS.md invariants, LEDGER CURRENT STATE.
- 2026-10-16T01:19Z — live reads ($0): convert-svc `cpu-throttling:"false"` + minScale 1
  confirmed out-of-band (IaC carries no `cpuIdle` — the F3 drift); api/web/collab/export/
  fetcher min=1 request-billed; worker min=1 `cpu-throttling:"false"` (intended);
  turbo-cache + ops-alert-catcher already min=0.
- 2026-10-16T01:21Z — `billing-read.mjs --json` BEFORE: **$285.80/mo** (warm floor 152.28:
  convert-svc 51.84 + worker 51.84 + 5×9.72 request-billed min=1). `pulumi preview` clean —
  172 unchanged; `pulumi refresh --preview-only` shows no managed drift (2 read-errors on
  the billing-budget provider — ADC quota-project, unrelated to the diff).
- 2026-10-16T01:24Z — IPv4 resolved: the second in-use external addr is the Cloud NAT
  auto-IP `nat-auto-ip-…` — load-bearing, no lever (D1-Q2 answered).
- 2026-10-16T01:26Z — `stages.ts` posture block landed (`CloudRunServicePosture` /
  `CloudRunPosture` / `cfg.cloudRun`); `compute.ts` consumes it (services loop +
  convert-svc; `cpuIdle` declared on EVERY service — never left implicit again);
  collab max=1 pin preserved at every stage. `compute.ts` posture-map type fix for
  the non-Cloud-Run `SERVICES` entries (`egress-proxy`, `run-task`) — `tsc` exit 0.
- 2026-10-16T01:28Z — tests: `stages.test.ts` (posture pins — prod scale-to-zero set,
  worker forbidden-to-zero, convert-svc request-billed, non-prod floors, collab max=1)
  + `compute.test.ts` (posture-consumption structural pins). Focused vitest **45/45**
  (28 stages + 17 compute).
- 2026-10-16T01:31Z — `docs/ops/redis-degradation-analysis.md` committed (REQ-COST-4):
  throttles → in-memory fallback (ADR-039); SSE fan-out → re-poll fallback;
  `RedisHeartbeatStore` → NO fallback, reaper-required — removal is a design change,
  never a COST.1 lever.
- 2026-10-16T01:32Z — `pnpm turbo build lint typecheck` **135/135**; `pnpm test`
  **499 files / 5,804 pass / 6 skip / 0 fail** (337 s); all six `check:*` gates OK.
- 2026-10-16T01:34Z — `pulumi preview --diff`: EXACTLY the six authorized updates
  (5× `minInstanceCount 1→0` + convert-svc `cpuIdle false→true`), 166 unchanged,
  zero create/delete/replace → saved `reports/2026-10-16_COST.1/pulumi-preview-diff.txt`.
- 2026-10-16T01:35Z — **`pulumi up` update 151** (1m1s, all six updated; the class-A
  lever set under H9 authorization — no re-ask needed inside the class).
- 2026-10-16T01:36Z — post-up `gcloud` inventory: api/web/collab/export/fetcher
  `minScale: '0'` + `cpu-throttling: 'true'`; convert-svc `minScale: '1'` +
  `cpu-throttling: 'true'` (the drift REVERTED — was `'false'`); worker UNCHANGED
  `minScale: '1'` + `cpu-throttling: 'false'` (`post-up-inventory.txt`).
- 2026-10-16T01:36Z — `billing-read.mjs --json` AFTER: **$198.32/mo** (−$87.48 vs the
  01:21Z $285.80 baseline; Cloud Run floor $152.28 → $64.80 = convert-svc $12.96 +
  worker $51.84 + rest $0). `billing-read-after.json` committed.
- 2026-10-16T01:37Z — cold-start probes (`cold-start-probes.txt`): `rhema.tools/`
  200 in 1.42 s cold → 0.14 s warm; `api.rhema.tools/healthz` 200 in 0.28 s →
  0.10 s. Healthz provenance UNCHANGED `ffbb8ad0…` on both (scaling-only revision
  roll — no image rebuild; `healthz-provenance.txt`).
- 2026-10-16T01:37Z — `[slo]` probe loop alive post-up (tick 01:35:18Z). The only
  firing signal is the STANDING `run_success_rate_24h_pct=0` violation — empty
  organic cohort, firing identically since before the deploy (00:40Z+); no new
  breach attributable to the levers. `import_preview_p95_s` reads `empty` in the
  2026-10-14 weekly readout — no samples to re-probe → **D-COST.1-2**.

## Gap table

| item (contract §) | required layer | achieved | status | evidence / unresolved |
|---|---|---|---|---|
| REQ-COST-1 — levers executed + billing-read before/after | live-executed | yes — update 151; $285.80 → $198.32 recomputed | **done** | `pulumi-up.txt` · `billing-read-after.json` (BEFORE read in §Progress 01:21Z) |
| REQ-COST-1 billed-actuals read | live | no — no export exists | **met-engineered(D-COST.1-1)** | gates on D-OPS.2-1; never fabricated |
| REQ-COST-2 — convert-svc drift codify-or-revert | live-executed | yes — `cpu-throttling` `false→true` live; `cpuBilling:"request"` fact codifies intent | **done** | `post-up-inventory.txt` |
| REQ-COST-3 — posture facts in stages.ts, consumed verbatim | engineered | yes — `cfg.cloudRun` block; zero posture ternaries left in `compute.ts` | **done** | `stages.ts` + `compute.ts` diffs; tests pin facts |
| REQ-COST-4 — Redis degradation analysis | engineered | yes — all consumers + the no-fallback reaper named | **done** | `docs/ops/redis-degradation-analysis.md` |
| REQ-COST-5 — worker right-size engineered + soak spec; execution paused | engineered | yes — `resources` stage fact is the one-field flip; soak spec on D-COST.1-3; NOT executed (out-of-class) | **done** | `stages.test.ts` pin; DEFERRALS D-COST.1-3 |
| REQ-COST-6 — §13.5 re-verify post-lever | live-executed | probe ticks green post-up; standing run-success violation unchanged; cold-start curls recorded | **done** | `slo-probe-logs.txt` · `cold-start-probes.txt` |
| REQ-COST-6 measured `import_preview_p95_s` re-probe | live | no — signal `empty`, zero samples | **met-engineered(D-COST.1-2)** | weekly readout 2026-10-14 |
| out-of-class levers paused + ledgered | agentic | yes — nothing executed outside class A | **done** | ticket lever map · D-COST.1-3 |
| verification green + ledger advanced + D-OPS.2-2 dispositioned | agentic | gates below; D-OPS.2-2 → PARTIAL | **done** | closeout |

## Evidence log

- `docs/build/reports/2026-10-16_COST.1/pulumi-preview-diff.txt` — the pre-up diff:
  6 updates only (5× minScale + convert-svc cpuIdle), 166 unchanged
- `…/pulumi-up.txt` — **update 151**, `~ 6 updated / 166 unchanged`, 1m1s
  (https://app.pulumi.com/14stevevitali-gmail-com/rhema/prod/updates/151)
- `…/post-up-inventory.txt` — live annotations: floors at min=0; convert-svc
  `cpu-throttling:'true'`; worker untouched
- `…/billing-read-after.json` — **$198.32/mo** recomputation (generatedAt
  2026-10-16T01:36:29Z; BEFORE $285.80 @ 01:21:21Z per §Progress)
- `…/cold-start-probes.txt` — public-origin cold/warm latency pairs
- `…/healthz-provenance.txt` — `build.gitSha=ffbb8ad0…` on api+web post-up
  (scaling-only roll; deploy provenance intact)
- `…/slo-probe-logs.txt` — post-up `[slo]` ticks + the 2026-10-14 weekly readout
  (`import_preview_p95_s: empty`)
- `pnpm vitest run infra/config/stages.test.ts infra/pulumi/compute.test.ts` → **45/45**
- `pnpm turbo build lint typecheck` → **135/135**
- `pnpm test` → **499 files, 5,804 pass / 6 skip, 0 fail**
- `check:licenses`/`check:protocol-markers`/`check:no-cookies`/`check:spa-budget`/
  `check:spa-env`/`check:dom-contract` → see closeout
- `check-build-memory.sh` + `check-append-only.mjs` → see closeout

## Evidence report

**Verdict: done — live-executed inside the H9 class authorization.** Every in-class
lever landed through `pulumi up` update 151 with preview-diff provenance; the
recomputed posture dropped $285.80 → **$198.32/mo** (−$87.48, ≈ projected −$90.72).
The honest ruling-(a) finding stands recorded in the ticket: ~$198 remains ~4× the
$50 target — the remaining ~$145 requires the paused redesign moves (D-COST.1-3)
the class ruling does not cover.

| command / leg | result |
|---|---|
| `pnpm turbo build lint typecheck` | **135/135** |
| `pnpm test` | **499 files — 5,804 pass / 6 skip / 0 fail** (337 s) |
| focused `vitest` (stages + compute) | **45/45** |
| `check:licenses` | OK — 822 packages |
| `check:protocol-markers` | OK — 248 files, no markers/leaks |
| `check:no-cookies` | OK — 257 ingestion files |
| `check:spa-budget` | OK — all ceilings held |
| `check:spa-env` | OK — 115 sources / 146 artifacts |
| `check:dom-contract` | OK — manifest ⊆ emitted+asserted |
| `pulumi preview --diff` | 6 in-class updates, 166 unchanged, 0 create/delete/replace |
| `pulumi up` (prod, update 151) | **6 updated, 166 unchanged, 1m1s** |
| post-up `gcloud` inventory | floors min=0; convert-svc throttling reverted; worker unchanged |
| `billing-read.mjs` after | **$198.32/mo** (−$87.48) |
| §13.5 probe post-up | alive; no new breach (standing empty-cohort violation only) |
| cold-start curls | web 1.42 s / api 0.28 s cold → ~0.1 s warm |

**Gap analysis vs acceptance criteria:** (1) posture block + consumption pins —
**met**; (2) preview shows only authorized updates — **met**; (3) `pulumi up` with
provenance + post-inventory — **met**; (4) billing-read before/after committed;
billed-actuals `met-engineered(D-COST.1-1)` — **met**; (5) Redis analysis — **met**;
(6) §13.5 re-verify + cold-starts; `import_preview` re-probe
`met-engineered(D-COST.1-2)` — **met**; (7) out-of-class paused — **met**;
(8) green gate + ledgers + D-OPS.2-2 PARTIAL — **met** at closeout.
