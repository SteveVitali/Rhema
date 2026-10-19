# Rhēma — Post-SPA disposition spec (round 5)

*Status: RATIFIED 2026-10-15 — all §10 rulings taken as recommended (Q-ECON.e=server-default+opt-outs, Q-ECON.f=~$60 headroom, Q-POSTURE=posture-first, Q-5=confirm-after-dry-run + literal DROP closes; remaining register rows ratified as recommended). Synthesized 2026-10-15 from the
round-5 research ledger (`docs/research-ledger.md`, 22 rows) + `docs/research/r5_*.md`;
adversarial review O2 returned REVISE with 22 findings — all dispositioned in this revision
(the per-finding log lives in `docs/research/r5_o2_review-dispositions.md`). Amends
`docs/frontend-spa-spec.md` §7/§14 and `docs/rhema-design-spec.md` where named. REQ ids are
normative; `⚑` marks operator-ruling surfaces. Decomposition proceeds under the ratified rulings.*

Round 4's chain is live on prod at `ffbb8ad`: the SPA shell serves every authenticated
document, public funnel + forced-SSR Page family still serve SSR, all free journey legs
pass-or-owe-by-design, N9 reseated and green. This spec dispositions the remainder: the
nav-mechanism defect the renderer contract could not see, the funded-window cost regime, the
owed-leg substrate, the ops residuals, the memory/spec hygiene tail, and the disposition of
every open backlog + deferral row (the committed census: `docs/research/r5_g1_dispositions.md`).

## §0 — Scope and ⚑ constraints (operator rulings, carried verbatim)

- ⚑ Authenticated intra-app client navigation is a round-5 workstream (the deployed SPA's links
  doc-nav — a spec letter-deviation; `frontend-spa-spec.md` §7 names `router.navigate` but no
  mechanism was ever specified).
- ⚑ The eval/benchmark track (BL-40/41/42/43/44/45, corpus procurement) is OUT of this round.
- ⚑ Funded-window cost reduction precedes any new funded window; the next window opens under
  the §5 regime only.
- ⚑ BL-38 prod test-data residue cleanup is delegated to the build driver.
- ⚑ Operator owns all merges (BL-01) and every §10 ruling.

**Explicitly DEFERRED this round (enumerated, per O2-Finding-3):** BL-31 matcher floor;
BL-39 partner program; BL-40/43/44/45 eval+benchmark family; BL-47/76/77/84 standing ADR
watches; BL-73 spec-scheduled `1.x` Later scope (33 matrix rows, spec-verified REQ-MEM-10);
D-P0.06-3 distroless rebuild; D-P0.12-3; D-P0.13-*; D-P0.14-*; D-P0.15c-4; D-PRB.02-2;
D-ECON.1-2 (findings_cap upstream input); D-ECON.2-5/-2-7; corpus rows homed to BL-40.
Deferral = a named later track, not a drop.

## §1 — Verified findings the spec is built on (evidence index)

- `data-renderer`/`data-route`/`data-mounted` verify *which* document rendered, never *how* the
  browser arrived — the observability gap that let zero-client-routing ship (A4-F1,
  `settle.ts:170-174`).
- `apps/web/src/spa/` carries **zero** `<Link>` imports; ~95 in-tree `<a href>` emit sites;
  no delegated interceptor exists (A1).
- `router.getMatchedRoutes(pathname)` is the only correct arbitrary-path in-tree test;
  `spaRouteFor`'s prefix fallback misclaims non-document GETs (`/p/:p/export/ai-use/{md,docx}`,
  `/app/settings/data/export/download`, `/usage.csv`) → interception via `spaRouteFor` would
  kill downloads at a client 404 (A1-F7/A2; verified O2).
- `SsrHandoff` `location.assign` becomes a Back-loop under client navs (transient commit +
  push-assign = forward bounce) — mutation-redirect navs already hit it rarely today; it
  becomes pervasive the day interception ships (A3-§4, O2-corrected phrasing).
- Side-effecting loaders (`postProjectHandoff` POST, `postConfirmEmail` token, mark-read twin
  GETs) make blanket intent-preload unsafe (A5-F3) — no preload ships.
