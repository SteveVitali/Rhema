# Rhēma — Post-SPA disposition spec (round 5)

*Status: DRAFT pending adversarial review + operator ratification (§9). Synthesized 2026-10-15
from the round-5 research ledger (`docs/research-ledger.md`, all 22 rows green) and the
`docs/research/r5_*.md` note set. Amends `docs/frontend-spa-spec.md` §7/§14 and
`docs/rhema-design-spec.md` where named; the operator-decision register (§9) ratifies before
decomposition. REQ ids are normative; `⚑` marks operator-ruling surfaces.*

Round 4's chain is live on prod at `ffbb8ad`: the SPA shell serves every authenticated
document, public funnel + forced-SSR Page family still serve SSR, all 42 free journey legs
pass-or-owe-by-design, N9 reseated and green. This spec dispositions the remainder: the
nav-mechanism defect the renderer contract could not see, the funded-window cost regime, the
owed-leg substrate, the ops residuals, the memory/spec hygiene tail, and the disposition of
every open backlog + deferral row.

## §0 — Scope and ⚑ constraints (operator rulings, carried verbatim)

- ⚑ Authenticated intra-app client navigation is a round-5 workstream (the deployed SPA's links
  doc-nav — a spec letter-deviation, `frontend-spa-spec.md` §7 names `router.navigate` but no
  mechanism was ever specified).
- ⚑ The eval/benchmark track (BL-40/41/42/43/44/45, corpus procurement) is OUT of this round.
- ⚑ Funded-window cost reduction precedes any new funded window; the next window opens under
  the §3 regime only.
- ⚑ BL-38 prod test-data residue cleanup is delegated to the build driver.
- ⚑ Operator owns all merges (BL-01) and every §9 ruling.
- Out of scope (restated): backend data-model changes beyond named residuals; product redesign;
  §16.4 marketing claims; re-litigating landed ADRs.

## §1 — Verified findings the spec is built on (evidence index)

- `data-renderer`/`data-route`/`data-mounted` verify *which* document rendered, never *how* the
  browser arrived — the observability gap that let zero-client-routing ship (A4-F1, `settle.ts:170-174`).
- `apps/web/src/spa/` carries **zero** `<Link>` imports; ~95 in-tree `<a href>` emit sites;
  no delegated interceptor exists (A1).
- `router.getMatchedRoutes(pathname)` is the only correct arbitrary-path in-tree test;
  `spaRouteFor`'s prefix fallback misclaims non-document GETs (`/p/:p/export/ai-use/{md,docx}`,
  `/app/settings/data/export/download`, `/usage.csv`) → interception via `spaRouteFor` would
  kill downloads at a client 404 (A1-F7/A2).
- `SsrHandoff` `location.assign` becomes a Back-loop under client navs (A3-§4: transient commit
  + push-assign = forward bounce) — a live bug the day interception ships.
- Side-effecting loaders (`postProjectHandoff` POST, `postConfirmEmail` token, mark-read twin
  GETs) make blanket intent-preload unsafe (A5-F3) — no preload ships.
- `PageSessionRegistry` phantom-destroy race: `entries.delete` on a held entry → release arms a
  `destroy(key)` timer that kills a re-acquired live entry within the 120 s TTL
  (`page-sessions.ts:112`, `page-mount.tsx:470-476`) — must be generation-checked before the
  keep-alive leg can pass reliably (A5-F7).
- All paid legs already pin `modelTier:"base"` — the tier label is at floor; the real lever is
  intra-tier routing + seeded artifacts + enforced caps (B2-F10, B3).
- `seedDeliveredRunReport` writes `source='proxy'` usage rows ≈$12.33 fictional spend per seed —
  both spend guards sum fixture fiction (B3-F3). This is a defect, REQ-ECON-6.
- The weekly guard fails OPEN without `JOURNEY_DATABASE_URL` (`spend-guard.ts:36-38`) — correct
  for scheduled CI, wrong for operator `--paid` (B3-F2).
- Per-leg caps are declared, never enforced (B3-F1).
- Prod test-tenant spend ≈$153.60/30d vs the ~$150 bound; cache-read tokens dominate
  (72–87M vs ~3M input); editor-family phases ≈85% of spend (B1).
