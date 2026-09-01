# HUMAN H0 — Phase 0a: accounts and registrations

> **Operator work — NOT an `implement-spec` input.** Do before/alongside ticket 01. Long-lead
> items (SES production access, Stripe Tax, Marketplace account-rep thread) should start today.

Per spec §17 Phase 0a (ledger L13, C8):

- [ ] Stripe account + Stripe Tax registrations by geography
- [ ] AWS Marketplace subscription to Claude Platform + account-rep conversation (rate limits; feeds H1)
- [ ] Google OAuth consent screen (`drive.file` review can start now for 1.x)
- [ ] `rhema.app` + `rhemausercontent.com` domains
- [ ] SES production access
- [ ] Apple + Google developer accounts; Expo/EAS org (needed for the 1.x mobile app — no urgency)

**Exit:** every account exists under the operator's ownership; secrets in Secrets Manager.
**What actually blocks what:** ticket 01 needs AWS + a GitHub remote (+ Google OAuth for one AC);
tickets 03/06/16 need Anthropic API access (a dev key suffices early); ticket 07 needs H1; tickets
24/25 need Stripe/SES; real deploys need the domains.
