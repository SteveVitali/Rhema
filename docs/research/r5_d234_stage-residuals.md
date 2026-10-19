# R5.D234 — Launch-verification, preview, nightly/soak state

**Stream:** D (ops residuals) · **Researched:** 2026-10-14 · **Ledger rows:** D2, D3, D4
**Meta-finding:** every row here is a *live-evidence* residual, not a code residual — machinery is landed and green under test; missing is an operator action, a live exercise, a clock event, or prod telemetry.

## Findings (full evidence in agent note)

- **F1 — Canary pause smoke / OPEN.** `DenialSpikeTracker`→`SqlSignalSink`→`pause_signals`→worker 5s drain→`waiting_gate` all landed; never exercised end-to-end. Close = one planted deny burst on a live run → durable claimed row → refusal card. Operator/run-dependent.
- **F2 — Alert-channel page / OPEN.** Two paths: (A) worker `alertSink`→catcher — wired via seeded SM secret, PRB.17 proved the POST class lands; `slo_violation` receipts unasserted (read-only close). (B) Monitoring NotificationChannel — `rhema:opsAlertWebhookUrl` absent in `Pulumi.prod.yaml` → policies fire unnotified. BL-24's wording prefers B; either arm satisfies the AC.
- **F3 — usercontent CDN-signed headers / OPEN.** Unsigned→403-no-cookie proven; signed-leg never observed. No in-repo CDN minter (`gcloud compute sign-url` is out-of-band only). Operator key use; possible code gap if api-side minting is product intent.
- **F4 — first-finding ≤4min / OPEN.** Beacons exist (`signup.completed`, `finding.viewed`); unmeasurable until organic (non-test) signups exist — blocked on funnel traffic + a defined measurement query, not code.
- **F5 — Preview session / OPEN, unblock-loaded.** Lifecycle+teardown proven live on pr-102; `rhema-nonprod-resend-api-key` is `NOT_FOUND` in SM — the single secret seeds the entire preview family (BL-25/80, D-MAINT.6-1, D-OPS.1-1, D-SPA.6-1).
- **F6 — Leg definitions stale post-SPA.28:** renderer assertions = `data-renderer`/`data-ssr-cause` only; rollback drills moot (no flag — `git revert`+redeploy); `D-SPA.6-1`/`BL-80` wording needs reconciliation.
- **F7 — Nightly golden (BL-36) / OPEN.** `nightly-golden.mjs` gate exists but is a no-op without a run; no scheduler/driver exists at all; ~$150–300/night needs budget ruling. Genuinely new ops cadence.
- **F8 — 24h zero-MaxListenersWarning soak / OPEN-partial.** Query recorded verbatim (OBS.1.md:289-303); 0 warnings over ~45min partial; full-window close time passed 10-04 with no re-query recorded. **$0 read-only close.**
- **F9 — First scheduled nightly green / OPEN, merge-dependent (new finding).** Scheduled workflow's `github.sha` = `main` HEAD, which lags the unmerged chain while prod serves `ffbb8ad` → scheduled provenance fails until the merge catches `main` to the deployed SHA. `workflow_dispatch` at the tip does not satisfy "scheduled."
- **F10 — deterministic-complete ≠ live-closed** is the stream thesis.

## Close-condition table + open questions

Recorded in the agent note (9 items: canary, alert page, CDN headers, first-finding, preview session, preview renderer legs, golden nightly, soak re-query, scheduled nightly). Cheapest close = F8; most unblock-loaded = F5; only new-spend item = F7; only traffic-blocked = F4.

## Spec requirements emitted

REQ-OPS-1 (canary = durable claimed pause_signals row + waiting_gate terminus) · REQ-OPS-2 (alert = recorded receipt at configured sink, log lines insufficient) · REQ-OPS-3 (usercontent = signed-URL HEAD asserting 200/no-cookie/disposition) · REQ-OPS-4 (≤4min = telemetry join over real-signup cohort) · REQ-OPS-5 (preview = mailbox-minted session, marker-only renderer asserts) · REQ-OPS-6 (scheduled nightly must pin provenance = deployed SHA; merge-dependent) · REQ-OPS-7 (golden close needs live run+manifest+gate+promotion record; absent-manifest exit-0 is non-evidence).
