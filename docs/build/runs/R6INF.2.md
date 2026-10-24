# R6INF.2 — ADR-122 egress-proxy ILB implementation (run ledger)

- **Spec:** `docs/adr/ADR-122-egress-proxy-internal-passthrough-nlb-shared-vip.md` (verbatim —
  the contract; findings work, no manifest ticket file) + `docs/tickets/DEFERRALS.md` row
  `D-R6INF.1-1` + finding `F-R6INF.1-1` (LEDGER OPEN FINDINGS).
- **Normative loads:** `GD-REMAINING.R6` ("approve all remaining tasks, proceed" — item (1)
  approves ADR-122's ≈+$18/mo delta + implementation, 2026-10-23); `GD-HA.R6` (proxy×2 +$12.2
  already ruled); `GD-PREAUTH-ACTS.R6` (the HA levers "in any window before launch" — the
  ruling IS the named window; the three ups run sequentially with verification between);
  `GD-DEPLOY.R6` (each `pulumi up --stack prod`: preview classified, zero **stateful**
  replace/delete — the proxy instance + template are STATELESS, the `proxy-ip` Address is
  retained; additive-migration lint; cost delta ≈+$18/mo documented; provenance all-PASS
  after). `runs/R6INF.1.md`; `reports/2026-10-22_R6INF.1/preview-classification.md`.
- **Base:** `stevevitali/r6cnt-3-showcase-regen` @ `40b6c5f` (pushed chain tip)
- **Branch:** `stevevitali/r6inf-2-proxy-ilb` (mergePolicy=OPERATOR — never merge)
- **Harness:** devin-desktop/swe-2-high/subagent · **Skills:** implement-spec + build-memory +
  self-review @ `~/agent-skills`
- **Requirement ids stamped:** REQ-ARCH-2, REQ-ARCH-30, REQ-DEP-3
- **Started:** 2026-10-24T01:2xZ · **Closed:** 2026-10-24T02:1xZ
- **Live stage:** prod (the three ups + the failover drill are prod acts).
- **Production mutations (from the ADR — verbatim scope):**
  - `pulumi up` ×3 on `--stack prod`: (A) `proxy-vip` Address + `proxy-be`
    RegionBackendService + `proxy-fr` ForwardingRule — additive only, MIG untouched;
    (B) `rhema:proxyBaseUrl` → `http://<vip>:8443` in `Pulumi.prod.yaml` (worker
    `ANTHROPIC_BASE_URL` + api `EGRESS_PROXY_URL` roll to the VIP; the old `10.8.16.4`
    direct path keeps serving in-flight pods); (C) template drops `networkIp` +
    `egressProxyTargetSize` 1→2 (MIG roll — stateless per the ADR).
  - Failover drill: `gcloud compute instances delete` on one proxy instance → autoheal.
  - `proxy-ip`/`10.8.16.4` Address resource **retained** (the ADR's rollback path; cleanup
    `up` D is post-soak, NOT this ticket).
  - Rollback: before up C — `rhema:proxyBaseUrl` back to `http://10.8.16.4:8443` + `up`;
    after up C — `git revert` of the template/guard/resize change + `up`.
- **HARD PAUSE conditions (GD-DEPLOY.R6 + worker brief):** any preview showing a
  replace/delete on a STATEFUL resource (SQL, disks, the retained `proxy-ip` Address, DNS)
  → PAUSE + report. Anything observed contradicting the ADR's no-disruption claim before
  up C (unhealthy backends, in-flight runs detected) → PAUSE before up C.