- The two DEFERRALS checkers disagree by construction (priority-scan vs positional); ~50 rows
  carry final-truth-DONE cells that parse OPEN/PARTIAL forever — upstream fix is the only full
  resolution (E-F1/F2/F3).
- G2/G3/H3 amendments are already folded into `rhema-design-spec.md`; all 33 MISSING matrix rows
  are spec-scheduled `1.x` (E-F8/F12). The nav deviation is the one real spec gap (E-F10).
- Every open BL row (55) + owed deferral row (~203) has a disposition (G1 — the table is the
  close artifact).
- P1.dossier root-caused: Chromium's native UA-CH (`?0` on desktop UA) overrides the leg's
  `sec-ch-ua-mobile` extraHTTPHeader → `device=desktop` → compact=false → bulk mounts.
  Harness defect; the fix is a mobile `userAgent` (C4-addendum).
- D-OBS.1-2(a) soak closed 10-15 (0 warnings, full window); alert Path A proven live
  (slo_violation POSTs land at the catcher every 5 min with 200s).
- Scheduled-nightly green is merge-dependent: `github.sha` = `main` HEAD ≠ deployed `ffbb8ad`
  until the merge sweep lands (D-F9).

## §2 — Client-side navigation completion (stream A)

**§2.1 Mechanism (REQ-NAVM-1/2).** ONE delegated `click` listener on `document`, bubble phase,
installed by `mountSpa` in `spa/main.tsx` — never `createSpaRouter` (keeps the 14 router-direct
dom suites un-intercepted). No component ports; `<a href>` markup unchanged on both renderers.
The NavLink/hybrid alternatives are refuted (PM `toDOM` anchors have no React element;
`@rhema/ui` renders under `StaticRouter` where TanStack `<Link>` throws).

Ordered pipeline (normative):
`closest("a[href]")` → `e.defaultPrevented` → `button!==0` → modifier keys →
`contenteditable` ancestor → `target`/`download`/`data-spa-native` → `new URL` origin test
(fail closed: externals, `javascript:`/`data:`/`mailto:`) → hash-only same-path+same-search
skip (native fragment nav; MUST NOT re-fire `beforeLoad`) → `router.getMatchedRoutes(pathname)`
in-tree (with `**` predicate) → `RELOAD_STUB_IDS` membership → `preventDefault` +
`router.navigate({href: pathname + search + hash})`.

**§2.2 History + stubs (REQ-NAVM-3/4).** Clicks always push (doc-nav parity); the interceptor
never emits `replace`. `RELOAD_STUB_IDS = {/_authenticated/app/usage/r/$runId,
/p/$project/edit/$draftId, /p/$project/f/$fid}` short-circuit to `navigateDocument` — matched
by route id, NOT `spaRouteFor` (which would misclassify the `/settings`/`/app/settings` client
redirects into doc-navs — a regression). `e.isTrusted` is never checked.

**§2.3 Renderer boundary (REQ-NAVM-6).** The interceptor NEVER consults the boot `surfaces`
map, `deviceClass`, `isSpaEnabled`, `twinForcesSsr`, or `spaRouteFor().surfaces` — interception
is unconditional once in-tree; leaf pipelines own every renderer verdict, and the
`postProjectHandoff` beforeLoad POST must fire exactly as on document entry.

**§2.4 SsrHandoff fix (REQ-NAVM-5).** `dom.ts` gains `spaRuntime.replace` +
`replaceDocument(href)`; `SsrHandoff` calls it — the doc absorbs the transient commit entry and
Back returns to the host page. Correct for the initial-mount leg too.

**§2.5 Hash gap (REQ-NAVM-10).** Native hash-only clicks never reach router state →
`nav.hash`-keyed effects (`selectFinding`, `controller.ts:1151-1154`) don't fire where a doc
reload applied the selection today. Compensate via a `hashchange` listener in the controller
(recommended) — the spec records the decision.

**§2.6 Preload (REQ-NAVM-7).** Ship none. A follow-up delegated `pointerover`/`focusin` +
`PRELOAD_SAFE` routeId allowlist is a separate ticket with pin-verified stage coverage.

