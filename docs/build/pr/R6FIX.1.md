# R6FIX.1 — Findings hardening: keep-alive undo, proxy key refresh, HSTS, ILB design

Insert row (operator-directed findings work; no manifest file) · stacks on
`stevevitali/r6gld-1-golden-validation` · mergePolicy: **OPERATOR** (never self-merges).

**Honest headline: three findings hardened in code + tests and one designed for ruling — all
fixture/engineered-verified; the live re-proofs are honestly owed post-deploy (prod serves
`80db0d5`, predating this branch). $0 spent, zero production mutations, no `pulumi up`.**

## Per-finding verdicts

| Finding | Verdict | Evidence |
|---|---|---|
| **F-R6POST.2-2** (REQ-NAVC-22/23 — collab editor undo dies on keep-alive remount) | **FIXED in code** | `page-collab.dom.test.tsx` 17 green |
| **F-R6GLD.1-1** (design gap — SIGHUP-only proxy key refresh; the 2026-10-23 research-401 outage) | **FIXED in code** | `secret-manager.test.ts` 5 green |
| **D-R6SECR.1-2 / F-R6SECR.1-2** (no HSTS, LOW) | **FIXED in code** — DONE on the code fix; live-curl re-verify owed post-deploy | `server.test.ts` + `security-headers.test.ts` 6 green |
| **D-R6INF.1-1 / F-R6INF.1-1** (proxy MIG×2 can't converge on the pinned `networkIP`) | **DESIGNED — operator ruling owed** | **ADR-122** |

## What changed

**1. Keep-alive undo (F-R6POST.2-2).** Root cause verified deterministically: y-prosemirror's
`yUndoPlugin` view calls `undoManager.destroy()` on every `EditorView` teardown — and
`Y.UndoManager.destroy()` removes the doc's `afterTransaction` capture handler permanently, so
on the keep-alive Page (view dies on every route leave; the registry-held session survives) the
pre-leave stack still pops once but **no post-remount edit is ever captured** — the live
"⌘Z does nothing" symptom. The fix mirrors how the session already splits the Y.Doc:

- `packages/editor`: `createPageUndoManager(fragment)` (upstream-verbatim options —
  `trackedOrigins: [ySyncPluginKey]`, the protected-nodes delete filter,
  `addToHistory:false` honored) + `yPersistentUndoPlugin(um)` — same `yUndoPluginKey`, so
  `yUndo`/`yRedo`/`undoCommand`/`redoCommand` behave verbatim; the view attaches only the two
  per-view selection listeners and detaches them on destroy, never killing the shared manager.
- `apps/web`: `createCollabWire` creates + owns the manager on the session's fragment
  (`CollabPageWire.undoManager`); `wire.destroy()` runs `undoManager.destroy()` on true
  teardown; `PageMount` hands it to `createCollabPageState`. The SSR island keeps stock
  `yUndoPlugin()` semantics (single-mount lifecycle — unchanged).

**2. Bounded periodic key refresh (F-R6GLD.1-1).** `ReloadableAnthropicSecretProvider.
startPeriodicRefresh(intervalMs, deps)` — re-reads the same secret-version name every 5 min
default (`ANTHROPIC_KEY_REFRESH_MS` override), `.unref()`'d timer (never holds the process),
serialized one-in-flight, a failed fetch keeps the last good key and reports through `onError`
(a throwing sink can't fault the loop into an unhandled rejection), returns a stop handle.
`main.ts` wires it next to the unchanged SIGHUP path. A dead/rotated upstream key now propagates
within one interval — no recycle needed.

**3. HSTS (D-R6SECR.1-2).** `Strict-Transport-Security: max-age=31536000; includeSubDomains`
(no `preload` — the browser-list submission is an operator decision) on **both** origins:
`apps/web/src/server.ts` stamps it on every response before the CSP middleware's HTML rewrite
(so the clone carries it through verbatim); `apps/api/src/index.ts` rides the existing
every-response header middleware. Stamped only when the request arrived over TLS —
`x-forwarded-proto === "https"` (the GFE signal; the container socket is plaintext) or a raw
`https://` URL — so an http request never caches a policy it can't honor (dev `localhost`
stays clean; `*.sslip.io`/run.app preview hosts are HTTPS-only anyway).

**4. ILB design (D-R6INF.1-1 — design only).** **ADR-122**
(`docs/adr/ADR-122-egress-proxy-internal-passthrough-nlb-shared-vip.md`, **PROPOSED — operator
ruling owed**): an internal passthrough NLB on a new shared VIP (`proxy-vip` +
`RegionBackendService` reusing the existing TCP:8443 health check + INTERNAL forwarding rule,
`portName:"https"`), the template drops `networkIP` (ephemeral NICs), `rhema:proxyBaseUrl`
repoints (worker `ANTHROPIC_BASE_URL`, api `EGRESS_PROXY_URL`), then `egressProxyTargetSize`
1→2 under a frontend-presence guard. Three-`up` migration ordering, failover drill, rollback
(the `10.8.16.4` reservation is retained across cutover as the revert path), runbook sketch,
cost ≈**+$18/mo** LB standing charge on top of the ruled +$12.2 second VM. The `>1`
fail-closed guard in `compute.ts` stays armed. **No implementation, no `pulumi up`.**

## Honestly owed (live re-proofs)

- `R10.keepalive` semantic arm — stays `expected:"red"` until the deployed leg re-runs on a
  domains-bearing stage carrying this SHA (D-SPA.24-1 tail).
- `curl -sI https://rhema.tools/` + `https://api.rhema.tools/session` — the HSTS closing
  clause; owed post-deploy (D-R6SECR.1-2 tail).
- ADR-122 — the operator's ruling on the ≈+$18/mo delta, then an implementation ticket in a
  named maintenance window (D-R6INF.1-1).
- The proxy's periodic refresh takes live effect on the next proxy deploy.

## Deferral / finding updates

- **D-R6SECR.1-2 → DONE** (code-landed; live-curl re-verify tail appended).
- **D-R6INF.1-1** — dated tail (ADR-122 proposed; row stays OPEN for the ruling).
- **D-SPA.24-1** — dated tail (fix landed; `R10.keepalive` semantic re-proof owed post-deploy).
- **LEDGER**: F-R6POST.2-2 resolved-in-code · F-R6GLD.1-1 design-gap note (engineered) ·
  F-R6INF.1-1 design-proposed note · `lastCompleted`/`chainTip` updated · `nextTicket` stays
  `196a_HUMAN-H12`.

## Verification

- `pnpm turbo build lint typecheck` — **36/36 green** (web, api, editor, egress-proxy + deps).
- Vitest: `apps/web` **1315** (incl. the 2 new keep-alive undo legs) · `apps/api` **561**
  (incl. 3 HSTS) · `apps/egress-proxy`+`packages/editor` **243** (incl. 5 periodic-refresh).
- `check-build-memory.sh .` — 0 violations · `check-append-only.mjs --base c1f20f5` — OK.
- CI: see `docs/build/logs/ci-R6FIX.1.json` (boundary read recorded in the run ledger).

Run ledger: `docs/build/runs/R6FIX.1.md`.
