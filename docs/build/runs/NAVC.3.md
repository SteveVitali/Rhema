# NAVC.3 — Page-session registry + Query-freshness invariants (run ledger)

- **Spec:** `docs/tickets/156_NAVC.3__session-invariants.md` (manifest row 156, round 5)
- **Normative loads:** `docs/post-spa-disposition-spec.md` §4 (REQ-NAVC-17/18/20/22 —
  corrected cites `page-sessions.ts:157,173-174,213-226`) + §3 REQ-NAVT-4 ordering note /
  REQ-NAVT-5 (`data-page-session`) / REQ-NAVT-7 second half;
  `docs/research/r5_a5_dormant-machinery.md` (F7 registry hazard, F4 two-clocks, F11/F12);
  `docs/build/runs/NAVC.2.md` (sibling — `data-nav-count` half of the observability contract)
- **Base:** `stevevitali/navc-2-settle-contract` tip @ `0e1aebd` + orchestrator boundary commit
  `40cc4c8` (the chain's true head; PR base = navc-2 branch)
- **Branch:** `stevevitali/navc-3-session-invariants` (mergePolicy=OPERATOR — never merge)
- **Harness:** devin-desktop/swe-2-high/subagent
- **Skills:** implement-spec + build-memory @ `~/agent-skills` (`e981ec5`)
- **Requirement ids stamped:** REQ-NAVC-17 REQ-NAVC-18 REQ-NAVC-20 REQ-NAVC-22
  REQ-NAVT-5(emission half) REQ-NAVT-7(page-session row half)
- **Started:** 2026-10-15T12:43Z · **Closed:** 2026-10-15T13:20Z — impl `47d807d` + closeout
  `7ca5a6e`; PR #178 (mergePolicy OPERATOR — unmerged); ci pending at closeout
  (first-read class)
- **Config:** full rigor (ledger + self-review + gap analysis + tests + evidence report);
  **Live stage: none**; **Production mutations: none**; metered spend **$0**;
  zero prod writes, zero deploys, zero merges

## Deferrals read

`docs/tickets/DEFERRALS.md` read first (protocol). No OPEN row is scoped to the session/registry
machinery — NAVC.3 lands no live legs and no operator prerequisites; nothing closes this run.
Known flake already recorded (do not re-record): `live-clients/src/ingest.test.ts` `waitMs:1`
parallel-load flake.

## Requirements (from the contract + spec §4)

1. **REQ-NAVC-17** — registry destroy-identity: generation check (`entries.get(key)===entry`)
   inside the `destroyEntry`/timer callback; `release` no-op on map miss (and on identity
   mismatch — the phantom-release arm); `rekey`'s `destroyEntry(toKey)` must not evict a HELD
   target (refs check — a held target refuses the rekey outright, before `rebind`). Regression
   tests name each previously-reachable kill path.
2. **REQ-NAVC-18** — per-surface Query freshness policy driven by which twin GETs carry
   mark-read/view side effects; the per-twin parity decision recorded here (below);
   `projectPageQuery` gets the nonzero staleTime R10's warm-return zero-twin-GET assert needs;
   dossier/report twins keep mark-read parity vs document nav.
3. **`data-page-session` emission** (REQ-NAVT-5 half) — `<bootNonce>.<seq>` minted per registry
   entry, stamped on `[data-page-root]`.
4. **REQ-NAVC-20 + Q-A4-2** — per-document boot intact under client navs; the 30 s session
   re-verify + 401 → `/login` doc-nav + `refetchType:"none"` pinned by test; auth'd responses
   carry `no-store` (the bfcache posture — pin it if absent).
5. **REQ-NAVT-7 (page-session row)** — `data-page-session` dom-contract row lands with the
   emitter + assertion in this PR.
6. **REQ-NAVC-22** — StrictMode + real-router-hop dom tests: listener counts, timers,
   EventSource/observers, the registry across leaves, the `published`-flag wrong-projectId
   window, SSE reconnect churn, stale `<html data-project>`.

### Side-effecting twin GET census (the REQ-NAVC-18 input — verified by grep)

| twin GET | side effect on the shared composition | freshness decision |
|---|---|---|
| `GET /bff/p/:slug` (`projectPageQuery`, server.ts:5197 → `projectOverviewComposition`) | `gate.presence_timer_shown` mint per composition with a live presence gate (server.ts:3732) | **accept-stale** — `staleTime: 120_000` (the keep-alive window, `PAGE_SESSION_IDLE_TTL_MS`). A warm-return paint off the cache does not re-mint the shown event — the mint tracks "a composition was served", not "a pixel painted"; recorded per spec |
| `GET /bff/p/:slug/review/:runId` (`dossierQuery` → `dossierComposition`) | `markInboxRunRead` + `run.report_viewed` + per-finding `finding.viewed` + `secondread.opened` (server.ts:4583-4597) | **compensate-by-refetch** — `staleTime` stays 0: every mount re-fires the twin GET, identical to document-nav parity (each document open re-marked + re-emitted). The twin GET IS the read-receipt leg |
| `GET /bff/p/:slug/r/:runId` (`runReportQuery` → `runReportComposition`) | `markInboxRunRead` (server.ts:4731) | **compensate-by-refetch** — `staleTime` 0, same reasoning |
| `GET /bff/p/:slug/run` (`projectRunSheetQuery` → `runSheetComposition`) | `voice.staleness_shown` mint when the pill action is `update_voice` (server.ts:1396) | **compensate-by-refetch** — `staleTime` 0: a shown-mint per open is the document parity; the sheet's live state wants fresh reads anyway |
| every other twin (`/bff/app`, settings, voices, `/v/:v`, `/a/:id`, `/revisions/:cid`, diff, export, usage, inbox, …) | none (grep-verified: `emit(`/`markInbox*`/`postAnalyticsEvent` appear in no other GET composition) | unchanged `staleTime` 0 — no warm-return requirement; conservative default |
| `POST /bff/p/:slug/handoff` (beforeLoad, not query-cached) | `markInboxItemRead` | unaffected — POST, fires per `beforeLoad` verbatim |

Note: `refetchOnWindowFocus` (Query default `true`) re-fires stale twins on focus — with
`staleTime` 0 dossier/report re-mint mark-read on a focus return; that is benign-idempotent
(the api's mark tolerates re-marks) and is today's mounted behavior, unchanged.

## Acceptance criteria (from the contract)

- [x] Registry invariants hold under the named kill paths — tests prove a timer/eviction never
  kills a held entry *(deterministic — `page-sessions.test.ts`, 5 named kill-path tests)*
- [x] `projectPageQuery` round-trips a leave→return within TTL with zero twin GETs;
  dossier/report twins keep mark-read parity — tests + the recorded parity decision
  *(deterministic — `transitions.dom.test.tsx` warm-return leg + census above)*
- [x] StrictMode transition suite green incl. the stale-projectId + SSE-churn cases
  *(deterministic — `transitions.dom.test.tsx` 8/8)*
- [ ] verification green; BUILD_INDEX row + LEDGER advanced; operating clauses met
  *(agentic — universal AC)*

## Plan

1. `spa/page-sessions.ts` — `destroyEntry(key, expected?)` generation check; the idle timer
   callback captures the entry (`destroyEntry(key, entry)`); `release(draftId, expected?)`
   identity no-op; `rekey` refuses a HELD `toKey` BEFORE `rebind` (returns null — the mount's
   `rebase` already treats null as "leave it") and generation-checks the idle eviction;
   `bootNonce` (ctor-injectable, `crypto.randomUUID` default) + per-entry `sessionId`
   (`"<nonce>.<seq>"` — survives `rekey`, differs on destroy+recreate and per boot).
2. `spa/page-mount.tsx` — stamp `data-page-session` on `[data-page-root]` in the view-mount
   effect; `release(held.draftId, held)` identity-passes.
3. `spa/ide/chrome-data.tsx` — `unpublish` arm on the context: a leaf's cleanup resets
   `published` (the F12(b) wrong-projectId window — the bind effect can no longer run under a
   slug-as-projectId placeholder between leaves).
4. `spa/queries.ts` — `projectPageQuery` gains `staleTime`; parity comments on the
   side-effecting twins.
5. `server.ts` — `cache-control: no-store` middleware on session-carrying responses that don't
   already declare a cache policy (auth'd documents + `/bff/*` + `/session`; self-declared
   `immutable` assets + `no-cache` SSE win).
6. `dom-contract.ts` — `data-page-session` row on `editor`, conditional.
7. Tests — `page-sessions.test.ts` (named kill paths + sessionId minting),
   `queries.test.ts` (freshness policy pin), `spa.dom.test.tsx` (401 →
   `refetchType:"none"` + /login pin), `transitions.dom.test.tsx` (REQ-NAVC-22 suite on the
   real routeTree), `spa-shell.test.ts`/`server.test.ts` (`no-store` pins).

## Test matrix (Phase 1.4)

| row | input | expected |
|---|---|---|
| stale idle timer after rekey | release(d1) arms timer → rekey d1→d2 → acquire fresh d1 → fire | fresh entry survives (generation check); wire never destroyed |
| phantom release | release(d1, staleEntry) when map holds a different entry | no-op — refs never decrement the wrong entry |
| release map-miss | release of an absent draft | no-op (already true — pinned) |
| rekey onto HELD target | held d_base → held d_target | rekey returns null; `rebind`/`destroy` never called |
| rekey onto idle target | idle d_target | destroyed (existing semantics preserved) |
| sessionId mint | two acquires + rekey | `"<nonce>.1"`/`"<nonce>.2"`; unchanged across rekey; fresh registry ⇒ fresh nonce |
| `data-page-session` emission | mount PageMount in PageEditor chrome | `[data-page-root]` stamped `<nonce>.<seq>`; stable across StrictMode remount |
| projectPageQuery TTL | cached-then-leave→return within TTL | zero twin GETs (staleTime pin + a router-level round-trip leg) |
| dossier/report parity | `dossierQuery`/`runReportQuery` | `staleTime` 0 pinned (refetch-per-mount = mark-read per open) |
| boot lifecycle | navs across leaves | `getSpaBoot()` identity stable; `sessionQuery.staleTime === 30_000` pinned; 401 twin → `invalidateQueries({refetchType:"none"})` + `/login` doc-nav |
| no-store | authed shell GET / `/bff/*` / `/session` | `cache-control: no-store`; self-declared policies (immutable assets, SSE `no-cache`) untouched; anonymous public GETs unstamped |
| published window | `/p/a` → `/p/b` real-router hop | pane-storage key never bound under `b` (the slug) — only `proj_b` |
| listeners/timers | leaf mount → nav away → nav back | add/removeEventListener balanced; `setInterval` handles all cleared |
| SSE churn | framed leaf mounts + nav | exactly one live EventSource per mount; prior one closed on swap |
| stale `data-project` | stamp `data-project="a"`, nav to `/p/b`, then `/app/new` | **FIX arm** (r5_a5 F11 accept-or-fix): `HeadManager` re-stamps the committed route's slug and REMOVES the attr outside `/p/:slug` space — `projectSlugFor` parity (`spa-shell.ts:145-148`) |

## Progress

- 2026-10-15T12:43Z — Phase 0 complete: DEFERRALS read (no NAVC-scoped OPEN rows; the
  `live-clients` `waitMs:1` flake already recorded); LEDGER read (`nextTicket: NAVC.3`,
  `chainTip: navc-2` @ `0e1aebd`); contract + spec §4 + r5_a5 + sibling ledger read; anchors
  verified (`page-sessions.ts` destroy/rekey/release arms, `page-mount.tsx` acquire/view/chrome
  effects + `rebase`, `queries.ts:1245-1251` `projectPageQuery` unstaled, `main.tsx:46-49` the
  401 leg, `server.ts` mark-read twins at 4583/4731 + `gate.presence_timer_shown` at 3732 +
  `voice.staleness_shown` at 1396, `chrome-data.tsx` `published` never-reset, `feed.ts` SSE
  bind, `dom-contract.ts` manifest + `check-dom-contract.mjs` scan rules).
- 2026-10-15T12:43Z — anchor drift recorded: the r5_a5 cite `page-mount.tsx:470-476` "rebase
  arm's `entries.delete`" is stale — the current rebase runs `registry.rekey` (the map delete
  lives inside `rekey` itself). The cited kill path (a release-armed timer firing
  `destroyEntry(key)` over a re-acquired entry) is reachable today via
  release→rekey→reacquire-at-old-key; the generation check closes it.
- 2026-10-15T13:05Z — Phase 1/2 landed: `page-sessions.ts` gains the `destroyEntry(key,
  expected?)` generation check + entry-keyed idle-timer callback (`entry.refs===0` re-check +
  lazy `entry.key` so a rekeyed idle entry still dies at TTL under its new key) +
  `release(draftId, expected?)` identity no-op + `rekey`'s held-target refusal BEFORE `rebind`
  + `bootNonce`/`sessionId` mint; `page-mount.tsx` stamps `data-page-session` on the view-mount
  effect (removed on view cleanup) and identity-passes the held entry to `release`;
  `chrome-data.tsx` `useIdeChromeData` cleanup now `unpublish()`es (the `published` flag falls
  between leaves — the F12(b) window); `queries.ts` `projectPageQuery` gains
  `staleTime: PAGE_SESSION_IDLE_TTL_MS` + per-twin parity comments; `head.tsx` re-stamps/removes
  `data-project` per committed route; `server.ts` authed-response `no-store` floor middleware
  (handler-declared policies win verbatim); `dom-contract.ts` `data-page-session` row
  (conditional, editor surface). Focused suites green: `page-sessions.test.ts` 15,
  `queries.test.ts` 4, `transitions.dom.test.tsx` 8, `spa.dom.test.tsx` 26, `spa-shell.test.ts`
  30.
- 2026-10-15T13:10Z — transition-suite calibration (recorded, not silent): (a) happy-dom's
  `window`/`document` don't share `EventTarget.prototype` — the listener counter spies the four
  methods directly; (b) the mounted leaf legitimately co-owns `window:keydown` with the IDE
  chrome, so assertions are balance/accumulation-shaped not count==1; (c) two per-boot
  singletons (router scrollRestoration `pagehide` + QueryClient FocusManager `visibilitychange`)
  survive a leaf leave BY DESIGN — the test names them explicitly rather than asserting zero;
  (d) `dossierQuery`/`runReportQuery` `staleTime:0` under StrictMode double-mount can amplify a
  landing count — the parity assert is monotone (each landing ADDS GETs), never exact.
- 2026-10-15T13:15Z — verification: `turbo build lint typecheck` **135/135**; web focused suites
  all green; `check:dom-contract` OK (editor surface 50 emitted/asserted incl.
  `data-page-session`); `check:spa-env` OK (115 client files — the `queries.ts`→`page-sessions.ts`
  import leaks nothing); `check:spa-budget` OK (entry 202.7/250 kB — registry singleton rides
  the main chunk inside ceiling); `check:licenses`/`check:protocol-markers`/`check:no-cookies`
  OK. `pnpm test`: **5,670 pass / 4 skip / 1 fail** — the single failure is
  `apps/run-task/src/privsep.docker.test.ts`, a Docker Desktop containerd metadata-db I/O error
  (`write .../meta.db: input/output error`) — the daemon cannot build ANY image; the diff
  touches no Dockerfile/run-task code; reproduced standalone (environmental, not a code
  regression; `docker info` healthy, every build attempt fails identically).
- 2026-10-15T13:15Z — self-review (2 passes): (1) `rekey` held-target refusal runs before
  `rebind` (wire never repoints on refusal; `page-mount`'s `rebase` treats null as "leave it" —
  keeps polling the base draft, correct); (2) idle-entry `rekey` keeps its armed timer — the
  callback resolves `entry.key` lazily so it dies under the NEW key (pinned by the stale-timer
  test); (3) `unpublish` inside one commit batches with the successor's `set` (`published`
  never visibly flickers on a leaf swap), while a leave-with-no-successor renders
  `published:false` → controller unbinds; (4) `data-page-session` restamps identical value on
  StrictMode/keep-alive remount (entry identity, not mount identity); (5) `no-store` middleware
  orders after CSP, before every route — redirects via `c.redirect` get stamped, handler-thrown
  error responses (onError path) skip the stamp — accepted, error bodies aren't the bfcache
  surface the floor guards; (6) `data-project` mirrors `projectSlugFor` exactly (slug, not
  projectId; `/p` alone unstamped).