**§2.7 Opt-out hook (REQ-NAVM-8/REQ-NAVC-13).** `data-spa-native` manifest row + emitters on
the three non-document GETs (`data-usage-csv`, `data-export-download`, and the un-hooked
`export/ai-use/*` pair) on BOTH renderers; plus an interceptor test asserting skip.

**§2.8 Pre-existing defect.** `state-map.ts:130,246` emit `/voices/<personaId>` (no such route;
`/v/:persona` is real) — a dead-link fix ticket rides the same stream.

## §3 — Verification contract (stream A verification; REQ-NAVT-*)

- **REQ-NAVT-1** — `data-nav-count` on `<html>`: `"0"` stamped per served document
  (`render.tsx` + `spa-shell.ts` htmlAttrs); incremented once per committed in-document
  location transition by HeadManager (push/replace/pop count; hydration doesn't). A document
  load lands `0` — the reset IS document-nav detection.
- **REQ-NAVT-2** — `data-mounted` is REMOVED while `isLoading` and re-stamped on resolution —
  `[data-route][data-mounted]` means "resolved leaf," never mid-pending (fixes every existing
  settle false-pass).
- **REQ-NAVT-3** — settle.ts gains `settleClientNav` / `settleDocumentNav` +
  `SettleScope.documentLoads` (runner-maintained same-origin document-response count).
  `settleClientNav` asserts nav-count `n0+1` AND zero document loads; the mirror asserts a doc
  load. `settleNav`/`gotoOk`/`reloadSettled` stay mechanism-agnostic.
- **REQ-NAVT-4** — `R10` free nightly leg: `/app` → click `/p/:slug` → click
  `a[data-edit-source]` → `/p/:slug/v/working` → Back; asserts monotone nav-count,
  `documentLoads===1`, zero re-issued `/bff/p/:slug` twin GETs on the warm return.
  `paid:false`, `expected:"red"` until first live leg; on `project-home`+`editor` surface gates.
- **REQ-NAVT-5** — `R10.keepalive`: `data-page-session="<bootNonce>.<seq>"` minted per registry
  entry on `[data-page-root]`; unchanged across leave→`/app`→return within
  `PAGE_SESSION_IDLE_TTL_MS` (120 s) AND the semantic arm: a synced typed marker is
  Ctrl+Z-removable after the round-trip (impossible on a re-seeded EditorState). Requires the
  §4.2 registry fix landed first.
- **REQ-NAVT-6** — Mechanism pinned both directions: R10 owns client-nav proof; stub/download/
  `/logout`/external hops may pin `settleDocumentNav`; no existing leg flips mechanism silently.
- **REQ-NAVT-7** — dom-contract rows `data-nav-count` (shell, required) + `data-page-session`
  (editor, conditional) land with emitters + assertions same-PR.
- **REQ-NAVT-8** — `spa/intercept.dom.test.tsx`: synthetic clicks over the real `routeTree`
  covering every A1/A2 decision row — modifiers, `button`, `defaultPrevented`, `target`,
  `download`, cross-origin, in-tree, stub short-circuit, hash-only, `?`-delta, PM anchors, the
  three non-doc GETs, `data-spa-native`.

## §4 — Dormant-machinery obligations (stream A residuals; REQ-NAVC-16..24, renumbered from A5's colliding 7..15)

- **REQ-NAVC-16** (was A5-8) — Scroll contract verified: back/forward restore, top-on-push,
  hash-target vs HeadManager focus precedence; enumerate `resetScroll:false` navs; `.ide-page`
  inner-scroller.
- **REQ-NAVC-17** (was A5-9) — Registry invariants under client navs, INCLUDING the
  generation-checked destroy (`page-sessions.ts:112` + `page-mount.tsx:470-476` phantom-release
  kill path — fixed before `R10.keepalive` can be trusted).
- **REQ-NAVC-18** (was A5-10) — Per-surface Query freshness policy driven by which twin GETs
  carry mark-read/view side effects.
- **REQ-NAVC-19** (was A5-11) — Keymap semantics preserved under real client navs (`IdeChromeNav`
  `[router,loc]` reactivity, `?focus=1` strip, `?triage`, `#finding` ticks, `⌘S` dedupe).
- **REQ-NAVC-20** (was A5-12) — Boot/session lifecycle: per-document boot; 30 s session re-verify;
  401 → `/login` doc-nav; `refetchType:"none"` load-bearing.
- **REQ-NAVC-21** (was A5-13) — Head/settle contract: pending semantics, announce policy for
  same-title/replace navs, hash-target-over-h1 focus, generic-title parity.
- **REQ-NAVC-22** (was A5-14) — Transition-level testing (StrictMode + real router hops);
  `published`-flag wrong-projectId window; SSE reconnect churn; stale `<html data-project>`.
- **REQ-NAVC-23** (was A5-15) — Server-owned boundaries restated as tested acceptance:
  `reloadDocument` stubs, `SsrHandoff`, `navigateDocument` for `/login`/external/binaries;
  `/app` precedence skip.

(A1's REQ-NAVC-7..13 stand as emitted: in-tree-test-only, unconditional forced-SSR interception,
hash-skip, defaultPrevented-first, stub interception, verbatim href, manifest discipline.
A2's REQ-NAVC-1..6 stand: getMatchedRoutes, Link-guard mirroring, origin fail-closed,
navigate({href}), stub semantics, settle hook.)

## §5 — Test economics regime (stream B; REQ-ECON-1..13)

**§5.1 The defect first (REQ-ECON-6).** Seeders must not pollute the meter of record:
`source='proxy'` rows written by journey seeders carry an exclusion marker
(`provider_request_id` prefix `req_jrn_` or `source='seed'`) and every guard SQL excludes them.
`seedDeliveredRunReport` violates this today (~$12.33/seed) — fixed BEFORE any seeded-artifact
leg runs in-window.

**§5.2 The intra-tier routing arm (REQ-ECON-1/2/3/4/10/11/12).** New `CogsLevers.testCheapRoute`
key: ON ⇒ all four phase classes resolve main-context to `claude-haiku-4-5`
(`options.ts:181-183` + `buildAgentRoster` override + `runspec.ts:636` scoped launch). Haiku is
already allowlisted + priced ($1/$5 + 0.1× cache-read → ~3× on the dominant cache-read class).
Honored only on `is_test` via `resolveCogsLevers`; frozen into `inputs.cogsLevers` +
`input_snapshot`. For UI-launched legs, an is_test-scoped server default (`COGS_LEVERS_TEST`
env → `resolveCogsLevers({defaults})`) makes cheap routing default-on with per-leg
`testCheapRoute:false` opt-outs — mandatory for B19C and candidate-excluded for legs where the
model judgment IS the assert (N6, R4). ⚑ Q-ECON.e rules opt-in vs server-default posture.

**§5.3 Enforced caps (REQ-ECON-7/9).** `finishLeg` asserts `meteredUsd ≤ capUsd` — a
cap-overrun is a distinct verdict that pauses the window. Re-derived caps (measured +~40%
headroom, floor $0.50): B16 $0.50 · B17 $1.00 · B18A $1.00 · B18B $1.00 · B19A $3.50 ·
B19B $1.50 · B19C $15.00 · N5 $9.00 · N6 $6.00 · N11 $6.50 · R4 $0.50 · R6 $4.50 · R9 $0.50 ·
CITE probes $9.00/probe. `--headroom <legCap>` required on every dispatch.

**§5.4 Fail-closed guards (REQ-ECON-8/13).** Operator-driven `--paid` requires
`JOURNEY_DATABASE_URL` bound to a system-role DSN (the no-db attestation applies only to the
scheduled self-bounding cron). Entitlement/`Included` runs count toward guards (they are real
provider spend) unless ⚑ Q-ECON.d rules otherwise.

**§5.5 The window-opening checklist.** System-role DSN + `pg_roles` probe → cumulative < round
cap (⚑ Q-ECON.f re-authorizes the bound — $145.95 already consumed) → `--headroom` required →
per-leg cap enforcement → ordering T9 → launchers → riders → B19C last-and-conditional →
`JOURNEY_FUNDED_STABLE_TAG` tenant + purge exemption → REQ-ECON-6 exclusion live first.
Estimated window cost with levers: **~$20–40** (was ~$150 bound).

## §6 — Fixture + owed-leg substrate (stream C; REQ-FIX-*)

- **P1.dossier** — harness fix: the phone context carries a mobile `userAgent`
  (`JOURNEY_ANDROID_UA` knob, `steps.ts:28`) so Chromium emits `sec-ch-ua-mobile: ?1` natively —
  the `extraHTTPHeader` is overridden by Chromium's own UA-CH (proven live: header-only →
  `device=desktop`, `bulk=1`). Assert `data-device="phone"` before the bulk count so the next
  miss self-classifies; extend to `[data-apply]` per ⚑ Q-1.
