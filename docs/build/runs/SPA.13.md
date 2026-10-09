# SPA.13 — surface: voices (run ledger)

- **Status:** DONE (deterministic legs; preview two-leg + rollback BLOCKED — see §3; recorded honestly)
- **Harness:** Devin CLI (agentic coding subagent); model: Cognition Devin; tier: n/a (build work)
- **Ticket:** `docs/tickets/113_SPA.13__surface-voices.md` (manifest row 113)
- **Branch:** `stevevitali/spa-13-surface-voices`, stacked on
  `stevevitali/spaf-3-prod-flip-settings` @ `66a6ab6` (`OPERATOR` merge policy, **not merged**).
- **Goal:** migrate the `voices` surface (`/voices`, `/voices/new`, `/v/:persona`,
  `/p/:p/voice/reseed`) to the React SPA behind the `voices` flag — BFF read twins, JSON
  mutation branches (incl. the presign→direct-PUT upload leg), ported components emitting
  the manifest vocabulary verbatim, component tests/axe, retained SSR, journey gate, the dev
  stage-fact line (REQ-SEQ-9) + the dark upload prereq (connect-src + bucket-CORS).
- **Spend:** $0. No deploys, no production writes, no live legs (preview blocked — §3).
- **Resumed run (third session):** two prior sessions were killed mid-run, leaving WIP commits
  `a46d935` (BFF twins + query loaders + the upload-CORS infra prereq) and `b705a4e`
  (`quarantineKey` BFF channel for presigned uploads). This run audited both line-by-line
  against design/22 + the SSR composition — twins/degrade semantics/envelope/memo/CORS plan
  all faithful — kept them, and landed the surface + leaves + tests + closeout on top.
  (The operator's 2026-10-08T23:05Z dispatch-tier ruling followed the second kill —
  PHASE LOG.)

## 0 — Context load

- DEFERRALS.md read first (per AGENTS): `D-SPA.6-1` assessed — still OPEN; blocker note
  appended. `D-MAINT.6-1` is the operative shared blocker (the operator-seeded
  `rhema-nonprod-resend-api-key` secret — re-probed this run, still absent; `D-OPS.1-1`
  blocker-updated to match). `D-SPAF.1-1..4` / `D-SPAF.2-1..4` / `D-SPAF.3-1..4` read;
  untouched (prod deploys are operator-run; REQ-SEQ-10 nightly-green gates SPAF.4).
- LEDGER CURRENT STATE read: `nextTicket: SPA.13`, `chainTip:
  stevevitali/spaf-3-prod-flip-settings`, `mergePolicy: OPERATOR`, `round: 4`.
- Entry gate: SPA.1–12 + SPAF.1–3 landed — BUILD_INDEX rows through 141 carry them
  (unmerged stack). Asserted, not re-derived.
- Design sources applied: `docs/design/22` §2 voices rows + §5/E-2 upload seam,
  `docs/design/29` route-map `voices` row, `docs/design/27` two-leg + rollback mechanics,
  spec `docs/frontend-spa-spec.md` §4/§8/§9, REQ-DAT-9 (upload asset parity),
  REQ-BFF-16/24.

## 1 — What landed

### `apps/web/src/server.ts` — four read twins + presign (WIP `a46d935`/`b705a4e`, audited & kept)

- `GET /bff/voices` → `{voices}` — the §9.1 three-group library verbatim;
  `swallowDegraded` → `null`; upstream 401 rethrows into the `{error:"unauthenticated"}`
  envelope (never swallowed).
- `GET /bff/voices/new` → `{voiceNew:{}}` — the sheet composes no remote reads today; the
  twin is the marker the leaf warms for the uniform pending/error path. Registration order
  pins `/bff/voices/new` ahead of `/bff/voices/:persona` (test-asserted).
- `GET /bff/voices/:persona` → the §9.5 five-tab aggregate — `detail` + `estimate` +
  `updatePlan` always; `?tab=samples` pulls `connections`, `&sample=<id>` pulls the drawer
  seam; off-tab seams stay absent (never fabricated). Unknown persona → 404
  `{error:"not_found"}` — the document's own answer.
- `GET /bff/p/:slug/voice/reseed` → `{slug, projectId, preview}` — slug→id through the
  per-request memo; unknown slug AND missed preview → 404 (SSR degrade parity).
