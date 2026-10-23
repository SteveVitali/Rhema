# ADR-122: Egress-proxy HA — an internal passthrough NLB on a shared VIP fronts the size-2 MIG

- **Status:** PROPOSED — operator ruling owed
- **Date:** 2026-10-23
- **Ticket:** R6FIX.1 (design half of finding `F-R6INF.1-1` / deferral `D-R6INF.1-1`; extends the
  proxy arm of ruling `GD-HA.R6`)
- **Requirement ids:** REQ-ARCH-2 (the sandbox's one-way-street egress), REQ-ARCH-30, the
  GD-HA.R6 lever "proxy MIG targetSize 1→2 (+$12.2/mo, named maintenance window)"
- **Spec:** `docs/tickets/DEFERRALS.md` row `D-R6INF.1-1`; finding narrative
  `docs/build/reports/2026-10-22_R6INF.1/preview-classification.md`;
  `docs/build/runs/R6INF.1.md`

## Context

R6INF.1 (2026-10-22) set out to apply `GD-HA.R6`'s ruled proxy lever — flip
`egressProxyTargetSize` 1→2 in the named maintenance window — and proved live that the bare
flip **cannot converge** (`F-R6INF.1-1`): the InstanceTemplate pins
`networkInterfaces[0].networkIP = 10.8.16.4`, the reserved internal Address that
`rhema:proxyBaseUrl` (`http://10.8.16.4:8443`) was deliberately pinned to so template rolls
can never dangle the URL. One static internal IP ⇒ exactly one holder ⇒ a size-2 MIG
permanently fails to create instance #2 (IP-in-use create failure), and even a working second
VM could not take failover because every consumer dials the one literal address. The bare
flip was withdrawn before `pulumi up`; `compute.ts` now fails closed at eval time on
`egressProxyTargetSize > 1` with an error that names the design gap.

So real proxy HA is a **frontend design, not a resize**: the address the consumers dial must
move off any single VM's NIC onto a shared frontend, and only then may the MIG grow. The
deferral prescribes the shape — an internal passthrough NLB holding a new shared VIP, the
MIG as its backend — but `GD-HA.R6` priced only the second VM (+$12.2/mo); the LB is an
unruled add (~$18/mo standing — see Cost), which is why this ADR is **Proposed, not
Accepted**: it records the design for the operator's ruling, and no part of it is
implemented under R6FIX.1.

## Decision

Front the proxy MIG with a **regional internal passthrough Network Load Balancer**
(`loadBalancingScheme: "INTERNAL"` — TCP forwarding to instance-group backends, no TLS
termination, no protocol parsing). The LB owns the one address consumers dial; proxy VMs go
ephemeral.

Resources (all in `infra/pulumi/compute.ts`'s `deployProxyMig` block + `network.ts`):

1. **VIP** — a new `gcp.compute.Address` `proxy-vip` (`addressType: "INTERNAL"`,
   `purpose: "GCE_ENDPOINT"`, `subnetwork: private-app`), auto-assigned high in the `/20`
   (same anti-collision convention as the current reservation). This becomes the value of
   `rhema:proxyBaseUrl` (`http://<vip>:8443`).
2. **Backend service** — `gcp.compute.RegionBackendService` `proxy-be`
   (`loadBalancingScheme: "INTERNAL"`, `protocol: "TCP"`, `portName: "https"` — the MIG
   already declares `namedPorts: [{ name: "https", port: 8443 }]`, healthChecks: **reuse the
   existing `proxyHealth` TCP:8443 check**, `backends: [{ group: proxyMig.instanceGroup }]`,
   `connectionDrainingTimeoutSec` small; session affinity `NONE` — the proxy is a stateless
   CONNECT-style forwarder).
3. **Forwarding rule** — `gcp.compute.ForwardingRule` `proxy-fr`
   (`loadBalancingScheme: "INTERNAL"`, `ipProtocol: "TCP"`, `ipAddress: proxy-vip`,
   `ports: ["8443"]`, `backendService: proxy-be`, `network` + `subnetwork: private-app`,
   `allowGlobalAccess: false` — same-region consumers only, matching today).
4. **Template change** — delete `networkInterfaces[].networkIp` so instances take ephemeral
   private-app addresses; the VIP — not any NIC — is the stable endpoint. (The reserved
   `proxy-ip`/`10.8.16.4` Address resource is *retained* across cutover as the rollback
   path; see Rollback.)
5. **Guard change** — `compute.ts`'s `egressProxyTargetSize > 1` throw is replaced by a
   frontend-presence assertion (size ≤1, or size >1 only when the ILB backend service +
   forwarding rule exist and the template does **not** pin `networkIp`); `compute.test.ts`'s
   matching assertions flip to the new invariant.
6. **Non-prod self-wire** — `args.proxyBaseUrl ?? http://${proxyIp.address}:8443` switches
   its fallback to `proxyVip.address`, so previews self-wire to the LB the way prod will
   consume it.

**No new firewall rules.** A passthrough NLB preserves the client source IP (traffic still
arrives from the sandbox + private-app ranges already admitted by `proxy-ingress`), and its
backend health checks ride the same GCP prober ranges (`35.191.0.0/16`,
`130.211.0.0/22`) that rule already opens on 8443 for autohealing.

### Migration ordering (three `pulumi up`s, one named maintenance window)

1. **`up` A — stand the frontend up empty-handed:** create `proxy-vip`, `proxy-be`,
   `proxy-fr`. The MIG is untouched: the single instance keeps `10.8.16.4` on its NIC and is
   simultaneously a healthy backend behind the VIP. Both paths now reach it. Verification:
   `gcloud compute backend-services get-health` → `HEALTHY`; a probe through the VIP.
2. **Config + `up` B — repoint consumers:** `rhema:proxyBaseUrl: http://<vip>:8443` in
   `Pulumi.prod.yaml`; the roll new-revisions the worker (`ANTHROPIC_BASE_URL`, handed to
   run pods) and api (`EGRESS_PROXY_URL`, the DEF.2 estimate pre-pass). The old direct
   `10.8.16.4` path still serves any in-flight pod holding the old env — nothing dies
   mid-run.
3. **`up` C — grow the pool (the ruled window):** drop `networkIp` from the template
   (MIG rolls the instance onto an ephemeral address — the direct IP path dies here,
   already unused), flip `egressProxyTargetSize` 1→2 with the new frontend-presence
   guard, lift nothing else. Keep the `proxy-ip` Address resource reserved-but-unused.

### Failover drill (the deferral's acceptance arm)

1. `gcloud compute backend-services get-health` → both backends `HEALTHY`.
2. Prove egress: one bounded canary run (or the estimate pre-pass path) egresses
   successfully through the VIP.
3. `gcloud compute instances delete <proxy-instance-1>` (or stop) → within the 10 s
   health-check interval the backend flips `UNHEALTHY`; repeat the egress probe →
   succeeds through instance 2; autohealing recreates instance 1 → `get-health` returns
   2×`HEALTHY`.
4. Receipt: outputs + timings under `docs/build/reports/<date>_proxy-ilb-drill/`;
   `billing-read.mjs` re-read reflecting the ILB + second VM.

### Rollback plan

- **Before up C** (frontend exists but template still pins): repoint `rhema:proxyBaseUrl`
  back to `http://10.8.16.4:8443` — one config line + `up`; the direct path is untouched.
- **After up C**: `git revert` of the template/guard/resize change + `pulumi up` re-pins
  `networkIp = 10.8.16.4` and size 1 — possible only because the `proxy-ip` Address
  resource is retained across cutover (deleting it in the same up would surrender the IP:
  a re-created Address gets a *new* address and the static `proxyBaseUrl` in
  `Pulumi.prod.yaml` would dangle). Cleanup `up` D deletes the reservation once the VIP
  path has soaked.
- Runs are fail-closed throughout: any wrong step degrades to "runs error on egress,"
  never to leaked traffic.

### Runbook sketch (implementation ticket's outline)

```text
0. Operator ruling on this ADR + the cost delta lands; a maintenance window is named.
1. pulumi up            # proxy-vip + proxy-be + proxy-fr
2. backend-services get-health → HEALTHY; probe https-vip egress → 200/CONNECT
3. Pulumi.prod.yaml: proxyBaseUrl → http://<vip>:8443 ; pulumi up
4. pulumi up            # template drops networkIp, size 1→2, guard swaps, proxy-ip kept
5. Drill: delete instance → egress survives via sibling → autoheal → 2×HEALTHY
6. Soak (suggest ≥7d) → cleanup up: delete proxy-ip Address + prod-yaml comment update
Rollback: proxyBaseUrl → http://10.8.16.4:8443 (+ up); post-C: git revert + up
```

### Cost (for the ruling)

- Internal forwarding rule: ≈ **$0.025/hr ≈ $18/mo** standing (per-rule charge, first
  five rules at the same rate — this is the ILB's dominant cost).
- LB data processing ≈ $0.008–0.01/GiB — negligible at LLM-proxy volumes (KB–MB per
  call); the health check is the existing resource, so no new HC charge.
- Second `e2-small` MIG instance: the already-ruled **+$12.2/mo**.
- **Unruled delta: ≈ +$18/mo** (LB) on top of the ruled +$12.2 — total posture add vs.
  today ≈ **+$30/mo**.

## Consequences

- `F-R6INF.1-1`'s blocker is designed end-to-end: shared VIP, ephemeral backends,
  consumer repoint, ordered migration, drill, rollback, price.
- `D-R6INF.1-1` stays OPEN — design is the first half; the second half is an operator
  ruling (+$18/mo) and an implementation ticket in a named window.
- The `>1` fail-closed guard remains armed until the implementation ticket lands the
  frontend — a preview flip can still never express the broken shape.
- Zero-downtime ordering is preserved for in-flight runs (repoint before the direct IP
  dies); the window is needed only for the template roll itself.

## Alternatives considered

- **Rebind the existing `10.8.16.4` as the VIP** (`proxyBaseUrl` never changes value).
  Rejected: the FR cannot bind an address still held by the old NIC — the binding order
  races the instance recreate inside one `up`, and the "no repoint" saving is cosmetic
  (the repoint is one config line + a revision roll). Retaining the reservation as the
  rollback path needs it unbound anyway.
- **Internal Application Load Balancer (L7)**: adds TLS termination + cert management
  for a single-backend-protocol hop inside the VPC; strictly more cost and moving parts
  than passthrough TCP. The proxy's value is *egress admission*, not L7 policy.
- **Move the proxy to Cloud Run / a managed substrate**: re-platforms a working,
  fail-closed component for an HA story Cloud Run doesn't obviously improve (Direct-VPC
  egress + revision lifecycle), and forfeits the MIG autoheal story. Out of scope.
- **Keep size 1 with autoheal only**: today's posture — minutes of egress outage on
  instance loss. Rejected by `GD-HA.R6`'s ruling; this ADR prices what the ruled
  outcome actually requires.

## Revisit trigger

Reopen if GCP ships a managed regional egress-proxy/secure-web-proxy service whose
in-VPC posture satisfies REQ-ARCH-2 at ≤ this design's cost; if the proxy leaves the
COS-MIG substrate (making the backend-service design moot); or if the operator rules
the +$18/mo LB delta unnecessary (revert to size-1-with-autoheal and close
`D-R6INF.1-1` as declined).