- **T17** — hydration/settle race (collab-bound Y.Doc starts empty; the source toggle can
  appear before canonical markdown lands): leg awaits doc content in `[data-page-view]` before
  toggling, or the mount defers the affordance until populated — REQ-FIX-T17.
- **T12F** — one logged re-run classifies repaint-race vs POST failure (`stb5a.ts:1193-1194`
  `count()` immediately after `waitForURL`); REQ-FIX-T12F wait-for-attach or response capture.
- **T13F** — seed needs `{replacement}` suggestion shape + a resolvable `findings.anchor` on
  the V2 working head.
- **T8** — genuinely clock/operator-data: purge-exempt tenant + 7-day wait, OR a guarded
  hand-dated expired `account_exports` row (⚑ Q-T8 mint-authority choice; either needs no
  schema work).
- **T15** — seeded open approval gate + `?gate=` focus assertion.
- **T16** — seeded `persona_profiles` row or ride B19C's funded voice build (⚑ Q-ECON.g).
- **T7 destruction half** — clock-owed (~30d); stays OPEN with the fire date ledgered.
- **BL-78 residuals** — D-STB.5b-4 (mooted-409 substrate), D-STB.5b-5 (~$1 paid, rides B19B),
  D-MAINT.3-1 (entitled-tenant substrate).
