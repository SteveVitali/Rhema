# SPA.18 — surface: outline (`/p/:slug/outline` + `/p/:slug/outline/promote` → React SPA)

**Manifest row 123** · stacks on `stevevitali/spaf-8-prod-flip-export-ide-chrome` @ `6968fcb` ·
merge policy **OPERATOR** — do not merge from the build environment · **$0** spend,
no deploys, no production writes.

Implements `docs/tickets/123_SPA.18__surface-outline.md` per `docs/design/22`
(endpoint table — the `p.outline` + `p.outlinePromote` rows), `docs/design/27`
(two-leg + rollback mechanics), `docs/design/29` (route map — `outline` is a
non-IDE-framed leaf), and `docs/frontend-spa-spec.md` §4/§8/§9.
`STAGES.dev.spaSurfaces` gains `"outline"`; preview `[]` and prod
`["usage","inbox","settings","voices","onboarding","project-home","billing","export","ide-chrome"]`
stay unchanged (the prod flip is SPAF.9's own row, gated on the REQ-SEQ-10 bake).

Also closes the **chain debt SPAF.8 recorded**: `check:dom-contract`'s four
unasserted billing hooks (`data-plan-ladder`, `data-topups`, `data-auto-reload`,
`packId` — SPA.16's) are now asserted in `billing.dom.test.tsx`; the check is
green 33/33 on outline and 719/719 overall.

**Deployable dark:** nothing changes for an unflipped request — the leaf's
loader skips its BFF read and `SsrHandoff` document-navigates back to the same
URL, where the server re-runs session → `spaShellResponse` consult → SSR in its
normative order (REQ-BFF-20). SSR fallback + `outline-surfaces.test.ts`
untouched and green (REQ-SEQ-11/12); `?ssr=1`/`x-rhema-renderer` overrides ride
the unchanged consult machinery.

## Requirement IDs

**REQ-SEQ-9 · REQ-VFY-8 · REQ-BFF-16 · REQ-UX-8 · REQ-VFY-9 · REQ-UX-3 ·
REQ-UX-4 · REQ-UX-5 · REQ-UX-10 · REQ-UX-13 · REQ-UX-14 · REQ-UX-15 ·
REQ-UX-16** · supporting: REQ-BFF-1/2/3/11/20 · REQ-DAT-4/6/13 ·
REQ-SEQ-2/11/12 · REQ-TST-2 · REQ-VFY-2/4/6/7 · REQ-SAFE-10 · REQ-GATE-5/6
(the `ed.*` grammar the save POST decodes is the gate card's own)

## What lands

### `GET /bff/p/:slug/outline` + `GET /bff/p/:slug/outline/promote` — the twins
(REQ-BFF-1/11, REQ-DAT-4/6/13)

- The editor twin answers `{outline:{slug, editable, saveAction, deleteAction,
  draftEstimateCredits?, outline: GateOutlineView, cited}}` — the document's own
  composition factored out and shared verbatim (`outlineViewFor` +
  `outlineDraftEstimate` are the SSR GET's inline mapper/estimator hoisted):
  slug→id off the request-scoped memo (`bffProjectRow`), `?slug` (the artifact
  pick) a server-echoed read input, `cited` from `dto.citedBy`, `editable` the
  api's raw fact (the `&& !isPhoneRequest` AND lands on the leaf's boot-owned
  `deviceClass`). A swallowed/null outline read answers `{outline:null}` at 200 —
  the document's own not-found arm — while a missed slug keeps the 404 envelope.
- The consent-sheet twin answers `{outlinePromotion:{slug, projectTitle,
  promotion, scope, threadId?, turnId?, started?}}` — the api's verbatim
  promotion facts (sources, sourceCopies, urls, threadTokens, urlsRefetched,
  estimate + cap, modelTier, rigor, existing) plus the scope/thread/turn the
  document reads off the URL (the form's hidden fields replay them —
  server-echoed, never client-invented). A refused/missed promotion read is the
  document's 404 arm → `{outlinePromotion:null}` at 200; a missed slug 404s.

### Mutations — `wantsJson` + `mutationOutcome`/`bffFail` on all four POSTs
(REQ-BFF-1/2/3)

- `POST /p/:slug/outline` — `bodyFields` reads the JSON content-type OR the form
  body; a JSON caller may post the SAME flat `ed.*` map OR a structured `{edit}`
  body — `decodeGateEditFields` decodes identically (the gate card's grammar —
  REQ-GATE-5/6). Empty edits stay a no-op → `mutationOutcome({redirect:
  "/p/:slug/outline"})`; a patch success answers `{ok:true, data:<patch
  result>}` verbatim (the unchanged-shape twin); a failed patch →
  `{error:"save_failed"}` 422 for JSON callers, the unchanged redirect for
  forms. Unauthed JSON → 401 (this POST already answered JSON 401 pre-SPA.18 —
  the autosave island posts `Accept: application/json`).
- `POST /p/:slug/outline/promote` — scope/threadId/turnId/slug off `bodyFields`;
  success → `mutationOutcome({redirect:"/p/:slug", data:out})` (the identical
  destination the 302 carried); an unbound seam → `{error:"upstream_unavailable"}`
  502 JSON vs the 502 not-found document; ApiError refusals ride `bffFail` at the
  preserved status (`thread_not_found` 404 / `run_in_progress` 409 / ≥500 → 502)
  while forms keep the sheet re-render with the honest `data-notice`.
- `POST /p/:slug/outline/delete` — success → `{ok,redirect:"/p/:slug"}`; the
  cited-outline refusal rides `bffFail` → **409 `{error:"outline_cited"}`**
  verbatim for JSON callers while the form keeps `/outline?notice=cited`.
- `POST /p/:slug/outline/gaps/:gapId/answer` — `{text}` off `bodyFields`; blank
  stays a no-op; success → `{ok,redirect:"/p/:slug/outline?saved=1"}`; the
  swallow-the-write seam is verbatim.

No JSON caller ever receives a 3xx; no form caller loses an existing redirect.

### The React surfaces + leaves

- `spa/surfaces/outline.tsx` — `OutlineSurface` ports `OutlinePage` verbatim:
  the metadata rail (thesis/venue/target length/protocol/voice), `OutlineSections`
  from `@rhema/ui` (the shared renderer — spine, sections, claims, provenance,
  alternatives, gaps, unverified badges — one component both SSR and SPA emit),
  `data-outline-editor` + `data-autosave` form, `data-draft-estimate`,
  `data-saved-note`/`data-notice`/`data-cited-note` flashes (`?saved=1` +
  `?notice=cited` map to `COPY`), the cited-delete protection arm, gap-answer
  forms, the delete form — and `OutlinePromoteSurface` ports
  `OutlinePromotePage`: `data-promotion-sources`/`data-promotion-urls`/
  `data-promotion-estimate` fact rails, `data-existing`, `data-started`, the
  consent form's hidden scope/threadId/turnId/slug replays, the
  `outlinePromotion:null` not-found arm.
- Mutations post JSON via `bffFetch`: the editor serializes its `ed.*` field map
  (delegated `onSubmit` collects live controls — the same grammar the island's
  `FormData` post carried); `redirect` → in-router nav, `["bff"]`
  settle-invalidate refetches the twin so the refetched rows land where the SSR
  302's reload put them; `aria-busy` + disabled controls in flight (REQ-UX-16).
- `p.$project.outline.tsx` + `p.$project.outline_.promote.tsx` —
  `validateSearch` carries `saved`/`notice`/`slug` and `scope`/`threadId`/`turnId`/
  `slug`; loaders warm `projectOutlineQuery`/`projectOutlinePromoteQuery` ONLY on
  the `"spa"` verdict; twin misses → `notFound()`/`{…:null}` arms; SSR verdicts →
  `SsrHandoff` with zero BFF spend.

### DOM contract + stage facts + journeys

- `dom-contract.ts` — the outline bucket grows to **33 hooks** (dual emitters
  `pages.tsx` + `spa/surfaces/outline.tsx`): `data-outline-editor`,
  `data-autosave`, `data-autosave-status`, `data-draft-estimate`,
  `data-saved-note`, `data-notice`, `data-cited-note`, `data-promotion-sources`,
  `data-promotion-urls`, `data-promotion-estimate`, `data-existing`,
  `data-started`, `data-outline-delete`, the existing
  section/sections/claim/gap/move-card/what-changed hooks, the `ed.*` field
  prefix, field names `slug`/`threadId`/`turnId`/`scope`/`text`, urlparams
  `saved`/`notice`/`slug`/`scope`/`threadId`/`turnId`.
- `STAGES.dev.spaSurfaces += "outline"`; `stages.test.ts` pin updated; prod +
  preview untouched.
- Journeys — `P1.outline` (registry `expected:"red"`, owner `UX.2` per the
  planning-ledger P1 family rule): `/p/:p/outline` + `/outline/promote` at phone
  width under **either** renderer — an existing outline renders read-only (no
  `ed.*` fields, no delete, no Save submit, no add-claim row — §10.1 verbatim)
  else the not-found arm; the promote sheet renders its fact rails + consent
  form or its own not-found arm; overflow + axe clean. `SURFACE_GATES.outline =
  {P1.outline}` with honest `owed` notes (the Resend blocker + the
  desktop/editor arms no free step can mint — promotion is a paid run);
  `cli-flags.test.ts`/`surface-gates.test.ts` updated — the empty-gate refusal
  moves to `figures`.

## Verification

- `pnpm turbo build lint typecheck` — **135/135 green**.
- `pnpm test` — full suite green (**5,417 pass / 4 skip / 0 fail**, 482 files).
- Focused: `outline.dom.test.tsx` (**23** — both leaves mounted through the
  production router; SSR-verbatim vocabulary + `expectManifestEmission` parity
  vs `OutlinePage`/`OutlinePromotePage`; the `ed.*` save JSON leg, promote
  consent post + in-router `{ok,redirect}` ride, refused-promote `data-notice`
  arm, `data-started` arm, `{outlinePromotion:null}` arm, cited-409 delete →
  `?notice=cited` flash on the refetched twin, gap-answer leg, `?saved=1`,
  phone/read-only suppression, `SsrHandoff` zero-BFF on the `ssr` verdict,
  404→`notFound`, REQ-UX-16 `aria-busy`, component axe), `bff.test.ts` (+22 →
  **193**), `outline-surfaces.test.ts` (retained SSR, untouched, 13/13),
  `stages.test.ts` (23/23), `surface-gates.test.ts` (11/11), `cli-flags.test.ts`
  (10/10), `registry.test.ts` (7/7).
- `pnpm check:dom-contract` — **green, 719/719** (the inherited 4 billing rows
  repaired; outline 33/33 emitted+asserted).
- `pnpm check:licenses` · `check:protocol-markers` · `check:no-cookies` ·
  `check:spa-budget` · `check:spa-env` — all clean.

## Honestly deferred (DEFERRALS.md)

- **D-SPA.18-1** — preview two-leg (A `pin-renderer ssr`/`expect-renderer ssr`,
  B `rhema:spaSurfaces += outline` + `--expect-renderer spa` on
  `SURFACE_GATES.outline` = `P1.outline`, C `paid:false`).
- **D-SPA.18-2** — preview rollback drill (flag off → SSR serves the same outline
  DOM contract).
- Blocker: `rhema-nonprod-resend-api-key` absent from Secret Manager
  `rhema-507501` — probed `gcloud secrets versions access latest` → `NOT_FOUND`
  (value never printed). Without it `preview-stack.mjs resend-pull` cannot seed
  `rhema:resendApiKey` → no signed-in preview session mints → the session-gated
  outline legs cannot run. Same live blocker as `D-MAINT.6-1` and every prior
  SPA deferral; both rows carry the exact unblock recipe + verify steps.
- `P1.outline`'s gate-note owed items (recorded in `SURFACE_GATES.outline`):
  the step is `expected:red` pending that first preview leg, and the
  desktop-width + outline-bearing arms (the editable `ed.*` form, autosave
  status, cited-409 flash) stay owed — no free step can mint an outline
  (promotion is a paid run); the dom.test parity legs stand in meanwhile.

## Out of scope (held)

Prod flip (SPAF.9 — `prod += outline`, REQ-SEQ-10 nightly-green gated), SSR
deletions (REQ-TST-1 cleanup wave), API/schema changes — never (spec §13).
