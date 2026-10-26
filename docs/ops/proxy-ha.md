# Egress-proxy HA runbook (ADR-122 posture, landed 2026-10-24 / R6INF.2)

The prod egress proxy is a **regional MIG of 2 ephemeral-NIC instances fronted by an
internal passthrough Network Load Balancer**. Consumers never dial an instance — they
dial the shared VIP.

## The addresses (prod, `rhema-507501` / `us-central1`)

| thing | value | notes |
| --- | --- | --- |
| **Consumer endpoint (VIP)** | `http://10.8.16.7:8443` | `rhema:proxyBaseUrl` in `Pulumi.prod.yaml`; Pulumi output `proxyVipAddress`. Worker `ANTHROPIC_BASE_URL` + api `EGRESS_PROXY_URL` read it. |
| Forwarding rule | `rhema-prod-proxy-fr-7132756` | INTERNAL, TCP:8443, `allowGlobalAccess:false` |
| Backend service | `rhema-prod-proxy-be-d4327f7` | TCP, `balancingMode:CONNECTION`, `sessionAffinity:NONE`, connection drain 30s |
| Health check | `rhema-prod-proxy-health-51165b8` | TCP:8443, 10s interval / 5s timeout — shared by the LB verdict AND MIG autoheal |
| MIG | `rhema-prod-proxy-mig-34ea26a` | targetSize 2, regional (multi-zone), autoheal |
| Rollback address | `10.8.16.4` (`rhema-prod-proxy-ip-effec9d`) | **retained RESERVED, unused** — the pre-ILB direct path; do NOT delete until the post-soak cleanup update |

## Invariants (fail-closed)

- **`egressProxyTargetSize > 1` is legal only with the ILB frontend AND no `networkIP`
  pin** — `compute.ts` throws at eval time otherwise (`egressProxyFrontend:"ilb"` +
  `egressProxyIpPin:false`). Never hand-edit the MIG to size 2 without those facts.
- The VIP, never a NIC, is the stable endpoint. Instance IPs are ephemeral and change
  on every recreate (drill: `.9` → `.10`).
- Egress is fail-closed: if ALL proxy backends die, run pods lose provider egress
  (runs error; they never leak to the internet — the sandbox has no other route).
- Internal passthrough NLBs reject `portName` on the backend service and require
  `balancingMode:"CONNECTION"` — don't "fix" those fields back.

## Health / diagnosis

```bash
# 1. Are the backends healthy behind the VIP?
gcloud compute backend-services get-health rhema-prod-proxy-be-d4327f7 \
  --region us-central1 --project rhema-507501
#    → want: healthState HEALTHY per instance. (The `port: 80` field is a display
#      artifact of get-health for internal passthrough NLBs — the probe is TCP:8443.)

# 2. MIG membership / autoheal state
gcloud compute instance-groups managed list-instances rhema-prod-proxy-mig-34ea26a \
  --region us-central1 --project rhema-507501

# 3. Is the VIP answering? (in-VPC; unauthenticated EXPECTS 403 missing proxy credential —
#    any other response means the proxy process, not the network, is down)
kubectl run ilb-probe --rm -i --namespace runs --image=curlimages/curl:8.10.1 \
  --restart=Never -- curl -sS --max-time 10 -o /dev/stdout -w "\nSTATUS %{http_code}\n" \
  -X POST http://10.8.16.7:8443/v1/messages -H "content-type: application/json" -d '{}'
```

## Failure modes

- **One backend UNHEALTHY / instance lost**: nothing to do — traffic shifts to the
  survivor (measured ≤13s worst window in the 2026-10-24 drill; typically sub-health-
  interval) and autoheal re-creates (~4min to 2×HEALTHY). If autoheal doesn't trigger,
  check `gcloud compute operations` for stockout/quota and the health check above.
- **All backends down** (e.g., bad image rollout): run pods get connection errors on
  provider calls. MIG roll back via template or `gcloud compute instance-groups managed
  rolling-action restart`; if the whole ILB shape is implicated, see Rollback.
- **VIP not answering but backends HEALTHY**: check the forwarding rule still binds
  `proxyVipAddress` + `proxy-be`, and that the request came from same-region
  (`allowGlobalAccess:false`).

## Rollback

- **Consumer repoint only** (any time, incl. post-up-C): set
  `rhema:proxyBaseUrl: http://10.8.16.4:8443` in `Pulumi.prod.yaml` + `pulumi up` —
  BUT this only works while an instance actually holds `10.8.16.4`. Post-up-C NICs are
  ephemeral, so the reserved Address is the address *space* rollback, not a live path:
  to make it live again you must also restore `egressProxyIpPin:true` (template pin)
  so an instance binds it. Prefer the full code revert below.
- **Full revert** (post-C): `git revert` the R6INF.2 changes (stage facts +
  `proxyBaseUrl`) + `pulumi up` — restores pin+size-1 in one update. The `proxy-ip`
  reservation was never deleted, so the literal `10.8.16.4` stays valid.

## Soak / cleanup owed

`proxy-ip` (`10.8.16.4`) is retained RESERVED purely for the rollback window. After the
posture soaks (operator decides — suggest ≥1 week of green + one maintenance window),
a cleanup `up` may delete the Address and the `egressProxyIpPin` fact. Until then it is
free (internal reservations bill nothing) and must not be deleted out-of-band — Pulumi
owns it.

## Drill procedure (repeat of the 2026-10-24 receipt)

`docs/build/reports/2026-10-24_proxy-ilb-drill/DRILL.md` — mint a bounded credential
exactly like `apps/api/src/claim-prepass.ts` (is_test workspace, cap, TTL, meterOnly),
run a 2s-cadence in-VPC probe against the VIP with an unallowlisted model (post-auth
`egress.denied` = green at $0 provider cost), `gcloud compute instances delete` one
backend, observe probe continuity + autoheal to 2×HEALTHY, revoke the credential.
