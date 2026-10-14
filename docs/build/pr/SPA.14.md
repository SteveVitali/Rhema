# SPA.14 — surface: onboarding (`/app/new`, `/app/new/preview`, `/p/:p/import`, `/p/:p/import/preview` → React SPA behind the `onboarding` flag)

**Manifest row 115** · stacks on `stevevitali/spaf-4-prod-flip-voices` @ `d5645e8` · merge policy
**OPERATOR** — do not merge from the build environment · **$0** spend, no deploys, no
production writes.

Implements `docs/tickets/115_SPA.14__surface-onboarding.md` per `docs/design/22` (endpoint
table — `onboarding` rows + §5.3), `docs/design/29` (route-map `onboarding`; `/p/:p/import*`
is the first AND-gated surface — `onboarding` AND `ide-chrome`), `docs/design/27`
(two-leg + rollback mechanics), and `docs/frontend-spa-spec.md` §4/§8/§9.
`STAGES.dev.spaSurfaces` gains `"onboarding"` + `"ide-chrome"` (the import legs are
IDE-framed — dev dogfood needs both keys); preview `[]` and prod
`["usage","inbox","settings","voices"]` stay unchanged (the `onboarding` prod flip is
SPAF.5's own row, gated on the REQ-SEQ-10 bake).

**Deployable dark:** nothing changes for an unflipped request — each leaf's loader skips its
BFF read and `SsrHandoff` document-navigates back to the same server route; for the import
leaves that includes the `onboarding`-only verdict (the server ANDs `ide-chrome` into the
boot map — a client can never serve a chrome-less import). SSR fallback + SSR tests
untouched (REQ-SEQ-11/12). `?ssr=1`/`x-rhema-renderer` overrides ride the unchanged
consult machinery.

## Requirement IDs

**REQ-SEQ-9 · REQ-VFY-8/9 · REQ-BFF-16 · REQ-BFF-15 · REQ-DAT-9/11 · REQ-NAV-5 ·
REQ-ISL-13 (held-draft contract) · REQ-UX-3/4/5/10/13/14/15/16**

## What lands

### The ONB.1 hold seam, shared (REQ-ISL-13)

- `client/hold-store.ts` — the IndexedDB hold primitives + held-notice strings extracted
  verbatim out of `client/landing.ts`; the landing island and the SPA surface now import
  the ONE module (`getHold`/`deleteHold`, 10 MB cap + extension allowlist,
  `heldReadyText`/`heldReattachText`, `HELD_DISCARD_CTA`, `HELD_DISCARDED_TEXT`).
  Deletion still happens only on the token-matched `?hc=` echo or explicit Discard —
  hydration never claims.

### Four read twins + JSON mutation branches (REQ-BFF-1/8/9/15/16, REQ-DAT-1/4)

- `GET /bff/app/new` → `{newProject}` (entry + protocol cards + voices + form state,
  degraded reads land the SSR's own composed shape); `GET /bff/app/new/preview` →
  `{newPreview}` (`?qk` required — missing → JSON `{ok:true,redirect:"/app/new?entry=draft"}`,
  never a 3xx to a JSON caller); `GET /bff/p/:slug/import` + `/import/preview` →
  `{import}`/`{importPreview}` (request-scoped slug memo, unknown → 404 parity; payload
  carries the `ide` bag the leaf republishes onto the React chrome).
- Pending answers carry `pending:{pollAfterSeconds}` — the server-owned cadence the SSR
  meta-refresh keeps (REQ-BFF-15).
- `POST /app/new` · `/app/new/create` · `/p/:p/import/preview` · `/p/:p/import/create`
  `wantsJson`-branched — `{ok,redirect,flash,data,pending,url}` on the SAME
  `?created=`/`?hc=`/`?qk=`+`?src=` vocabulary; unauthed JSON → 401 / form → `/login`.
- `importInputFromFields` — one input grammar over `bodyFields`: JSON `qk`/
  `quarantineKey`/`fileName`/`paste` AND multipart `file` share the parser.

### `spa/surfaces/onboarding.tsx` (~1.05k lines)

- `NewProjectSurface` / `NewProjectPreviewSurface` / `ImportSurface` /
  `ImportPreviewSurface` — the SSR markup vocabulary verbatim (`data-new-project`,
  `data-new-project-form`, `data-entry`, `data-protocol-card`, `data-held*`,
  `data-conversion-*`; `data-phone-blocked` on compact).
- Held hydration verbatim: every-mount `getHold` → `DataTransfer` attach (no
  claim-on-attach) → `heldToken` stamps as **controlled state** (a re-render's
  `defaultValue` pass would clobber an imperative stamp) → filename default title only
  when empty → shared notice + `data-held-discard`; `?hc=` echo deletes only on
  token match + stamps `data-held-consumed`.
- `useOnboardingSubmit` — delegated `onSubmit`: fields collected before the busy pass;
  `nativeEvent.submitter` rides; `File` → presign → direct `PUT` (requiredHeaders echoed)
  → JSON carries `quarantineKey` + `fileName` only — **bytes never ride the JSON body and
  never proxy through the BFF**; `aria-busy` + disabled in flight; `["bff"]` invalidate
  on settle.
- `useImportChrome` — the twin's `ide` bag → `useIdeChromeData` (palette JSON → typed
  `PaletteData`, data panes, `filesBody` through the SAME `FilesPane` + the
  `files-labels.ts` bag both renderers now share).

### Leaves, journey gate, stage fact

- Four leaves warm their twin only on the `"spa"` verdict; `SsrHandoff` /
  `SurfaceShell` / designed error / `notFound` per convention; `/app/new/preview`
  without `?qk` redirects to the sheet (SSR parity).
- `SURFACE_GATES["onboarding"]` = `N1`, `N3`, `N4`, `P1.app-new` — pre-existing,
  renderer-agnostic by construction, verified non-vacuous.
- `STAGES.dev.spaSurfaces = […,"onboarding","ide-chrome"]`; preview `[]`; prod
  `["usage","inbox","settings","voices"]` untouched — `stages.test.ts` pins it.
- `packages/ui/src/conversion.tsx` panes `h3`→`h2` — the mounted-preview axe check
  caught a real heading-order skip (applies to both renderers).

## Tests

- `spa/onboarding.dom.test.tsx` (**20**) — production-router mounts on all four leaves:
  hook vocabulary + REQ-TST-2 emission parity vs the SSR markup, JSON submit grammar +
  envelope nav, presign→PUT→`quarantineKey` (no bytes in JSON), `{ok,data}` inline
  preview, pending `data-conversion-pending` + poll cadence, the ONB.1 hold legs
  (every-mount hydrate, attach-only stamp, second-mount persistence, Discard deletes +
  repaints), `SsrHandoff` on unflipped AND `ide-chrome`-off verdicts (no BFF spend), IDE
  rail on the flipped import mount, axe subset.
- `bff.test.ts` (**124 total**) — the SPA.14 block: four twins (degrade/missing-`qk`
  JSON redirect/`pollAfterSeconds`/slug-404) + all four `wantsJson` branches (envelope vs
  form-302 parity, unauthed split, `importInputFromFields` dual grammar).
- `spa.dom.test.tsx` — the session-seed no-fetch gate re-pointed `/app/new` →
  `/app/settings/billing` (now a real twin-backed leaf vs still-stubbed leaf).
- `check-protocol-markers.mjs` — `SPA_WEB_SRC_ALLOW` += `files-labels.` +
  `client/hold-store.` (the shared-leaf convention; guard worked as designed).

## Verification

`pnpm turbo build lint typecheck` **135/135** · `pnpm test` **5,254 pass / 4 skip / 0 fail
(478 files)** — mid-run reds all fixed: the `COPY.files` namespace ref (shared
`files-labels.ts` extraction), the auth-gate's stale `/app/new` fixture (re-pointed to
the stubbed `/app/settings/billing` leaf), six unmanifested hooks + a missing
`data-venue-stale` assertion (manifest + leg added) · `check:dom-contract` onboarding
26/26 hooks emitted+asserted · `check:spa-budget` ceilings held · `check:licenses`,
`check:protocol-markers`, `check:no-cookies`, `check:spa-env` clean ·
`check-append-only` + `check-build-memory` clean.