- **BL-38** — prod test-data residue cleanup (delegated): stale draft, stray deployments row,
  review account, Library-After-Dark projects — a guarded system-role cleanup script +
  before/after evidence.
- Already-discharged rows are NOT re-emitted (citeproc, quiet-hours, Decisions, T7 enqueue —
  per C5; REQ-G1-2).

## §7 — Ops residuals (stream D; REQ-OPS-1..7)

- **BL-24** — canary-injection pause smoke (planted deny → durable claimed `pause_signals` row →
  `waiting_gate`; REQ-OPS-1); alert page — Path A now evidenced (catcher receipts recorded on
  D-P1.22-2); ⚑ whether Path A satisfies the AC or the literal NotificationChannel arm
  (`rhema:opsAlertWebhookUrl`) is required (REQ-OPS-2); usercontent CDN-signed headers
  (REQ-OPS-3 — may carry an api-side minter code gap, ⚑ OQ); first-finding ≤4 min blocked on
  organic signups + a pinned measurement query (REQ-OPS-4) — DEFER until traffic exists.
- **BL-25/80** — preview legs unblock on ⚑ `rhema-nonprod-resend-api-key` seed (one operator
  act); then `preview-stack.mjs` recipe → mailbox-minted session → `--invite-code` journeys with
  `data-renderer`/`data-ssr-cause` asserts only (REQ-OPS-5).
- **BL-29** — prod cost posture: `$285.80` is list-price recomputation, not billing (export
  empty); levers = warm-floor/min-instances, SQL tier, proxy MIG, Redis, off-hours — each needs
  before/after measurement + SLO re-verify + ⚑ pre-authorization ruling (Q-7).
- **BL-36** — nightly golden needs a driver + ~$150–300/night budget ruling (REQ-OPS-7);
  absent-manifest exit-0 is non-evidence.
- **BL-74** — soak DONE (10-15 close recorded); first scheduled nightly green is
  merge-dependent on `main` catching `ffbb8ad` (REQ-OPS-6).
- **BL-07** — SLO breaches: `unverified_review_rate_7d_pct`=100 is paging the catcher every
  5 min — classify test-tenant-vs-real before remediation (D-SLO.1-5..8 carry ADR-gated arms).
