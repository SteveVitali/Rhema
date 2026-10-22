# R6POST.2 — Posture stages: domains-bearing preview (collab) + Stripe test-mode preview — run ledger

- **Spec:** `docs/tickets/190_R6POST.2__posture-stages.md` (manifest row 190, round 6 — Kind:
  ticket) — `implement-spec`; spec §4.6 `REQ-POST-6`
- **Base:** `stevevitali/r6post-1-prod-arms` @ `83f2532` (chain tip; PR base = same;
  mergePolicy=OPERATOR — never merge). **Prod serves `dc7fb15`** — untouched by this ticket.
- **Branch:** `stevevitali/r6post-2-posture-stages`
- **Harness:** devin-desktop/swe-2-high/subagent · **Skills:** implement-spec + build-memory +
  self-review @ `~/agent-skills` (`e981ec5`)
- **Requirement ids stamped:** REQ-POST-6
- **Live stage:** owned `pr-<n>` posture stacks (≤ $8 each); torn down + orphan-swept.
- **Production mutations (GD-PREAUTH-ACTS.R6 — exact scope):** DNS records under the preview
  subdomain only (created → removed inside the ticket). Nothing on the prod stack.
- **Spend posture:** all journey legs `paid:false`; infra-only spend (Cloud Build + a preview
  stack's bounded lifetime), recorded.
- **Started:** 2026-10-22T22:10Z · **Closed:** (open)

## Deferrals read

`docs/tickets/DEFERRALS.md` read first (protocol). Load rows + dispositions:

- **D-SPA.24-1** — OPEN; VERIF.2 re-owe verbatim: *"the collab legs cannot green on a preview by
  design — `COLLAB_WS_URL` only exists when a stage has real domains (the same-origin
  `wss://<app>/collab` the `__Host-` session cookie rides); a `*.run.app` origin cannot
  path-route /collab, so the Page mounts the static read view and `N8`'s fork/rebind +
  `R10.keepalive`'s sync-TTL legs have no wire to observe (`N8` failed verbatim on both image
  builds; `R10.keepalive` reported owed; `R10` itself reported `ready-to-flip`). Row stays OPEN —
  the collab legs need a domains-bearing stage (prod arm, or a preview fronted by a real
  domain)."* 2026-10-20 ruling: domains-bearing `pr-<n>` posture stage **authorized** (this
  ticket). → this run's stage A.
- **D-SPA.16-1** — OPEN; VERIF.2 re-owe verbatim: *"the gate's only step (`N9`) cannot green on a
  preview by design — Choose Writer needs a Stripe-hosted hand-off and `PREVIEW_REQUIRED_SECRETS`
  never carries `stripe-secret` (REQ-ARCH-38); the live leg lands on `?notice=stripe_unconfigured`,
  which IS the intended preview posture. Posture-owed, not a product defect."* 2026-10-20 ruling:
  Stripe-bearing stage **authorized** (test-mode `sk_test`). → this run's stage B.
- **D-SPA.20-1** — OPEN on the N9 arm only (N4/R7/P1.runsheet already green on pr-186); same
  Stripe posture blocker, same authorized out. → this run's stage B.
- **D-OPS.1-1** — OPEN on the N9 + R10.keepalive residuals (R6POST.1 note, prod `dc7fb15`): N9's
  FAIL was substrate drift (prod no longer carries the funded tenant seeds) + R10.keepalive
  expected-red awaiting its first live keepalive event. A green N8/R10.keepalive here discharges
  the keepalive half; the row's "full list green" condition stays unmet — dated note, stays OPEN.

## Requirements (ticket deliverables)

1. A domains-bearing preview fronted by a preview subdomain: `COLLAB_WS_URL` resolves;
   `N8` + `R10.keepalive` run with `--expect-renderer spa`.
2. A Stripe test-mode preview: `sk_test` bound from **nonprod** Secret Manager (never a prod
   secret, REQ-ARCH-38 — H10 attested provided; verify presence, never print/commit the value);
   `N9` runs the Stripe-hosted hand-off in test mode.