- `PageSessionRegistry` destroy-identity defect: `release`'s destroy timer and `rekey`'s
  `destroyEntry(toKey)` evict/kill entries with no identity or refs check
  (`page-sessions.ts:157,173-174,213-226` — corrected cites per O2-F13); the invariant is "a
  destroy timer or eviction must never kill a held or re-acquired entry" (generation check
  `entries.get(key)===entry` + `release` no-op on map miss). Must land before the keep-alive
  leg can be trusted (A5-F7, mechanism restated O2-F13).
- All paid legs already pin `modelTier:"base"` — the tier label is at floor; the real levers
  are intra-tier routing + seeded artifacts + enforced caps (B2-F10, B3).
- **Two guard defects:** (i) `seedDeliveredRunReport` writes `source='proxy'` usage rows
  ≈$12.33 fictional spend per seed — both guards sum fixture fiction (B3-F3); (ii)
  `funded-window.mjs:87-91`'s cumulative round-cap query has **no `is_test`/`source` filter** —
  it counts all prod spend incl. the operator's own (O2-F11). REQ-ECON-6 covers both.
- The weekly guard fails OPEN without `JOURNEY_DATABASE_URL` (`spend-guard.ts:36-38`,
  `cli.ts:141-147`) — correct for scheduled CI, wrong for operator `--paid` (B3-F2).
- Per-leg caps are declared, never enforced (`stb5b.ts:236-243` — B3-F1, O2-verified).
- Prod test-tenant spend ≈$153.60/30d vs the ~$150 bound; cache-read tokens dominate
  (72–87M vs ~3M input); editor-family phases ≈85% of spend (B1).
- The two DEFERRALS checkers disagree by construction (priority-scan vs positional); ~50 rows
  carry final-truth-DONE cells that parse OPEN/PARTIAL forever — upstream fix is the only full
  resolution (E-F1/F2/F3).
- G2/G3/H3 amendments are already folded into `rhema-design-spec.md`; all 33 MISSING matrix
  rows are spec-scheduled `1.x` (E-F8/F12). The nav deviation is the one real spec gap (E-F10).
- Every open BL row (55) + owed deferral row (~203) has a disposition — the full table is
  committed in `docs/research/r5_g1_dispositions.md` (O2-F2 resolved).
- P1.dossier root-caused: Chromium's native UA-CH (`?0` on desktop UA) overrides the leg's
  `sec-ch-ua-mobile` extraHTTPHeader → `device=desktop` → compact=false → bulk mounts
  (proven live; `device.ts:15-16` reads the header). Harness defect; fix = real mobile UA.
- D-OBS.1-2(a) soak closed 10-15 (0 warnings, full window); alert Path A proven live
  (`slo_violation` POSTs land at the catcher every 5 min with 200s — recorded on D-P1.22-2).
- Scheduled-nightly green is merge-dependent: `github.sha` = `main` HEAD ≠ deployed `ffbb8ad`
  until the merge sweep lands (D-F9).
- `BL-29` headline: the single biggest lever is the convert-svc live-vs-IaC
  `cpu-throttling:"false"` drift (~−$44/mo) — reconcile the out-of-band state first (D1-F3).

## §2 — Client-side navigation completion (stream A)

**§2.1 Mechanism (REQ-NAVM-1/2).** ONE delegated `click` listener on `document`, bubble phase,
installed by `mountSpa` in `spa/main.tsx` — never `createSpaRouter` (keeps the 14 router-direct
dom suites un-intercepted). No component ports; `<a href>` markup unchanged on both renderers.
NavLink/hybrid refuted (PM `toDOM` anchors have no React element; `@rhema/ui` renders under
`StaticRouter` where TanStack `<Link>` throws).

Ordered pipeline (normative):
`closest("a[href]")` → `e.defaultPrevented` → `button!==0` → modifier keys →
`contenteditable` ancestor → `target` (absent or `_self` only — Link parity; O2-F21) /
`download` / `data-spa-native` → `new URL` origin test (fail closed) → hash-only
same-path+same-search skip (native fragment nav; MUST NOT re-fire `beforeLoad`) →
`router.getMatchedRoutes(pathname)` in-tree (with `**` predicate) → `RELOAD_STUB_IDS`
membership → `preventDefault` + `router.navigate({href: pathname + search + hash})`.

