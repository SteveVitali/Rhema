# SPA.20 — run ledger: surface `run-sheet` (`/p/:slug/run`)

- **Ticket:** `docs/tickets/127_SPA.20__surface-run-sheet.md` (manifest row 127)
- **Branch:** `stevevitali/spa-20-surface-run-sheet` — forked from
  `stevevitali/spaf-10-prod-flip-figures` @ `c53c936` (the requested chain tip).
- **PR:** [#149](https://github.com/SteveVitali/Rhema/pull/149) —
  `pr/SPA.20.md` is the committed body.
- **Harness:** devin-cli subagent (per the 2026-10-08T23:05Z dispatch-tier ruling).
- **Mode:** offline-only, $0 — no deploys, no production writes, mergePolicy OPERATOR.
- **Spend:** `paid:false` legs only; no metered spend ($0).

## 0 — Prerequisite probe (run first, per the ticket's operating clause)

```
gcloud secrets versions access latest \
  --secret=rhema-nonprod-resend-api-key --project=rhema-507501
→ ERROR: (gcloud.secrets.versions.access) NOT_FOUND
```

The secret was never printed (there is no version to print); `gcloud secrets list`
still shows only `rhema-prod-resend-api-key`. Without it `preview-stack.mjs
resend-pull` cannot seed `rhema:resendApiKey`, so no signed-in preview session can
mint through the magic-link + mailbox leg — `/p/:slug/run` is session-gated. The
preview two-leg and rollback drill are honestly deferred (`D-SPA.20-1`/`-2`), with
the deterministic in-repo proof standing in. This is the same live blocker as
`D-MAINT.6-1` / `D-SPA.6-1` / `D-SPA.12-1` / … / `D-SPA.19-1`.

## 0b — Inherited chain debt

None this run — `check:dom-contract` opened clean on the base (`c53c936`);
SPAF.10's closeout read with zero outstanding rows owed to this ticket.

## 1 — What landed

### `runSheetComposition` — one composition, both renderers (`server.ts`)

The document GET's whole read was factored into `runSheetComposition(c, deps,
session, row, query)`; `GET /bff/p/:slug/run` calls the SAME function, so the
twin cannot drift: `getRunSheetContext` (with `workflow`/`scope` forwarded
verbatim), `blockedBy` → `activeRun` precedence, `getBillingBalance` (spendable
/ suspended / clawback / BILL.3 `purchase` switch / allowlisted Payment Link),
`getProjectVoice` + staleness, the Revise `getPretriage` read, the
exhausted-prompt impression, and the server-built `RunSheetView` (estimate, cap,
duration band, `recompute.cells`, `idempotencyKey`, `entitlementId`, consent
facts, insufficient sentences + resolution options, payment-link info, the
scope/approval/voice/promote/memo lines). **`rhema_fp` mints on the twin** when
the sheet carries an entitlement — the same billing trail the document GET
leaves (the no-cookies gate's approved first-party exception).

### `GET /bff/p/:slug/run` (REQ-BFF-1/8/9/11, REQ-DAT-4/6)

`{runSheet:{slug,projectTitle,view,activeRun?}, pretriage?, project, paperTheme,
appTheme?, ide}` — the view-as-DTO plus the IDE shell bag the framed leaf
republishes through `useShellChrome`. Unauthed → `{error:"unauthenticated"}`
401; unknown slug → `{error:"not_found"}` 404.

### `POST /bff/p/:slug/estimate` (REQ-BFF-23)

`EstimateRequestDto` in → slug→project-id resolved server-side →
`DataSource.estimate?` (new seam; the api adapter calls `client.estimate`) →
the api's `EstimateDto` verbatim. Non-object body → `{error:"invalid_request"}`
400; seam absent → `503 estimate_unavailable`; refusals ride `bffFail` at their
preserved status; 401/404 parity. The estimator stays server-owned — this
endpoint revalidates; it never moves arithmetic into the bundle.

### The two POSTs — `wantsJson` + `mutationOutcome`/`bffFail` (REQ-BFF-2/3/4/27)

- `POST /p/:slug/run` — `bodyFields` reads the JSON object or the form body
  with the same flat field map (workflow/idempotencyKey/estimateCredits/
  capCredits/scope/rateTableVersion/words/claims/toggleKeys/toggleRigor/
  `toggle.*`/entitlementId/rigor/modelTier/protocol/venue/stage/userSources/
  approval/autoRun/dontAskUnder/guidance). The server recomputes
  authoritatively and freezes workflow/tier/rigor/estimate/cap/rate-table
  version/toggles/snapshot/scope/guidance/approval + the minted `rhema_fp`
  fingerprint. JSON success → `{ok:true,data:{runId,state}}`; refusals at
  preserved statuses (`run_in_progress` 409, `insufficient_balance` 402, the
  `trial_*`/`entitlement_unavailable`/`phone_challenge_required`/
  `email_unverified`/`account_suspended` 422s verbatim). Form posts keep the
  re-render arm byte-for-byte.
- `POST /p/:slug/exhausted` — `action_taken` rides the body;
  `recordExhaustedPrompt` fires on both branches. Open purchase →
  `{ok,url}` carrying the allowlist-validated Payment Link +
  `client_reference_id` (document navigation on the leaf); closed purchase →
  `{ok,redirect:"…?notice=purchase_paused"}` — the 302's twin. No JSON 3xx;
  401-JSON vs 302-`/login` splits on both.

### `spa/queries.ts` — `BffRunSheetTwin` + `projectRunSheetQuery` + `postRunSheetEstimate`

The typed twin (`["bff","p",slug,"run",search]` — the deep-link lever params are
key inputs so a lever nav re-reads) with the shared `retryPolicy`, and the typed
estimate POST helper the leaf can revalidate against.

### `spa/surfaces/run-sheet.tsx` — `RunSheetSurface` + `SpaRunSheetForm` (~1,050 lines)

- Ports `ui/run-sheet.tsx`'s `RunSheet` markup verbatim: heading/lede, pretriage,
  started/notice rails, the PRB.21 active-run arm (the Run affordance is
  REPLACED), the §10.1 `data-phone-blocked` capability note on the boot
  `compact` verdict (the form never mounts at phone width), the full hidden +
  visible field map, rigor radios, the model-tier select + plan-clamp notice,
  the advanced `toggle.*` fieldset, the paywall group's
  suspended/insufficient(+resolution options + Payment-Link-or-paused)/
  `Included`/estimate-missing/priced arms, consent semantics
  (`data-needs-consent`, the confirm-vs-run label), command-scope pills +
  whole-draft line, voice line + priced `data-update-voice` submit, the promote
  line, scope-approval/memo-confidentiality/protocol-changed lines, the plan
  offer.
- **No `var R=` island** — the script's repaint is React state
  (`rigor`/`tier`/`toggles`/`leverDirty`) resolving
  `recompute.cells[rigor|tier|sorted-toggles]` — server-built arithmetic, never
  an estimator import. The typed `<script type="application/json"
  data-estimate-matrix>` embed keeps the manifest hook. `leverDirty` gates the
  repaint so the first render is byte-parity with the server's own figures.
- Consent rides the shared `needsSecondClick` formula + contracts constants —
  no re-derived pricing or thresholds.
- `bffFetch` mutations: `collectJsonFields` serializes live controls;
  `formAction` buttons retarget via `submitActionRef` (the no-JS pattern); the
  cap clamp (upward-only, REQ-BILL-7) applies at submit; `redirect` in-router,
  `url` → `navigateDocument` (Stripe hand-off), `data` → the started arm;
  `["bff"]` settle-invalidate; `aria-busy` + disabled in flight (REQ-UX-16);
  refusals repaint the `?notice=`-vocabulary rail inline, no navigation.
- `run-sheet-labels.ts` — the COPY-bound `RunSheetLabels` bag hoisted so
  `pages.tsx` and the leaf bind the same leaves verbatim (REQ-SAFE-10); two
  literals the SSR island carried (`Run cost and consent`, `· refining…`)
  became `COPY.runSheet.paywallAriaLabel`/`refiningSuffix`.

### The leaf route (`_authenticated/p.$project.run.tsx`)

`validateSearch` carries `workflow`/`scope`/`words`/`protocol`/`rigor`/`tier`/
`modelTier`/`draftId`/`corrKind`/`notice` (`notice` stays URL state, never a BFF
field); the loader warms `projectRunSheetQuery` only on the `"spa"` verdict;
twin-404 → `notFound()`; SSR verdict → `SsrHandoff` zero-BFF. `run-sheet` ∈
`SPA_IDE_FRAMED_SURFACES` — the key-level AND (`run-sheet` + `ide-chrome`) is
the server-side consult; `STAGES.dev` lists both keys.

### DOM contract + stage fact + journeys

- `dom-contract.ts` run-sheet — **71 hooks**, dual emitters; the gate reads
  799/799 (`run-sheet` 71/71 emitted+asserted).
- `STAGES.dev.spaSurfaces += "run-sheet"`; preview `[]` and prod unchanged —
  SPAF.11 owns the prod flip.
- `SURFACE_GATES["run-sheet"] = {N4, R7, N9, P1.runsheet}` — the design/27 F9
  subset, all pre-existing green steps selecting on manifest hooks
  (`form[data-run-sheet]`, `[data-phone-blocked]`, the `data-*` estimate/copy
  hooks — renderer-agnostic by construction) + an `owed` note carrying the
  preview blocker honestly.

## 2 — Test evidence

- `pnpm turbo build lint typecheck` — **135/135 green** (120 cached).
- `pnpm test` (full suite) — **5,512 pass / 4 skip / 0 fail** (484 files).
  Mid-run reds, this ticket's own and fixed + re-verified:
  `copy-containment.test.ts` flagged the paywall's nested ternary chains as
  scanner-visible `>…<` text (restructured to early-return IIFEs — the file's
  own `.map` precedent), the `bffFetch<MutationReply>` generic (`=>`-opener
  artifact → block body), the literal `aria-label`/`· refining…` (new COPY
  leaves), and the `COPY.runSheet` branch reference (`runSheetCopy` leaf-bound
  export from `run-sheet-labels.ts`); the dom suite's consent-fixture +
  axe-scope fixes; `bff.test.ts`'s `ApiError` detail-position fix.
- `run-sheet.dom.test.tsx` — **26 tests**: production-router mounts; SSR-verbatim
  vocabulary + `expectManifestEmission` parity vs `RunSheetPage`; lever repaint
  off `recompute.cells`; consent/insufficient/suspended/included/missing/
  paywall-single-mount/phone/active-run/started/notice/promote arms; the hidden
  field literals the static extractor cannot infer (`rateTableVersion`/`words`/
  `claims`/`toggleKeys`/`toggleRigor`/`action_taken`); `SsrHandoff` zero-BFF;
  `aria-busy`; axe on the interactive subset.
- `bff.test.ts` SPA.20 block — **+13 → 225**: twin composition (view +
  `recompute.cells` + shell bag + `pretriage` on revise + lever-param
  passthrough + active-run arm + `rhema_fp` mint on an entitled sheet), the
  estimate twin (verbatim DTO, `invalid_request`, refusal passthrough, 401/404),
  run POST (`{ok,data}`, verbatim field map, `rhema_fp` → fingerprint field,
  409/402/422 refusals, form parity), exhausted POST (`{ok,url}` Stripe +
  `client_reference_id`, `{ok,redirect}` paused, form 302 + 401/404).
- Retained SSR suite `server.test.ts` — green (107/107) with the shared
  composition in place.
- `infra/config/stages.test.ts` — dev pin updated, prod/preview unchanged.
- `packages/journeys` — `surface-gates.test.ts` green.
- Script gates: `check:dom-contract` **799/799** (run-sheet 71/71) ·
  `check:licenses` ✓ · `check:protocol-markers` ✓ (`run-sheet-labels.ts`
  allowlisted — the `billing-copy`/`state-map` shared-leaf precedent) ·
  `check:no-cookies` ✓ · `check:spa-budget` ✓ (`p._project.run` ≈6.7 kB gzip) ·
  `check:spa-env` ✓.

## 3 — Deferrals

- `D-SPA.20-1` — preview two-leg (A `pin-renderer ssr`/`expect-renderer ssr`,
  B `rhema:spaSurfaces += run-sheet` + `--expect-renderer spa` on
  `SURFACE_GATES.run-sheet` = `N4, R7, N9, P1.runsheet`, C `paid:false`).
  **OPEN** — blocker recorded verbatim (the shared Resend secret).
- `D-SPA.20-2` — preview rollback drill (flag off → SSR serves the same
  run-sheet DOM contract). **OPEN** — same blocker.
- `SURFACE_GATES["run-sheet"]`'s `owed` note carries the two-leg row honestly —
  the gated steps stay green (carried nightly legs), so nothing vacuous gates.
- Blocker updates appended to `D-OPS.1-1` / `D-SPA.6-1` / `D-MAINT.6-1` — all
  stay OPEN; none closed.
- Neither preview nor prod was touched: `STAGES.preview.spaSurfaces` stays `[]`,
  `STAGES.prod.spaSurfaces` unchanged. REQ-SEQ-11 deployable-dark holds — the PR
  is additive-only on the render side.

## 4 — AC status

| AC | Status |
|---|---|
| `/bff/*` twins + envelope mutations green — typed JSON, preserved statuses | **engineered** — `p.run` twin + estimate twin + both POSTs' `wantsJson` branches, all under test |
| React surface emits the full dom-contract vocabulary — component tests + axe | **engineered** — 26 dom tests + `expectManifestEmission` parity + axe; 71/71 hooks emitted+asserted |
| Retained SSR tests stay green — the fallback is untouched | **engineered** — `server.test.ts` 107/107, the SSR path shares the composition |
| Journey legs re-spec'd + `SURFACE_GATES['run-sheet']`; preview two-leg green | **journey engineered; preview leg DEFERRED** — `D-SPA.20-1` (secret blocker); the F9 gate is committed |
| Rollback drill evidence on the preview | **DEFERRED** — `D-SPA.20-2` (same blocker); the flag-off path is unit-pinned |
| Dev stage-fact line — prod untouched | **engineered** — `STAGES.dev.spaSurfaces += "run-sheet"` |
| `rhema_fp` mint preserved on the document GET | **engineered** — the mint lives in the shared composition; the twin mints identically |
| Entitlement/trial-shape 422 passthrough verbatim | **engineered** — `bffFail` preserved statuses, asserted in `bff.test.ts` |
| `POST /bff/p/:slug/estimate` — server-owned estimator | **engineered** — `DataSource.estimate` seam, api refusal passthrough |
| REQ-VFY-9 disposition | **MET** — SSR HTML-string asserts stay as retained fallback coverage; SPA asserts in `run-sheet.dom.test.tsx`; status/mutation legs in `bff.test.ts` |
| Universal phase-gate AC | recorded — checks below; deferrals appended; ledgers advanced |

## 5 — Checks read + memory

- **PR** — `gh pr checks` read once at closeout (recorded in BUILD_INDEX row
  156; the inherited-red classification rule is GD-MAINT.4-1's — the privsep
  `integration` leg is waived on the chain).
- `check-build-memory.sh` + `check-append-only.mjs --base c53c936` — green at
  closeout.
- `BUILD_INDEX.md` row 156 · `LEDGER.md` advanced — `nextTicket: SPAF.11`
  (manifest row 128 — the prod `run-sheet` flip, gated on the REQ-SEQ-10
  nightly-green bake), `lastCompleted: SPA.20`,
  `chainTip: stevevitali/spa-20-surface-run-sheet`.

## 6 — Deviations / notes

- **No new ADRs** — envelope + twin + flag + hand-off rules reuse
  REQ-BFF-1/2/3/11/20/23/27, REQ-SEQ-9/11, REQ-VFY-8 as authored.
- **`run-sheet-labels.ts` is a new allowlisted shared leaf** — the
  `billing-copy.ts`/`state-map.ts` precedent: COPY-bound labels consumed by
  both renderers; `check-protocol-markers.mjs`'s shared-leaf regex gained it.
- **The paywall arms moved from nested JSX ternaries to early-return IIFEs** —
  semantically identical, and the REQ-SAFE-10 source scan keys on `>…<` text
  runs the ternary boundaries produced. No markup changed.
- **`est.provisional`'s `· refining…` + the paywall `aria-label` became COPY
  leaves** — the SSR island carried them as literals; the SPA binds
  `COPY.runSheet.refiningSuffix`/`paywallAriaLabel` (REQ-SAFE-10); SSR markup
  unchanged.
- **Size:** ~2,900 changed lines incl. ~630 of new dom tests + ~340 of new bff
  tests — over the ~600 guide for the same reason as SPA.14–19 (test files
  dominate; production diff is modest).
