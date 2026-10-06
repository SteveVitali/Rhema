# External pen test — vendor package index (STB.4 Leg B / D-P1.22-3)

This document is the **single index a procured vendor needs to start**. Everything referenced exists
in this repo; nothing here invents names, dates, or prices — procurement-owned fields are marked
`<TBD: procurement>`.

## Package contents (what the vendor receives)

| # | Artifact | Location | Purpose |
|---|----------|----------|---------|
| 1 | Scope document | `docs/security/pen-test-scope.md` | The authoritative engagement contract: surface map, controls list, residual-risk statement, triage protocol |
| 2 | Architecture summary | §1 below | System shape + trust boundaries so the scope surfaces make sense without a design deep-dive |
| 3 | Environment + test accounts | §2 below | Which deployment, the three provisioned accounts, access mechanics, credit budget |
| 4 | Rules of engagement | §3 below | Explicit allow/deny checklist + comms + safe-harbor |
| 5 | Findings format + triage | `docs/security/pen-test-findings-triage.md` | The report format findings file into, and how each maps to tickets/DEFERRALS rows |
| 6 | Repo access (white-box on request) | §2.4 below | Read-only access to the scope surfaces only |
| 7 | Design spec (optional depth) | `docs/rhema-design-spec.md` §§12, 14 | The claims the controls implement, verbatim — for vendors that want the normative text |

Vendor name, engagement dates, pricing, and procurement contacts are the operator's — this package is
deliberately name-free so it can attach to any statement of work.

## 1. Architecture summary (for the vendor)

Rhema is a GCP-hosted monorepo product: an AI-assisted editorial-review platform. All customer
inference rides a **metering egress proxy** — the sandboxed run environment has no direct internet
route — and all provider calls are priced into per-request `usage_records` rows (the meter of record)
that drive a credit ledger (hold → debit → refund per run phase).

**Deployed topology (prod, `rhema-507501`, us-central1):**

- **`rhema.tools`** — `web` (Cloud Run): the SSR app. Session auth via `__Host-`-prefix cookies,
  Better Auth mounted under `/api/auth/*` (Google + magic-link). CSP nonces on every page.
- **`api.rhema.tools`** — `api` (Cloud Run): the REST/internal API. Session middleware + Origin guard
  on browser routes; run routes (launch/gates/caps); billing, trial, entitlement, import presigns;
  the **internal run API** the sandbox calls back into (RS256 run-token auth + `attempt` fencing).
- **`usercontent.rhema.tools` + `*.`** — user-content CDN surface (GCS-backed, Cloud CDN + signed
  URLs): quarantine + converted upload objects. Carries no cookies by design.
- **`worker`** (Cloud Run, no HTTP routes): pg-boss consumers — run lifecycle, billing jobs
  (`usage.reconcile`, `stripe.event`, period tick, auto-reload, estimator refit), notifications,
  ingestion, exports, pause-signal drain, SLO probes.
- **`fetcher` / `convert` / `export`** (Cloud Run service / Cloud Run Jobs): the §12.8 fetch tier
  (all sandbox web access proxies through `fetcher`, invoker-gated by OIDC ID token) and the
  no-network conversion/export workers.
- **`collab`** (Cloud Run, `wss://rhema.tools/collab`): the Hocuspocus collab wire — separate auth
  surface on the same session cookie.
- **`egress-proxy`** (single-instance MIG): the only internet egress from the sandbox subnet.
  Enforces per-run domain caps, >256-char query refusal, the ≥12-word draft n-gram exfiltration
  match, and writes `egress.denied` pause signals. **This is also the meter**: every provider
  response's `usage` block + `request-id` header lands a `usage_records{source:'proxy'}` row.
- **Run-task sandbox** (GKE Standard cluster, `runs` namespace): each run is a Kubernetes Job —
  two-uid split (`harness` holds the run token + proxy credential; `agent` runs scrubbed),
  read-only rootfs, tmpfs mounts, the sandbox subnet has no Cloud NAT / no default route (egress
  only to the proxy).
- **Data plane**: Cloud SQL Postgres (RLS enforced on tenant tables — note the app connects under a
  role where RLS is the backstop, routes also predicate tenancy in SQL), Memorystore Redis
  (pg-boss + event bus + heartbeats), GCS object store (content-addressed) + usercontent bucket.
- **Secret posture**: provider keys live only in the egress proxy; Stripe/Better-Auth/Anthropic
  admin keys in Secret Manager; no provider key reachable from web/collab/the model's process.

