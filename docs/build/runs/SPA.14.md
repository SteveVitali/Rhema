# SPA.14 — surface: onboarding (run ledger)

- **Status:** DONE (deterministic legs; preview two-leg + rollback BLOCKED — see §3; recorded honestly)
- **Harness:** Devin CLI (agentic coding subagent); model: Cognition Devin; tier: n/a (build work)
- **Ticket:** `docs/tickets/115_SPA.14__surface-onboarding.md` (manifest row 115)
- **Branch:** `stevevitali/spa-14-surface-onboarding`, stacked on
  `stevevitali/spaf-4-prod-flip-voices` @ `d5645e8` (`OPERATOR` merge policy, **not merged**).
- **Goal:** migrate the `onboarding` surface (`/app/new`, `/app/new/preview`,
  `/p/:p/import`, `/p/:p/import/preview`) to the React SPA behind the `onboarding`
  flag — BFF read twins, `wantsJson` mutation branches, ported components emitting
  the manifest vocabulary verbatim, the ONB.1 held-draft contract on the shared
  hold-store seam, presign→direct-PUT uploads, IDE-chrome publication on the
  AND-gated import legs, component tests/axe, retained SSR, journey gate, the dev
  stage-fact line (REQ-SEQ-9). The prod flip is SPAF.5's own row — prod untouched.
- **Spend:** $0. No deploys, no production writes, no live legs (preview blocked — §3).

## 0 — Context load

- DEFERRALS.md read first (per AGENTS): `D-SPA.6-1` assessed — still OPEN (the
  renderer-asserted legs need the deployed marker vocabulary + a flagged preview;
  prerequisites unchanged this run — no dated note appended since nothing moved).
  `D-MAINT.6-1` is the operative shared blocker — `rhema-nonprod-resend-api-key`
  re-probed this run, still absent. `D-OPS.1-1` (preview signed-in legs) is the same
  prerequisite stack; `D-SPA.12-1/-2`, `D-SPA.13-1/-2`, `D-SPAF.1-1..4` …
  `D-SPAF.4-1..4` read; untouched (prod deploys are operator-run; REQ-SEQ-10
  nightly-green gates SPAF.5).
- LEDGER CURRENT STATE read: `nextTicket: SPA.14`, `chainTip:
  stevevitali/spaf-4-prod-flip-voices`, `mergePolicy: OPERATOR`, `round: 4`.
- Design sources applied: `docs/design/22` §2 onboarding rows + §5.3 conversion
  preview, `docs/design/29` route-map `onboarding` row (`/p/:p/import*` last-two-only
  IDE-framed ⇒ the AND-gate), `docs/design/27` two-leg + rollback mechanics,
  spec `docs/frontend-spa-spec.md` §4/§8/§9, REQ-BFF-15/16 (server-owned pending
  cadence + presign upload), REQ-DAT-9/11, REQ-ISL-13 (the ONB.1 hold contract),
  REQ-NAV-5.

## 1 — What landed

### `apps/web/src/client/hold-store.ts` — the ONB.1 hold seam, shared (REQ-ISL-13)

- The IndexedDB hold primitives + the held-notice strings extracted verbatim out of
  `client/landing.ts` into the ONE module both renderers import: `getHold` /
  `deleteHold` / `putHold`, `HeldRecord`, the 10 MB cap + extension allowlist,
  `heldReadyText` / `heldReattachText`, `HELD_DISCARD_CTA`, `HELD_DISCARDED_TEXT`.
  `landing.ts` now imports them — zero behavior change on the island (the SSR /
  no-SPA path is untouched by construction: deletion still happens ONLY on the
  token-matched `?hc=` echo or explicit Discard; hydration never claims).

### `apps/web/src/server.ts` — four read twins + JSON mutation branches

- `GET /bff/app/new` → `{newProject}` — the sheet's composition verbatim
  (entry, protocols/cards, voices, form state); best-effort reads degrade the
  same way the document does.
- `GET /bff/app/new/preview` → `{newPreview}` — `?qk` required (missing → JSON
  `{ok:true,redirect:"/app/new?entry=draft"}` — a JSON caller never gets a 3xx);
  the pending answer carries `pending:{pollAfterSeconds}` — the server-owned
  cadence the SSR meta-refresh keeps (REQ-BFF-15).
- `GET /bff/p/:slug/import` → `{import}` — request-scoped slug→project memo;
  unknown slug → 404 parity; payload carries the `ide` bag the leaf republishes.
