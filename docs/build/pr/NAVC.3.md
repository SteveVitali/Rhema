# NAVC.3 — Page-session registry + Query-freshness invariants

Manifest row 156 · stacks on `stevevitali/navc-2-settle-contract` · merge policy
**OPERATOR** — do not merge from the build environment · contract
`docs/tickets/156_NAVC.3__session-invariants.md` · run ledger
`docs/build/runs/NAVC.3.md`.

## What lands

The dormant client-navigation machinery's lifecycle races are closed before NAVC.4's
acceptance legs exercise them (spec §4 REQ-NAVC-17/18/20/22; r5_a5 F7/F11/F12).

- **`spa/page-sessions.ts`** — destroy-identity invariants: `destroyEntry(key, expected?)`
  generation-checks (`entries.get(key) === entry`) so a timer or eviction decided against an
  OLD occupant can never kill the entry that re-acquired the key since; the idle-destroy
  callback captures the entry AND re-checks `refs === 0` at fire time (the
  cancelled-but-dispatched race), resolving `entry.key` lazily so a `rekey`ed idle entry still
  dies under its NEW key at TTL; `release(draftId, expected?)` no-ops on a map miss AND on an
  identity mismatch (a phantom release naming a stale draft id never decrements the new
  occupant); `rekey` refuses a HELD target outright — checked BEFORE `rebind`, so a refused
  rekey never repoints the source's wire and never tears down a live mount's session (the
  mount's `rebase` treats null as "leave it").
- **`spa/queries.ts`** — per-surface freshness policy driven by which twin GETs carry
  mark-read/view side effects: `projectPageQuery` gains `staleTime: PAGE_SESSION_IDLE_TTL_MS`
  (the keep-alive window doubles as R10's warm-return horizon — a leave→return inside it
  paints with zero twin GETs); `dossierQuery`/`runReportQuery`/`projectRunSheetQuery` keep
  `staleTime` 0 deliberately — their GETs ARE the read-receipt leg (`markInboxRunRead`, view
  emissions, the `voice.staleness_shown` mint), so refetch-per-mount preserves document-nav
  parity. The full per-twin census (accept-stale vs compensate-by-refetch) is recorded in the
  run ledger.
- **`data-page-session`** (REQ-NAVT-5 emit half + REQ-NAVT-7 row) — the registry mints
  `sessionId = "<bootNonce>.<seq>"` per entry (nonce per document boot — the module
  singleton's at init, seq monotonic; survives `rekey`, fresh on destroy+recreate);
  `page-mount` stamps it on `[data-page-root]` while the view is bound — identical value on
  StrictMode/keep-alive remounts, new only on a new entry or a new document. Manifest row on
  the `editor` surface lands conditional, with emitter + assertion in this PR.
- **`spa/ide/chrome-data.tsx`** — the `published`-flag wrong-projectId window closed:
  `useIdeChromeData`'s cleanup now `unpublish()`es (clears the bag AND drops the flag) instead
  of `set(EMPTY)` (which left `published: true` against an empty bag — between leaves the
  controller's bind effect could run under `data.projectId ?? slug` and persist
  `rhema:panes:v1:<u>:<slug>` with a slug for a projectId — r5_a5 F12(b)). Same-commit leaf
  swaps batch cleanly (the successor's publish wins; no visible flicker).
- **`spa/head.tsx`** — `<html data-project>` follows the committed route: re-stamped to the
  `/p/:slug` segment, REMOVED outside project space — `projectSlugFor` parity with the
  served-document stamp (`spa-shell.ts`); the stale-project-marker hazard (r5_a5 F11) is
  fixed, not accepted.
- **`server.ts`** — `cache-control: no-store` floor middleware for authenticated responses
  that didn't declare a policy (auth'd documents, `/bff/*` twins, `/session`, redirects) —
  the bfcache posture REQ-NAVC-20's client-nav invariants assume. Handler-declared policies
  win verbatim (immutable assets, SSE `no-cache`, favicon's public day); anonymous requests
  stay unstamped.

## Tests

- `page-sessions.test.ts` (+5 → 15) — each formerly-reachable kill path named: stale idle
  timer vs a re-acquired key; cancelled-but-fired timer vs a re-HELD entry; phantom release
  vs the new occupant; release map-miss; `rekey` onto a HELD target (no evict, no rebind,
  source unmoved); plus the `sessionId` mint contract.
- `queries.test.ts` (new, 4) — the freshness-policy pin: projectPage TTL, staleTime-0
  mark-read twins, `sessionQuery` 30 s.
- `transitions.dom.test.tsx` (new, 8) — StrictMode + real-router-hop legs: keep-alive
  leave→return re-acquires the SAME entry (same stamp, refs 1→0→1) with zero twin GETs while
  the handoff POST refires; mark-read twin refetch-per-landing parity; held-entry survival
  across cross-project hops; the published-flag window (`rhema:panes:v1:u1:beta-piece` never
  read); listener/interval balance modulo the two NAMED per-boot singletons (router
  scrollRestoration `pagehide`, FocusManager `visibilitychange`); exactly-one-live
  EventSource under SSE churn; `getSpaBoot()` instance identity; `data-project` follow/removal.
- `spa.dom.test.tsx` — the 401 leg pinned: session cache cleared +
  `invalidateQueries({refetchType:"none"})` + `/login` document navigation.
- `spa-shell.test.ts` (+4) — `no-store` on authed shell/`/session`/`/bff/*`; immutable-asset +
  favicon policies verbatim; anonymous requests unstamped.

## Out of scope (contract)

The R10/R10.keepalive + scroll/keymap/head acceptance legs → 157_NAVC.4 (this PR lands the
invariants those legs assert). `data-page-session`'s journey-read half → NAVC.4.

## Verify

`pnpm turbo build lint typecheck` **135/135** · `pnpm test` **5,670 pass / 4 skip / 1 fail** —
the single failure is `apps/run-task/src/privsep.docker.test.ts`, a local Docker Desktop
containerd metadata-db I/O error (`write meta.db: input/output error`) reproduced standalone
with zero diff overlap (environmental; recorded in the run ledger) · all seven `check:*`
green (dom-contract editor surface now 50 emitted/asserted incl. `data-page-session`;
spa-budget entry graph 202.7/250 kB) · build-memory 0 violations · append-only vs `40cc4c8`
OK.
