# HOT.1 — Prod hotfix pack: dossier 500, page.js route, Quiet affordance, digest query, LB logs, false claims hidden

- **Sequence:** 60 (round 3) · **Phase:** round 3 — launch readiness · **Kind:** ticket · **Tag:** fix
- **base_branch:** current checkout (the chain tip the previous round-3 row left; stacked PR)
- **Depends on:** SEC.1
- **Scope (one line):** Fix the $0 prod defects a new user hits first, then deploy the chain tip to prod, including cf40f28's Stripe fixes. The defects: the dossier 500 (with prod-shape contract tests), `/assets/page.js` unrouted (with a bundle↔route parity test), the invisible Quiet group, the digest's `r.finished_at`, LB request logging off, and the false trial/"loops" claims (hidden behind a `claims` config).
- **Spec §§:** §15.3 (Showcase), §5.2 (project list), §5.11 (digest), §13.5 (2026-09-30 banner), §14.3 / §15.2 (claims — rendering is ACT.1/EST.1's); ADR-016, ADR-014 §3, ADR-013
- **REQ coverage:** REQ-POS-3 (primary), REQ-GROWTH-11, REQ-IDE-4, REQ-SPEC-29 (parity half) (stamp in the PR)
- **Absorbs (backlog):** BL-52(a) (PR-J3 dossier 500), BL-53(a) (PR-J4 page.js route), BL-54 (PR-J5), BL-65 (PR-O1; PR-O3 logging half), BL-09 (deploy the STB.4 Stripe fixes; X-stb4-stripe-fixes-undeployed)
- **Run:** `implement-spec spec=docs/tickets/60_HOT.1__prod-hotfix-pack.md`
- **Gate status:** None beyond the round-3 standing authorization (ADR-013). The prod deploy is pre-authorized once the additive-migration lint (deliverable 8) passes, the preview shows zero replace/delete on stateful resources, and the cost delta is ≤ $15/mo. HOT.1 never performs SEC.1's role switch. Session-bearing HTTP legs use a test account signed in through the real magic link: operator-assisted until the HUMAN-H7 test mailbox exists, else `D-HOT.1-n`.
- **Live stage:** Stage A: code + tests ($0). Stage B: `pulumi preview` → `pulumi up prod` of the chain tip + HTTP-level legs + screenshots, $0 inference (cap $0).

## Goal
The 2026-09-30 review (`docs/build/reports/2026-09-30_prod-design-review.md`) found five $0 defects on surfaces
every new user meets:
- The Showcase dossier and the STB.3 Memo dossier return **HTTP 500** (PR-J3). Web stderr: `TypeError … reading
  'length' at DossierPage`, at `apps/web/src/pages.tsx` ~2491 `f.evidence?.urls.length`. The Showcase seed
  writes `evidence` as an **array** of `{claim, source}` (`packages/db/src/seed/showcase.ts` ~224/235), so
  `.urls` is undefined. Older sidecars carry `{verdict}` without `urls`, while the sidecar contract makes `urls`
  optional (`packages/contracts/src/sidecars.ts` ~422).
- `build-client.mjs` builds 5 bundles, but `server.ts` ~4960–4996 serves 4. `page.js` 404s, so the Page editor
  island never mounts (PR-J4a).
- The Quiet group's `<summary>` has `listStyle:"none"` and no marker (`packages/ui/src/project-list.tsx` ~364–365),
  so an all-Quiet workspace looks empty (PR-J5).
- The hourly digest queries `r.finished_at` (`packages/orchestrator/src/notifications.ts` ~1250–1251), but
  `runs` has `ended_at` (`0002_schema.sql` ~193). The sweep fails every hour (PR-O1).
- The chat 502 left no log line because LB request logging is off (PR-O3).

Separately, the landing/pricing copy promises a free first review and "≈3 essay loops" that the product cannot
honour (PR-J1/E5). Until ACT.1/EST.1 render them from config, they must not show.

## Load (read these — do not re-read others)
- The review's PR-J3/J4/J5/O1/O3 rows and Process findings 2, 4 and 5; ADR-016 (parity + prod-shaped fixtures);
  ADR-014 §3 (HOT.1 hides the claims).
- SEC.1's ADR: the pool rule and the **"role change" definition** deliverable 8 encodes.
- Evidence readers:
  - `apps/web/src/pages.tsx` (`DossierPage` ~2227; ~2491)
  - `packages/ui/src/findings.tsx` ~92
  - `packages/findings-core/src/surface.ts` ~124 and `ledger.ts` ~94–102
  - `packages/mirror/src/delivery.ts` ~492 (already `?.`-safe)
- `packages/db/src/seed/showcase.ts` (`seedShowcaseProject` ~355), `apps/api/src/showcase.ts`.
- `apps/web/build-client.mjs` ~16 (the entry list), `apps/web/src/server.ts` ~4955–5010, `apps/web/src/page.test.ts` ~93.
- `packages/ui/src/project-list.tsx` ~350–385; `apps/web/src/server.test.ts` ~1191.
- `packages/orchestrator/src/notifications.ts` ~1230–1290 (`runDigest`; dispatched per workspace in a tenant tx at
  ~552–560; swept from `apps/worker/src/main.ts` ~620–639).
- `infra/pulumi/compute.ts` ~657–705: the `web` / `api` / `collab` `BackendService`s have no `logConfig`
  (`network.ts` ~95 is the only precedent).
- The claims:
  - `apps/web/src/copy.ts` ~1961 (`trialNote`, rendered at `marketing.tsx` ~104) and ~2043 (FAQ)
  - `packages/contracts/src/domain/pricing.json` ~44/63/82 (`whatItCovers` "≈N … loop(s)", rendered at
    `marketing.tsx` ~275 and `pages.tsx` ~5731) and ~117 (`includedNote`, rendered at `pages.tsx` ~5685 via
    `pricing-page.ts` ~205)
  - the existing launch-surface sweep, `packages/security-checks/src/launch-surface.test.ts`
- `git show cf40f28` (the three Stripe fixes); `web /billing/return` at `server.ts` ~2623.
- `infra/PROD-BRINGUP.md` (deploy + migrate + provenance steps); `scripts/record-provenance.mjs`.

## In scope — deliverables
1. **One evidence normalizer** (REQ-POS-3, REQ-GROWTH-11).
   - Add `normalizeEvidence` in `packages/findings-core`. It accepts the canonical `{verdict?, urls?}` shape,
     the Showcase `[{claim, source}]` array, and `{verdict}` with no `urls`, and returns the canonical shape
     with `urls: []` when absent.
   - It is called at every evidence read listed in Load. The finding type makes `urls` optional so the compiler
     flags any unguarded read.
   - The Showcase seed writes the canonical shape for **new** workspaces. Existing rows are read through the
     normalizer, with **no backfill**: a one-off prod data write would pause.
2. **Prod-shape contract tests** (REQ-POS-3; REQ-SPEC-29 fixtures).
   - Committed synthetic fixtures, with no prod user data copied: `seedShowcaseProject`'s real output, a
     `{verdict}`-only sidecar reproducing the STB.3 Memo shape, an array-evidence sidecar, and a current one.
   - For each, `DossierPage` SSR renders without throwing.
   - The Showcase dossier shows its contradicted Tier-1 claim with its URL (the REQ-POS-3 check). ADR-016 makes
     these fixtures the canonical prod-shaped set later contract tests reuse.
3. **`/assets/page.js` + bundle↔route parity** (BL-53a; REQ-SPEC-29 parity half).
   - Make the build-client entry list the single source (exported).
   - One table-driven `/assets/<entry>.js` route replaces the four hand-written handlers.
   - A parity test fails CI when:
     - a built entry has no 200 JS route
     - a page references an `/assets/*.js` with no build entry
   - It runs in the `typecheck/lint/unit` job.
4. **The Quiet affordance** (BL-54; REQ-IDE-4). The collapsed group's summary shows a visible, focusable
   disclosure: a marker/chevron, "N quiet" and a Show/Hide cue, keyboard-operable with native `details` semantics.
   A test asserts that the affordance renders for an all-Quiet workspace, and fails without it.
5. **Digest query** (BL-65 PR-O1).
   - Change `r.finished_at` to `r.ended_at`, and add an explicit `p.workspace_id` predicate (belt-and-braces
     under SEC.1).
   - Add a PGlite-backed test, run as SEC.1's user role, that executes `runDigest` against the migrated schema.
     It must fail on the pre-fix column.
   - Add a class guard: every SQL literal in `notifications.ts` is `PREPARE`d against the migrated schema.
6. **LB request logging** (BL-65 PR-O3, logging half): `logConfig: { enable: true, sampleRate: 1 }` on the
   `web` / `api` / `collab` backend services. The preview must show an in-place **update**. Record the
   estimated monthly Cloud Logging delta (it must be ≤ $15). OBS.1 adds error reporting on top.
7. **The `claims` visibility config** (shared decision: owner). This is one typed config in `packages/contracts`,
   keyed by claim id:
   - `trial.firstReviewIncluded` covers `trialNote`, the FAQ answer and `includedNote`.
   - `plans.whatItCovers` covers the Writer/Studio/Studio Max "≈N … loop(s)" lines.

   Both are **hidden** now. Every surface renders a claim only when its id is enabled. A test (beside the
   launch-surface sweep) fails if any rendered landing, pricing or billing page, or the copy table, contains a
   hidden claim's text. ACT.1 re-enables the trial claims from the entitlement config; EST.1 re-enables
   `whatItCovers` from the estimator.
8. **The additive-migration lint.** The standing authorization presupposes it, the partition names no owner,
   and HOT.1 is the first pre-authorized deploy. Build `scripts/check-additive-migrations.mjs` + tests. For the
   migrations newer than a given base (the prod `_migrations` max or a SHA), it fails on:
   - `DROP`
   - `RENAME`
   - `ALTER COLUMN … TYPE`
   - a table rewrite: e.g. `SET NOT NULL` without a check, or `ADD COLUMN` with a volatile default
   - a **role change** as SEC.1's ADR defines it

   It runs in the `contracts` job and in the runbook's pre-deploy step.
9. **Deploy** (BL-09 fixes):
   - `pulumi preview` shows zero replace/delete on Cloud SQL, buckets, Redis and secrets.
   - The lint passes, and the cost delta is ≤ $15.
   - `pulumi up prod` of the chain tip, which includes cf40f28:
     - the included-credit double grant
     - the return URL 404 / `?cancelled=1` loop
     - the server-pinned `rateTableVersion`
   - Migrations are applied per the runbook, and a `deployments` row is written with the chain-tip SHA.

## Out of scope
- The walkthrough job failure: RUN.1 (BL-52b).
- The Edit source → `/v/working` 404, `my-first-project` and proving the island mounts + saves: EDIT.1 (BL-53b,c).
- Rendering the trial/"what it covers" claims truthfully: ACT.1 (claim render model + pricing-page content) and
  EST.1 (the estimator). The `/showcase` route, titles/meta and copy sweep: UX.1.
- The listener leak and 5xx error reporting: OBS.1. Purchase/checkout: BILL.3. The role switch: SEC.1.
- The browser journey harness: JOURNEY.1. HOT.1 uses ad-hoc headless Chrome only for screenshots.

## Acceptance criteria
- [ ] `normalizeEvidence` handles all three shapes. Each of the four fixtures' `DossierPage` renders without
      throwing, and the test fails with the normalizer bypassed. The Showcase dossier renders its contradicted
      Tier-1 claim + URL (REQ-POS-3). *(deterministic)*
- [ ] The parity test fails when an entry is added to `build-client.mjs` without a route, or a page references an
      unbuilt bundle. `/assets/page.js` serves 200 `text/javascript`. *(deterministic)*
- [ ] The Quiet affordance test fails without the marker. *(deterministic)*
- [ ] The `runDigest` PGlite test fails on `r.finished_at` and passes on `r.ended_at`. The SQL-prepare guard
      covers `notifications.ts`. *(deterministic)*
- [ ] The claims test fails if `trialNote` / `includedNote` / a "≈N loops" line renders while hidden, and passes
      once each id is toggled on in a test config. *(deterministic)*
- [ ] The additive-migration lint rejects fixtures for DROP / RENAME / TYPE / rewrite / `ALTER ROLE`, and
      accepts SEC.1's new-role migration and `ADD COLUMN IF NOT EXISTS`. *(deterministic)*
- [ ] `pulumi preview` shows no stateful replace/delete and an in-place LB `logConfig` update, and records the
      cost delta. The deploy lands. *(agentic)*
- [ ] Deployed provenance (the `deployments` row + Cloud Run image digests) equals the chain-tip SHA, which
      contains cf40f28. *(agentic)*
- [ ] Stage B HTTP-level evidence:
  - `/assets/{editor,ide,page,outline,landing}.js` all return 200 JS.
  - As a fresh test account, the Showcase dossier returns 200 with its findings (journey step **N7**, HTTP half)
    and the project list HTML carries the Quiet affordance (step **R1**, HTTP half).
  - A project page with `page.js` served loads with zero console errors (ad-hoc headless check).
  - Landing, pricing and billing HTML contain none of the hidden claim strings.
  - `/billing/return?cancelled=1` renders once with no refresh loop.
  - After ≥ 1 hourly sweep, the Cloud SQL logs show no `column r.finished_at does not exist`.
  - A deliberate 404 appears in `loadbalancing.googleapis.com/requests`.

  *(agentic)*
- [ ] Screenshots (desktop 1440×900 + phone 390×844) of the project list with the affordance, the Showcase
      dossier, and the landing/pricing without the hidden lines, committed under
      `docs/build/reports/<date>_HOT.1/`. *(agentic)*
- [ ] N7 and R1 are handed to JOURNEY.1 to register **expected-green** (their fixes landed here). Any leg that
      needed a session, when no test account was obtainable, is a `D-HOT.1-n` row, never a fabricated pass.
      *(agentic)*
- [ ] verification green; every new behaviour has a test that fails if it is removed; requirement ids stamped in the PR; anything not automatically verifiable is a `DEFERRALS.md` row with its compensating control; ADRs written for every deviation and owned decision; `BUILD_INDEX.md` row and `LEDGER.md` advanced. *(agentic — the universal phase-gate AC)*

## Requirement IDs to satisfy and stamp in the PR
- REQ-POS-3 (primary — the Showcase dossier renders its contradicted Tier-1 claim)
- REQ-GROWTH-11 (the seeded Showcase is readable)
- REQ-IDE-4 (Quiet collapsed by default, and visibly expandable)
- REQ-SPEC-29 (parity half: a built bundle without a served route fails CI)

## Cross-cutting invariants
- Manifest **#12** / REQ-SPEC-29: HOT.1 owns the bundle↔route parity. It lands before JOURNEY.1, so its evidence
  is HTTP-level + tests + screenshots. It records deployed provenance = chain-tip SHA.
- Manifest **#13** / REQ-SPEC-30: every query touched runs on the user pool under RLS. No `systemExec` enters a
  route (SEC.1's lint).
- Manifest **#14** / REQ-SPEC-32(b): hiding the claims is the interim step, and no new hand-written price or trial
  figure is added anywhere.
- Manifest **#9**: the claims config must not introduce any superiority claim.
- Manifest **#1**: vocabulary lint on any new copy (the affordance label).

## Notes
- **Owned decisions → write an ADR:**
  - normalize at read with no backfill, and where the canonical shape lives (the contract amends only by a dated
    note)
  - the `claims` config shape and its consumers' contract (ACT.1/EST.1 flip ids and never add parallel copy)
  - whether the Quiet group renders **expanded when it is the only non-empty group** (the review's point). This
    departs from REQ-IDE-4's literal "collapsed by default", so it needs an ADR if adopted; the affordance alone
    satisfies step R1.
  - the lint's rule set and base selection
- **Mount-safety of `page.js`:** the island has never run live. If serving it regresses project pages, ship the
  route disabled by config, add a parity-test exemption with an owner (EDIT.1) and an expiry, and open
  `D-HOT.1-n`. Never leave a silent 404.
- **Consumes:** SEC.1 (the pool rule; the role-change definition). If SEC.1's switch window has not opened, this
  deploy carries SEC.1's inert role migration and its `/voices` predicate, which closes the live leak. The switch
  stays SEC.1's `D-SEC.1-1`.
- **Consumers:** JOURNEY.1 (asserts parity on the deployed stage; registers N7/R1); ACT.1/EST.1 (the claims ids);
  OBS.1 (LB logs).
- **Anchors to re-confirm at build time:** all line numbers; the STB.3 Memo findings' actual evidence shape (read
  its sidecar schema, not prod data); the `/billing/return` cancelled-state fix location in cf40f28.
- **DEFERRALS rule:** anything not verifiable at build time, or blocked on HUMAN-H7 (the test mailbox), becomes a
  `D-HOT.1-<n>` row.
