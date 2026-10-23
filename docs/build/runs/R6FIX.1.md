# R6FIX.1 — Findings hardening: keep-alive undo, proxy key refresh, HSTS, ILB design (run ledger)

- **Spec:** operator-directed findings work — no manifest ticket file. The contract is the four
  findings verbatim:
  - **F-R6POST.2-2** (LEDGER OPEN FINDINGS; REQ-NAVC-22/23) — collab editor undo stack dies on a
    keep-alive remount (`YUndoPluginView.destroy()` kills the registry-held UndoManager).
  - **F-R6GLD.1-1 design gap** (LEDGER OPEN FINDINGS) — `ReloadableAnthropicSecretProvider`
    re-fetches the provider key only on SIGHUP/boot; a dead upstream key can't propagate.
  - **D-R6SECR.1-2** (DEFERRALS; F-R6SECR.1-2 LOW) — no `Strict-Transport-Security` anywhere.
  - **D-R6INF.1-1 / F-R6INF.1-1** (DEFERRALS + OPEN FINDINGS) — proxy MIG×2 needs an internal-LB
    design + fresh operator ruling (**design only — no implementation**).
- **Normative loads:** `docs/build/LEDGER.md` OPEN FINDINGS (the four findings);
  `docs/tickets/DEFERRALS.md` rows **D-R6SECR.1-2**, **D-R6INF.1-1**, **D-SPA.24-1**;
  `apps/web/src/spa/page-sessions.ts` + `page-collab.ts` + `page-mount.tsx` (the keep-alive seam);
  `packages/editor/src/plugins.ts` (ySyncPlugin + yUndoPlugin wiring);
  `apps/egress-proxy/src/secret-manager.ts` + `main.ts`; `apps/web/src/server.ts` (the header
  middleware) + `apps/api/src/index.ts`; `infra/pulumi/compute.ts` (the pinned `networkIP` + the
  `>1` fail-closed guard); `docs/adr/` (next free: ADR-122).
- **Base:** `stevevitali/r6gld-1-golden-validation` @ `b3ff232` (chain tip; PR #214)
- **Branch:** `stevevitali/r6fix-1-findings-hardening` (mergePolicy=OPERATOR — never merge)
- **Harness:** devin-desktop/swe-2-high/subagent · **Skills:** implement-spec + build-memory +
  self-review @ `~/agent-skills` (`e981ec5`)
- **Started:** 2026-10-23T19:52Z · **Closed:** 2026-10-23T20:1xZ
- **Live stage:** none — code+tests only; production deploys OUT OF SCOPE (no `pulumi up`, no prod
  mutations). Keep-alive + HSTS live re-proof is recorded as owed post-deploy.
- **Production mutations:** none.
- **ci:** see `logs/ci-R6FIX.1.json` (boundary read at push head)

## Deferrals read

`docs/tickets/DEFERRALS.md` read first (protocol). Rows in scope:

- **D-R6SECR.1-2** (OPEN — HSTS, LOW) → this run lands the code fix; live header verification is
  post-deploy → close on the code fix with the live-reproof note.
- **D-R6INF.1-1** (OPEN — ILB design + ruling) → this run lands the ADR only; row stays OPEN with
  a dated tail (design proposed, operator ruling owed).
- **D-SPA.24-1** (OPEN — R10.keepalive residual) → the product-side fix lands here; the semantic-arm
  re-proof is post-deploy → dated tail (fix landed, re-proof owed).
- **D-OPS.1-1** — names R10.keepalive among residuals; not in scope for a status change (the leg's
  full-list-green condition is broader); noted only.

## Requirements

1. **F-R6POST.2-2:** a keep-alive remount (mount→unmount→remount preserving `data-page-session`)
   preserves the undo stack — REQ-NAVC-22/23 semantics (session identity survives; undo survives
   with it) — while a true teardown still cleans up. Don't break collab sync. Deterministic tests:
   mount→unmount→remount preserves ⌘Z; real teardown clears.
2. **F-R6GLD.1-1:** bounded periodic refresh in `ReloadableAnthropicSecretProvider` (sensible
   interval ≈5 min; timer `.unref()`'d). Keep the SIGHUP path. Tests: refresh fires on interval;
   failed fetch keeps serving last good key; no unhandled rejection crashes.
3. **D-R6SECR.1-2:** `Strict-Transport-Security` (long max-age + includeSubDomains; no `preload`)
   at the correct layer following the existing header pattern; test asserts it on served docs;
   preview/`sslip.io` hosts must not break.
4. **D-R6INF.1-1:** `docs/adr/ADR-122-<slug>.md` — ILB design (passthrough NLB or managed
   alternative) + DNS/config path + migration + monthly cost + rollback. Status:
   **PROPOSED — operator ruling owed.** Runbook sketch if trivially derivable.
5. **Records:** this ledger, `docs/build/pr/R6FIX.1.md` + PR, BUILD_INDEX row, DEFERRALS updates
   (D-R6SECR.1-2 close; D-R6INF.1-1 tail; D-SPA.24-1 tail), LEDGER OPEN FINDINGS resolutions +
   PHASE LOG; `nextTicket` stays `196a_HUMAN-H12`.
6. **Verify:** `pnpm turbo build lint typecheck` + `pnpm test` on touched packages;
   `check-build-memory.sh .` 0 violations; `check-append-only.mjs --base c1f20f5` OK; push +
   `ci-boundary.sh` read.

## Root cause (F-R6POST.2-2 — verified live in-repo)

`yUndoPlugin`'s plugin view calls `undoManager.destroy()` on `EditorView.destroy()` (y-prosemirror
1.3.7 `undo-plugin.js:120-122`, unconditional — even for an injected manager). yjs 13.6.33's
`UndoManager.destroy()` does **not** clear the stacks — it removes `doc`'s
`afterTransactionHandler` (capture dies permanently), deletes `this` from `trackedOrigins` (redo
bookkeeping dies), and wipes all observers. Reproduced deterministically
(`undo-repro.dom.test.tsx`, since folded into `page-collab.dom.test.tsx`): pre-leave stack still
pops post-remount, but **every post-remount edit is never captured** — `canUndo()` goes false
forever after the first pop. On the live leg the compounded result reads as "the undo stack is
empty." Fix: the UndoManager is owned by the registry-held `CollabPageWire` (created with the
session, destroyed on entry teardown), and a `yPersistentUndoPlugin` (same `yUndoPluginKey`, so
`yUndo`/`yRedo`/`undoCommand`/`redoCommand` work verbatim) attaches only the two per-view
selection listeners — its `destroy` detaches them and never kills the shared manager.