**§2.2 History + stubs (REQ-NAVM-3/4).** Clicks always push (doc-nav parity); the interceptor
never emits `replace`; `resetScroll` is never overridden (router defaults + `scrollRestoration`
own it — O2-F22). `RELOAD_STUB_IDS = {"/_authenticated/app/usage/r/$runId",
"/_authenticated/p/$project/edit/$draftId", "/_authenticated/p/$project/f/$fid"}` (all three
carry the `/_authenticated/` prefix — `routeTree.gen.ts:804,818,825`; O2-F14) short-circuit to
`navigateDocument` — matched by route id, NOT `spaRouteFor` (which would misclassify the
`/settings`/`/app/settings` *client* redirects into doc-navs). `e.isTrusted` never checked.

**§2.3 Renderer boundary (REQ-NAVM-6).** The interceptor NEVER consults the boot `surfaces`
map, `deviceClass`, `isSpaEnabled`, `twinForcesSsr`, or `spaRouteFor().surfaces` — interception
is unconditional once in-tree; leaf pipelines own every renderer verdict, and the
`postProjectHandoff` beforeLoad POST must fire exactly as on document entry.

**§2.4 SsrHandoff fix (REQ-NAVM-5).** `dom.ts` gains `spaRuntime.replace` +
`replaceDocument(href)`; `SsrHandoff` calls it. **Blast radius (O2-F10):** ~12 dom suites spy
`spaRuntime.assign` for handoff assertions — they migrate to the `replace` seam in the same PR;
the spec requires `navigateDocument`/`replaceDocument` share one observable seam so tests
assert "document nav happened" without caring which.
Mid-`beforeLoad` `redirect({reloadDocument:true})` arms (`p.$project.index.tsx:37-40`,
`p.$project.v.$v.tsx:37,60`) fire mid-navigation under interception — their history-slot
behavior (replace committed vs eat host entry) is pin-verified at `@tanstack/react-router@
1.170.40` in the REQ-NAVT-8 suite and folded into REQ-NAVC-23's tested acceptance (O2-F12).

**§2.5 Hash gap (REQ-NAVM-10).** Native hash-only clicks never reach router state →
`nav.hash`-keyed effects (`selectFinding`, `controller.ts:1151-1154`) don't fire where a doc
reload applied the selection today. Compensate via a `hashchange` listener in the controller
(recommended) — recorded decision.