- **ci:** boundary in flight — `logs/ci-R6INF.2.json` (PR #218)

## Deferrals read

`docs/tickets/DEFERRALS.md` read first (protocol). Rows in scope:

- **D-R6INF.1-1** (OPEN) — THIS ticket is its named implementation half: the operator
  ruling landed via `GD-REMAINING.R6` item (1); legs (a)–(e) are the ADR's resources +
  repoint + resize + drill. Close with live evidence on success.
- **D-OPS.2-2** (PARTIAL — owed proxy leg) — this ticket discharges the proxy MIG×2 arm;
  flip DONE with the dated note (Redis stayed declined — a disposition, not owed).
- **D-COST.1-3** (OPEN) — (f) HA set: proxy arm executes here → dated note; (a)–(e)
  untouched (worker right-size still withheld on R6SOAK.1 RED).
- **F-R6CNT.3-1** (OPEN finding, phase done-gate) — unrelated; untouched.

## Requirements (ADR-122 §Decision + §Migration + §Drill + §Rollback)

1. `proxy-vip` `gcp.compute.Address` (INTERNAL, GCE_ENDPOINT, private-app, auto-assigned).
2. `proxy-be` `gcp.compute.RegionBackendService` (INTERNAL, TCP, `portName:"https"`,
   reuse `proxyHealth`, backend = the MIG, small `connectionDrainingTimeoutSec`,
   `sessionAffinity:"NONE"`).
3. `proxy-fr` `gcp.compute.ForwardingRule` (INTERNAL, TCP, `ipAddress:` VIP, ports 8443,
   `backendService:` proxy-be, network + `subnetwork:` private-app,
   `allowGlobalAccess:false`).
4. Template `networkInterfaces[].networkIp` removed, gated behind the frontend presence
   (the transitional pin survives ups A/B — the direct IP must stay bound until the
   consumers have repointed).
5. Guard: `egressProxyTargetSize > 1` throw → frontend-presence assertion (size>1 only
   when the ILB frontend exists AND the template does not pin `networkIp`).
6. `proxyBaseUrl` self-wire fallback → the VIP (`args.proxyBaseUrl ??` VIP, not the
   reserved `proxy-ip`), previews self-wire to the LB.
7. No new firewall rules (passthrough preserves client source IP; the existing
   `proxy-ingress`/`proxy-ingress-pods` sources + prober ranges already cover it).
8. Three sequential `pulumi up`s, verified between each (ADR §Migration ordering).
9. Failover drill: both HEALTHY → egress probe green → delete instance 1 → backend flips
   UNHEALTHY → probe still green via instance 2 → autoheal → 2×HEALTHY. Receipts under
   `docs/build/reports/<date>_proxy-ilb-drill/`.
10. `billing-read.mjs` re-read — document measured delta vs ≈+$18/mo (+$12.2 ruled VM).
11. Close `D-R6INF.1-1`, resolve `F-R6INF.1-1`, GATE-LAUNCH threshold-8 dated note
    (amend-by-note only), ADR-122 PROPOSED→ACCEPTED w/ implemented-on dated note, ops
    runbook per the ADR's sketch.
12. Records: run ledger + `pr/R6INF.2.md` + `gh pr create` + BUILD_INDEX row 224 + LEDGER
    (findings, PHASE LOG, `nextTicket` stays `196a_HUMAN-H12`).

## Acceptance criteria

- [x] All resources per ADR items 1–6 landed + pinned in tests *(engineered)* — one
      ADR-vs-live deviation: `portName` is INVALID on an internal backend service (live
      API 400) and `balancingMode` must be `CONNECTION`; code + tests match the API.
- [x] up A: preview classified **additive only** (3 creates) → `up` → `get-health`
      HEALTHY → bounded egress probe through the VIP *(live-executed — updates 158/160;
      unauth 403 + credentialed 200 `msg_011CgLD3ZdQzTmbJxUgsBb8S` + metered row)*
- [x] up B: `proxyBaseUrl` → VIP literal from outputs → `up` → worker/api roll →
      provenance PASS + old direct path still answers *(live-executed — update 161;
      worker `-00079-jx6` + api `-00095-hhl` at 100% traffic with `…16.7` envs; BOTH
      `10.8.16.4` and `10.8.16.7` answered the proxy 403)*
- [x] up C: `networkIp` dropped + size 1→2 → `up` → 2 instances HEALTHY; `proxy-ip`
      retained *(live-executed — update 162; `fdr3`@.9-b + `v9qf`@.8-f 2×HEALTHY;
      `10.8.16.4` still RESERVED)*
- [x] Drill: kill → UNHEALTHY → probe green via sibling → autoheal 2×HEALTHY; receipts
      committed *(live-executed — 1 failed probe of 126, ≤13s recovery; autoheal to
      2×HEALTHY 232s; `reports/2026-10-24_proxy-ilb-drill/`; note: a deleted backend
      EXITS the health set rather than reporting UNHEALTHY — documented)*
- [x] `billing-read.mjs` measured delta documented *(live-executed — +$30.96/mo:
      $18.33 ILB line + $12.63 second VM; TOTAL ≈ $256.59/mo vs the ~$30 envelope)*
- [x] D-R6INF.1-1 closed + F-R6INF.1-1 resolved + GATE-LAUNCH t8 note + ADR-122 ACCEPTED
- [x] Zero stateful replace/delete across all previews (hard pause honored — the only
      replace was the stateless InstanceTemplate; `proxy-ip`/SQL/disks/DNS untouched)
- [x] `pnpm turbo build lint typecheck` touched packages + `pnpm test` touched +
      `check-build-memory.sh .` 0 violations + `check-append-only.mjs --base c1f20f5` OK

## Plan

1. `stages.ts`: `egressProxyFrontend: "direct-ip"|"ilb"` + `egressProxyIpPin: boolean`
   facts (dev/preview → `ilb`+unpinned+size 1; prod → `ilb`+**pinned+size 1 transitional
   in commit 1**, final `unpinned+size 2` in the cutover commit).
2. `compute.ts`: hoisted `proxyVip`; `networkIp` conditional on `egressProxyIpPin`;
   ILB resources after the MIG (ADR items 1–3, reusing `proxyHealth` — global HC is
   valid for internal passthrough NLB per GCP docs); guard → frontend-presence
   assertion; self-wire fallback `proxyVip ?? proxyIp` on worker + api; export
   `proxyVipAddress` stack output.
3. `compute.test.ts` + `stages.test.ts` pins → the new invariant.
4. Green gate (focused vitest + `tsc --noEmit` on the Pulumi program).
5. Pre-state: `pulumi stack export`, `gcloud compute instances list`, MIG describe,
   `get-health` n/a pre-LB, `healthz`, `billing-read.mjs --json` pre → committed reports.
6. **up A** (prod, transitional facts: pin+size1): `preview --diff` classified additive →
   `up` → `get-health` → probe through VIP (kubectl pod in `runs` ns, egress-proxy image,
   `node -e` fetch — the codebase's in-VPC probe shape; the proxy is a FORWARD proxy, not
   CONNECT — deny-only probe 403 `egress.denied` + credentialed probe via the DEF.2
   estimate-prepass row shape, `meterOnly` synthetic `ilbp_*` credential, bounded).
7. **up B**: `Pulumi.prod.yaml` `proxyBaseUrl` → VIP → `up` → worker/api revision roll →
   provenance PASS + direct-`10.8.16.4` probe still answers.
8. **up C**: facts → `ipPin:false` + `size:2` → preview (stateless template replace +
   MIG roll only; verify `proxy-ip` untouched) → `up` → 2×HEALTHY + probe.
9. **Drill** (ADR verbatim) + `billing-read.mjs` post + receipts committed.
10. Deferral/finding/GATE-LAUNCH/ADR closes + `docs/ops/proxy-ha.md` runbook + PR + close.

## Test matrix

| AC / invariant | Test / live leg |
|---|---|
| `egressProxyFrontend`+`egressProxyIpPin` facts exist; size>1 ⇒ ilb && !pin | `stages.test.ts` per-stage pins + the cross-stage invariant assertion |
| ILB resources shaped per ADR (INTERNAL, TCP, portName https, proxyHealth reuse, NONE affinity, allowGlobalAccess false) | `compute.test.ts` source pins (established structural style) |
| `networkIp` conditional on `egressProxyIpPin` (never unconditional) | `compute.test.ts` — pin literal absent; conditional present |
| Guard = frontend-presence assertion before the MIG | `compute.test.ts` — guard position + condition |
| self-wire falls back to VIP | `compute.test.ts` — `proxyVip ?? proxyIp` in both env blocks |
| `proxy-ip` Address retained | `compute.test.ts` — `name("proxy-ip")` Address still declared |
| Live posture | `get-health`, `instances list`, MIG describe, probe receipts |

## Progress

- 2026-10-24T01:2xZ — branch cut at `40b6c5f` (clean). Contract extracted: ADR-122 +
  GD-REMAINING.R6/GD-DEPLOY.R6/GD-HA.R6 + F-R6INF.1-1 + D-R6INF.1-1. Tooling verified:
  `pulumi whoami` ok (stack `prod`, 175 resources), `gcloud` → `rhema-507501`; live
  `proxy-health` is a **global** TCP:8443 check (`rhema-prod-proxy-health-51165b8`) —
  valid for internal passthrough NLB (console default is global; regional also accepted);
  `rhema-prod-iap-ssh-stageb` admits IAP→proxy-tag:22 (the IAP bastion path). Probe
  design pinned: the proxy is a FORWARD proxy (server.ts — not CONNECT); the in-VPC
  probe runs from a `runs`-ns pod on the digest-pinned proxy image (NetworkPolicy
  already admits private-app/20:8443 — no policy/firewall change needed), deny-probe
  403 + credentialed probe minted exactly like `claim-prepass` (`meterOnly`, bounded).
- 2026-10-24T01:3xZ — **up A (update 158→160).** `preview --diff` classified additive:
  +3 creates (vip/be/fr), 0 replace/delete → proceeded. Update 158 created `proxy-vip`
  then **400'd on `portName:"https"`** — internal backend services forbid it (the ADR's
  spec called for it; passthrough delivers to the incoming port, so the MIG's
  `namedPorts` stays advisory-only). Removed → update 159 preview clean → **400'd on
  `balancingMode` default `UTILIZATION`** — internal services require `CONNECTION`.
  Fixed → update 160 created `proxy-be`+`proxy-fr`. VIP = **`10.8.16.7`**
  (`proxyVipAddress` output). `get-health` (physical name `…be-d4327f7`) →
  `rhema-prod-proxy-8g3n`@`10.8.16.4` HEALTHY. In-VPC probes: unauth → expected
  `403 egress.denied missing proxy credential`; credentialed (`ilbp_upa`, minted exactly
  like `claim-prepass` — is_test workspace, cap 25, 20min TTL, meterOnly) → **real
  Anthropic 200 `msg_011CgLD3ZdQzTmbJxUgsBb8S`** + `usage_records` row `source:proxy`.
  Credential revoked, pod deleted.