## Plan

1. `packages/editor/src/plugins.ts` — add `createPageUndoManager(fragment)` (y-prosemirror-verbatim
   options: `trackedOrigins:[ySyncPluginKey]`, `defaultDeleteFilter`/`defaultProtectedNodes`,
   `captureTransaction` honoring `addToHistory:false`) + `yPersistentUndoPlugin(um)` (init/apply/
   view mirror upstream; view-destroy detaches listeners only). `createCollabPageState(fragment,
   initSources?, undoManager?)` — persistent plugin when a manager is supplied, upstream
   `yUndoPlugin()` otherwise (the SSR island's single mount keeps upstream semantics).
2. `apps/web/src/spa/page-collab.ts` — `createCollabWire` creates + owns the manager on the shared
   fragment; `CollabPageWire.undoManager` exposed; `destroy()` runs `undoManager.destroy()` before
   `session.destroy()` (doc.destroy() would anyway — explicit for the read).
3. `apps/web/src/spa/page-mount.tsx` — pass `wire.undoManager` into `createCollabPageState`.
4. Tests in `apps/web/src/spa/page-collab.dom.test.tsx`: (a) mount→type→unmount→remount→⌘Z removes
   the marker AND a post-remount edit is captured+undoable (the regression repro showed capture
   dead); (b) entry destroy → `undoManager.destroy()` called (spy).
5. `apps/egress-proxy/src/secret-manager.ts` — `startPeriodicRefresh(intervalMs, deps?)`: injected
   scheduler (page-sessions-style), serialized in-flight refresh, `.unref()`'d timer, error →
   keeps last key, returns a stop handle. `main.ts` wires `ANTHROPIC_KEY_REFRESH_MS` (default
   300_000); SIGHUP path kept.
6. `apps/web/src/server.ts` + `apps/api/src/index.ts` — `Strict-Transport-Security:
   max-age=31536000; includeSubDomains` on every response **only when the request arrived over
   HTTPS** (`x-forwarded-proto === "https"` or `https:` request URL) — http dev/preview loops
   never cache a bogus policy; `sslip.io`/run.app hosts are per-host and harmless but the
   https-gate keeps the stamp truthful anyway (RFC: meaningless over insecure transport).
7. `docs/adr/ADR-122-egress-proxy-ilb-ha.md` — ILB design + runbook sketch + cost + rollback.
8. Records + verify + push + PR + ci-boundary.

## Test matrix

| Finding | AC | Test |
|---|---|---|
| F-R6POST.2-2 | remount preserves undo; post-remount capture works | `page-collab.dom.test.tsx`: mount→type→unmount→remount→`undoCommand`/`yUndo` removes marker; second post-remount edit captured+poppable |
| F-R6POST.2-2 | true teardown cleans up | same file: `registry.destroyAll()` → wire destroy → `undoManager.destroy` spy called + `session.destroy` |
| F-R6GLD.1-1 | refresh fires on interval | `secret-manager.test.ts`: injected scheduler ticks → accessor re-called; key swaps |
| F-R6GLD.1-1 | failed fetch keeps last key; no unhandled rejection | same: accessor throws mid-cycle → key unchanged, error reported, loop survives |
| D-R6SECR.1-2 | STS on served documents over https | `server.test.ts`/`spa-shell.test.ts`: https-forwarded GET `/` + a doc → header present; http request → absent |
| D-R6SECR.1-2 | api also stamps | api index test: https-forwarded request → header present |
| D-R6INF.1-1 | design lands | `docs/adr/ADR-122-*.md` committed, Status: PROPOSED — operator ruling owed |

## Progress

- 2026-10-23T19:45Z — branch cut at `b3ff232` (clean); findings + DEFERRALS rows read; anchors
  verified (undo plugin lifecycle, header middlewares, secret provider, proxy template/guard).
- 2026-10-23T19:5xZ — F-R6POST.2-2 root cause reproduced deterministically in-repo: the stock
  `yUndoPlugin` view-destroy calls `undoManager.destroy()` → post-remount `canUndo()` goes false
  and no new edit is captured (pre-leave stack still pops once).
- 2026-10-23 — `createPageUndoManager` + `yPersistentUndoPlugin` landed (`packages/editor`);
  `createCollabWire` owns the manager; `PageMount` hands it in; 17/17 collab dom tests green
  incl. the two new keep-alive/teardown legs. Scratch repro file folded + removed.
- 2026-10-23 — `startPeriodicRefresh` landed (`apps/egress-proxy`) + `main.ts` wiring
  (`ANTHROPIC_KEY_REFRESH_MS`, default 300_000); 5/5 secret-manager tests green — interval swap,
  stale-good-key, one-in-flight serialization, unref + stop. Hardened: a throwing `onError`
  sink can never fault the loop into an unhandled rejection.
- 2026-10-23 — HSTS landed on both origins (web every-response arm before the CSP clone; api's
  existing header middleware), stamped only on TLS-arrived requests; 3+3 tests green.
- 2026-10-23 — ADR-122 written (internal passthrough NLB on a shared VIP; PROPOSED — operator
  ruling owed); `docs/adr/README.md` regenerated via `adr-index.sh`.
- 2026-10-23 — verify: turbo 36/36 green (web/api/editor/egress-proxy build+lint+typecheck);
  vitest `apps/web` 1315 / `apps/api` 561 / `apps/egress-proxy`+`packages/editor` 243 — all pass.
- 2026-10-23 — records: DEFERRALS (D-R6SECR.1-2 → DONE code-landed w/ live re-verify tail;
  D-R6INF.1-1 + D-SPA.24-1 dated tails), LEDGER (F-R6POST.2-2 resolved-in-code, F-R6GLD.1-1 +
  F-R6INF.1-1 notes, PHASE LOG, `updatedAt`/`lastCompleted`/`chainTip`; `nextTicket` stays
  `196a_HUMAN-H12`), BUILD_INDEX row 221, `pr/R6FIX.1.md`, this ledger.

## Gap table

| Finding | Contract | Delivered | Layer | Carried |
|---|---|---|---|---|
| F-R6POST.2-2 | undo survives keep-alive remount; true teardown clears | session-owned `Y.UndoManager` + persistent plugin; 2 deterministic legs | fixture-verified | `R10.keepalive` live semantic re-run post-deploy (leg stays `expected:"red"`) |
| F-R6GLD.1-1 | bounded periodic refresh; SIGHUP kept; stale-good-key; `.unref()`; no unhandled rejection | `startPeriodicRefresh` + `main.ts` wiring + 5 tests | fixture-verified | live effect on next proxy deploy |
| D-R6SECR.1-2 | HSTS long max-age + includeSubDomains, right layer, test, preview-safe | both origins stamp `max-age=31536000; includeSubDomains` (no preload) only for TLS-arrived requests; 6 tests | fixture-verified | live-curl re-verify post-deploy (prod serves `80db0d5`) |
| D-R6INF.1-1 / F-R6INF.1-1 | ILB design + ruling — design only | ADR-122 (PROPOSED): shared-VIP passthrough NLB, ephemeral NICs, repoint, 3-`up` migration, drill, rollback, ≈+$18/mo delta | designed | operator ruling → implementation ticket in a named window |

## Evidence log

- Undo: `apps/web/src/spa/page-collab.dom.test.tsx` (17 green — the new describe covers
  remount-persistence + post-remount capture + true-teardown destroy); root-cause writeup in
  "Root cause" above; plugin code `packages/editor/src/plugins.ts:42-132`.
- Refresh: `apps/egress-proxy/src/secret-manager.test.ts` (5 green) + `main.ts` wiring.
- HSTS: `apps/web/src/server.test.ts` (the `D-R6SECR.1-2` describe — https-forwarded doc stamps,
  https-URL arm, http absent) + `apps/api/src/security-headers.test.ts` (3).
- Design: `docs/adr/ADR-122-egress-proxy-internal-passthrough-nlb-shared-vip.md` +
  regenerated `docs/adr/README.md`.
- Gates: `turbo build lint typecheck` 36/36 green · `vitest` 1315+561+243 pass ·
  `check-build-memory.sh .` 0 violations · `check-append-only.mjs --base c1f20f5` OK.
- CI boundary: `docs/build/logs/ci-R6FIX.1.json`.

## Evidence report

PR body: `docs/build/pr/R6FIX.1.md`. Layer: **engineered + fixture-verified** — no live stage,
no prod mutation, $0 spend; the three live re-proofs (keep-alive semantic leg, HSTS curls, ILB
ruling) are recorded as honestly owed, not claimed.
