# ADR-120: Ruled posture stages run on wildcard-DNS hosts + per-stack posture config; DNS writes stay at zero

- **Status:** Accepted
- **Date:** 2026-10-22
- **Ticket:** R6POST.2 (REQ-POST-6; GD-PREAUTH-ACTS.R6 batch-3 "authorize both")
- **Requirement ids:** REQ-POST-6, REQ-ARCH-38, REQ-ARCH-30
- **Spec:** `docs/tickets/190_R6POST.2__posture-stages.md`;
  `docs/round-6-draft-spec.md` §4.6; `infra/config/stages.ts` (`withPostureOverrides`);
  `infra/pulumi/index.ts` (the `rhema:posture*` / `rhema:stripeSecret` config surface)

## Context

REQ-POST-6 needs a **domains-bearing** `pr-<n>` stage: `COLLAB_WS_URL` — the same-origin
`wss://<app>/collab` the `__Host-` session cookie rides — only exists when a stage carries a
`domains` block, and a `*.run.app` host can never provide it (D-SPA.24-1's recorded blocker). The
ruling authorized "DNS records under a preview subdomain (created → removed inside the ticket)."

Probed live on 2026-10-22 (this run): `rhema.tools` resolves at **Squarespace DNS**
(`nsb*.squarespacedns.com`) — the zone is registrar-held, **no Cloud DNS managed zone exists in
`rhema-507501`** or any reachable project. The only write path into `*.rhema.tools` is the
operator's registrar console — HUMAN-H6's own record says the same ("records are applied at the
registrar"). An agent cannot create an A/NS record under `rhema.tools`, and must not try.

## Decision

1. **Zero DNS writes.** The domains-bearing stage fronts on a **public wildcard-DNS name**
   (`pr-<n>.<lb-ip>.sslip.io`, plus `api.`/`uc.` siblings) — the name resolves to the stack's
   reserved LB IPv4 with no record to create or remove. That is strictly inside the authorized
   envelope: a subset of "records under the preview subdomain, created → removed" is *none
   created, none removed*, and nothing is written outside it. The `dnsRecords` stack output the
   program emits is descriptive only.
2. **The IP is reserved BEFORE `up`.** `rhema:postureLbAddress` names a `gcloud compute
   addresses` global IPv4 created out of band; `compute.ts` adopts it via `GlobalAddress.get`
   (never a managed resource — `destroy` cannot orphan it; teardown deletes it explicitly). The
   wildcard names embed the IP, so the LB binds a known address in one `up` — no forwarding-rule
   replacement pass.
3. **Posture is per-STACK config, never stage facts.** `rhema:postureDomains` (JSON
   `{app,api,userContent}`) and `rhema:extraRequiredSecrets` (CSV of `ALL_SECRET_IDS`) merge over
   `stageConfigFor(stack)` via `withPostureOverrides` — `STAGES.prod`/`STAGES.preview` are
   untouched, prod refuses any override at program-eval time, unknown secret ids throw, and the
   merged `domains` drives the SAME machinery prod's facts drive (cert SANs, URL-map host rules,
   `COLLAB_WS_URL`, `APP_BASE_URL`/`API_PUBLIC_URL`/`INTERNAL_AUTH_AUDIENCE`, bucket CORS).
4. **The sk_test rides the resend-pull shape.** `preview-stack.mjs stripe-pull` pipes the shared
   nonprod `rhema-nonprod-stripe-secret` into `rhema:stripeSecret` SECRET config over stdin —
   never argv/logs/the repo — and the program writes it as the stack's `stripe-secret`
   SecretVersion in place of the OPS.1 placeholder. `extraRequiredSecrets: stripe-secret` is what
   actually mounts `STRIPE_SECRET_KEY_NAME`; every unruled preview keeps the placeholder + the
   `stripe_unconfigured` posture (REQ-ARCH-38). Prod + the config set ⇒ the program throws.

## Consequences

- The posture evidence is real: a managed cert with three live SANs, prod-shape host routing,
  `wss://<app>/collab` on the cookie's own host, and a test-mode Stripe binding on the ruled
  stack — the two legs `*.run.app` could never serve.
- Nothing touches the `rhema.tools` zone: no delegation, no records, no registrar call. The
  ticket's "records created → removed" AC reads literally true at zero.
- An adopted (not managed) LB address means teardown has one out-of-band step —
  `gcloud compute addresses delete` — recorded in the run ledger; `pulumi destroy` leaves the
  resource by design (`GlobalAddress.get` carries no state).
- A `rhema:posture*` key left set on a stack is inert until a ruled stage opts in; on prod it
  fails the program loudly.

## Alternatives considered

- **`preview.rhema.tools` delegated to a new Cloud DNS zone** (the ticket's phrasing): refused by
  reality — the delegation NS record is a registrar write only the operator can make (PAUSE/flag
  territory per the ticket's own DNS clause). Flagged FIRST-LINE in the PR.
- **`COLLAB_WS_URL=wss://<lb-ip>/collab` on a plain preview**: the cookie is host-locked to the
  `*.run.app` host — an IP-literal host can never carry it (the D-SPA.24-1 blocker verbatim).
- **Stage-fact fields (`STAGES.preview.domains`)**: would turn EVERY preview domains-bearing —
  wrong blast radius; posture must be opt-in per stack.
- **Secrets as `pulumi config` without the stdin pipe**: values would land in argv/shell
  history — forbidden (REQ-ARCH-30).

## Revisit trigger

The operator delegates `preview.rhema.tools` (or any `*.rhema.tools` subdomain) into a Cloud DNS
zone the build can write — then the posture stage SHOULD move to real `rhema.tools` names and
this ADR is superseded; or the managed-cert authority gains a DNS-01 path that doesn't need A
records at all.
