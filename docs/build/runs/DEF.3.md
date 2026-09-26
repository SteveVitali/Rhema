# DEF.3 — Live noise + polish (F7/F9/F10) (run ledger)

- **Ticket:** `docs/tickets/57_DEF.3__live-noise-and-polish.md` — the three smaller live-verified
  defects from STB.3: the SDK `/api/hello` probe tripping real SLOs (F7), the dead `/api/action`
  deep-link (F9), and the chat_turn 43>40 cap overshoot (F10).
- **Branch:** `stevevitali/def-3-live-noise-and-polish` · **PR #79** (stacks on
  `stevevitali/def-2-ledger-metering-integrity`, tip `649442e`; operator-held — DO NOT MERGE).
- **Gate status:** **Stage A (code + tests) DONE** — all deterministic gates green, $0. **Stage B
  (one bounded live chat_turn re-verify, ≤$5) OWED — operator/deploy-gated** (needs the api +
  egress-proxy images deployed; no `pulumi up` from the build env). See §5.
- **Spend:** $0 (Stage A only — no inference, no deploy).

## 1. Root-cause diagnoses (AC1)

### F7 — SDK `/api/hello` probe denied by the run allowlist → false `egress_denied` SLO noise

The vendored agent SDK fires a connectivity preconnect — `HEAD ${ANTHROPIC_BASE_URL}/api/hello` —
at CLI init, before the first inference call (first-party provider only; errors are swallowed
SDK-side, so the probe is invisible to the agent but hits the wire). The run's `ANTHROPIC_BASE_URL`
points at the per-run egress proxy, so the probe transits the credential path like every other
Anthropic call — and the authored allowlist
(`packages/orchestrator/src/allowlist.ts` → `proxy_allowlists.endpoints`) admitted only
`api.anthropic.com` `/v1/`. Every run's probe therefore got a credentialed **403**: one `deny`
fetch-log row + one `egress.denied` event per run — 28 deny rows in one night on prod, counted
against the §13.5 `egress_denied_10m` signal (STB.3 §4-F7).

The honest fix is admission, not suppression: the probe is provider traffic on the one host the
run's credential already reaches, so the authored allowlist gains
`ANTHROPIC_PROBE_ENDPOINT = { host: "api.anthropic.com", pathPrefix: "/api/hello" }`. The
alternative — suppressing the telemetry — would hide *genuine* denials (the ticket's explicit
reject); the client-level alternative (a `*_PROXY` env to skip the preconnect) is an unsupported
side-channel on vendored internals and would also change Bun's fetch behavior. No wider surface is
admitted: the provider host still allows exactly `/v1/` + `/api/hello`.

### F9 — minted `/api/action/<token>` links were a dead 404

`mintEmailAction` (`packages/orchestrator/src/email-actions.ts`) has minted
`<apiBaseUrl>/api/action/<payload>.<sig>` since PRB.09 — that string is what lands in the email.
But the api mounts its route tree at the listener root, and the consume handler was registered at
`/action/:token` — the `/api/`-prefixed minted path had no route and 404'd. STB.3's "round-trip
works" leg exercised the unprefixed path (which is why the token machinery itself — consume,
single-use, 410 replay — verified live); every link an actual email renders was dead.

### F10 — the streamed cap could be crossed *consumed-but-unmetered*

`streamProxyRequest` (`apps/egress-proxy/src/handler.ts`) piped every upstream chunk to the client,
called `sink.end()`, and *then* ran `prep.meter` — the usage row + cap-accountant record committed
only after the client already held the complete response. Two consequences:

1. **Ordering window.** A request whose stream crossed the cap was fully delivered while its spend
   was not yet on the meter — a follow-on request arriving in that window (or the run's own
   next-turn preflight) saw the pre-crossing total. STB.3's chat_turn: cap 40, metered 43 — the
   spec's residual bound (one in-flight request, §12.4) still holds, but the durable meter should
   commit *before* the client can observe stream end so the bound is a hard ordering, not a race.
