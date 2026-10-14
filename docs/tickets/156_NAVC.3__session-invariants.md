# NAVC.3 — Page-session registry + Query-freshness invariants

- **Sequence:** 156 · **Phase:** round 5 · **Kind:** ticket
- **base_branch:** current checkout
- **Depends on:** 155_NAVC.2
- **Run:** `implement-spec spec=docs/tickets/156_NAVC.3__session-invariants.md`
- **Gate status:** none
- **Live stage:** none
- **Production mutations:** none
- **Size budget:** ~500 changed lines

## Goal
Land the dormant-machinery invariants that must hold BEFORE client navs exercise them: the
registry destroy-identity fix and the per-surface Query freshness policy (which R10's warm-return
assert depends on).

## Load
- `docs/post-spa-disposition-spec.md` §4 (REQ-NAVC-17/18/22 — corrected cites: `page-sessions.ts:157,173-174,213-226`)
- `docs/research/r5_a5_dormant-machinery.md` (the hazards — mechanism restated in spec §1)
- `apps/web/src/spa/page-sessions.ts` (registry: `acquire`/`release`/`rekey`/`destroyEntry`),
  `spa/page-mount.tsx`, `spa/queries.ts:1245-1251` (`projectPageQuery` — unstaled today),
  `spa/main.tsx` (`makeSpaQueryClient` ~:70-78)
- `apps/web/src/server.ts:4730-4732` (`markInboxRunRead` — the mark-read twin GETs)

## In scope — deliverables
1. **Registry fix** (REQ-NAVC-17): the invariant "a destroy timer or eviction must never kill a
   held or re-acquired entry" — generation check (`entries.get(key)===entry`) inside
   `destroyEntry`/timer callback, `release` no-op on map miss, `rekey`'s `destroyEntry(toKey)`
   must not evict a HELD target (refs check). Regression tests name each previously-reachable
   kill path.
2. **Freshness policy** (REQ-NAVC-18): per-surface `staleTime`/refetch policy driven by which
   twin GETs carry mark-read/view side effects — the per-twin parity decision (accept-stale vs
   compensate) recorded in the run ledger; `projectPageQuery` gets the nonzero staleTime R10
   needs, dossier/report twins keep mark-read parity vs document nav.
3. **`data-page-session` emission** (NAVT-5 half): `<bootNonce>.<seq>` stamped on
   `[data-page-root]` per registry entry.
4. **Boot/session lifecycle** (REQ-NAVC-20 + Q-A4-2): per-document boot intact under client
   navs; the 30 s session re-verify + 401 → `/login` doc-nav + `refetchType:"none"` pinned by
   test; verify auth'd responses carry `no-store` (pin it if absent — the bfcache check).
5. **`data-page-session` dom-contract row** (REQ-NAVT-7 second half): manifest row + emitter +
   assertion land together this PR.
6. **Transition-level tests** (REQ-NAVC-22): StrictMode + real-router-hop dom tests covering
   listener counts, timers, EventSource/observers, the page-session registry across leaves, the
   `published`-flag wrong-projectId window, SSE reconnect churn, stale `<html data-project>`.

## Out of scope
- The R10/R10.keepalive journey legs themselves → 157_NAVC.4 · scroll/keymap/head → 157_NAVC.4

## Acceptance criteria
- [ ] Registry invariants hold under the named kill paths — tests prove a timer/eviction never kills a held entry *(deterministic)*
- [ ] `projectPageQuery` round-trips a leave→return within TTL with zero twin GETs; dossier/report twins keep mark-read parity — tests + the recorded parity decision *(deterministic)*
- [ ] StrictMode transition suite green incl. the stale-projectId + SSE-churn cases *(deterministic)*
- [ ] verification green; BUILD_INDEX row + LEDGER advanced; operating clauses met. *(agentic — universal AC)*

## Requirement IDs to satisfy and stamp in the PR
REQ-NAVC-17 REQ-NAVC-18 REQ-NAVC-20 REQ-NAVC-22 REQ-NAVT-5(emission half) REQ-NAVT-7(page-session row half)
