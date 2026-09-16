# PRB.13 — Open self-serve signup + the 0-credit purchase path (REQ-BETA-19 amended)

- **Sequence:** inserted — runs **after `28b_GATE-G3` (deferred) / `28c_HUMAN-H6`, before
  `28e_PRB.14`**. Sorts as `28d` (prod-launch round; § Plan extensions, **ADR-008**).
- **Phase:** LV — prod launch (the live round; feeds no gate — G3 stays parked pending real-world
  data, H3 partner program deferred).
- **base_branch:** current checkout (stacked PR chain)
- **Depends on:** PRB.01 (the invite gate + shell this ticket flips open), PRB.03 (the run sheet —
  the only paywall), PRB.08 (Payment Links + the exhaustion surface), PRB.12 (the analytics events
  the new surface emits); HUMAN-H6 supplies the live prerequisites (surface, never fabricate).
- **Run:** `implement-spec spec=docs/tickets/28d_PRB.13__open-selfserve-signup.md`
- **Gate status:** REQ-BETA-19 amendment recorded (spec §17 + Appendix A.13, 2026-09-16); G2/H2 stay
  deferred — **no §16.4 efficacy/marketing claims ship in this ticket, ever**
- **Live stage:** offline + cited live legs (the on-prod exercise belongs to `28g_PRB.16`)

## Goal
Open the beta to **self-serve signup**: REQ-BETA-19 ("private and capped") is amended 2026-09-16 to
permit a public self-serve signup + self-serve credit purchase ahead of the full-IDE launch, while
the standing bars keep holding — **no marketing/PR launch, no public pricing page beyond what the
purchase flow needs, and zero §16.4 efficacy/superiority claims** until G2's LIFT criterion is met.
Since H3's house-credit grants are deferred, a self-serve user starts at **0 credits** — so this
ticket also lands the onboarding path that surfaces the PRB.08 purchase surface + Payment Link at
signup/first-run, and basic signup abuse control. The invite machinery is **retained** (config, not
deletion) — partner cohorts under the deferred H3 program still onboard by invite.

## Load
- Spec §17 beta row **as amended 2026-09-16** + Appendix A.13 REQ-BETA-19 (amended) — open the
  amendment note; REQ-BETA-14/15 (billing core; Payment Links the one money channel), REQ-BETA-12
  (`wtp.recorded` / `credits.exhausted_prompt`), REQ-PROD-15 (opt-out honored), REQ-POS-4/5/13
  (copy rules bind every user-facing string — **no efficacy claims**), §16.4 marketing block.
- `apps/api/src/invite.ts` (`createInviteGate` check/consume) + the web `/login` pre-gate (PRB.01) —
  the machinery this ticket puts behind a mode flag.
- `apps/api/src/billing-routes.ts` + the web exhaustion panel (PRB.08: `exhausted-prompt`, the
  Payment-Link POST→telemetry→302) — the surface a 0-credit user must reach.
