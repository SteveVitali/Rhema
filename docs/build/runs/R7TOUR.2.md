# R7TOUR.2 — re-pin the SPD guided tour on the final R7b surfaces + the sidebar Demo entry

- **Ticket:** `docs/tickets/248_R7TOUR.2__tour-re-pin.md` (row 248, round 7 / R7b)
- **Branch:** `stevevitali/r7tour-2-repin` (forked off `stevevitali/r7ro-2-phone-reader` @ `aae1196c`)
- **Base:** `stevevitali/r7ro-2-phone-reader`
- **Harness:** devin-desktop/swe-2-high/subagent
- **Spend:** $0 — Stage A only (GD-PREVIEW.R7: no per-ticket preview; D-R7TOUR.2-1 carries Stage B → 250)
- **Opened:** (UTC `date -u` at write)
- **Closed:** run record + boundary read complete

## Phase status

| Phase | Status |
|---|---|
| 0 setup + DEFERRALS scan | done — `D-R7COPY.1a-1` was **not opened** by 244 (its run record: no `demo.*` leaf carried a banned term; `BANNED_INTERNAL_TERM_ALLOW` empty) — nothing to close |
| 1 plan + test matrix | done — below |
| 2 implement | done |
| 3 self-review | done |
| 4 gap analysis vs ticket | done — below |
| 5 verification | done — all green at this head |
| 6 records + PR + ci read + ledger advance | in progress |

## Plan

1. **Re-pin the 11 beats** (REQ-TOUR-2). R7b deltas found against the pinned table:
   - REQ-PANE-5 (243a): findings left the dossier column for the right panel's Findings tab;
     the letter's passage links resolve to `#desk-finding-<id>` rows.
     - beat 4 `one-thing` retargets `data-finding="The one thing"` →
       `data-passage-link="The one thing"` (the letter-column passage link in the Verdict
       section — the same declared hook family the letter emits).
     - beat 5 `two-readers` keeps `[data-finding="Major 1"]` — it now lives inside
       `[data-panel-body="findings"]`; a new `panelTab` step field makes the ENGINE open the
       right panel on that tab (the delegated `[data-ide-panel-tab]` click — the same act a
       user makes) before locating the target, at docked/overlay/sheet widths alike.
     - beat 6 stays `[data-claim="22"]` — the claim ledger is a letter-column section
       (`[data-letter-section="claims"]` wraps `ClaimsTable`).
   - S-7/242: beat 7 retargets `data-figure-row` → `data-figure-image`
     (the imported-image figure card, `figure_2_ches_correlations_v2`).
   - Everything else resolves unchanged on the final DOM.
2. **Mechanics** (REQ-TOUR-2/REQ-PANE-4): non-modal stays (URL state, no focus trap, Esc exits,
   no auto-start); ←/→/Esc bind only while a step is active and never inside inputs;
   `reserved-chords.json` binds no arrows/Esc (pinned by a test); `[`/`]` are never swallowed
   (the tour ignores non-arrow/Esc keys).
3. **Copy** (REQ-TOUR-2/-5): the only forced delta is `demo.tour.steps.v1` — beat 2 now
   introduces the ADR-128 regions (sidebar | Page | right panel). Quoted fragments unchanged;
   QUOTE_PINS unchanged.
4. **Sidebar "Demo"** (REQ-TOUR-4 R7b, REQ-DWEB-16, S-14): `data-shell-demo` item after
   Settings in the workspace nav — `data-spa-native` document navigation to
   `/demo/structure-of-political-difference` (a `boot.demo` document; the SSR hub carries
   none), a Lucide icon, the collapsed tooltip via ShellItem. `"sidebar-demo"` joins the
   GUARD-3 `SANCTIONED_DOCUMENT_NAVIGATIONS` list by name.
5. **DWEB-7 re-run**: `demo-side-effects.local.test.ts` re-run on the final compositions;
   `docs/demo-side-effects.md` regenerated and committed; the seeded `/a/dwell` negative leg
   still fails the proxy.
6. **D2.tour**: step table re-pinned; the 1024 manual panel-open hack retires (the engine owns
   the panel open); a signed-in arm asserts the sidebar Demo entry yields a fresh document
   carrying `boot.demo` with no shared QueryClient — locally against a stub api (planted
   cookie + `GET /session` + `GET /projects` stubs), on the preview with the real session.
   `expected:"red"` held — ready-to-flip for 250.

## Test matrix

- unit (`demo-tour-steps.test.ts`): every step target a declared hook; routes ⊆
  DEMO_ROUTE_IDS; verbatim quote pins; derived counts; `panelTab` values ⊆ PANEL_TABS;
  literal-selector spot pins re-pinned.
- DOM (`demo-tour.dom.test.tsx`, `app-shell` tests): non-modal legs (no trap, no auto-start,
  Esc free-roam); the `panelTab` step opens the panel before pointing; sidebar Demo emits
  `data-spa-native` + hook + tooltip.
- lint: FUNNEL_SCOPE `/^demo\./` stays green on the changed leaf; reserved-strings clean.
- proxy: `demo-side-effects.local.test.ts` full walk (4 walks × essays × widths), zero
  violations, reach==implemented, regenerated table.
- legs: `demo-tour-legs.local.test.ts` real `D2.tour` body at 1440/1024/390, per-step
  screenshots; the signed-in sidebar arm against the stub api.
