# SEC.2 — Signup admission enforced on every path, and a throttle shared across instances

- **Sequence:** 69 (round 3) · **Phase:** round 3 — launch readiness · **Kind:** ticket · **Tag:** security
- **base_branch:** current checkout (the chain tip the previous round-3 row left; stacked PR)
- **Depends on:** RPT.1
- **Scope (one line):** `signup.mode` enforced on every account-creation path (web pre-gate, api `POST /signup`, Better Auth's `onUserCreate` / OAuth) and exercised live; the invite field is not the first field on signup/login under open mode; the signup + magic-link throttles move to a shared Redis store keyed on an unspoofable client IP, with the async signature carried through every call site.
- **Spec §§:** 15.3 (signup: Google or magic link, no questionnaire), §17 beta row banner + Appendix A.13 note (REQ-BETA-19 amended 2026-09-16), 14.3 (abuse controls — identity before spend), 13.3 (secrets; REQ-ARCH-30)
- **REQ coverage:** REQ-BETA-19 (note; primary), REQ-GROWTH-15 (throttle half), REQ-BETA-14 (invite machinery kept for partner cohorts), REQ-ARCH-30 (stamp in the PR)
- **Absorbs (backlog):** BL-23 (D-PRB.13-1, D-PRB.01-1 residual, ADR-009); PR-U1 (form half — the field order)
- **Run:** `implement-spec spec=docs/tickets/69_SEC.2__signup-admission-and-throttle.md`
- **Gate status:** `signup.mode` flips pause for the operator — this ticket never flips prod (stays `open`); minting a real invite on prod to prove consume-at-creation live is a one-off prod data write → operator-paused (else a `D-SEC.2-n` row); no new infra expected (Memorystore already serves api + worker) — any cost delta > $15/mo or any Redis instance replace pauses; magic-link legs send only to JOURNEY.1's test mailbox (HUMAN-H7)
- **Live stage:** Stage A: code + tests ($0). Stage B: deploy (pre-authorized if the preview is clean) + write-free live throttle/admission legs ($0)

## Goal
PRB.13 shipped a beta-grade throttle deliberately in-memory per instance (ADR-009, D-PRB.13-1): an attacker behind N
Cloud Run instances gets N× the window. Reading the code for this round shows the gap is wider than that note:
- **Spoofable IP key.** Both `clientIp` helpers key on the **first** `x-forwarded-for` hop, which a caller controls.
- **Shared bucket.** The web's server-to-server `signup` call forwards no client IP, so the api's per-IP bucket may key
  every web-mediated signup on one hop (a 10/hour global ceiling). Re-confirm this against prod request logs.
- **Unthrottled sends.** Better Auth's magic-link send and OAuth account creation live at `/api/auth/*`, which the web
  proxies. They appear to bypass both the `/login` throttle and the `signup.mode` check: `onUserCreate` provisions
  unconditionally.
- **Invite field first.** Under open mode the "Invitation code (optional)" field is still the first field on signup and
  login (PR-U1).
- **Enforcement never run live.** Invite enforcement at account creation has never run against a real invite on prod
  (D-PRB.01-1 residual).

This ticket closes all of these and turns the form half of journey step N2 green.

## Load (read these — do not re-read others)
- `docs/build/planning/2026-09-30_planning-ledger.md` — row 69, § Journey step registry (N2 — JOURNEY.1 owns the
  magic-link leg; the form is SEC.2's), the standing authorization (the `signup.mode` pause).
- `docs/build/reports/2026-09-30_prod-design-review.md` — PR-U1 (form half), PR-U9 (context only — the email is UX.1's).
- `docs/adr/ADR-009-signup-admission-boundary.md` (the per-instance clause this ticket supersedes), ADR-008, ADR-017.
- DEFERRALS rows `D-PRB.13-1`, `D-PRB.01-1`, `D-PRB.13-2` (the Better Auth `user.create` binding note).
- Code (anchors — re-confirm at build time):
  - `packages/contracts/src/rate-limit.ts` ~17–60: `IpEmailThrottle.attempt` is **synchronous** over an in-process `Map`.
  - `apps/api/src/signup.ts` ~248 `SIGNUP_THROTTLE_DEFAULTS` (10/IP, 5/email, 1 h), ~251 `clientIp` (first XFF hop), ~292
    `attempt` before admission; `apps/api/src/index.ts` ~409 wiring; `apps/api/src/server.ts` ~57 the existing ioredis client.
  - `apps/web/src/server.ts` ~128 `MAGIC_LINK_THROTTLE_DEFAULTS` (20/IP, 4/email, 1 h), ~131 `clientIp` (first XFF
    hop), ~205 `magicLinkThrottle`, ~1282 `POST /signup` (attempt ~1305), ~1365 `POST /login` (attempt ~1394);
    `apps/web/src/data.ts` ~1075 `signup` (no forwarded IP — compare `recordLandingEvent` ~1313).
  - `apps/api/src/auth.ts` ~110–122 `databaseHooks.user.create.after` → `apps/api/src/server.ts` ~142 `onUserCreate` →
    `provisionPersonalAccount` with **no `signup.mode`/invite check**; `apps/api/src/auth.ts` ~132 the `magicLink` plugin's
    send; `apps/api/src/index.ts` ~284 `/api/auth/*` mount.
  - Forms: `apps/web/src/marketing.tsx` ~434–438 (signup), `apps/web/src/pages.tsx` ~343–346 (login); copy
    `apps/web/src/copy.ts` ~29–30, ~2097–2098.
  - Mode config: `apps/api/src/env.ts` ~181, `apps/web/src/main.ts` ~63, `infra/config/stages.ts` ~244/255 (dev/previews
    `invite`, prod `open`); web env block `infra/pulumi/compute.ts` ~554–567 (no Redis URL; AGENTS.md: no secret as a
    plaintext env var to `web`).

## In scope — deliverables
1. **One admission rule on every creation path** (REQ-BETA-19 note): `admitSignup`'s `signup.mode` semantics also
   govern Better Auth's `onUserCreate` / Google OAuth and the magic-link path for a never-provisioned email. Invite mode:
   no valid code ⇒ no account, no provisioning, no email. Open mode: a supplied code is still validated and consumed, and
   a bad code fails loudly. The web pre-gate stays, and the api is the authority.
2. **Shared throttle store:** an async `IpEmailThrottle` (or a sibling interface) over Memorystore Redis. Fixed-window
   counters use atomic `INCR` + `PEXPIRE` per `(ip|email, window)` key. The same limits and `Retry-After` apply. The
   async change is carried through every call site and its tests: api `POST /signup`, the magic-link send, and the web
   `/signup` + `/login`. Keep an in-memory implementation for tests and the documented degraded path. **Owned decision →
   ADR:** on Redis error, fall back to per-instance limits (never unlimited, never fail-closed on signup).
3. **Throttle where the send happens:** the Better Auth magic-link send and OAuth creation are throttled at the api. A
   direct `/api/auth/*` call cannot bypass the limit that `/login` enforces. **Owned decision → ADR:** keep or retire the
   web-side limiter. Any Redis binding for `web` must go through Secret Manager, never a plaintext env var (REQ-ARCH-30).
4. **Unspoofable client IP:**
   - Derive the IP from the LB-appended hop, not the client-supplied first hop (Google HTTPS LB semantics — re-confirm).
   - The web's server-to-server signup call carries the real client IP through a channel a direct caller cannot forge.
     **Owned decision → ADR.**
   - A fixture proves that a forged `X-Forwarded-For` does not reset a bucket.
5. **Form order** (PR-U1 form half; N2): under open mode, email comes first and the invitation code sits behind an
   optional "Have an invitation code?" disclosure after it. Invite mode keeps the code required and visible. Both forms
   stay accessible (label, focus order). The "private beta" wording is UX.1's.
6. **Supersede ADR-009's per-instance clause** with a new ADR (append-only). Annotate `D-PRB.13-1` and `D-PRB.01-1` with
   evidence and flip them DONE when their live legs pass.

## Out of scope
- "Private beta" / "Have an invitation? Sign in" copy and the branded magic-link email: **UX.1** (PR-U1 copy half,
  PR-U9).
- The real magic-link sign-in journey leg (N2's session half) and the test mailbox: **JOURNEY.1** / HUMAN-H7.
- Trial abuse controls (fingerprint, disposable domain, ASN, daily kill switch): **ACT.1**. DB roles: **SEC.1**.
- Flipping `signup.mode` on any stage: the operator.

## Acceptance criteria
- [ ] Integration test, invite mode, run on each path (web pre-gate, api `/signup`, Better Auth `onUserCreate` / OAuth
      callback, magic-link for a new email). A missing or invalid code creates no `user`/`workspaces`/`billing_accounts`
      row, and no magic-link email is enqueued. With a valid code, `used_count` increments and an `invite_redemptions`
      row is written. *(deterministic)*
- [ ] Open mode: no code ⇒ admitted; a bogus code ⇒ 400/403 with a named reason, and no account. *(deterministic)*
- [ ] Two throttle instances over one Redis (a real Redis when `REDIS_URL` is set in CI, else a shared-store fake behind
      the same interface) trip at `perIp + 1` combined attempts, not per instance. Removing the shared store fails the
      test. *(deterministic)*
- [ ] A forged first-hop `X-Forwarded-For` does not change the bucket key. Web-mediated signups from two distinct
      client IPs land in two buckets. *(deterministic)*
- [ ] A direct `POST /api/auth/sign-in/magic-link` beyond the per-email limit is refused 429 with no email enqueued.
      *(deterministic + live against the test mailbox)*
- [ ] On a Redis outage the limiter degrades to per-instance limits, and the path is logged once per instance with no
      email or IP in the log line. *(deterministic)*
- [ ] Live on prod (open mode), write-free: `perIp + 1` api `/signup` calls with an empty email from one client get 400s
      then a 429, across ≥ 2 serving instances (instance ids recorded in the run ledger). A bogus invite code fails
      loudly, with no account created. *(agentic — live, $0)*
- [ ] **Journey step N2 (form half) green** on the deployed stage via the JOURNEY.1 harness: under open mode, the first
      focusable field on `/signup` and `/login` is email, and the invitation code is behind the disclosure. Flip the
      step's form sub-assertion from expected-red and commit screenshots. *(agentic — live, $0)*
- [ ] verification green; every new behaviour has a test that fails if it is removed; requirement ids stamped in the PR; anything not automatically verifiable is a `DEFERRALS.md` row with its compensating control; ADRs written for every deviation and owned decision; `BUILD_INDEX.md` row and `LEDGER.md` advanced. *(agentic — the universal phase-gate AC)*

## Requirement IDs to satisfy and stamp in the PR
REQ-BETA-19 (note), REQ-GROWTH-15 (throttle half), REQ-BETA-14 (invite machinery retained), REQ-ARCH-30.

## Cross-cutting invariants
- **#1** No banned vocabulary in form copy.
- **#10** Throttle keys and logs carry hashed or truncated identifiers, never raw emails, in telemetry.
- **#12** REQ-SPEC-29: N2's form half is proven by walking it, and the deployed provenance is recorded as the chain-tip
  SHA.
- **#13** REQ-SPEC-30: admission writes run on the user-serving pool under the new account's scope, and none uses the
  system pool from a user route.
- **REQ-ARCH-30:** no secret appears in the repo, the ledger, or a plaintext `web` env var.

## Notes
- **Owned decisions → write ADRs:** the Redis-failure posture; the trusted client-IP channel; whether the web keeps a
  limiter. Together these refine ADR-009 in a new ADR.
- **Hypotheses to confirm before fixing:** the api's per-IP bucket is shared by all web-mediated signups, and
  `/api/auth/*` bypasses the `/login` throttle. Reproduce each with a failing test first, and record the prod-log
  evidence in the run ledger.
- **Live magic-link legs:** send only to JOURNEY.1's test mailbox, and create no account for a non-test email. The
  empty-email `/signup` leg is used precisely because it is write-free.
- **Deferrals:** the live consume-at-creation leg for a real invite needs a prod invite mint, which is a one-off prod
  data write paused for the operator. Anything else not verifiable at build time, or blocked on HUMAN-H7, also becomes a
  `D-SEC.2-<n>` row.
