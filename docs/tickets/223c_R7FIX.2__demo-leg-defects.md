# R7FIX.2 — Insert: fix the two R7DEP.1 owed legs (U3.stopgap occlusion + R8.showcase.spa nav)

- **Sequence:** 223c of 254 · **Phase:** round 7 (R7a) · **Kind:** ticket (insert row, operator-ruled)
- **base_branch:** current checkout
- **Depends on:** 212_R7FIX.1 (the pane stopgap + `paneLayout()`), 211_R7RO.1 (the Showcase in the
  SPA + `settleClientNav` contract). The `pr-259` preview is up at `4f66cebc` for reproduction.
- **Run:** `implement-spec spec=docs/tickets/223c_R7FIX.2__demo-leg-defects.md`
- **Gate status:** operator ruling "fix first and then deploy and continue" (2026-11-04, verbatim).
- **Live stage:** Stage A + the preview re-walk ($0 legs; the preview is already up — spend counts
  to the round $20 cap via 224's measurement). No new preview.
- **Production mutations:** none
- **Size budget:** ~250 changed lines

## Goal
Two deterministic defects the 224 walk found on `pr-259`:
1. **`D-R7DEP.1-1` (`U3.stopgap`)** — the Desk-tab chat surface is occluded by a stray
   `<span class="">` element at 1440px width, deterministic ×2. Root-cause the occlusion
   (elementFromPoint over the chat region), fix at source (the stray span's stacking/paint order
   or the chat surface's z-context), and re-prove `U3.stopgap` at all four walk sizes.
2. **`D-R7DEP.1-2` (`R8.showcase.spa`)** — the dossier→review click performs a *document* nav
   instead of a client nav (`data-nav-count` stays 0; `settleClientNav` lapses), deterministic ×2.
   Root-cause why the showcase dossier→review link bypasses `nav-intercept` (missing
   `data-spa-native`? a route outside the SPA registry? the showcase's own link renderer?) and fix
   so the hop is a client nav. Re-prove `R8.showcase.spa` green on the preview.

Both flips ride the re-walk: the legs stay `expected:"red"` until the preview re-run proves them.

## Acceptance criteria
- [ ] Both defects root-caused at source (no overlay hacks / no suppressing the recorder) (agentic)
- [ ] `U3.stopgap` green on `pr-259` at 1440/1280/1024/820 (live-executed, screenshots)
- [ ] `R8.showcase.spa` green on `pr-259` — dossier→review is a client nav (live-executed)
- [ ] Recording proxy still clean; no regression on the other demo legs (fixture-verified)
- [ ] D-R7DEP.1-1 + D-R7DEP.1-2 closed with the preview evidence (live-executed)
- [ ] verification green; DEFERRALS updated; BUILD_INDEX row; LEDGER advanced *(agentic)*

## Requirement IDs
REQ-PANE-0, REQ-DWEB-14, REQ-SPEC-29 (Stage-B on the phase preview)
