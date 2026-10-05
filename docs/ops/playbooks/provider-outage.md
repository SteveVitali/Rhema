# Playbook: provider outage (§13.5 — provider 429/5xx)

**Alert:** `provider_429_5xx_pct_5m` — >5% of proxied upstream responses are 429/5xx for 5 min.
**Spec:** provider 429/5xx < 1%; alert > 5% for 5 min → outage banner, launches paused ≤ 2 h.

## Detect

- `[slo] violation {"signal":"provider_429_5xx_pct_5m", ...}` on the worker logs → `rhema_slo_violations` metric.
- Corroborate: `fetch_log` rows with `status = 429 OR status >= 500` in the last 5 minutes; Anthropic status page.

## Contain (≤ 10 min)

1. Confirm upstream: run a single probe request through the egress proxy (a canary run or a synthetic check) — distinguish provider outage from a proxy regression (`5xx` from the proxy itself is a different playbook).
2. Post the outage banner (status copy in `apps/web` run sheet — the §13.5 outage-banner row) and pause new launches: set the run-admission kill switch (`runs.launch` returns `launch_paused`; see the §14.4 stop path).
3. In-flight runs: leave running — the proxy's per-attempt retry budget handles transient 429s; a hard 5xx wall will surface as `run.hiccup`/`engine.error` and the reaper will park stalled runs at `resume_partial` gates.

## Recover

- Provider recovers → the probe's next 5-min sweep clears the signal → resume launches, take the banner down.
- If the outage persists past 2 h, escalate: notify the waiting-on-paid-work users via the notification sweep and log a standing finding in `docs/build/LEDGER.md`.

## Post-incident

- Count affected runs (`runs.state='failed'` + `run.hiccup` events in the window); issue `credit.refunded` adjustments where a run failed on provider error (the refund path already exists in the ledger).
- If provider-side cost/report drift followed the outage, the nightly `usage.reconcile` catches it (cost-anomaly playbook).
