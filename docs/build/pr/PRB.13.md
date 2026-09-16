# PRB.13 — Open self-serve signup + the 0-credit purchase path

**Spec:** `docs/tickets/28d_PRB.13__open-selfserve-signup.md` · **REQ-BETA-19 (amended 2026-09-16)**,
REQ-BETA-14, REQ-BETA-15, REQ-BETA-12, REQ-PROD-15, REQ-CHAT-25, REQ-POS-4/5/13 · **Base:**
`stevevitali/prb-12-beta-analytics-and-dashboard` · **Stacked PR — do not merge
(mergePolicy=OPERATOR).**

## Summary

The beta can now open to self-serve users: `signup.mode = invite | open` gates account creation —
`invite` is the PRB.01 private beta verbatim (no valid code ⇒ no auth request, `consume` at
creation); `open` admits a no-code signup while still validating + consuming a supplied code
(partner cohorts keep working — the invite tables/gate are **retained**, not deleted).

**The api owns admission** (ADR-009): `POST /signup` → `admitSignup` is the single account-creation
gate — throttled per source IP + per email (429), then idempotent provisioning of
`user` + personal `workspace` + `billing_account` + `workspace_members` at **0 credits** (no house
grants — H3 deferred). A returning email resolves `created:false` — re-login is never locked out by
its own exhausted code. `signup.completed{method}` emits server-side, opt-out honored.

**The sign-in link IS the email verification** — one email path, no second send. Run creation
enforces `user.email_verified` server-side: `POST /projects/:id/runs` ⇒ 403 `email_unverified` (the
web maps it to a notice on the run sheet — the only run creator/paywall, REQ-CHAT-25).

**The 0-credit path is the PRB.08 surface unchanged:** a fresh account reads
`{spendableCredits: 0, paymentLinkUrl}`; the exhaustion panel + Payment Link remain the only
purchase path; `credits.exhausted_prompt` / `topup.purchased` / `wtp.recorded` emit exactly as
instrumented.

**The flag fails closed:** `parseSignupMode` maps anything but `"open"` to `invite`; every stage in
`infra/config/stages.ts` ships `invite` (asserted) until `28f_PRB.15` deliberately flips prod; both
consumers read the same `SIGNUP_MODE` env the Pulumi program sets.

## What changed

- **`@rhema/contracts`** — `signup.ts` (`SignupMode`, `SIGNUP_MODES`, `parseSignupMode` — fail
  closed) + `rate-limit.ts` (`IpEmailThrottle` — fixed-window per-IP + per-email, injected clock).
- **`apps/api`** — `signup.ts` NEW: `admitSignup` (mode gate → invite check → idempotent user row →
  `consume` at creation → workspace/billing/membership provisioning) + `POST /signup` (throttle
  first — the invite oracle is part of what it protects; `signup.completed` on creation only).
  `run-routes.ts`: the `userEmailVerified` gate (bound by `createApp` whenever `deps.db` exists;
  inert where no user lookup is bound). `env.ts`: `SIGNUP_MODE`. `index.ts`/`server.ts` wiring.
- **`@rhema/api-client`** — `SignupRequestDto`/`SignupResultDto`, `client.signup`, and
  `ApiError.code` carrying the api's stable `{error}` (lets the web tell `email_unverified` from
  `account_suspended` on a 403).
- **`apps/web`** — `POST /login` is mode-aware: invite keeps the pre-gate verbatim; open admits
  no-code and still validates a supplied one. The magic-link path calls the api's `POST /signup`
  (admission happens there); the magic-link **send** throttles per IP + email here. Google keeps the
  code-only pre-check (required in invite mode, optional-but-validated in open — admission binds at
  `user.create` live). Login/landing copy is mode-aware; the run-sheet POST renders the
  `email_unverified` notice distinctly from the suspension one.
- **`@rhema/orchestrator` testing** — `seedProject` gains `emailVerified` (defaults `true`: a
  signed-in fixture account already verified via its link).
- **`@rhema/ledger`** — emission audit: `signup.completed` `beta_absent` → `emitted`
  (`apps/api/src/signup.ts`).
- **`infra`** — `StageConfig.signupMode` (all stages `invite` — asserted); Pulumi sets `SIGNUP_MODE`
  on the `api` + `web` Cloud Run services from the one stage fact.

## Out of scope (as specced)

The live on-prod exercise (PRB.16); partner cohorts/house credits/the REQ-BETA-17 deal (H3);
marketing site / pricing page / PR launch (still barred); trial entitlements / plan ladder (P1.16).
No new money channel — Stripe Payment Links only.

## Test plan

- **AC1** `apps/api/src/signup.test.ts` — invite: no-code 403 `invite_required` + zero rows; bad
  code 403; valid code ⇒ 201 + consume-at-creation + redemption row; idempotent re-post
  `created:false`; returning-account re-login bypass. open: no-code 201 + 0-credit provisioning;
  supplied code validated+consumed; bad code still refuses. `apps/web` — both modes' gates.
- **AC2** the 0-credit chain on PGlite: balance 0 + Payment Link → `credits.exhausted_prompt` →
  signed webhook → `topup_granted` → `[signup.completed, credits.exhausted_prompt, topup.purchased,
  wtp.recorded]` in the stream.
- **AC3** per-IP + per-email 429s (api signup + web link-send, window reset proven); unverified ⇒
  403 `email_unverified` + no run row; verified ⇒ 201; unbound ⇒ inert.
- **AC4** `lintCopy` green incl. the eight new strings; the banned-claims tripwire fires.
- Gates: `turbo build lint typecheck` **111/111**; `pnpm test` **1953 pass / 2 skip / 267 files**;
  `check:protocol-markers` OK; `check:licenses` OK (502 pkgs, zero new deps); `check-upstream-diff`
  OK; `check-build-memory.sh` 0 violations.

## Deferrals

**Opened:** D-PRB.13-1 (shared/multi-instance throttle store — beta ships the in-memory limiter;
the verified-email run gate is the compensating control) · D-PRB.13-2 (the live self-serve legs:
on-prod exercise, the Better Auth `user.create` admission binding for OAuth, the link-click
`email_verified` flip — PRB.16). **Closed:** none — the plan note routes D-PRB.01-1/-3's live legs
to PRB.16.
