# 302_R6SHOT.1 — round-7 bespoke captures (BL-104 burn-down)

**Harness:** devin-cli / swe-2-high · **Layer:** live-executed · **Spend:** $0

**Date:** 2026-11-17 · **Target:** prod @ `739023816efae96fdadb885a4c171f0be097eebc` (provenance PASS on both
origins before and after the walk) · **Spend:** $0 (all legs `paid:false`; registered run reports `spend $0 ≤ $5`)
· **Tenant:** `jrn-a` (`is_test=true`; the flagged journeys tenant — never a real user session)
· **Evidence:** `docs/build/reports/2026-11-17_302_R6SHOT.1/` (98 files)

## What ran

1. **Registered legs at the deployed tip** — `node packages/journeys/dist/cli.js --stage prod
   --expect-sha 73902381… --steps D1.hub,D2.tour,D3.readonly,P1.demo,R11.demo,U1.shell,U2.noreload,
   U3.occlusion,U4.controls,U5.write,U6.chat,U7.import,R8.showcase.spa`
   (`registered-legs/`, 90 files incl. per-step tour captures at 3 widths):
   **11 PASS** — D1.hub, D2.tour, D3.readonly, P1.demo, R11.demo, U1.shell, U3.occlusion, U5.write,
   U6.chat, U7.import, R8.showcase.spa.
   **2 FAIL** — see Findings.
   `U2.noreload` retried once (`registered-legs-u2-retry/`): second failure is a substrate miss
   (waits for `a[href^="/p/untitled-3/review/"]` — jrn-a lacks the leg's expected review-link
   substrate); the nightly's own tenant passes it (run 44119373215, same day). Disposition:
   not discharged here, nightly green stands — substrate gap, not product evidence.
2. **Bespoke demo captures (unauthenticated)** — `demo-legs/` — D1.hub desktop+phone,
   R11.demo doc desktop, P1.demo doc phone, D2.tour step-1, D3.readonly version. Plus the
   earlier demo-tranche probes at the same SHA: allowlisted document + `/bff/` twin 200s,
   405 `demo_read_only` on writes (JSON + form arms), public cache/ETag twins, cookie-stripped
   twins, `data-spa-native`/`data-demo-exit` attribute census (18 spa-native; document exit
   links to `/`, `/signup`, `/login` verified).
3. **`demo_events` census (D-R7DEM.6b-1)** — migration `0061_demo_events.sql` applied on prod
   (`_migrations` 2026-11-05T01:47:37Z); table owner `postgres`; insert function owned by
   `rhema_demo_writer` `SECURITY DEFINER`; grants: writer INSERT+EXECUTE, `rhema_app` EXECUTE-only.
   Sanctioned beacon `POST /a/demo` → HTTP 204 → row `r6shot1-census` observed at
   2026-11-17T20:35:00.035Z.
4. **Bespoke signed-in captures (jrn-a, session minted via the real magic-link interstitial +
   confirm POST — the `test@rhema.tools` mailbox, `__Host-` host-only cookie)** — 31 `B-*` shots
   across inbox, new-project, usage, settings×7, billing-plans, voices×2, run card, findings desk,
   outline editor + promote, figures, import, export, project usage/settings, version doc,
   editor paper, 404 error copy, palette, app light spot; plus `B-shell-{1280,1024,820}` pane
   geometry and `B-dossier` (17 `data-readonly` markers present, `data-nav-count` live).
   Two first-pass probe-shape failures (`B-U1.shell-1440`, `B-dossier`: `probes is not iterable`)
   were a harness bug — object passed where an iterable was expected; corrected, both re-captured
   with DOM probes green. Not a product defect.
5. **Theme arm (D-R7KIT.1-1)** — six dark-theme surface shots (`kit-dark-{app,settings,billing,
   runsheet,export,new}`), light spot checks (`kit-light-{app,billing,settings}`) flipped through
   the real pref seam (`POST /ide/theme` JSON `{appTheme:"light"}` → `data-theme`/`color-scheme`
   probe read `light`/`light`; restored to `dark` after — the earlier `?theme=` URL attempt was a
   no-op and its shots are dark; the form-body POST attempt returned 422, correctly, since the
   endpoint is JSON-only). jrn-a pref write is a normal user action on an is_test tenant.

## Findings

- **F-R6SHOT.1-1 (OPEN)** — `U4.controls` FAIL on prod AND on the same-day nightly (run
  44119373215, different tenant): `<select name="profile" data-md-profile>` on
  `/p/:slug/export` renders native-styled (`appearance=auto`, bg `rgb(245,242,234)`).
  F-13 (250g_R7FIX.7) restored `data-md-profile`/`data-csl-style` as **named GUARD-1
  exemptions** in the native-POST export form — so either the U4 exemption census misses the
  control or the control regressed. Pre-existing (nightly red before this walk); owner: R7
  defect path. Not a 73902381 regression.
- **U3.stopgap** also FAILs on the nightly (`focus view did not engage`) — superseded history
  per journeys AGENTS (`U3.occlusion` is the standing REQ-PANE arm, GATE-ACCEPT.R7). Nightly
  noise, no row.
- **U2.noreload** — flake/substrate on jrn-a (SSE `ERR_ABORTED` on the seeded run's `/events`
  mid-walk; retry hit a missing review-link substrate). Nightly green same day → no finding.

## DEFERRALS dispositions (dated notes appended on each row)