## Preview two-leg + rollback — BLOCKED (recorded honestly)

**`D-MAINT.6-1` is the operative blocker:** the operator-seeded shared secret
`rhema-nonprod-resend-api-key` does not exist in `rhema-507501` — re-probed this run
(`gcloud secrets versions access latest` → `NOT_FOUND`; only `rhema-prod-resend-api-key`
exists). Without it `preview-stack.mjs resend-pull` cannot seed `rhema:resendApiKey`, so
no signed-in preview session mints through the magic-link + mailbox leg — and every
`onboarding` gate step (`N1`, `N3`, `N4`, `P1.app-new`) is session-gated. Residual
preconditions additionally: CI `images` digests for the head SHA + `rhema:spaSurfaces`
stack config (`ide-chrome` needed for the import legs).

**Disposition:** `D-SPA.14-1` (legs A/B/C recipe verbatim incl. the AND-gate probe) +
`D-SPA.14-2` (rollback drill arm) appended OPEN in DEFERRALS.md. Compensating
deterministic legs: flipped, unflipped, AND `ide-chrome`-off router mounts (SsrHandoff +
no-BFF-spend asserted), `check:dom-contract` SSR⇄SPA parity, `SURFACE_GATES["onboarding"]`
renderer-agnostic green steps.

## Notes for the operator

- When `rhema-nonprod-resend-api-key` is seeded: leg A `--pin-renderer ssr
  --expect-renderer ssr`; leg B `preview-stack.mjs config pr-<n> rhema:spaSurfaces
  "usage,inbox,settings,voices,onboarding,ide-chrome"` + `--expect-renderer spa
  --surface onboarding` (the AND-gate probe: `/p/:p/import*` must serve SSR with
  `ide-chrome` dropped); leg C `paid:false`; rollback = drop `onboarding` from the
  stack config → `up` → re-run leg A.
- The prod flip is SPAF.5 (its own row) — gated on SPAF.4's REQ-SEQ-10 nightly-green
  chain (D-SPAF.1-4 → D-SPAF.2-4 → D-SPAF.3-4 → D-SPAF.4-4).
- Merge policy `OPERATOR` — the stack merges bottom-up; this run does not merge.