- `GET /bff/p/:slug/import/preview` → `{importPreview}` — same `qk`/pending
  contract, plus the IDE shell data.
- `POST /app/new` · `POST /app/new/create` · `POST /p/:p/import/preview` ·
  `POST /p/:p/import/create` gained the `wantsJson` split — JSON callers get the
  `{ok,redirect,flash,data,pending,url}` envelope on the SAME redirect/query
  vocabulary the form leg emits (`?created=…`, `?hc=…`, the preview URL with
  `qk`+`src`), `{error}` envelopes on refusals with stable codes + upstream
  statuses preserved; form callers keep their 302s verbatim; unauthed JSON →
  401 / form → `/login`.
- `importInputFromFields` replaced `parseImportInput` — one input grammar over
  `bodyFields(c)`: `qk`/`quarantineKey`/`fileName`/`paste` from JSON bodies AND
  multipart `file` from form posts — so the presigned-upload key and the legacy
  multipart path share one parser.

### `apps/web/src/spa/queries.ts` — typed twins (REQ-BFF-8/9, REQ-DAT-1/4)

- `BffNewProjectTwin` / `BffNewProjectPreviewTwin` / `BffImportTwin` /
  `BffImportPreviewTwin` + `BffIdeBag` / `BffConversion` payload types, the
  four query objects under the `["bff", …]` key convention,
  `retryPolicy` = transport-failures-only (HTTP/BFF errors never auto-retry),
  `NewProjectPreviewSearch` (entry/qk/title/…/heldToken/src) for the preview
  leaf's URL state.

### `apps/web/src/spa/surfaces/onboarding.tsx` — the surface (~1.05k lines)

- `NewProjectSurface` (entry cards + the sheet: title/protocol-card/venue/
  persona/start-version/file/paste — `data-new-project`, `data-new-project-form`,
  `data-entry`, `data-protocol-card`, `data-held*` verbatim; phone-compact → the
  §10.1 `data-phone-blocked` note), `NewProjectPreviewSurface` + `ImportSurface`
  + `ImportPreviewSurface` — `data-conversion-form` / `data-conversion-action` /
  `data-conversion-pending` vocabulary via the shared `ConversionPreview`.
- **Held hydration verbatim ONB.1:** every mount → `getHold` → attach via
  `DataTransfer` (no claim-on-attach) → on a real attach the hidden
  `input[name="heldToken"]` stamps — as **React state on a `value`-controlled
  input**, not an imperative `.value` write: a later re-render's `defaultValue`
  pass rewrites the `value` attribute and would clobber an imperative stamp
  (proven under happy-dom + by React's `updateInput` `defaultValue` semantics —
  the controlled input is renderer-deterministic either way). Filename-derived
  default title only when empty; the shared notice text + `data-held-discard`
  action; Discard → `deleteHold` + token clear + `HELD_DISCARDED_TEXT`.
  The `?hc=` echo on the mutation redirect deletes the hold only when the echoed
  token matches THIS record + stamps `data-held-consumed`.
- `useOnboardingSubmit` — delegated `onSubmit` on `data-spa-surface`: fields
  collected BEFORE the REQ-UX-16 busy pass; `nativeEvent.submitter` name/value
  rides; a `File` contribution runs `POST /bff/import/presign` → direct `PUT`
  to the signed URL (requiredHeaders echoed verbatim) → the JSON mutation
  carries `quarantineKey` + `fileName` only — **bytes never ride the JSON body
  and never proxy through the BFF**; `redirect` → router nav (with the `?hc=`
  hold handshake check), `url` → document nav; `["bff"]` invalidate on settle.
- `useImportChrome` — the twin's `ide` bag republished onto the React chrome
  (`useIdeChromeData`) — palette JSON parsed back to `PaletteData`, panes that
  are data, `filesBody` through the SAME `FilesPane`; the import leaves mount
  chrome only on the flipped AND-gate verdict.
- `{ok,data}` on `/app/new` paints the §5.3 ready preview inline; pending
  answers navigate to the server-owned poll URL — `refetchInterval` re-asks at
  `pollAfterSeconds` (the meta-refresh's own cadence).

### `apps/web/src/files-labels.ts` — shared FilesPane bag

- pages.tsx's `filesLabels` extracted verbatim (the `ApprovalSettingsSection`
  precedent) — SSR pages AND the SPA import chrome render the ONE bag; the
  REQ-SAFE-10 leaf scan (which requires `COPY.<leaf>` refs inside `src/spa/`)
  stays satisfied because the `COPY.files.*` Record lookups live outside the
  scanned tree.

