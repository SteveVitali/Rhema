# R6INF.2 — ADR-122 egress-proxy internal passthrough NLB (proxy HA live: VIP + MIG ×2 + drill-green failover)

## Summary

Implements **ADR-122** (ruled `GD-REMAINING.R6` item 1 — "approve all remaining tasks,
proceed", ≈+$30/mo envelope) — the remediation for **F-R6INF.1-1 / D-R6INF.1-1**: the
proxy MIG's `networkIp` pin made a size-2 MIG non-converging, so real HA required a
shared-frontend design. All three ordered production `pulumi up`s executed with
verification between each, and the failover drill passed:

- **up A (update 160)** — additive: `proxy-vip` internal Address (`10.8.16.7`) +
  `RegionBackendService` (INTERNAL, TCP, `CONNECTION`, `sessionAffinity:NONE`, drain 30s,
  reuses `proxyHealth` TCP:8443) + INTERNAL forwarding rule `:8443`. Preview `+3 create`,
  zero replace/delete. Existing instance HEALTHY behind the VIP; in-VPC probes green —
  unauth `403 egress.denied` and a **credentialed real Anthropic 200** through the VIP
  (`msg_011CgLD3ZdQzTmbJxUgsBb8S`, metered `usage_records` `source:proxy`).
- **up B (update 161)** — `rhema:proxyBaseUrl` → `http://10.8.16.7:8443` (the actual
  Pulumi output literal): worker `ANTHROPIC_BASE_URL` + api `EGRESS_PROXY_URL` rolled to
  new revisions at 100% traffic (`-00079-jx6` / `-00095-hhl`, envs live-described). The
  old `10.8.16.4` direct path verified still answering for in-flight pods.
- **up C (update 162)** — template `networkIp` dropped (ephemeral NICs) + MIG 1→2:
  stateless template replace + MIG update only; `proxy-ip` `10.8.16.4` untouched
  (RESERVED — the retained rollback path). Result: `fdr3`+`v9qf` **2×HEALTHY** across
  zones b/f behind the VIP.
- **Drill** — deleted `fdr3`; continuous credentialed probes through the VIP at 2s
  cadence: **1 failure of 126** (T+11s, recovered T+13s); autoheal recreated the
  instance (new ephemeral IP `.10`) → **2×HEALTHY in 232s**; post-heal real-egress 200.
  Receipts: `docs/build/reports/2026-10-24_proxy-ilb-drill/`.
- **Billing** — `billing-read.mjs` recomputation **$256.59/mo**; measured delta
  **+$30.96/mo** ($18.33 ILB line + $12.63 second e2-small) vs the ~$30 ruled envelope.

## What changed

- `infra/pulumi/compute.ts` — `proxy-vip`/`proxy-be`/`proxy-fr` behind the
  `egressProxyFrontend:"ilb"` stage fact; template `networkIp` now conditional on the
  new `egressProxyIpPin` fact; the F-R6INF.1-1 bare `>1` throw is now a
  **frontend-presence guard** (`size>1` requires `ilb` AND no pin — a bare or pinned ×2
  still fails closed at eval time); worker + api self-wire fallback `proxyVip ?? proxyIp`;
  `proxyVipAddress` stack output; `proxy-ip` Address retained verbatim.
- `infra/config/stages.ts` + tests — `egressProxyFrontend`/`egressProxyIpPin` facts;
  prod at the cutover shape (`ilb`, unpinned, **size 2**); dev/preview `ilb`+unpinned+1
  (self-wire to the VIP — no config repoint needed); cross-stage invariant pins.
- `infra/pulumi/compute.test.ts` — ILB shape pins (INTERNAL/TCP/`CONNECTION`/no
  `portName`/NONE affinity/`allowGlobalAccess:false`), conditional `networkIp`, guard
  semantics, VIP fallback, `proxy-ip` retention.
- `infra/pulumi/Pulumi.prod.yaml` — `rhema:proxyBaseUrl` `…10.8.16.4…` → `…10.8.16.7…`
  (dated note).
- `scripts/live/billing-read.mjs` — internal passthrough NLB priced as its own line
  (generic Americas forwarding-rule minimum $0.025/h + internal passthrough inbound
  $0.008/GiBy); was previously miscounted inside the external HTTPS-LB label.
- `docs/ops/proxy-ha.md` — NEW runbook (addresses, invariants, health checks, failure
  modes, rollback arms incl. the post-C pin-holder subtlety, drill procedure).
- Records: `D-R6INF.1-1` → **DONE**; `D-OPS.2-2`/`D-COST.1-3` dated notes; `F-R6INF.1-1`
  → **RESOLVED**; **ADR-122 → ACCEPTED** (implemented-on note incl. the `portName`/
  `CONNECTION` live-API adjustment); GATE-LAUNCH threshold-8 → **MET**; `runs/R6INF.2.md`;
  `reports/2026-10-24_proxy-ilb-drill/`.

## ADR-vs-live deviations (recorded, not hidden)

- ADR spec'd `portName:"https"` on the backend service — the GCP API 400s (`May not use
  port/port_name for the INTERNAL backend service`); passthrough delivers to the
  incoming port. Removed; the MIG's `namedPorts` stays advisory.
- Internal backend service requires `backends[].balancingMode:"CONNECTION"` (not the
  `UTILIZATION` default) — set explicitly, pinned in tests.
- `get-health` echoes `port: 80` for internal passthrough NLBs — display artifact; the
  probe is TCP:8443 (nothing listens on :80 on the proxy VMs). Documented.
- Deleted backends exit `healthStatus` rather than reporting UNHEALTHY — the drill's
  "flip" observation is removal + surviving-backend continuity.

## Rollback

`proxy-ip` `10.8.16.4` remains RESERVED. Repoint rollback (pre-C shapes): flip
`proxyBaseUrl` back + `up`. Post-C: restore `egressProxyIpPin:true` or `git revert`
+ `pulumi up`. Cleanup of the reserved Address is a post-soak follow-up, not this PR.

## Verification

- `pnpm vitest` focused: `compute.test.ts` 22/22, `stages.test.ts` 38/38 green.
- `pnpm turbo build lint typecheck` + `pnpm test` — see run ledger.
- `check-build-memory.sh .` 0 violations · `check-append-only.mjs --base c1f20f5` OK.
- mergePolicy **OPERATOR** — do not merge.