## Gap table

| gap | disposition |
|---|---|
| `privsep.docker.test.ts` — local Docker daemon `meta.db` I/O error blocks the image build | **environmental** — diff touches no run-task/Dockerfile code; reproduces standalone; reported in Evidence report; not a NAVC.3 deliverable (no new deferral — the defect is the workstation's containerd store, not a ticket arm) |
| `stale data-project` accept-or-fix | **fix** landed (head.tsx route-follow + removal); stronger than the accept arm — recorded |
| `data-page-session` on forced-SSR document mounts | n/a — `page.js`/`client/page.ts` don't stamp; the contract row is `conditional` (stamped while a SPA mount's view is bound); correct per REQ-NAVT-5's SPA-mount scope |
| `refetchOnWindowFocus` re-mints mark-read on focus for staleTime-0 twins | unchanged-by-design (document-nav never had a focus arm either; re-mark is idempotent) — noted under the census |
| error responses (`app.onError`) skip the `no-store` stamp | accepted — a thrown handler never reaches the post-`next()` stamp; error bodies aren't the cached-content surface; success + redirect paths covered |
| REQ-NAVC-22's "EventSource/observers" leg — observers | covered by construction: the exercised leaves (`/p/:slug`, `/p/:slug/r/:run`, `/app/new`) instantiate no window/document-scoped Observer — ProseMirror's DOM observer is element-scoped and dies with the removed subtree (the `[data-page-root]`-absence assert is its coverage); the only `IntersectionObserver` users (`showcase-beacon.ts`, the SSR dossier anchor script) live on showcase/SSR documents outside the suite's routes — no leaf observer can leak |