### Route leaves (REQ-SEQ-9)

- `app.new` / `app.new_.preview` / `p.$project.import` /
  `p.$project.import_.preview` — each warms its twin only on the `"spa"` verdict
  (the handoff path never spends the read); `SsrHandoff` on any other verdict —
  for the import leaves that includes the `onboarding`-only state (the server
  ANDs `ide-chrome` into the boot verdict); `isPending` → `SurfaceShell`;
  non-401 → designed error. `/app/new/preview` redirects to `/app/new` when
  `?qk` is absent (the SSR's own branch).

### `packages/ui/src/conversion.tsx` — heading-order fix

- The conversion panes' headings `h3`→`h2` — under a page `h1` the h3s skipped a
  level (axe `heading-order` violation caught by the mounted-preview check);
  `ConversionNotesCard`'s `h3` stays legal beneath the two `h2`s.

### Stage facts + tests

- `STAGES.dev.spaSurfaces = ["usage","inbox","settings","voices","onboarding",
  "ide-chrome"]` — `ide-chrome` rides with `onboarding` on dev because the import
  legs AND-gate on it (a dev dogfood wants the import legs actually serving);
  preview `[]`; **prod untouched** (`["usage","inbox","settings","voices"]` —
  SPAF.5 owns the flip). `stages.test.ts` pins the shape.

### Tests

- `apps/web/src/spa/onboarding.dom.test.tsx` (**20**): production-router mounts
  on all four leaves — the sheet's hook vocabulary + REQ-TST-2 manifest-emission
  parity vs `renderToStaticMarkup` of the SSR pages; JSON submit grammar +
  envelope-redirect navigation; presign→direct-PUT→`quarantineKey` (PUT headers
  echoed; no bytes in the JSON body); `{ok,data}` inline preview; pending →
  `data-conversion-pending` + server-cadence poll; the ONB.1 hold legs over a
  module-mocked hold-store (every-mount hydration, token stamped only on a real
  attach, second-mount persistence, Discard deletes + clears + repaints);
  `SsrHandoff` on the unflipped `/app/new` verdict AND on the `ide-chrome`-off
  import verdict (the AND-gate, no BFF spend); IDE-chrome rail present on the
  flipped import mount; axe on the sheet + the ready preview.
- `apps/web/src/bff.test.ts` — the SPA.14 block: the four twins (degrade
  parity, `qk` missing → JSON redirect, pending `pollAfterSeconds`, slug 404)
  + the `wantsJson` branches on all four POSTs (JSON `{ok,redirect}` vs form
  302 parity, unauthed split, `importInputFromFields` dual grammar) —
  **124 total green**.
- `spa.dom.test.tsx` — the auth-gate's "no fetch" assertion re-pointed from
  `/app/new` (now a real twin-backed leaf) to `/app/settings/billing` (still a
  stubbed leaf) — same intent, honest fixture.
- `check-protocol-markers.mjs` — `SPA_WEB_SRC_ALLOW` gained `files-labels.` +
  `client/hold-store.` (shared SSR↔SPA leaf modules — the gate's own convention;
  guard worked as designed).
- Retained SSR: the SSR pages' tests stay green — `pages.tsx`'s only functional
  diff is the `filesLabels` extraction (byte-identical render); heading h3→h2 is
  an accessibility fix on both renderers.

## 2 — Verification

| Gate | Result |
|---|---|
| `pnpm turbo build lint typecheck` | **PASS — 135/135 tasks** |
| `pnpm test` (root vitest) | **PASS — 5,254 pass / 4 skip / 0 fail (478 files, 512s)**. A mid-run red: `copy-containment` flagged the `COPY.files` namespace ref (fixed by the `files-labels.ts` extraction) and `spa.dom.test`'s no-fetch gate still pointed at `/app/new` (re-pointed to the stubbed `/app/settings/billing` leaf); `check:dom-contract` flagged six unmanifested hooks (manifested) and `data-venue-stale`'s missing assertion (leg added) — all fixed and the final run is clean |
| `spa/onboarding.dom.test.tsx` | **20 legs green** |
| `bff.test.ts` | **124 legs green** (SPA.14 block incl. dual-mode + `importInputFromFields`) |
| `check:dom-contract` | **PASS** — onboarding vocabulary emitted+asserted |
| `check:spa-budget` | **PASS** — all ceilings held |
| `check:licenses` / `check:protocol-markers` / `check:no-cookies` / `check:spa-env` | **PASS — clean** (markers passed after the allowlist extension) |
| `check-append-only.mjs --base d5645e8` | **PASS** — memory history only grew |
| `check-build-memory.sh .` | **PASS** — structure clean |

## 3 — Preview two-leg + rollback: BLOCKED (recorded honestly)

The ticket's staging-verified ACs (legs A `x-rhema-renderer: ssr`, B flag-on
`--expect-renderer spa`, C full `paid:false` on `pr-<n>`; rollback drill) could
not execute — the operative blocker is **D-MAINT.6-1**: the operator-seeded
shared secret `rhema-nonprod-resend-api-key` does not exist in Secret Manager
project `rhema-507501`. Re-probed this run:

