# SPA.12 — surface: settings (run ledger)

- **Status:** DONE (deterministic legs; preview two-leg + rollback BLOCKED — see §3; recorded honestly)
- **Harness:** Devin CLI (agentic coding subagent); model: Cognition Devin; tier: n/a (build work)
- **Ticket:** `docs/tickets/111_SPA.12__surface-settings.md` (manifest row 111)
- **Branch:** `stevevitali/spa-12-surface-settings`, stacked on
  `stevevitali/spaf-2-prod-flip-inbox` @ `8ccfc40` (`OPERATOR` merge policy, **not merged**).
- **Goal:** migrate the `settings` surface (`/app/settings` + 5 sections, `/p/:p/settings`)
  to the React SPA behind the `settings` flag — BFF read twins, JSON mutation branches,
  ported components emitting the manifest vocabulary verbatim, component tests/axe,
  retained SSR, journey gate, the dev stage-fact line (REQ-SEQ-9). All 6+1 sub-pages as
  ONE flip (Q-14).
- **Spend:** $0. No deploys, no production writes, no live legs (preview blocked — §3).
- **Resumed run:** the prior session was interrupted after landing the BFF layer as WIP
  commit `e278e28` (untrusted). This run audited it line-by-line against the design/22
  contract and the SSR composition — twins/degrade semantics/envelope/memo all faithful —
  folded it into the impl commit (`5b5cef7`), and completed the surface + closeout.

## 0 — Context load

- DEFERRALS.md read first (per AGENTS): `D-SPA.6-1` assessed — still OPEN; blocker note
  appended (SPA.12 inherits the same preview blocker). `D-MAINT.6-1` is the operative
  shared blocker (the operator-seeded `rhema-nonprod-resend-api-key` secret — re-probed
  this run, still absent). `D-SPAF.1-1..4` / `D-SPAF.2-1..4` read; untouched (prod
  deploys are operator-run; the REQ-SEQ-10 nightly-green gate binds SPAF.3 activation).
- LEDGER CURRENT STATE read: `nextTicket: SPA.12`, `chainTip:
  stevevitali/spaf-2-prod-flip-inbox`, `mergePolicy: OPERATOR`, `round: 4`,
  `pinnedBaseSha: fab08ed`.
