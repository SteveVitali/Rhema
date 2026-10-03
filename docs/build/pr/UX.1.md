# UX.1 — Copy, IA and brand: no build jargon, no unbuilt workflows, honest Inbox, real page meta, a branded sign-in email

Ticket: `docs/tickets/76_UX.1__copy-ia-brand.md` · run ledger: `docs/build/runs/UX.1.md`
Stacks on `stevevitali/slo-1-prod-slo-remediation` (PR #97, `OPERATOR` merge policy).
**DO NOT MERGE.**

## Summary

> Every word a stranger reads is now product copy that is true of the product they can
> use: open-signup surfaces never claim a private beta, internal build vocabulary is
> linted out of the copy table, Preferences and the palette expose only shipped
> workflows, the Inbox's waiting count IS its rendered rows, every route carries a
> distinct titled document with social meta and a served favicon and exactly one
> `<h1>`, `/showcase` resolves for both audiences, and the sign-in email is a branded
> card with a real expiry and a safety line.

- **Mode-true signup copy (PR-U1; REQ-BETA-19 note).** Under `signupMode:"open"` —
  `/`, `/invite`, `/signup`, `/login`, `/pricing`, `/showcase` carry no "private
  beta", no invitation-required line, and email leads with the code behind the
  disclosure (SEC.2's field order untouched — this ticket changes copy only). Under
  `invite` the closed-program copy stays — it is true there. The footer is `Rhēma`.
- **Jargon sweep + lint (PR-U2; ADR-059).** `copy.test.ts` lints
  `collectCopyStrings()` for `fixture`, `1.x`, `later pass`, `lands here`,
  `phase <n>`, `beta`, `coming soon`; the only sanctioned keys are the invite-mode
  gate copy. The verbs' `disabledReason`s and the `resolve.ts` fallback now say
  "isn't available yet."; the unsupported "founding beta rate" claim is gone (the
  offer link stays env-gated and points at config-derived pricing). `commands`/`ide`
  tests pin the palette: unlaunched verbs never render, and a hand-typed one still
  resolves honestly disabled. The venue line stays honest — no verification claim
  while H4 is open.
- **Launched workflows, one source (PR-U3; ADR-061).** `LAUNCHED_WORKFLOW_KEYS`
  (contracts) is pinned one-for-one to `WORKFLOW_MANIFESTS` by a protocols test —
  drift is a build failure. Preferences renders `USER_LAUNCHED_WORKFLOW_KEYS`
  (`reseed_charter` launches only as the system run); `PUT /settings/preferences`
  422s a rigor override keyed on any unlaunched workflow (a `null` still prunes a
  stale key).
- **Honest Inbox (PR-U4; ADR-063).** The heading count renders `blocked.length` —
  the exact Needs-you rows; the rail badge keeps REQ-IDE-2's approvals+decisions
  semantics. `completed_partial` rows say "stopped early — the kept results are
  ready" (event row, mail-suppressed); recoveries say "Run stalled — restarted
  automatically", collapse per run, and never re-badge on a repeat upsert
  (`keepReadOnRepeat`). Every row names its project.
- **Document head (PR-U8; ADR-060).** `docMetaFor` gives every route a distinct
  `<page> · Rhēma` title (project surfaces prefix the project title); public routes
  emit `description` + `og:*` + `twitter:*` (+`canonical`/`og:url` when the handler
  passes the origin); all interpolation escaped. An inline-SVG brand mark serves at
  `/favicon.svg` + `/favicon.ico`. `PageTitle` is the one `<h1>`; `SectionTitle` is
  now `<h2>`.
- **`/showcase` (ADR-062; REQ-GROWTH-11, invariant 13).** Public route: signed-out →
  the static read-only sample dossier (same `DossierView` path the landing embeds);
  signed-in → 302 to the workspace's own Showcase dossier (or project page when no
  review run yet, or the sample for accounts without one). Never another tenant's.
- **Branded magic-link email (PR-U9; ADR-064).** `renderMagicLinkEmail` — macron'd
  brand, a real button + paste-the-URL fallback, the expiry line derived from
  `MAGIC_LINK_EXPIRES_SECONDS` (the same constant `magicLink({expiresIn})` reads —
  15 min, now explicitly configured), the didn't-request-it safety line, a plain-text
  part, and a per-send nonce subject (`Your Rhēma sign-in link · <nonce>`) that never
  carries the token. `magicLinkSender(queue)` keeps the `auth.mail` transport
  unchanged.
- **Journeys.** Registry rows `N10` (public meta/copy/h1/favicon + signed-out
  `/showcase`) and `R8` (signed-in `/showcase`, Preferences launched-only, Inbox
  count === waiting rows) — green, $0.

## REQ ids

REQ-SPEC-2 (copy half; primary), REQ-IDE-41; touched REQ-IDE-2 (badge rule kept),
REQ-PROD-6, REQ-GROWTH-11, REQ-POS-4/5/13, REQ-BETA-19 (note), REQ-SPEC-29.

## ADRs

- **ADR-059** — jargon lint in `copy.test.ts`; sanctioned exceptions enumerated
- **ADR-060** — route-aware document head; favicon; one `<h1>` per page
- **ADR-061** — manifest-derived launched-workflow set + the settings gate
- **ADR-062** — `/showcase`: signed-out static sample; signed-in own Showcase
- **ADR-063** — Inbox honesty: waiting count = rendered rows; partial reword;
  recovery collapse without re-badge
- **ADR-064** — magic-link email: config-derived expiry + nonce subject, token only
  in the link

## Test plan

- `pnpm turbo build lint typecheck` — **135/135 tasks**
- `pnpm test` — **431 files / 4269 tests green**
- `pnpm check:licenses` — 609 packages OK; `pnpm check:protocol-markers` — clean
- New/updated coverage: `copy.test.ts` (jargon lint + mode keys),
  `render.test.tsx` (titles/social/escaping/favicon/one-`<h1>`), `server.test.ts`
  (per-mode copy assertions over six routes), `marketing.test.ts` (all four
  `/showcase` legs), `settings-routes.test.ts` (10 unlaunched keys rejected, 12
  launched accepted, null-prune legal), `magic-link-email.test.ts` (brand, parts,
  expiry, safety, unique token-free subject), `notifications.test.ts` (partial
  reword + no-re-badge collapse), `manifests.test.ts` (launched === manifests),
  `commands`/`palette`/`routes`/`registry` tests.
- **Stage B — executed on prod 2026-10-03.** Cloud Build `ux1` at `4d2906f` → `pulumi up`
  update 130 (7 updates, 0 replaces/deletes) → provenance PASS (api+web `/healthz` =
  `4d2906f`; `deployments` row `prod:4d2906f748…73c6`, all nine digests,
  protocols `0.4.0+ec61156725a895ab`). Journeys `N2`/`N10`/`R8` all PASS with provenance
  match, $0 — `docs/build/reports/UX.1/` (report + 3 screenshots). Real magic-link email
  read from `test@rhema.tools` via the keyless Gmail-DWD client: subject
  `Your Rhēma sign-in link · <nonce>` (token-free), "expires in 15 minutes",
  the didn't-request-it line, token only inside the verify URL
  (`mail-evidence.json`). Full detail: run ledger §4.

## Risks / notes

- The api's `/inbox` read already joins `project_title`; rows without a project
  (account-level events) render no meta line — deliberately, never a fabricated name.
- `LAUNCHED_WORKFLOW_KEYS` adds the `reseed_charter` nuance: launchable but
  system-only — it is IN the launched set (manifest-pinned) and OUT of the
  user-facing list.
- The `/favicon.ico` path serves SVG bytes (browsers honor content-type over
  extension); cache day.
- C1's claim half stays ACT.1's; UX.1 authored no numeric/trial claim — the only
  money-adjacent copy removes an unsupported claim and points at `/pricing`.