```
gcloud secrets versions access latest --secret=rhema-nonprod-resend-api-key \
  --project=rhema-507501
→ NOT_FOUND: Secret [projects/25012989319/secrets/rhema-nonprod-resend-api-key]
  not found or has no versions.
gcloud secrets list → rhema-prod-resend-api-key only (no nonprod variant).
```

Without it `preview-stack.mjs resend-pull` cannot seed `rhema:resendApiKey`, so
no signed-in preview session can mint through the magic-link + mailbox leg — and
every onboarding gate step (`N1`, `N3`, `N4`, `P1.app-new`) is session-gated.
The residual preview preconditions are unchanged from `D-SPA.6-1`: CI `images`
digests for the head SHA + the `rhema:spaSurfaces` stack config (the import legs
additionally need `ide-chrome` in that set).

**Disposition:** `D-SPA.14-1` (preview two-leg, incl. the AND-gate probe recipe)
+ `D-SPA.14-2` (rollback drill) appended OPEN with the verification recipe and
compensating controls; `D-SPA.6-1` / `D-MAINT.6-1` / `D-OPS.1-1` stay OPEN —
unchanged blockers, no dated note appended (nothing moved). Compensating
deterministic legs cover the same contract: `onboarding.dom.test.tsx` mounts the
production router under flipped, unflipped, and AND-gate-off verdicts
(SsrHandoff + no-BFF-spend asserted on `/app/new` and `/p/:p/import`),
`check:dom-contract` pins SSR⇄SPA vocabulary parity.

## 4 — AC disposition

| AC | Status |
|---|---|
| `/bff/*` twins + envelope mutations for `onboarding` — typed JSON, preserved statuses | **MET (deterministic)** — four GET twins + all four POSTs `wantsJson`-branched; 401/not_found/pending/`pollAfterSeconds` parity; `qk`/`quarantineKey` channel keeps bytes off the BFF |
| React surface emits the full dom-contract vocabulary — component tests + axe | **MET (deterministic)** — manifest parity test vs the SSR markup; axe on the mounted sheet + preview (the h3→h2 fix landed to get there) |
| Retained SSR tests green — the fallback untouched | **MET** — `pages.tsx` diffs are the `filesLabels` extraction + the shared heading fix (byte-identical or a11y-improving on both renderers) |
| Journey legs re-spec'd + `SURFACE_GATES['onboarding']`; preview two-leg A/B/C green on `pr-<n>` | **PARTIAL** — `SURFACE_GATES.onboarding = {N1,N3,N4,P1.app-new}` pre-existing, verified renderer-agnostic + non-vacuous; the AND-gate probe covered deterministically; preview legs **BLOCKED** (§3) → `D-SPA.14-1` OPEN |
| Rollback drill evidence on the preview | **BLOCKED** (§3) — recorded arm `D-SPA.14-2`; compensating deterministic legs mounted instead |
| Import legs IDE-framed — serve only once `ide-chrome` is on | **MET (deterministic)** — server composes `["onboarding","ide-chrome"]` into the boot verdict; the `ide-chrome`-off SsrHandoff + no-BFF-spend leg is test-asserted |
| Held-draft + import-latency flows preserved verbatim | **MET** — ONB.1 hold contract on the shared seam (every-mount hydrate, attach-only stamp, `?hc=`/Discard-only deletes); pending polls at `pollAfterSeconds` (server-owned) |
| Dev stage-fact line; prod untouched | **MET** — `dev.spaSurfaces=[…,"onboarding","ide-chrome"]`; preview `[]` / prod `["usage","inbox","settings","voices"]` pinned |
| Phase-gate AC | **MET** — deferred live legs ledgered (D-SPA.14-1/-2), append-only, requirement ids stamped in the PR |

