# DEF.3 — Live noise + polish (F7/F9/F10)

Ticket: `docs/tickets/57_DEF.3__live-noise-and-polish.md` · run ledger:
`docs/build/runs/DEF.3.md`
Stacks on `stevevitali/def-2-ledger-metering-integrity`. **Stage A ($0) only** — the Stage-B live
re-verify (one bounded `chat_turn` ≤$5 + the probe-allow and minted-link legs) is
operator/deploy-gated and tracked as D-DEF.3-1.

## Summary

STB.3's live legs produced three smaller defects — SLO noise on healthy traffic, a dead email
deep-link, and a cap that could be crossed consumed-but-unmetered. Each is fixed at the root:

- **F7 — SDK `/api/hello` probe denied by the run allowlist → false `egress_denied` trips.** The
  vendored agent SDK fires `HEAD api.anthropic.com/api/hello` at CLI init; it transits the per-run
  proxy but the authored allowlist admitted only `api.anthropic.com` `/v1/`. Every run logged a
  credentialed 403 + `egress.denied` event — 28 rows one night, counted against §13.5
  `egress_denied_10m`. Fix is **admission, not suppression**: `ANTHROPIC_PROBE_ENDPOINT`
  (`api.anthropic.com`, `/api/hello`) is authored on every run allowlist — same provider host the
  credential already reaches, one fixed health path, nothing else widened. A genuine denial still
  signals exactly as before.
- **F9 — every emailed action link was a dead 404.** `mintEmailAction` mints
  `<apiBaseUrl>/api/action/<payload>.<sig>`; the api mounts at the listener root and only
  registered `/action/:token` — the minted path had no route (STB.3's working leg hit the
  unprefixed path). The consume handler now answers on **both** `/api/action/:token` (the minted
  contract) and `/action/:token`, unchanged semantics: HMAC validation, tenant binding, expiry,
  single-use conditional update, `hold` → `holdGate`, 303 to the slug deep link.
- **F10 — stream end could precede the meter commit.** `streamProxyRequest` delivered every
  upstream chunk + `end()` and metered afterwards — a cap-crossing response could be
  consumed-but-unmetered, and a meter refusal would have silently served an unmetered success
  (I2). The handler now **withholds the terminal chunk until the usage row commits**: stream end
  always implies the run is on the meter — §12.4's one-in-flight residual bound becomes a hard
  ordering — and a meter refusal truncates the stream rather than delivering unmetered. Committed
  debits still clamp at the cap per REQ-BILL-3 (the residual is absorbed COGS per DEF.2's terminal
  semantics).

## What changed

- `packages/orchestrator/src/allowlist.ts` — `ANTHROPIC_PROBE_ENDPOINT` + authored on every tier.
- `packages/orchestrator/src/provision.ts` — `proxy_allowlists.hosts` deduped (probe + API share
  the provider host).
- `apps/api/src/notification-routes.ts` — consume handler shared across `/api/action/:token` +
  `/action/:token`.
- `apps/egress-proxy/src/handler.ts` — `streamProxyRequest` meter-before-terminal-chunk ordering.
- `apps/egress-proxy/src/cap.ts` + `server.ts` — comments: ordering invariant + truncation on meter
  refusal.
- Tests: `allowlist.test.ts` (+2), `handler.test.ts` (+2 — probe forwards/allow row/no
  `egressDenied`, sibling path still 403), `notification-routes.test.ts` (+1 — minted URL consumes
  →303→410 over PGlite), `streaming-handler.test.ts` (+3 — instrumented ordering, cross-cap 402,
  meter-refusal truncation). All written failing first.

## Gates

`turbo build lint typecheck` 132/132 · `pnpm test` 380 files / 3,587 pass · licenses 607 ·
protocol-markers 45 · upstream-diff 22 (sanctioned only) · build-memory 0.

## Deferrals

- **D-DEF.3-1 opened:** Stage B — deploy the api+proxy images, then one bounded `chat_turn` ≤$5
  (stream completes, every request metered, cap-boundary next-request 402) + the same run's
  `fetch_log` showing the probe `allow` row and zero `egress_denied` noise + a minted
  `/api/action/<token>` round trip on prod (303 → replay 410 → tamper 400). The F7 allowlist fix
  applies to runs provisioned after the deploy — the live leg needs a fresh run.
