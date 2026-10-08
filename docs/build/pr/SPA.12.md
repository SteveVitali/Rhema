# SPA.12 — surface: settings (`/app/settings` 6+1 sub-pages + `/p/:p/settings` → React SPA behind the `settings` flag)

**Manifest row 111** · stacks on `stevevitali/spaf-2-prod-flip-inbox` @ `8ccfc40` · merge policy
**OPERATOR** — do not merge from the build environment · **$0** spend, no deploys, no
production writes.

Implements `docs/tickets/111_SPA.12__surface-settings.md` per `docs/design/22` (endpoint table —
`settings` rows + §7.1 confirm-email), `docs/design/29` (route-map `settings`, Q-14 one-flip),
`docs/design/27` (two-leg + rollback mechanics), and `docs/frontend-spa-spec.md` §4/§8/§9.
`STAGES.dev.spaSurfaces` gains `"settings"`; preview `[]` and prod `["usage","inbox"]` stay
unchanged (the `settings` prod flip is SPAF.3's own row, gated on the REQ-SEQ-10 bake).

**Deployable dark:** nothing changes for an unflipped request — each leaf's loader skips its BFF
read and `SsrHandoff` document-navigates back to the same server route. SSR fallback + SSR tests
untouched (REQ-SEQ-11/12). `?ssr=1`/`?renderer=spa`/`x-rhema-renderer` overrides ride the
unchanged consult machinery.

## Requirement IDs

**REQ-SEQ-9 · REQ-VFY-8/9 · REQ-BFF-16/17/21 · REQ-DAT-3/4 · REQ-NAV-6 ·
REQ-UX-3/4/5/10/13/14/15/16**

## What lands

### Six read twins (REQ-BFF-1/8/9/16, REQ-DAT-1/4)

- `GET /bff/settings/{account,preferences,notifications,integrations,data}` — each mirrors its
  document handler's composition verbatim: `notifications` joins the project list to `{id,title}`
  (the per-project `run_progress` rows); `data` is the three-way compose
  `{privacy:{analyticsOptOut}, data, accountExport:{export}}`.
- `GET /bff/p/:slug/settings` — slug→id through the request memo; unknown slug AND missed
  settings read → `not_found` 404 (the document's own 404 parity); the P1.09 approval-settings
  read is a best-effort join omitted on degrade.
- `swallowDegraded` lands `null` → the SPA renders the section's own
  `data-settings-unavailable` state, never a fabricated value; upstream 401 →
  `{error:"unauthenticated"}`. Flash params stay URL state — never payload.

### JSON mutation branches (REQ-BFF-1/2/3/16/17/21)

- Every settings POST gains the `wantsJson` split — JSON callers get
  `mutationOutcome({redirect})` 200s (the SAME `?saved`/`?notice`/`approvals=` targets the form
  leg 302s to) or `{error:"unauthenticated"}` 401 with no session; form callers keep the 302
  verbatim. Destructive ops (deletion schedule/cancel), per-project approvals, the privacy
  write, and the notice vocabulary (`email-pending`, `rejected`, `requested`, `expired`,
  `importFailed`, `deduped`, `imported&p&v&f`…) are all envelope'd.
- The account-import POST stays `multipart` — `init.form` carries the file through; never
  flattened into JSON fields (REQ-BFF-17).
- `POST /bff/settings/account/confirm-email` — the REQ-BFF-21 one-shot consume: both arms
  answer 200 + redirect (`email-confirmed`/`email-confirm-failed`), replay-safe.

### `spa/surfaces/settings.tsx` + shared `approval-settings.tsx`

- `SettingsFrame` + the five section components + `ProjectSettingsSurface` — SSR markup
  vocabulary verbatim (`data-settings-nav`, `data-notification-matrix`,
  `email_*`/`inapp_*`/`rp_*`/`pd_*`/`ov_*` fields, `data-account-export`, `data-account-import`,
  `data-delete-account-form`, `data-approval-settings`, `data-integration-card`,
  `data-session`, `data-signin-method`, `data-support-log`…). `check:dom-contract` **93/93**
  emitted+asserted; all copy via `COPY` (containment-clean).
- A delegated `onSubmit` on `data-spa-surface` intercepts in the SPA path only: flat fields →
  JSON, import forms → FormData, `redirect` → in-router nav (the flash re-renders), `url` →
  document nav (server-validated external hand-off), `aria-busy` + disabled in flight
  (REQ-UX-16), `["bff"]` invalidation on settle — server-truth repaint, never optimistic
  mirroring.
- `approval-settings.tsx` extracted from `pages.tsx` — the same approvals grid/guidance/opt-in
  composition on SSR project page + SSR project settings + SPA (the SPA.11 gate-card precedent).
  The protocol-markers shared-leaf allowlist gained `approval-settings.` (the guard caught the
  new shared module — amendment is its documented mechanism).
- Accessibility: section headings promote one level (PageTitle is h1 — the usage-surface
  heading-order precedent; hooks/copy unchanged); notification matrix + quiet-hours selects
  gained `aria-label`s (the SSR's unlabeled controls would fail component axe).

### Route leaves + search schema

- `app.settings.{account,preferences,notifications,integrations,data}` + `p.$project.settings`
  warm their twin only on the `"spa"` verdict; `SsrHandoff`/pending/error states per
  convention. `app.settings.billing` + `settings_.billing` stay billing-forward;
  `/app/settings` + `/settings` remain the server redirects to `/app/settings/account`.
- `search.ts` `flagParam` normalizes flag-like query values (`?saved=1`/`?saved`) so validated
  search doesn't stringify `true`; `strParam`/`numParam`/`oneParam` cover `notice`, import
  counts, `approvals`.

### Journey gate + dev flag

- `SURFACE_GATES["settings"]` = `T2.matrix`, `T3`, `R8.prefs` — already registered
  (renderer-agnostic by construction); verified in-tree, no registry change needed.
- `STAGES.dev.spaSurfaces = ["usage","inbox","settings"]`; preview `[]`; prod
  `["usage","inbox"]` untouched — `stages.test.ts` pins the shape.

### Runbook drift closed (inherited)

- `rhema:resendApiKey` (MAINT.6's non-prod secret config) was undocumented — the OPS.2
  `runbook-completeness` gate caught it red on the full suite. Documented in PROD-BRINGUP §2.

## Tests

- `spa/settings.dom.test.tsx` (**45**) — production-router mounts on all 6+1 sub-pages:
  manifest emission parity vs the SSR twin's `renderToStaticMarkup`, JSON mutations + refetch,
  FormData import, deferred-mutation `aria-busy`/disabled, `SsrHandoff` + no-BFF-spend,
  401 → session-drop + `/login` doc-nav, non-401 designed error, degraded-null →
  `data-settings-unavailable`, redirect-only leaves, approvals, matrix/quiet-hours,
  export/import hooks, component axe.
- Retained SSR: `settings-pages.test.ts` (18) verbatim and green. **REQ-VFY-9 disposition:**
  render asserts gained React-twin counterparts in `settings.dom.test.tsx`; mutation legs ride
  the dom suite's real `bffFetch`↔envelope path + `bff.test.ts`'s REQ-BFF-21 confirm-email
  block; the SSR file stays as the fallback renderer's own coverage.
- `copy-containment.test.ts` green — matrix cells compute via `if/else` statements so the
  scanner sees no bare-identifier "text".

## Verification

`pnpm turbo build lint typecheck` **135/135** · `pnpm test` **5,127 pass / 4 skip** (one
inherited runbook-completeness red on first run — fixed + re-verified) · `check:dom-contract`
**561/18; settings 93/93** · `check:spa-budget` ceilings held (settings chunk 7.5 kB) ·
`check:licenses`, `check:protocol-markers`, `check:no-cookies`, `check:spa-env` clean.

## Preview two-leg + rollback — BLOCKED (recorded honestly)

**`D-MAINT.6-1` is the operative blocker:** the operator-seeded shared secret
`rhema-nonprod-resend-api-key` does not exist in `rhema-507501` — probed this run (`gcloud
secrets versions access latest` → `NOT_FOUND`; only `rhema-prod-resend-api-key` exists). Without
it `preview-stack.mjs resend-pull` cannot seed `rhema:resendApiKey`, so no signed-in preview
session mints through the magic-link + mailbox leg — and every `settings` gate step
(`T2.matrix`, `T3`, `R8.prefs`) is session-gated. Residual preconditions additionally: CI
`images` digests for the head SHA + `rhema:spaSurfaces` stack config.

**Disposition:** `D-SPA.12-1` (legs A/B/C recipe verbatim) + `D-SPA.12-2` (rollback drill arm)
appended OPEN in DEFERRALS.md; `D-SPA.6-1` blocker-updated, stays OPEN. Compensating
deterministic legs: flipped AND unflipped router mounts (SsrHandoff + no-BFF-spend asserted),
`spa-flag.test.ts` override semantics, `check:dom-contract` 93/93 SSR⇄SPA parity,
`SURFACE_GATES["settings"]` renderer-agnostic green steps.

## Notes for the operator

- When `rhema-nonprod-resend-api-key` is seeded: leg A `--pin-renderer ssr
  --expect-renderer ssr`; leg B `preview-stack.mjs config pr-<n> rhema:spaSurfaces
  "usage,inbox,settings"` + `--expect-renderer spa --surface settings`; leg C `paid:false`;
  rollback = drop `settings` from the stack config → `up` → re-run leg A.
- The `?confirmEmail=` one-shot consumes via `beforeLoad` — it never mounts the surface, and
  its both-200 redirect lands the `notice` flash through the same URL-state channel as SSR.
- Merge policy `OPERATOR` — the stack merges bottom-up; this run does not merge.
