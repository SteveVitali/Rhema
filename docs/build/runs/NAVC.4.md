# NAVC.4 — Nav acceptance: R10 + keepalive legs, scroll/keymap/head, boundary acceptance (run ledger)

- **Spec:** `docs/tickets/157_NAVC.4__nav-acceptance-legs.md` (manifest row 157, round 5)
- **Normative loads:** `docs/post-spa-disposition-spec.md` §3 (REQ-NAVT-4/5) + §4
  (REQ-NAVC-16/19/21/23) + §2.5/§2.9 (REQ-NAVM-9/10);
  `docs/research/r5_a4_nav-verification.md` (R10 arm shape, undo-stack semantic proof,
  TTL=120 s); `docs/build/runs/NAVC.{1,2,3}.md` (siblings — interceptor, settle contract,
  registry/freshness invariants)
- **Base:** `stevevitali/navc-3-session-invariants` tip @ `2bbf9ab` + orchestrator boundary
  commit `a825ea2` (the chain's true head; PR base = navc-3 branch)
- **Branch:** `stevevitali/navc-4-nav-acceptance-legs` (mergePolicy=OPERATOR — never merge)
- **Harness:** devin-desktop/swe-2-high/subagent
- **Requirement ids stamped:** REQ-NAVT-4 · REQ-NAVT-5 (leg half) · REQ-NAVC-16 · REQ-NAVC-19 ·
  REQ-NAVC-21 · REQ-NAVC-23 · REQ-NAVM-9 · REQ-NAVM-10
- **PR:** #179 · **impl head:** `36bcb6e`
- **Started:** 2026-10-15T14:20Z · **Closed:** 2026-10-15T15:15Z — impl `36bcb6e` +
  closeout `8ef3a5a`; PR #179 (mergePolicy OPERATOR — unmerged); ci pending at
  closeout (first-read class)
- **Live stage:** prod (the two authorized `$0` legs only — R10, R10.keepalive,
  `paid:false`, no `--paid`, no other prod writes, no deploys)

## Deferrals read

`docs/tickets/DEFERRALS.md` read first (protocol). No OPEN row is scoped to the nav
machinery — the NAVC.* rows this ticket could conceivably touch all name preview/prod legs
gated on the operator's merge+deploy cadence (the deployed tip is `ffbb8ad`, pre-NAVC), which
this run does not alter. No new deferral is owed: every deterministic deliverable landed; the
prod legs ran and their `owed` outcome is recorded here (an `expected:"red"` registry row's
live failure is the designed owed-reporting arm, not a deferral).

## Requirements (from the contract)

1. **R10** (REQ-NAVT-4) — `/app → click /p/:slug → click a[data-edit-source] →
   /p/:slug/v/working → Back`, asserting route/mounted markers, monotone `data-nav-count`,
   zero document loads past the `/app` baseline, and the warm-return twin-GET policy.
2. **R10.keepalive** (REQ-NAVT-5) — `data-page-session` unchanged across leave→`/app`→return
   inside the 120 s TTL + the semantic undo arm (a synced marker is Ctrl+Z-removable
   post-round-trip — impossible on a re-seeded EditorState).
3. **Scroll/head contract** (REQ-NAVC-16/21) — back/forward restore, top-on-push, hash-target
   vs HeadManager focus precedence, announce policy, `.ide-page` inner-scroller; enumerate the
   `resetScroll:false` navs.
4. **Keymap + hash gap** (REQ-NAVC-19 + REQ-NAVM-10) — controller `hashchange` compensation
   so fragment clicks fire the finding-selection consumer.
5. **Server-boundary acceptance** (REQ-NAVC-23) — tested: reloadDocument stubs, SsrHandoff,
   `/login`/external/binary doc-navs, `/app` precedence skip, mid-`beforeLoad` redirect
   history-slot semantics.
6. **Head duties stay put** (REQ-NAVM-9) — no interceptor-side scroll/title/focus logic;
   review checklist + a DOM test.

## What landed

### Journeys (`packages/journeys`)

- `steps.ts` — `r10ClientChain` (shared head): real `/app` settle → real project-link click
  (Quiet-folded rows opened through `<summary>`) → real `a[data-edit-source]` click →
  `/p/:slug/v/working`; every hop pinned by `settleClientNav` (`data-nav-count` +1 AND
  `documentLoads` flat — the in-page counter plus the harness's unconditional same-origin
  document-response counter are *independent* mechanism proofs). `R10` then pops Back and
  watches the wire: any `GET /bff/p/<slug>` on the warm return fails the leg (the
  `projectPageQuery` accept-stale window NAVC.3 set at `PAGE_SESSION_IDLE_TTL_MS`); the
  handoff POST may still fire (it is the read-receipt, not the twin read).
  `R10.keepalive` types a real synced marker on `/v/working`, waits the ONE sync pill to
  `data-sync-state="synced"`, asserts `data-page-session` survives the fork rekey, hops to
  `/app` (a deliberately non-Page route — the entry goes IDLE and the TTL starts), Backs
  inside the TTL, asserts the SAME session id, then ⌘Z/Ctrl+Z: the marker must leave the
  rendered doc — a re-seeded `EditorState` would show the marker but carry an empty undo
  stack, so only a preserved entry passes.
- `registry.ts` — `R10` + `R10.keepalive` rows: `journey:"returning"`, `expected:"red"`
  (flip on the first live leg over a deployed build carrying the NAVC machinery),
  `paid:false`, `owner:"NAVC.4"`.
- `surface-gates.ts` — `R10` gates `project-home` + `editor`; `R10.keepalive` gates `editor`.
- `registry.test.ts` — expected-id list updated; the id-↔-impl pairing test covers the new
  rows automatically.

### Scroll contract (REQ-NAVC-16)

- `main.tsx` — `scrollToTopSelectors: [".ide-page"]`: the IDE's inner page scroller
  (`packages/ui`'s IdeShell) tops on push/replace commits (`resetScroll !== false`) while the
  generic keyed cache re-applies its position on pop — document-nav parity for the real
  scroller.
- `ide/chrome.tsx` — `IdeChromeNav.push/replace` accept `{resetScroll?: boolean}`; when
  `resetScroll === false` the call routes through `router.navigate({href, resetScroll:false,
  replace?})` (router-owned scroll), else the verbatim `history.push/replace` path is kept.
  Hash-only pushes keep current path+search.
- `ide/controller.ts` — the three island-parity preserved-scroll arms all carry
  `{resetScroll:false}` now: `[`/`]` version stepping (`version-prev/next`), the `?triage`
  toggle on dossier paths, and the `?focus=1` strip (the island's `replaceState` never
  scrolled). **Enumeration:** every `nav.push/replace` call site was audited — the only
  same-document in-place swaps are these three; `goto`/`inbox`/`settings`/`compare-previous`
  pushes are cross-document hops that correctly take the default top-reset. The three arms
  are each pinned by a DOM test.

### Hash-gap compensation (REQ-NAVM-10 + REQ-NAVC-19)

A fragment click the interceptor deliberately skips (hash-only same-path+same-search — §2.1
guard 8) is a native navigation: the browser commits the hash and fires `hashchange`, but the
router's location state never moves, so `opts.nav.hash` stays put and the mount/consume effect
can't see it. The controller now binds ONE shared `consumeFindingHash` consumer fed by both
stacks — the `nav.hash` effect (router-committed fragment hops) and a symmetric
`window` `hashchange` listener reading `window.location.hash` (native hops). Re-selection is
idempotent (`selectFinding` re-stamps the same card), so router hops that fire `hashchange`
too don't double-act. Listener install/remove is symmetric inside the bind effect — StrictMode
double-mount safe; `transitions.dom.test.tsx` now tracks `hashchange` and the balance still
nets to the two named per-boot singletons after leaving a framed leaf.

### Server-boundary acceptance (REQ-NAVC-23)

- `spa.dom.test.tsx` — a mid-document hop onto a `surfaces:null` path hands off through
  `SsrHandoff` (its `replaceDocument` eats the client-committed entry — no forward bounce);
  a hop onto a `reloadDocument` stub doc-navs through its `beforeLoad` (the
  `spaRuntime.assign` seam fires, not the leaf).
- `intercept.dom.test.tsx` — the OQ1 leg already pins the mid-`beforeLoad`
  `reloadDocument` redirect's history-slot semantics (`location.replace` eats the pushed
  slot); the new **REQ-NAVC-23 block** runs `/app` precedence as *tested* acceptance —
  `/app`, `/app?verified=1`, `/app?entry=draft&held=1` in-app clicks all land the leaf
  client-side with parsed params verbatim (the server's `?verified`-mint / carried-intent /
  unopened-Showcase precedence block runs on document entry only — a client hop never asks
  it), and every fetch the leaf may make is asserted `/bff/*` or `/session` (no document GET
  could have re-decided). The flip-side pin: the `data-spa-native` opt-out keeps the same
  href a native document GET — precedence still runs there, by design.
- External + binary navigations: the existing §2.1 rows already cover foreign/opaque origins,
  `download`, `data-spa-native`, and `**`-fuzzy misses — they are restated here as the
  requirement's external/binary arms (unchanged).

### Head duties stay put (REQ-NAVM-9)

Review checklist (all verified — the mechanical half is the DOM test):

- [x] `nav-intercept.ts` owns exactly two effects: `preventDefault` on claimed clicks and
  `router.navigate({href})` / `navigateDocument(href)` — no third responsibility.
- [x] No scroll vocabulary in interceptor code: `scrollTo`, `scrollBy`, `scrollIntoView`,
  `scrollY`, `scrollTop`, `history.scrollRestoration` — absent (comments naming
  `resetScroll`/`scrollRestoration` document non-ownership only; the scan strips comments).
- [x] No focus/title/announce writes: `.focus(`, `document.title`, `aria-live`,
  `data-route-announcer`, `tabIndex` — absent.
- [x] No marker writes: `data-route`/`data-mounted`/`data-nav-count`/`data-renderer` — absent.
- [x] No nav-option overrides: `resetScroll:`/`hashScrollIntoView:`/`viewTransition:` —
  absent (router defaults + `scrollRestoration` own them).
- [x] Ownership stays where it was placed: `HeadManager` (title/focus/announce/markers) and
  the router (`scrollRestoration`, `scrollToTopSelectors`) — unchanged by this diff.
- [x] The DOM test (`intercept.dom.test.tsx` REQ-NAVM-9 block) mechanically pins all of the
  above on the comment-stripped source and fails on any regression.

## Test matrix (what proved what)

| arm | coverage |
|---|---|
| R10 chain + warm return | `steps.ts` `r10ClientChain` + `R10` — live leg (`owed` on the pre-chain deploy; mechanism-pinned for the post-chain tip) |
| R10.keepalive session + undo | `steps.ts` `R10_KEEPALIVE` — live leg (`owed`); `data-page-session` stability, fork rekey, ⌘Z-removes-marker |
| push tops / pop restores (window) | `spa.dom.test.tsx` — "a push tops the window; a Back pop restores the prior position" |
| `.ide-page` inner scroller | `spa.dom.test.tsx` — tops on push AND restores on pop via `scrollToTopSelectors` |
| hash target vs cached window position | `spa.dom.test.tsx` — `scrollIntoView` on the fragment target; cached 300 never re-applied |
| hash target vs h1 focus precedence | `spa.dom.test.tsx` — mid-navigation `#deep` target takes focus over the route h1 |
| `scrollRestoration: manual` | `spa.dom.test.tsx` — the router owns scroll, not the browser |
| same-title announce | `spa.dom.test.tsx` — MutationObserver on added/removed nodes: `removed:<title>` then `added:<title>` — clear-then-set, never silent |
| replace-commit announce | `spa.dom.test.tsx` — same policy, replace arm |
| `[`/`]` version stepping | `ide-chrome.dom.test.tsx` — real keydown → `navigate({href:"/p/alpha/v/2", resetScroll:false})`; inert off `/v/:n` |
| `?triage` toggle | `ide-chrome.dom.test.tsx` — ⌘⇧T on `/p/alpha/review/r9` → `navigate({href:"…?triage=1", resetScroll:false})` and back |
| `?focus=1` strip | `ide-chrome.dom.test.tsx` — `navigate({href:"/p/alpha", replace:true, resetScroll:false})` |
| native `hashchange` selects finding | `ide-chrome.dom.test.tsx` — `#finding-f2` set natively (interceptor-skipped class) still selects the card |
| non-finding hash inert | `ide-chrome.dom.test.tsx` — `#section` never produces a selection |
| listener balance incl. `hashchange` | `transitions.dom.test.tsx` — `TRACKED_TYPES += hashchange`; leave/return nets to the named singletons |
| `/app` precedence skip | `intercept.dom.test.tsx` — three verbatim-param hops land client-side, BFF-only fetches; opt-out keeps document entry |
| SsrHandoff / reload stubs / 401→`/login` / external+binary | `spa.dom.test.tsx` mid-document legs + `intercept.dom.test.tsx` §2.1/REQ-NAVM-4/OQ1 rows |
| REQ-NAVM-9 interceptor purity | `intercept.dom.test.tsx` — comment-stripped source scan |

## Verification results (per command)

| command | result |
|---|---|
| `pnpm turbo build lint typecheck` | **135/135 green** |
| `pnpm test` | **493 files · 5,690 pass / 4 skip / 0 fail** — the NAVC.3-local `privsep.docker` env flake did **not** recur (247 s green) |
| `pnpm check:licenses` | OK — 822 packages |
| `pnpm check:protocol-markers` | OK — 248 public-facing files, no markers |
| `pnpm check:no-cookies` | OK — 257 ingestion-surface files |
| `pnpm check:spa-budget` | OK — all ceilings held |
| `pnpm check:spa-env` | OK — 115 sources / 146 artifacts |
| `pnpm check:dom-contract` | OK — 831 hooks, journey ⊆ manifest ⊆ emitted+asserted (no new hooks needed) |
| focused vitest | `spa.dom` 35 · `intercept.dom` 51 · `ide-chrome.dom` 35 · `transitions.dom` 8 · `registry.test` 7 — all green |
| `check-build-memory.sh` | 0 violations (pre-existing `~` warnings: chain-order note, budget sizes, legacy index values — all inherited, none new) |
| `check-append-only.mjs --base a825ea2` | OK |

## Production legs — run + honest classification

```
node packages/journeys/dist/cli.js --stage prod \
  --steps R10,R10.keepalive \
  --expect-sha 36bcb6e67ceda2404fb638191f076f9f23a65133 \
  --out docs/build/reports/2026-10-15_NAVC.4-r10
```

- **provenance NO-MATCH** — expected `36bcb6e…`; observed web+api `ffbb8ad01b4383…` (the
  pre-NAVC-chain deployed tip, consistent with VERIF.1's live finding). Exit 1 by design
  (`provenanceFailed`), with `report.passed: true` — no green step regressed.
- **R10 → `owed`** — `https://rhema.tools/app` carries no `data-nav-count` stamp: the
  deployment serves a pre-NAVC.2 document, exactly the fail-closed classification the leg
  names in its own error string. $0, no console errors, screenshot preserved.
- **R10.keepalive → `owed`** — same root cause (the chain's shared head gates first).
- Evidence: `docs/build/reports/2026-10-15_NAVC.4-r10/{report.json,R10.png,R10.keepalive.png}`.
- **Honest read:** both rows stay `expected:"red"` — they flip green on the first live leg
  over a deployed build carrying NAVC.2's `data-nav-count` + NAVC.3's registry. No deploy
  was performed or requested; the legs are the authorized $0 arms only.
- `rhema-journeys` bin was not linked in `.bin` this session (`pnpm exec` could not resolve
  it); the CLI was invoked directly via `node packages/journeys/dist/cli.js` — identical
  entrypoint (`"bin": {"rhema-journeys": "./dist/cli.js"}`), package freshly `tsc -b` built.

## Gap table

| gap | disposition |
|---|---|
| R10/R10.keepalive cannot turn green until the NAVC chain deploys | **designed** — `expected:"red"` + `paid:false`; the owed-reporting arm ran and recorded the pre-chain marker absence. No deferral row needed (the registry row IS the tracking) |
| `rhema-journeys` `.bin` not linked on this checkout | environmental — `node dist/cli.js` is the identical entrypoint; `pnpm install` run did not relink it (worktree quirk); recorded |
| `mount()` needed `opts.router` to spy the in-mount `?focus=1` strip | landed — prebuilt-router injection, one test helper only |
| happy-dom's queued `hashchange` reads live `location.hash` at dispatch | handled — the describe `beforeEach` normalizes `#`→`""` + drains a macrotask so a prior leg's queued event can't select a stale finding id |
| REQ-NAVM-9 "review checklist" | satisfied — the checklist above + the mechanical source-scan test (the ticket names both halves) |

## Evidence log

| claim | evidence |
|---|---|
| REQ-NAVT-4 leg wired + mechanism-pinned | `steps.ts` `r10ClientChain`/`R10` (2667-2782): real clicks only, `settleClientNav` on every hop, `documentLoads` flat asserts, `/bff/p/<slug>` GET census on the Back pop |
| REQ-NAVT-5 leg half | `steps.ts` `R10_KEEPALIVE` (2784-2897): synced marker → `/app` idle → Back-in-TTL → same `data-page-session` → ⌘Z removes the marker (semantic undo-stack proof) |
| REQ-NAVC-16 | `main.tsx` `scrollToTopSelectors`; `controller.ts`/`chrome.tsx` `resetScroll:false` on the three in-place arms; `spa.dom.test.tsx` scroll contract ×4 + `ide-chrome.dom.test.tsx` ×3 nav pins |
| REQ-NAVC-19 | `ide-chrome.dom.test.tsx` — keymap chords drive real router commits under `resetScroll:false`; version-step inertness off `/v/:n` pinned |
| REQ-NAVC-21 | `spa.dom.test.tsx` — same-title clear-then-set announce, replace-commit announce, hash-target-over-h1 focus |
| REQ-NAVC-23 | `spa.dom.test.tsx` mid-document SsrHandoff + reloadDocument-stub legs; `intercept.dom.test.tsx` `/app` precedence block + OQ1 history-slot pin + §2.1 external/binary rows |
| REQ-NAVM-9 | checklist above + `intercept.dom.test.tsx` "nav-intercept.ts carries no scroll/focus/title/marker logic (source scan)" |
| REQ-NAVM-10 | `controller.ts` `consumeFindingHash` + `hashchange` listener (symmetric, StrictMode-safe); `ide-chrome.dom.test.tsx` native-hash selection + inert-hash legs; `transitions.dom.test.tsx` listener balance |
| full verification | table above — all green; prod legs recorded honest-owed under `reports/2026-10-15_NAVC.4-r10/` |

## Gap-analysis status

No code-bearing gap. The single behavioral debt is environmental/deployment-ordered — the two
registry rows stay `red` until a build carrying the NAVC chain is deployed; their first green
flip is a registry `expected` edit with the report path, exactly as VERIF.1 did for
R6F/T12F/T13F/T17.