**Discharged (leg green at 73902381 + committed captures):**
D-R7DEM.4b-1, D-R7DEM.5b-1, D-R7DEM.6a-1, D-R7DEM.6b-1, D-R7SHELL.1a-1, D-R7SHELL.1b-1,
D-R7SHELL.1c-1, D-R7PANE.1-1, D-R7SHELL.2-1, D-R7TALK.1a-1, D-R7TALK.1b-1, D-R7HOME.1-1,
D-R7HOME.2a-1, D-R7HOME.2b-1, D-R7WRITE.1a-1, D-R7WRITE.1b-1, D-R7KIT.3a-1, D-R7KIT.3a2-1,
D-R7KIT.3c2-1, D-R7TOUR.2-1, D-R7GUARD.1-1, D-R7DEP.1-2 (R8.showcase.spa arm).

**Partial — dated note, stays OPEN (named residual):**
- D-R7KIT.1-1 — 5/6 surfaces clean + light spot + probe; **export arm blocked by F-R6SHOT.1-1**.
- D-R7DEM.4-1 — legs a/b/d + parity verified; residual: (e) `/bff/demo/asset` PNG content-type,
  (f) `demo.build`↔image SHA read, (g) `?b=<sha>` stale-safety leg.
- D-R7DEM.5-1 — D3.readonly green + captures; residual: `demo-side-effects.js` proxy re-run.
- D-R7RELOAD.1-1 — U2.noreload not discharged (jrn-a substrate; nightly green).
- D-R7TALK.1a-2 — U6.chat green (turn→stream→reply); markdown-in-bubble arm unverified.
- D-R7KIT.3b-1 — run sheet captured; residual: insufficient-funds arm/paywall, gate card mid-run.
- D-R7KIT.3d-1 — findings desk/run card captured; residual: gate card, compare, timeline.
- D-R7KIT.3e-1 — dossier captured + `data-readonly` census; U4 probe arm red (F-R6SHOT.1-1).
- D-R7KIT.3f-1 — 26 of 29 migrated surfaces captured; residual named on row.
- D-R7COPY.1b-1 / D-R7COPY.1c-1 — error-copy + copy seams captured; residual per-row arms.
- D-R7SYNC.1-1 — residual: SPEED-5 timed leg.
- D-R7RO.2-1 — R8.showcase.spa green; residual: signed-in showcase read-only notice captures.
- D-R7PUB.1-1 — residual: landing walk + committed hero recording.
- D-R7DEP.2-2 — dated note: F-15 `ERR_TOO_MANY_REDIRECTS` regression confirmed gone — N1/N3
  legs reach the RH-32 interstitial; outstanding arm is the harness confirm-click
  (F-R6DEP.5-3, journeys-harness ticket).

**Untouched:** paid/operator rows (D-R7DEP.2-1 U6 paid re-dispatch, F-17 funding, BL-86
HUMAN-H8), code rows (D-R7DEM.2c-1→BL-100 parser, D-R7FIX.* defect arms), D-R7DEP.1-1
(U3.stopgap superseded), D-R7DEP.3-1, D-R7DOC.1-1, D-R7RO.1-1 (R8 arm already green; bespoke
showcase captures folded into D-R7RO.2-1 residual).

## Records

- BACKLOG BL-104: dated progress note (rows discharged + residual list).
- LEDGER: F-R6SHOT.1-1 under OPEN FINDINGS; phase-log entry.
- BUILD_INDEX: row 302.

## Continued walk (same ticket, second tranche — 2026-11-17 late)

Additional $0 evidence after the first commit, same target/tenant:

- **`D-R7DEM.4-1` → DONE** — residual arms (c) terminal-404 census, (e) figure-PNG asset
  `image/png` + `immutable` 113651 B, (f) boot `demo.build` ≡ `/healthz` `gitSha`, (g) `?b=<sha>`
  client-appended CDN key + build-keyed twin ETag — all verified live (`dem4-residual-arms.txt`).
- **`demo-side-effects.js` re-run at prod** — `demo-side-effects/` committed. Contract HOLDS:
  zero non-GET except `POST /a/demo` ×20, zero EventSource/WebSocket, zero mutation forms.
  139 violations classified: 100 link-discovery coverage misses on deep routes (enumerated-leg
  coverage green via `D3.readonly`), ~36 fixture-essay by-design 404s, 3 correctly-refused
  `/visualize` 404s. Residual corpus-link question recorded on the row.
- **Second signed-in walk** — `B-review-surface`, `B-run-report`, `B-compare-diff`,
  `B-visualize`, `B-missing-version-picker` (`/v/999` → real rail w/ `· discarded` gaps),
  `B-timeline-tab` (38 ms settle), `B-dossier-{1280,1920}`, `B-source-mode`, `B-keymap-sheet`,
  `B-showcase-signedin`, `B-dossier-phone390` (real iPhone UA).
- **Insufficient-funds arm** — `B-jrn-bl78-mooted-run` renders the insufficient marker on the
  seeded BL-78 substrate.
- **Landing/PUB.1** — `P-landing-hero`, `P-pricing`, `P-cta`, `P-pricing-page`; hero media
  verified live (780 708 B / 13.76 s / muted / loop / lazy, `/demo` entry link).

**Updated dispositions:** 4 additional rows → DONE (`D-R7DEM.4-1`, ``D-R7WRITE.2-1``,
`D-R7COPY.1c-1`, `D-R7PUB.1-1`) — **26 DONE total**; 7 partials narrowed to named residuals
(gate card, refund-CTA/withheld-tooltip/dispositions radios, doc-load timing, phone gate arms,
markdown bubble, F-blocked probe arms, corpus-link coverage question).