- **BL-72** — system-DSN convention doc + $0 read.

## §8 — Memory/spec hygiene (stream E; REQ-MEM-1..10)

- Status-cell normalization: canonical leading `**STATUS (date) —` prefixes on the ~50
  never-flip cells (Rhēma-local, append-only-safe) + scripted pre-census (REQ-MEM-1/2).
- Upstream `check-build-memory.sh` positional-parser alignment (REQ-MEM-3 — patch list for
  `agent-skills`).
- BUILD_INDEX `ARMB.2` row + ID-convention alignment (REQ-MEM-5).
- PHASE LOG rotation convention (~87.6% of limit) (REQ-MEM-4).
- **Spec fold-back (REQ-MEM-6/7/8):** `frontend-spa-spec.md` §7 amended to name the
  interception mechanism + skip-list; §14 gains the dated defect block (no-interception
  shipped, Q-scope-1 ruling, REQ-NAVC/NAVM/NAVT refs); settle contract extended
  (`data-nav-count`). `rhema-design-spec.md` supersession banner gains one clause naming the
  settled mechanism once the round-5 ADR lands.
- REQ-IDE-20/-21 §-anchor fix (REQ-MEM-9); BL-73 recorded spec-verified (REQ-MEM-10).

## §9 — Operator decision register (⚑ — ratification gates decomposition)

| id | question | recommendation |
|---|---|---|
| Q-1 | Phone dossier contract: read-only phone confirmed — extend the P1.dossier assert to `[data-apply]` too? | yes — same probe |
| Q-T8 | T8 expiry: guarded backdated-row mint vs honest 7-day clock + purge exemption | guarded mint (dates on fixture rows only) |
| Q-6 | Test-tenant/funded-window persistence: does the funded tenant persist across windows (purge-exempt) or re-mint per window? | persist + exempt |
| Q-ECON.d | Do `source='proxy'` rows on Included/entitlement runs (N5) count toward guards? | yes — real provider spend |
| Q-ECON.e | Haiku arm posture: per-leg opt-in vs is_test server default | server default + explicit opt-outs |
| Q-ECON.f | Round envelope re-authorization (levers estimate ~$20–40 vs the $150 bound) | re-authorize at ~$60 with headroom |
| Q-ECON.g | T16 substrate: seeded `persona_profiles` vs B19C-first ordering | seed — unblocks independent of window |
| Q-ECON.h | CITE probe caps: raise to measured (~$9) or reshape | raise with justification |
| Q-7 | Which prod cost levers are pre-authorized vs per-change approval? | per-change on preview evidence |
| Q-T17 | T17 ownership: leg-side wait vs product-side deferred-seed | leg-side wait first; product deferral only if the race survives |
| Q-SHA | D-SPACAP.2-1 SHA-exactness: one `ffbb8ad` re-run ($0) or accept deploy-series? | one re-run — it's $0 |
| Q-DROP | D-SPAF.*-3/-4 + preview drill DROPs: census-level disposition or literal per-row dated closes? | per-row dated closes (cheap, cleaner audit) |
| Q-A4-1/6 | `navKey` semantics on replace/pop/hash (pinned-version) | dom test answers — not operator-level |
| Q-A4-2 | bfcache/`no-store` posture on auth'd responses | verify + pin `no-store` if absent |
| Q-CDN | usercontent signed-URL minting: out-of-band `gcloud` vs api-side code gap | verify leg only; no new product surface |
| Q-ALERT | BL-24 alert arm: catcher receipts (proven) vs literal NotificationChannel page | accept Path A evidence |
| Q-N5 | does N5's "Included" usage count against the weekly guard? | yes (same as Q-ECON.d) |

## §10 — Decomposition boundary

The manifest consumes this spec in stream order: **C-fixture + E-hygiene + A-nav** are
mergeable code work first (nav lands last within A since it changes every document's nav
semantics); **B-economics** gates **F-funded**; **D-ops** items are operator-clustered where
marked. G1's disposition table is the completeness check — `projectStatus` closes only when
every DECOMPOSE row has a ticket and every OPERATOR row a ruling or named owner.
