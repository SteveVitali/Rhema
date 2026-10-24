# R6INF.2 — ADR-122 proxy-ILB failover drill (2026-10-24)

Live failover evidence for the egress-proxy internal passthrough NLB cutover.
All times are epoch seconds (`date +%s`). Zone of truth: `us-central1`, project `rhema-507501`.

## Topology under test

| resource | physical name | value |
| --- | --- | --- |
| VIP (forwarding rule) | `rhema-prod-proxy-fr-7132756` | `10.8.16.7`, TCP:8443, INTERNAL |
| Backend service | `rhema-prod-proxy-be-d4327f7` | TCP, CONNECTION, sessionAffinity NONE, drain 30s |
| MIG | `rhema-prod-proxy-mig-34ea26a` | targetSize 2, ephemeral NICs, autoheal on `proxy-health` (TCP:8443) |
| Backends pre-drill | `rhema-prod-proxy-fdr3` (us-central1-b, 10.8.16.9), `rhema-prod-proxy-v9qf` (us-central1-f, 10.8.16.8) | both HEALTHY |
| Retained rollback | `rhema-prod-proxy-ip-effec9d` | `10.8.16.4` RESERVED, unused by consumers |

## Probe method

In-VPC GKE pod `ilb-drill-d1` (namespace `runs`), 2s cadence, POST
`http://10.8.16.7:8443/v1/messages` with a valid `x-rhema-proxy-credential`
(run `ilbp_drill`, minted exactly like the DEF.2 claim-prepass seam; cap 25,
meterOnly, is_test workspace, revoked post-drill). The request uses an
unallowlisted model so the proxy validates the credential + allowlist and
refuses — `403 egress.denied "model … is not on the run allowlist"` is the
post-auth green signal at $0 provider cost. Real Anthropic 200s were taken at
baseline and post-heal (3 provider calls total).

## Timeline

| event | epoch | T+ | receipt |
| --- | --- | --- | --- |
| Baseline: 2×HEALTHY (fdr3 .9, v9qf .8) | ~1792806476 | — | `probe-log.txt` head |
| Baseline real egress: `200 msg_011CgLDjWnsCigCVDLDXVMMH` "Ok" | ~1792806488 | — | transcript |
| `gcloud compute instances delete fdr3` (us-central1-b) | 1792806491 | T0 | gcloud delete output |
| Last green probe before dip | 1792806492 | T+1s | probe-log.txt:9 |
| **Single failed probe** (`status=000`, curl timeout/refused — stale body shown is a loop artifact) | 1792806502 | T+11s | probe-log.txt:10 |
| Probe green again (never failed after) | 1792806504 | T+13s | probe-log.txt:11 |
| `get-health`: only v9qf remains, HEALTHY (deleted backend exits the health set — it does not report UNHEALTHY) | 1792806603 | T+112s | transcript |
| MIG autoheal: replacement `fdr3` CREATING | 1792806603 | T+112s | transcript |
| Replacement `fdr3` RUNNING | ~1792806674 | T+183s | poll loop |
| **2×HEALTHY restored** (fdr3 re-created at NEW ephemeral IP 10.8.16.10; v9qf .8) | 1792806723 | T+232s | `get-health` output |
| Post-heal real egress: `200 msg_011CgLE3PaneU8bejBUCJerv` "OK" | ~1792806730 | T+239s | transcript |

## Result

- **Traffic failover: 1 failed probe of 126 total (one 2s interval; the failed curl
  burned its 8s `--max-time`, so the true outage window is bounded inside
  T+3s…T+11s — recovered by T+13s).** Every other request across the kill stayed
  green through `v9qf` — the ADR-122 claim "one instance loss does not drop
  egress" is proven.
- **Autoheal to 2×HEALTHY: 232 s (~3m52s)** from instance delete to both
  backends HEALTHY behind the VIP.
- The re-created instance received a NEW ephemeral NIC (10.8.16.10 vs the old
  .9) — confirming no consumer depends on an instance IP; the VIP is the only
  stable endpoint.
- `proxy-ip` (10.8.16.4) untouched throughout; still RESERVED for rollback.
- `port: 80` in `get-health` output is the GCP API's serving-port echo for
  internal passthrough NLBs — the health check itself is TCP:8443 (nothing
  listens on :80 on the proxy VMs; HEALTHY can only come from the 8443 probe).

## Notes / artifacts

- `probe-log.txt` — the full 126-line continuous-probe receipt.
- The drill credential `pcr_ilbp_drill` was revoked immediately post-drill;
  its metering rows (`run_id = ilbp_drill`, `source = proxy`) are bound to an
  `is_test` workspace (REQ-ECON-6 excluded).
