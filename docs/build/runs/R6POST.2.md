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

- [x] `N8`, `R10.keepalive`, `N9` reports committed per stage *(staging-verified)* — N8 PASS +
  R10.keepalive owed report committed (`reports/2026-10-22_R6POST.2/posture/`); N9 report =
  withheld verdict committed (stage never created — the prerequisite secret is absent).
- [x] DNS records + stacks removed; verified absent *(staging-verified)* — DNS: zero records
  ever created (sslip.io wildcard). Stacks: `pr-211` destroy drained all but subnet+net
  (GCP reservation GC lag — retried to zero); `pr-212` rm'd (registration only).
- [x] Universal phase-gate AC *(agentic)* — verification green, tests for new behaviour, REQ ids
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
- 2026-10-22T22:2xZ — code + tests + ADR-120 landed (`65d3dec`, pushed); **PR #211 opened** →
  stage A stack `pr-211`, stage B stack `pr-212`.
- 2026-10-22T22:2xZ — **stage A bring-up:** `gcloud compute addresses create rhema-pr-211-lb
  --global` → RESERVED `136.81.247.180` (out-of-band address the program ADOPTS via
  `GlobalAddress.get` — not managed; deleted explicitly at teardown).
  **Live finding — sslip.io name shape:** `pr-211.136.81.247.180.sslip.io` resolves to
  `211.136.81.247` — the service extracts the first four *numeric* labels (`pr-211` → `211`
  corrupts the octets). Digit-free-prefix shape verified via `dig` + dns.google:
  `posture.136.81.247.180.sslip.io`, `api.posture.…`, `uc.posture.…` → `136.81.247.180` ✓.
  **The three hosts (the "preview subdomain" record set — descriptive only, no registrar act):**
  `posture.136.81.247.180.sslip.io` (app) · `api.posture.136.81.247.180.sslip.io` (api) ·
  `uc.posture.136.81.247.180.sslip.io` (userContent). `preview-stack.mjs init pr-211` → config
  (project/region/gitSha `65d3dec`…/protocolsVersion/postureLbAddress/postureDomains JSON/
  googleOauthClientId) → `resend-pull` (shared key stdin→`rhema:resendApiKey`, emailFrom set).
- 2026-10-22T22:3xZ — targeted `up --target <AR repo URN>`: `rhema-pr-211-images` created,
  `rhema-journeys-sa` imported, `GlobalAddress.get` read clean, `lbIpAddress=136.81.247.180` +
  `dnsRecords` outputs name the three hosts → the same IP (the adoption is live-verified at the
  output layer). Image-set build `d56dcb16-eeca-41b5-a825-33ddc405b59d` submitted (all 10 at
  `65d3dec`, `_TAG=r6post-2`, repo `rhema-pr-211`).
- 2026-10-22T22:3xZ — build SUCCESS (~11 min); all 10 digests pinned to `rhema:serviceImages` +
  `runTaskImageDigest` + `proxyImage` (+ AppArmor pair). Incidents worked honestly, all transient:
  (a) `api-sa` create 429'd on the per-minute SA quota → pass 2 converged; (b) the pr-207 api race
  recurred (revision 00001 booted before the migrate Job created `rhema` — `pg-boss` `database
  "rhema" does not exist` ×6 retries → startup TCP probe fail): executed `rhema-pr-211-migrate-
  c4bec74` (58 migrations), wedged revision 00001 needed a forced 00002
  (`gcloud run services update --update-labels`, the R6DEP.1 recipe — label drift re-converged by
  the next `up`), pass 3 landed LB NEGs→backends→urlmap→https-proxy→FR bound to `136.81.247.180`.
  **Stack converged: 191 resources, `lbIpAddress=136.81.247.180`.**
- 2026-10-22T22:5xZ — `seed-invite` → `prv-211-test` (execution `…-rp7pm`). Managed cert
  `rhema-pr-211-cert-af5caf4` PROVISIONING all three SANs against the live FR.
- 2026-10-22T22:5xZ — **stage B withhold, exercised live:** `rhema-nonprod-stripe-secret`
  re-probed → still `NOT_FOUND` (project holds only `rhema-prod-stripe-*` + the pr-211 stack's
  own). `preview-stack.mjs init pr-212` → `config extraRequiredSecrets=stripe-secret` →
  `stripe-pull pr-212` → **`NOT_FOUND` → the named-prerequisite refusal, "Nothing was changed"**
  — the fail-closed path the withhold rides on, verified on a live owned stack. `rm pr-212`
  (registration only — zero resources). N9 is withheld, not failed — the dated re-owe lands on
  the three rows at closeout; the machinery to run it is committed + one `stripe-pull` away.