## Evidence log

| claim | evidence |
|---|---|
| REQ-NAVC-17 kill paths closed | `page-sessions.test.ts` — "stale idle timer must never destroy a re-acquired entry", "timer must never destroy a re-HELD entry (cancelled-but-fired)", "phantom release naming a stale draft id", "release on a map miss", "rekey onto a HELD target refuses outright" — 15/15 green |
| REQ-NAVC-18 warm-return zero GETs + mark-read parity | `transitions.dom.test.tsx` L339-389 — leave→return inside TTL re-acquires the SAME entry (same `sessionId`, refs 1→0→1) with `pageGets()` still 1; dossier/report leg asserts monotone twin-GET growth per landing; `queries.test.ts` pins `staleTime` per arm |
| REQ-NAVT-5 emission | `transitions.dom.test.tsx` L348-366 — `data-page-session` matches `/^\S+\.\d+$/`, equals `entry.sessionId`, stable across keep-alive remount, distinct per entry |
| REQ-NAVC-22 transition suite | `transitions.dom.test.tsx` 8/8 green — registry across leaves, published-flag window (no `rhema:panes:v1:u1:beta-piece` read), listener/interval balance, SSE one-live-at-a-time, boot identity, `data-project` follow/removal |
| REQ-NAVC-20 pins | `spa.dom.test.tsx` — 401 → `invalidateQueries({queryKey:sessionQuery.queryKey, refetchType:"none"})` + `navigateDocument("/login")` + session cache cleared; `queries.test.ts` `sessionQuery.staleTime===30_000`; `transitions.dom.test.tsx` — `getSpaBoot()` same instance across hops |
| no-store floor | `spa-shell.test.ts` 4 tests — authed shell/`/session`/`/bff/*` → `no-store`; immutable asset + favicon policies verbatim; anonymous requests unstamped |
| full verification | `turbo build lint typecheck` 135/135 · `pnpm test` 5,670 pass/4 skip/1 env-fail (docker daemon) · all seven `check:*` green |