- `POST /bff/import/presign` → the signed-URL contract (url, key, max bytes, required
  headers) — the browser PUTs to GCS directly; the BFF mints, never proxies bytes
  (REQ-BFF-16). No upload seam wired on a web build → 503 `{error:"upload_unavailable"}`.

### JSON mutation branches (REQ-BFF-1/2/3/16/17)

- Every voices POST gained the `wantsJson` split — no session → JSON `{error:
  "unauthenticated"}` 401 / form `/login` redirect verbatim; success → `mutationOutcome(c,
  {redirect})` on the SAME redirect targets the form leg emits (`?saved=1`, `?added=1`,
  `?cancelled=1`, `?corrected=1`, `?build_failed=1`, `/voices`, `/v/:p`, …).
- `quarantineKey` channel (`b705a4e`): JSON bodies carry the presign leg's object key into
  `addVoiceSample` — file bytes never transit the BFF (REQ-BFF-16). Form posts keep the
  multipart/text legs untouched.
- Refusals keep the document's own shape: missing name → the JSON refusal carries the SSR's
  copy + stable code; refused build → `{redirect:"…?build_failed=1"}`; the gate decision
  requires `runId` (a stale page's POST is a no-op); typed delete needs `confirm=delete`;
  the reseed adopt resolves slug→row (unknown slug → 404).

### Upload prereq, dark (deliverable 9 — R21/E-2)

- `connect-src` admits the GCS origin for the browser's direct-PUT leg —
  `deps.gcsUploadOrigin ?? "https://storage.googleapis.com"` (URL-derived origin; invalid
  env falls back to the literal). `main.ts` wires `GCS_UPLOAD_ORIGIN` through.
- `infra/pulumi/data.ts` — bucket CORS from `rhema:uploadCorsOrigins` config on non-prod
  (explicit app/preview origins, PUT-only + signed extension headers, **no wildcard**);
  prod admits `domains.app` unconditionally from the stage/domain facts.
  `data.test.ts` +48 lines pins the matrix. `infra/PROD-BRINGUP.md` documents the key
  (runbook-completeness green).

### `apps/web/src/spa/surfaces/voices.tsx` — the surface (~1.35k lines)

- `VoicesSurface` (three-group library + group headings), `VoiceNewSurface` (create sheet —
  description/registers/samples + presign file leg), `VoiceDetailSurface` (overview/samples/
  measures/sources/detail tabs + drawer + corrections + gates + connections + danger zone),
  `VoiceReseedSurface` (charter diff preview + adopt/fork) — the SSR markup vocabulary
  verbatim (`data-voice-card`, `data-source`, `data-sample`, `data-drawer`, `data-gate-*`,
  `data-reseed-diff`, `data-guidance-preserved`, `data-build-voice`, `data-voice-delete`,
  …).
- `useVoiceFormSubmit` — the delegated `onSubmit` on the `data-spa-surface` wrapper:
  submitter captured from `event.nativeEvent.submitter` (`intent`/`action`/`included`/
  `reseed` values reach the JSON body — the SSR relied on the browser's implicit submitter
  serialization); file-capable forms run presign → direct `PUT` (requiredHeaders echoed
  verbatim) → mutation JSON carries only `quarantineKey`; `redirect` → router nav, `url` →
  document nav; `aria-busy` + disabled controls in flight (REQ-UX-16); `["bff"]`
  invalidation on settle (server-truth repaint).
- Hidden `name="quarantineKey"` inputs sit AHEAD of the file inputs so the inert empty
  value cannot shadow the real key the presign leg injects (emission-scan + runtime-safe).
- Null read halves render the sections' own absent/`null` states — the SSR's degrade
  branches verbatim; flash params stay URL state, never payload.

### Route leaves + search schema (REQ-SEQ-9, REQ-NAV-6)

- `voices.index` / `voices_.new` / `v.$persona` / `p.$project.voice.reseed` leaves warm
  their twin **only** on the `"spa"` verdict (the handoff path never spends the read);
  component re-consults `isSpaEnabled` → `SsrHandoff`; `isPending` → `SurfaceShell`;
  non-401 → designed error; twin-404 → `notFound()`.
- `v.$persona` validates `tab` and consumes the flash params — `flagParam` for
  `saved`/`added`/`cancelled`/`corrected`/`build_failed` (the router parses `?saved=1` as
  numeric `1`; `flagParam` normalizes `"1"`/`1`/`""` → `"1"` without stringifying `true`).

### `apps/web/src/dom-contract.ts` — voices vocabulary completed

- → **116 hooks**: the attribute/field/url-param families across all four sub-pages
  (`data-voice-*`, `data-source*`, `data-sample*`, `data-drawer*`, `data-gate-*`,
  `data-build-*`, `data-reseed-*`, `data-adopt-*`, `data-connection-*`,
  `data-reconstruct`, field families `include`/`known`/`intent`/`action`/`reseed`/
  `quarantineKey`, urlparams `tab`/`sample`/`saved`/`added`/`cancelled`/`corrected`/
  `build_failed`). `check:dom-contract`: **637 entries / 18 surfaces; voices 116/116
  emitted+asserted.**

### Journey gate + dev flag

- `SURFACE_GATES["voices"]` already existed: `T5`, `X1.voices` — renderer-agnostic by
  construction (the steps walk DOM hooks, not the renderer); verified in-tree, no vacuous
  gate.
- `STAGES.dev.spaSurfaces = ["usage","inbox","settings","voices"]` — the surface's dev
  line (REQ-SEQ-3/9; landed in the audited WIP). Preview `[]` (flips only via
  `rhema:spaSurfaces`); **prod untouched** — `["usage","inbox","settings"]` stays SPAF.3's;
  `voices`'s prod flip is SPAF.4 gated on the REQ-SEQ-10 bake. `stages.test.ts` pins it.

### `apps/web/src/copy.ts` — lifted literals (copy-containment)

- The SSR voices markup carried inline literals the SPA port could not re-emit (the
  containment scanner requires COPY leaves): `urlPlaceholder` (`https://…` ×3),
  `gateWaitingFmt`, `advancedTag` (`(Advanced)`), `adoptReseedCta`, `reseedNoCharter`,
  `reseedGuidanceKept`/`reseedGuidanceLost`, `providerLabel` map, `deletePlaceholder`.
  `pages.tsx` now reads the same leaves — rendered output byte-identical, one copy source.
- `copy.test.ts` role-guard enumerated `voice.detail.advancedTag` under the §6.5
  progressive-disclosure exception (the same sanctioned "Advanced" role — the tag was
  already inline in SSR; lifting it to a leaf didn't change the role).

### Tests

- `apps/web/src/spa/voices.dom.test.tsx` (**37**): production-router mounts on all four
  leaves — manifest emission parity vs `renderToStaticMarkup` of the SSR twin, every
  tab's hooks + representative literals, JSON mutation branches (post + redirect +
  `["bff"]` refetch), submitter-value capture (`intent`/`action`/`included`/`reseed`),
  the presign→PUT→`quarantineKey` leg (requiredHeaders echoed; no bytes in the JSON),
  deferred-mutation `aria-busy`/disabled, `SsrHandoff` on the unflipped verdict + no BFF
  spend, 401 → session-drop + `/login` doc-nav, non-401 → designed error, degraded-null →
  absent halves, twin-404 → `notFound`, search-keyed remount on confirm navigation,
  flash params incl. `?saved=1`/`?build_failed=1`, axe subset.
- `bff.test.ts` — the SPA.13 block (**31 legs**): the five twins + presign + the
  create-sheet + representative `/v/:persona/*` dual-modes (seed/confirm arrays/gate-runId/
  typed delete/reseed adopt; JSON `{ok,redirect}` vs form 302 parity; unauthed split).
- Retained SSR: the voices SSR pages' tests stay green — markup moved only where a literal
  was lifted to a COPY leaf (byte-identical output); the SSR file remains the fallback
  renderer's own coverage (REQ-VFY-9 disposition: render asserts now have React-twin
  counterparts via `expectManifestEmission`).