- 2026-10-24T01:4xZ — **up B (update 161).** `Pulumi.prod.yaml` `proxyBaseUrl` →
  `http://10.8.16.7:8443` (the actual output literal). Preview: `~` worker+api env-only,
  174 unchanged → up → both rolled to new revisions at 100% traffic:
  worker `…-00079-jx6` `ANTHROPIC_BASE_URL=http://10.8.16.7:8443`, api `…-00095-hhl`
  `EGRESS_PROXY_URL=http://10.8.16.7:8443` (live-described envs = provenance).
  In-flight safety probe: `10.8.16.4` AND `10.8.16.7` both answered the proxy 403.
- 2026-10-24T01:4xZ — **up C (update 162).** Facts → `egressProxyIpPin:false` +
  `egressProxyTargetSize:2`. Preview: `+-` InstanceTemplate replace (stateless, drops
  `networkIp 10.8.16.4`) + `~` MIG targetSize/versions — `proxy-ip` absent from diff →
  up → MIG rolled: `fdr3` (us-central1-b, ephemeral `.9`) + `v9qf` (us-central1-f, `.8`)
  2×RUNNING on new template `…tmpl-e707c0f`; `8g3n` deleted by the roll; get-health
  **2×HEALTHY behind `10.8.16.7`**. `proxy-ip` still RESERVED.
