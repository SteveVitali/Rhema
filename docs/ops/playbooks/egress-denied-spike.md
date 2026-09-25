# Playbook: egress-denied spike (§12.8(d); §13.5 — egress denied ≈ 0)

**Alert:** `egress_denied_10m` — `fetch_log` rows with `decision='deny'` in the last 10 minutes (proxy
denials: URL-policy, SSRF, domain-blocklist, cap, or suspicious-query rejections).

An egress denial is the outbound-channel control FIRING — the spike is the signal. Expected causes: a run
model misbehaving (repeated probing of non-allowlisted hosts), a user-source fetch attempt on a memo run
(P1.21's `user_source_fetch` pause), or a cap hit (`402` denies are benign-but-real usage).

## Detect

- `[slo] violation {"signal":"egress_denied_10m"}` + per-run pause: a spiking run also emits
  `egress_denied_spike` → `pause_signals` → the run parks at a refusal-class card (W1 transport).
- Read `fetch_log` in the window: `select run_id, status, deny_reason, count(*) from fetch_log where decision='deny' group by 1,2,3`.

## Diagnose (≤ 10 min)

1. **Benign spike:** a single run hitting its cap (`deny_reason='cap'`) or a user probing an unlisted domain — check `deny_reason` distribution. Cap denies are normal operation; the run's own pause card explains itself.
2. **Abuse pattern:** repeated denials across MANY hosts from one run (novel-domain probing), or denials on `user_source_fetch` — the run may be exploring the egress boundary. Its `pause_signals`/`tool.audit` rows are the evidence trail.
3. **Regression:** a burst of denies on previously-allowed hosts — check whether a URL-policy/hooks deploy just landed (policy table change → the allowlist tightened).

## Contain + recover

- A misbehaving run is already paused by the spike rule — verify `runs.state='waiting_gate'` with a `refusal` gate; leave it parked pending review.
- A regression needs the URL-policy change reverted or the domain allowlist amended — never loosen the policy ad hoc to silence the alarm.

## Post-incident

- Any deny-path change is security-sensitive: land it with a hooks test, and update the §12.8 verification suite (`packages/security-checks/src/injection-controls.test.ts`) if the policy surface moved.
