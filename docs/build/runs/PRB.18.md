# PRB.18 — prod auth/billing finish legs (run ledger)

- **Ticket:** `docs/tickets/28i_PRB.18__prod-auth-billing-finish-legs.md` (seq 28i — inserted after 28h)
- **Branch:** `stevevitali/prb-18-prod-auth-billing-finish-legs` (pre-created off chainTip
  `stevevitali/prb-17-billing-live-ops-legs`; carries the ticket, manifest/ledger insert, and the
  `Pulumi.prod.yaml` OAuth client-id config)
- **Stack:** prod on `rhema-507501`; DB access via the existing IAP tunnel `127.0.0.1:15433`
  (`rhema-prod-proxy-1w36` ssh forward); scratch drivers in `integration/.scratch/` (untracked).
- **Secrets discipline:** never printed; `versions/latest` re-read at boot/roll. No card data anywhere.

## Requirements / acceptance criteria (from the ticket)

1. Deploy the OAuth config — `pulumi up prod`; api revision carries the real `googleOauthClientId`;
   worker + egress-proxy roll so `versions/latest` picks up seeded v2 secrets.
2. Headless OAuth smoke — `POST /api/auth/sign-in/social provider=google` → redirect to
   `accounts.google.com` with the real `client_id`, no `invalid_client`.
3. [OPERATOR] Google sign-in click-through at `https://rhema.tools` — assert callback/session rows.
4. Resend domain status → magic-link leg if verified, else surface DKIM/SPF records (stays OPEN).
5. [OPERATOR GATE — real money] Stripe-originated purchase: mint endpoint + Payment Link via the
   Stripe API with the seeded `sk_live_` key, seed `whsec_`, `stripePaymentLinkUrl` config, roll;
   assert `checkout.session.completed` → `stripe_events` → `grant(topup,+12mo,stripe_ref)`.
6. Browser surface legs (run-card SSE, CodeMirror editor) — operator-assisted; rows asserted.
7. Stragglers: `usage.reconcile` deferred (admin key still placeholder — annotate D-PRB.08-1b);
   ops-alert catcher stands.

## Stage A — empty by design

