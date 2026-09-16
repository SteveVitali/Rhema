# HUMAN H6 — Prod-launch accounts, domains, secrets; the Stripe live-mode decision

> **Operator work — NOT an `implement-spec` input.** Do before/alongside `28d_PRB.13`–`28f_PRB.15`;
> everything below must hold **before `28f_PRB.15` Stage B** (the prod `pulumi up`) — the Stripe
> item specifically gates `28h_PRB.17`'s real-money leg. Inserted 2026-09-16 (prod-launch round;
> see `00_MANIFEST.md` § Plan extensions and **ADR-008**).

The goal of this round: host the platform **live in production** and let users **pay for their own
credits** (open self-serve signup per the REQ-BETA-19 amendment — no house-credit grants; H3's
partner program is deferred, see `docs/build/LEDGER.md` § GATE DECISIONS). These are the accounts /
secrets / decisions only the operator can make:

- [ ] **Prod domain + DNS access** — control of the `rhema.app` and `rhemausercontent.com` DNS zones
      (registrar/Cloud DNS) to point the prod HTTPS LB / CDN: app + api on `rhema.app`, the
      cookieless serving origin on `*.rhemausercontent.com` (PRB.02's quarantine/preview origin).
- [ ] **GCP prod footing decision** — either a **dedicated prod GCP project** or the existing
      project `rhema-507501` with a separate **`prod` Pulumi stack** (`rhema-prod`); billing
      enabled; region `us-central1` (§13.2: prod keeps the AlloyDB primary warm — it is the
      always-on, costlier stage).
- [ ] **Prod Secret Manager entries** — Anthropic API key (the proxy's `anthropic-api-key`, a
      funded workspace-scoped key as proven on dev), the run-token **RS256** signing key, the
      AlloyDB postgres password, the Better Auth secret, the Google OAuth client id/secret, the
      Resend API key, the Stripe **secret key** + **webhook signing secret** (`whsec_…` for the
      prod endpoint), the Anthropic **admin** key for the Usage & Cost report
      (`ANTHROPIC_ADMIN_KEY_SECRET`, feeds `usage.reconcile`), and the `OPS_ALERT_WEBHOOK_URL`
      destination. **No value in any ledger or ticket — names only.**
- [ ] **Stripe live-mode activation decision — the one open unknown.** Confirm whether the Stripe
      account is activated for **live mode** (business details + bank + tax completed, live keys
      issuable). If YES: create the **live-mode Payment Link(s)** the PRB.08 exhaustion surface
      points at (the one real-money channel — REQ-BETA-15) and a live webhook endpoint for the prod
      URL. If NO: the real-money leg of `28h_PRB.17` runs in **test mode** and the live-mode leg is
      recorded as a DEFERRALS row — never fabricated.
- [ ] **Google OAuth consent screen published for the prod domain** — the consent screen's
      authorized domains/callbacks cover the prod web origin (the dev-screen config does not carry
      over); magic-link + Google sign-in are the only auth surfaces (D-P0.01-3).
- [ ] **Resend sending-domain verification** — DKIM/SPF for the prod sending domain so the PRB.09
      notification path (signed Wait-for-me/Open links, reminders) sends from prod.
- [ ] **A stated prod budget** for `28f_PRB.15` Stage B + `28g_PRB.16`/`28h_PRB.17` live legs —
      prod AlloyDB is kept warm (dearer than dev's ~$1/hr), plus per-run `max_usd` inference guards
      and the Stripe/test-mode leg. No [OPERATOR GATE] runs without it.

**Exit:** every prod account/secret exists under the operator's ownership; secrets in **Secret
Manager**; the Stripe live-mode question answered **yes or no** in writing (it decides which leg of
`28h_PRB.17` runs). **What blocks what:** `28d_PRB.13`/`28e_PRB.14` are deterministic and may start
before this completes; `28f_PRB.15` Stage B needs the domains + GCP footing + secrets; the auth +
email live legs (`28g_PRB.16`) need the OAuth consent screen + Resend domain; the real-money leg
(`28h_PRB.17`) needs the Stripe answer.