## Evidence report

**Registry invariants (REQ-NAVC-17).** Every internal destroy now passes the entry it decided on
through `destroyEntry(key, expected)` — a slot that changed hands since the decision is left
alone; the idle timer's closure captures the entry AND re-checks `refs===0` at fire time (the
cancelled-but-dispatched race), resolving `entry.key` lazily so a rekeyed idle entry still dies
under its new key; `release` no-ops on a map miss and on an identity mismatch (the phantom-
release arm); `rekey` refuses a HELD target before `rebind` — `page-mount`'s rebase treats the
null as "leave it". Five named kill-path tests pin each arm deterministically on a manual
clock/scheduler.

**Freshness (REQ-NAVC-18).** The census above records every per-twin parity decision:
`projectPageQuery` accept-stale at the keep-alive TTL (the router-level leg proves zero twin
GETs on a warm return while the handoff POST still refires); dossier/run-report/run-sheet twins
compensate-by-refetch at `staleTime` 0 so each mount re-fires the mark-read/view GET —
document-nav parity verbatim.

**Observability (REQ-NAVT-5 + REQ-NAVT-7 row).** `data-page-session="<bootNonce>.<seq>"` mints
per registry entry (nonce per document boot, seq monotonic), stamps `[data-page-root]` while the
view is bound, survives rekey/StrictMode/keep-alive remount verbatim; manifest row +
assertion in this PR (`check:dom-contract` green).