- `docs/tickets/DEFERRALS.md` D-PRB.01-1/-3 (the live legs this ticket's surfaces feed — they stay
  OPEN for `28g_PRB.16`'s on-prod exercise).

## In scope — deliverables
1. **Signup mode flag.** A stage-config/env switch (`signup.mode = invite | open`) read by both the
   web `/login` pre-gate and the api's account-creation path: `invite` = today's behavior
   (no valid code ⇒ no auth; `consume` at `user.create`); `open` = self-serve account creation with
   **no invite required**. The gate rows/`consume` path are untouched — a partner-cohort deploy can
   still run invite-gated. Default stays `invite` outside the prod stage profile (28f_PRB.15 sets
   `open` for prod); the flag itself is unit-tested both ways.
2. **The 0-credit onboarding path.** With no house credits, a new self-serve account must be told,
   at the honest moment, that runs cost credits: the post-signup/first-run surface renders the
   PRB.08 exhaustion/purchase panel (balance chip reads 0; the Payment-Link offer + the §14.6
   wording apply unchanged) so the first run-sheet visit lands on a working purchase path.
   `wtp.recorded`/`credits.exhausted_prompt` emit exactly as instrumented in PRB.08/PRB.12.
3. **Signup abuse control (minimal, beta-grade).** Rate-limit account creation + magic-link/OTP
   requests per IP (and per email), require a **verified email** before a self-serve account can
   create a run, and keep the run sheet the only run creator/paywall (REQ-CHAT-25). No captcha
   vendor, no risk scoring — a beta-grade throttle + verification gate.
4. **Copy discipline.** Every new string passes `lintCopy` (Appendix D.2 vocabulary) and adds **no**
   §16.4/§1.4/§15.1 efficacy or superiority language, no public pricing/marketing page — the signup
   + purchase copy states facts only (what a run costs, what a credit buys).

## Out of scope
- The live on-prod exercise of signup/sign-in/purchase — `28g_PRB.16`/`28h_PRB.17` (D-P0.01-3,
  D-PRB.01-1/-3 live legs stay OPEN until then).
- Partner-cohort onboarding, house credits, the REQ-BETA-17 deal — deferred with H3 (ledger § GATE
  DECISIONS, 2026-09-16).
- The marketing site / pricing page / PR launch — still barred (the amendment keeps them barred);
  the full funnel is P1.17.
- Trial entitlement / plan ladder — P1.16 (self-serve here = pay-per-credit only).

## Acceptance criteria
- [ ] `signup.mode` drives both gates: with `invite` the existing PRB.01 ACs still pass (no valid
      code ⇒ no auth request; `consume` at creation); with `open` a no-code signup creates the
      account. *(deterministic — PGlite + route tests, both modes)*
- [ ] A fresh `open`-mode account has 0 spendable credits and reaches the purchase surface: the
      balance chip / run-sheet / exhausted-prompt render the Payment-Link offer, and
      `credits.exhausted_prompt`/`wtp.recorded` events emit on the exercise. *(deterministic)*
- [ ] Abuse control: account-creation + magic-link requests throttle per IP/email (429 past the
      limit); an unverified-email self-serve account cannot `POST /runs`. *(deterministic)*
- [ ] Copy lint: no §16.4 efficacy/superiority claim and no marketing/pricing page in any new or
      touched string; Appendix D.2 vocabulary clean. *(deterministic — `lintCopy` + a banned-claims
      assertion)*
- [ ] verification green; every new behaviour has a test that fails if it is removed; requirement
      ids stamped in the PR; anything not automatically verifiable is a `DEFERRALS.md` row with its
      compensating control; ADRs written for every deviation and owned decision; `BUILD_INDEX.md`
      row and `LEDGER.md` advanced. *(agentic — the universal phase-gate AC)*

## Requirement IDs to satisfy and stamp in the PR
REQ-BETA-19 (**as amended 2026-09-16** — this ticket owns the open-signup surface; PRB.01 keeps the
invite machinery), REQ-BETA-14 (signup form), REQ-BETA-15 (self-serve Payment-Link purchase at
exhaustion — the one money channel), REQ-BETA-12 (the WTP/exhaustion events fire here),
REQ-PROD-15 (opt-out honored on any new emission), REQ-CHAT-25 (run sheet stays the only paywall),
REQ-POS-4/5/13 (copy).

## Cross-cutting invariants — re-check before opening the PR
- No superiority/efficacy claim on any surface (manifest invariant 9; REQ-EVAL-19 + §16.4 hold
  until G2's LIFT reads). The open signup is **not** a launch — no PR, no marketing site.
- The run sheet is the only run creator and the only paywall (REQ-CHAT-25; REQ-GROWTH-13).
- Money: never silent billing; the Payment-Link purchase is the user's own act (REQ-SPEC-1/24).
- See 00_MANIFEST.md § Cross-cutting invariants.

## Notes
The mode flag exists so the deferred H3 partner cohorts can still run invite-gated later — do not
delete `invite.ts` or its redemption rows. The sample-dossier content sign-off (D-PRB.01-2) remains
operator-owed and does not gate this ticket. If live verification reveals the need for a separate
"verify your email" email send, reuse the PRB.09 Resend `MailSender` port — do not add a second
email path.
