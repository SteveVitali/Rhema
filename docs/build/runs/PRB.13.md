# PRB.13 — Open self-serve signup + the 0-credit purchase path

- **Spec:** `docs/tickets/28d_PRB.13__open-selfserve-signup.md` (REQ-BETA-19 **amended 2026-09-16**)
- **Base:** `stevevitali/prb-12-beta-analytics-and-dashboard` @ `70ef289`
- **Branch:** `stevevitali/prb-13-open-selfserve-signup`
- **Config:** implement-spec full preset (deterministic only — no live/prod execution; the on-prod
  exercise is `28g_PRB.16` per the ticket)
- **ADR:** ADR-009 (admission boundary, sign-in-link verification, per-instance throttle)

## Deferrals read

`docs/tickets/DEFERRALS.md` read at start. Findings:

- **No `OPEN` row is closed by this ticket** — the plan note (2026-09-16) routes D-PRB.01-1/-3's live
  legs to PRB.16 explicitly; PRB.13 lands the deterministic machinery those legs will exercise.
- New rows appended this run: **D-PRB.13-1** (shared/multi-instance throttle store — the beta ships
  the in-memory per-instance limiter the ticket asks for; Redis/DB-backed counting is a prod
  bring-up binding) and **D-PRB.13-2** (the live self-serve legs: the on-prod exercise, the Better
  Auth `user.create` admission binding for the OAuth path, and the sign-in-link `email_verified`
  flip — all need the mounted auth deploy, D-P0.01-3).

## Requirements

1. `signup.mode = invite | open`, consumed by the web `/login` pre-gate AND the api's
   account-creation path; invite machinery (`invites`/`invite_redemptions`, `createInviteGate`
   check/consume) retained — the flag changes whether a code is *required*, never removes it.
2. 0-credit onboarding: a fresh self-serve account reads `spendableCredits: 0`, the run sheet
   surfaces the PRB.08 exhaustion panel + Payment Link, and `credits.exhausted_prompt` /
   `wtp.recorded` emit exactly as instrumented.
3. Abuse control: account creation + magic-link requests throttled per IP and per email (429 past
   the limit); a verified email required before a self-serve account can `POST /runs` — server-side.
4. Copy discipline: every new string passes `lintCopy`; no §16.4 efficacy/superiority language; no
   marketing/pricing page.

## Acceptance criteria → evidence map

- **AC1 (mode drives both gates):** `apps/api/src/signup.test.ts` — invite mode: no code ⇒ 403
  `invite_required` + zero rows; invalid code ⇒ 403 with the invite reason; valid code ⇒ 201,
  `used_count` incremented + `invite_redemptions` row (consume AT creation); re-post idempotent
  `created:false` (no second consume, no second event); a returning account isn't locked out by its
  own exhausted code. Open mode: no code ⇒ 201 + provisioned user/workspace/billing/membership at 0
  credits; a supplied code still validates + consumes; an invalid supplied code still refuses.
  `apps/web/src/server.test.ts` — invite mode keeps the PRB.01 gate verbatim (no code ⇒ no auth
  request); open mode: no code admits through `POST /signup`, supplied bad code refuses, Google
  no-code skips `checkInvite` (admission binds post-OAuth live — D-PRB.13-2).
- **AC2 (0-credit purchase path):** `signup.test.ts` "the 0-credit purchase path" — fresh open-mode
  account reads `{spendableCredits: 0, paymentLinkUrl}` on `/billing/balance`; the exhausted-prompt
  POST records `credits.exhausted_prompt`; the signed Stripe `checkout.session.completed` webhook →
  `processStripeEvent` ⇒ `topup_granted`; the event stream reads
  `[signup.completed, credits.exhausted_prompt, topup.purchased, wtp.recorded{source:"purchase"}]`
  in order and the balance reads the purchased 5000.
- **AC3 (abuse control):** contracts `signup.test.ts` — per-IP/per-email windows, reset-on-schedule,
  case-normalized email keys, `retryAfterSec`. api `signup.test.ts` — `POST /signup` 429s past the
  IP limit (different IP unaffected, window resets) and past the email limit across IPs; web
  `server.test.ts` — the magic-link send 429s per IP and per email, and an api-side `rate_limited`
  refusal propagates as 429. Run gate: `run-routes.test.ts` + `signup.test.ts` — bound lookup +
  `email_verified=false` ⇒ 403 `email_unverified` and **no run row**; `true` ⇒ 201; unbound ⇒ inert
  (fixture compat). The web run-POST maps the 403 code to the verification notice, not the
  suspension one.
- **AC4 (copy):** `copy.test.ts` — `lintCopy` green over the whole table incl. the eight new
  open-mode/abuse strings; a banned-claims assertion (`writes like you — unlimited, better than
  Pro`) fails as designed. No `/pricing`, `/signup`, or marketing route added — `routes.tsx`'s
  manifest still has none (AC5 of PRB.01's suite still asserts it).
- **Universal AC:** verification green (below); every new behavior has a failing-if-removed test;
  REQ ids stamped in the PR body; deferrals appended; ADR-009 written; BUILD_INDEX + LEDGER
  advanced.

## Test matrix (as built)

- `packages/contracts/src/signup.test.ts` (5) — `parseSignupMode` fails closed on everything but
  the literal `"open"`; the `IpEmailThrottle` fixed-window semantics (per-IP, per-email, reset,
  normalization, retryAfter).
- `apps/api/src/signup.test.ts` (11) — both modes, consume-at-creation, idempotent re-login,
  0-credit provisioning, IP + email throttles, the `email_unverified` run gate, the full purchase
  chain (`signup.completed` → exhaustion → Payment-Link topup → `wtp.recorded`).
- `apps/api/src/run-routes.test.ts` (+1) — the gate's three states (unbound inert / false 403 /
  true 201).
- `apps/api/src/env.test.ts` (+1) — `SIGNUP_MODE` env parsing fails closed.
- `packages/api-client/src/index.test.ts` (+3) — `signup` POSTs `/signup` and returns `created`;
  expected refusals arrive as `{ok:false,error}` data; `ApiError.code` carries the api's `{error}`.
- `apps/web/src/server.test.ts` (+10) — open-mode GET copy, no-code admit, supplied-bad-code
  refusal, self-serve email-required, Google no-check path, open-mode landing copy, per-IP and
  per-email link-send 429s, api-429 propagation, `email_unverified` sheet notice.
- `apps/web/src/copy.test.ts` (+1) — the new keys exist; the banned-claims tripwire still fires.
- `infra/config/stages.test.ts` (+1) — every stage ships `signupMode:"invite"` until PRB.15 flips
  prod.

## Status

**Done — all 4 ACs + the universal AC green deterministically.** Verification this run:

- `pnpm turbo build lint typecheck` — **111/111** tasks
- `pnpm test` — **1953 pass / 2 skip / 267 files**
- `pnpm check:licenses` — OK (502 pkgs, zero new deps)
- `pnpm check:protocol-markers` — OK (39 files scanned)
- `node scripts/check-upstream-diff.mjs` — OK (16 ported files reconcile)
- `bash ~/agent-skills/skills/build-memory/scripts/check-build-memory.sh .` — 0 violations

**No live/prod execution** — the on-prod self-serve exercise is `28g_PRB.16` (D-PRB.13-2); the
shared throttle store is `D-PRB.13-1` (PRB.15/16). Every stage ships `invite` — prod flips `open`
at `28f_PRB.15` by design.