3. Both stages destroyed; preview-subdomain DNS records removed; orphan sweep verified; resource
   cost recorded.
4. D-rows flipped with evidence or honestly re-owed.

## Acceptance criteria

- [ ] `N8`, `R10.keepalive`, `N9` reports committed per stage *(staging-verified)*
- [ ] DNS records + stacks removed; verified absent *(staging-verified)*
- [ ] Universal phase-gate AC *(agentic)* — verification green, tests for new behaviour, REQ ids
  stamped, DEFERRALS rows for the unverifiable, ADRs for deviations, BUILD_INDEX + LEDGER
  advanced, operating clauses met.

## DNS scope — pre-recorded (GD-PREAUTH-ACTS.R6, recorded BEFORE any creation)

**Finding (probed 2026-10-22T22:0xZ, `dig` + `gcloud dns managed-zones list`):** `rhema.tools`
resolves at **Squarespace DNS** (`nsb*.squarespacedns.com`) — the zone is registrar-held, NOT
Cloud DNS; no public managed zone exists in `rhema-507501` (or any reachable project). There is
no agent-executable write path into that zone: records under `*.rhema.tools` can only be applied
by the operator at the registrar (HUMAN-H6's own record: "No Cloud DNS zone exists in
`rhema-507501` — records are applied at the registrar").

**Decision — records created: ZERO.** The domains-bearing stage fronts on a **public
wildcard-DNS name** (`*.sslip.io`) that resolves to the stack's reserved LB IP with no records to
create or remove — strictly inside the authorized envelope (a subset of "records under the
preview subdomain, created + removed": none created, none removed, nothing outside it). The
preview subdomain used is `pr-<n>.<lb-ip>.sslip.io` (+ `api.`/`uc.` siblings — exact names
recorded in Progress once the IP exists). Deviation vs the ticket's `rhema.tools`-subdomain
phrasing → ADR + FIRST-LINE report flag. Any act that WOULD need a record outside that envelope
(operator-side delegation `preview.rhema.tools NS …` at Squarespace) → PAUSE/flag, never done.

## Requirements → stage config plan

- `rhema:postureDomains` (stack config, non-prod only — prod refuses): merged over
  `stageConfigFor(stack)` so `cfg.domains` drives the existing prod machinery verbatim — managed
  cert SANs, URL-map host rules (`<app>` → web w/ `/collab*` → collab, `<api>` → api, `<uc>` →
  bucket), `COLLAB_WS_URL=wss://<app>/collab` on web, `APP_BASE_URL`/`API_PUBLIC_URL`/
  `INTERNAL_AUTH_AUDIENCE`/bucket-CORS origins all deriving from the same block.
- `rhema:postureLbAddress` (stack config, non-prod only): a pre-created `gcloud compute
  addresses` global IP the program adopts (`GlobalAddress.get`) so the LB IP is known BEFORE the
  names are minted (the wildcard name embeds the IP — one `up`, no FR replacement).
- `rhema:extraRequiredSecrets` (CSV, non-prod only, validated against `ALL_SECRET_IDS`): the
  Stripe stage's `stripe-secret` opt-in so `requires("stripe-secret")` wires
  `STRIPE_SECRET_KEY_NAME` on api + worker — only on stacks that ask.
- `rhema:stripeSecret` + `preview-stack.mjs stripe-pull`: the shared nonprod secret
  `rhema-nonprod-stripe-secret` piped gcloud→pulumi over stdin (the resend-pull shape — value
  never in argv/logs), replacing the OPS.1 placeholder version. Prod + set ⇒ program refuses.
- `rhema:stripePaymentLinkUrl` already exists (plain config) — a TEST-mode Payment Link minted
  through the Stripe API with the in-process key for the run-sheet Add-credits arm.

## Test matrix

| AC → test | kind |
|---|---|
| posture overrides merge (domains + requiredSecrets ext), prod refusal, unknown-id rejection, dedup | `infra/config/stages.test.ts` (`withPostureOverrides`) |
| `stripe-pull` verb: prod/non-pr refusal, ownership gate, gcloud→stdin pipe (never argv), absent-secret short-circuit | `scripts/live/preview-stack.test.mjs` (mirror resend-pull block) |
| `stripe-secret` real-version plan reuses `resendVersionPlan` (already pinned) | `infra/pulumi/resend-key.test.ts` (existing pins stand) |
| stage-A legs: N8 fork→save + R10.keepalive session-reacquire under `--expect-renderer spa` on the domains stage | live — journey reports committed |
| stage-B leg: N9 Stripe-hosted hand-off (test mode) | live — gated on `rhema-nonprod-stripe-secret` presence (probe first; absent ⇒ withhold + dated re-owe) |
| teardown: destroy → rm → manual-address delete → orphan sweep zero → cost recorded | live — sweep output committed |

## Plan

1. Ledger + branch + code (stages.ts `withPostureOverrides`, index.ts posture config + stripe
   plan, compute.ts `lbAddress` adoption, preview-stack `stripe-pull`, tests) → verify → commit.
2. Push → open PR → the PR number names `pr-<n>` (stage A) / `pr-<n+1>` (stage B).
3. Images: `gcloud builds submit infra/cloudbuild/image-set.yaml` all 10 at HEAD (~10 min).
4. Stage A: `gcloud compute addresses create rhema-pr-<n>-lb --global` → mint sslip names →
   `preview-stack.mjs init` → config (project/region/gitSha/protocolsVersion/emailFrom/
   googleOauthClientId/postureDomains/postureLbAddress/serviceImages/proxyImage) → resend-pull →
   `up` → migrate Job → seed-invite → cert ACTIVE wait → N8 + R10.keepalive
   `--expect-renderer spa`.
5. Stage B: probe `rhema-nonprod-stripe-secret` (version list only — never access the value).
   Absent ⇒ withhold with dated re-owe (machinery still lands, engineered); present ⇒
   init/config/stripe-pull/up/link-mint/seed-invite → N9.
6. Teardown: destroy → rm → delete the manual address → 25-class orphan sweep → cost record.
7. Self-review + gap table → DEFERRALS dated notes → closeout (CI read, BUILD_INDEX, LEDGER,
   validators) → PR.

## Progress

- 2026-10-22T22:0xZ — context loaded: ticket + §4.6 + three D-rows + batch-3 "authorize both"
  ruling + GD-PREAUTH-ACTS.R6 scope + anchors (stages.ts/compute.ts/index.ts/preview-stack.mjs/
  journeys N8/N9/R10.keepalive impls) + R6DEP.1 bring-up recipe + H10 readout.
- 2026-10-22T22:1xZ — **secrets probe (presence only, values never accessed/printed):**
  `rhema-nonprod-resend-api-key` v1 enabled (seeded 2026-10-16) ✓ — session minting viable.
  **`rhema-nonprod-stripe-secret` → NOT_FOUND** despite the H10 "provided: yes" attestation; the
  project's only stripe containers are `rhema-prod-stripe-secret`/`rhema-prod-stripe-webhook-secret`
  (prod secrets — REQ-ARCH-38 bars them from a preview). The ticket names this failure mode → the
  **N9 leg is withheld** pending the operator's actual seed; machinery still lands + a dated
  re-owe rides the three rows.
- 2026-10-22T22:1xZ — **DNS probe:** `rhema.tools` NS = Squarespace (`nsb*.squarespacedns.com`);
  no public Cloud DNS zone in any reachable project; `preview.rhema.tools`/`pr.rhema.tools`/
  `dev.rhema.tools`/`staging.rhema.tools` resolve nothing (no delegation). The registrar path is
  operator-only → wildcard-DNS arm elected (see DNS scope above); **zero records will be
  created.**

## Gap table

_(populated at Phase 4)_

## Evidence log

_(populated through Phase 5)_

## Evidence report

_(populated at Phase 6)_
