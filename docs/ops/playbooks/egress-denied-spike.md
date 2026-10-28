# Playbook: egress-denied spike (§12.8(d); §13.5 — egress denied ≈ 0)

**Alert:** `egress_denied_10m` — `fetch_log` rows with `decision='deny'` in the last 10 minutes (proxy
denials: URL-policy, SSRF, domain-blocklist, cap, or suspicious-query rejections).

An egress denial is the outbound-channel control FIRING — the spike is the signal. Expected causes: a run
model misbehaving (repeated probing of non-allowlisted hosts), a user-source fetch attempt on a memo run
(P1.21's `user_source_fetch` pause), or a cap hit (`402` denies are benign-but-real usage).

## Detect

- `[slo] violation {"signal":"egress_denied_10m"}` + per-run pause: a spiking run also emits
  `egress_denied_spike` → `pause_signals` → the run parks at a refusal-class card (W1 transport).
- Read `fetch_log` with the same time and tenant scope as the probe in
  [`slo.ts`](../../../packages/orchestrator/src/slo.ts). An all-history aggregate is not the
  ten-minute alert window; exclude flagged test tenants when comparing against the SLO.

The global SLO fires on any qualifying denial in that window. The proxy's per-run
`DenialSpikeTracker` separately fires once at five denials in its in-memory counter
(`apps/egress-proxy/src/signals.ts`). A single denial therefore does not prove that a run has
been paused, and the counter is not a durable fleet-wide count.

## Diagnose (≤ 10 min)

1. **Benign spike:** a single run hitting its cap (`deny_reason='cap'`) or a user probing an unlisted domain — check `deny_reason` distribution. Cap denies are normal operation; the run's own pause card explains itself.
2. **Abuse pattern:** repeated denials across MANY hosts from one run (novel-domain probing), or denials on `user_source_fetch` — the run may be exploring the egress boundary. Its `pause_signals`/`tool.audit` rows are the evidence trail.
3. **Regression:** a burst of denies on previously-allowed hosts — check whether a URL-policy/hooks deploy just landed (policy table change → the allowlist tightened).

## Contain + recover

- Check whether the per-run spike produced a pause signal and a `waiting_gate` state with a
  refusal gate; leave a parked run pending review. Investigate missing signal delivery rather
  than assuming the global SLO alert itself paused the run.
- A regression needs the URL-policy change reverted or the domain allowlist amended — never loosen the policy ad hoc to silence the alarm.

## Post-incident

- Any deny-path change is security-sensitive: land it with a hooks test, and update the §12.8 verification suite (`packages/security-checks/src/injection-controls.test.ts`) if the policy surface moved.