- `copy-containment.test.ts` green — one scanner restructure: a JSX ternary's arm
  formatting read as bare "text" (`) : emptyPara`); hoisted the branches into named
  elements / an IIFE so the scanner sees control flow, not copy (zero copy moved).

## 2 — Verification

| Gate | Result |
|---|---|
| `pnpm turbo build lint typecheck` | **PASS — 90/90 tasks** (this checkout; the 135-task count on prior rows was the wider workspace cache run) |
| `pnpm test` (root vitest) | **5,202 pass / 4 skip / 1 fail** on the full run — the one fail was the copy-lint role-guard on the new `voice.detail.advancedTag` leaf; enumerated under the §6.5 exception + re-run green (6/6) |
| `spa/voices.dom.test.tsx` | 37 legs green |
| `bff.test.ts` | 79 legs green (31 new voices legs) |
| `copy-containment.test.ts` | 57 legs green |
| `runbook-completeness.test.ts` | 3 legs green (`rhema:uploadCorsOrigins` documented) |
| `check:dom-contract` | **PASS — 637 entries / 18 surfaces; voices 116/116** |
| `check:spa-budget` | **PASS** — all ceilings held |
| `check:licenses` / `check:protocol-markers` / `check:no-cookies` / `check:spa-env` | **PASS — clean** |
| `check-append-only.mjs --base 66a6ab6` | **PASS** (after repairing the operator-ruling entry's position — §5) |
| `check-build-memory.sh .` | **PASS — 0 violations** (7 inherited warnings, none new) |

## 3 — Preview two-leg + rollback: BLOCKED (recorded honestly)

The ticket's staging-verified ACs (legs A `x-rhema-renderer: ssr`, B flag-on
`--expect-renderer spa`, C full `paid:false` on `pr-<n>`; rollback drill) could not
execute — the operative blocker is **D-MAINT.6-1**: the operator-seeded shared secret
`rhema-nonprod-resend-api-key` does not exist in Secret Manager project `rhema-507501`.
Re-probed this run:

```
gcloud secrets versions access latest --secret=rhema-nonprod-resend-api-key \
  --project=rhema-507501
→ NOT_FOUND: Secret [projects/25012989319/secrets/rhema-nonprod-resend-api-key]
  not found or has no versions.
gcloud secrets list → rhema-prod-resend-api-key only (no nonprod variant).
```

Without it `preview-stack.mjs resend-pull` cannot seed `rhema:resendApiKey`, so no
signed-in preview session can mint through the magic-link + mailbox leg — and every voices
gate step (`T5`, `X1.voices`) is session-gated. The residual preview preconditions are
unchanged from `D-SPA.6-1`: CI `images` digests for the head SHA + the `rhema:spaSurfaces`
stack config, in addition to the secret.

**Disposition:** `D-SPA.13-1` (preview two-leg) + `D-SPA.13-2` (rollback drill) appended
OPEN with the verification recipe and compensating controls; `D-SPA.6-1` / `D-MAINT.6-1` /
`D-OPS.1-1` stay OPEN — dated blocker notes appended. Compensating deterministic legs cover
the same contract: `voices.dom.test.tsx` mounts the production router under flipped and
unflipped verdicts (SsrHandoff + no-BFF-spend asserted on all four leaves),
`spa-flag.test.ts` pins the override semantics, `check:dom-contract` pins SSR⇄SPA
vocabulary parity at 116/116.

## 4 — AC disposition

| AC | Status |
|---|---|
| `/bff/*` twins + envelope mutations for `voices` — typed JSON, preserved statuses | **MET (deterministic)** — four GET twins + presign + every voices POST `wantsJson`-branched; 401/not_found/envelope parity; `quarantineKey` channel keeps bytes off the BFF |
| React surface emits the full dom-contract vocabulary — component tests + axe | **MET (deterministic)** — 116/116 hooks emitted+asserted; `expectManifestEmission` + axe on the mounted surface |
| Retained SSR tests green — the fallback untouched | **MET** — SSR pages' diffs are COPY-leaf lifts only (byte-identical render); the fallback renderer's own tests stay green |
| Journey legs re-spec'd + `SURFACE_GATES['voices']`; preview two-leg A/B/C green on `pr-<n>` | **PARTIAL** — `SURFACE_GATES.voices = {T5, X1.voices}` verified in-tree (pre-existing, renderer-agnostic, non-vacuous); preview legs **BLOCKED** (§3) → `D-SPA.13-1` OPEN |
| Rollback drill evidence on the preview | **BLOCKED** (§3) — recorded arm `D-SPA.13-2`; compensating deterministic legs mounted instead |
| Upload prereq dark — connect-src + GCS bucket-CORS | **MET** — `GCS_UPLOAD_ORIGIN`-driven connect-src + `rhema:uploadCorsOrigins` CORS (PUT-only, explicit origins, no wildcard; prod admits `domains.app` from stage facts); no traffic change |
| Multipart + presign→direct-PUT preserved (REQ-DAT-9, REQ-BFF-16) | **MET** — BFF mints the presign, browser PUTs to GCS, mutation JSON carries `quarantineKey` only; form multipart legs untouched |
| Dev stage-fact line; prod untouched | **MET** — `dev.spaSurfaces=[…,"voices"]`; preview `[]` / prod `["usage","inbox","settings"]` pinned |
| Phase-gate AC | **MET** — deferred live legs ledgered (D-SPA.13-1/-2), append-only, requirement ids stamped in the PR |