**Lifecycle (REQ-NAVC-20 + Q-A4-2).** One `SpaBoot` per document (identity pinned across hops);
`sessionQuery` 30 s re-verify pinned; the 401 leg pins `invalidateQueries({refetchType:"none"})`
+ `/login` document navigation; every authenticated response that didn't declare a cache policy
carries `no-store` (bfcache floor; immutable assets/SSE/favicon win verbatim; anonymous
requests unstamped).

**Transitions (REQ-NAVC-22).** 8 StrictMode + real-router-hop legs green: registry leave/return
with held-entry preservation, listener+interval balance modulo the two NAMED per-boot
singletons (scrollRestoration `pagehide`, FocusManager `visibilitychange`), exactly-one-live
EventSource across SSE churn, the `published`-flag wrong-projectId window closed (`unpublish`
arm — no `rhema:panes:v1:u1:<slug>` storage key ever read/written), `<html data-project>`
following the committed route (fix arm of F11).

**Environment note.** `pnpm test` shows one failure outside the diff's blast radius:
`apps/run-task/src/privsep.docker.test.ts` — the local Docker daemon's containerd metadata db
returns `input/output error` on any `docker build` (reproduced standalone; `docker info` is
healthy). No run-task/Dockerfile code changed; classified environmental, reported not
re-recorded (not a ticket arm).