**Trust boundaries the engagement tests:** browser↔web/api (session, Origin, CSP), sandbox↔internal
API (run token, attempt fencing), sandbox→internet (the proxy's §12.8 channel), tenant↔tenant
(predicate + RLS), quarantine→converted (object lifecycle), provider-key boundary.

## 2. Environment + test accounts

- **Environment:** production domains (`api.rhema.tools`, `rhema.tools`,
  `usercontent.rhema.tools`). Live runs consume real paid inference — the operator provisions a
  capped credit budget per test tenant (§3). The staging clone is the named alternative if
  procurement prefers isolation.
- **Accounts to provision (operator does this before kickoff):**
  - `PT-PAID-A`, `PT-PAID-B` — two paid-tenant accounts (Writer tier), each seeded with a promo
    credit grant via `admin-cli house-grant` (audited `promo` bucket, expiring).
  - `PT-TRIAL` — one free-trial account (zero credits, daily-chat allowance), to exercise
    trial/entitlement boundaries.
  - Provisioning mechanics: the operator signs each up through the normal flow, promotes the two
    paid accounts' billing via the audited admin path, and records the account ids + a per-tenant
    credit cap in the engagement record (NOT in this doc — no secrets or account ids in the repo).
- **Credentials the vendor receives:** the three accounts' sign-in credentials (magic-link inbox
  or test passwords, per the operator's choice), the surface list (§1 of the scope doc), and the
  paid-inference budget per tenant. **Never**: DB access, Secret Manager, GCP console, other
  tenants' data, or real payment instruments (billing legs use operator-provided Stripe test
  objects only).
- **Repo access (white-box on request):** read access to the scope surfaces only — the
  `apps/{api,web,worker,egress-proxy,fetcher,convert,export,collab,run-task}` trees +
  `packages/{ledger,orchestrator,db,mirror,obligations,security-checks}` — under the operator's
  repo-sharing arrangement (`<TBD: procurement>` NDA/access form). The ported editorial protocol
  IP (`packages/protocols` skill text) is out of scope for copying and is not needed for the
  surface tests.

## 3. Rules of engagement (expanded checklist)

**Scope discipline**

- [ ] Test ONLY the provisioned accounts (`PT-PAID-A/B`, `PT-TRIAL`) and the surfaces in the scope
      doc's surface map. Cross-tenant probing is the *goal* (finding cross-tenant reads/writes is a
      critical) — but exfiltrating/reading any real tenant's data is out of bounds and ends the
      finding at "proven reachable".
- [ ] No DoS/volumetrics. Paid-inference spend is capped per tenant by the credit ledger itself —
      deliberate `egress.denied` spikes (query smuggling, n-gram evasion, domain-cap evasion) are
      IN scope and expected; brute-force request floods are not.
- [ ] No social engineering, no physical access, no third-party/vendor targets (Stripe, Anthropic,
      Resend, Google) — the product surface only.
- [ ] Automated scanning is welcome against the in-scope surfaces at reasonable rates; the egress
      proxy and rate limits may pause runs — that is the control working, not a test failure.

**Data handling**

- [ ] Any tenant data observed beyond the provisioned accounts is reported immediately and not
      retained. Findings carry object ids/ULIDs, never secrets — a finding that proves secret
      disclosure cites the *path* to the secret, not its value.
- [ ] Test artifacts the vendor plants (fixtures, canary secrets for the planted-secret tests) are
      labeled in the finding so the operator can sweep them.

**Communications**

- [ ] Criticals (auth bypass, cross-tenant read/write, secret disclosure, cap circumvention) are
      reported within 24h of discovery through the secure channel (`<TBD: procurement>`), not held
      for the report.
- [ ] Findings use the template in `pen-test-findings-triage.md` — one record per finding, severity
      per its rubric, reproduction steps + evidence refs.
- [ ] Safe harbor: good-faith testing inside this ROE is authorized; the operator will not pursue
      action over in-scope research activity.

## 4. What the engagement returns

1. The findings report in the triage-template format (§5 file).
2. A residual-risk number for the §14.7 channel the scope doc asks to be sized (draft-fragment
   exfiltration capacity through sub-threshold search queries, per query / per run).
3. A list of tested-but-held controls (the controls list's "suite asserts / pen test tried" column).

Operator fields left blank on purpose: vendor, dates, price, secure-channel coordinates, and the
provisioned account ids are recorded in the engagement record, not in git.