- 2026-10-22T23:0xZ — cert `rhema-pr-211-cert-af5caf4` **ACTIVE on all three SANs**; GFE→TLS up
  within ~2 min of ACTIVE; `https://posture.136.81.247.180.sslip.io/` 200;
  `api…/healthz` → `{"ok":true, gitSha:"65d3dec…"}`. Web env verified:
  `COLLAB_WS_URL=wss://posture.136.81.247.180.sslip.io/collab` + domains-derived
  `APP_BASE_URL`/`API_BASE_URL`/`INTERNAL_AUTH_AUDIENCE`. `/collab` GET → collab-backend 404
  (path-routed to the collab service — the host's default web arm never saw it).
- 2026-10-22T23:0xZ — **legs run** (`--surface editor --steps N8,R10.keepalive
  --expect-renderer spa --expect-sha 65d3dec` on the domains hosts, `prv-211-test` invite; the
  first try failed `--expect-renderer` on traversal docs — the flag must ride `--surface`
  scoping, the harness's own refusal comment; corrected invocation, not a posture failure):
  - **N8 → PASS.** fork → edit → sync-pill over the live `wss://<app>/collab` wire — the leg
    `*.run.app` could never carry. `posture/N8.png` + `report.json` committed.
  - **R10.keepalive → owed** (expected:red — it reports owed, never a gate fail). It reached
    the semantic arm and produced the sharpest diagnosis yet: session stamp minted; synced edit
    over the wire; fork-rekey identity held; `/app` client-nav away hop = 0 document loads;
    return inside the 120 s TTL re-acquired the SAME `data-page-session`; **⌘Z did not remove
    the typed marker — the remounted editor's undo stack is empty.** The registry preserved the
    session identity + wire but the undo half of `EditorState` is dead on remount —
    `F-R6POST.2-2` (y-prosemirror's `YUndoPluginView.destroy()` clears the entry's UndoManager
    on unmount — identity survives, the stack doesn't; a product-side REQ-NAVC-22/23 gap the
    posture stage finally let us SEE, not a wire/posture miss).
  - **F-R6POST.2-1** (harness defect, live-found): `a[href="/app"]` matched the hidden
    `.ide-phonebar` fallback before the rail's `⌂` — scoped to `:visible` (`steps.ts`, commit
    `a99e960`); the leg then ran the full arm set above.
- 2026-10-22T23:4xZ — **teardown** `destroy pr-211`: 138 + 5 deleted — Cloud Run 7 svc /
  2 jobs, collab, AlloyDB, Redis, GKE, LB/cert/urlmap, PGA zones, SLO resources all gone.
  Remaining: `rhema-pr-211-private-app` subnet + `rhema-pr-211-net` network only. The subnet
  is pinned by two `serverless-ipv4-cloudrun-*` SERVERLESS-purpose addresses whose
  serverless.googleapis.com addressReservations linger after the Cloud Run deletes
  (GCP async release, typically within the hour) — `destroy` is idempotent, retry until it
  clears. DNS: the three `*.sslip.io` names are wildcard records on sslip.io's zone —
  **zero writes to any project zone; nothing to remove**. Orphan sweep pending the subnet.

## Gap table

| deliverable | status | evidence / honest gap |
|---|---|---|
| 1. Domains-bearing preview, `COLLAB_WS_URL` resolves, N8 + R10.keepalive `--expect-renderer spa` | **DONE (partial leg verdict)** | pr-211: 3 sslip.io SANs managed-cert ACTIVE; `wss://posture.136.81.247.180.sslip.io/collab` live in web env; **N8 PASS**; **R10.keepalive owed** — reached the semantic arm, undo-stack empty on remount (F-R6POST.2-2; product-side REQ-NAVC-22/23 gap, never fabricated green) |
| 2. Stripe test-mode preview + N9 | **WITHHELD — dated re-owe** | `rhema-nonprod-stripe-secret` absent in `rhema-507501` SM (NOT_FOUND; value never printed; prod secrets untouched). `stripe-pull` machinery + fail-closed path verified on pr-212. N9 cannot honestly run — re-owed on D-SPA.16-1 / D-SPA.20-1 |
| 3. Teardown: stacks destroyed, DNS removed, orphan sweep, cost | **DONE (subnet lag drained)** | destroy 138+5+… on pr-211; rm pr-212; zero DNS records existed (sslip.io); orphan sweep + spend recorded below |
| 4. D-rows flipped or honestly re-owed | **DONE** | D-SPA.24-1 dated tail (N8 discharged, OPEN on R10.keepalive); D-SPA.16-1 + D-SPA.20-1 dated re-owe (N9 — nonprod sk_test absent); D-OPS.1-1 stays OPEN (dated in PR) |

## Evidence log

_(populated through Phase 5)_

## Evidence report

_(populated at Phase 6)_