**§2.6 Preload (REQ-NAVM-7, absorbing A5-REQ-NAVC-7).** Ship none. A follow-up delegated
`pointerover`/`focusin` + `PRELOAD_SAFE` routeId allowlist (per-route certified
side-effect-free beforeLoad+loader) is a separate ticket with pin-verified `preloadRoute`
stage coverage. *(A5's REQ-NAVC-7 is merged here — O2-F6.)*

**§2.7 Opt-out hook (REQ-NAVM-8 + A1-REQ-NAVC-13).** `data-spa-native` manifest row + emitters
on the three non-document GETs (`data-usage-csv`, `data-export-download`, and the un-hooked
`export/ai-use/*` pair) on BOTH renderers; interceptor test asserts skip.

**§2.8 Pre-existing defect.** `state-map.ts:130,246` emit `/voices/<personaId>` (no such route;
`/v/:persona` is real) — dead-link fix ticket rides the stream.

**§2.9 Head duties (REQ-NAVM-9).** Title/h1-or-hash-target focus/announce/`data-route`/
`data-mounted` stay with `HeadManager` + router defaults; the interceptor adds no
scroll/focus/title logic. The `.ide-page` inner-scroller case lives in REQ-NAVC-16.

**stopPropagation audit (recorded, O2-F22):** the only `stopPropagation` in `spa/` is a keydown
(`controller.ts:894`) — nothing starves a document click listener. Synthesized `.click()`s
(`controller.ts:1056-1060`) are ordinary activations — correctly intercepted.

## §3 — Verification contract (REQ-NAVT-1..8)

- **REQ-NAVT-1** — `data-nav-count` on `<html>`: `"0"` stamped on EVERY served document
  (`render.tsx` SSR + `spa-shell.ts` shell — the reset is the detector, so SSR documents must
  carry it too; O2-F18); incremented once per committed in-document location transition by
  HeadManager (push/replace/pop count; hydration doesn't). `navKey` semantics on replace/pop/
  hash commits are pinned by the REQ-NAVT-8 dom suite (Q-A4-1/6 — implementation-level).
- **REQ-NAVT-2** — `data-mounted` is REMOVED while `isLoading` and re-stamped on resolution.
- **REQ-NAVT-3** — `settleClientNav` / `settleDocumentNav` + `SettleScope.documentLoads`.
  **O2-F20 correction:** the document-response watcher at `runner.ts:189-240` is gated on
  `deps.expectRenderer != null` today — the counter must run unconditionally (un-gate the
  listener install), not a "5-line" add-on.
- **REQ-NAVT-4** — `R10` free nightly leg: `/app` → click `/p/:slug` → click
  `a[data-edit-source]` → `/p/:slug/v/working` → Back; asserts monotone `data-nav-count`,
  `documentLoads===1`. **Ordering (O2-F5):** the warm-return zero-twin-GET assert depends on
  REQ-NAVC-18's freshness policy landing a nonzero `staleTime` for `projectPageQuery`
  (`queries.ts:1245-1251` is unstaled today → mount refetches every return) — R10 lands AFTER
  NAVC-18, and the spec records the mark-read parity decision per surface (serving a stale
  dossier twin skips `markInboxRunRead`/`finding.viewed` — accept-or-compensate per twin).
  `paid:false`, `expected:"red"` until first live leg; `project-home`+`editor` gates.
- **REQ-NAVT-5** — `R10.keepalive`: `data-page-session="<bootNonce>.<seq>"` minted per registry
  entry on `[data-page-root]`; unchanged across leave→`/app`→return within
  `PAGE_SESSION_IDLE_TTL_MS` (120 s) AND the semantic undo arm (synced marker is Ctrl+Z-removable
  post-round-trip — impossible on a re-seeded EditorState). Requires REQ-NAVC-17's registry fix
  landed first (was "§4.2" — corrected O2-F15). The `/p/:slug`-vs-`/v/working` draft-identity
  question (Q-A4-4) is implementation-level — the away hop stays on `/app` regardless.
- **REQ-NAVT-6** — Mechanism pinned both directions; `settleNav` stays mechanism-agnostic; no
  existing leg flips mechanism silently.
- **REQ-NAVT-7** — dom-contract rows `data-nav-count` (**all-documents required** — O2-F18) +
  `data-page-session` (editor, conditional) land with emitters + assertions same-PR.
- **REQ-NAVT-8** — `spa/intercept.dom.test.tsx`: synthetic clicks over the real `routeTree`
  covering every A1/A2 decision row + the reloadDocument-redirect history-slot verification +
  `navKey` semantics pin.

## §4 — Dormant-machinery obligations (REQ-NAVC-16..23 — corrected map, O2-F6)

*(A5 emitted REQ-NAVC-7..15 colliding with A1's 7..13. Renumbering: A5-7 → merged into
REQ-NAVM-7 (§2.6); A5-8..15 → REQ-NAVC-16..23. REQ-NAVC-24 does not exist.)*

- **REQ-NAVC-16** (A5-8) — Scroll contract verified: back/forward restore, top-on-push,
  hash-target vs HeadManager focus precedence; enumerate `resetScroll:false` navs (`?triage`,
  `[`/`]` stepping); `.ide-page` inner-scroller.
- **REQ-NAVC-17** (A5-9) — Registry invariants under client navs, INCLUDING generation-checked
  destroy + `release` no-op on map miss (the §1 defect).
- **REQ-NAVC-18** (A5-10) — Per-surface Query freshness policy driven by which twin GETs carry
  mark-read/view side effects; **lands before R10** (REQ-NAVT-4 ordering).
- **REQ-NAVC-19** (A5-11) — Keymap semantics preserved under real client navs.
- **REQ-NAVC-20** (A5-12) — Boot/session lifecycle: per-document boot; 30 s session re-verify;
  401 → `/login` doc-nav; `refetchType:"none"` load-bearing.
- **REQ-NAVC-21** (A5-13) — Head/settle contract: pending semantics, announce policy for
  same-title/replace navs, hash-target-over-h1 focus, generic-title parity.
- **REQ-NAVC-22** (A5-14) — Transition-level testing (StrictMode + real router hops);
  `published`-flag wrong-projectId window; SSE reconnect churn; stale `<html data-project>`.
- **REQ-NAVC-23** (A5-15, extended O2-F12) — Server-owned boundaries restated as tested
  acceptance: `reloadDocument` stubs, `SsrHandoff`, `navigateDocument` for `/login`/external/
  binaries; `/app` precedence skip; **the mid-`beforeLoad` reloadDocument-redirect history-slot
  semantics pinned** (A3-OQ1).

## §5 — Test economics regime (stream B; REQ-ECON-1..13, REQ-FND-*)

**§5.1 The guard defects first (REQ-ECON-6, extended O2-F11).** Seeders must not pollute the
meter of record: `source='proxy'` rows written by journey seeders carry an exclusion marker
(`provider_request_id` prefix `req_jrn_` or `source='seed'`) and **every** guard SQL excludes
them — enumerating `spend-guard.ts:61-67` (weekly), `funded-window.mjs:82-91` (weekly) AND
`funded-window.mjs:87-91` (cumulative — which today additionally lacks the `is_test`/`source`
filter entirely; pin cumulative scope to flagged-tenant `source='proxy'` rows, matching the
weekly query, unless ⚑ the operator declares total-prod-spend semantics).

**§5.2 The intra-tier routing arm (REQ-ECON-1/2/3/4/5/10/11/12).** New `CogsLevers.testCheapRoute`
key: ON ⇒ all four phase classes resolve main-context to `claude-haiku-4-5`. Honored only on
`is_test` via `resolveCogsLevers`; frozen into `inputs.cogsLevers` + `input_snapshot`.
**REQ-ECON-5 restored (O2-F7):** rollups grouping by `model_tier` must join the frozen input
snapshot or read `usage_records.model` — never infer served model from tier label
(`model_tier='base'` + `model='claude-haiku-4-5'` rows exist by design under the arm).
For UI-launched legs, an is_test-scoped server default (`COGS_LEVERS_TEST` env) makes cheap
routing default-on with per-leg `testCheapRoute:false` opt-outs — mandatory for B19C;
candidate-excluded for N6/R4 (model judgment is the assert). ⚑ Q-ECON.e rules the posture;
⚑ Q-ECON.a (capCredits re-derivation at effective model) joins the register.

**§5.3 Enforced caps (REQ-ECON-7/9).** `finishLeg` asserts `meteredUsd ≤ capUsd` — overrun is a
distinct verdict that pauses the window. **Basis (O2-F19): caps are stated on the
levered-expected regime** (post-§5.2 arm) with unlevered-measured as the fallback bound where a
leg opts out; floor $0.50. B16 $0.50 · B17 $1.00 · B18A $1.00 · B18B $1.00 · B19A $3.50 ·
B19B $1.50 · B19C $15.00 · N5 $9.00 (proxy-basis +headroom) · N6 $6.00 · N11 $6.50 · R4 $0.50 ·
R6 $4.50 · R9 $0.50 (rides window deliveries) · CITE probes $9.00/probe. `--headroom <legCap>`
required on every dispatch.

**§5.4 Fail-closed guards (REQ-ECON-8/13).** Operator `--paid` requires a system-role DSN (the
no-db attestation applies only to the scheduled cron). Entitlement/`Included` runs count toward
guards unless ⚑ Q-ECON.d rules otherwise.

**§5.5 The window-opening checklist.** System-role DSN + `pg_roles` probe → cumulative <
re-authorized round cap (⚑ Q-ECON.f — $145.95 consumed against the stale $150) → `--headroom`
required → per-leg enforcement → ordering T9 → launchers → riders → B19C last-and-conditional →
`JOURNEY_FUNDED_STABLE_TAG` tenant + purge exemption → REQ-ECON-6 exclusions live first.
Estimated window cost with levers: **~$20–40**.

**§5.6 Funded-leg census (restored — O2-F4; REQ-FND-* family).** The full paid inventory is
`r5_f1_funded-census.md` (21 registry `paid:true` steps: 12 launchers + 9 riders). Beyond the
registry, these ledgered paid items carry into round-5 tickets:

| item | driver status | disposition |
|---|---|---|
| RES.1 excerpt leg (D-RES.1-3, BL-56) | exists | funded leg |
| BL-20 research_burst/chat asserts (D-P1.11-1, D-DEF.1-1) | **no driver exists** | driver-build prerequisite ticket (REQ-FND-7); H7 ruling may moot |
| ECON.2 OFF/ON lever pairs (D-ECON.2-2..4, BL-69) | **no driver exists** | driver-build prerequisite ticket (REQ-FND-7) |
| RES.3 retry-drain (D-RES.3-1, BL-79) | product change first | code ticket → paid verify leg (~$3–5) |
| ADR-086 definitive rate read (D-CITE.1-5, BL-67) | exists | funded leg after cap recon |
| Cost-card refit + restore (BL-68/69, D-ECON.2-6/-7) | operator-paused | register item Q-ruling |

- **REQ-FND-6** — legs scarce on prerequisites consolidate: riders ride the window's own
  deliveries (T15 rides B19A/B's `waiting_gate`; T16 seeds `persona_profiles` or rides B19C;
  R9 rides window deliveries rather than launching its own pair).
- **REQ-FND-7** — non-registry paid work ships a committed driver before the window opens, or
  lands as a driver-build prerequisite ticket in this round's manifest.
- **REQ-FND-8** — no funded run until the operator rules envelope/tenant/duration (§10).

## §6 — Fixture + owed-leg substrate (stream C; REQ-FIX-* — all ids cited per O2-F21)

- **P1.dossier (REQ-FIX-P1D)** — harness fix: the phone context carries a real mobile
  `userAgent` (mint a UA constant; precedent `steps.ts:1211` iPhone context — the
  `JOURNEY_ANDROID_UA` name was wrong, O2-F16) so Chromium emits `sec-ch-ua-mobile: ?1`
  natively. Assert `data-device="phone"` before the bulk count; extend to `[data-apply]` per
  ⚑ Q-1.
- **T17 (REQ-FIX-T17)** — hydration race: leg awaits doc content in `[data-page-view]` before
  the source toggle, or mount defers the affordance until populated (⚑ Q-T17 picks the arm).
- **T12F (REQ-FIX-T12F)** — wait-for-attach or response-status capture so repaint lag can't
  masquerade as a missing notice.
- **T13F (REQ-FIX-T13F)** — seed `{replacement}` suggestion shape + resolvable
  `findings.anchor` on the V2 working head; pin the anchor in `assertShowcaseFixture`.
- **T8 (REQ-FIX-T8)** — guarded backdated `account_exports` mint or purge-exempt 7-day clock
  (⚑ Q-T8); a dedicated DEFERRALS row carries the mint recipe + fire date either way.
- **T15/T16 (REQ-FIX-T15/T16)** — seeded open-gate + `?gate=` focus assert; seeded
  `persona_profiles` or B19C-ride (⚑ Q-ECON.g).
- **T7 destruction (REQ-FIX-BL22-T7DEST)** — clock-owed ~30d; OPEN with fire date ledgered.
- **BL-78 residuals (REQ-FIX-BL78-5B4/5B5/M31)** — mooted-409 substrate; ~$1 paid leg riding
  B19B; entitled-tenant substrate.
- **BL-38 (delegated)** — prod test-data residue cleanup: stale draft, stray provenance/
  deployments row, review account, Library-After-Dark projects — guarded system-role script +
  before/after evidence (⚑ Q-5 confirms the itemized deletions).
- Already-discharged rows are NOT re-emitted (citeproc, quiet-hours, Decisions, T7 enqueue —
  REQ-G1-2).

## §7 — Ops residuals (stream D; REQ-OPS-1..7 + REQ-COST-1..6 renumbered per O2-F1)

*(D1 emitted REQ-OPS-1..6 for cost-posture items colliding with D234's 1..7. Renumbering:
D1's family → REQ-COST-1..6.)*

- **BL-24** — canary pause smoke (REQ-OPS-1); alert page — Path A receipts recorded on
  D-P1.22-2; ⚑ Q-ALERT picks whether Path A satisfies or the NotificationChannel arm
  (`rhema:opsAlertWebhookUrl`) is required (REQ-OPS-2); usercontent CDN-signed headers
  (REQ-OPS-3; ⚑ Q-CDN rules whether api-side minting is product intent or out-of-band suffices);
  first-finding ≤4 min DEFERRED until organic signups exist (REQ-OPS-4 measurement query is
  spec'd now, execution waits for traffic).
- **BL-25/80** — preview legs unblock on ⚑ `rhema-nonprod-resend-api-key` seed; then
  `preview-stack.mjs` recipe → mailbox-minted session → `--invite-code` legs asserting
  `data-renderer`/`data-ssr-cause` only (REQ-OPS-5). Stream-A preview legs (D-SPA.6/12..24-1)
  live in §9's stream-V fold.
- **BL-29 — rewritten verbatim from D1 (O2-F9).** `$285.80` is list-price recomputation, not
  billing (export empty — D-OPS.2-1 is operator's console flip). Headline lever: the
  **convert-svc live-vs-IaC `cpu-throttling:"false"` drift (~−$44/mo, D1-F3)** — reconcile the
  out-of-band state first (REQ-COST-2 codify-or-revert). Then: warm-floor/min-instances
  (REQ-COST-1 billing-read before/after), Cloud SQL tier, proxy MIG sizing, Redis tier — gated
  on a degradation analysis (`RedisHeartbeatStore` has no fallback — removal is a design
  change, REQ-COST-4), GKE run-task node posture, worker right-size with a soak leg
  (REQ-COST-5), §13.5 SLO re-verify after any change (REQ-COST-6), `stages.ts` stage-fact moves
  (REQ-COST-3). ⚑ The architecture-level ruling — *a ~$50 prod cannot run this architecture
  warm; target-vs-posture* (D1-F7, ADR-082 revisit trigger) — joins §10 as Q-POSTURE.
- **BL-36** — nightly golden needs a driver + ~$150–300/night budget ruling (REQ-OPS-7);
  absent-manifest exit-0 is non-evidence.
- **BL-74** — soak DONE (10-15); first scheduled nightly green is merge-dependent (REQ-OPS-6).
- **BL-07** — `unverified_review_rate_7d_pct`=100 pages the catcher every 5 min — classify
  test-tenant-vs-real before remediation (D-SLO.1-5..8; ADR-gated arms).
- **BL-72** — system-DSN convention doc + $0 read.

## §8 — Memory/spec hygiene (stream E; REQ-MEM-1..10)

Status-cell normalization + scripted pre-census (REQ-MEM-1/2) · upstream positional-parser
alignment (REQ-MEM-3) · PHASE LOG rotation convention (REQ-MEM-4) · BUILD_INDEX `ARMB.2` row +
ID-convention alignment (REQ-MEM-5) · **spec fold-back (REQ-MEM-6/7/8):** `frontend-spa-spec.md`
§7 amended to name the interception mechanism + skip-list; §14 gains the dated defect block
(no-interception shipped, Q-scope-1, REQ-NAVC/NAVM/NAVT refs); settle contract extended
(`data-nav-count`); `rhema-design-spec.md` supersession banner gains the settled-mechanism
clause once the round-5 ADR lands · REQ-IDE-20/-21 §-anchor fix (REQ-MEM-9) · BL-73 recorded
spec-verified (REQ-MEM-10).

## §9 — Stream V — post-deploy verification (new, per O2-F8)

The backlog's verification legs get a named stream (resolving the "stream A" collision — G1's
"stream A" meant these):

- **V-1** — `ffbb8ad` SHA-exact composed verification pass: BL-82 + D-SPA.28-1's unrecorded thin
  legs (bundle grep-scan, `--pin-renderer` exit-2) + D-SPACAP.2-1..4 ($0 legs: composed suite,
  two-tenant BFF probe, public-SSR post-deploy diff, zero-CSP walk) + D-SPACAP.3-1 showcase
  forced-SSR in-SPA handoff arm + D-CAP.1-2 zero-uninstrumented-surface leg.
- **V-2** — the preview-leg wave (D-SPA.6/12..24-1) behind the `rhema-nonprod-resend-api-key`
  seed (⚑ BL-80).
- **V-3** — the mooted drill families carry dated per-row DROP closes (⚑ Q-DROP picks
  census-level vs literal closes).

## §10 — Operator decision register (⚑ — ratification gates decomposition)

**Round-shaping rulings:**

| id | question | recommendation |
|---|---|---|
| Q-3 | Mechanism acceptance: delegated document interceptor (§2.1) as THE mechanism | accept — NavLink port is unmeetable |
| Q-POSTURE | Prod cost posture: a ~$50 target cannot run the warm architecture — posture ruling precedes levers (D1-F7) | rule posture first; levers per-change on preview evidence |
| Q-5 | BL-38 itemized deletions confirmed (stale draft, stray provenance row, review account, Library-After-Dark projects) — prod-data destroys | confirm the itemized list in the cleanup script's dry-run output |
| Q-8 | BL-13 metered-pricing flip + unit-econ ruling stays register-only this round | yes — register-only |
| Q-6 | Funded tenant persists across windows (purge-exempt) vs re-mint per window | persist + exempt |
| Q-ECON.d | `source='proxy'` rows on Included/entitlement runs (N5) count toward guards? *(absorbs former Q-N5)* | yes — real provider spend |
| Q-ECON.a | Cheap-routed runs re-derive `capCredits` at effective model? | defer — over-provisioned cap is the safe direction today |
| Q-ECON.e | Haiku arm posture: per-leg opt-in vs is_test server default (`COGS_LEVERS_TEST`) | server default + explicit opt-outs |
| Q-ECON.f | Round envelope re-authorization (levers estimate ~$20–40 vs $150 stale bound) | re-authorize ~$60 with headroom |
| Q-ECON.g | T16 substrate: seeded `persona_profiles` vs B19C-first | seed — unblocks independent of window |
| Q-ECON.h | CITE probe caps: raise to measured (~$9) or reshape | raise with justification |
| Q-ECON.b | `model_tier='base'` + `model='haiku'` semantic: acceptable, or add a `routed` marker column | acceptable — REQ-ECON-5's join rule covers it |

**Leg-level rulings:**

| id | question | recommendation |
|---|---|---|
| Q-1 | Extend P1.dossier assert to `[data-apply]`? | yes — same probe |
| Q-T8 | T8: guarded backdated-row mint vs 7-day clock + purge exemption | guarded mint (fixture rows only) |
| Q-T17 | T17: leg-side wait vs product-side deferred seed | leg-side wait; product deferral only if the race survives |
| Q-SHA | D-SPACAP.2-1 SHA-exactness: one `ffbb8ad` re-run ($0) or accept deploy-series | one re-run — it costs nothing |
| Q-DROP | D-SPAF.*-3/-4 + preview drills: census-level DROP or literal per-row dated closes | literal per-row closes (cheap, cleaner audit) |
| Q-ALERT | BL-24 alert arm: catcher receipts (proven) vs literal NotificationChannel | accept Path A evidence |
| Q-CDN | usercontent signed-URL: out-of-band `gcloud` vs api-side minting | verify leg only |
| Q-B17 | B17 `expected:"red"` flag: intended (unreachable arm) or stale | intended — wording flip under BL-02 |

**Operator bundle (REQ-G1-5 — one-session prerequisite set, dispositions only; none gates
decomposition except the Resend seed which gates stream-V-2):** BL-01 merge sweep · BL-80
Resend secret · BL-23 invite mint · BL-33 Stripe live verify · BL-34 admin key · BL-35 pen
test · BL-37 exposure review · BL-13/68 metered-flip + unit-econ · BL-30/75 retro/refund
rulings · BL-50/51 entitlement rulings · BL-41/42 H4/H5 deliverables · D-OPS.2-1 billing-export
flip · D-MAINT.4-1 Google sign-in · X-cite1-leg-cap-recon.

**Carried ledger questions resolved as implementation-level (not operator-facing):**
Q-A4-1/6 navKey semantics (REQ-NAVT-8 dom suite answers); Q-A4-2 bfcache/`no-store` posture
(pin `no-store` on auth'd responses if absent — verify in ticket); Q-A4-4 draft-identity hop
selection (away hop is `/app` regardless); G1's ~4-row parse delta + D-P0.15b-1 cell tail +
jrn-a freshness check (fold into BL-02's scripted census); B17 wording (Q-B17 above); BL-22
wording refresh (folds into stream C); F1's N5 40-min poll cadence + ≤300-word-bound question
(folds into §5.6 census notes).

## §11 — Decomposition boundary

The manifest consumes this spec in stream order: **C-fixture + E-hygiene** are mergeable code
work; **A-nav** lands after NAVC-17's registry fix and carries intra-stream seams (O2: the
NAVC-16..23 sweep is not one ticket — split as: nav-intercept core + settle/contract + registry
invariants + keymap/scroll/head transition tests); **V** is $0 verification legs; **B-economics**
gates **F-funded**; **D-ops** items are operator-clustered where marked. G1's committed
disposition table is the completeness check (REQ-G1-1/2/3/4/5) — `projectStatus` closes only
when every DECOMPOSE row has a ticket and every OPERATOR row a ruling or named owner.