- 2026-10-24T01:5xZ — **Failover drill** (`reports/2026-10-24_proxy-ilb-drill/`):
  baseline real-egress 200 `msg_011CgLDjWnsCigCVDLDXVMMH`; T0 `instances delete fdr3`;
  continuous post-auth probes at 2s cadence — **1 failure of 126** (T+11s, recovered
  T+13s — true outage window bounded inside ~8s); deleted backend exits the health set
  (it does not report UNHEALTHY — the observed flip is its removal); autoheal recreated
  `fdr3` at NEW ephemeral `.10` → RUNNING T+183s → **2×HEALTHY T+232s**; post-heal
  real-egress 200 `msg_011CgLE3PaneU8bejBUCJerv`. Credential `pcr_ilbp_drill` revoked.
- 2026-10-24T02:0xZ — **Billing**: `billing-read.mjs` recomputation $256.59/mo total —
  proxy MIG line $25.26 (×2, was $12.63) + NEW explicit ILB line **$18.33**
  ($0.025/h generic Americas forwarding-rule minimum + $0.008/GiBy internal passthrough
  inbound, est. 10GB). **Measured delta +$30.96/mo** vs the ruled ~$30 envelope. The
  script now prices internal rules as their own line (they were previously miscounted
  inside the external HTTPS-LB label).