## 5 — Deviations + notes

- **`filesLabels` shared extraction (deviation, sanctioned):** the REQ-SAFE-10
  leaf scan forbids namespace `COPY.*` refs inside `src/spa/` — the `COPY.files.*`
  Record lookups can't live in the surface file. `files-labels.ts` sits beside
  `pages.tsx` (the gate-card/approval-settings precedent) and both renderers
  import the ONE bag — stronger parity than a per-renderer copy.
- **Protocol-markers allowlist += 2** (`files-labels.`, `client/hold-store.`) —
  the gate caught the new shared modules exactly as designed; both are
  import-free leaf modules (COPY + type-only `@rhema/ui`), amended + its
  test re-verified green.
- **`heldToken` stamps as controlled state** — under happy-dom an imperative
  `.value` stamp on the hidden input is clobbered by the next re-render's
  `defaultValue` pass (hidden inputs read `value` from the attribute there; in
  real DOM the stamp survives but the controlled form is deterministic on both).
  Same attach-only semantics — token rides only on a real `DataTransfer` attach.
- **AND-gate dev co-flip:** `dev.spaSurfaces` gains `onboarding` AND `ide-chrome`
  together — without the chrome key the import legs can never serve SPA on dev,
  so the surface's own dogfood would silently skip its IDE-framed half.
- **`spa.dom.test` gate fixture re-pointed** to `/app/settings/billing` (still a
  stubbed leaf — the `/p/*` layout fetches `/bff/feed-labels`, so only an
  app-level stub isolates the session-seed assertion).
- **`importInputFromFields` dual grammar** — one parser for JSON `qk`/
  `quarantineKey`/`fileName`/`paste` and multipart `file`; the legacy
  `parseImportInput` removed.
- **Size ~2k lines vs ~600 guide** — recorded per SPA.10–13 precedent (the
  four-leg surface + 20-leg test file + the BFF block + the hold-store
  extraction ARE the deliverable).
- **`D-SPA.14-1`/`-2` are new deferral rows**; no other deferral state changed.

## 6 — Closeout addendum (post-PR)

- **PR:** #137 — `stevevitali/spa-14-surface-onboarding` → base
  `stevevitali/spaf-4-prod-flip-voices`. Merge policy OPERATOR — not merged.
- **PR checks (read once at closeout):** `typecheck / lint / unit` — **pending**
  (recorded; the local 135/135 turbo + 5,254-test suite is the deterministic
  evidence; GD-MAINT.4-1's inherited-red waiver stands for the privsep leg only).
- **Commits:** `1ddcff9` implementation + deferral rows; `aa20b28` the
  build-memory closeout.
- **Memory:** `runs/SPA.14.md` (this file), `pr/SPA.14.md` (the PR body),
  BUILD_INDEX row 144, LEDGER advance (`lastCompleted: SPA.14`,
  `nextTicket: SPAF.5`, `chainTip → stevevitali/spa-14-surface-onboarding`),
  PHASE LOG entry appended.
- **Deferrals opened:** `D-SPA.14-1` (preview two-leg A/B/C + the `ide-chrome`
  AND-gate probe — verbatim recipe in-row), `D-SPA.14-2` (rollback-drill arm).
  **None closed** — `D-MAINT.6-1` remains the operative prerequisite
  (re-probed `NOT_FOUND` this run).
- **Final gate state:** `pnpm turbo build lint typecheck` 135/135 ·
  `pnpm test` **5,254 pass / 4 skip / 0 fail** (478 files, 512s) ·
  `check:dom-contract` 26/26 onboarding hooks · `check:spa-budget` /
  `check:licenses` / `check:protocol-markers` / `check:no-cookies` /
  `check:spa-env` all clean.
- **Next:** SPAF.5 (row 116 — prod flip: `onboarding`). Entry gate: REQ-SEQ-10's
  nightly-green chain — `D-SPAF.1-4` .. `D-SPAF.4-4` all still owed; SPAF.5
  authors the dormant flip now and activates only when the operator's
  merge/deploy cadence satisfies the bakes (2026-10-08T19:12Z ruling).