- Entry gate: SPA.1–11 + SPAF.1/SPAF.2 landed — BUILD_INDEX rows 126–139 carry them
  (PRs #119–#132, unmerged stack). Asserted, not re-derived.
- Design sources applied: `docs/design/22` §2 settings rows + §7.1 confirm-email,
  `docs/design/29` route-map `settings` row (Q-14 one-flip), `docs/design/27` two-leg +
  rollback mechanics, spec `docs/frontend-spa-spec.md` §4/§8/§9.

## 1 — What landed

### `apps/web/src/server.ts` — six read twins (REQ-BFF-1/8/9/16, REQ-DAT-1/4)

- `GET /bff/settings/account` → `{account}`; `/preferences` → `{preferences}`;
  `/notifications` → `{notifications}` (the document's prefs read + the project list
  mapped to `{id,title}` for the per-project `run_progress` rows — off the request
  memo); `/integrations` → `{integrations}`; `/data` → the three-way compose
  `{privacy:{analyticsOptOut}, data, accountExport:{export}}`.
- `GET /bff/p/:slug/settings` → `{projectSettings:{slug, settings, approvalSettings?}}`
  — slug→id through `bffProjectRow` (unknown slug AND missed settings read →
  `not_found` 404, the document's own 404 parity); the P1.09 approval-settings read is
  the best-effort join (omitted on degrade, never fabricated).
- Degrade verbatim: `swallowDegraded` per seam lands `null` → the SPA renders the
  section's own `data-settings-unavailable` state; an upstream 401 rethrows into the
  `{error:"unauthenticated"}` envelope. Flash params (`saved`/`notice`/`p`/`v`/`f`)
  stay URL state — never payload.

### JSON mutation branches (REQ-BFF-1/2/3/16/17)

- Every settings POST gained the `wantsJson` split: no session → JSON `{error:
  "unauthenticated"}` 401 / form `/login` redirect verbatim; success →
  `mutationOutcome(c, {redirect})` — the SAME redirect targets the form leg emits
  (`?saved=1`, `?notice=email-pending|email-confirmed|email-confirm-failed|
  deletion-scheduled|deletion-cancelled|rejected|requested|expired|importFailed|
  deduped|imported&p&v&f`, `approvals=saved|invalid`).
- The privacy write's seam failure maps through `bffFail` (`settings_privacy_write_
  failed`) on JSON callers; the form leg keeps the SSR error path.
- The account-import POST keeps `multipart` — `init.form` (FormData) rides through to
  the handler; it is never flattened into JSON fields (REQ-BFF-17).
- `POST /bff/settings/account/confirm-email` — the REQ-BFF-21 convention handler: both
  arms answer 200 + redirect (`email-confirmed` / `email-confirm-failed`), replay-safe.

### `apps/web/src/approval-settings.tsx` — the shared approvals composition

- `ApprovalSettingsSection` extracted from `pages.tsx` verbatim — the same
  grid/guidance/opt-in/policy composition the SSR project page, the SSR project
  settings page, and the SPA `ProjectSettingsSurface` all render (the SPA.11
  gate-card precedent: one COPY-bound composition, zero drift).
- `scripts/check-protocol-markers.mjs` shared-leaf allowlist += `approval-settings.`
  — the guard caught the new shared module bundled into the SPA graph; amendment is
  the documented mechanism (gate-card amendment was MAINT.6's precedent).

### `apps/web/src/spa/surfaces/settings.tsx` — the surface (~1.1k lines)

- `SettingsFrame` + `AccountSection` / `PreferencesSection` / `NotificationsSection` /
  `IntegrationsSection` / `DataSection` / `ProjectSettingsSurface` — the SSR markup
  vocabulary verbatim (`data-settings-nav`, `data-notification-matrix`, the
  `email_*`/`inapp_*`/`rp_*`/`pd_*` field families, `data-account-export`,
  `data-account-import`, `data-delete-account-form`, `data-approval-settings`,
  `data-integration-card`, `data-session`, `data-signin-method`, `data-support-log`…).
- Forms keep `method="post"` + the original action paths — the no-JS post is the same
  element; a delegated `onSubmit` on the `data-spa-surface` wrapper intercepts in the
  SPA path only: flat fields → JSON `bffFetch`, import forms → FormData, `redirect`
  → router nav, `url` → document nav, `aria-busy` + disabled controls in flight
  (REQ-UX-16), `["bff"]` invalidation on settle (server-truth repaint — a refused
  write leaves the controls on persisted values).
- Null read halves render `data-settings-unavailable` — the SSR's `if (!acct)`
  branch verbatim.
- Section headings promote one level (`h3`→`h2`) per the usage-surface heading-order
  precedent (PageTitle is the h1; axe `heading-order` is a component leg); hooks +
  copy unchanged. Notification matrix controls gained `aria-label`s (the SSR's
  unlabeled selects would fail component axe — an accessibility fix carried on both
  renderers where shared).

### `apps/web/src/spa/queries.ts` — the six twins

- `settingsAccountQuery` / `settingsPreferencesQuery` / `settingsNotificationsQuery` /
  `settingsIntegrationsQuery` / `settingsDataQuery` / `projectSettingsQuery(slug)` —
  REQ-BFF-10/11 key grammar (`["bff","settings",…]`, `["bff","p",slug,"settings"]`),
  `bffFetch` transport, the shared `retryPolicy`. Mutations invalidate `["bff"]`.

### Route leaves + search schema (REQ-SEQ-9, REQ-NAV-6)

- `app.settings.{account,preferences,notifications,integrations,data}` leaves warm
  their twin **only** on the `"spa"` verdict (the handoff path never spends the
  read); component re-consults `isSpaEnabled` → `SsrHandoff`; `isPending` →
  `SurfaceShell`; non-401 → designed error state. `app.settings.billing` +
  `settings_.billing` stay the billing-forward leaves; `/app/settings` +
  `/settings` remain the server redirects to `/app/settings/account`.
- `p.$project.settings` warms `projectSettingsQuery(slug)` and renders
  `ProjectSettingsSurface`; the confirm-email branch rides `beforeLoad` (the
  `?confirmEmail=` consume never mounts the surface).
- `search.ts` `flagParam` normalizes flag-like query values (`?saved=1`/`?saved`)
  without stringifying `true`; `strParam` for `notice`, `numParam` for import
  counts, `oneParam("saved","invalid")` for approval status.

### `apps/web/src/dom-contract.ts` — settings vocabulary completed

- 34 → **93 hooks**: the attribute/field/url-param families for all seven sub-pages
  (`data-settings-*`, `data-notification-*`, `data-account-*`, `data-export-*`,
  `data-import-*`, `data-deletion-*`, `data-deleted-*`, `data-privacy-*`,
  `data-approval-*`, `data-integration-*`, `data-session`, `data-signin-method`,
  `data-revoke-session`, `data-email-pending`, `data-rigor-by-workflow`,
  `data-per-project`, `data-support-log`, field families `email_*`/`inapp_*`/`rp_*`/
  `pd_*`/`ov_*`, `id` urlparam for export download). `check:dom-contract`: **561
  entries / 18 surfaces; settings 93/93 emitted+asserted.**

### Journey gate + dev flag

- `SURFACE_GATES["settings"]` already existed: `T2.matrix`, `T3`, `R8.prefs` —
  renderer-agnostic by construction (the steps walk DOM hooks, not the renderer);
  no registry change needed this ticket.
- `STAGES.dev.spaSurfaces = ["usage","inbox","settings"]` — the surface's dev line
  (REQ-SEQ-3/9). Preview `[]` (flips only via `rhema:spaSurfaces`); **prod
  untouched** — `["usage","inbox"]` stays SPAF.2's; `settings`'s prod flip is
  SPAF.3 gated on the REQ-SEQ-10 bake. `stages.test.ts` pins it.

### `infra/PROD-BRINGUP.md` — runbook-completeness drift closed

- `rhema:resendApiKey` (MAINT.6's non-prod-only secret config) was undocumented — the
  OPS.2 drift gate (`runbook-completeness.test.ts`) caught it red on this run's full
  suite. Documented in the §2 "keys the operator normally does NOT set" list
  (inherited base-stack red, repaired here; the guard worked as designed).

### Tests

- `apps/web/src/spa/settings.dom.test.tsx` (**45**): production-router mounts on all
  seven sub-pages — manifest emission parity vs `renderToStaticMarkup` of the SSR
  twin, every section's hooks + representative literals, JSON mutation branches
  (post + redirect + `["bff"]` refetch), FormData import path, deferred-mutation
  `aria-busy`/disabled, `SsrHandoff` on the unflipped verdict + no BFF spend,
  401 → session-drop + `/login` doc-nav, non-401 → designed error (never a login
  lie), degraded-null → `data-settings-unavailable`, redirect-only leaves,
  approval settings, notification matrix + quiet-hours fields, export/import
  hooks, component axe on the interactive subset.
- Retained SSR: `settings-pages.test.ts` (18) untouched and green — **REQ-VFY-9
  disposition**: render asserts now have React-twin counterparts in
  `settings.dom.test.tsx` (`expectManifestEmission` + hook assertions); the
  `wantsJson` mutation branches are exercised by the dom suite's real
  `bffFetch`↔envelope legs and `bff.test.ts`'s confirm-email block (REQ-BFF-21);
  the SSR file itself stays as the fallback renderer's own coverage.
- `copy-containment.test.ts` green — the notification matrix's chained ternaries
  were restructured into statement-computed cells (`if/else` assigns, then
  `{emailCell}`/`{inAppCell}`) so the `>`…`<` scanner sees no bare-identifier
  "text" (the `locked`/`run_progress` arm conditions are statements, exempt by
  the scan's code-token rule — zero copy moved).

## 2 — Verification

| Gate | Result |
|---|---|
| `pnpm turbo build lint typecheck` | **PASS — 135/135 tasks** |
| `pnpm test` (root vitest) | **5,127 pass / 4 skip / 1 fail** on first full run — the one fail was the inherited MAINT.6 `runbook-completeness` drift (`rhema:resendApiKey` undocumented); fixed + re-run green (3 affected files, 68 tests) |
| `spa/settings.dom.test.tsx` | 45 legs green |
| `settings-pages.test.ts` | 18 legs green — SSR verbatim |
| `bff.test.ts` | green (confirm-email REQ-BFF-21 block included) |
| `check:dom-contract` | **PASS — 561 entries / 18 surfaces; settings 93/93** |
| `check:spa-budget` | **PASS** — settings chunk 7.5 kB gzip, all ceilings held |
| `check:licenses` / `check:protocol-markers` / `check:no-cookies` / `check:spa-env` | **PASS — clean** (markers required the `approval-settings` shared-leaf amendment — documented mechanism) |
| lint | clean — one pre-existing `spa.dom.test.tsx` unused-disable warning stands |

## 3 — Preview two-leg + rollback: BLOCKED (recorded honestly)

The ticket's staging-verified ACs (legs A `x-rhema-renderer: ssr`, B flag-on
`--expect-renderer spa`, C full `paid:false` on `pr-<n>`; rollback drill) could not
execute — the operative blocker is **D-MAINT.6-1**: the operator-seeded shared secret
`rhema-nonprod-resend-api-key` does not exist in Secret Manager project
`rhema-507501`. Re-probed this run:

```
gcloud secrets versions access latest --secret=rhema-nonprod-resend-api-key \
  --project=rhema-507501
→ NOT_FOUND: Secret [projects/25012989319/secrets/rhema-nonprod-resend-api-key]
  not found or has no versions.
gcloud secrets list → rhema-prod-resend-api-key only (no nonprod variant).
```

Without it `preview-stack.mjs resend-pull` cannot seed `rhema:resendApiKey`, so no
signed-in preview session can mint through the magic-link + mailbox leg — and every
settings gate step (`T2.matrix`, `T3`, `R8.prefs`) is session-gated. The residual
preview preconditions are unchanged from `D-SPA.6-1`: CI `images` digests for the
head SHA + the `rhema:spaSurfaces` stack config, in addition to the secret.

**Disposition:** `D-SPA.12-1` (preview two-leg) + `D-SPA.12-2` (rollback drill)
appended OPEN with the verification recipe and compensating controls;
`D-SPA.6-1` / `D-MAINT.6-1` stay OPEN — blocker note appended to `D-SPA.6-1`.
Compensating deterministic legs cover the same contract: `settings.dom.test.tsx`
mounts the production router under flipped and unflipped verdicts (SsrHandoff +
no-BFF-spend asserted), `spa-flag.test.ts` pins the override semantics,
`check:dom-contract` pins SSR⇄SPA vocabulary parity at 93/93.

## 4 — AC disposition

| AC | Status |
|---|---|
| `/bff/*` twins + envelope mutations for `settings` — typed JSON, preserved statuses | **MET (deterministic)** — six GET twins + every POST `wantsJson`-branched; `confirm-email` twin (REQ-BFF-21); 401/not_found/envelope parity |
| React surface emits the full dom-contract vocabulary — component tests + axe | **MET (deterministic)** — 93/93 hooks emitted+asserted; `expectManifestEmission` + axe on the mounted surface |
| Retained SSR tests green — the fallback untouched | **MET** — `settings-pages.test.ts` verbatim; `pages.tsx` change is the approval-settings extraction + aria-labels only |
| Journey legs re-spec'd + `SURFACE_GATES['settings']`; preview two-leg A/B/C green on `pr-<n>` | **PARTIAL** — `SURFACE_GATES.settings = {T2.matrix, T3, R8.prefs}` verified in-tree (pre-existing entry, renderer-agnostic); preview legs **BLOCKED** (§3) → `D-SPA.12-1` OPEN |
| Rollback drill evidence on the preview | **BLOCKED** (§3) — recorded arm `D-SPA.12-2`; compensating deterministic legs mounted instead |
| `/bff/settings/*` twins + full mutation grammar (prefs, notice vocabulary, destructive ops) via envelope | **MET** — deletion schedule/cancel, import (FormData), privacy write, per-project approvals all envelope'd |
| Dev stage-fact line; prod untouched | **MET** — `dev.spaSurfaces=["usage","inbox","settings"]`; preview `[]` / prod `["usage","inbox"]` pinned |
| Phase-gate AC | **MET** — deferred live legs ledgered (D-SPA.12-1/-2), append-only, requirement ids stamped in the PR |

## 5 — Deviations + notes

- **Resumed-run audit:** WIP `e278e28` (BFF layer only — `bff.ts`, `server.ts`,
  `spa/bff.ts`, `spa/queries.ts`) audited faithful to design/22 + the SSR
  composition before building on it; folded into impl commit `5b5cef7`.
- **Copy-containment grammar (second instance):** beyond SPA.11's arrow-param case,
  chained JSX ternaries (`) : locked ? (`) read as "text" when the arm condition is
  a bare identifier. The notification matrix cells compute via `if/else`
  statements before `return` — statement-position identifiers are exempt by the
  scan's code-token rule.
- **aria-label additions:** the SSR's notification selects were unlabeled; the
  React port labels them (`{event} — {column}`). Where the markup is shared the
  fix lands on both renderers; the SSR's own markup is otherwise byte-faithful.
- **Test-harness artifact (recorded, not a defect):** the memory-history router
  logs `Error in route match: /_authenticated/app/settings/account/app/settings/
  account` during the error-path legs — the identical warning exists on landed
  `inbox.dom.test.tsx` (`/app/inbox/app/inbox`) and `spa.dom.test.tsx`; it is the
  shared harness's error-boundary path, not a route-tree bug.
- **`D-SPA.12-1`/`-2` are new deferral rows**; `D-SPA.6-1` blocker-updated (same
  secret + images + config prerequisites). No other deferral state changed.
- **Size ~3.1k lines vs ~600 guide** — recorded per SPA.5–11 precedent (seven
  sub-pages + the surface + its 45-leg test file ARE the deliverable).

## 6 — Closeout addendum (post-PR)

_(written after `gh pr create` — see below)_