- 2026-10-24T02:0xZ — records: `D-R6INF.1-1` → DONE; `D-OPS.2-2`/`D-COST.1-3` dated
  notes; `F-R6INF.1-1` → RESOLVED; ADR-122 → ACCEPTED w/ the live-API `portName`/
  `CONNECTION` note; GATE-LAUNCH threshold-8 → MET; `docs/ops/proxy-ha.md` runbook.

## Gap table

| Gap | Resolution |
|---|---|
| ADR spec'd `portName:"https"` on `proxy-be` — the live API 400s: internal passthrough forbids `portName` (incoming port delivered directly) | Field dropped; the MIG's `namedPorts` entry stays as harmless metadata. Deviation recorded in ADR-122's implemented-on note + runbook. |
| Internal backend service defaults `balancingMode:"UTILIZATION"` → API 400 — internal requires `CONNECTION` | Set explicitly + pinned by `compute.test.ts`. |
| `get-health` echoes `port: 80` despite TCP:8443 check | Verified display artifact — nothing listens on :80 on COS+proxy container; HEALTHY can only come from the 8443 probe. Documented in DRILL.md + runbook. |
| Drill ADR says "observe backend flips UNHEALTHY" | A DELETED instance exits `healthStatus` entirely (doesn't linger as UNHEALTHY); the flip observed as removal + surviving-backend continuity. Documented. |
| The reserved `10.8.16.4` is free but the repoint-rollback needs a pin-holder | Runbook written: repoint rollback alone works only pre-C; post-C rollback = `egressProxyIpPin:true` restore or full git-revert. |

## Evidence log

- `pulumi up` updates **160** (vip+be+fr; 158 partially applied vip first), **161**
  (worker+api env repoint), **162** (template unpin replace + MIG 1→2). Previews:
  A `+3 create` additive; B `~2` env-only; C `+-1` stateless template + `~1` MIG.
- Health: `get-health …be-d4327f7` — `8g3n`.4 HEALTHY (up A); `fdr3`.9+`v9qf`.8 2×HEALTHY
  (up C); post-drill `fdr3`.10+`v9qf`.8 2×HEALTHY.
- Probes (in-VPC `runs`-ns pods): unauth VIP → `403 egress.denied missing proxy
  credential` ×2 (up A + up-B direct-path leg); credentialed `ilbp_upa`/`ilbp_drill`
  (claim-prepass-identical mint, is_test ws, cap, TTL, meterOnly, revoked) → Anthropic
  200s `msg_011CgLD3…`/`msg_011CgLDj…`/`msg_011CgLE3…` + `usage_records` `source:proxy`.
- Roll provenance: worker `rhema-prod-worker-cbdaf0f-00079-jx6` 100% +
  api `rhema-prod-api-e745ce0-00095-hhl` 100%, envs live-described `…16.7`.
- Drill: `reports/2026-10-24_proxy-ilb-drill/{DRILL.md,probe-log.txt}` — T0=1792806491,
  126 probes / 1 fail (T+11→T+13s), heal 232s.
- Billing: `billing-read.mjs` post $256.59/mo (ILB line now explicit).
- Records: DEFERRALS D-R6INF.1-1 DONE + D-OPS.2-2/D-COST.1-3 notes; LEDGER F-R6INF.1-1
  RESOLVED + PHASE LOG; ADR-122 ACCEPTED; GATE-LAUNCH t8 MET; `ops/proxy-ha.md`.

## Evidence log

_(populated in Phase 5)_

## Evidence report

_(PR body: `docs/build/pr/R6INF.2.md`)_
