# SPA.13 — surface: voices (`/voices`, `/voices/new`, `/v/:persona`, `/p/:p/voice/reseed` → React SPA behind the `voices` flag)

**Manifest row 113** · stacks on `stevevitali/spaf-3-prod-flip-settings` @ `66a6ab6` · merge policy
**OPERATOR** — do not merge from the build environment · **$0** spend, no deploys, no
production writes.

Implements `docs/tickets/113_SPA.13__surface-voices.md` per `docs/design/22` (endpoint table —
`voices` rows + §5/E-2 upload seam), `docs/design/29` (route-map `voices`), `docs/design/27`
(two-leg + rollback mechanics), and `docs/frontend-spa-spec.md` §4/§8/§9.
`STAGES.dev.spaSurfaces` gains `"voices"`; preview `[]` and prod `["usage","inbox","settings"]`
stay unchanged (the `voices` prod flip is SPAF.4's own row, gated on the REQ-SEQ-10 bake).

**Deployable dark:** nothing changes for an unflipped request — each leaf's loader skips its
BFF read and `SsrHandoff` document-navigates back to the same server route. SSR fallback +
SSR tests untouched (REQ-SEQ-11/12). The connect-src + GCS bucket-CORS upload prerequisite
lands dark in this ticket (no traffic change; it's the earliest browser-upload consumer).
`?ssr=1`/`?renderer=spa`/`x-rhema-renderer` overrides ride the unchanged consult machinery.

**Resumed run:** two prior sessions were killed mid-run leaving WIP commits `a46d935` (BFF
twins + query loaders + upload-CORS infra + dev stage fact) and `b705a4e` (the
`quarantineKey` mutation channel). Both audited line-by-line against design/22 + the SSR
composition and kept; this PR carries the audit + the surface/leaves/tests/closeout on top.

## Requirement IDs

**REQ-SEQ-9 · REQ-VFY-8/9 · REQ-BFF-16/24 · REQ-DAT-9 · REQ-TL-13 ·
REQ-UX-3/4/5/10/13/14/15/16**

## What lands

### Four read twins + the presign mint (REQ-BFF-1/8/9/16, REQ-DAT-1/4/9)

- `GET /bff/voices` → `{voices}` — the §9.1 three-group library verbatim;
  `swallowDegraded` → `null`, never fabricated; upstream 401 → `{error:"unauthenticated"}`.
- `GET /bff/voices/new` → `{voiceNew:{}}` — registered ahead of `/bff/voices/:persona`
  (test-asserted); the marker the leaf warms for the uniform pending/error path.
- `GET /bff/voices/:persona` → the §9.5 five-tab aggregate: `detail`+`estimate`+
  `updatePlan` always; `?tab=samples` pulls `connections`, `&sample=` pulls the drawer
  seam; off-tab seams stay absent. Unknown persona → 404 `not_found` (document parity).
- `GET /bff/p/:slug/voice/reseed` → `{slug, projectId, preview}` — slug→id via the
  request memo; unknown slug AND missed preview → 404.
- `POST /bff/import/presign` → the signed-URL contract (url, key, max bytes, required
  headers). The browser PUTs to GCS directly; **the BFF mints, never proxies bytes**;
  no upload seam on a web build → 503 `{error:"upload_unavailable"}`.

### JSON mutation branches (REQ-BFF-1/2/3/16)

- Every voices POST gains the `wantsJson` split — JSON callers get
  `mutationOutcome({redirect})` 200s on the SAME `?saved`/`?added`/`?cancelled`/
  `?corrected`/`?build_failed` targets the form leg 302s to, or `{error:"unauthenticated"}`
  401 with no session; form callers keep the 302 verbatim.
- `quarantineKey` channel: the presign leg's object key rides the JSON mutation into
  `addVoiceSample` — file bytes never transit the BFF. Refusals keep document shape:
  missing-name carries the SSR copy + stable code; refused build → `?build_failed=1`;
  gate decisions require `runId`; typed delete requires `confirm=delete`; the reseed
  adopt resolves slug→row (unknown slug → 404).

### Upload prereq, dark (deliverable 9 — R21/E-2)

- `connect-src` admits the GCS origin for the browser's direct-PUT leg
  (`GCS_UPLOAD_ORIGIN` env → `gcsUploadOrigin` dep; defaults
  `https://storage.googleapis.com`, invalid falls back closed).
- `infra/pulumi`: bucket CORS from `rhema:uploadCorsOrigins` on non-prod — explicit
  app/preview origins, PUT-only + signed extension headers, **no wildcard**; prod admits
  `domains.app` from stage/domain facts. Documented in `infra/PROD-BRINGUP.md`
  (runbook-completeness green).

### `spa/surfaces/voices.tsx` (~1.35k lines — the largest leaf surface)

- `VoicesSurface` / `VoiceNewSurface` / `VoiceDetailSurface` / `VoiceReseedSurface` — SSR
  markup vocabulary verbatim (`data-voice-card`, `data-source`, `data-sample`,
  `data-drawer`, `data-gate-*`, `data-build-*`, `data-reseed-*`, `data-voice-delete`, …).
  `check:dom-contract` **116/116** emitted+asserted.
- `useVoiceFormSubmit` — delegated `onSubmit`: `nativeEvent.submitter` captured so
  `intent`/`action`/`included`/`reseed` values reach the JSON body; file-capable forms run
  presign → direct `PUT` (requiredHeaders echoed verbatim) → mutation carries only
  `quarantineKey`; `redirect` → router nav, `url` → doc nav; `aria-busy` + disabled in
  flight (REQ-UX-16); `["bff"]` invalidate on settle — server-truth repaint.
- Hidden `name="quarantineKey"` inputs precede file inputs so the inert empty value can't
  shadow the presign leg's real key.
- SSR inline literals lifted to COPY leaves (`urlPlaceholder`, `gateWaitingFmt`,
  `advancedTag`, `adoptReseedCta`, `reseedNoCharter`, `reseedGuidanceKept/Lost`,
  `providerLabel`, `deletePlaceholder`) — `pages.tsx` reads the same leaves; rendered
  output byte-identical. `voice.detail.advancedTag` enumerated under the §6.5
  "Advanced" role-guard (same sanctioned progressive-disclosure role).

### Route leaves + search schema (REQ-SEQ-9, REQ-NAV-6)

- All four leaves warm their twin only on the `"spa"` verdict (the handoff path never
  spends the read); `SsrHandoff`/`SurfaceShell`/designed-error/`notFound` per convention.
- `v.$persona` validates `tab` + consumes the five flash params via `flagParam`
  (`?saved=1` parses numeric — `flagParam` normalizes `"1"`/`1`/`""` → `"1"`).

### Journey gate + dev flag

- `SURFACE_GATES["voices"]` = `T5`, `X1.voices` — already registered (renderer-agnostic by
  construction); verified in-tree, non-vacuous.
- `STAGES.dev.spaSurfaces = ["usage","inbox","settings","voices"]`; preview `[]`; prod
  `["usage","inbox","settings"]` untouched — `stages.test.ts` pins the shape.

## Tests

- `spa/voices.dom.test.tsx` (**37**) — production-router mounts on all four leaves:
  manifest emission parity vs the SSR twin's `renderToStaticMarkup`, every tab's hooks +
  literals, JSON mutations + `["bff"]` refetch, submitter-value capture, the
  presign→PUT→`quarantineKey` leg (headers echoed; no bytes in JSON), deferred-mutation
  `aria-busy`/disabled, `SsrHandoff` + no-BFF-spend, 401 → `/login` doc-nav, non-401
  designed error, degraded-null halves, twin-404 → `notFound`, search-keyed remount, flash
  params, axe subset.
- `bff.test.ts` +**31 legs** — the five twins + presign + representative `/v/:persona/*`
  dual-modes (seed CSV decode, confirm array/repeated-field fold, gate runId no-op, typed
  delete, reseed adopt; JSON `{ok,redirect}` vs form-302 parity; unauthed split).
- Retained SSR: the voices pages' SSR tests stay green — the `pages.tsx` diff is
  COPY-leaf lifts only (byte-identical render); the SSR file remains the fallback's own
  coverage (REQ-VFY-9 disposition: render asserts have React-twin counterparts via
  `expectManifestEmission`).
- `copy-containment.test.ts` green — one scanner restructure (a JSX ternary formatted as
  bare "text" → named elements; zero copy moved).

## Verification

`pnpm turbo build lint typecheck` **90/90** · `pnpm test` **5,202 pass / 4 skip / 1 fail**
(first run — the new `voice.detail.advancedTag` leaf needed enumeration under the §6.5
role-guard; fixed + re-verified 6/6) · `check:dom-contract` **637/18; voices 116/116** ·
`check:spa-budget` ceilings held · `check:licenses`, `check:protocol-markers`,
`check:no-cookies`, `check:spa-env` clean · `check-append-only` + `check-build-memory`
clean (0 violations).

## Preview two-leg + rollback — BLOCKED (recorded honestly)

**`D-MAINT.6-1` is the operative blocker:** the operator-seeded shared secret
`rhema-nonprod-resend-api-key` does not exist in `rhema-507501` — re-probed this run
(`gcloud secrets versions access latest` → `NOT_FOUND`; only `rhema-prod-resend-api-key`
exists). Without it `preview-stack.mjs resend-pull` cannot seed `rhema:resendApiKey`, so no
signed-in preview session mints through the magic-link + mailbox leg — and every `voices`
gate step (`T5`, `X1.voices`) is session-gated. Residual preconditions additionally: CI
`images` digests for the head SHA + `rhema:spaSurfaces` stack config.

**Disposition:** `D-SPA.13-1` (legs A/B/C recipe verbatim) + `D-SPA.13-2` (rollback drill
arm) appended OPEN in DEFERRALS.md; `D-SPA.6-1`, `D-MAINT.6-1`, `D-OPS.1-1`
blocker-updated, stay OPEN. Compensating deterministic legs: flipped AND unflipped router
mounts (SsrHandoff + no-BFF-spend asserted on all four leaves), `spa-flag.test.ts`
override semantics, `check:dom-contract` 116/116 SSR⇄SPA parity, `SURFACE_GATES["voices"]`
renderer-agnostic green steps.

## Notes for the operator

- When `rhema-nonprod-resend-api-key` is seeded: leg A `--pin-renderer ssr
  --expect-renderer ssr`; leg B `preview-stack.mjs config pr-<n> rhema:spaSurfaces
  "usage,inbox,settings,voices"` + `--expect-renderer spa --surface voices`; leg C
  `paid:false`; rollback = drop `voices` from the stack config → `up` → re-run leg A.
  Previews additionally need `rhema:uploadCorsOrigins` set to the preview web origin for
  the PUT leg to succeed live.
- The prod flip is SPAF.4 (its own row) — gated on SPAF.3's REQ-SEQ-10 nightly-green
  chain (D-SPAF.1-4 → D-SPAF.2-4 → D-SPAF.3-4).
- Merge policy `OPERATOR` — the stack merges bottom-up; this run does not merge.
