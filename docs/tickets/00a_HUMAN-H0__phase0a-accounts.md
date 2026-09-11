# HUMAN H0 — Phase 0a: accounts and registrations

> **Operator work — NOT an `implement-spec` input.** Do before/alongside ticket 01. Long-lead
> items (Resend production sending, Stripe Tax, domain registration) should start today.
> **[Amended 2026-09-02: cloud is GCP, not AWS; inference is the direct Anthropic API — see
> 00_MANIFEST.md § Spec amendments applied.]**

Per spec §17 Phase 0a (ledger L13, C8):

- [x] **GCP project + billing account** (enable AlloyDB, GCS, GKE, Cloud Run, Memorystore, Secret
      Manager, Cloud CDN; region `us-central1`) — the ground everything live sits on
      *(done — project `rhema-507501`, us-central1; the `dev` stack deployed live from P0.15b onward, evidence `docs/build/runs/P0.15b.md`, `P0.15c.md`)*
- [x] **Anthropic API account + API key** (platform-billed) — no cloud marketplace needed; feeds
      tickets 03/06/16 and the egress proxy
      *(done — a workspace-scoped key in Secret Manager; live paid inference ran from P0.15g, evidence `docs/build/runs/P0.15g.md`; `provided: yes` — no value in any ledger)*
- [ ] Stripe account + Stripe Tax registrations by geography
- [ ] Google OAuth consent screen (native on GCP; `drive.file` review can start now for 1.x)
- [ ] `rhema.app` + `rhemausercontent.com` domains
- [ ] Resend account + a verified sending domain (replaces SES)
- [ ] Apple + Google developer accounts; Expo/EAS org (needed for the 1.x mobile app — no urgency)

**Exit:** every account exists under the operator's ownership; secrets in **Secret Manager**.
**What actually blocks what:** ticket 01 needs a GCP project + a GitHub remote (+ Google OAuth for
one AC); tickets 03/06/16 need an Anthropic API key (a dev key suffices early); **ticket 07 needs
only that Anthropic key — H1 collapsed, there is no auth spike**; tickets 24/25 need Stripe/Resend;
real deploys need the domains.
