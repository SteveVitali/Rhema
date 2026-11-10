# R7GUARD.1 — Recurrence guards: no-raw-controls global + the pane-occlusion check in CI

- **Ticket:** `docs/tickets/249_R7GUARD.1__recurrence-guards.md` (row 249 of 254, phase R7b)
- **Branch:** `stevevitali/r7guard-1-recurrence` — base `stevevitali/r7kit-3f-migrate-tail` @ `d9456389`
- **Mode:** `implement-spec`, `live_verification=false` — Stage A only, $0. No preview, no prod (GD-PREVIEW.R7).
- **Harness:** devin-desktop/swe-2-high/subagent
- **Date:** 2026-11-07 (second attempt — see History)

## History

First attempt stopped at its own bound (zero commits, clean — branch recreated fresh). The insert
248a_R7KIT.3f then landed the 29-file migrate-tail and recorded an AC-1 dry-run of **0**
`rhema/no-raw-controls` diagnostics at `error` over the exact 122-file 249 scope. This run landed
the flip; the dry-run's forecast held — `pnpm turbo lint` reports **0** residue.

## Plan

1. **REQ-GUARD-1 global** — collapse the per-batch `NO_RAW_CONTROLS_ENABLED` list into one
   `error` block over `packages/ui/src/**` + `apps/web/src/**/*.tsx`, ignoring `primitives/**`
   and `*.test.{ts,tsx,mts,mjs}` (seeded test fixtures are intentional). Exemptions stay
   committed data acting inside the rule. Rewrite the rule test's registration describe:
   `error` per-glob samples, absent on primitives/tests/out-of-scope, exempt files still
   `error`-configured, seeded violations fail, an unlisted control beside an exemption fails.
2. **REQ-GUARD-4 in CI** — the tour-target arm: `u3UnscrimmedViolation` in `u3-probe.ts` (the
   shared in-page census the deployed `U3.occlusion` leg now also calls over `TOUR_STEPS`);
   the local five-size walk + seeded negative legs in `u3-occlusion.local.test.ts`.
3. **Wiring** — `scripts/ci/guards-wiring.test.mjs`: the three full-path-gated carrier steps,
   guard carriers exist, scope literals pinned, `docs/ci.md` names each guard, and
   `TOUR_STEPS ≡ DEMO_TOUR_STEPS` id parity. Listed in `neutral-readers.txt`.

## Test matrix (all run, all green)

