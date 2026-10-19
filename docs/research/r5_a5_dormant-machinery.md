# R5.A5 — Dormant-machinery audit: what wakes when navs go client-side

**Stream:** A (nav completion) · **Researched:** 2026-10-14 · **Ledger rows:** A5 · Today every nav is a document reload — each surface below has only ever run "fresh boot → teardown at unload."

## Established findings (verbatim highlights; full detail in the agent note)

- **F1** — Router already configured for client navs (`defaultPreload:"intent"`, `scrollRestoration:true`, `notFoundMode:"fuzzy"`, `PendingShell`/`SpaNotFound`/`SpaRouteError` defaults, `main.tsx:35-76`); none of it has ever fired. Activation is a click-gesture change, not config.
- **F2** — `defaultPreload:"intent"` is dead code: zero `<Link>` usages → no intent signals. Parity mechanism = `router.preloadRoute({to})` on `pointerover`/`focusin`.
- **F3 — HAZARD** — If intent preload is installed it fires `beforeLoad`/`loader` side effects on hover: `postProjectHandoff` mark-read POST (`p.$project.index.tsx:15-19`), `postConfirmEmail` one-shot token consumption (`app.settings.account.tsx:26-45`), dossier/run-report twin GETs that mark inbox rows read + emit view telemetry (`server.ts:4711-4741`). `defaultPreloadStaleTime:0` means every intent re-runs the pipeline. "No preload" is the acceptable default; if installed it MUST gate the side-effecting stages.
- **F4** — Router `preloadStaleTime` ≠ Query `staleTime` — two clocks. `ensureQueryData` returns stale cache (`revalidateIfStale` false) → instant re-entry paint then `useQuery` mount-refetch. Side-effect: cached dossier re-entry within gcTime SKIPS `markRunRead`/view events — per-surface accept-or-compensate decision.
- **F5** — `scrollRestoration` semantics + verification list: IDE scrolls in `.ide-page` not window (unhandled); hash anchors race HeadManager focus; which navs keep scroll (`?triage`, `[`/`]`).
- **F6/F7 — REGISTRY** — `PageSessionRegistry` verified sound on the happy path; ONE latent race: `release`'s destroy callback calls `destroy(key)` with no identity check — the rebase arm's `entries.delete` (`page-mount.tsx:470-476`) orphans a held entry → phantom release arms a `destroy(key)` timer → re-entry within 30s acquires a fresh entry at the same key → the stale timer destroys the live wire mid-edit. Fix = generation-check (`entries.get(key) === entry`) or release no-ops on map misses. REQ-NAV-6 keep-alive is real: leave→return <30s reuses EditorState + live wire.
- **F8** — Collab wire survives correctly (registry outside React; delegates rebound per mount; StrictMode double-mount handled — one spurious `cause:"blur"` mint in dev only).
- **F9** — IDE keymap already routes through `router.history.push` (`chrome.tsx:78-86`, reactive `[router,loc]` deps); `?focus=1` mid-life replace leg is dormant code that wakes; `⌘S` single-mint dedupe verified.
- **F10 — HAZARDS in HeadManager** — (a) `data-route` flips at nav START while `data-mounted` NEVER clears → journeys' settle probe passes mid-pending; (b) replace-navs (`?focus=1` strip) re-announce + re-focus h1 mid-flow; (c) client titles stay generic vs SSR's project-named — parity decision.
- **F11** — `data-spa-boot` per-document (static truth, correct); 401 → clear session + `/login` doc-nav verified under client navs; `refetchType:"none"` load-bearing; `<html data-project>` goes stale on cross-project navs (nothing SPA-side reads it — latent probe hazard).
- **F12** — All effects/listeners have matched cleanup. Dormant edges: (a) `rhema:route-*` listeners never dispatched (inert SSR legs); (b) `useIdeChromePublished` `published` never resets → brief wrong-project chord window on cross-leaf swaps; (c) SSE reconnects per framed-leaf mount (was per-document) — churn + transient zero-feed.
- **F13** — `{ok,redirect}` mutation navs already dual-mode correct.
- **F14** — `reloadDocument` stubs re-fire server 302s correctly (two-hop); `/app` showcase-first-open precedence skip is accepted semantics now actually reachable.
- **F15** — Doc reloads masked everything: QueryClient/registry/SSE/IDB/`data-*` all reset at unload. Under client navs the doc lives indefinitely → the test bar is "StrictMode + real router transitions," not fresh mounts.

## Spec requirements emitted (REQ-NAVC-7..15 numbering continued)

- **REQ-NAVC-7** — Intent-preload is opt-in + gated: MUST NOT execute side-effecting stages (enumerated blocklist: handoff POST, confirmEmail, dossier/report twin GETs); verify `preloadRoute` stage coverage at the pinned version; "no preload" acceptable default.
- **REQ-NAVC-8** — Scroll contract: verify back/forward restore, top-on-push, hash-target scroll vs HeadManager focus; enumerate `resetScroll:false` navs; `.ide-page` inner-scroller.
- **REQ-NAVC-9** — Registry invariants under client navs incl. **generation-checked destroy** (the phantom-release kill path `page-sessions.ts:112` + `page-mount.tsx:470-476`).
- **REQ-NAVC-10** — Query freshness policy per surface driven by which twin GETs carry mark-read/view side effects.
- **REQ-NAVC-11** — Keymap semantics preserved under real client navs.
- **REQ-NAVC-12** — Boot/session lifecycle: per-document boot; 30s session re-verify; 401 → `/login` doc-nav; `refetchType:"none"` load-bearing.
- **REQ-NAVC-13** — Head/settle contract: pin `data-route`/`data-mounted` pending semantics, announce policy for same-title/replace navs, hash-target-over-h1 focus, generic-title parity.
- **REQ-NAVC-14** — Transition-level testing: StrictMode + real router hops; `published`-flag window; SSE reconnect; stale `data-project`; `settleNav` must not pass mid-pending.
- **REQ-NAVC-15** — Server-owned boundaries preserved; stub doc-navs + `/app` precedence skip restated as tested acceptance.

## §Q candidates

- preload stage coverage at pinned version (decides where the F3 gate belongs);
- cached-re-entry telemetry parity (per-surface);
- `data-mounted` clear-during-pending (settle honesty vs churn) — **recommend clearing**;
- replace-nav announce/focus policy;
- `data-project` staleness accept-or-fix;
- SSE per-leaf-mount vs chrome-level lifetime;
- registry destroy-identity: fix now vs pin invariant;
- scroll scope decisions.