2. **A meter refusal would have delivered a complete-but-unmetered response** — the meter ran
   after `end()`, so a throw (e.g. usage with no nameable model, REQ-SPEC-11's "never meter
   silently") could not stop delivery: an I2 breach in waiting.

Root is distinct from F5/DEF.2 (committed-vs-metered ledger semantics); this is the proxy's
delivery-vs-meter ordering on the streamed path.

## 2. Fixes

### F7 — admit the probe endpoint on every authored run allowlist

- `packages/orchestrator/src/allowlist.ts` — new `ANTHROPIC_PROBE_ENDPOINT`
  (`api.anthropic.com`, `/api/hello`) with the rationale documented; `authorRunAllowlist` emits it
  on every tier alongside `ANTHROPIC_ENDPOINT`. A `HEAD /api/hello` now forwards (provider
  key injected, sandbox auth stripped like every request), produces an `allow` fetch-log row and
  **no** `egress.denied` event — the signal stays truthful because the admission is in the data
  plane, not the telemetry.
- `packages/orchestrator/src/provision.ts` — the persisted `hosts` column is deduped (`new Set`)
  since probe + API share the provider host.
- **Scope note:** the allowlist is authored at provision, so the fix applies to *newly minted*
  credentials/runs — a run already provisioned keeps its frozen allowlist (rotation on the next
  attempt picks it up).

### F9 — mount the consume handler on the minted path

- `apps/api/src/notification-routes.ts` — the signed-action consume handler is mounted at
  `/api/action/:token` (the contract `mintEmailAction` puts in the email) **and** keeps
  `/action/:token` (the unprefixed surface the STB.3 leg exercised). Identical handler — signed
  token validation, tenant binding, expiry, single-use conditional update, `hold` → `holdGate`,
  303 to the slug deep link — unchanged.

### F10 — meter commits before the stream's terminal bytes leave

- `apps/egress-proxy/src/handler.ts` — `streamProxyRequest` withholds the **last** upstream chunk:
  every frame but the terminal one still delivers incrementally (latency unchanged), then
  `prep.meter` runs over the complete accumulated body, then the withheld tail + `end()`. A client
  that observes end-of-stream is always already on the meter — §12.4's one-in-flight residual
  bound is now a hard ordering. A meter throw propagates before the tail is written: the server
  shell's catch ends the socket mid-stream — the SDK sees a truncated response, never a
  complete-but-unmetered one (I2).
- `apps/egress-proxy/src/cap.ts` + `apps/egress-proxy/src/server.ts` — comments updated: the
  residual bound is one in-flight request *and* metered-before-end-of-stream; committed debits
  still clamp at the cap per REQ-BILL-3 (the residual is booked as absorbed COGS by the DEF.2
  terminal semantics, so `Σ debits ≤ cap` holds while the meter records what the provider actually
  served).

## 3. Regression tests (AC1)

- **F7:** `packages/orchestrator/src/allowlist.test.ts` — the authored allowlist carries
  `ANTHROPIC_PROBE_ENDPOINT` on every tier and admits *only* `/v1/` + `/api/hello` on the provider
  host. `apps/egress-proxy/src/handler.test.ts` — a credentialed `HEAD /api/hello` on a probe-
  allowlisted run forwards (allow row, zero `egressDenied`, nothing metered); a sibling
  `/api/other` path still 403s (nothing else widened).
- **F9:** `apps/api/src/notification-routes.test.ts` — the minted `m.url`
  (`/api/action/<token>`) consumes → 303 to the slug deep link → replay 410, over real PGlite.
- **F10:** `apps/egress-proxy/src/streaming-handler.test.ts` — three tests: (a) instrumented
  ordering — the usage write lands before the terminal chunk + `end()`, with byte-identical stream
  integrity; (b) a served stream crossing the cap meters over, then the next request is 402 with a
  `deny reason=cap` row (the spec'd residual bound); (c) a meter-refusing response (usage, no
  nameable model) propagates, writes no usage row, and the stream never reaches `[DONE]` — honest
  truncation, not silent unmetering.

Each was written failing first, then fixed to green (F7's authored-allowlist test, F9's minted-path
consume, and all three F10 ordering tests failed pre-fix).

## 4. Gates

`pnpm turbo build lint typecheck` — **132/132** · `pnpm test` — **380 files / 3,587 pass**
(3 skipped; +7 over DEF.2's 3,580 — the new regression tests) · `check:licenses` — **607 OK** ·
`check:protocol-markers` — **45 clean** · `check-upstream-diff` — **22 reconciled** ·
`check-build-memory.sh` — **0 violations**.

## 5. Stage B — OWED (operator/deploy-gated, ≤$5 combined)

No deployed image carries this branch and the build env does not deploy (no `pulumi up`). The owed
live legs, all bounded:

- **F10 cap re-verify (the ticket's Stage B, ≤$5):** after the egress-proxy image deploys, drive
  ONE bounded `chat_turn` run and assert — the stream completes, `usage_records(source='proxy')`
  rows exist for every served request, and at the cap boundary the next request is 402 with metered
  ≤ cap + one in-flight request (the §12.4 residual; committed debits clamp at cap per REQ-BILL-3).
- **F7 (folds into the same run, $0 marginal):** the re-verify run's `fetch_log` shows an **allow**
  row for `HEAD /api/hello` and zero `egress_denied` noise; run a couple of SLO probes to confirm
  `egress_denied_10m` no longer counts the probe. (The fix applies to newly provisioned runs —
  the live leg needs a fresh run, which the chat_turn provides.)
- **F9 ($0):** on the deployed api, `GET https://api.rhema.tools/api/action/<a freshly minted
  token>` returns 303 to the deep link; replay 410; tamper 400.

Spend cap **$5** total; any leg that cannot fit honestly defers with a dated note.
