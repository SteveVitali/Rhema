# SPA.20 — surface: run-sheet (`/p/:slug/run` → React SPA)

**Manifest row 127** · stacks on `stevevitali/spaf-10-prod-flip-figures` @ `c53c936` ·
merge policy **OPERATOR** — do not merge from the build environment · **$0** spend,
no deploys, no production writes.

Implements `docs/tickets/127_SPA.20__surface-run-sheet.md` per `docs/design/22`
(endpoint table — the `p.run` row + `POST /bff/p/:slug/estimate`), `docs/design/29`
(route map — `run-sheet` is IDE-framed; the `/p/:slug/run` GET consults on
`run-sheet` AND `ide-chrome`), `docs/design/27` (two-leg + rollback mechanics —
the F9 gate set `N4, R7, N9, P1.runsheet`), and `docs/frontend-spa-spec.md`
§4/§7.3/§8/§9. `STAGES.dev.spaSurfaces` gains `"run-sheet"`; preview `[]` and prod
`["usage","inbox","settings","voices","onboarding","project-home","billing","export","ide-chrome","outline","figures"]`
stay unchanged (the prod flip is SPAF.11's own row, gated on the REQ-SEQ-10 bake).

The run sheet is the largest extraction in the flip order and the only
paywall/estimate flow — so the server keeps every authoritative fact: the
estimate math, the consent verdict's inputs, the insufficient-balance
resolution options, the entitlement claim, the Payment Link target, the
`rhema_fp` mint, and the run-launch freeze. The SPA leaf repaints levers off the
server-built `recompute.cells` matrix — the browser never imports the estimator.

**Deployable dark:** nothing changes for an unflipped request — the leaf's
loader skips its BFF read and `SsrHandoff` document-navigates back to the same
URL, where the server re-runs session → `spaShellResponse` consult → SSR in its
normative order (REQ-BFF-20). SSR fallback + `server.test.ts` untouched and green
(REQ-SEQ-11/12); `?ssr=1`/`x-rhema-renderer` overrides ride the unchanged consult
machinery.

## Requirement IDs

**REQ-SEQ-9 · REQ-VFY-8 · REQ-BFF-23/25/26 · REQ-DAT-10/12 · REQ-NAV-5 ·
REQ-VFY-9 · REQ-UX-3/4/5/10/13/14/15/16** · supporting: REQ-BFF-1/2/3/4/8/9/11/27 ·
REQ-DAT-4/6 · REQ-SEQ-2/11/12 · REQ-TST-2 · REQ-VFY-2/4/6/7 · REQ-SAFE-10 ·
REQ-BILL-4/6/7 · REQ-SPEC-17/32 · REQ-OBJ-6

## What lands

### `runSheetComposition` — one composition, both renderers (`server.ts`)

The document GET's whole read was factored into `runSheetComposition(c, deps,
session, row, query)` and the BFF twin calls the same function: the
`getRunSheetContext` read (with `workflow`/`scope` query picks forwarded
verbatim), the non-terminal-run `blockedBy` → `activeRun` precedence arm, the
`getBillingBalance` read (spendable, suspended, clawback, the BILL.3 `purchase`
switch, the allowlisted Payment Link), `getProjectVoice` + staleness, the
Revise `getPretriage` read, the exhausted-prompt impression record, and the
server-built `RunSheetView` — estimate, cap, duration band, `recompute.cells`,
`idempotencyKey`, `entitlementId`, consent facts, insufficient-balance
sentences + resolution options, payment-link info, scope/approval/voice/promote
lines. **`rhema_fp` mints here** — the entitlement-bearing sheet mints the
first-party trial-abuse fingerprint cookie on the twin exactly as on the
document GET (the no-cookies gate's approved exception).

### `GET /bff/p/:slug/run` — the aggregate twin (REQ-BFF-1/8/9/11, REQ-DAT-4/6)

`{runSheet:{slug,projectTitle,view,activeRun?}, pretriage?, project, paperTheme,
appTheme?, ide}` — the view-as-DTO plus the IDE shell bag the framed leaf
republishes (`useShellChrome`). Unauthed → `{error:"unauthenticated"}` 401;
unknown slug → `{error:"not_found"}` 404.

### `POST /bff/p/:slug/estimate` — REQ-BFF-23's typed revalidation

Accepts the typed `EstimateRequestDto`, resolves slug→project id server-side,
forwards to the new `DataSource.estimate?` seam (`data.ts` — the api adapter
calls `client.estimate`), and lands the api's `EstimateDto` verbatim. Non-object
body → `{error:"invalid_request"}` 400; seam absent → `503 estimate_unavailable`;
api refusals ride `bffFail` at their preserved status; 401/404 parity.

### `POST /p/:slug/run` + `POST /p/:slug/exhausted` — the JSON branches (REQ-BFF-2/3/4/27)

- **run:** `wantsJson` selects the branch; `bodyFields` reads the JSON object or
  the form body with the SAME flat field map (`workflow`, `idempotencyKey`,
  `estimateCredits`, `capCredits`, `scope`, `rateTableVersion`, `words`,
  `claims`, `toggleKeys`, `toggleRigor`, `toggle.*`, `entitlementId`, `rigor`,
  `modelTier`, `protocol`, `venue`, `stage`, `userSources`, `approval`,
  `autoRun`, `dontAskUnder`, `guidance` …). The server recomputes
  authoritatively and freezes workflow/tier/rigor/estimate/cap/rate-table
  version/toggles/word-claim snapshot/scope/guidance/approval + the `rhema_fp`
  cookie's fingerprint where minted. JSON success → `{ok:true,
  data:{runId,state}}`; refusals ride `bffFail` at their preserved statuses —
  `run_in_progress` 409, `insufficient_balance` 402, `trial_denied`,
  `phone_challenge_required`, `trial_ceiling`, `entitlement_unavailable`,
  `trial_shape`, `trial_word_cap`, `email_unverified`, `account_suspended`
  verbatim. Form posts keep the document's re-render arm byte-for-byte.
- **exhausted:** `action_taken` rides the body; `recordExhaustedPrompt` fires on
  both branches. Open purchase → `mutationOutcome({url})` carrying the
  allowlist-validated Stripe Payment Link + `client_reference_id` — the leaf
  hands off via `navigateDocument` (a real document navigation, never in-router).
  Closed purchase → `{ok, redirect:"…?notice=purchase_paused"}` — the 302's twin.
  No JSON caller ever receives a 3xx; the session split is 401-JSON /
  302-`/login` on both routes.

### `spa/surfaces/run-sheet.tsx` — the leaf (REQ-SEQ-9; design/27 F3/F7)

- Ports `ui/run-sheet.tsx`'s `RunSheet` markup verbatim through
  `RunSheetSurface` + `SpaRunSheetForm`: heading/lede, pretriage line, the
  started/notice rails, the PRB.21 active-run replacement arm, the §10.1
  `data-phone-blocked` capability note (boot `compact` verdict — the form never
  mounts at phone width), the full field map as hidden/visible controls, the
  rigor radios + model-tier select + advanced `toggle.*` fieldset, the paywall
  group's suspended / insufficient(+resolution options+Payment-Link-or-paused) /
  `Included` / estimate-missing / priced arms, consent semantics
  (`data-needs-consent`, the confirm-vs-run label swap), the command-scope
  pills/lines, voice line + priced update-voice submit, promote line, scope
  approval + memo-confidentiality + protocol-changed lines, the plan offer.
- **No `var R=` island** — the lever repaint moves into React state
  (`rigor`/`tier`/`toggles`/`leverDirty`), resolving `recompute.cells[
  rigor|tier|sorted-enabled-toggles]` — the same arithmetic the script ran,
  server-derived. The typed `<script type="application/json"
  data-estimate-matrix>` embed keeps the journey hook; the estimator package is
  never imported client-side.
- The `consent` verdict uses the shared `needsSecondClick` formula + constants
  (`@rhema/contracts` domain) — no re-derived pricing.
- Mutations post the form's field map via `bffFetch` (`collectJsonFields`
  serializes the live controls; `formAction` buttons retarget the submit
  exactly like the no-JS form); `redirect` navigates in-router, `url` hands off
  via `navigateDocument`, `data` paints the started arm; `["bff"]`
  settle-invalidate refetches the twin; `aria-busy` + disabled controls in
  flight (REQ-UX-16); refusals repaint the `?notice=`-vocabulary rail inline.
- `run-sheet-labels.ts` — the COPY-bound label bag hoisted so `pages.tsx` (SSR)
  and the SPA leaf bind the same leaves verbatim (REQ-SAFE-10); the two
  literals the SSR island carried (`Run cost and consent` aria, `· refining…`)
  became `COPY.runSheet.paywallAriaLabel`/`refiningSuffix` leaves.

### The leaf route (`_authenticated/p.$project.run.tsx`)

`validateSearch` carries `workflow`/`scope`/`words`/`protocol`/`rigor`/`tier`/
`modelTier`/`draftId`/`corrKind`/`notice`; the loader warms
`projectRunSheetQuery` ONLY on the `"spa"` boot verdict; twin 404 →
`notFound()`; SSR verdicts → `SsrHandoff` with zero BFF spend. `run-sheet` ∈
`SPA_IDE_FRAMED_SURFACES` — the chrome consult is the `run-sheet`+`ide-chrome`
AND the server already owns.

### DOM contract + stage fact + journeys

- `dom-contract.ts` run-sheet section — **71 hooks**, dual emitters
  (`pages.tsx`/`ui/run-sheet.tsx` + `spa/surfaces/run-sheet.tsx`); the
  `check:dom-contract` gate reads 799/799 with run-sheet 71/71 emitted+asserted.
- `STAGES.dev.spaSurfaces += "run-sheet"` (after `figures`, `ide-chrome`
  already listed — the key-level AND lights the framed leaf); preview `[]` and
  prod unchanged — SPAF.11 owns the prod flip.
- `SURFACE_GATES["run-sheet"] = {N4, R7, N9, P1.runsheet}` — the design/27 F9
  subset, all pre-existing green steps selecting on manifest hooks
  (renderer-agnostic); an `owed` note carries the preview-blocker row honestly.

## Test evidence

- `pnpm turbo build lint typecheck` — **135/135 green**.
- `pnpm test` — **5,512 pass / 4 skip / 0 fail** (484 files). Mid-run reds, this
  ticket's own and fixed + re-verified: `copy-containment.test.ts` flagged the
  paywall ternary chains as scanner-visible `>…<` text (restructured to
  early-return IIFEs — the file's own `.map` precedent), the `bffFetch` generic
  call (`=>` opener artifact — block body), the `aria-label`/`· refining…`
  literals (new COPY leaves), and `COPY.runSheet` as a branch ref
  (`runSheetCopy` leaf-bound export); the dom suite's consent fixture +
  axe-scope fixes; `bff.test.ts`'s ApiError detail position.
- `run-sheet.dom.test.tsx` — **26 tests**: the leaf mounted through the
  production router; SSR-verbatim vocabulary + `expectManifestEmission` parity
  vs `RunSheetPage` on the retained fixtures; React lever repaint off
  `recompute.cells` (rigor/tier/toggle moves repaint dollars/credits/cap/consent
  — initial render byte-parity); consent + insufficient + suspended + included
  + missing + paywall-single-mount + phone + active-run + started + notice arms;
  the promote-line fixture; the hidden-field literals the static extractor
  cannot infer (`rateTableVersion`/`words`/`claims`/`toggleKeys`/`toggleRigor`/
  `action_taken`); `SsrHandoff` zero-BFF on the ssr verdict; REQ-UX-16
  `aria-busy`; axe on the interactive subset.
- `bff.test.ts` SPA.20 block — **+13 → 225**: the twin's composition (view +
  `recompute.cells` + `idempotencyKey` + shell bag + `pretriage` on revise +
  lever-param passthrough + the active-run arm + the `rhema_fp` mint on an
  entitled sheet), the estimate twin (verbatim DTO, `invalid_request` 400,
  refusal passthrough, 401/404), the run POST (`{ok,data}`, the verbatim field
  map incl. toggles/snapshot/guidance, `rhema_fp` cookie → fingerprint field,
  refusal statuses 409/402/422, form re-render parity), the exhausted POST
  (`{ok,url}` Stripe target + `client_reference_id`, `{ok,redirect}` paused arm,
  form 302 + 401/404 splits).
- Retained SSR suite `server.test.ts` — green (107/107) with the shared
  composition in place.
- `infra/config/stages.test.ts` — dev pin updated, prod/preview unchanged.
- `packages/journeys` — `surface-gates.test.ts` green (the run-sheet gate's
  steps/legNotes/owed validate; no paid step gated).
- Script gates: `check:dom-contract` **799/799** (run-sheet 71/71) ·
  `check:licenses` ✓ · `check:protocol-markers` ✓ (the shared
  `run-sheet-labels.ts` leaf allowlisted — the `billing-copy`/`state-map`
  precedent) · `check:no-cookies` ✓ (`rhema_fp` stays the approved first-party
  fingerprint, minted server-side) · `check:spa-budget` ✓ (`p._project.run`
  chunk ≈6.7 kB gzip) · `check:spa-env` ✓.

## Deferrals

- `D-SPA.20-1` — preview two-leg (A `pin-renderer ssr`/`expect-renderer ssr`,
  B `rhema:spaSurfaces += run-sheet` + `--expect-renderer spa` on
  `SURFACE_GATES.run-sheet`, C `paid:false`). **OPEN** — `rhema-nonprod-resend-
  api-key` re-probed `NOT_FOUND` (D-MAINT.6-1 operative; value never printed).
- `D-SPA.20-2` — preview rollback drill (flag off → SSR serves the same
  run-sheet DOM contract). **OPEN** — same blocker.
- Blocker updates appended to `D-OPS.1-1` / `D-SPA.6-1` / `D-MAINT.6-1` — all
  stay OPEN; none closed.
- `STAGES.preview.spaSurfaces` stays `[]`, `STAGES.prod.spaSurfaces` unchanged —
  REQ-SEQ-11 deployable-dark holds; the PR is additive-only on the render side.

## Notes

- The estimator stays server-owned: the leaf never imports `surfaceEstimate`/
  `buildLeverMatrix`; `POST /bff/p/:slug/estimate` exists for revalidation and
  out-of-matrix inputs, normal repaint resolves `recompute.cells` locally.
- No API/schema changes; no new ADRs (envelope + twin + flag rules reuse
  REQ-BFF-*/REQ-SEQ-* as authored).