| Check | Result |
|---|---|
| `pnpm --filter @rhema/ui lint` / `@rhema/web lint` | 0 diagnostics — **0 residue** over the 122-file scope |
| `pnpm turbo lint` (46 pkgs) | green |
| `pnpm turbo build` (web closure + journeys) | green — fresh build before checks |
| `no-raw-controls.test.ts` | **21/21** — rule legs (raw button/input/select/textarea, padding/colour/radius literals, exemption-only-listed) + global registration (per-glob `error`, primitives/tests/out-of-scope absent, seeded fails, exempt-looking fails) |
| `u3-occlusion.local.test.ts` | **3/3** — five-size `u3ProbePage`; tour arm **55 step checks** (11 × 5 sizes) zero violations; negative legs (restyled `.ide-panel` over the column throws; `.ui-menu`/`[data-demo-tour]` over the verdict target's centre violate; the unseeded control is clean) |
| `scripts/ci/guards-wiring.test.mjs` | **7/7** — carrier steps `mode=='full'` gated; GUARD-1…4 carriers exist; ci.md names all four; tour-table parity |
| `scripts/ci/fast-path.test.mjs` | 39/39 incl. the neutral-readers audit re-run |
| `packages/journeys/src` suite | **219/219** (24 files — browser legs included) |
| `check:dom-contract` | green (after fixing the Radix-internal attr literal — see Judgement calls) |
| `check:spa-budget` | entry 244.3/300.0 kB; **+33.2 kB cumulative** vs `04a4e98b` — +0.0 kB this ticket (GD-KIT3A-BUDGET / GD-SPA-ENTRY.R7 stand) |
| `check:spa-entry-graph` / `check:spa-env` / `check:protocol-markers` / `check:licenses` / `check:no-cookies` / `check:demo-corpus` | all green |

CI cost note (deliverable 4): the two new browser legs add ≈ **11 s** wall time to the
`typecheck / lint / unit` job's `pnpm test` leg (tour arm ~10 s, negatives ~1.3 s) — joins the
existing job, no material regression.

## AC table

| AC | Verdict | Layer |
|---|---|---|
| `pnpm turbo lint` green, rule `error` over both globs; config-resolution test proves scope; rule tests fail when weakened | **met** — 0 residue; `calculateConfigForFile` samples per glob `error`, primitives/tests/out-of-scope undefined; seeded legs fail | engineered |
| Exemption list committed data, every entry has a reason; unlisted raw control in an exempt-looking file fails | **met** — 205-line `no-raw-controls-exemptions.js`, every entry `{file, component?, reason}` (the data describe pins it); `pages-helper.tsx` + `Other()` legs fail | engineered |
| Layout check in CI at five sizes, green on the R7b tip; negative fixture fails it; fails (not skips) without chromium | **met (Stage A)** — local `demoDataSource` build, five sizes, zero violations + seeded legs; CI-fail arms on `process.env.CI` (unit job installs chromium) | fixture-verified |
| Four-guard wiring check green; `docs/ci.md` lists each guard's job | **met** — `guards-wiring.test.mjs` 7/7; ci.md § "The four recurrence guards" table | engineered |
| **Stage B owed to 250** — `D-R7GUARD.1-1` opened (kind P, dated 2026-11-07) | **owed, recorded** — never claimed | carried |
| Universal phase-gate AC | run/PR ledgers, requirement ids stamped, deferral row appended, INDEX/LEDGER advanced, harness in header | agentic |

## Judgement calls

- **Test-glob exclusion** per the handoff: `**/*.test.{ts,tsx,mts,mjs}` is in `ignores` — the
  suite's fixtures seed raw controls deliberately; the registration describe pins exclusion.
- **Centre-point semantics for the coach mark** (D2.tour's `coversCenter` rule): a container
  target tolerates edge overlap; other un-scrimmed overlays fail on strict rect intersection
  for pointed targets, centre containment for containers (>55% viewport).
- **Radix attr literal out of the probe:** `check:dom-contract` rejects unmanifested
  `data-*` in journeys — the popper census selects our `.ui-*` classes and resolves the
  nearest out-of-flow ancestor instead of naming `data-radix-popper-content-wrapper`.
- **Regenerated sibling artifacts reverted:** the journeys suite re-stamps earlier tickets'
  report PNGs + `docs/demo-side-effects.md` on every run — all reverted (not this ticket's
  evidence); only `reports/2026-11-07_r7guard-1-u3/` is new.
- **`U3_OCCLUSION` gained the tour arm** at 390×844 so the deployed leg exercises the same
  shared assertion its `asserts` string already claims ("every tour target") — still
  `expected:"red"`; the flip stays 250's.
- **`pnpm format` repo-wide** is a pre-existing warnings sea (3,245 files); only touched files
  were formatted — `r7legs.ts`'s prettier pass reverted (451-line churn) and edits re-applied
  in file style. Touched files are prettier-clean except `no-raw-controls.js` (pre-existing).

## Evidence

- Screenshots: `docs/build/reports/2026-11-07_r7guard-1-u3/` (tour arm at the five sizes).
- `U3.occlusion` remains `expected:"red"`; `D-R7GUARD.1-1` carries Stage B to 250.
- Requirement ids satisfied + stamped: **REQ-GUARD-1, REQ-GUARD-4, REQ-PANE-4** (CI arm);
  REQ-GUARD-2 / REQ-GUARD-3 stamped "wiring verified" only.
- Spend: **$0**.
