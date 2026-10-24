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
- **Started:** 2026-10-24T01:2xZ · **Closed:** (pending)
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
- **ci:** (pending)

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

- [ ] All resources per ADR items 1–6 landed + pinned in tests *(engineered)*
- [ ] up A: preview classified **additive only** (3 creates) → `up` → `get-health`
      HEALTHY → bounded egress probe through the VIP *(live-executed)*
- [ ] up B: `proxyBaseUrl` → VIP literal from outputs → `up` → worker/api roll →
      provenance PASS + old direct path still answers *(live-executed)*
- [ ] up C: `networkIp` dropped + size 1→2 → `up` → 2 instances HEALTHY; `proxy-ip`
      retained *(live-executed)*
- [ ] Drill: kill → UNHEALTHY → probe green via sibling → autoheal 2×HEALTHY; receipts
      committed *(live-executed)*
- [ ] `billing-read.mjs` measured delta documented *(live-executed)*
- [ ] D-R6INF.1-1 closed + F-R6INF.1-1 resolved + GATE-LAUNCH t8 note + ADR-122 ACCEPTED
- [ ] Zero stateful replace/delete across all previews (hard pause honored)
- [ ] `pnpm turbo build lint typecheck` touched packages + `pnpm test` touched +
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

## Gap table

_(populated in Phase 4)_

## Evidence log

_(populated in Phase 5)_

## Evidence report

_(PR body: `docs/build/pr/R6INF.2.md`)_