## 5 — Deviations + notes

- **Resumed-run audit (two WIPs):** `a46d935` (BFF twins, query loaders, connect-src +
  upload-CORS infra, dev stage fact) and `b705a4e` (`quarantineKey` channel) audited
  line-by-line against design/22 §2/§5 + the SSR composition — kept, built on. The impl
  commit carries the surface + leaves + contract + tests on top.
- **PHASE LOG ordering repair:** the operator-ruling commit `96ab0f5` inserted its entry
  (23:05Z) *before* the SPAF.3 entry (22:15Z) — the operator's session wrote it before
  SPAF.3's closeout line existed in its working copy. The entry moved to the tail (its
  timestamp is the newest; "newest last" holds) — the append-only check now passes vs base;
  no entry content was edited.
- **Copy-lint enumeration:** `voice.detail.advancedTag` (`(Advanced)` — the §6.5
  progressive-disclosure tag the SSR carried inline) joins the copy.test.ts role-guard
  allow-list — same sanctioned role, new leaf key. The lint caught the lift; the fix
  enumerates rather than weakens.
- **Submitter capture:** the SPA's delegated submit reads `nativeEvent.submitter` so
  multi-button forms (`intent`/`action`/`included`/`reseed`) carry the clicked value into
  the JSON body — the SSR relied on implicit browser serialization. Pinned by test.
- **Search-flag parsing:** `?saved=1` parses numeric under the router; `flagParam` (not
  `strParam`) normalizes `"1"`/`1`/`""` — the `v.$persona` leaf consumes all five flash
  flags.
- **Confirm-navigation repaint:** the confirm mutation's redirect drops `?sample=…` → an
  envelope nav + fresh repaint; the test re-queries the mounted root post-navigation (the
  drawer reference goes stale by design).
- **`quarantineKey` hidden inputs** precede the file inputs so the inert empty value can't
  shadow the presign leg's real key — emission-scan requirement + runtime ordering both
  satisfied.
- **`D-SPA.13-1`/`-2` are new deferral rows**; `D-SPA.6-1`, `D-MAINT.6-1`, `D-OPS.1-1`
  blocker-updated (same secret + images + config prerequisites). No other deferral state
  changed.
- **Size ~3.3k lines vs ~600 guide** — recorded per SPA.10–12 precedent (the largest leaf
  surface + its 37-leg test file + the 31-leg BFF block ARE the deliverable; the ticket
  itself flags voices as the largest leaf surface).

## 6 — Closeout addendum (post-PR)

- **PR:** #135 — `gh pr create --base stevevitali/spaf-3-prod-flip-settings` (stacked;
  **not merged** — `OPERATOR` policy). State at closeout: OPEN, MERGEABLE.
- **Checks read (at closeout):** `typecheck / lint / unit` — **pending** (run
  37881093567 queued on the impl push; the docs head re-queues — recorded honestly, not
  claimed). The inherited `integration`/privsep red that bound earlier rows is waived for
  this + descendant PRs per GD-MAINT.4-1.
- **Commits:** impl `9f00b07` (on top of the audited+kept WIPs `a46d935`/`b705a4e` and the
  operator ruling `96ab0f5`) · docs/closeout + this ledger — see the branch tip.
- **Build memory:** `runs/SPA.13.md` + `pr/SPA.13.md` committed · BUILD_INDEX row 142 ·
  LEDGER `lastCompleted: SPA.13`, `nextTicket: SPAF.4`, `chainTip:
  stevevitali/spa-13-surface-voices` · PHASE LOG entry appended · `check-append-only`
  clean vs `66a6ab6` (the operator-ruling entry re-positioned to the tail — §5) ·
  `check-build-memory` 0 violations.
- **Chain tip left behind:** `stevevitali/spa-13-surface-voices` — next row (SPAF.4, prod
  flip: `voices`) stacks here; SPAF.4's entry gate still requires the REQ-SEQ-10
  nightly-green chain (D-SPAF.1-4 → D-SPAF.2-4 → D-SPAF.3-4) at activation time.
- **Spend:** $0 · zero production writes · zero deploys.