- `noreload.local.test.ts`: pinned sanctioned list now carries `sidebar-demo`.
- regression: D1.hub/D3.readonly/R*.demo/P1.demo local legs + the full `apps/web/src` sweep.

## Evidence report

All runs at this head, after `pnpm turbo build --filter=@rhema/web --filter=@rhema/journeys` (15 tasks, fresh — the ticket's false-green rule).

| Gate | Result |
|---|---|
| `pnpm --filter @rhema/web typecheck` / `@rhema/journeys typecheck` | clean |
| `pnpm --filter @rhema/web lint` / `@rhema/journeys lint` | clean (pre-existing chat-live unused-disable warning only) |
| targeted vitest — `demo-tour-steps.test.ts`, `spa/app-shell.dom.test.tsx`, `spa/demo-tour.dom.test.tsx`, `spa/intercept.dom.test.tsx` | 83 pass (one authored failure fixed: Esc's keymap binding is the findings-scoped `finding-escape` — the engine's documented propagation-stop coexistence, not a collision) |
| **D2.tour real body locally** (`demo-tour-legs.local.test.ts`) | **green** — all 11 steps at 1440×900, 1024×768, 390×844 (emulated): mark visible + target un-occluded, Next/Back actionable, client-nav mechanism, CTA → `/signup?src=demo`; signed-in sidebar arm green vs the stub api (fresh doc + `boot.demo` + no shared QueryClient). Per-step screenshots → `docs/build/reports/2026-11-04_r7dem-6a-tour/` |
| **DWEB-7 recording proxy** (`demo-side-effects.local.test.ts`) | **green** — 4 walks × essays × {anon, cookie} × {desktop, phone}; **0 out-of-allowlist**; every DEMO_DOCUMENT_ROUTE_ID covered; reach == implemented; `docs/demo-side-effects.md` regenerated; the seeded `POST /a/dwell` negative leg fails the recorder |
| `noreload.local.test.ts` | 3/3 — clean walk 1 doc, planted reload fails, `sidebar-demo` pinned |
| `pnpm exec vitest run apps/web/src` | **1662/1662** |
| `pnpm exec vitest run packages/journeys/src` | **217/217** (D1.hub/D3.readonly/R*.demo/P1.demo/U3/U4 local regression all green) |
| `pnpm check:dom-contract` | OK — journey selectors ⊆ manifest ⊆ emitted+asserted |
| `pnpm check:spa-budget` | OK — entry graph **244.5 kB / 300.0 kB**; delta vs baseline `04a4e98b` **+33.4 kB** (~+0.2 kB this ticket; the standing `GD-KIT3A-BUDGET` deficit reported honestly) |
| `pnpm check:spa-env` / `check:protocol-markers` / `check:demo-corpus` | all green |

## AC gap table

| AC | Status | Verification layers |
|---|---|---|
| 11-beat tour on final R7b surfaces, every step resolves + reachable, mark never covers target | **proved (local/engineered)** — re-pinned table (beat 4 → `data-passage-link`, beat 5 `panelTab:"findings"`, beat 7 → `data-figure-image`); D2.tour body green at 1440/1024/390 with per-step screenshots + `assertActionable` occlusion | deployed preview pass → `D-R7TOUR.2-1` |
| Non-modal: URL state, no trap/scrim, Esc free-roam, free roam after Exit | **proved** — `demo-tour.dom.test.tsx` legs + D2.tour | — |
| Keys: ←/→/Esc vs `reserved-chords.json` fail test; `[`/`]` never swallowed | **proved** — `demo-tour-steps.test.ts` collision leg | — |
| Coach marks never cover their target at every required width incl. open pane | **proved (local)** — `assertActionable` + `coversCenter` per step at 3 widths; engine opens the panel for `panelTab` beats | deployed pass → `D-R7TOUR.2-1` |
| `demo.tour.*` copy changes listed + operator read; `D-R7COPY.1a-1` closed | **proved** — one forced leaf (v1) before/after in the PR body; `D-R7COPY.1a-1` never opened (recorded) | operator merge read (GD-TOURSIGN.R7) |
| Deep links `/demo/<essay>/…#hook` resolve per step | **proved** — `demoDeepLink` per step in the pinning test; hooks emitted + asserted | — |
| Sidebar Demo → fresh `boot.demo` document, no shared QueryClient, journey assertion | **proved (local)** — DOM test (hook + `data-spa-native` + href) + signed-in leg arm vs stub api | deployed half → `D-R7TOUR.2-1` |
| `sidebar-demo` on the GUARD-3 named list | **proved** — `SANCTIONED_DOCUMENT_NAVIGATIONS` + pinned list test | — |
| DWEB-7 re-run on final compositions; table regenerated; zero reads/writes | **proved** — proxy re-run green, table committed, negative leg fails | — |
| DOM contract updated in the same change | **proved** — `data-shell-demo` declared; `check:dom-contract` green | — |
| Tests for new behavior | **proved** — panelTab pin, chord collision, sidebar item, pinned GUARD-3 list, leg arm | — |
| D2.tour green at the preview SHA + flip | **owed** → `D-R7TOUR.2-1` (250) | local green is ready-to-flip evidence only |
| Entry delta reported vs baseline | **reported** — +33.4 kB cumulative (GD-KIT3A-BUDGET), 244.5/300 kB | — |

## Closed

Run record + PR body + deferral + BUILD_INDEX row 290 + LEDGER advance land in the same commit;
the boundary script reads CI at the exact head after push.
