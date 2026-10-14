# Brief — round 5: post-SPA disposition & completion

**Goal (operator, 2026-10-15):** the round-4 chain is landed and deployed (`ffbb8ad` serving prod;
the free journey suite is green-or-owed at the tip). Round 5 does two things: **(a) completes the
SPA's dormant value prop** — the deployed app never client-routes on link clicks (62+ plain
`<a href>` across `spa/` + shared SSR components, zero `<Link>`, no delegated interceptor — every
nav is a full document GET that re-mounts the shell), and **(b) dispositions the post-chain open
backlog** — owed legs, funded-window live legs, ops residuals, memory/spec hygiene — into tickets
the orchestrate-build machinery can drive. Produce the spec + decomposition through the repo's own
machinery: synthesize-spec → decompose-spec → orchestrate-build.

## Fixed constraints (⚑ — operator-fixed, not up for redesign)

- `mergePolicy: OPERATOR`; stacked PRs; build-memory conventions; append-only history.
- JOURNEY.1 browser journeys remain the user-surface acceptance mechanism (REQ-SPEC-29).
- The SPA renderer contract is settled law: public funnel + phone + showcase Page rows serve SSR
  forever; every other authenticated document GET serves the shell; `data-renderer`/`data-route`/
  `data-mounted` are the settle markers; flag machinery stays deleted (ADR-106/107/108, spec §14).
- BFF transport contract unchanged: `bffFetch` JSON envelope `{ok,redirect,flash,data,pending,url}`
  for mutations; no client POST retries; `/bff/*` typed reads.
- Strict CSP posture retained; canonical-vocabulary lint and all public-safe gates keep applying.
- Session cookies stay on `rhema.tools`; ADR-040 internal-stamp seam preserved.
- Secrets never in the repo or ledgers; prod data writes use reviewed scripts over the system-role
  DSN (the `reseat-n9-fixture.mjs` pattern), never ad-hoc SQL.
- The eval/benchmark track (BL-40/43/44/45 — H2 corpus, eval bindings, pilot wave, G2 LIFT) is
  **out of round 5** (operator ruling 2026-10-15) — it stays ledgered, not decomposed.
- Operator-owned rows stay operator-owned (merges BL-01, economics ruling BL-13, browser session
  BL-32, live Stripe BL-33, human/procurement items); they appear in the register, not the build
  manifest — except where a ruling blocks a build row.
- §16.4 marketing claims stay frozen pending G2.

## Operator rulings already taken (2026-10-15 — do not relitigate)

- **Q-scope-1 (nav):** the "MPA-mode" gap is a defect, not an accepted posture — intra-app nav must
  actually go client-side per the spec's boundary rule. Fix is in scope.
- **Q-scope-2 (eval track):** excluded from round 5 (see ⚑).
- **Q-scope-3 (funded window):** test-economics design lands BEFORE the funded window opens — the
  live paid legs run under whatever cost-reduction regime the spec defines.
- **Q-scope-4 (BL-38):** prod test-data residue cleanup is delegated to the build (was operator).

## What the spec must answer

- **Nav completion:** the interception mechanism (delegated same-origin interceptor vs `<Link>`
  port vs hybrid), the skip-list classification (public routes, forced-SSR Page family,
  `reloadDocument` stubs, `download`/`target`/external, modifier keys), the settle-contract
  extension that lets journeys *see* nav mechanism (currently invisible — the gap that let this
  ship unnoticed), and what REQ-NAV-6 keep-alive / Query-cache / scroll-restoration mean once
  navs actually stay in-router.
- **Test economics:** measured spend audit → lever design (model-tier routing for test tenants,
  fixture sizing, per-leg caps, deterministic providers where the model isn't the leg's object) →
  the guard composition (weekly spend guard, per-ticket caps, fail-closed tripwire).
- **Fixture substrate:** what each owed free leg needs to flip (T17, P1.dossier, T8, T12F/T13F)
  and which are code, fixture, or operator-ruling.
- **Ops residuals:** the prod-cost lever set ($285.80 measured vs ~$50 target — BL-29), the
  launch-verification remainder (BL-24), preview-stage legs (BL-25/80), nightly golden (BL-36),
  soak evidence (BL-74).
- **Memory/spec hygiene:** validator status-cell fixes (BL-02), REC.2 reconciliation — including
  folding the nav deviation + GATE-ACCEPT triggers back into the specs (BL-05), the Later-scope
  census (BL-73).
- **Funded-window leg census:** every ledgered paid leg (BL-16…21, 56, 66–72, 78, 79) enumerated
  as a verifiable ticket with its spend bound under the new regime.
- **Disposition map:** for every open BL row + open DEFERRALS row — decompose / operator / defer /
  drop — so `projectStatus` can move to DONE when the manifest completes.
- **Operator-decision register** for everything genuinely operator-level.

## Explicitly out of scope

- Backend data-model or api-semantics changes (except what a residual row names).
- Product redesign; new features beyond what residual rows name.
- The eval/benchmark track; H3 partner-program work (BL-39); corpus procurement (BL-40–42).
- §16.4 marketing claims.
- Re-litigating landed ADRs — revisit-trigger watches continue per BL-47/76/77/84 convention.
