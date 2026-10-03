# UX.1 — Public-ready copy, route metadata/brand, and one showcase path (run ledger)

- **Status:** IN PROGRESS
- **Ticket:** `docs/tickets/76_UX.1__copy-ia-brand.md`
- **Branch:** `stevevitali/ux-1-copy-ia-brand`, stacked on SLO.1 `c3d776c`
  (`stevevitali/slo-1-prod-slo-remediation` — PR #97 open, `OPERATOR` merge policy, **not merged**).
- **Goal:** every user-visible string honest + product-shaped (no build vocabulary, mode-true copy);
  preferences/palette expose only launched workflows; Inbox waiting/count rows truthful; every route
  carries real metadata (`<title>`/meta/OG/Twitter), working favicon, exactly one `<h1>`; `/showcase`
  resolves (signed-in → own Showcase, signed-out → static sample dossier); magic-link email branded
  with expiry/safety/plain-text/unique subject. Stage B deploy + journeys + real mailbox read.
- **Spend:** $0. Zero new paid journeys; metered cost $0 (copy/SSR/email only).
  Round-3 cumulative entering: **$61.22**.
- **ADRs:** ADR-059 (jargon lint in `copy.test.ts` + sanctioned exceptions), ADR-060 (route metadata +
  favicon + one-`<h1>` head), ADR-061 (manifest-derived `LAUNCHED_WORKFLOW_KEYS`), ADR-062
  (`/showcase` targets), ADR-063 (Inbox honesty: partial reword + recovery collapse), ADR-064
  (branded magic-link email + nonce subject).

## 0 — Context load

- DEFERRALS.md read. Rows touched this run: `D-P1.17-2` (journey run — UX.1 may supply the
  meta/axe journey evidence; flip only the legs actually proven), `D-P1.17-4` (human review gates —
  not UX.1's), `D-P0.22-1` (Resend deliverability — magic-link content ships here; the provider
  account remains operator-owned), `D-JOURNEY.1-1` (env credentials — already covered on this host,
  see JOURNEY.1), SLO.1 deferrals untouched.
- Branch state: clean at `c3d776c` (SLO.1 close commit, equals origin tip); feature branch created.
- Anchors confirmed (from reconnaissance):
  - `apps/web/src/copy.ts` — the single public-string module; jargon anchors: `invite.heading`
    ("private beta"), `invite.signInCta`, `login.note`, `tags.heading` note ("land in 1.x"),
    `emptyChat` ("lands here in a later pass"), `showcase.dossierCard` ("the fixture"),
    `app.phase0Card` ("Phase 1 — …"), `footer.line` ("private beta"). `copy.test.ts` already owns
    phrase checks.
  - `apps/web/src/pages.tsx` — `SectionTitle` (~48 uses, all page heads), `WORKFLOW_KEYS.map` in
    Preferences, Inbox `badgeLine` + event rows, `settings` strip.
  - `packages/ui/src/shell.tsx:69-72` — `SectionTitle` renders `<h1>` (multi-h1 defect source).
  - `apps/web/src/render.tsx:45-79` — single `DOC_TITLE = "Rhēma"`; no route metadata.
  - `apps/web/src/routes.tsx` — no `/showcase` route.
  - `apps/web/src/server.ts` — §5.11 Inbox route + gateCards join; `/app/settings/preferences`
    POST collects arbitrary `rigor_<key>` into `rigorByWorkflow` without launched-validation;
    `/app` POST has case-variant label-dedupe bug (a projectTitle case-dup check); `/signup` POST
    drops `?entry=` intent into `${publicBaseUrl}${next}` — correct.
  - `apps/api/src/server.ts:185-191` — bare magic-link payload; `auth.mail` queue consumed by worker.
  - `apps/api/src/showcase.test.ts` — api `GET /showcase` contract live: auth-only 401s; read-only
    POSTs → `showcase_read_only`; archive/restore allowed; delete → `showcase_not_deletable`;
    duplicate → normal project; `showcase.opened` acquisition event.
  - `packages/commands/src/verbs.ts` — disabled workflow copy ("1.x workflow — not yet available")
    + `WORKFLOW_KEYS`/`WorkflowKey`/`reseed_charter`.
  - `packages/protocols/src/index.ts` — `WORKFLOW_MANIFESTS` for the twelve launched workflows.
  - `packages/findings-core/src/inbox.ts` — `inboxBadgeCount` (approvals+decisions only),
    `inboxGroups` (badge === blocked), `inboxOrder` (blocked → unread → read → voices).
  - `packages/orchestrator/src/inbox.ts` — DTO rows already carry `projectId`/`projectTitle`;
    `packages/orchestrator/src/notifications.ts` — `collapseKey: run:<runId>`;
    `run_cancelled_recovered` title "Run recovered" (the noise source).
  - `packages/journeys/src` — `STEP_REGISTRY`, `--stage prod` origins, keyless DWD mailbox
    (`test@rhema.tools` pinned), `JourneySessions` real-magic-link flow, expected-red→owed /
    ready-to-flip semantics; `C1` owned by ACT.1 (claim half), copy half is UX.1's.
  - Deploy playbook: `gcloud builds submit --config cloudbuild.yaml
    --substitutions _AR=…/rhema-prod,_TAG=<tag>,_GIT_SHA=$(git rev-parse HEAD)` → digest-pin
    `rhema:serviceImages` in `infra/pulumi/Pulumi.prod.yaml` → `pulumi preview` (0 replace/delete)
    → `pulumi up` → `check-deploy-provenance.mjs` + `deployments` row via IAP tunnel `15433`.
- Decision sketches for ADR numbering at write-up (§4): jargon lint in `copy.test.ts` (single
  public-string module already linted there — no new lint package); launched source = derived
  `LAUNCHED_WORKFLOW_KEYS` from `WORKFLOW_MANIFESTS` exported via protocols→contracts (manifest's
  `phase`/`launched` field to verify); partial-results rows re-worded to name their project and
  counted in the waiting heading iff they are waiting rows; signed-out `/showcase` renders a
  static sample dossier assembled from the same dossier-render path (no api call — the api read
  requires a session by design); subject scheme `Your Rhēma sign-in link · <token-free nonce>`
  (timestamp-derived; token never in subject).

## 1 — Requirements → test matrix (Stage A plan)

| # | Change | Test that fails on the old behavior |
|---|---|---|
| 1 | Jargon lint (ADR: lives in `copy.test.ts` over `collectCopyStrings()` — the one module every user-facing string must pass through) | banned terms `private beta` (outside the invite-mode allowlist), `fixture`, `1.x`, `later pass`, `lands here`, `Phase N`, unsupported `beta` pricing claims → flagged; all current offenders fail |
| 2 | Mode-true open copy: `invite.headingOpen`, footer loses "private beta", tags/emptyChat/sampleNote/changelog rewritten | `/` `/invite` `/login` `/signup` SSR'd with `signupMode:"open"` contain none of the banned strings (server test) |
| 3 | `LAUNCHED_WORKFLOW_KEYS` in @rhema/contracts (single source); protocols `manifests.test.ts` pins it === `WORKFLOW_MANIFESTS` keys | adding/removing a manifest without updating the list fails; Preferences renders exactly the launched set (no `cut_to_length`/`line_edit`/`titles`/`abstract`/`reverse_outline`/`steelman`/`interview`/`run_rounds`/`map_the_field`/`compose_voice`) |
| 4 | Palette drops `phase:"one_x"` verbs; `disabledReason`/`resolve.ts` jargon reworded | palette.test: no disabled one_x rows in the run section; commands test: no `1.x` in any disabledReason |
| 5 | Settings API rejects unlaunched workflow keys | `PUT /settings/preferences {rigorByWorkflow:{cut_to_length:"quick"}}` → 422; `{review:"quick"}` → 200; `{cut_to_length:null}` delete still merges (200) |
| 6 | Inbox waiting count = rendered waiting rows; every row names its project | web test: `data-inbox-badge` line's `{n}` === rendered `blocked` rows; each row carries the project title in its meta line |
| 7 | `completed_partial` run_finished row re-worded ("stopped early — kept results"); `run_cancelled_recovered` variant "recovered" re-worded + collapses without re-unreading | contracts notifications.test: partial title honest; orchestrator upsert test: repeat recovered event doesn't re-badge |
| 8 | Route metadata: `<title>` per route (`<page> · Rhēma`), description+OG+Twitter on public routes, favicon link | render test: `/`,`/pricing`,`/signup`,`/login`,`/showcase` get distinct titles + `og:`/`twitter:`/`description`; app routes get section titles; escaping test on a project title with `"` |
| 9 | `/favicon.ico` (+`/favicon.svg`) → 200 | server test: GET → 200, `image/` content type |
| 10 | Exactly one `<h1>` per rendered page | `SectionTitle` → `<h2>`; `PageTitle` → `<h1>`; every page head converted; SSR test counts h1s per route |
| 11 | `/showcase` — signed-out: static sample dossier page (public route); signed-in: redirect to `/p/<slug>` of the viewer's own Showcase; no-Showcase → static sample | server test both legs; api `/showcase` read unchanged (session-bound) |
| 12 | Magic-link email: branded (Rhēma), button + text fallback, expiry from configured `expiresIn`, "didn't request? ignore" line, plain-text part, unique token-free subject | api unit test on the template + enqueue payload; two sends ⇒ distinct subjects; token only inside the URL |
| 13 | Journeys: new UX.1 steps (open-mode copy, meta/h1/favicon, /showcase both legs, Inbox count/rows, real magic-link email read) | registry rows expected green; prod run attaches screenshots + the Gmail message evidence |
| 14 | Stage B deploy (api+web+worker images, $0 delta, provenance = chain tip) | `check-deploy-provenance` + `deployments` row via IAP tunnel |

AC17 (no hand-written claims): no new pricing/trial/coverage figures are authored — the only copy
touching money is the removal of the unsupported "beta plan" claim and pointers to /pricing
(config-derived). C1's claim half stays ACT.1-owned.

## 2 — Implementation (Stage A)

All code landed on `stevevitali/ux-1-copy-ia-brand`; row-by-row vs the test matrix:

- **Copy/jargon (rows 1–2).** `copy.ts`: `invite.headingOpen`/`accessNoteOpen`/`signInCtaOpen`,
  `login.noteOpen` + optional-code labels, footer → `"Rhēma"` (no "private beta"), `betaNote` removed,
  `planOffer`/`planOfferLink` → neutral pricing-pointer copy (the env-gated offer URL unchanged),
  `appBanner.label` macron'd, `sampleNote`/`changelog.body`/`tagsPlaceholder`/`emptyChat`/
  `analyticsNote`/`reconstructQueued` rewritten. `copy.test.ts` gained the ADR-059 jargon describe
  (7 terms; `invite.heading`/`login.note` are the only sanctioned "beta" keys) — **6/6 green**.
  `server.test.ts` gained the per-mode assertion: open mode shows no "private beta"/"1.x"/
  "Access is by invitation" on `/login /invite /signup / /pricing /showcase`; invite mode keeps the
  closed-program copy.
- **Launched workflows (rows 3, 5).** `contracts/enums.ts`: `LAUNCHED_WORKFLOW_KEYS` +
  `launchedWorkflowKeySchema` + `isLaunchedWorkflow` + `USER_LAUNCHED_WORKFLOW_KEYS` (drops
  `reseed_charter` — system-only). `protocols/manifests.test.ts` pins the list ===
  `WORKFLOW_MANIFESTS` keys (drift = build failure). Preferences renders the user list; the settings
  api 422s a rigor override keyed outside the launched set (nulls still prune) — covered by the new
  `settings-routes.test.ts` row (all 10 unlaunched keys rejected, all 12 launched accepted).
- **Palette/verbs (row 4).** `palette.ts` skips `phase:"one_x"` verbs entirely (no "1.x" hint, no
  dead rows); `verbs.ts` + `resolve.ts` disabled reasons → "isn't available yet." —
  `commands.test.ts` + `palette.test.ts` updated and green.
- **Inbox (rows 6–7).** `INBOX_COPY.run_finished` gained `partial` → "stopped early — the kept
  results are ready"; `run_cancelled_recovered` "recovered" → "Run stalled — restarted
  automatically". `orchestrator/notifications.ts` passes `partial` for `completed_partial` and
  `keepReadOnRepeat` for `recovered` (repeat upsert keeps `read_at` — one unread per run, ever).
  `InboxPage`: badge line renders `blocked.length` (the rendered Needs-you rows), every row emits a
  `data-inbox-project` meta line when the read model carries `projectTitle`. New
  `notifications.test.ts` describe proves the partial title, mail suppression, the reword, and the
  no-re-badge collapse — green.
- **Head/meta/favicon/h1 (rows 8–10).** `render.tsx` `docMetaFor` maps every §4.2 family to a
  distinct `<page> · Rhēma` title (project surfaces prefix the project title); public routes emit
  `description` + OG + Twitter (+`canonical`/`og:url` when the handler passes the origin); all
  interpolation is attribute-escaped; both favicon links emitted. `brand.ts` supplies the inline-SVG
  mark; `server.ts` serves it at `/favicon.svg` + `/favicon.ico` (200, `image/svg+xml`, day cache).
  `shell.tsx`: `PageTitle`→`<h1>`, `SectionTitle`→`<h2>`; all call sites remapped.
  `render.test.tsx` pins titles, social-meta presence/absence, canonical gating, escaping, favicon
  links, and one-`<h1>` on landing/login/showcase/inbox — 7 green.
- **`/showcase` (row 11).** Route manifest row (public). `server.ts`: signed-in → api
  `getShowcaseEntry` → 302 to the dossier run (or `/p/<slug>` when no review run yet, or the static
  sample for accounts with no Showcase); signed-out → the static `ShowcasePage` (sample dossier via
  `DossierView`). `marketing.test.ts` covers all four legs — 15/15 green.
- **Magic-link email (row 12).** `magic-link-email.ts`: `renderMagicLinkEmail` (macron'd brand,
  inline-styled button + paste-URL fallback, expiry line, safety line, text part) +
  `magicLinkSender(queue)` (the live `SendMagicLink` — randomBytes nonce subject, enqueues
  `auth.mail`). `auth.ts`: `MAGIC_LINK_EXPIRES_SECONDS = 15*60` feeds both `magicLink({expiresIn})`
  and the template. `magic-link-email.test.ts`: 9 tests — brand, both parts, config-derived expiry,
  safety line, unique token-free subjects, token only inside the link.
- **Journeys (row 13).** `N10` (public meta/h1/favicon/copy/`/showcase` signed-out leg) + `R8`
  (signed-in `/showcase`, Preferences launched-only, Inbox count === Needs-you rows) added to
  `STEP_REGISTRY` + `STEP_IMPLS` (green, $0); `registry.test.ts` updated.

Two repair-driven test fixes: `billing-surfaces.test.ts` now asserts the neutral offer copy (the old
"Founding users keep the beta rate" claim is gone); `check-additive-migrations.test.mjs`'s pinned
file list gained `0054_collab_slo_samples.sql` (pre-existing staleness — SLO.1's migration was never
added to the pin).

## 3 — Verification (Stage A gate)

- `pnpm turbo build lint typecheck` — 135/135 tasks.
- `pnpm test` — 431 files / 4269 tests green (post-fix re-run; the two failures were the rows above).
- `pnpm check:licenses` — 609 packages, OK. `pnpm check:protocol-markers` — 54 files, no markers.
- Targeted: copy 6/6, render 7/7, routes 4/4, marketing 15/15, server 99/99, settings-routes 19/19,
  magic-link-email 9/9, orchestrator notifications 13/13, protocols manifests 77/77, commands 41/41,
  ide 30/30, journeys 29/29.
- ADRs ADR-059…064 written; `adr-index.sh` regenerated `docs/adr/README.md` (never hand-edited).