Every leg driver is a `curl`/scratch script under the gitignored `integration/.scratch/`
(`prb18-stripe.mts` endpoint/link mint, `prb18-whsec-check.mts` signature probe, `api.mts`/`q.mts`
from PRB.16b). No committed code changes → no tests added (ticket permits: "If nothing is needed,
Stage A is empty — say so"). The one committed diff is `Pulumi.prod.yaml` (the real Payment Link URL).

## Live legs log (2026-09-18, UTC)

### Leg 2 — deploy + rolls (DONE)

- `pulumi up` (update 53) rolled all six Cloud Run services; api now serves revision
  **`rhema-prod-api-e745ce0-00022-cwx`** (created ~21:1x). Verified env on the live revision:
  `GOOGLE_OAUTH_CLIENT_ID` = the real `25012989319-…apps.googleusercontent.com` client (the
  `pending-h6-…` placeholder that caused the user's `401 invalid_client` is gone) and
  `STRIPE_PAYMENT_LINK_URL` = the live `buy.stripe.com` link minted below.
- Worker rolled to **`rhema-prod-worker-cbdaf0f-00021-pgk`** (created 21:13:02) — proof it picked up
  `versions/latest` for `rhema-prod-resend-api-key` v2: the `auth.mail` job below reached
  `ResendMailSender.send` and was rejected by Resend's API (a placeholder key never constructs the
  mailer — it logs "auth.mail dropped" and completes).
- Egress-proxy MIG: instance `rhema-prod-proxy-1w36` (up 39 h, predates the v2 seed 20:59:38).
  `ReloadableAnthropicSecretProvider` refreshes on **SIGHUP** (REQ-ARCH-30 design path) — sent
  `docker kill -s HUP egress-proxy`; process survived (handler caught it) and no
  "key refresh failed" log → `versions/latest` (= v2, operator's key) is now live. Instance kept —
  the DB IAP tunnel rides it.
- Pulumi warnings observed (non-fatal): regions-list JSON hiccup + `alloydbCluster` output undefined;
  update still converged cleanly.

### Leg 3 — headless OAuth smoke (DONE; exact console fix surfaced)

- `POST https://api.rhema.tools/api/auth/sign-in/social {provider:"google"}` → **200** with body
  `{url, redirect}` — Better Auth hands the client the authorize URL: host `accounts.google.com`,
  carrying the **real `client_id`** (byte-identical to `Pulumi.prod.yaml`'s `googleOauthClientId`),
  `redirect_uri=https://rhema.tools/api/auth/callback/google`, `response_type=code`,
  `scope=email profile openid`. Same answer on the app origin (`rhema.tools/api/auth/…`, the
  browser path through the web proxy).
- Following the authorize URL: Google answers **`redirect_uri_mismatch`** — the decoded authError
  names the unregistered URI verbatim: `https://rhema.tools/api/auth/callback/google` (the APP
  origin — Better Auth's `baseURL` is `rhema.tools` and the web proxies `/api/auth/*`; the ticket's
  guess of `api.rhema.tools` was close but the exact owed URI is the apex).
- Token-exchange diagnostic (fake code + generated state cookie): callback →
  `302 → /api/auth/error?error=invalid_code` — i.e. Google reached the grant check and rejected the
  fake code (`invalid_grant` class), **not** `invalid_client`. The client id **and** the seeded
  client secret are accepted by Google — the only missing piece is the redirect-URI registration.
- **Operator fix (Google Cloud Console → APIs & Services → Credentials → the
  `25012989319-…` web client → Authorized redirect URIs):** add
  `https://rhema.tools/api/auth/callback/google`. Then the sign-in click-through is runnable.

### Leg 5 — Resend domain status (DONE — records surfaced; delivery leg OPEN)

- `GET /v1/domains` (seeded `re_…` key): `rhema.tools` exists, id `b283fd45-93cf-42da-af40-f7016f194809`,
  status **`not_started`** (auto-registered 21:14:46 by the first send attempt), region us-east-1.
- Transport proven end-to-end: `POST /api/auth/sign-in/magic-link` (probe address) → verification
  row `XjMandZlbjITJBXGbb2HooLwVyMtILlq` (21:15:09) + pg-boss `auth.mail` job
  `9a3525ea-14c4-41f9-a7fb-f85063e9f5cd` → worker `ResendMailSender.send` → **Resend API rejected:
  "The rhema.tools domain is not verified"** (failed 21:15:14). The real key loads, the queue path
  works, the provider call reaches Resend — only DNS verification is missing.
- **Exact records the operator must publish** (from `GET /domains/b283fd45…`):
  | name | type | value |
  |---|---|---|
  | `resend._domainkey` | TXT | `p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQC1zPmTRG6GxFXZlZ9vWeVjrht0bZ/Gwds2Zvf0se0ctc8je3lGzUBQA/2g5PGGL5d+G0i6r84oyxJp/ZHH3zNMf69dE2k3hCTpOXA/uEYQMfr/MUI4kjtpRqOMHx58DNskZS+yYW327TVFV8aIXfok6jMJ7IWiWQ4Yj/s8hZfRDwIDAQAB` |
  | `send` | MX | `feedback-smtp.us-east-1.amazonses.com` (priority 10) |
  | `send` | TXT | `v=spf1 include:amazonses.com ~all` |
  | `rsend` | CNAME | `send.forge.rmta.net` (click-tracking) |
  Then verify in the Resend dashboard (or `POST /domains/<id>/verify`) → status `verified` → the
  magic-link click-through is runnable. (Public DNS data, not secrets.)

### Leg 6 — Stripe live setup (DONE; purchase pending the operator's card)

- Live account verified: `charges_enabled`, US, USD, details submitted.
- Webhook endpoint minted via the seeded `sk_live_` key: **`we_1UH99C2MLe3ETP9Sk4UQBKXs`** →
  `https://api.rhema.tools/stripe/webhook`, enabled, livemode, events
  `[checkout.session.completed, charge.dispute.created, charge.dispute.closed]` (Stripe's own view
  re-fetched and matches).
- Signing secret seeded as `rhema-prod-stripe-webhook-secret` **v2** (enabled 21:16:48; value never
  printed — piped `/tmp/prb18-whsec.txt` → `gcloud secrets versions add`).
- Live Payment Link minted: product `Rhema credits top-up`, price **$25.00 USD**, link
  **`plink_1UH99P2MLe3ETP9SR1zL2jAW`** (`buy.stripe.com/14AaEQbU030E61k5D7a7C00`), active, livemode.
  `rhema:stripePaymentLinkUrl` set in `Pulumi.prod.yaml` + rolled; `GET /billing/balance` (authed)
  returns `paymentLinkUrl` → the exhaustion panel's `open_payment_link` 302 now targets the real
  link.
- Deployed-webhook wire verify with the REAL whsec: constructed `account.updated` (ignored type)
  signed by the minted secret → `POST /stripe/webhook` → **200 `{received:true}`** →
  `stripe_events.id=evt_prb18_sigcheck_1` received 21:18:16.660 / processed 21:18:18.397 →
  `stripe.event` job `7b10fbdc-fdfa-485b-aebe-2ec98c913213` completed 21:18:18.398. The deployed
  verifier is running whsec v2 (a stale v1 would have 400'd the signature).
- **Stripe-originated purchase still owed (operator's card):** open the Payment Link with the
  billing-account reference appended —
  `https://buy.stripe.com/14AaEQbU030E61k5D7a7C00?client_reference_id=01M2V3PM1133TPH4M8H0T8CSEE`
  — and complete checkout. Stripe forwards `client_reference_id` onto the Checkout Session, which is
  what `processTopUp` resolves the billing account through. Expected rows:
  `stripe_events` (`checkout.session.completed`, `evt_…` minted by Stripe), `credit_ledger`
  `grant/topup/stripe/+12mo`, `credit_balances` +$25-equivalent credits, `topup.purchased` +
  `wtp.recorded{source:"purchase"}` telemetry. Assert-scriptable on return pass.
- **F32 (finding — defect, routes to PRB.19):** the web `open_payment_link` route 302s to the bare
  configured URL — it never appends `client_reference_id` (`apps/web/src/server.ts:604`), and the
  minted link carries no `metadata.billing_account_id`. A real user purchase through the product
  surface today would land `unresolved: "checkout session carries no client_reference_id"` —
  **money taken, no grant, `processed_at` stays NULL silently.** The URL-param append (or a
  per-account link from `/billing/balance`) is the fix; small + server-side.

### Operator account state observed (pre-existing, not fabricated)

The operator signed up at 20:35:35Z today — `user` `01M2V3PM0WYEPXH26NA2J9BRWB`
(`email_verified=false`), personal workspace `01M2V3PM11XSF05VJ9G01PM5ZB`, billing account
`01M2V3PM1133TPH4M8H0T8CSEE`, `signup.completed {method:"magic_link"}` analytics row. No `account`
(OAuth link) row, no session for that user, no credit rows yet — the post-click-through assertions
have a clean baseline.

### Leg 4 + 7 — exact operator browser steps (prepared; execution pending)

In order — the legs are interdependent (runs need a verified email + credits):

1. **Google Console fix** (prereq): add `https://rhema.tools/api/auth/callback/google` to the OAuth
   client's Authorized redirect URIs (leg 3).
2. **Google sign-in:** `https://rhema.tools` → sign in with Google. Expected: lands on `/app`;
   worker asserts `session` + `account` (`provider_id='google'`) rows for user `01M2V3PM0W…`,
   `email_verified=true`, `signup.completed{method:"google"}` or sign-in telemetry.
3. **Resend DNS** (prereq): publish the 4 records (leg 5) → verify the domain.
4. **Magic link:** sign out, request a sign-in link at `https://rhema.tools` → click the emailed
   link. Expected: `session` row + `auth.mail` job `completed` (delivery, not just enqueue).
5. **Stripe checkout:** open the link URL with `?client_reference_id=01M2V3PM1133TPH4M8H0T8CSEE`,
   pay (real money — $25). Worker asserts the grant chain (leg 6).
6. **Run card / SSE:** with credits + verified email, create a project → paste a short draft →
   launch a `quick`/`base` review → keep the run card open while it runs — the ✓/◐/○ rail should
   advance live (EventSource). Assert: `runs` row progressing + `run_events` rows landing.
7. **CodeMirror editor:** after the review delivers, open `/p/<project>/edit/<draftId>` → type →
   sync pill syncing→synced → `artifact_versions`/`live_docs` rows + URL moves to the forked head on
   a frozen base.

### Leg 8 — stragglers (DONE)

- `rhema-prod-anthropic-admin-key` latest is still a 47-char placeholder (fingerprint-checked, not
  printed) → **`usage.reconcile` stays deferred** (D-PRB.08-1b annotated; the worker's placeholder
  guard from PRB.17 keeps the nightly job alive — it logs the placeholder and still runs the balance
  assertion).
- Ops-alert: no real destination supplied → the deployed `rhema-prod-ops-alert-catcher` stands as
  the sink (PRB.17 leg already proven against it).

## Close-out gap analysis (spec → status)

| Leg | Status | Evidence |
|---|---|---|
| Deploy OAuth config + rolls | **DONE** | api `…-00022-cwx` env; worker `…-00021-pgk`; proxy SIGHUP refresh |
| Headless OAuth smoke | **DONE — exact fix surfaced** | 200 + accounts.google.com URL, real client_id, `redirect_uri_mismatch` naming `https://rhema.tools/api/auth/callback/google`; fake-code → `invalid_code` ≠ `invalid_client` |
| [OP] Google sign-in click-through | **OPERATOR-PENDING** — gated on the console redirect-URI add | return pass asserts `session`/`account`/`email_verified` rows |
| Resend domain → magic link | **OPEN — DNS records surfaced** (per ticket's fallback clause) | domain `b283fd45…` `not_started`; 4 records above; `auth.mail` `9a3525ea…` failed w/ real Resend rejection |
| [OP] Stripe-originated purchase | **OPERATOR-PENDING** — link live, reference-param step prepared | `we_1UH99C2…`, whsec v2, `plink_1UH99P2…` live+active, sigcheck `evt_prb18_sigcheck_1` 200→processed |
| Browser surfaces (SSE run-card, editor) | **OPERATOR-PENDING** — steps prepared (leg 4+7) | needs verified email + credits first |
| `usage.reconcile` | **DEFERRED** — admin key still placeholder | fingerprint-checked |
| Stripe mode | **LIVE** (sk_live_, livemode resources, real-money leg) | stated honestly per acceptance |

## Spend ledger

Zero inference spend this session (no run-task executions). Non-inference ops: one `pulumi up`
(update 53), Secret Manager version adds (whsec v2), Stripe API reads/mints (free), Resend API reads
(free — the rejected send doesn't bill). The $25 Stripe top-up, when the operator performs it, is
the operator's own card by design — recorded here as **pending**, not spent.
